import * as THREE from "three";
import { BLACK_HOLE_CENTER } from "../camera/BlackHoleCameraSequence.js";
import { blackHoleLensFromCamera, SKY_HORIZON_HIGH, SKY_HORIZON_LOW } from "./MilkyWayNebulaShader.js";

/**
 * One far sky, shared by the vignette ring and the black-hole flight. Stars
 * are at infinity: the vertex shader transforms each star's fixed world
 * direction by the camera's rotation only (never its position), so the sky
 * has zero parallax under any translation — drop, hop, zoom, or cursor
 * shear, exactly like real stars that far away. The same object, the same
 * draw, with no ring/flight branch to fall out of sync at the handoff. Made
 * of real star points only; there is no dome, gradient, or haze layer
 * behind them (see MilkyWayNebulaShader.js and NebulaCloudCluster.js's
 * removal for what used to paint that band).
 */

/** Historical shell radius — stars are now rendered at infinity (rotation-only projection, no draw distance), so this no longer feeds the shader. Kept as a labeled constant for debugStarFieldGeometry's diagnostic output. */
export const STAR_FIELD_RADIUS = 170;
/** Uniform-over-the-sphere population. */
export const STAR_FIELD_BASE_COUNT = 6000;
/** Band population, as a multiple of the base count. */
export const STAR_FIELD_BAND_RATIO = 2.5;
/** Band tilt off the horizontal plane, degrees. */
export const STAR_FIELD_BAND_TILT_DEG = 60;
/** Band latitude spread (gaussian sigma), degrees. */
export const STAR_FIELD_BAND_SIGMA_DEG = 8;
/** How much extra density the core swell adds at its center, as a multiple of the band's own density. */
export const STAR_FIELD_CORE_SWELL = 2.2;
/** Core swell angular half-width along the band, degrees. */
export const STAR_FIELD_CORE_WIDTH_DEG = 22;
/** Power-law exponent for base-field per-star brightness (higher = more skewed dim). Size no longer carries this variation — see STAR_FIELD_SIZE_EXPONENT. */
export const STAR_FIELD_BASE_EXPONENT = 1.7;
/** Power-law exponent for band brightness — higher than the base field so band stars read dimmer on average. */
export const STAR_FIELD_BAND_EXPONENT = 3.1;
/** Dimmest a star's own magnitude can be (0..1, multiplies color before uMaxBrightness). */
export const STAR_FIELD_MIN_BRIGHT = 0.3;
/** Peak raw fragment brightness (color × vBright × magnitude × core). Kept under 1 so no star alone can clear the bloom threshold (1.0). */
export const STAR_FIELD_MAX_BRIGHTNESS = 0.92;
/** Point size range, CSS px before the pixelRatio multiply. Most stars sit near the floor; size barely varies — brightness (aBright) carries the variation instead, so the field doesn't read as a scatter of discs. */
export const STAR_FIELD_MIN_SIZE_PX = 0.5;
export const STAR_FIELD_MAX_SIZE_PX = 1.5;
/** Power-law exponent for size: higher skews harder toward minSizePx (most stars small, a few up to max). */
export const STAR_FIELD_SIZE_EXPONENT = 6;
/** Sprite falloff: fraction of the point's radius that's a soft feather (the rest is a flat, fully-opaque core) — a small value reads as a point, not a disc. */
export const STAR_FIELD_SPRITE_SOFTNESS = 0.16;
/** Point sprites below this many device px alias as the camera rotates (sub-pixel coverage flickers on/off) — never rendered smaller; alpha is scaled down instead so a "small" star still reads small and dim without popping. */
export const STAR_FIELD_MIN_RENDER_PX = 2;
/** Twinkle: per-star brightness modulation, ± this fraction of base brightness. 0 disables. */
export const STAR_FIELD_TWINKLE_AMOUNT = 0.12;
/** Twinkle rate multiplier — each star's own random rate (0.3–1.5 Hz, baked into aFreq) times this. */
export const STAR_FIELD_TWINKLE_SPEED = 1;
/** Seconds for the horizon fade to move from off to on (or back) at the ring/flight handoff. */
export const STAR_FIELD_HORIZON_FADE_TIME = 1.1;

