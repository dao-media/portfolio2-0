import * as THREE from "three";
import { CHUNK_TEXTURE_EDGE, CHUNK_TEXTURE_ROWS } from "./constants.js";

/**
 * Large maps must not texImage2D a full mip-0 in one frame.
 * Claim swaps in a 1×1 so three's uploader stays cheap, then this queue
 * fills the real GPU texture: a coarse mip first, then mip-0 in row strips.
 */

function placeholderCanvas() {
  if (placeholderCanvas._canvas) return placeholderCanvas._canvas;
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(1, 1)
      : document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, 1, 1);
  }
  placeholderCanvas._canvas = canvas;
  return canvas;
}

function mipSize(width, height, target) {
  let level = 0;
  let w = width;
  let h = height;
  while ((w > target || h > target) && w > 1 && h > 1) {
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
    level += 1;
  }
  return { level, w, h };
}

function imageSize(image) {
  const w = image?.width || image?.videoWidth || 0;
  const h = image?.height || image?.videoHeight || 0;
  return { w, h };
}

export function isChunkCandidate(texture) {
  if (!texture?.isTexture || texture.isDataTexture || texture.isRenderTargetTexture) return false;
  if (texture.userData.__chunkClaimed || texture.userData.__chunkDone) return false;
  const { w, h } = imageSize(texture.image);
  return w >= CHUNK_TEXTURE_EDGE || h >= CHUNK_TEXTURE_EDGE;
}

export class ChunkedTextureQueue {
  constructor() {
    /** @type {object[]} */
    this.jobs = [];
    this._tile =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(128, 4)
        : document.createElement("canvas");
  }

  /**
   * @param {THREE.Texture} texture
   * @param {THREE.WebGLRenderer} renderer
   * @param {(texture: THREE.Texture) => void} initTexture
   * @returns {boolean} true when this queue owns the upload
   */
  claim(texture, renderer, initTexture) {
    if (!isChunkCandidate(texture)) return false;
    const source = texture.image;
    const { w, h } = imageSize(source);
    texture.userData.__chunkClaimed = true;
    texture.userData.__chunkSource = source;
    texture.image = placeholderCanvas();
    texture.generateMipmaps = false;
    // Do NOT route the placeholder through three's normal initTexture(): in
    // WebGL2 that allocates via texStorage2D (immutable storage), and step()'s
    // own "alloc" phase below can never resize an immutable texture to the
    // real w×h — every gl.texImage2D there fails outright with
    // "GL_INVALID_OPERATION: Texture is immutable", the strips that follow
    // then fail too ("offset overflows"), and the job still marks itself
    // __chunkDone while the GPU texture is still the 1×1 placeholder fill.
    // Create the GL object ourselves with a legacy mutable texImage2D call so
    // it stays resizable for every step() that follows.
    const gl = renderer.getContext();
    const glTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([26, 26, 26, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const props = renderer.properties.get(texture);
    props.__webglTexture = glTex;
    props.__version = texture.version;
    this.jobs.push({
      texture,
      source,
      w,
      h,
      y: 0,
      allocated: false,
      coarse: false,
      pending: null,
      ready: null,
      readyH: 0,
      readyY: 0
    });
    return true;
  }

  get pending() {
    return this.jobs.length;
  }

  /**
   * One GPU step. Call only when the frame can afford it.
   * @param {THREE.WebGLRenderer} renderer
   * @returns {boolean} true if this frame uploaded something
   */
  step(renderer) {
    const job = this.jobs[0];
    if (!job || !renderer) return false;
    const gl = renderer.getContext();
    const props = renderer.properties.get(job.texture);
    const glTex = props?.__webglTexture;
    if (!glTex) return false;

    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    // Three's own upload path always sets this per-texture; pixelStorei is
    // context-global, so without resetting it here this chunk's raw
    // texImage2D/texSubImage2D calls inherit whatever the PREVIOUS upload
    // (chunked or not) left behind — silently reinterpreting raw ORM/normal
    // bytes as a browser-default color-managed source.
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    if (!job.allocated) {
      const internal = this._internalFormat(gl, job.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, job.w, job.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      job.allocated = true;
      job.glTex = glTex;
      job.internal = internal;
      return "alloc";
    }

    if (!job.coarse) {
      const mip = mipSize(job.w, job.h, 32);
      const crop = Math.min(32, job.w, job.h);
      const tile = this._blit(job, 0, 0, crop, crop);
      gl.texImage2D(gl.TEXTURE_2D, mip.level, job.internal, gl.RGBA, gl.UNSIGNED_BYTE, tile);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, mip.level);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, mip.level);
      job.coarse = true;
      job.x = 0;
      return "coarse";
    }

    if (job.y >= job.h) {
      this._finish(renderer, job);
      return "strip";
    }

    const tileW = job.w;
    const tileH = CHUNK_TEXTURE_ROWS;
    const w = Math.min(tileW, job.w - job.x);
    const h = Math.min(tileH, job.h - job.y);
    const tile = this._blit(job, job.x, job.y, w, h);
    const flip = job.texture.flipY !== false;
    const destY = flip ? job.h - (job.y + h) : job.y;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, job.x, destY, gl.RGBA, gl.UNSIGNED_BYTE, tile);
    job.x += w;
    if (job.x >= job.w) {
      job.x = 0;
      job.y += h;
    }
    if (job.y >= job.h) this._finish(renderer, job);
    return "strip";
  }

  /**
   * @param {WebGLRenderingContext} gl
   * @param {THREE.Texture} texture
   */
  _internalFormat(gl, texture) {
    if (texture.colorSpace === THREE.SRGBColorSpace && gl.SRGB8_ALPHA8) return gl.SRGB8_ALPHA8;
    return gl.RGBA;
  }

  /**
   * @param {object} job
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} rw
   * @param {number} rh
   */
  _blit(job, x, y, w, h) {
    const tile = this._tile;
    if (tile.width !== w) tile.width = w;
    if (tile.height !== h) tile.height = h;
    const ctx = tile.getContext("2d");
    const flip = job.texture.flipY !== false;
    ctx.setTransform(1, 0, 0, flip ? -1 : 1, 0, flip ? h : 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(job.source, x, y, w, h, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return tile;
  }

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} job
   */
  _finish(renderer, job) {
    const gl = renderer.getContext();
    const props = renderer.properties.get(job.texture);
    if (props?.__webglTexture) {
      gl.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      props.__version = job.texture.version;
    }
    job.texture.userData.__chunkDone = true;
    job.texture.userData.__chunkSource = null;
    this.jobs.shift();
  }
}
