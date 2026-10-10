/**
 * Pass T — still-camera temporal super-resolution (Pass P P2 done as
 * upsampling). The scene keeps drawing at the rest budget; while the camera
 * is still the stage jitters the projection by sub-pixel Halton offsets and
 * this module accumulates those samples into a history at DISPLAY
 * resolution, so the converged still carries display-resolution detail.
 *
 * Pipeline (README §20 11v):
 *  - `TsrAccumulatePass` sits right after the scene render (before edge
 *    glitch, SMAA, DOF, bloom): it reads the draw-res HDR frame, splats it
 *    into the display-res history (nearest-sample tent weight on the display
 *    grid, history clamped to the current frame's 3×3 neighbourhood
 *    min/max so animated content falls back to the live frame), and keeps a
 *    bilinear display-res copy of this pre-post frame. It never touches the
 *    composer buffers (needsSwap false).
 *  - Post stays per frame at draw resolution.
 *  - `TsrComposeEffect`, first in the last (to-screen, display-res) pass:
 *    out = upsample(post(C)) + blend · (history − upsample(C)) — the post
 *    result keeps edge glitch / bloom live, the scene detail comes from the
 *    history. Halation and grain follow in the same pass, per display pixel.
 *
 * All targets are display-res and allocated once (`allocate`, boot and
 * window resize only — never per stop, notch or hop).
 */
import * as THREE from "three";
import { BlendFunction, Effect, Pass } from "postprocessing";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Halton(base) in [0, 1). */
function halton(i, base) {
  let f = 1;
  let r = 0;
  let n = i;
  while (n > 0) {
    f /= base;
    r += f * (n % base);
    n = Math.floor(n / base);
  }
  return r;
}

/** Sub-pixel jitter (draw px, −0.5..0.5) for phase `k` (1-based, Halton 2,3). */
export function tsrJitter(k, phases) {
  const i = ((k - 1) % phases) + 1;
  return [halton(i, 2) - 0.5, halton(i, 3) - 0.5];
}

const ACCUM_FRAG = /* glsl */ `
  uniform sampler2D tCur;
  uniform sampler2D tHist;
  uniform vec2 uDrawSize;
  uniform vec2 uJitter;   // unjittered draw coord of texel centre = texel + 0.5 + uJitter
  uniform float uRatio;   // display px per draw px
  uniform float uReset;   // 1 = start a new history
  uniform float uMaxW;    // weight cap (adaptivity)
  uniform float uClamp;   // DEV: 0 = no history clamp
  uniform float uSynth;   // DEV: 1 = a 1-display-px checker instead of the frame
  varying vec2 vUv;

  vec3 fetch(ivec2 p) {
    p = clamp(p, ivec2(0), ivec2(uDrawSize) - 1);
    if (int(uSynth + 0.5) == 1) {
      // The value a point sample at this texel's (jittered) centre would see.
      vec2 q = (vec2(p) + 0.5 + uJitter) * uRatio;
      // A slanted step edge (display px): a resolved edge is ~1 px wide.
      return vec3(step(0.0, q.x + 0.3 * q.y - 2000.0));
    }
    return texelFetch(tCur, p, 0).rgb;
  }

  void main() {
    int mode = int(uSynth + 0.5);
    if (mode == 2) { gl_FragColor = vec4(uRatio, uJitter, uDrawSize.x * 0.001); return; } // DEV: echo uniforms
    // This display pixel's centre in unjittered draw-pixel coordinates.
    vec2 p = vUv * uDrawSize;
    // Nearest jittered sample (texel) and its distance on the display grid.
    ivec2 t = ivec2(floor(p - uJitter));
    vec2 d = (vec2(t) + 0.5 + uJitter - p) * uRatio;
    float w = exp(-dot(d, d) / (2.0 * 0.45 * 0.45));
    vec3 c = fetch(t);
    if (mode == 3) { gl_FragColor = vec4(c.r, d, w); return; } // DEV: echo c, d, w
    // 3×3 neighbourhood of the current frame: mean / variance for the clip box.
    // History sampled at the same nine sample positions (display grid), so
    // its local mean has the current mean's footprint.
    vec3 m1 = vec3(0.0);
    vec3 m2 = vec3(0.0);
    vec3 hm = vec3(0.0);
    vec2 toUv = 1.0 / uDrawSize;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 s = fetch(t + ivec2(x, y));
        m1 += s;
        m2 += s * s;
        hm += texture2D(tHist, (vec2(t + ivec2(x, y)) + 0.5 + uJitter) * toUv).rgb;
      }
    }
    hm /= 9.0;
    m1 /= 9.0;
    vec3 sigma = sqrt(max(m2 / 9.0 - m1 * m1, 0.0));
    vec4 h = texture2D(tHist, vUv);
 // DEV: echo c, mean, sigma, history (green)
    if (uReset > 0.5 || h.a <= 0.0) {
      gl_FragColor = vec4(c, max(w, 1e-3));
      return;
    }
    // Light flicker (lantern, neon) scales a region's brightness frame to
    // frame; rescale the history by current / history local mean (same nine
    // positions) so that is not treated as content change.
    float lc = dot(m1, vec3(0.2126, 0.7152, 0.0722));
    float lh = dot(hm, vec3(0.2126, 0.7152, 0.0722));
    vec3 hs = h.rgb * clamp(lc / max(lh, 1e-4), 0.5, 2.0);
    // Variance clip (mean ± max(γσ, floor)); a real content change (scroll,
    // cursor, motion) leaves the box and falls back to the live frame.
    vec3 halfW = max(1.25 * sigma, vec3(0.04 * lc + 0.002));
    if (mode == 4) { gl_FragColor = vec4(m1.r, hm.r, h.r, hs.r); return; }
    if (mode == 5) { gl_FragColor = vec4(m1.g, hm.g, m1.b, hm.b); return; }
    if (mode == 6) { gl_FragColor = vec4(lc, lh, lc / max(lh, 1e-4), h.a); return; } // DEV: green / blue means // DEV: echo current mean, history mean (same taps), history, scaled history
    vec3 hc = uClamp > 0.5 ? clamp(hs, m1 - halfW, m1 + halfW) : h.rgb;
    float hw = min(h.a, uMaxW);
    gl_FragColor = vec4((hc * hw + c * w) / (hw + w), hw + w);
  }
`;

