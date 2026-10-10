import * as THREE from "three";
import { skyParallaxUniforms } from "./StarField.js";
import { BLACK_HOLE_CENTER } from "../camera/BlackHoleCameraSequence.js";
import { blackHoleLensFromCamera, SKY_HORIZON_HIGH } from "./MilkyWayNebulaShader.js";
import {
  STAR_FIELD_MIN_SIZE_PX,
  STAR_FIELD_MAX_SIZE_PX,
  STAR_FIELD_SIZE_EXPONENT,
  STAR_FIELD_MIN_BRIGHT,
  STAR_FIELD_SPRITE_SOFTNESS,
  STAR_FIELD_MIN_RENDER_PX,
  STAR_FIELD_TWINKLE_AMOUNT,
  STAR_FIELD_TWINKLE_SPEED
} from "./StarField.js";

/**
 * This module now serves the cursor hover star trail only (see
 * CursorStarTrail.js) — the far-sky field it used to also generate
 * (createProceduralStarfield / createFlightStarMirror) has been replaced by
 * StarField.js, a single object shared by the ring and the black-hole
 * flight. Do not add the far-sky field back here; wire it through
 * StarField.js instead.
 *
 * Stars here use StarField.js's projection (Pass Q Q3): a fixed world
 * direction, drawn at `anchor + dir · R` — rotation-only at infinity while
 * invR = 0 (the flight, where this trail lives), arena-anchored otherwise.
 */

/** Distant shell radius the reveal-trail's directions are generated on, meters — direction only, not a draw distance (see the rotation-only projection below). */
const MILKY_WAY_DISTANCE = 24000;
/** Cursor-trail ring-buffer size (see CursorStarTrail.js) — shared here so the shader's fixed-size uniform arrays match it exactly. */
export const CURSOR_TRAIL_SAMPLE_COUNT = 16;

const STAR_PALETTE = [
  new THREE.Color(0x9bb0ff),
  new THREE.Color(0xaabfff),
  new THREE.Color(0xcad8ff),
  new THREE.Color(0xfff4ea),
  new THREE.Color(0xffd2a1),
  new THREE.Color(0xffa1a1)
];

