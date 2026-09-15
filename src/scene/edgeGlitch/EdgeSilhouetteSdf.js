import * as THREE from "three";
import { EDGE_GLITCH_SDF_SIZE } from "./constants.js";

/** Isolated layer bit for silhouette mask captures (not fog / hold). */
export const EDGE_GLITCH_MASK_LAYER = 4;

const SEED_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tMask;
uniform vec2 uTexel;
varying vec2 vUv;

void main() {
  float m = texture2D(tMask, vUv).r;
  bool inside = m > 0.5;
  bool edge = false;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      if (x == 0 && y == 0) continue;
      float n = texture2D(tMask, vUv + vec2(float(x), float(y)) * uTexel).r;
      if ((n > 0.5) != inside) edge = true;
    }
  }
  if (edge) {
    gl_FragColor = vec4(vUv, inside ? 1.0 : 0.0, 1.0);
  } else {
    gl_FragColor = vec4(9.0, 9.0, inside ? 1.0 : 0.0, 0.0);
  }
}
`;

const JFA_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tSeed;
uniform vec2 uTexel;
uniform float uStep;
varying vec2 vUv;

void main() {
  vec4 best = vec4(9.0, 9.0, 0.0, 0.0);
  float bestD = 1e6;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 uv = vUv + vec2(float(x), float(y)) * uTexel * uStep;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
      vec4 s = texture2D(tSeed, uv);
      if (s.a < 0.5) continue;
      float d = distance(vUv, s.xy);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
  }
  gl_FragColor = best;
}
`;

const SDF_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tSeed;
uniform sampler2D tMask;
varying vec2 vUv;

