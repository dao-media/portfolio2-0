import * as THREE from "three";
import { BLACK_HOLE_CENTER } from "../camera/BlackHoleCameraSequence.js";
import { blackHoleLensFromCamera, SKY_HORIZON_HIGH, SKY_HORIZON_LOW } from "./MilkyWayNebulaShader.js";

/**
 * One far sky, shared by the vignette ring and the black-hole flight. The
 * shell is re-centered on the camera every frame with a fixed world
 * orientation — the same object, the same draw, with no ring/flight branch
 * to fall out of sync at the handoff. Made of real star points only; there
 * is no dome, gradient, or haze layer behind them (see MilkyWayNebulaShader.js
 * and NebulaCloudCluster.js's removal for what used to paint that band).
 */

/** Shell radius, meters from the camera. Stays inside CAM_FAR (220). */
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
/** Power-law exponent for base-field brightness (higher = more skewed dim). */
export const STAR_FIELD_BASE_EXPONENT = 1.7;
/** Power-law exponent for band brightness — higher than the base field so band stars read smaller/dimmer. */
export const STAR_FIELD_BAND_EXPONENT = 3.1;
/** Peak raw fragment brightness (color × vBright × core). Kept under 1 so no star alone can clear the bloom threshold (1.0). */
export const STAR_FIELD_MAX_BRIGHTNESS = 0.92;
/** Point size range, device pixels before the pixelRatio multiply. */
export const STAR_FIELD_MIN_SIZE_PX = 1;
export const STAR_FIELD_MAX_SIZE_PX = 8;
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
    uDropPitch: { value: 0 },
    uDropAxis: { value: new THREE.Vector3(1, 0, 0) },
    uMaxBrightness: { value: STAR_FIELD_MAX_BRIGHTNESS },
    uMinSizePx: { value: STAR_FIELD_MIN_SIZE_PX },
    uMaxSizePx: { value: STAR_FIELD_MAX_SIZE_PX }
  },
  vertexShader: /* glsl */ `
    uniform vec3 uCameraPos;
    uniform vec3 uBlackHolePos;
    uniform float uLensInner;
    uniform float uLensOuter;
    uniform float uLensStrength;
    uniform float uLensActive;
    uniform float uDropPitch;
    uniform vec3 uDropAxis;
    uniform float uPixelRatio;
    uniform float uMinSizePx;
    uniform float uMaxSizePx;
    uniform float uTime;

    attribute float aSize;
    attribute vec3 aColor;
    attribute float aPhase;

    varying vec3 vColor;
    varying float vAlpha;
    varying float vBright;
    varying float vPhase;
    varying float vElev;

    void main() {
      vColor = aColor;
      vPhase = aPhase;
      // Star direction is fixed in world space. The shell itself is
      // re-centered on the camera every frame (see updateStarField), so this
      // direction never parallaxes with camera translation — a world-locked
      // sky, exactly, on both the ring and the flight.
      vec3 skyDir = normalize(position);

      // Aerial drop only — the shell is glued to the camera during the
      // intro's vertical settle, so pitch it there; once landed this stays 0.
      if (abs(uDropPitch) > 0.0001) {
        float c = cos(uDropPitch);
        float s = sin(uDropPitch);
        skyDir = normalize(skyDir * c + cross(uDropAxis, skyDir) * s + uDropAxis * dot(uDropAxis, skyDir) * (1.0 - c));
      }
      vElev = skyDir.y;
      vec3 worldPos = uCameraPos + skyDir * ${STAR_FIELD_RADIUS.toFixed(1)};

      // Same annulus lensing as the flight's black-hole approach.
      if (uLensActive > 0.5 && uLensOuter > 0.002 && uLensStrength > 0.001) {
        vec3 camToStar = worldPos - uCameraPos;
        vec3 camToHole = uBlackHolePos - uCameraPos;
        float holeDist = length(camToHole);
        float starDist = length(camToStar);
        if (holeDist > 0.5 && starDist > 0.5 && dot(camToStar, camToHole) > holeDist * holeDist * 0.9) {
          vec3 holeDir = camToHole / holeDist;
          vec3 starDir = camToStar / starDist;
          float cosA = clamp(dot(starDir, holeDir), -1.0, 1.0);
          float ang = acos(cosA);
          if (ang > uLensInner && ang < uLensOuter) {
            float u = (ang - uLensInner) / max(uLensOuter - uLensInner, 1e-4);
            float onset = smoothstep(0.0, 0.08, u);
            float tight = smoothstep(1.0, 0.9, u);
            float bend = onset * tight * uLensStrength * 0.053;
            vec3 tangent = starDir - holeDir * cosA;
            float tLen = length(tangent);
            if (tLen > 1e-5) {
              vec3 outDir = tangent / tLen;
              float newAng = ang + bend;
              vec3 bent = normalize(holeDir * cos(newAng) + outDir * sin(newAng));
              worldPos = uCameraPos + bent * starDist;
            }
          }
        }
      }

      vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
      // Shimmer only — size is fixed so stars never blink in and out.
      vBright = 0.70 + 0.20 * sin(uTime * 5.5 + aPhase);
      float px = clamp(aSize, uMinSizePx, uMaxSizePx);
      gl_PointSize = max(1.0, px * uPixelRatio);
      vAlpha = 1.0;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uHorizonFade;
    uniform float uMaxBrightness;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vBright;
    varying float vElev;

    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = dot(coord, coord);
      float core = exp(-dist * 18.0);
      if (core < 0.04) discard;
      float horizon = mix(1.0, smoothstep(${SKY_HORIZON_LOW.toFixed(3)}, ${SKY_HORIZON_HIGH.toFixed(3)}, vElev), uHorizonFade);
      float alpha = core * vAlpha * horizon;
      if (alpha < 0.003) discard;
      gl_FragColor = vec4(vColor * vBright * uMaxBrightness, alpha);
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
  const phases = new Float32Array(count);

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
      Math.pow(Math.random(), tuning.baseExponent) * (tuning.maxSizePx - tuning.minSizePx);
    phases[i] = Math.random() * Math.PI * 2;
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
    // Mostly smaller and dimmer than the base field — a steeper power law
    // biases the draw toward the low end, and the size ceiling is lower.
    const bandMaxSize = tuning.minSizePx + (tuning.maxSizePx - tuning.minSizePx) * 0.55;
    sizes[i] =
      tuning.minSizePx + Math.pow(Math.random(), tuning.bandExponent) * (bandMaxSize - tuning.minSizePx);
    phases[i] = Math.random() * Math.PI * 2;
  }

  return { positions, colors, sizes, phases, count };
}

/**
 * @param {Partial<typeof DEFAULT_TUNING>} [overrides]
 */
export function createStarField(overrides = {}) {
  const tuning = { ...DEFAULT_TUNING, ...overrides };
  const geometry = new THREE.BufferGeometry();
  const { positions, colors, sizes, phases, count } = buildAttributes(tuning);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

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
  const { positions, colors, sizes, phases, count } = buildAttributes(tuning);
  field.geometry.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  field.geometry = geometry;
  field.userData.baseCount = Math.max(0, Math.round(tuning.baseCount));
  field.userData.bandCount = count - field.userData.baseCount;
  field.material.uniforms.uMaxBrightness.value = tuning.maxBrightness;
  field.material.uniforms.uMinSizePx.value = tuning.minSizePx;
  field.material.uniforms.uMaxSizePx.value = tuning.maxSizePx;
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
  minSizePx: STAR_FIELD_MIN_SIZE_PX,
  maxSizePx: STAR_FIELD_MAX_SIZE_PX
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
 *   dropPitch?: number,
 *   dropAxis?: THREE.Vector3
 * }} [opts]
 */
export function updateStarField(field, camera, time, dt, opts = {}) {
  const uniforms = field?.material?.uniforms;
  if (!uniforms || !camera) return;
  field.position.copy(camera.position);
  uniforms.uTime.value = time;
  uniforms.uCameraPos.value.copy(camera.position);
  uniforms.uDropPitch.value = opts.dropPitch || 0;
  if (opts.dropAxis) uniforms.uDropAxis.value.copy(opts.dropAxis);
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