const StarfieldShader = {
  uniforms: {
    uTime: { value: 0 },
    uCameraPos: { value: new THREE.Vector3() },
    uSkyAnchor: { value: new THREE.Vector3() },
    uSkyInvR: { value: 0 },
    uBlackHolePos: { value: BLACK_HOLE_CENTER.clone() },
    uLensInner: { value: 0 },
    uLensOuter: { value: 0 },
    uLensStrength: { value: 0 },
    uHorizonFade: { value: 1 },
    uPixelRatio: { value: 1 },
    uReveal: { value: 0 },
    uMaskGain: { value: 0 },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uPathPx: { value: Array.from({ length: CURSOR_TRAIL_SAMPLE_COUNT }, () => new THREE.Vector2()) },
    uPathAge: { value: new Array(CURSOR_TRAIL_SAMPLE_COUNT).fill(1) },
    uHeadRadius: { value: 30 },
    uTaperExp: { value: 1.6 },
    uSpriteSoftness: { value: STAR_FIELD_SPRITE_SOFTNESS },
    uMinRenderPx: { value: STAR_FIELD_MIN_RENDER_PX },
    uTwinkleAmount: { value: STAR_FIELD_TWINKLE_AMOUNT },
    uTwinkleSpeed: { value: STAR_FIELD_TWINKLE_SPEED }
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uCameraPos;
    uniform vec3 uSkyAnchor;
    uniform float uSkyInvR;
    uniform vec3 uBlackHolePos;
    uniform float uLensInner;
    uniform float uLensOuter;
    uniform float uLensStrength;
    uniform float uHorizonFade;
    uniform float uPixelRatio;
    uniform float uReveal;
    uniform float uMaskGain;
    uniform vec2 uViewport;
    uniform vec2 uPathPx[${CURSOR_TRAIL_SAMPLE_COUNT}];
    uniform float uPathAge[${CURSOR_TRAIL_SAMPLE_COUNT}];
    uniform float uHeadRadius;
    uniform float uTaperExp;
    uniform float uSpriteSoftness;
    uniform float uMinRenderPx;
    uniform float uTwinkleAmount;
    uniform float uTwinkleSpeed;

    attribute float aSize;
    attribute float aBright;
    attribute vec3 aColor;
    attribute float aPhase;
    attribute float aFreq;

    varying vec3 vColor;
    varying float vAlpha;
    varying float vBright;
    varying float vMag;

    void main() {
      vColor = aColor;
      vMag = aBright;
      // Celestial direction — stars here are at infinity, so only the
      // direction is ever meaningful; there is no "position" to speak of.
      vec3 skyDir = normalize(position);

      // Lensing bends the apparent direction only — a star at infinity has
      // no distance for the bend math to use, only an angle to the hole.
      if (uLensOuter > 0.002 && uLensStrength > 0.001) {
        vec3 camToHole = uBlackHolePos - uCameraPos;
        float holeDist = length(camToHole);
        if (holeDist > 0.5) {
          vec3 holeDir = camToHole / holeDist;
          float cosA = clamp(dot(skyDir, holeDir), -1.0, 1.0);
          float ang = acos(cosA);
          if (ang > uLensInner && ang < uLensOuter) {
            float u = (ang - uLensInner) / max(uLensOuter - uLensInner, 1e-4);
            float onset = smoothstep(0.0, 0.08, u);
            float tight = smoothstep(1.0, 0.9, u);
            float bend = onset * tight * uLensStrength * 0.053;
            vec3 tangent = skyDir - holeDir * cosA;
            float tLen = length(tangent);
            if (tLen > 1e-5) {
              vec3 outDir = tangent / tLen;
              float newAng = ang + bend;
              skyDir = normalize(holeDir * cos(newAng) + outDir * sin(newAng));
            }
          }
        }
      }

      // Same arena-anchored projection as StarField.js (invR = 0: at
      // infinity), so the reveal stars move with the sky.
      vec3 viewDir = mat3(viewMatrix) * normalize(skyDir + uSkyInvR * (uSkyAnchor - uCameraPos));
      vBright = 1.0 + uTwinkleAmount * sin(uTime * aFreq * uTwinkleSpeed * 6.28318 + aPhase);
      // Same anti-pop treatment as StarField.js: never render sub-pixel,
      // scale alpha down instead so small stars stay small and dim without
      // aliasing as the camera rotates.
      float intendedPx = max(aSize * uPixelRatio, 0.01);
      float renderedPx = max(intendedPx, uMinRenderPx);
      gl_PointSize = renderedPx;
      float sizeRatio = intendedPx / renderedPx;

      float elev = skyDir.y;
      float horizonFade = mix(1.0, smoothstep(0.0, ${SKY_HORIZON_HIGH.toFixed(3)}, elev), uHorizonFade);
      vAlpha = horizonFade * sizeRatio * sizeRatio;
      gl_Position = projectionMatrix * vec4(viewDir, 1.0);
      // Same far-plane pin as StarField.js and FlightStarStreak.js, so all
      // three sky layers sit at the same depth and none can be clipped.
      gl_Position.z = gl_Position.w * 0.99999;

      // Hidden field. Same stars as the sky; a smudge uncovers them along
      // wherever the cursor's actual recent path went. The mask moves. The
      // star directions do not.
      if (uReveal > 0.5) {
        if (gl_Position.w <= 0.0 || uMaskGain < 0.001) {
          vAlpha = 0.0;
          gl_PointSize = 0.0;
        } else {
          vec2 ndc = gl_Position.xy / gl_Position.w;
          vec2 starPx = vec2(
            (ndc.x * 0.5 + 0.5) * uViewport.x,
            (0.5 - ndc.y * 0.5) * uViewport.y
          );
          // Smooth union of soft circles along the cursor's recent path —
          // sample 0 is the newest (at/near the cursor), each older sample
          // shrinks with age. The shape is whatever the path actually did:
          // fast = long, slow = short, turning = curved. No synthetic bend.
          float mask = 0.0;
          for (int i = 0; i < ${CURSOR_TRAIL_SAMPLE_COUNT}; i += 1) {
            float age = uPathAge[i];
            if (age >= 1.0) continue;
            float r = max(uHeadRadius * pow(1.0 - age, uTaperExp), 0.6);
            float d = distance(starPx, uPathPx[i]);
            float smudge = exp(-(d * d) / (r * r) * 1.35);
            mask = max(mask, smudge);
          }
          float flicker = 1.0 + 0.05 * sin(uTime * 9.0 + starPx.x * 0.02 + starPx.y * 0.02);
          vAlpha *= mask * flicker * uMaskGain;
          if (vAlpha < 0.025) gl_PointSize = 0.0;
        }
      }
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uSpriteSoftness;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vBright;
    varying float vMag;

    void main() {
      // Same hard-core/soft-edge sprite as StarField.js, so a revealed star
      // reads identically to the ones already in the sky around it.
      float r = length(gl_PointCoord - vec2(0.5));
      float edge0 = max(0.0, 0.5 - uSpriteSoftness);
      float core = 1.0 - smoothstep(edge0, 0.5, r);
      if (core < 0.02) discard;
      gl_FragColor = vec4(vColor * vBright * vMag, core * vAlpha);
    }
  `
};

/** Lowest star elevation. The horizon fade hides them before this meets the ground. */
const SKY_ELEV_MIN = (1 * Math.PI) / 180;

/**
 * Upper sky only, on the same distant shell as the belt. Nothing at stage height.
 * @param {Float32Array} positions
 * @param {number} index
 */
function writeUpperSky(positions, index) {
  const i3 = index * 3;
  const theta = Math.random() * Math.PI * 2;
  const yMin = Math.sin(SKY_ELEV_MIN);
  const y = yMin + Math.random() * (1 - yMin);
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const radius = MILKY_WAY_DISTANCE * (0.985 + Math.random() * 0.03);
  positions[i3] = radius * ring * Math.cos(theta);
  positions[i3 + 1] = radius * y;
  positions[i3 + 2] = radius * ring * Math.sin(theta);
}

/**
 * Denser copy of the field stars, same shader and palette. Drawn only
 * where the cursor smudge is open. Directions stay fixed.
 * @param {number} [starCount]
 */
export function createRevealStarfield(starCount = 24000) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const brights = new Float32Array(starCount);
  const phases = new Float32Array(starCount);
  const freqs = new Float32Array(starCount);

  for (let i = 0; i < starCount; i += 1) {
    const i3 = i * 3;
    writeUpperSky(positions, i);
    const colIndex = Math.floor(Math.pow(Math.random(), 1.8) * STAR_PALETTE.length);
    const col = STAR_PALETTE[Math.min(colIndex, STAR_PALETTE.length - 1)];
    colors[i3] = col.r;
    colors[i3 + 1] = col.g;
    colors[i3 + 2] = col.b;
    // Same size/brightness distribution as StarField.js, so a revealed star
    // matches the ones already in the sky — brightness carries the
    // variation, size barely does.
    sizes[i] =
      STAR_FIELD_MIN_SIZE_PX +
      Math.pow(Math.random(), STAR_FIELD_SIZE_EXPONENT) * (STAR_FIELD_MAX_SIZE_PX - STAR_FIELD_MIN_SIZE_PX);
    brights[i] = STAR_FIELD_MIN_BRIGHT + Math.pow(Math.random(), 1.8) * (1 - STAR_FIELD_MIN_BRIGHT);
    phases[i] = Math.random() * Math.PI * 2;
    freqs[i] = 0.3 + Math.random() * 1.2;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aBright", new THREE.BufferAttribute(brights, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aFreq", new THREE.BufferAttribute(freqs, 1));

  const material = new THREE.ShaderMaterial({
    name: "RevealStarfield",
    uniforms: THREE.UniformsUtils.clone(StarfieldShader.uniforms),
    vertexShader: StarfieldShader.vertexShader,
    fragmentShader: StarfieldShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // Additive, matching StarField.js's far sky — NormalBlending read as a
    // visibly different, flatter "second sky" inside the reveal mask next to
    // the additive-glow base sky. Additive also reads as more intense,
    // which is the ask, without needing a separate brightness formula.
    blending: THREE.AdditiveBlending,
    toneMapped: true,
    fog: false
  });
  material.uniforms.uReveal.value = 1;
  material.uniforms.uMaskGain.value = 0;

  const stars = new THREE.Points(geometry, material);
  stars.name = "cursor-star-reveal";
  stars.frustumCulled = false;
  stars.renderOrder = 1;
  stars.visible = false;
  return stars;
}

/**
 * Uniform tick. uCameraPos is kept only for the lens's own angle-to-hole
 * math (the hole is a real, finite-distance object) — it no longer offsets
 * where any star is drawn; see the rotation-only projection above.
 * @param {THREE.Points} starfield
 * @param {THREE.Camera} camera
 * @param {number} time
 * @param {{ lensActive?: boolean, horizonFade?: boolean, pixelRatio?: number, parallax?: Parameters<typeof skyParallaxUniforms>[1] }} [opts]
 */
export function updateStarfield(starfield, camera, time, opts = {}) {
  const uniforms = starfield?.material?.uniforms;
  if (!uniforms) return;
  uniforms.uTime.value = time;
  uniforms.uCameraPos.value.copy(camera.position);
  if (opts.horizonFade != null) {
    uniforms.uHorizonFade.value = opts.horizonFade ? 1 : 0;
  }
  const lens = opts.lensActive
    ? blackHoleLensFromCamera(camera, uniforms.uBlackHolePos.value)
    : null;
  uniforms.uLensInner.value = lens ? lens.innerAngular : 0;
  uniforms.uLensOuter.value = lens ? lens.outerAngular : 0;
  uniforms.uLensStrength.value = lens ? lens.strength : 0;
  if (Number.isFinite(opts.pixelRatio)) {
    uniforms.uPixelRatio.value = opts.pixelRatio;
  }
  skyParallaxUniforms(uniforms, opts.parallax);
}
