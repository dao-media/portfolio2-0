import * as THREE from "three";
import { noteFlight } from "./flightRecorder.js";
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

function glWrap(gl, mode) {
  if (mode === THREE.ClampToEdgeWrapping) return gl.CLAMP_TO_EDGE;
  if (mode === THREE.MirroredRepeatWrapping) return gl.MIRRORED_REPEAT;
  return gl.REPEAT;
}

function glFilter(gl, mode) {
  switch (mode) {
    case THREE.NearestFilter:
      return gl.NEAREST;
    case THREE.NearestMipmapNearestFilter:
      return gl.NEAREST_MIPMAP_NEAREST;
    case THREE.NearestMipmapLinearFilter:
      return gl.NEAREST_MIPMAP_LINEAR;
    case THREE.LinearMipmapNearestFilter:
      return gl.LINEAR_MIPMAP_NEAREST;
    case THREE.LinearMipmapLinearFilter:
      return gl.LINEAR_MIPMAP_LINEAR;
    default:
      return gl.LINEAR;
  }
}

function isMipmapFilter(mode) {
  return (
    mode === THREE.NearestMipmapNearestFilter ||
    mode === THREE.NearestMipmapLinearFilter ||
    mode === THREE.LinearMipmapNearestFilter ||
    mode === THREE.LinearMipmapLinearFilter
  );
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
    // Recorded so syncParams can detect a colorSpace change after the fact
    // (should not happen for anything that sets colorSpace before its first
    // claim, per pcProductionMaterials.js's fix — this is the safety net for
    // whatever doesn't).
    texture.userData.__chunkColorSpace = texture.colorSpace;
    // __chunkSource is cleared in _finish(); keep the real dimensions around
    // under a name debug tooling can still read after the job completes.
    texture.userData.__chunkW = w;
    texture.userData.__chunkH = h;
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
    texture.userData.__chunkGlTex = glTex;
    // Pass J item 3 — the renderer.initTexture override only guards the
    // explicit initTexture() path. A plain `texture.needsUpdate = true` after
    // this claim (pcProductionMaterials' configurePcTexture does exactly that
    // when it runs after the claim — order is timing-dependent) bumps
    // texture/source version, and the next draw's setTexture2D ->
    // uploadTexture creates three's OWN new GL texture for the 1×1
    // placeholder and overwrites __webglTexture: the finished 4096² upload
    // is abandoned and the PC samples black (measured: pc_1/pc_2 map,
    // normal, roughness, emissive all read back 0,0,0 while "done").
    // Route needsUpdate to syncParams instead: sampler state is re-applied
    // to OUR GL object and the version never moves.
    Object.defineProperty(texture, "needsUpdate", {
      configurable: true,
      enumerable: false,
      get() {
        return false;
      },
      set: (value) => {
        if (value === true) this.syncParams(texture, renderer);
      }
    });
    // Three only attaches its own 'dispose' listener (the one that frees the
    // GL object) inside its own initTexture/uploadTexture path — which this
    // texture never goes through. Without our own listener, texture.dispose()
    // is a silent no-op for every chunk-claimed texture: gl.deleteTexture is
    // never called and the GL object leaks for the runtime's whole session.
    const onDispose = () => {
      texture.removeEventListener("dispose", onDispose);
      delete texture.needsUpdate;
      const p = renderer.properties.get(texture);
      if (p?.__webglTexture) gl.deleteTexture(p.__webglTexture);
      renderer.properties.remove(texture);
      const idx = this.jobs.findIndex((job) => job.texture === texture);
      if (idx >= 0) this.jobs.splice(idx, 1);
    };
    texture.addEventListener("dispose", onDispose);
    // restartForColorSpace needs to remove this exact listener before
    // re-claiming, or the stale closure deletes the NEW texture on a later
    // real dispose.
    texture.userData.__chunkDisposeHandler = onDispose;
    // Callers like warmMeshesChunked treat a texture as GPU-resident once
    // `renderer.properties.get(tex.source).__version === tex.source.version`
    // — a check three's own upload path satisfies itself. We bypass that
    // path, so without setting it here every such check reads as "not
    // resident" for a texture we already claimed (pending OR finished),
    // and would call the renderer's real initTexture() on it again — which,
    // since texture.image is still the 1×1 placeholder, lets three silently
    // allocate its OWN new WebGLTexture and overwrite __webglTexture here,
    // abandoning ours mid-stream (or reverting a finished upload to 1×1).
    const srcProps = renderer.properties.get(texture.source);
    srcProps.__version = texture.source.version;
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
   * Move any pending job whose texture is in `textures` to the front of the
   * queue, in place, preserving relative order within each group. Called on
   * hop so the destination vignette's own textures — possibly claimed only
   * moments ago by its own post-intro integration — drain first instead of
   * waiting behind whatever else was already queued.
   * @param {Set<THREE.Texture>} textures
   */
  prioritize(textures) {
    if (!textures?.size || this.jobs.length < 2) return;
    const front = [];
    const rest = [];
    for (const job of this.jobs) {
      (textures.has(job.texture) ? front : rest).push(job);
    }
    if (front.length) this.jobs = front.concat(rest);
  }

  /**
   * Re-apply only the GL sampler wrap mode for a texture this queue already
   * owns. Called instead of letting three's real initTexture touch it again
   * (see the caller in StageExperience's renderer.initTexture override):
   * texture.image is still the 1×1 placeholder forever, so three's own path
   * would treat any later touch (typically a `needsUpdate = true` from
   * unrelated material-setup code, e.g. pcProductionMaterials.js configuring
   * wrap/colorSpace/filters after this queue already finished the upload) as
   * "re-upload a real 1×1 image" — reallocating the GL object via
   * texStorage2D immutable storage and reverting a finished texture back to
   * a flat placeholder (or hitting "Texture is immutable" if a later step()
   * strip still expected the old, resizable object). Wrap mode is the only
   * sampler state a caller plausibly still needs to change post-hoc; it
   * needs no re-upload, so apply it directly instead of dropping it.
   * @param {THREE.Texture} texture
   * @param {THREE.WebGLRenderer} renderer
   */
  syncParams(texture, renderer) {
    // A colorSpace change can't be applied to an already-allocated GL
    // texture — the internal format (SRGB8_ALPHA8 vs RGBA8) is fixed at
    // allocation. Restart the whole job rather than silently keep sampling
    // through the wrong format.
    if (texture.userData.__chunkColorSpace !== undefined && texture.userData.__chunkColorSpace !== texture.colorSpace) {
      this.restartForColorSpace(texture, renderer);
      return;
    }
    const gl = renderer.getContext();
    const props = renderer.properties.get(texture);
    const glTex = props?.__webglTexture;
    if (!glTex) return;
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, glWrap(gl, texture.wrapS));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, glWrap(gl, texture.wrapT));
    // Filters: safe to apply a mipmap-mode MIN filter only once mips actually
    // exist (__chunkDone through _finalizeMipmap) — before that the texture
    // is mipmap-incomplete and would sample undefined. If mips aren't ready
    // yet, _runGenerateMipmap reads texture.minFilter itself when it finally
    // runs, so the caller's request still lands, just later.
    const canUseMipFilter = Boolean(texture.userData.__chunkDone) && !this._mipmapQueue?.some((j) => j.texture === texture);
    const minMode = isMipmapFilter(texture.minFilter) && !canUseMipFilter ? THREE.LinearFilter : texture.minFilter;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glFilter(gl, minMode));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter(gl, texture.magFilter));
    const anisoExt = renderer.extensions?.get?.("EXT_texture_filter_anisotropic");
    if (anisoExt) {
      const maxAniso = renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
      const aniso = Math.min(texture.anisotropy || 1, maxAniso);
      gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, aniso);
    }
  }

  /**
   * A texture already claimed by this queue had its colorSpace changed after
   * the fact — the GL internal format allocated at claim time no longer
   * matches. If the job is still pending, its original source bitmap is
   * still known: delete the stale GL object, drop the job, and re-claim from
   * scratch with the corrected colorSpace. If the job already finished,
   * `_finish()` already dropped the only reference to the decoded source
   * bitmap — there is nothing left to re-chunk from, so this only warns.
   * pcProductionMaterials.js settles colorSpace before the first claim
   * specifically so this path is never exercised in practice; it exists as a
   * safety net, not the primary fix.
   * @param {THREE.Texture} texture
   * @param {THREE.WebGLRenderer} renderer
   */
  restartForColorSpace(texture, renderer) {
    const gl = renderer.getContext();
    const job = this.jobs.find((j) => j.texture === texture);
    const oldDispose = texture.userData.__chunkDisposeHandler;
    if (oldDispose) {
      texture.removeEventListener("dispose", oldDispose);
      texture.userData.__chunkDisposeHandler = null;
    }
    const props = renderer.properties.get(texture);
    if (props?.__webglTexture) gl.deleteTexture(props.__webglTexture);
    renderer.properties.remove(texture);
    // Back to the prototype setter; claim() re-installs the guard.
    delete texture.needsUpdate;
    if (!job) {
      console.warn(
        "[chunkedTextureUpload] colorSpace changed on an already-finished chunked texture " +
          `(${texture.uuid}); its source bitmap is gone, so it can't be re-chunked. ` +
          "It will keep sampling through the wrong internal format until reloaded."
      );
      texture.userData.__chunkClaimed = false;
      texture.userData.__chunkDone = false;
      return;
    }
    const idx = this.jobs.indexOf(job);
    if (idx >= 0) this.jobs.splice(idx, 1);
    texture.userData.__chunkClaimed = false;
    texture.userData.__chunkDone = false;
    // claim() reads texture.image as the source to chunk from; restore the
    // real bitmap this job already had before re-claiming.
    texture.image = job.source;
    this.claim(texture, renderer);
  }

  /** Textures whose mip chain generation was deferred to a settled frame. */
  get mipmapPending() {
    return this._mipmapQueue?.length ?? 0;
  }

  /**
   * Drain one deferred mipmap job. Call only on an already-settled frame —
   * generateMipmap on a 4096² texture can itself cost several ms (see the
   * calibration in {@link _finalizeMipmap}).
   * @param {THREE.WebGLRenderer} renderer
   * @returns {boolean} true if a job was drained this call
   */
  stepMipmap(renderer) {
    const entry = this._mipmapQueue?.shift();
    if (!entry) return false;
    this._runGenerateMipmap(renderer, entry.texture, entry.maxLevel);
    return true;
  }

  /**
   * One GPU step. Call only when the frame can afford it.
   * @param {THREE.WebGLRenderer} renderer
   * @returns {boolean} true if this frame uploaded something
   */
  step(renderer) {
    const t0 = performance.now();
    const job = this.jobs[0];
    const result = this._step(renderer);
    // Pass K — per-step cost by kind and texture size (a single step was
    // measured at 238 ms on Dane's machine; the frame budget only checks
    // between steps, so one step must itself stay cheap).
    const ms = performance.now() - t0;
    if (result && job) {
      if (!this.stepCost) this.stepCost = {};
      const key = `${result}:${job.w}`;
      const row = this.stepCost[key] || (this.stepCost[key] = { n: 0, maxMs: 0, totalMs: 0 });
      row.n += 1;
      row.totalMs += ms;
      if (ms > row.maxMs) row.maxMs = Math.round(ms * 10) / 10;
      if (ms >= 8) noteFlight("chunk-step", { kind: result, w: job.w, h: job.h, ms: Math.round(ms) });
    }
    return result;
  }

  _step(renderer) {
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
      // Kept on the texture (not just the job, which is discarded at finish)
      // so debug tooling can report what format actually got allocated vs.
      // what texture.colorSpace asks for right now.
      job.texture.userData.__chunkInternalFormat = internal === gl.SRGB8_ALPHA8 ? "SRGB8_ALPHA8" : "RGBA8";
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
      // Mip generation + the MIN_FILTER switch happen in _finalizeMipmap,
      // inline or deferred — the texture is mipmap-incomplete (undefined
      // sampling under a mipmap filter) until generateMipmap actually runs,
      // so LINEAR is the correct filter to leave bound until then.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      props.__version = job.texture.version;
    }
    job.texture.userData.__chunkDone = true;
    job.texture.userData.__chunkSource = null;
    const maxLevel = Math.max(0, Math.floor(Math.log2(Math.max(job.w, job.h, 1))));
    this.jobs.shift();
    this._finalizeMipmap(renderer, job.texture, maxLevel);
  }

  /**
   * Route the finished texture's mip generation either inline (measuring the
   * cost) or, once that measured cost crosses the calibration threshold, to
   * the deferred queue so it runs on a settled frame instead.
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Texture} texture
   * @param {number} maxLevel
   */
  _finalizeMipmap(renderer, texture, maxLevel) {
    if (this._deferMipmaps) {
      (this._mipmapQueue || (this._mipmapQueue = [])).push({ texture, maxLevel });
      return;
    }
    // performance.now() around a bare gl.generateMipmap() only times how long
    // it took to *queue* the command — WebGL calls are asynchronous, so that
    // can read near-zero while the driver is still chewing on it. The
    // calibration run (and only that one — gl.finish() is a real pipeline
    // stall) brackets with gl.finish() so the measured number is actual GPU
    // completion time, not queue-submission time.
    const calibrating = this._mipmapCalibrationMs == null;
    const ms = this._runGenerateMipmap(renderer, texture, maxLevel, calibrating);
    if (calibrating) {
      this._mipmapCalibrationMs = ms;
      // 8ms budget — see debugMipmapCalibration(). Once one texture's
      // generateMipmap crosses it, every later one defers; a single frame
      // can afford one over-budget generateMipmap but not several.
      this._deferMipmaps = ms > 8;
    }
  }

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Texture} texture
   * @param {number} maxLevel
   * @param {boolean} [precise] bracket with gl.finish() for real GPU-completion
   *   time instead of queue-submission time. A genuine pipeline stall — only
   *   the one-time calibration run should ever pass true.
   * @returns {number} ms spent in gl.generateMipmap
   */
  _runGenerateMipmap(renderer, texture, maxLevel, precise = false) {
    const gl = renderer.getContext();
    const props = renderer.properties.get(texture);
    const glTex = props?.__webglTexture;
    if (!glTex) return 0;
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, maxLevel);
    if (precise) gl.finish();
    const t0 = performance.now();
    gl.generateMipmap(gl.TEXTURE_2D);
    if (precise) gl.finish();
    const ms = performance.now() - t0;
    // Honor whatever filter the texture asks for now (configurePcTexture-
    // style callers may have already run, or may still be pending — either
    // way this is the last GL-parameter write for this texture until
    // syncParams touches it again). Default to the mipmap-aware filter three
    // itself defaults new textures to, not a hardcoded guess.
    const minMode = texture.minFilter ?? THREE.LinearMipmapLinearFilter;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glFilter(gl, minMode));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter(gl, texture.magFilter ?? THREE.LinearFilter));
    const anisoExt = renderer.extensions?.get?.("EXT_texture_filter_anisotropic");
    if (anisoExt) {
      const maxAniso = renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
      const aniso = Math.min(texture.anisotropy || 1, maxAniso);
      gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, aniso);
    }
    if (!this._mipmapCostLog) this._mipmapCostLog = [];
    if (this._mipmapCostLog.length < 64) {
      this._mipmapCostLog.push({ uuid: texture.uuid, ms: Math.round(ms * 100) / 100 });
    }
    return ms;
  }
}
