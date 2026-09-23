import * as THREE from "three";
import { Pass } from "postprocessing";
import {
  EDGE_GLITCH_ARM_RAMP,
  EDGE_GLITCH_BAND_COUNT,
  EDGE_GLITCH_DISSOLVE_LINE,
  EDGE_GLITCH_DISSOLVE_LINE_CAP,
  EDGE_GLITCH_DROPOUT,
  EDGE_GLITCH_FADE_GAIN,
  EDGE_GLITCH_GLITCH_ARM_OUTER,
  EDGE_GLITCH_NOISE_HZ,
  EDGE_GLITCH_OCC_BIAS,
  EDGE_GLITCH_OCC_SOFT,
  EDGE_GLITCH_SHEAR_PX,
  EDGE_GLITCH_SPAN_ALONG,
  EDGE_GLITCH_SPAN_IN,
  EDGE_GLITCH_SPAN_OUT,
  EDGE_GLITCH_SYNC_ROLL_PX
} from "./constants.js";
import {
  EDGE_GLITCH_OCC_GLSL
} from "./edgeGlitchMask.glsl.js";

/**
 * Subject dissolve — dying transmission / digitizing out of existence.
 *
 * NEW primitive (not EdgeGlitch pixel-corruption). Horizontal scan-slices shear
 * off the silhouette and FADE TO BLACK. One thin neon dissolve-line at the
 * solid→slice boundary. Proximity + diamond + occlusion gates unchanged.
 * fog → this → bloom → grain.
 */
export class SubjectDissolvePass extends Pass {
  constructor() {
    super("SubjectDissolvePass");
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
      uCamNear: { value: 0.1 },
      uCamFar: { value: 40 },
      uResolution: { value: new THREE.Vector2(1280, 720) },
      uCursorUv: { value: new THREE.Vector2(-1, -1) },
      uCursorActive: { value: 0 },
      uEnabled: { value: 0 },
      uArmOuter: { value: EDGE_GLITCH_GLITCH_ARM_OUTER },
      uArmRamp: { value: EDGE_GLITCH_ARM_RAMP },
      uSpanAlong: { value: EDGE_GLITCH_SPAN_ALONG },
      uSpanOut: { value: EDGE_GLITCH_SPAN_OUT },
      uSpanIn: { value: EDGE_GLITCH_SPAN_IN },
      uBandCount: { value: EDGE_GLITCH_BAND_COUNT },
      uShearPx: { value: EDGE_GLITCH_SHEAR_PX },
      uFadeGain: { value: EDGE_GLITCH_FADE_GAIN },
      uDropout: { value: EDGE_GLITCH_DROPOUT },
      uSyncRollPx: { value: EDGE_GLITCH_SYNC_ROLL_PX },
      uDissolveLine: { value: EDGE_GLITCH_DISSOLVE_LINE },
      uDissolveLineCap: { value: EDGE_GLITCH_DISSOLVE_LINE_CAP },
      uNeonHue: { value: new THREE.Color(0x9dff1a) },
      uNoiseHz: { value: EDGE_GLITCH_NOISE_HZ },
      uTime: { value: 0 }
    };

