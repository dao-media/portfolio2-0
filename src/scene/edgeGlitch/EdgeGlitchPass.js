import * as THREE from "three";
import { Pass } from "postprocessing";
import {
  EDGE_GLITCH_ARM_OUTER,
  EDGE_GLITCH_ARM_RAMP,
  EDGE_GLITCH_BAND_OUTER,
  EDGE_GLITCH_INTENSITY,
  EDGE_GLITCH_LOCAL_BASE,
  EDGE_GLITCH_LOCAL_GROWTH,
  EDGE_GLITCH_NOISE_HZ,
  EDGE_GLITCH_OCC_BIAS,
  EDGE_GLITCH_OCC_SOFT,
  EDGE_GLITCH_RGB_SPLIT,
  EDGE_GLITCH_TEAR_BANDS
} from "./constants.js";
import {
  EDGE_GLITCH_MASK_GLSL,
  EDGE_GLITCH_OCC_GLSL
} from "./edgeGlitchMask.glsl.js";

/**
 * Local silhouette tear pass (one live composer).
 *
 * Beauty resample + RGB split. Origin = SDF-projected edge under the cursor.
 * Occlusion: scene depth vs bust depth fades strength → 0 at rim ∩ occluder.
 * fog → this → bloom → grain. Not glitch-gl.
 */
