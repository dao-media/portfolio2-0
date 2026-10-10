import * as THREE from "three";
import { BLACK_HOLE_CENTER } from "../camera/BlackHoleCameraSequence.js";
import { blackHoleLensFromCamera, SKY_HORIZON_HIGH, SKY_HORIZON_LOW } from "./MilkyWayNebulaShader.js";

/**
 * One far sky, shared by the vignette ring and the black-hole flight. Made
 * of real star points only; there is no dome, gradient, or haze layer
 * behind them (see MilkyWayNebulaShader.js and NebulaCloudCluster.js's
 * removal for what used to paint that band).
 *
 * Pass Q Q3 — the sky is anchored to the arena at a finite radius. Each
 * star sits at `anchor + dir · R` (R = SKY_PARALLAX_RADIUS), so camera
 * translation (drop, hop, zoom) gives a small, real parallax. In the shader
 * that is `normalize(dir + invR · (anchor − cam))`; invR = 0 is the old
 * sky at infinity, exactly. The black-hole flight stays rotation-only
 * (invR = 0; FlightStarStreak owns flight parallax). At the handoff the
 * anchor starts ON the camera (identical to infinity, so no jump) and
 * moves to the arena centre in proportion to the camera's travel from its
 * handoff pose to its rest pose — a still camera never moves the sky, and
 * there is no height-synced sky rotation (`introSkyDropPitch` stays dead).
 * Lensing (angle to the hole) and the horizon fade (star elevation) still
 * use the star's own direction. Shift+S: live R slider.
 */

/** Pass Q Q3 — arena-anchored sky radius presets, metres (drift over the drop at Dane's window, 1837×1222: see README §9). */
export const SKY_PARALLAX_PRESETS = Object.freeze({ subtle: 1000, medium: 400, strong: 160 });
/** Live default — "medium" (Dane's pick, Pass R). */
export const SKY_PARALLAX_RADIUS = SKY_PARALLAX_PRESETS.medium;
/** Where the sky is anchored: the ring centre (CameraRig `center`). */
export const SKY_ARENA_CENTER = Object.freeze(new THREE.Vector3(0, 0, 0));

/**
 * CPU mirror of the shader's projection (probes use it): the world direction
 * a star of direction `dir` is drawn at from `camPos`.
 * @param {THREE.Vector3} out
 * @param {THREE.Vector3} dir unit star direction
 * @param {number} invR 1 / R (0 = at infinity)
 * @param {THREE.Vector3} anchor
 * @param {THREE.Vector3} camPos
 */
