/**
 * Pass P — film-look study (DEV A/B only; nothing here is on by default).
 *
 * P2 `StillAccumulatePass`: while the camera is still, the stage jitters the
 * projection by a sub-pixel Halton offset each frame and this pass keeps a
 * running average (1/n, n ≤ maxFrames) in a half-float history target — a
 * supersampled still. On any camera change the history is frozen and
 * crossfaded out over `fadeFrames` instead of snapping.
 *
 * P4 `DisplayGrainEffect` + `HalationEffect`: run inside the composer's last
 * pass, i.e. per canvas pixel after the upscale. Grain is ~1 px, luminance
 * weighted (low in blacks); halation adds a warm/red tint of a low-threshold
 * blurred highlight texture (a second BloomEffect at intensity 0 supplies the
 * blur).
 */
import * as THREE from "three";
import { BlendFunction, BloomEffect, Effect, KernelSize, Pass, ToneMappingEffect, ToneMappingMode } from "postprocessing";

const BLEND_FRAG = /* glsl */ `
  uniform sampler2D tLive;
  uniform sampler2D tHistory;
  uniform float uLive;
  varying vec2 vUv;
  void main() {
    vec4 live = texture2D(tLive, vUv);
    vec4 hist = texture2D(tHistory, vUv);
    gl_FragColor = mix(hist, live, uLive);
  }
`;
const COPY_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tSrc, vUv); }
`;
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Halton(2,3) sub-pixel offsets in [-0.5, 0.5). */
export function halton(i, base) {
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

export class StillAccumulatePass extends Pass {
  constructor({ maxFrames = 16, fadeFrames = 5 } = {}) {
    super("StillAccumulatePass");
    this.maxFrames = maxFrames;
    this.fadeFrames = fadeFrames;
    this.n = 0;
    this.fade = 0;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false };
    this.histA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.histB = new THREE.WebGLRenderTarget(1, 1, opts);
    this.blend = new THREE.ShaderMaterial({
      uniforms: { tLive: { value: null }, tHistory: { value: null }, uLive: { value: 1 } },
      vertexShader: VERT,
      fragmentShader: BLEND_FRAG,
      depthTest: false,
      depthWrite: false
    });
    this.copy = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null } }, vertexShader: VERT, fragmentShader: COPY_FRAG, depthTest: false, depthWrite: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blend);
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** Stage calls once per frame: still → accumulate; moved → freeze + crossfade out. */
  setStill(still) {
    if (still) {
      if (this.fade > 0) {
        this.fade = 0;
        this.n = 0;
      }
      return;
    }
    if (this.n > 1 && this.fade === 0) this.fade = this.fadeFrames;
    this.n = 0;
  }

  /** Index of the jitter sample for this frame (0 = none). */
  get sampleIndex() {
    return this.fade > 0 ? 0 : this.n + 1;
  }

  _draw(renderer, material, target) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.quadScene, this.quadCam);
  }

  render(renderer, inputBuffer, outputBuffer) {
    const out = this.renderToScreen ? null : outputBuffer;
    if (this.fade > 0) {
      // Crossfade the frozen still into the live frame.
      this.blend.uniforms.tLive.value = inputBuffer.texture;
      this.blend.uniforms.tHistory.value = this.histA.texture;
      this.blend.uniforms.uLive.value = 1 - this.fade / (this.fadeFrames + 1);
      this._draw(renderer, this.blend, out);
      this.fade -= 1;
      return;
    }
    if (this.n === 0) {
      this.copy.uniforms.tSrc.value = inputBuffer.texture;
      this._draw(renderer, this.copy, this.histA);
      this.n = 1;
    } else {
      const k = Math.min(this.n + 1, this.maxFrames);
      this.blend.uniforms.tLive.value = inputBuffer.texture;
      this.blend.uniforms.tHistory.value = this.histA.texture;
      this.blend.uniforms.uLive.value = 1 / k;
      this._draw(renderer, this.blend, this.histB);
      [this.histA, this.histB] = [this.histB, this.histA];
      this.n += 1;
    }
    this.copy.uniforms.tSrc.value = this.histA.texture;
    this._draw(renderer, this.copy, out);
  }

  setSize(width, height) {
    this.histA.setSize(width, height);
    this.histB.setSize(width, height);
    this.n = 0;
  }

  dispose() {
    this.histA.dispose();
    this.histB.dispose();
    this.blend.dispose();
    this.copy.dispose();
  }
}

/** ~1 canvas-px grain, luminance weighted: near zero in blacks, peaks in mids. */
export class DisplayGrainEffect extends Effect {
  constructor({ amount = 0.035 } = {}) {
    super(
      "DisplayGrainEffect",
      /* glsl */ `
        uniform float uTime;
        uniform float uAmount;
        float h12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          float l = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float w = smoothstep(0.015, 0.25, l) * (1.0 - 0.6 * smoothstep(0.5, 1.2, l));
          float n = h12(gl_FragCoord.xy + fract(uTime * 37.0) * 1013.0) - 0.5;
          outputColor = vec4(inputColor.rgb + n * uAmount * w, inputColor.a);
        }
      `,
      {
        blendFunction: BlendFunction.SET,
        uniforms: new Map([
          ["uTime", new THREE.Uniform(0)],
          ["uAmount", new THREE.Uniform(amount)]
        ])
      }
    );
  }
}

/** Adds a warm tint of a blurred low-threshold highlight texture. */
export class HalationEffect extends Effect {
  constructor({ texture = null, intensity = 0.25, tint = new THREE.Color(1.0, 0.32, 0.12) } = {}) {
    super(
      "HalationEffect",
      /* glsl */ `
        uniform sampler2D tHalation;
        uniform float uIntensity;
        uniform vec3 uTint;
        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          vec3 h = texture2D(tHalation, uv).rgb;
          float hl = dot(h, vec3(0.2126, 0.7152, 0.0722));
          outputColor = vec4(inputColor.rgb + uTint * hl * uIntensity, inputColor.a);
        }
      `,
      {
        blendFunction: BlendFunction.SET,
        uniforms: new Map([
          ["tHalation", new THREE.Uniform(texture)],
          ["uIntensity", new THREE.Uniform(intensity)],
          ["uTint", new THREE.Uniform(tint)]
        ])
      }
    );
  }
}

/** The blur source for halation: a BloomEffect that adds nothing itself. */
export function makeHalationBloom() {
  return new BloomEffect({
    mipmapBlur: false,
    luminanceThreshold: 0.35,
    luminanceSmoothing: 0.25,
    intensity: 0,
    resolutionScale: 0.5,
    kernelSize: KernelSize.HUGE
  });
}

/** Linear exposure multiply (ahead of a tone map, so exposure can be matched). */
export class ExposureEffect extends Effect {
  constructor({ exposure = 1 } = {}) {
    super(
      "ExposureEffect",
      /* glsl */ `
        uniform float uExposure;
        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          outputColor = vec4(inputColor.rgb * uExposure, inputColor.a);
        }
      `,
      { blendFunction: BlendFunction.SET, uniforms: new Map([["uExposure", new THREE.Uniform(exposure)]]) }
    );
  }
}

/** P3 — tone-map effects by name ("aces" | "agx" | "neutral"). */
export function makeToneMap(name) {
  const mode = { aces: ToneMappingMode.ACES_FILMIC, agx: ToneMappingMode.AGX, neutral: ToneMappingMode.NEUTRAL }[name];
  return mode == null ? null : new ToneMappingEffect({ mode });
}