const COPY_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  varying vec2 vUv;
  void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }
`;

export class TsrAccumulatePass extends Pass {
  constructor({ phases = 16, maxWeight = 24 } = {}) {
    super("TsrAccumulatePass");
    this.needsSwap = false;
    this.phases = phases;
    this.active = false;
    this.reset = true;
    this.frames = 0;
    this.jitter = [0, 0];
    this.width = 0;
    this.height = 0;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.histA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.histB = new THREE.WebGLRenderTarget(1, 1, opts);
    this.pre = new THREE.WebGLRenderTarget(1, 1, opts);
    // Allocated once; never through composerSizePool (§20 11v).
    for (const rt of [this.histA, this.histB, this.pre]) rt.userData = { ...(rt.userData ?? {}), noSizePool: true };
    this.accum = new THREE.ShaderMaterial({
      name: "TsrAccumulate",
      uniforms: {
        tCur: { value: null },
        tHist: { value: null },
        uDrawSize: { value: new THREE.Vector2(1, 1) },
        uJitter: { value: new THREE.Vector2() },
        uRatio: { value: 1 },
        uReset: { value: 1 },
        uMaxW: { value: maxWeight },
        uClamp: { value: 1 },
        uSynth: { value: 0 }
      },
      vertexShader: VERT,
      fragmentShader: ACCUM_FRAG,
      depthTest: false,
      depthWrite: false
    });
    this.copy = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null } }, vertexShader: VERT, fragmentShader: COPY_FRAG, depthTest: false, depthWrite: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.accum);
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** Display-resolution targets — boot and window resize only. */
  allocate(width, height) {
    if (width === this.width && height === this.height) return false;
    this.width = width;
    this.height = height;
    this.histA.setSize(width, height);
    this.histB.setSize(width, height);
    this.pre.setSize(width, height);
    this.reset = true;
    this.frames = 0;
    return true;
  }

  /** Composer setSize calls this with the draw size — targets are not resized by it. */
  setSize() {}

  _draw(renderer, material, target) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.quadScene, this.quadCam);
  }

  render(renderer, inputBuffer) {
    if (!this.active || !this.width) return;
    const u = this.accum.uniforms;
    u.tCur.value = inputBuffer.texture;
    u.tHist.value = this.histA.texture;
    u.uDrawSize.value.set(inputBuffer.width, inputBuffer.height);
    u.uJitter.value.set(this.jitter[0], this.jitter[1]);
    u.uRatio.value = this.width / Math.max(1, inputBuffer.width);
    u.uReset.value = this.reset ? 1 : 0;
    this._draw(renderer, this.accum, this.histB);
    [this.histA, this.histB] = [this.histB, this.histA];
    this.copy.uniforms.tSrc.value = inputBuffer.texture;
    this._draw(renderer, this.copy, this.pre);
    this.reset = false;
    this.frames += 1;
    this.onOutput?.(this.histA.texture, this.pre.texture);
  }

  dispose() {
    this.histA.dispose();
    this.histB.dispose();
    this.pre.dispose();
    this.accum.dispose();
    this.copy.dispose();
  }
}

/** out = input (upsampled post result) + uBlend · (history − upsampled pre-post frame). */
export class TsrComposeEffect extends Effect {
  constructor() {
    super(
      "TsrComposeEffect",
      /* glsl */ `
        uniform sampler2D tHist;
        uniform sampler2D tPre;
        uniform float uBlend;
        uniform float uView; // DEV: 1 = history only, 2 = pre-post copy only
        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          if (uView > 0.5) { outputColor = vec4(texture2D(uView > 1.5 ? tPre : tHist, uv).rgb, 1.0); return; }
          if (uBlend <= 0.0) { outputColor = inputColor; return; }
          vec3 detail = texture2D(tHist, uv).rgb - texture2D(tPre, uv).rgb;
          outputColor = vec4(max(inputColor.rgb + uBlend * detail, 0.0), inputColor.a);
        }
      `,
      {
        blendFunction: BlendFunction.SET,
        uniforms: new Map([
          ["tHist", new THREE.Uniform(null)],
          ["tPre", new THREE.Uniform(null)],
          ["uBlend", new THREE.Uniform(0)],
          ["uView", new THREE.Uniform(0)]
        ])
      }
    );
  }
}

/**
 * Pass T — texture LOD bias for the TSR (FSR2 / DLSS practice). Each frame
 * samples textures at the mip level of a DRAW-size pixel, so the texture
 * detail a display-resolution image needs is filtered away before the jitter
 * can recover it. WebGL has no sampler LOD bias, so the map / normal /
 * roughness / metalness / emissive sampling chunks take `tsrLodBias`, one
 * uniform object shared by every material (bound in onBeforeCompile).
 * The stage sets it to log2(draw / display) while accumulating and to 0
 * otherwise — motion frames sample exactly as before; no recompiles.
 * Installed once at module load, before any material compiles.
 */
export const TSR_LOD_BIAS = { value: 0 };
let lodBiasInstalled = false;

export function installTsrLodBias() {
  if (lodBiasInstalled) return;
  lodBiasInstalled = true;
  const decl = "\n#ifndef TSR_LOD_BIAS_DECL\n#define TSR_LOD_BIAS_DECL\nuniform float tsrLodBias;\n#endif\n";
  const SAMPLES = [
    ["map_pars_fragment", "map_fragment", "texture2D( map, vMapUv )"],
    ["normalmap_pars_fragment", "normal_fragment_maps", "texture2D( normalMap, vNormalMapUv )"],
    ["roughnessmap_pars_fragment", "roughnessmap_fragment", "texture2D( roughnessMap, vRoughnessMapUv )"],
    ["metalnessmap_pars_fragment", "metalnessmap_fragment", "texture2D( metalnessMap, vMetalnessMapUv )"],
    ["emissivemap_pars_fragment", "emissivemap_fragment", "texture2D( emissiveMap, vEmissiveMapUv )"]
  ];
  for (const [pars, chunk, call] of SAMPLES) {
    THREE.ShaderChunk[pars] = decl + THREE.ShaderChunk[pars];
    THREE.ShaderChunk[chunk] = THREE.ShaderChunk[chunk].split(call).join(call.replace(" )", ", tsrLodBias )"));
  }
  // Every material binds the shared uniform object. Wrap onBeforeCompile on
  // the prototype (and any instance assignment) so per-material patches keep
  // running; the wrapper reports the original source, because three's default
  // customProgramCacheKey is onBeforeCompile.toString().
  const proto = THREE.Material.prototype;
  const base = proto.onBeforeCompile;
  const wrap = (fn) => {
    const w = function (shader, renderer) {
      fn?.call(this, shader, renderer);
      shader.uniforms.tsrLodBias = TSR_LOD_BIAS;
    };
    w.toString = () => String(fn);
    return w;
  };
  Object.defineProperty(proto, "onBeforeCompile", {
    configurable: true,
    get() {
      return this.__tsrObc ?? (this.__tsrObc = wrap(this.__tsrUserObc ?? base));
    },
    set(fn) {
      this.__tsrUserObc = fn;
      this.__tsrObc = wrap(fn);
    }
  });
}
