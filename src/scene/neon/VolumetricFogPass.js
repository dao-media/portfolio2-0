/**
 * Screen-space volumetric fog (Tier B) — shared by fog-lab and live stage.
 *
 * Structure reference (not a copy): Ameobea/three-volumetric-pass. Rewritten with
 * PointLight in-scatter. Technique: iquilezles.org/articles/fog, Maxime Heckel.
 *
 * Stage depth: FogDepthCapture BasicDepthPacking (`.r = 1.0 - windowZ`) via
 * setSceneDepth(..., { packed: true }). Lab: composer DepthTexture (packed: false).
 */
import * as THREE from "three";
import { Pass } from "postprocessing";
import { FOG_DEFAULTS, clampFogParams, FOG_IN_SCATTER_FILL_CAP, FOG_IN_SCATTER_CORE_KEEP } from "../../fog/fogConfig.js";

export const VOLUMETRIC_FOG_MAX_LIGHTS = 4;

const MARCH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const MARCH_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;

varying vec2 vUv;

uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float uDepthPacked;
uniform vec2 uResolution;
uniform vec3 uCameraPos;
uniform mat4 uProjectionMatrixInverse;
uniform mat4 uCameraMatrixWorld;
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uTime;

uniform float uFogMinY;
uniform float uFogMaxY;
uniform float uFogFadeOutRangeY;
uniform float uFogFadeOutPow;
uniform float uFogFloorFadeRangeY;
uniform float uHeightFogFactor;
uniform float uHeightFogStartY;
uniform float uHeightFogEndY;
uniform float uHeightFogExpK;
uniform float uHeightFogHazeStartY;
uniform float uHeightFogHazeRangeY;
uniform float uHeightFogHazeFloor;
uniform float uFogDensityMultiplier;
uniform float uDensityScale;
uniform float uNearTubeDensityBoost;
uniform float uNearTubeDensityRadius;
uniform float uFalloffNoiseWarp;
uniform float uFalloffCeilingJitter;
uniform float uFogDistFadeStart;
uniform float uFogDistFadeEnd;
uniform float uFogNearFadeStart;
uniform float uFogNearFadeEnd;
uniform float uNoiseYSlice;
uniform float uNoiseYScroll;
uniform float uBaseRaymarchStepCount;
uniform float uBaseMaxRayLength;
uniform float uNoiseBias;
uniform float uNoisePow;
uniform float uGlobalScale;
uniform vec2 uNoiseMovement;
uniform float uNoiseSpeed;