const STAR_PALETTE = [
  new THREE.Color(0x9bb0ff),
  new THREE.Color(0xaabfff),
  new THREE.Color(0xcad8ff),
  new THREE.Color(0xfff4ea),
  new THREE.Color(0xffd2a1),
  new THREE.Color(0xffa1a1)
];
const BAND_WHITE = new THREE.Color(0xffffff);
const BAND_COOL = new THREE.Color(0xd0dcff);
const BAND_WARM = new THREE.Color(0xfff0e0);

const StarFieldShader = {
  uniforms: {
    uTime: { value: 0 },
    uCameraPos: { value: new THREE.Vector3() },
    uBlackHolePos: { value: BLACK_HOLE_CENTER.clone() },
    uLensInner: { value: 0 },
    uLensOuter: { value: 0 },
    uLensStrength: { value: 0 },
    uLensActive: { value: 0 },
    uHorizonFade: { value: 0 },
    uPixelRatio: { value: 1 },
    uMaxBrightness: { value: STAR_FIELD_MAX_BRIGHTNESS },
    uMinSizePx: { value: STAR_FIELD_MIN_SIZE_PX },
    uMaxSizePx: { value: STAR_FIELD_MAX_SIZE_PX },
    uSpriteSoftness: { value: STAR_FIELD_SPRITE_SOFTNESS },
    uMinRenderPx: { value: STAR_FIELD_MIN_RENDER_PX },
    uTwinkleAmount: { value: STAR_FIELD_TWINKLE_AMOUNT },
    uTwinkleSpeed: { value: STAR_FIELD_TWINKLE_SPEED }
  },
  vertexShader: /* glsl */ `
    uniform vec3 uCameraPos;
    uniform vec3 uBlackHolePos;
    uniform float uLensInner;
    uniform float uLensOuter;
    uniform float uLensStrength;
    uniform float uLensActive;
    uniform float uPixelRatio;
    uniform float uMinSizePx;
    uniform float uMaxSizePx;
    uniform float uMinRenderPx;
    uniform float uTwinkleAmount;
    uniform float uTwinkleSpeed;
    uniform float uTime;

    attribute float aSize;
    attribute float aBright;
    attribute vec3 aColor;
    attribute float aPhase;
    attribute float aFreq;

    varying vec3 vColor;
    varying float vAlpha;
    varying float vBright;
    varying float vMag;
    varying float vPhase;
    varying float vElev;

    void main() {
      vColor = aColor;
      vPhase = aPhase;
      vMag = aBright;
      // Star direction is fixed in world space — these stars are at
      // infinity, so only the direction is ever meaningful.
      vec3 skyDir = normalize(position);
      vElev = skyDir.y;

      // Same annulus lensing as before, now on direction only — a star at
      // infinity has no distance for the bend math to use, only an angle
      // to the hole (a real, finite-distance object).
      if (uLensActive > 0.5 && uLensOuter > 0.002 && uLensStrength > 0.001) {
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

      // Rotation-only projection: transform the direction by the camera's
      // rotation alone (never its position), so this field has zero
      // parallax under any translation — drop, hop, zoom, or cursor shear.
      vec3 viewDir = mat3(viewMatrix) * skyDir;
      // Twinkle: a slow, per-star, never-zero brightness wobble — each star
      // has its own random rate (aFreq, 0.3-1.5 Hz) and phase, so the field
      // doesn't pulse in unison. uTwinkleAmount = 0 disables it outright.
      vBright = 1.0 + uTwinkleAmount * sin(uTime * aFreq * uTwinkleSpeed * 6.28318 + aPhase);
      float px = clamp(aSize, uMinSizePx, uMaxSizePx);
      // Sub-pixel point sprites alias as the camera rotates: a star under
      // ~1 device px covers a pixel inconsistently frame to frame, reading
      // as pop-in/pop-out rather than a steady dim point. Never render
      // smaller than uMinRenderPx; instead scale alpha by the squared ratio
      // of intended to rendered size, so a "small" star still reads small
      // and dim through reduced coverage, not through sub-pixel geometry.
      float intendedPx = max(px * uPixelRatio, 0.01);
      float renderedPx = max(intendedPx, uMinRenderPx);
      gl_PointSize = renderedPx;
      float sizeRatio = intendedPx / renderedPx;
      vAlpha = sizeRatio * sizeRatio;
      gl_Position = projectionMatrix * vec4(viewDir, 1.0);
      // Pin every sky point to the far plane — depthWrite is already off;
      // depthTest stays on so the black-hole disk still occludes stars.
      gl_Position.z = gl_Position.w * 0.99999;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uHorizonFade;
    uniform float uMaxBrightness;
    uniform float uSpriteSoftness;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vBright;
    varying float vMag;
    varying float vElev;

    void main() {
      // Hard, flat core out to (0.5 - softness), feathering only in the
      // outer softness-wide ring — a point, not a disc, even at a few
      // device pixels across.
      float r = length(gl_PointCoord - vec2(0.5));
      float edge0 = max(0.0, 0.5 - uSpriteSoftness);
      float core = 1.0 - smoothstep(edge0, 0.5, r);
      if (core < 0.02) discard;
      float horizon = mix(1.0, smoothstep(${SKY_HORIZON_LOW.toFixed(3)}, ${SKY_HORIZON_HIGH.toFixed(3)}, vElev), uHorizonFade);
      float alpha = core * vAlpha * horizon;
      if (alpha < 0.003) discard;
      gl_FragColor = vec4(vColor * vBright * vMag * uMaxBrightness, alpha);
    }
  `
};