void main() {
  float inside = texture2D(tMask, vUv).r > 0.5 ? 1.0 : 0.0;
  vec4 s = texture2D(tSeed, vUv);
  float d = (s.a > 0.5) ? distance(vUv, s.xy) : 1.0;
  float signedDist = inside > 0.5 ? -d : d;
  gl_FragColor = vec4(signedDist, inside, d, 1.0);
}
`;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Runtime screen-space signed distance field of a mesh set's silhouette.
 * Same WebGLRenderer — no second canvas / rAF. Call `update` from the stage tick.
 */
export class EdgeSilhouetteSdf {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{ size?: number }} [opts]
   */
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.size = opts.size ?? EDGE_GLITCH_SDF_SIZE;
    /** @type {THREE.Object3D[]} */
    this.roots = [];
    /** @type {THREE.Mesh[]} */
    this._meshes = [];

    const s = this.size;
    const floatRT = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false
    };
    this.maskRT = new THREE.WebGLRenderTarget(s, s, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false
    });
    /** Bust-only packed depth (BasicDepthPacking) — matches FogDepthCapture format. */
    this.depthRT = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false
    });
    this.depthRT.texture.name = "edge-glitch-bust-depth";
    this.depthRT.texture.colorSpace = THREE.NoColorSpace;
    this.depthRT.texture.flipY = false;
    this.depthMat = new THREE.MeshDepthMaterial({
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });
    this.depthMat.toneMapped = false;

    this.seedA = new THREE.WebGLRenderTarget(s, s, floatRT);
    this.seedB = new THREE.WebGLRenderTarget(s, s, floatRT);
    this.sdfRT = new THREE.WebGLRenderTarget(s, s, floatRT);

    this.maskMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true
    });

    this._fsScene = new THREE.Scene();
    this._fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
    this._fsScene.add(this._fsQuad);

    this.seedMat = new THREE.ShaderMaterial({
      uniforms: {
        tMask: { value: null },
        uTexel: { value: new THREE.Vector2(1 / s, 1 / s) }
      },
      vertexShader: QUAD_VERT,
      fragmentShader: SEED_FRAG,
      depthTest: false,
      depthWrite: false
    });
    this.jfaMat = new THREE.ShaderMaterial({
      uniforms: {
        tSeed: { value: null },
        uTexel: { value: new THREE.Vector2(1 / s, 1 / s) },
        uStep: { value: 1 }
      },
      vertexShader: QUAD_VERT,
      fragmentShader: JFA_FRAG,
      depthTest: false,
      depthWrite: false
    });
    this.sdfMat = new THREE.ShaderMaterial({
      uniforms: {
        tSeed: { value: null },
        tMask: { value: null }
      },
      vertexShader: QUAD_VERT,
      fragmentShader: SDF_FRAG,
      depthTest: false,
      depthWrite: false
    });
  }

  /**
   * @param {THREE.Object3D[]} roots
   */
  setRoots(roots) {
    this.roots = Array.isArray(roots) ? roots.filter(Boolean) : [];
    this._meshes = [];
    for (const root of this.roots) {
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        const n = `${obj.name}`.toLowerCase();
        if (n.includes("grass") || n.includes("lawn") || n.includes("ground")) return;
        this._meshes.push(obj);
      });
    }
  }

  /** @returns {THREE.Texture} */
  getTexture() {
    return this.sdfRT.texture;
  }

  /** Bust-only packed depth (BasicDepthPacking .r). @returns {THREE.Texture} */
  getDepthTexture() {
    return this.depthRT.texture;
  }

  /**
   * Match drawing-buffer size so bust depth lines up with FogDepthCapture.
   * @param {number} w
   * @param {number} h
   */
  setDepthSize(w, h) {
    const ww = Math.max(1, Math.floor(w));
    const hh = Math.max(1, Math.floor(h));
    if (ww === this.depthRT.width && hh === this.depthRT.height) return;
    this.depthRT.setSize(ww, hh);
  }

  /**
   * CPU sample of signed distance at UV (0–1). Expensive — verify / debug only.
   * @param {number} u
   * @param {number} v
   * @returns {number}
   */
  sampleDistance(u, v) {
    const s = this.size;
    const x = Math.max(0, Math.min(s - 1, Math.floor(u * s)));
    const y = Math.max(0, Math.min(s - 1, Math.floor(v * s)));
    if (!this._readBuf) this._readBuf = new Float32Array(4);
    this.renderer.readRenderTargetPixels(this.sdfRT, x, y, 1, 1, this._readBuf);
    return this._readBuf[0];
  }

  /**
   * Find a UV just outside the silhouette (positive d near 0).
   * @param {{ preferD?: number }} [opts]
   * @returns {{ u: number, v: number, d: number } | null}
   */
  findOutsideEdgeUv(opts = {}) {
    const preferD = opts.preferD ?? 0.02;
    const s = this.size;
    if (!this._scanBuf || this._scanBuf.length !== s * s * 4) {
      this._scanBuf = new Float32Array(s * s * 4);
    }
    this.renderer.readRenderTargetPixels(this.sdfRT, 0, 0, s, s, this._scanBuf);
    let best = null;
    let bestErr = 1e9;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const d = this._scanBuf[(y * s + x) * 4];
        if (!(d > 0.0) || d > 0.08) continue;
        const err = Math.abs(d - preferD);
        if (err < bestErr) {
          bestErr = err;
          best = { u: (x + 0.5) / s, v: (y + 0.5) / s, d };
        }
      }
    }
    return best;
  }

  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  update(scene, camera) {
    if (!this._meshes.length || !camera || !scene) return;

    const renderer = this.renderer;
    const prevRT = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevClearColor = new THREE.Color();
    const prevClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(prevClearColor);
    const prevOverride = scene.overrideMaterial;
    const prevMask = camera.layers.mask;

    const tagged = [];
    for (const mesh of this._meshes) {
      if (!mesh.visible) continue;
      tagged.push({ mesh, mask: mesh.layers.mask });
      mesh.layers.enable(EDGE_GLITCH_MASK_LAYER);
    }

    camera.layers.set(EDGE_GLITCH_MASK_LAYER);
    scene.overrideMaterial = this.maskMat;
    renderer.setRenderTarget(this.maskRT);
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, camera);

    // Bust-only packed depth (same layer-4 set) for occlusion vs FogDepthCapture.
    const prevTone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    scene.overrideMaterial = this.depthMat;
    renderer.setRenderTarget(this.depthRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    renderer.toneMapping = prevTone;

    scene.overrideMaterial = prevOverride;
    camera.layers.mask = prevMask;
    for (const { mesh, mask } of tagged) {
      mesh.layers.mask = mask;
    }

    this.seedMat.uniforms.tMask.value = this.maskRT.texture;
    this._blit(this.seedMat, this.seedA);

    let read = this.seedA;
    let write = this.seedB;
    let step = Math.floor(this.size * 0.5);
    while (step >= 1) {
      this.jfaMat.uniforms.tSeed.value = read.texture;
      this.jfaMat.uniforms.uStep.value = step;
      this._blit(this.jfaMat, write);
      const tmp = read;
      read = write;
      write = tmp;
      step = Math.floor(step * 0.5);
    }

    this.sdfMat.uniforms.tSeed.value = read.texture;
    this.sdfMat.uniforms.tMask.value = this.maskRT.texture;
    this._blit(this.sdfMat, this.sdfRT);

    renderer.setRenderTarget(prevRT);
    renderer.autoClear = prevAutoClear;
    renderer.setClearColor(prevClearColor, prevClearAlpha);
  }

  /**
   * @param {THREE.ShaderMaterial} mat
   * @param {THREE.WebGLRenderTarget} rt
   */
  _blit(mat, rt) {
    this._fsQuad.material = mat;
    this.renderer.setRenderTarget(rt);
    this.renderer.clear();
    this.renderer.render(this._fsScene, this._fsCam);
  }

  dispose() {
    this.maskRT.dispose();
    this.depthRT.dispose();
    this.seedA.dispose();
    this.seedB.dispose();
    this.sdfRT.dispose();
    this.maskMat.dispose();
    this.depthMat.dispose();
    this.seedMat.dispose();
    this.jfaMat.dispose();
    this.sdfMat.dispose();
    this._fsQuad.geometry.dispose();
  }
}