export class EdgeGlitchPass extends Pass {
  constructor() {
    super("EdgeGlitchPass");
    this.needsSwap = true;
    this.enabled = true;

    this.uniforms = {
      tDiffuse: { value: null },
      uEdgeSdf: { value: null },
      uSceneDepth: { value: null },
      uBustDepth: { value: null },
      uBustDepthTexel: { value: new THREE.Vector2(1, 1) },
      uHasSceneDepth: { value: 0 },
      uOccSoft: { value: EDGE_GLITCH_OCC_SOFT },
      uOccBias: { value: EDGE_GLITCH_OCC_BIAS },
      uCursorUv: { value: new THREE.Vector2(-1, -1) },
      uCursorActive: { value: 0 },
      uEnabled: { value: 0 },
      uBandOuter: { value: EDGE_GLITCH_BAND_OUTER },
      uArmOuter: { value: EDGE_GLITCH_ARM_OUTER },
      uArmRamp: { value: EDGE_GLITCH_ARM_RAMP },
      uLocalBase: { value: EDGE_GLITCH_LOCAL_BASE },
      uLocalGrowth: { value: EDGE_GLITCH_LOCAL_GROWTH },
      uTearBands: { value: EDGE_GLITCH_TEAR_BANDS },
      uGlitchIntensity: { value: EDGE_GLITCH_INTENSITY },
      uRgbSplit: { value: EDGE_GLITCH_RGB_SPLIT },
      uNoiseHz: { value: EDGE_GLITCH_NOISE_HZ },
      uTime: { value: 0 }
    };

    this.material = new THREE.ShaderMaterial({
      name: "EdgeGlitchMaterial",
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = position.xy * 0.5 + 0.5;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform sampler2D uEdgeSdf;
        uniform sampler2D uSceneDepth;
        uniform sampler2D uBustDepth;
        uniform vec2 uBustDepthTexel;
        uniform float uHasSceneDepth;
        uniform float uOccSoft;
        uniform float uOccBias;
        uniform vec2 uCursorUv;
        uniform float uCursorActive;
        uniform float uEnabled;
        uniform float uBandOuter;
        uniform float uArmOuter;
        uniform float uArmRamp;
        uniform float uLocalBase;
        uniform float uLocalGrowth;
        uniform float uTearBands;
        uniform float uGlitchIntensity;
        uniform float uRgbSplit;
        uniform float uNoiseHz;
        uniform float uTime;

        ${EDGE_GLITCH_MASK_GLSL}
        ${EDGE_GLITCH_OCC_GLSL}

        float rand(vec2 co) {
          return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        vec2 sdfGrad(vec2 uv) {
          float e = 1.5 / 256.0;
          return vec2(
            texture2D(uEdgeSdf, uv + vec2(e, 0.0)).r - texture2D(uEdgeSdf, uv - vec2(e, 0.0)).r,
            texture2D(uEdgeSdf, uv + vec2(0.0, e)).r - texture2D(uEdgeSdf, uv - vec2(0.0, e)).r
          );
        }

        vec2 projectToEdge(vec2 uv) {
          float d = texture2D(uEdgeSdf, uv).r;
          vec2 g = sdfGrad(uv);
          float len = length(g);
          if (len < 1e-6) return uv;
          return clamp(uv - (g / len) * d, 0.0, 1.0);
        }

        void main() {
          vec4 src = texture2D(tDiffuse, vUv);
          if (uEnabled < 0.5 || uCursorActive < 0.5) {
            gl_FragColor = src;
            return;
          }

          float dCursor = texture2D(uEdgeSdf, uCursorUv).r;
          // Hard cut when pointer is inside the silhouette
          if (dCursor <= 0.0) {
            gl_FragColor = src;
            return;
          }

          // Proximity: closer to edge → stronger WIDTH + INTENSITY
          // ARM_OUTER is a HARD gate — outside it, zero effect (no far-cursor leak).
          float tArm = clamp(1.0 - dCursor / max(uArmOuter, 1e-6), 0.0, 1.0);
          float proximity = pow(tArm, max(uArmRamp, 0.01));
          if (proximity < 1e-4) {
            gl_FragColor = src;
            return;
          }
          // Origin on the alpha edge (not the cursor in empty space)
          vec2 edgeUv = projectToEdge(uCursorUv);
          // Scale grows only a little with proximity
          float localR = uLocalBase + uLocalGrowth * proximity;

          float where = edgeGlitchWhere(
            vUv, uEdgeSdf, edgeUv, uBandOuter, localR
          );
          if (where < 1e-4) {
            gl_FragColor = src;
            return;
          }

          float occFade = edgeGlitchOccFade(
            uSceneDepth,
            uBustDepth,
            vUv,
            edgeUv,
            uBustDepthTexel,
            uOccSoft,
            uOccBias,
            uHasSceneDepth
          );
          if (occFade < 1e-4) {
            gl_FragColor = src;
            return;
          }

          float seed = floor(uTime * uNoiseHz);
          float yCell = floor(vUv.y * 48.0);
          float bandScale = 0.65 + rand(vec2(yCell, seed + 0.4)) * 0.7;
          float bands = max(24.0, uTearBands) * bandScale;
          float blockY = floor(vUv.y * bands);

          float nOn = rand(vec2(blockY, seed));
          float nAmt = rand(vec2(blockY, seed + 2.1)) * 2.0 - 1.0;
          float tearOn = step(0.3, nOn);
          float tearWide = step(0.78, nOn);
          float shiftX = tearOn * nAmt * (0.5 + tearWide * 1.0);
          shiftX = clamp(shiftX, -1.0, 1.0);

          // WIDTH / INTENSITY: fully gated by proximity (no far-cursor floor)
          float widthAmt = proximity * proximity;
          vec2 p = vUv + vec2(shiftX * widthAmt * uGlitchIntensity, 0.0);
          p = clamp(p, 0.0, 1.0);

          float split = uRgbSplit * proximity * (0.75 + tearWide * 0.55);
          vec2 off = vec2(split, 0.0);
          vec4 cr = texture2D(tDiffuse, clamp(p + off, 0.0, 1.0));
          vec4 cga = texture2D(tDiffuse, clamp(p, 0.0, 1.0));
          vec4 cb = texture2D(tDiffuse, clamp(p - off, 0.0, 1.0));
          vec4 torn = vec4(cr.r, cga.g, cb.b, cga.a);

          float mixW = where * proximity * occFade;
          gl_FragColor = mix(src, torn, clamp(mixW, 0.0, 1.0));
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });

    this.fullscreenMaterial = this.material;
  }

  /** @param {number} time seconds */
  setTime(time) {
    this.uniforms.uTime.value = time;
  }

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.WebGLRenderTarget} inputBuffer
   * @param {THREE.WebGLRenderTarget} outputBuffer
   */
  render(renderer, inputBuffer, outputBuffer) {
    this.uniforms.tDiffuse.value = inputBuffer.texture;
    this.fullscreenMaterial = this.material;
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.material.dispose();
  }
}

/** @deprecated */
export { EdgeGlitchPass as EdgeTubeGlitchPass };
export { EdgeGlitchPass as EdgeTubeGlitchEffect };