    this.material = new THREE.ShaderMaterial({
      name: "SubjectDissolveMaterial",
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
        uniform float uCamNear;
        uniform float uCamFar;
        uniform vec2 uResolution;
        uniform vec2 uCursorUv;
        uniform float uCursorActive;
        uniform float uEnabled;
        uniform float uArmOuter;
        uniform float uArmRamp;
        uniform float uSpanAlong;
        uniform float uSpanOut;
        uniform float uSpanIn;
        uniform float uBandCount;
        uniform float uShearPx;
        uniform float uFadeGain;
        uniform float uDropout;
        uniform float uSyncRollPx;
        uniform float uDissolveLine;
        uniform float uDissolveLineCap;
        uniform vec3 uNeonHue;
        uniform float uNoiseHz;
        uniform float uTime;

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

        float thinLine(float distPx, float halfWidthPx) {
          return 1.0 - smoothstep(0.0, max(halfWidthPx, 0.15), distPx);
        }

        /**
         * Soft rectangular strip along the silhouette — NOT the L1 diamond.
         * Flat plateau + soft ends so scan-slices share length (no pointed tip).
         */
        float dissolveWhere(
          vec2 uv,
          vec2 crossUv,
          vec2 edgeTangent,
          vec2 edgeNormal,
          float spanAlong,
          float spanOut,
          float spanIn
        ) {
          float tAlong = dot(uv - crossUv, edgeTangent);
          float tAcross = dot(uv - crossUv, edgeNormal);
          float across = (tAcross > 0.0)
            ? tAcross / max(spanOut, 1e-6)
            : (-tAcross) / max(spanIn, 1e-6);
          float along = 1.0 - smoothstep(0.78, 1.0, abs(tAlong) / max(spanAlong, 1e-6));
          float acrossF = 1.0 - smoothstep(0.7, 1.0, across);
          return along * acrossF;
        }

        void main() {
          vec4 src = texture2D(tDiffuse, vUv);
          if (uEnabled < 0.5 || uCursorActive < 0.5) {
            gl_FragColor = src;
            return;
          }

          float dCursor = texture2D(uEdgeSdf, uCursorUv).r;
          if (dCursor <= 0.0) {
            gl_FragColor = src;
            return;
          }

          float tArm = clamp(1.0 - dCursor / max(uArmOuter, 1e-6), 0.0, 1.0);
          float proximity = pow(tArm, max(uArmRamp, 0.01));
          if (proximity < 1e-4) {
            gl_FragColor = src;
            return;
          }

          vec2 crossUv = projectToEdge(uCursorUv);
          vec2 gCross = sdfGrad(crossUv);
          float gLen = length(gCross);
          vec2 edgeNormal = gLen > 1e-6 ? normalize(gCross) : vec2(0.0, 1.0);
          vec2 edgeTangent = gLen > 1e-6
            ? normalize(vec2(-gCross.y, gCross.x))
            : vec2(1.0, 0.0);

          float whereMain = dissolveWhere(
            vUv, crossUv, edgeTangent, edgeNormal,
            uSpanAlong, uSpanOut, uSpanIn
          );
          float field = whereMain * proximity;
          if (field < 1e-4) {
            gl_FragColor = src;
            return;
          }

          float dSdf = texture2D(uEdgeSdf, vUv).r;
          float outside01 = smoothstep(0.0, max(uSpanOut, 1e-6), max(dSdf, 0.0));
          float bustPack = texture2D(uBustDepth, vUv).r;
          float srcLum = dot(src.rgb, vec3(0.2126, 0.7152, 0.0722));
          bool outside = dSdf > 0.0;
          // Inside: need real subject. Outside: allow empty BG for fading trails
          // (spanOut) — that is the shear-off into black. Far past spanOut → skip.
          if (!outside && (bustPack < 1e-3 || srcLum < 0.018)) {
            gl_FragColor = src;
            return;
          }
          if (outside && dSdf > max(uSpanOut, 1e-6) * 1.25) {
            gl_FragColor = src;
            return;
          }

          float occFade = edgeGlitchOccFade(
            uSceneDepth,
            uBustDepth,
            uEdgeSdf,
            vUv,
            crossUv,
            uBustDepthTexel,
            uOccSoft,
            uOccBias,
            uHasSceneDepth,
            uCamNear,
            uCamFar,
            uSpanOut
          );
          float gate = field * occFade;
          if (gate < 1e-3) {
            gl_FragColor = src;
            return;
          }

          // —— Irregular horizontal scan-slices (hashed heights, not a comb) ——
          float seed = floor(uTime * uNoiseHz);
          float bands = max(18.0, uBandCount);
          float yW = vUv.y + 0.018 * sin(vUv.y * 37.0 + seed * 0.7)
            + 0.012 * sin(vUv.y * 71.0 - seed * 1.3);
          float bandId = floor(yW * bands + rand(vec2(floor(yW * bands), seed)) * 0.35);
          float b0 = rand(vec2(bandId, seed + 0.1));
          float b1 = rand(vec2(bandId, seed + 1.7));
          float b2 = rand(vec2(bandId, seed + 3.3));
          float b3 = rand(vec2(bandId, seed + 5.9));

          float bandOn = step(0.28, b0);
          // Narrow lag — wide lag rebuilt a pointed tip envelope outside.
          float lag = mix(0.85, 1.12, b1);

          float shearUv = (uShearPx / max(uResolution.x, 1.0))
            * proximity * lag * (0.55 + 0.45 * b2) * bandOn * gate;
          float syncRoll = (uSyncRollPx / max(uResolution.y, 1.0))
            * proximity * (b3 * 2.0 - 1.0) * 0.4
            * step(0.8, b2) * bandOn;
          float sideLag = (uShearPx / max(uResolution.x, 1.0))
            * 0.12 * proximity * (b2 - 0.5) * bandOn * gate;

          // Outside: pull color FROM the subject (sample inward).
          // Inside: eat toward empty (sample outward → black past silhouette).
          vec2 sampleUv = clamp(
            outside
              ? vUv - edgeNormal * shearUv + edgeTangent * sideLag + vec2(0.0, syncRoll)
              : vUv + edgeNormal * shearUv + edgeTangent * sideLag + vec2(0.0, syncRoll),
            0.0,
            1.0
          );
          float dSample = texture2D(uEdgeSdf, sampleUv).r;
          float bustSample = texture2D(uBustDepth, sampleUv).r;
          vec3 sliceCol = texture2D(tDiffuse, sampleUv).rgb;
          if (outside) {
            // Trail must come from subject; empty sample → no invent.
            if (dSample > 0.0 || bustSample < 1e-3) {
              sliceCol = vec3(0.0);
            }
          } else if (dSample > 0.0 || bustSample < 1e-3) {
            sliceCol = vec3(0.0);
          }

          float fade = clamp(uFadeGain * gate * (0.35 + 0.65 * lag) * bandOn, 0.0, 1.0);
          float dropoutPulse = step(1.0 - clamp(uDropout, 0.0, 0.35), b0)
            * step(0.55, fract(uTime * 2.7 + b1));
          fade = max(fade, dropoutPulse * gate);

          vec3 color;
          if (outside) {
            // Fading trails into black — never a solid tip. Opacity collapses
            // with outside distance + fade; lag only desyncs bands slightly.
            float trailFade = clamp(fade * 0.55 + outside01 * 0.85, 0.0, 1.0);
            vec3 dispersed = mix(sliceCol, vec3(0.0), trailFade);
            float trailAmt = gate * bandOn
              * (1.0 - smoothstep(0.15, 1.0, outside01))
              * (1.0 - trailFade * 0.35);
            color = mix(src.rgb, dispersed, clamp(trailAmt, 0.0, 1.0));
          } else {
            vec3 dispersed = mix(sliceCol, vec3(0.0), fade);
            // Destructive only on the solid — never brighten into dilated rim.
            dispersed = min(dispersed, src.rgb);
            color = mix(src.rgb, dispersed, clamp(gate * bandOn, 0.0, 1.0));
          }

          // —— One thin neon dissolve-line at the solid silhouette ——
          float edgePx = abs(dSdf) * min(uResolution.x, uResolution.y);
          float line = thinLine(edgePx, 1.1);
          float lineAmt = clamp(uDissolveLine, 0.0, 1.0) * gate * proximity;
          vec3 lineCol = mix(uNeonHue, vec3(0.85, 0.95, 1.0), 0.2);
          vec3 accent = min(lineCol * line * lineAmt, vec3(uDissolveLineCap));

          color += accent;
          gl_FragColor = vec4(color, src.a);
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
   * Active-tube hue for dissolve-line tint.
   * @param {THREE.Color | { r: number, g: number, b: number } | null | undefined} color
   */
  setNeonHue(color) {
    const u = this.uniforms.uNeonHue;
    if (!color || !u?.value) return;
    if (color.isColor) u.value.copy(color);
    else if (typeof color.r === "number") u.value.setRGB(color.r, color.g, color.b);
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

/** @deprecated File retained for reference only — live pass is EdgeGlitchPass. */
export { SubjectDissolvePass as EdgeTubeGlitchPass };
export { SubjectDissolvePass as EdgeTubeGlitchEffect };