function randGaussian() {
  // Box-Muller — good enough for a one-time star scatter, not a hot loop.
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @param {object} tuning
 */
function buildAttributes(tuning) {
  const baseCount = Math.max(0, Math.round(tuning.baseCount));
  const bandCount = Math.max(0, Math.round(tuning.baseCount * tuning.bandRatio));
  const count = baseCount + bandCount;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brights = new Float32Array(count);
  const phases = new Float32Array(count);
  const freqs = new Float32Array(count);

  const tiltRad = (tuning.bandTiltDeg * Math.PI) / 180;
  // Plane normal for the band's great circle, tilted off vertical.
  const planeN = new THREE.Vector3(Math.sin(tiltRad), Math.cos(tiltRad), 0).normalize();
  const up = Math.abs(planeN.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3().crossVectors(planeN, up).normalize();
  const bitangent = new THREE.Vector3().crossVectors(planeN, tangent).normalize();
  const sigmaRad = (tuning.bandSigmaDeg * Math.PI) / 180;
  const coreWidthRad = (tuning.coreWidthDeg * Math.PI) / 180;
  const dir = new THREE.Vector3();

  for (let i = 0; i < baseCount; i += 1) {
    const i3 = i * 3;
    // Uniform over the full sphere.
    const z = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    positions[i3] = r * Math.cos(theta);
    positions[i3 + 1] = z;
    positions[i3 + 2] = r * Math.sin(theta);

    const colIndex = Math.floor(Math.pow(Math.random(), 1.8) * STAR_PALETTE.length);
    const col = STAR_PALETTE[Math.min(colIndex, STAR_PALETTE.length - 1)];
    colors[i3] = col.r;
    colors[i3 + 1] = col.g;
    colors[i3 + 2] = col.b;
    sizes[i] =
      tuning.minSizePx +
      Math.pow(Math.random(), tuning.sizeExponent) * (tuning.maxSizePx - tuning.minSizePx);
    brights[i] =
      tuning.minBright + Math.pow(Math.random(), tuning.baseExponent) * (1 - tuning.minBright);
    phases[i] = Math.random() * Math.PI * 2;
    freqs[i] = 0.3 + Math.random() * 1.2;
  }

  for (let j = 0; j < bandCount; j += 1) {
    const i = baseCount + j;
    const i3 = i * 3;
    // Density swell: most stars land uniformly along the circle, a fraction
    // cluster near along=0 (the "core") via a tighter gaussian on top.
    let along;
    if (Math.random() < tuning.coreSwellChance) {
      along = randGaussian() * coreWidthRad * 0.5;
    } else {
      along = Math.random() * Math.PI * 2;
    }
    const across = randGaussian() * sigmaRad;
    dir
      .copy(tangent)
      .multiplyScalar(Math.cos(along))
      .addScaledVector(bitangent, Math.sin(along))
      .addScaledVector(planeN, Math.sin(across))
      .normalize();
    positions[i3] = dir.x;
    positions[i3 + 1] = dir.y;
    positions[i3 + 2] = dir.z;

    const roll = Math.random();
    const col = roll < 0.84 ? BAND_WHITE : roll < 0.92 ? BAND_COOL : BAND_WARM;
    colors[i3] = col.r;
    colors[i3 + 1] = col.g;
    colors[i3 + 2] = col.b;
    // Same size distribution as the base field — brightness carries the
    // band/base distinction now, not size (a steeper power law biases the
    // band's own magnitude draw toward dim).
    sizes[i] =
      tuning.minSizePx +
      Math.pow(Math.random(), tuning.sizeExponent) * (tuning.maxSizePx - tuning.minSizePx);
    brights[i] =
      tuning.minBright + Math.pow(Math.random(), tuning.bandExponent) * (1 - tuning.minBright);
    phases[i] = Math.random() * Math.PI * 2;
    freqs[i] = 0.3 + Math.random() * 1.2;
  }

  return { positions, colors, sizes, brights, phases, freqs, count };
}

/**
 * @param {Partial<typeof DEFAULT_TUNING>} [overrides]
 */
export function createStarField(overrides = {}) {
  const tuning = { ...DEFAULT_TUNING, ...overrides };
  const geometry = new THREE.BufferGeometry();
  const { positions, colors, sizes, brights, phases, freqs, count } = buildAttributes(tuning);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aBright", new THREE.BufferAttribute(brights, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aFreq", new THREE.BufferAttribute(freqs, 1));

  const material = new THREE.ShaderMaterial({
    name: "StarField",
    uniforms: THREE.UniformsUtils.clone(StarFieldShader.uniforms),
    vertexShader: StarFieldShader.vertexShader,
    fragmentShader: StarFieldShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
    fog: false
  });

  const points = new THREE.Points(geometry, material);
  points.name = "star-field";
  points.frustumCulled = false;
  points.renderOrder = 1;
  points.userData.tuning = tuning;
  points.userData.baseCount = Math.max(0, Math.round(tuning.baseCount));
  points.userData.bandCount = count - points.userData.baseCount;
  points.userData.horizonFadeCurrent = 0;
  points.userData.horizonFadeTarget = 0;
  return points;
}

/**
 * Rebuild the field's geometry in place from new tuning values — used by the
 * live tuner only; never called from the normal per-frame tick.
 * @param {THREE.Points} field
 * @param {Partial<typeof DEFAULT_TUNING>} overrides
 */
export function rebuildStarField(field, overrides) {
  if (!field) return;
  const tuning = { ...field.userData.tuning, ...overrides };
  field.userData.tuning = tuning;
  const { positions, colors, sizes, brights, phases, freqs, count } = buildAttributes(tuning);
  field.geometry.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aBright", new THREE.BufferAttribute(brights, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aFreq", new THREE.BufferAttribute(freqs, 1));
  field.geometry = geometry;
  field.userData.baseCount = Math.max(0, Math.round(tuning.baseCount));
  field.userData.bandCount = count - field.userData.baseCount;
  field.material.uniforms.uMaxBrightness.value = tuning.maxBrightness;
  field.material.uniforms.uMinSizePx.value = tuning.minSizePx;
  field.material.uniforms.uMaxSizePx.value = tuning.maxSizePx;
  field.material.uniforms.uSpriteSoftness.value = tuning.spriteSoftness;
  field.material.uniforms.uMinRenderPx.value = tuning.minRenderPx;
  field.material.uniforms.uTwinkleAmount.value = tuning.twinkleAmount;
  field.material.uniforms.uTwinkleSpeed.value = tuning.twinkleSpeed;
}