uniform vec3 uLightPos[4];
uniform vec3 uLightColor[4];
uniform float uLightIntensity[4];
uniform float uLightDistance[4];
uniform float uLightDecay[4];
uniform float uAmbient;
uniform float uInScatterFillCap;
uniform float uInScatterCoreKeep;
uniform float uEnabled;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float fbm3(vec3 p) {
  float amp = 0.5;
  float freq = 1.0;
  float sum = 0.0;
  float norm = 0.0;
  for (int i = 0; i < 3; i++) {
    sum += amp * valueNoise(p * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.17;
  }
  return sum / max(norm, 1e-4);
}

float bayer4(vec2 frag) {
  ivec2 p = ivec2(mod(frag, 4.0));
  int x = p.x;
  int y = p.y;
  int v = 0;
  if (y == 0) {
    if (x == 0) v = 0; else if (x == 1) v = 8; else if (x == 2) v = 2; else v = 10;
  } else if (y == 1) {
    if (x == 0) v = 12; else if (x == 1) v = 4; else if (x == 2) v = 14; else v = 6;
  } else if (y == 2) {
    if (x == 0) v = 3; else if (x == 1) v = 11; else if (x == 2) v = 1; else v = 9;
  } else {
    if (x == 0) v = 15; else if (x == 1) v = 7; else if (x == 2) v = 13; else v = 5;
  }
  return (float(v) + 0.5) / 16.0;
}

/** Window-Z in [0,1]. FogDepthCapture stores (1.0 - windowZ) when uDepthPacked=1. */
float readWindowDepth(vec2 uv) {
  float raw = texture2D(tDepth, uv).x;
  return uDepthPacked > 0.5 ? (1.0 - raw) : raw;
}

vec3 worldFromDepth(float windowDepth, vec2 uv) {
  vec4 clip = vec4(uv * 2.0 - 1.0, windowDepth * 2.0 - 1.0, 1.0);
  vec4 view = uProjectionMatrixInverse * clip;
  view /= view.w;
  vec4 world = uCameraMatrixWorld * view;
  return world.xyz;
}

float ceilingStartOffset(vec2 xz) {
  if (uFalloffCeilingJitter <= 1e-5) return 0.0;
  // Camera-relative XZ — wiggle in front of the lens.
  vec2 q = xz - uCameraPos.xz;
  float n =
    0.55 * valueNoise(vec3(q * 0.35, 3.1)) +
    0.45 * valueNoise(vec3(q * 0.9 + 17.0, 5.7));
  return (n * 2.0 - 1.0) * uFalloffCeilingJitter;
}

float heightFalloff(float y, float startYOffset) {
  float startY = uHeightFogStartY + startYOffset;

  // Live path: exponential — asymptotes, no hard top edge (probe-1 confirmed lid).
  // k ≤ 0 keeps the legacy smoothstep lid (A/B / rollback only).
  if (uHeightFogExpK > 1e-5) {
    float h = max(y - startY, 0.0);
    float amp = 0.35 + uHeightFogFactor;
    float dens = amp * exp(-h * uHeightFogExpK);
    // Soft mid-PC ceiling → haze above (smoothstep + residual floor; not a hard lid).
    if (uHeightFogHazeRangeY > 1e-5) {
      float hazeStart = uHeightFogHazeStartY + startYOffset;
      float gate = 1.0 - smoothstep(hazeStart, hazeStart + uHeightFogHazeRangeY, y);
      dens *= mix(max(uHeightFogHazeFloor, 0.0), 1.0, gate);
    }
    return dens;
  }
  float fadeTop = 1.0 - pow(
    smoothstep(uFogMaxY - uFogFadeOutRangeY, uFogMaxY, y),
    max(uFogFadeOutPow, 0.01)
  );
  float heightBoost = 0.0;
  float endY = uHeightFogEndY + startYOffset;
  if (y <= endY) {
    heightBoost = (1.0 - smoothstep(startY, endY, y)) * uHeightFogFactor;
  }
  return fadeTop * (0.35 + heightBoost);
}

float sampleDensity(vec3 worldPos, float startYOffset) {
  // Exp path: soft floor ramp + no hard fogMaxY zero (both slab ends were hard gates).
  // Legacy: hard zero below fogMinY / above fogMaxY.
  bool softSlab = uHeightFogExpK > 1e-5;
  if (!softSlab) {
    if (worldPos.y < uFogMinY) return 0.0;
    if (worldPos.y > uFogMaxY) return 0.0;
  }
  vec3 p = worldPos;
  // XZ wind (noiseMovementY here is the Z-component of the XZ scroll — not world Y).
  p.xz += uNoiseMovement * uTime * uNoiseSpeed;
  // Fill-side Y-slice (legacy lever; keep 0 — wrong fix for the horizon lid).
  p.x += worldPos.y * uNoiseYSlice;
  p.z += worldPos.y * uNoiseYSlice * 0.73;
  p.y += uNoiseYScroll * uTime * uNoiseSpeed;
  p *= uGlobalScale * 0.35;
  float n = fbm3(p);
  n = pow(clamp(n + uNoiseBias, 0.0, 1.0), max(uNoisePow, 0.01));
  // Optional fill Y-warp (also weak on the lid — prefer per-pixel ceiling offset).
  float yWarp = (n - 0.5) * uFalloffNoiseWarp;
  float dens = n * heightFalloff(worldPos.y + yWarp, startYOffset);
  // Bottom edge: fade into the floor instead of terminating on the depth plane.
  if (softSlab) {
    float fade = max(uFogFloorFadeRangeY, 1e-3);
    dens *= smoothstep(uFogMinY, uFogMinY + fade, worldPos.y);
  }
  float camDist = length(worldPos - uCameraPos);
  // Near-camera soft-in: thin fog in front of near subjects (stop-0 bust).
  if (uFogNearFadeEnd > 1e-3) {
    dens *= smoothstep(uFogNearFadeStart, uFogNearFadeEnd, camDist);
  }
  // Far-arc soft-out: kill density before baseMaxRayLength so the ray cutoff
  // is not a hard horizontal band (~42–50 m far arc vs 32 m march).
  if (uFogDistFadeEnd > uFogDistFadeStart + 1e-3) {
    dens *= 1.0 - smoothstep(uFogDistFadeStart, uFogDistFadeEnd, camDist);
  }
  // Volumetric halo — denser fog near active neon tubes (lit air around the source).
  if (uNearTubeDensityBoost > 1e-4 && uNearTubeDensityRadius > 1e-4) {
    float tubeProx = 0.0;
    for (int i = 0; i < 4; i++) {
      if (uLightIntensity[i] <= 1e-4) continue;
      float td = length(worldPos - uLightPos[i]);
      float g = exp( -(td * td) / max(2.0 * uNearTubeDensityRadius * uNearTubeDensityRadius, 1e-4) );
      tubeProx = max(tubeProx, g);
    }
    dens *= mix(1.0, 1.0 + uNearTubeDensityBoost, tubeProx);
  }
  return dens;
}

float lightAtten(vec3 p, vec3 lightPos, float intensity, float lightDist, float decay) {
  float d = length(lightPos - p);
  if (d >= lightDist || intensity <= 0.0) return 0.0;
  float nd = d / max(lightDist, 1e-3);
  float range = pow(max(1.0 - nd, 0.0), max(decay, 0.01));
  return intensity * range / (1.0 + d * d);
}

vec3 inScatter(vec3 p, float density) {
  vec3 s = vec3(uAmbient);
  for (int i = 0; i < 4; i++) {
    float a = lightAtten(p, uLightPos[i], uLightIntensity[i], uLightDistance[i], uLightDecay[i]);
    s += uLightColor[i] * a * 0.55;
  }
  // Full in-scatter whenever density is authored — do NOT multiply by uDensityScale.
  // Intro fade uses composite opacity instead (avoids bloom-crossing mid-ramp flash).
  s *= max(density, 0.05);
  float peak = max(s.r, max(s.g, s.b));
  float fillCap = max(uInScatterFillCap, 1e-3);
  if (peak > fillCap) {
    s *= fillCap / peak;
  }
  return s;
}

void clipYSlab(inout vec3 startPos, inout vec3 endPos) {
  // Exp path: density owns both soft lid and soft floor — skip ALL hard Y slab
  // clips (upper OR lower). Legacy keeps the binary slab.
  bool softSlab = uHeightFogExpK > 1e-5;
  if (softSlab) return;

  if ((startPos.y < uFogMinY && endPos.y < uFogMinY) ||
      (startPos.y > uFogMaxY && endPos.y > uFogMaxY)) {
    startPos = endPos;
    return;
  }
  vec3 dir = normalize(endPos - startPos);
  float len = length(endPos - startPos);
  if (len < 1e-5) return;

  if (startPos.y < uFogMinY) {
    float t = (uFogMinY - startPos.y) / dir.y;
    startPos += dir * t;
  }
  if (endPos.y < uFogMinY) {
    float t = (uFogMinY - startPos.y) / dir.y;
    endPos = startPos + dir * t;
  }
  if (endPos.y > uFogMaxY) {
    float t = (uFogMaxY - startPos.y) / dir.y;
    endPos = startPos + dir * t;
  }
  if (startPos.y > uFogMaxY) {
    float t = (uFogMaxY - startPos.y) / dir.y;
    startPos += dir * t;
  }
}

void main() {
  if (uEnabled < 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float windowDepth = readWindowDepth(vUv);
  vec3 worldPos = worldFromDepth(windowDepth, vUv);
  vec3 startPos = uCameraPos;
  vec3 endPos = worldPos;

  float sceneDist = length(endPos - startPos);
  if (sceneDist > uBaseMaxRayLength) {
    endPos = startPos + normalize(endPos - startPos) * uBaseMaxRayLength;
  }

  clipYSlab(startPos, endPos);
  if (distance(startPos, endPos) < 1e-4) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 rayDir = normalize(endPos - startPos);
  float rayLen = length(endPos - startPos);
  // World step spacing from the 32 m / 64 budget (~0.5 m). Short rays (near
  // screen-filling geo at stop 0) take fewer steps — never burn the full 64
  // micro-samples against a 3–10 m depth hit.
  //
  // CRITICAL (temporal stability): do NOT feed live ceil(rayLen/spacing) straight
  // into the march. Camera micro-jitter / depth flicker changes that integer
  // every frame → sample lattice jumps → accumulated density pulses (global
  // flashing + gray haze pop). Keep FIXED world spacing and QUANTIZE the step
  // count into buckets so near stays cheap but the count is frame-stable.
  float maxSteps = max(uBaseRaymarchStepCount, 1.0);
  float stepSpacing = uBaseMaxRayLength / maxSteps;
  float rawSteps = clamp(ceil(rayLen / max(stepSpacing, 1e-4)), 1.0, maxSteps);
  const float STEP_BUCKET = 8.0;
  float steps = min(
    maxSteps,
    max(STEP_BUCKET, floor(rawSteps / STEP_BUCKET + 0.5) * STEP_BUCKET)
  );
  float stepSize = stepSpacing;

  // Option 3: ONE ceiling offset per pixel (not per march sample).
  // Per-sample XZ jitter averages out along the ray and the lid stays flat.
  // Sample noise at a fixed distance along the ray so every view ray gets a
  // stable lid height that still varies across the frame (breaks the horizon line).
  vec2 lidXZ = (startPos + rayDir * 18.0).xz;
  float startYOffset = ceilingStartOffset(lidXZ);

  float jitter = bayer4(gl_FragCoord.xy);
  float t = jitter * stepSize;

  vec3 accum = vec3(0.0);
  float transmittance = 1.0;

  for (int i = 0; i < 128; i++) {
    if (float(i) >= steps || t > rayLen || transmittance < 0.02) break;
    vec3 p = startPos + rayDir * t;
    float dens = sampleDensity(p, startYOffset);
    float sigma = dens * uFogDensityMultiplier * uDensityScale;
    float absorb = 1.0 - exp(-sigma * stepSize);
    if (absorb > 1e-4) {
      vec3 lit = inScatter(p, dens);
      lit = max(lit, vec3(0.08, 0.09, 0.1) * dens * uDensityScale);
      accum += transmittance * absorb * lit;
      transmittance *= (1.0 - absorb);
    }
    t += stepSize;
  }

  float alpha = 1.0 - transmittance;
  gl_FragColor = vec4(accum, alpha);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;

varying vec2 vUv;

uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform sampler2D tFog;
uniform float uDepthPacked;
uniform vec2 uTexel;
uniform float uDepthSigma;
uniform float uEnabled;
uniform float uOutputDither;
uniform float uTime;
uniform float uCompositeOpacity;

float readRawDepth(vec2 uv) {
  return texture2D(tDepth, uv).x;
}

float bayer4(vec2 frag) {
  ivec2 p = ivec2(mod(frag, 4.0));
  int x = p.x;
  int y = p.y;
  int v = 0;
  if (y == 0) {
    if (x == 0) v = 0; else if (x == 1) v = 8; else if (x == 2) v = 2; else v = 10;
  } else if (y == 1) {
    if (x == 0) v = 12; else if (x == 1) v = 4; else if (x == 2) v = 14; else v = 6;
  } else if (y == 2) {
    if (x == 0) v = 3; else if (x == 1) v = 11; else if (x == 2) v = 1; else v = 9;
  } else {
    if (x == 0) v = 15; else if (x == 1) v = 7; else if (x == 2) v = 13; else v = 5;
  }
  return (float(v) + 0.5) / 16.0;
}

void main() {
  vec3 scene = texture2D(tDiffuse, vUv).rgb;
  if (uEnabled < 0.5) {
    gl_FragColor = vec4(scene, 1.0);
    return;
  }

  float centerDepth = readRawDepth(vUv);
  vec4 fog = vec4(0.0);
  float wSum = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 off = vec2(float(x), float(y)) * uTexel;
      vec2 uv = vUv + off;
      float d = readRawDepth(uv);
      float wDepth = exp(-abs(d - centerDepth) / max(uDepthSigma, 1e-5));
      float wSpatial = 1.0 - 0.35 * float(abs(x) + abs(y));
      float w = wDepth * wSpatial;
      fog += texture2D(tFog, uv) * w;
      wSum += w;
    }
  }
  fog /= max(wSum, 1e-4);

  // Screen-space output dither — breaks Mach banding on low-contrast alpha gradients.
  // Spatial-only (no uTime) — animated Bayer crawled as an edge/vignette strobe.
  // Separate from Bayer ray-start (along-ray). Grain is invisible at #070709; this is earlier.
  float dither = 0.0;
  if (uOutputDither > 1e-6) {
    float b = bayer4(gl_FragCoord.xy);
    dither = (b - 0.5) * uOutputDither;
  }
  float a = clamp(fog.a * uCompositeOpacity + dither, 0.0, 1.0);
  vec3 fogRgb = fog.rgb * uCompositeOpacity;
  vec3 outRgb = mix(scene, fogRgb, a);
  outRgb += dither;
  gl_FragColor = vec4(outRgb, 1.0);
}
`;

function makeFullscreenMaterial(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    name: "VolumetricFogMaterial",
    uniforms,
    vertexShader: MARCH_VERT,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
}

function emptyLights(n) {
  const pos = [];
  const color = [];
  const intensity = [];
  const distance = [];
  const decay = [];
  for (let i = 0; i < n; i++) {
    pos.push(new THREE.Vector3());
    color.push(new THREE.Color(1, 1, 1));
    intensity.push(0);
    distance.push(8);
    decay.push(2);
  }
  return { pos, color, intensity, distance, decay };
}

const _lightWorld = new THREE.Vector3();

export class VolumetricFogPass extends Pass {
  /**
   * @param {THREE.Camera} sceneCamera - Live stage/lab perspective camera (uniforms only).
   * @param {{
   *   halfRes?: boolean,
   *   useComposerDepth?: boolean,
   *   depthPacked?: boolean,
   *   params?: Record<string, boolean|number>
   * }} [options]
   */
  constructor(sceneCamera, options = {}) {
    // Pass keeps its own OrthographicCamera for the fullscreen triangle.
    // Do NOT overwrite `this.camera` with the scene camera — that broke
    // sizing/warmup paths and is the wrong camera for Pass.scene draws.
    super("VolumetricFogPass");
    this.sceneCamera = sceneCamera;
    this.needsSwap = true;
    /** Lab: composer DepthTexture. Stage: FogDepthCapture via setSceneDepth. */
    this.useComposerDepth = options.useComposerDepth !== false;
    this.needsDepthTexture = this.useComposerDepth;
    this.depthPacked = Boolean(options.depthPacked);
    this.halfRes = options.halfRes ?? FOG_DEFAULTS.halfRes;
    this.enabled = true;
    this._noiseFrozen = false;
    /** True once setSize ran with real drawing-buffer dims (≥1). */
    this._hasValidSize = false;

    this._depthTexture = null;
    this._time = 0;
    this._width = 0;
    this._height = 0;

    // Lazy-safe stub; setSize clamps to ≥1 before any draw.
    this.fogTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false
    });
    this.fogTarget.texture.name = "VolumetricFog";
    this.fogTarget.texture.generateMipmaps = false;

    const lights = emptyLights(VOLUMETRIC_FOG_MAX_LIGHTS);
    const d = FOG_DEFAULTS;

    this.marchMaterial = makeFullscreenMaterial(MARCH_FRAG, {
      tDiffuse: { value: null },
      tDepth: { value: null },
      uDepthPacked: { value: this.depthPacked ? 1 : 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCameraPos: { value: new THREE.Vector3() },
      uProjectionMatrixInverse: { value: new THREE.Matrix4() },
      uCameraMatrixWorld: { value: new THREE.Matrix4() },
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 120 },
      uTime: { value: 0 },
      uFogMinY: { value: d.fogMinY },
      uFogMaxY: { value: d.fogMaxY },
      uFogFadeOutRangeY: { value: d.fogFadeOutRangeY },
      uFogFadeOutPow: { value: d.fogFadeOutPow },
      uFogFloorFadeRangeY: { value: d.fogFloorFadeRangeY },
      uHeightFogFactor: { value: d.heightFogFactor },
      uHeightFogStartY: { value: d.heightFogStartY },
      uHeightFogEndY: { value: d.heightFogEndY },
      uHeightFogExpK: { value: d.heightFogExpK },
      uHeightFogHazeStartY: { value: d.heightFogHazeStartY },
      uHeightFogHazeRangeY: { value: d.heightFogHazeRangeY },
      uHeightFogHazeFloor: { value: d.heightFogHazeFloor },
      uFogDensityMultiplier: { value: d.fogDensityMultiplier },
      uDensityScale: { value: 1 },
      uNearTubeDensityBoost: { value: 1.65 },
      uNearTubeDensityRadius: { value: 1.35 },
      uFalloffNoiseWarp: { value: d.falloffNoiseWarp },
      uFalloffCeilingJitter: { value: d.falloffCeilingJitter },
      uFogDistFadeStart: { value: d.fogDistFadeStart },
      uFogDistFadeEnd: { value: d.fogDistFadeEnd },
      uFogNearFadeStart: { value: d.fogNearFadeStart },
      uFogNearFadeEnd: { value: d.fogNearFadeEnd },
      uNoiseYSlice: { value: d.noiseYSlice },
      uNoiseYScroll: { value: d.noiseYScroll },
      uBaseRaymarchStepCount: { value: d.baseRaymarchStepCount },
      uBaseMaxRayLength: { value: d.baseMaxRayLength },
      uNoiseBias: { value: d.noiseBias },
      uNoisePow: { value: d.noisePow },
      uGlobalScale: { value: d.globalScale },
      uNoiseMovement: { value: new THREE.Vector2(d.noiseMovementX, d.noiseMovementY) },
      uNoiseSpeed: { value: d.noiseSpeed },
      uLightPos: { value: lights.pos },
      uLightColor: { value: lights.color },
      uLightIntensity: { value: lights.intensity },
      uLightDistance: { value: lights.distance },
      uLightDecay: { value: lights.decay },
      uAmbient: { value: 0.008 },
      uInScatterFillCap: { value: FOG_IN_SCATTER_FILL_CAP },
      uInScatterCoreKeep: { value: FOG_IN_SCATTER_CORE_KEEP },
      uEnabled: { value: 1 }
    });

    this.compositeMaterial = makeFullscreenMaterial(COMPOSITE_FRAG, {
      tDiffuse: { value: null },
      tDepth: { value: null },
      tFog: { value: this.fogTarget.texture },
      uDepthPacked: { value: this.depthPacked ? 1 : 0 },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uDepthSigma: { value: 0.0025 },
      uEnabled: { value: 1 },
      uOutputDither: { value: d.outputDither },
      uTime: { value: 0 },
      uCompositeOpacity: { value: 1 }
    });

    this.fullscreenMaterial = this.compositeMaterial;
    this.setParams(options.params ?? FOG_DEFAULTS);
  }

  /**
   * @param {boolean} on
   */
  setEnabled(on) {
    this.enabled = Boolean(on);
    const v = this.enabled ? 1 : 0;
    this.marchMaterial.uniforms.uEnabled.value = v;
    this.compositeMaterial.uniforms.uEnabled.value = v;
  }

  /**
   * Multiplier on authored density (kept at 1 during intro — fade via composite opacity).
   * @param {number} scale
   */
  setDensityScale(scale) {
    const s = Number.isFinite(scale) ? Math.max(0, Math.min(1, scale)) : 1;
    this.marchMaterial.uniforms.uDensityScale.value = s;
  }

  /**
   * Intro land fade — composite opacity 0→1 with density held at full (no in-scatter ramp flash).
   * @param {number} opacity
   */
  setCompositeOpacity(opacity) {
    const o = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
    if (this.compositeMaterial?.uniforms?.uCompositeOpacity) {
      this.compositeMaterial.uniforms.uCompositeOpacity.value = o;
    }
  }

  /**
   * In-scatter fill luminance cap (hard clamp under bloom threshold).
   * `coreKeep` is accepted for API compat but unused by the march shader.
   * @param {{ fillCap?: number, coreKeep?: number }} [opts]
   */
  setInScatterCap(opts = {}) {
    const u = this.marchMaterial.uniforms;
    if (typeof opts.fillCap === "number") u.uInScatterFillCap.value = opts.fillCap;
    if (typeof opts.coreKeep === "number") u.uInScatterCoreKeep.value = opts.coreKeep;
  }

  /**
   * @param {Record<string, number|boolean>} params
   */
  setParams(params) {
    const p = clampFogParams(params);
    const u = this.marchMaterial.uniforms;
    u.uFogMinY.value = p.fogMinY;
    u.uFogMaxY.value = p.fogMaxY;
    u.uFogFadeOutRangeY.value = p.fogFadeOutRangeY;
    u.uFogFadeOutPow.value = p.fogFadeOutPow;
    u.uFogFloorFadeRangeY.value = p.fogFloorFadeRangeY;
    u.uHeightFogFactor.value = p.heightFogFactor;
    u.uHeightFogStartY.value = p.heightFogStartY;
    u.uHeightFogEndY.value = p.heightFogEndY;
    u.uHeightFogExpK.value = p.heightFogExpK;
    u.uHeightFogHazeStartY.value = p.heightFogHazeStartY;
    u.uHeightFogHazeRangeY.value = p.heightFogHazeRangeY;
    u.uHeightFogHazeFloor.value = p.heightFogHazeFloor;
    u.uFogDensityMultiplier.value = p.fogDensityMultiplier;
    u.uFalloffNoiseWarp.value = p.falloffNoiseWarp;
    u.uFalloffCeilingJitter.value = p.falloffCeilingJitter;
    u.uFogDistFadeStart.value = p.fogDistFadeStart;
    u.uFogDistFadeEnd.value = p.fogDistFadeEnd;
    u.uFogNearFadeStart.value = p.fogNearFadeStart;
    u.uFogNearFadeEnd.value = p.fogNearFadeEnd;
    u.uNoiseYSlice.value = p.noiseYSlice;
    u.uNoiseYScroll.value = p.noiseYScroll;
    u.uBaseRaymarchStepCount.value = p.baseRaymarchStepCount;
    u.uBaseMaxRayLength.value = p.baseMaxRayLength;
    u.uNoiseBias.value = p.noiseBias;
    u.uNoisePow.value = p.noisePow;
    u.uGlobalScale.value = p.globalScale;
    u.uNoiseSpeed.value = p.noiseSpeed;
    this.compositeMaterial.uniforms.uOutputDither.value = p.outputDither;
    if (this._noiseFrozen) {
      u.uNoiseMovement.value.set(0, 0);
      u.uNoiseSpeed.value = 0;
    } else {
      u.uNoiseMovement.value.set(p.noiseMovementX, p.noiseMovementY);
    }
    if (typeof p.halfRes === "boolean" && p.halfRes !== this.halfRes) {
      this.halfRes = p.halfRes;
      if (this._width >= 1 && this._height >= 1) {
        this.setSize(this._width, this._height);
      }
    }
  }

  /**
   * Freeze FBM drift (prefers-reduced-motion).
   * @param {boolean} frozen
   */
  setNoiseFrozen(frozen) {
    this._noiseFrozen = Boolean(frozen);
    if (this._noiseFrozen) {
      this.marchMaterial.uniforms.uTime.value = 0;
      this.marchMaterial.uniforms.uNoiseMovement.value.set(0, 0);
      this.marchMaterial.uniforms.uNoiseSpeed.value = 0;
    }
  }

  /**
   * @param {THREE.PointLight[]} lights
   */
  setLights(lights) {
    const u = this.marchMaterial.uniforms;
    for (let i = 0; i < VOLUMETRIC_FOG_MAX_LIGHTS; i++) {
      const L = lights?.[i];
      if (!L) {
        u.uLightIntensity.value[i] = 0;
        continue;
      }
      L.getWorldPosition(_lightWorld);
      u.uLightPos.value[i].copy(_lightWorld);
      u.uLightColor.value[i].copy(L.color);
      u.uLightIntensity.value[i] = L.intensity;
      u.uLightDistance.value[i] = L.distance || 8;
      u.uLightDecay.value[i] = L.decay ?? 2;
    }
    u.uLightIntensity.value = u.uLightIntensity.value.slice();
    u.uLightDistance.value = u.uLightDistance.value.slice();
    u.uLightDecay.value = u.uLightDecay.value.slice();
  }

  /**
   * @param {number} elapsedSeconds
   */
  setTime(elapsedSeconds) {
    if (this._noiseFrozen) {
      this.marchMaterial.uniforms.uTime.value = 0;
      this.compositeMaterial.uniforms.uTime.value = 0;
      return;
    }
    this._time = elapsedSeconds;
    this.marchMaterial.uniforms.uTime.value = elapsedSeconds;
    this.compositeMaterial.uniforms.uTime.value = elapsedSeconds;
  }

  /**
   * Composer DepthTexture callback (lab / useComposerDepth).
   * @param {THREE.Texture} depthTexture
   */
  setDepthTexture(depthTexture) {
    this._depthTexture = depthTexture;
    this.marchMaterial.uniforms.tDepth.value = depthTexture;
    this.compositeMaterial.uniforms.tDepth.value = depthTexture;
  }

  /**
   * Stage: FogDepthCapture color RT (BasicDepthPacking).
   * @param {THREE.Texture} texture
   * @param {{ packed?: boolean }} [opts]
   */
  setSceneDepth(texture, opts = {}) {
    this._depthTexture = texture;
    this.depthPacked = opts.packed !== false;
    const packed = this.depthPacked ? 1 : 0;
    this.marchMaterial.uniforms.uDepthPacked.value = packed;
    this.compositeMaterial.uniforms.uDepthPacked.value = packed;
    this.marchMaterial.uniforms.tDepth.value = texture;
    this.compositeMaterial.uniforms.tDepth.value = texture;
  }

  setSize(width, height) {
    const w = Math.max(0, Math.floor(Number(width) || 0));
    const h = Math.max(0, Math.floor(Number(height) || 0));
    // Composer may call setSize(0,0) before the canvas has a drawing buffer.
    // Refuse to allocate a zero-size attachment (GL_INVALID_FRAMEBUFFER_OPERATION).
    if (w < 1 || h < 1) {
      this._hasValidSize = false;
      return;
    }
    if (w === this._width && h === this._height && this._hasValidSize) return;
    this._width = w;
    this._height = h;
    const scale = this.halfRes ? 0.5 : 1;
    const fw = Math.max(1, Math.floor(w * scale));
    const fh = Math.max(1, Math.floor(h * scale));
    this.fogTarget.setSize(fw, fh);
    this.marchMaterial.uniforms.uResolution.value.set(fw, fh);
    this.compositeMaterial.uniforms.uTexel.value.set(1 / w, 1 / h);
    this._hasValidSize = this.fogTarget.width >= 1 && this.fogTarget.height >= 1;
  }

  /**
   * Sync from the live drawing buffer (DPR / work-quality safe).
   * @param {THREE.WebGLRenderer} renderer
   */
  ensureSizeFromRenderer(renderer) {
    if (!renderer) return;
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    this.setSize(size.x, size.y);
  }

  _updateCameraUniforms() {
    const cam = this.sceneCamera;
    if (!cam) return;
    const u = this.marchMaterial.uniforms;
    u.uCameraPos.value.setFromMatrixPosition(cam.matrixWorld);
    u.uProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse);
    u.uCameraMatrixWorld.value.copy(cam.matrixWorld);
    u.uCameraNear.value = cam.near;
    u.uCameraFar.value = cam.far;
  }

  render(renderer, inputBuffer, outputBuffer) {
    // Self-heal: DPR / work-quality / early composer setSize(0,0) races.
    this.ensureSizeFromRenderer(renderer);
    if (!this._hasValidSize || this.fogTarget.width < 1 || this.fogTarget.height < 1) {
      // Pass-through beauty so we never clear/draw an incomplete FB.
      this.fullscreenMaterial = this.compositeMaterial;
      this.compositeMaterial.uniforms.tDiffuse.value = inputBuffer?.texture ?? null;
      this.compositeMaterial.uniforms.uEnabled.value = 0;
      renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
      renderer.render(this.scene, this.camera);
      this.compositeMaterial.uniforms.uEnabled.value = this.enabled ? 1 : 0;
      return;
    }

    this._updateCameraUniforms();
    const mu = this.marchMaterial.uniforms;
    mu.tDiffuse.value = inputBuffer.texture;
    mu.tDepth.value = this._depthTexture;

    const cu = this.compositeMaterial.uniforms;
    cu.tDiffuse.value = inputBuffer.texture;
    cu.tDepth.value = this._depthTexture;
    cu.tFog.value = this.fogTarget.texture;

    this.fullscreenMaterial = this.marchMaterial;
    renderer.setRenderTarget(this.fogTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    this.fullscreenMaterial = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.fogTarget.dispose();
    this.marchMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}

/** @deprecated Use VolumetricFogPass — kept so old lab imports resolve during cutover. */
export { VolumetricFogPass as LabVolumetricFogPass };