export function skyWorldDir(out, dir, invR, anchor, camPos) {
  // Component-wise so `out` may be `dir`.
  return out.set(dir.x + invR * (anchor.x - camPos.x), dir.y + invR * (anchor.y - camPos.y), dir.z + invR * (anchor.z - camPos.z)).normalize();
}

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
/** Minimum gaussian footprint, CSS px: sigma never drops under 0.4 × this (0.8 CSS px → FWHM ~1.9 CSS / ~3.3 device px at DSF 1.75), so sub-pixel motion cannot blink a star. Brightness carries the size difference (energy-conserving peak). */
export const STAR_FIELD_MIN_RENDER_PX = 2;
/** Twinkle: per-star brightness modulation, ± this fraction of base brightness. 0 disables. */
export const STAR_FIELD_TWINKLE_AMOUNT = 0.1;
/** Twinkle rate multiplier — each star's own random rate (0.2–0.8 Hz, baked into aFreq) times this. */
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
    uSkyAnchor: { value: new THREE.Vector3() },
    uSkyInvR: { value: 0 },
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
    uniform vec3 uSkyAnchor;
    uniform float uSkyInvR;
    uniform vec3 uBlackHolePos;
    uniform float uLensInner;
    uniform float uLensOuter;
    uniform float uLensStrength;
    uniform float uLensActive;
    uniform float uPixelRatio;
    uniform float uMinSizePx;
    uniform float uMaxSizePx;
    uniform float uMinRenderPx;
    uniform float uMaxBrightness;
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
    varying float vSigma;
    varying float vPeak;

    void main() {
      vColor = aColor;
      vPhase = aPhase;
      vMag = aBright;
      // Star direction, fixed in world space. Lensing and the horizon fade
      // read it; where the star is drawn also depends on the anchor below.
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

      // Arena-anchored at radius R (point = anchor + dir · R), seen from the
      // camera: invR = 0 is the rotation-only sky at infinity.
      vec3 drawDir = normalize(skyDir + uSkyInvR * (uSkyAnchor - uCameraPos));
      vec3 viewDir = mat3(viewMatrix) * drawDir;
      // Twinkle: a slow, per-star, never-zero brightness wobble — each star
      // has its own random rate (aFreq, 0.2-0.8 Hz) and phase, so the field
      // doesn't pulse in unison. uTwinkleAmount = 0 disables it outright.
      vBright = 1.0 + uTwinkleAmount * sin(uTime * aFreq * uTwinkleSpeed * 6.28318 + aPhase);
      float px = clamp(aSize, uMinSizePx, uMaxSizePx);
      // Pass J — analytic gaussian star. The old sprite was a flat-core disc
      // ~2 device px wide: rasterization snaps that footprint to whole
      // pixels, so a sub-pixel drift flipped pixels fully on or off and the
      // star blinked. Now the sprite is a gaussian evaluated against the
      // exact sub-pixel center (gl_PointCoord is relative to it).
      //  - Footprint is fixed in CSS px (sigma >= uMinRenderPx * 0.4 CSS px,
      //    i.e. >= ~3 device px FWHM at DSF 1.75–2), then converted to the
      //    pixels this pass actually renders into (uPixelRatio = composer
      //    draw width / CSS width). The rest-resolution ramp after a hop
      //    changes that ratio; the on-screen star must not change with it.
      //  - Peak = energy / (2 pi sigma^2) in CSS units, so the summed
      //    brightness is the same wherever the center lands: a sampled
      //    gaussian with sigma >= 0.5 px sums to within ~1.5% of its
      //    integral on any lattice offset — motion changes it smoothly.
      float sigmaCss = max(px * 0.5, uMinRenderPx * 0.4);
      float sigma = sigmaCss * uPixelRatio;
      vSigma = sigma;
      // Energy = what a flat disc of the intended CSS diameter emits.
      float energy = uMaxBrightness * aBright * 0.785398 * px * px;
      vPeak = energy / (6.2831853 * sigmaCss * sigmaCss);
      // 3.2 sigma each side + 1 px so the sprite never clips the tail.
      gl_PointSize = ceil(sigma * 6.4) + 1.0;
      vAlpha = 1.0;
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
    varying float vSigma;
    varying float vPeak;

    void main() {
      // Offset of this pixel center from the star's exact center, device px.
      vec2 d = (gl_PointCoord - vec2(0.5)) * (ceil(vSigma * 6.4) + 1.0);
      float g = exp(-dot(d, d) / (2.0 * vSigma * vSigma));
      float horizon = mix(1.0, smoothstep(${SKY_HORIZON_LOW.toFixed(3)}, ${SKY_HORIZON_HIGH.toFixed(3)}, vElev), uHorizonFade);
      float lum = vPeak * vBright * g * horizon * vAlpha;
      if (lum < 0.0005) discard;
      gl_FragColor = vec4(vColor * lum, 1.0);
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
    freqs[i] = 0.2 + Math.random() * 0.6;
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
    freqs[i] = 0.2 + Math.random() * 0.6;
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
 *   pixelRatio?: number,
 *   parallax?: { radius: number, handoffPos: THREE.Vector3 | null, travel: number } | null
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
  skyParallaxUniforms(uniforms, opts.parallax);
}

/**
 * Pass Q Q3 — the finite-R anchor for this frame (shared by StarField and
 * the cursor trail's reveal field). `travel` is the camera's 0..1 travel
 * from its handoff pose to its rest pose; null / radius ≤ 0 = at infinity.
 * @param {Record<string, THREE.IUniform>} uniforms
 * @param {{ radius: number, handoffPos: THREE.Vector3 | null, travel: number } | null | undefined} parallax
 */
export function skyParallaxUniforms(uniforms, parallax) {
  if (!uniforms.uSkyInvR) return;
  const r = parallax?.radius;
  if (!parallax || !(r > 0) || !Number.isFinite(r)) {
    uniforms.uSkyInvR.value = 0;
    return;
  }
  uniforms.uSkyInvR.value = 1 / r;
  const b = Math.min(1, Math.max(0, parallax.travel ?? 1));
  const a = uniforms.uSkyAnchor.value;
  if (parallax.handoffPos) a.copy(parallax.handoffPos).lerp(SKY_ARENA_CENTER, b);
  else a.copy(SKY_ARENA_CENTER);
}