export const DEFAULT_TUNING = {
  baseCount: STAR_FIELD_BASE_COUNT,
  bandRatio: STAR_FIELD_BAND_RATIO,
  bandTiltDeg: STAR_FIELD_BAND_TILT_DEG,
  bandSigmaDeg: STAR_FIELD_BAND_SIGMA_DEG,
  coreSwellChance: 0.22,
  coreWidthDeg: STAR_FIELD_CORE_WIDTH_DEG,
  baseExponent: STAR_FIELD_BASE_EXPONENT,
  bandExponent: STAR_FIELD_BAND_EXPONENT,
  maxBrightness: STAR_FIELD_MAX_BRIGHTNESS,
  minBright: STAR_FIELD_MIN_BRIGHT,
  minSizePx: STAR_FIELD_MIN_SIZE_PX,
  maxSizePx: STAR_FIELD_MAX_SIZE_PX,
  sizeExponent: STAR_FIELD_SIZE_EXPONENT,
  spriteSoftness: STAR_FIELD_SPRITE_SOFTNESS,
  minRenderPx: STAR_FIELD_MIN_RENDER_PX,
  twinkleAmount: STAR_FIELD_TWINKLE_AMOUNT,
  twinkleSpeed: STAR_FIELD_TWINKLE_SPEED
};

/**
 * @param {THREE.Points} field
 * @param {THREE.Camera} camera
 * @param {number} time
 * @param {number} dt
 * @param {{
 *   horizonFadeOn?: boolean,
 *   lensActive?: boolean,
 *   pixelRatio?: number
 * }} [opts]
 */
export function updateStarField(field, camera, time, dt, opts = {}) {
  const uniforms = field?.material?.uniforms;
  if (!uniforms || !camera) return;
  // No per-frame re-centering: the shader projects by camera rotation only,
  // so this object stays at the scene origin permanently (set once at
  // creation) and can never slide out of sync with the camera's own move.
  uniforms.uTime.value = time;
  uniforms.uCameraPos.value.copy(camera.position);
  if (Number.isFinite(opts.pixelRatio)) uniforms.uPixelRatio.value = opts.pixelRatio;

  // Horizon fade ramps rather than snaps, so it does not pop at the
  // flight-to-ring handoff — the flight starts with it off, the ring holds
  // it on, and the transition between them is this smoothing, not a cut.
  field.userData.horizonFadeTarget = opts.horizonFadeOn ? 1 : 0;
  const rate = Math.min(1, Math.max(0, dt || 0) / Math.max(STAR_FIELD_HORIZON_FADE_TIME, 0.001));
  field.userData.horizonFadeCurrent +=
    (field.userData.horizonFadeTarget - field.userData.horizonFadeCurrent) * Math.min(1, rate * 3);
  uniforms.uHorizonFade.value = field.userData.horizonFadeCurrent;

  uniforms.uLensActive.value = opts.lensActive ? 1 : 0;
  const lens = opts.lensActive ? blackHoleLensFromCamera(camera, uniforms.uBlackHolePos.value) : null;
  uniforms.uLensInner.value = lens ? lens.innerAngular : 0;
  uniforms.uLensOuter.value = lens ? lens.outerAngular : 0;
  uniforms.uLensStrength.value = lens ? lens.strength : 0;
}
