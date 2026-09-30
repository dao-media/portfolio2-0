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
import { FOG_DEFAULTS, clampFogParams, FOG_IN_SCATTER_FILL_CAP, FOG_IN_SCATTER_CORE_KEEP } from "../fog/fogConfig.js";
import { VIGNETTE_FOG_LIGHT_DISTANCE, VIGNETTE_FOG_LIGHT_DECAY } from "../scene/stage/constants.js";

export const VOLUMETRIC_FOG_MAX_LIGHTS = 6;

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
uniform vec3 uVignetteCenter;
uniform float uVignetteRadius;
uniform float uVignetteFeather;
uniform float uVignetteFog;
uniform float uFalloffNoiseWarp;
uniform float uFalloffCeilingJitter;
uniform float uFogDistFadeStart;
uniform float uFogDistFadeEnd;
uniform float uFogNearFadeStart;
uniform float uFogNearFadeEnd;
uniform float uFogSoftContactRange;
uniform float uNoiseYSlice;
uniform float uNoiseYScroll;
uniform float uBaseRaymarchStepCount;
uniform float uBaseMaxRayLength;
uniform float uNoiseBias;
uniform float uNoisePow;
uniform float uGlobalScale;
uniform vec2 uNoiseMovement;
uniform float uNoiseSpeed;
uniform float uDigitalNoiseCell;
uniform float uDigitalNoiseAmount;
uniform float uSubjectWrapRadius;
uniform float uSubjectWrapBoost;
uniform float uSubjectWrapResidual;
uniform float uSubjectWrapMaxY;

uniform vec3 uLightPos[6];
uniform vec3 uLightColor[6];
uniform float uLightIntensity[6];
uniform float uLightDistance[6];
uniform float uLightDecay[6];
uniform vec3 uLightDir[6];
uniform float uLightCosInner[6];
uniform float uLightCosOuter[6];
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

float heightFalloff(float y, float startYOffset, float kScale) {
  float startY = uHeightFogStartY + startYOffset;
  float k = uHeightFogExpK * max(kScale, 0.05);

  // Live path: exponential — asymptotes, no hard top edge (probe-1 confirmed lid).
  // k ≤ 0 keeps the legacy smoothstep lid (A/B / rollback only).
  if (uHeightFogExpK > 1e-5) {
    float h = max(y - startY, 0.0);
    float amp = 0.35 + uHeightFogFactor;
    float dens = amp * exp(-h * k);
    // Soft bank top — double-smoothstep. Gate is nearly off live (hazeFloor≈0.92);
    // a low floor + narrow range stamps a waterline across bust/tree.
    if (uHeightFogHazeRangeY > 1e-5) {
      float hazeStart = uHeightFogHazeStartY + startYOffset;
      float t = smoothstep(hazeStart, hazeStart + uHeightFogHazeRangeY, y);
      t = t * t * (3.0 - 2.0 * t);
      float gate = 1.0 - t;
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
  float nRaw = fbm3(p);
  float nSoft = pow(clamp(nRaw + uNoiseBias, 0.0, 1.0), max(uNoisePow, 0.01));
  float n = nSoft;
  // Digital fog: density is hashed world cells (static / LED snow), not screen blocks.
  // Soft height/vignette gates still shape the bank; scene composite stays sharp.
  if (uDigitalNoiseCell > 1e-4 && uDigitalNoiseAmount > 1e-4) {
    vec3 wp = worldPos;
    wp.xz += uNoiseMovement * uTime * uNoiseSpeed * 0.2;
    wp.y += uNoiseYScroll * uTime * uNoiseSpeed * 0.2;
    vec3 id = floor(wp / uDigitalNoiseCell);
    float h = hash13(id + vec3(17.0, 9.0, 3.0));
    // Sparse bright cells — reads as digital noise, not a solid slab.
    float dig = step(0.58, h) * smoothstep(0.58, 1.0, h);
    // Soft FBM modulates which cells light up so the bank still has shape.
    dig *= mix(0.55, 1.0, nSoft);
    n = mix(nSoft, dig, clamp(uDigitalNoiseAmount, 0.0, 1.0));
  }
  // Optional fill Y-warp (also weak on the lid — prefer per-pixel ceiling offset).
  float yWarp = (nSoft - 0.5) * uFalloffNoiseWarp;
  float dens = n * heightFalloff(worldPos.y + yWarp, startYOffset, 1.0);
  // Floor fade applied AFTER vignette dens (below) — early apply was wiped by
  // dens = puff * hEnv * vMask and reintroduced a hard bottom lid (§20.9b).
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
  // Tube / subject proximity — applied AFTER vignette dens so boosts are not wiped.
  float tubeProx = 0.0;
  if (uNearTubeDensityBoost > 1e-4 && uNearTubeDensityRadius > 1e-4) {
    for (int i = 0; i < 6; i++) {
      if (uLightIntensity[i] <= 1e-4) continue;
      float td = length(worldPos - uLightPos[i]);
      float g = exp( -(td * td) / max(2.0 * uNearTubeDensityRadius * uNearTubeDensityRadius, 1e-4) );
      tubeProx = max(tubeProx, g);
    }
  }
  // Active-vignette bubble — fog fills the stop, dies in the void between stops.
  // uVignetteFog tracks neon arrive (0→1) so the volume preloads on approach.
  if (uVignetteFog > 1e-4 && uVignetteRadius > 1e-4) {
    float vDist = length(worldPos.xz - uVignetteCenter.xz);
    float vMask = 1.0 - smoothstep(
      uVignetteRadius,
      uVignetteRadius + max(uVignetteFeather, 1e-3),
      vDist
    );
    vMask *= uVignetteFog;
    // Billow from clumped noise (noisePow + globalScale) — dense pockets, thin between.
    // This is "scattered sections for depth" without geometry layers (no grazing lines).
    float nClump = pow(clamp(nRaw + uNoiseBias, 0.0, 1.0), max(uNoisePow, 0.01));
    float nBig = fbm3(p * 0.32 + 19.0);
    float nBigClump = pow(clamp(nBig + uNoiseBias, 0.0, 1.0), max(uNoisePow, 0.01));
    // Do NOT soften height falloff on subjects (kScale<1) — that paints a fog
    // waterline up the bust. Keep a low open-air bank; wrap is dens multiply only.
    float hEnv = heightFalloff(worldPos.y + yWarp * 1.35, startYOffset, 1.0);
    float billow = 1.0 - abs(nClump * 2.0 - 1.0);
    billow = pow(max(billow, 0.0), 2.4);
    float bigBillow = pow(max(1.0 - abs(nBigClump * 2.0 - 1.0), 0.0), 1.9);
    float puff = max(billow, bigBillow * 0.9);
    puff = smoothstep(0.28, 0.82, puff);
    // Digital cells can own the puff when trial is on (still shaped by hEnv).
    if (uDigitalNoiseAmount > 1e-4) {
      puff = mix(puff, n, clamp(uDigitalNoiseAmount, 0.0, 1.0));
    }
    dens = puff * hEnv * vMask * 0.95;

    float coreXZ = 1.0 - smoothstep(
      uSubjectWrapRadius * 0.05,
      max(uSubjectWrapRadius, 1e-3),
      vDist
    );
    if (uSubjectWrapBoost > 1e-4 && coreXZ > 1e-4) {
      float wrapPuff = mix(0.55, 1.0, nBigClump);
      if (uDigitalNoiseAmount > 1e-4) {
        wrapPuff = mix(wrapPuff, n, clamp(uDigitalNoiseAmount * 0.85, 0.0, 1.0));
      }
      dens *= mix(1.0, 1.0 + uSubjectWrapBoost * wrapPuff, coreXZ);
    }
    // Height-independent whisper of haze in the stop (no Y shelf).
    if (uSubjectWrapResidual > 1e-4 && coreXZ > 1e-4) {
      float residual = nSoft * vMask * coreXZ * uSubjectWrapResidual;
      dens = max(dens, residual);
    }

    dens *= mix(1.0, 1.0 + uNearTubeDensityBoost, tubeProx);
  } else {
    dens = 0.0;
  }
  // Soft floor AFTER vignette dens — must not run before the replace (was wiped).
  // Square the ramp so density stays near-zero through the grazing shelf band
  // (world-Y ~0.5–1.0 / screen row ~599) without a second mid-frame lid.
  if (softSlab) {
    float fade = max(uFogFloorFadeRangeY, 1e-3);
    float fl = smoothstep(uFogMinY, uFogMinY + fade, worldPos.y);
    dens *= fl * fl;
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

float spotCone(vec3 p, vec3 lightPos, vec3 lightDir, float cosInner, float cosOuter) {
  // cosOuter < 0 → treat as point (full sphere)
  if (cosOuter < 0.0) return 1.0;
  vec3 toP = normalize(p - lightPos);
  float cd = dot(toP, normalize(lightDir));
  return smoothstep(cosOuter, cosInner, cd);
}

vec3 inScatter(vec3 p, float density) {
  // Density is applied via absorb in the march — do NOT multiply L by dens here
  // (that dens² path erased unlit vignette fill while neon-lit air still showed).
  if (density <= 1e-5) return vec3(0.0);
  vec3 s = vec3(uAmbient);
  for (int i = 0; i < 6; i++) {
    float a = lightAtten(p, uLightPos[i], uLightIntensity[i], uLightDistance[i], uLightDecay[i]);
    a *= spotCone(p, uLightPos[i], uLightDir[i], uLightCosInner[i], uLightCosOuter[i]);
    s += uLightColor[i] * a * 0.55;
  }
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
  // True opaque hit (bust / tree / floor) vs far-arc ray capped at max length.
  bool hitOpaque = sceneDist <= uBaseMaxRayLength + 1e-3;
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
  // Subject-plane exclusion: fog stays in FRONT of the opaque hit (and on
  // miss rays behind/around). ClearGap + fade keep dens off the bust depth
  // plane so the height bank cannot paint a waterline on the mesh.
  float shell = (hitOpaque && uFogSoftContactRange > 1e-3)
    ? uFogSoftContactRange
    : 0.0;
  float clearGap = shell * 0.45;
  float fogReach = (shell > 1e-3)
    ? max(rayLen - clearGap, stepSize)
    : rayLen;
  float fadeStart = max(fogReach - max(shell - clearGap, shell * 0.5), 0.0);

  for (int i = 0; i < 128; i++) {
    if (float(i) >= steps || t > fogReach || transmittance < 0.02) break;
    vec3 p = startPos + rayDir * t;
    float dens = sampleDensity(p, startYOffset);
    if (shell > 1e-3) {
      dens *= 1.0 - smoothstep(fadeStart, fogReach, t);
    }
    float sigma = dens * uFogDensityMultiplier * uDensityScale;
    float absorb = 1.0 - exp(-sigma * stepSize);
    if (absorb > 1e-4) {
      vec3 lit = inScatter(p, dens);
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
uniform float uFogEdgeSoft;
uniform float uFogEdgeDepth;
uniform float uEnabled;
uniform float uOutputDither;
uniform float uOutputPixelSize;
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

vec2 quantizeFogUv(vec2 uv, float pixelSize) {
  if (pixelSize < 0.5) return uv;
  vec2 res = vec2(
    1.0 / max(uTexel.x, 1e-6),
    1.0 / max(uTexel.y, 1e-6)
  );
  return (floor(uv * res / pixelSize) + 0.5) * pixelSize / res;
}

void main() {
  vec3 scene = texture2D(tDiffuse, vUv).rgb;
  if (uEnabled < 0.5) {
    gl_FragColor = vec4(scene, 1.0);
    return;
  }

  vec4 fog = vec4(0.0);
  float pix = uOutputPixelSize;
  if (pix > 0.5) {
    // Stylized chunky fog — snap UV, skip bilateral (blur fights the look).
    fog = texture2D(tFog, quantizeFogUv(vUv, pix));
  } else {
    float centerDepth = readRawDepth(vUv);
    float wSum = 0.0;
    // Soft bilateral (smoothstep depth weights, 5×5). Hard exp reject + soft-
    // contact dens→0 made the bust luminance cliff. threejs-shaders: soft edges
    // via smoothstep; AAA: keep silhouettes readable against fog (no clearGap).
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        vec2 off = vec2(float(x), float(y)) * uTexel;
        vec2 uv = vUv + off;
        float d = readRawDepth(uv);
        float wDepth = 1.0 - smoothstep(0.0, max(uDepthSigma * 6.0, 1e-5), abs(d - centerDepth));
        float wSpatial = 1.0 - 0.18 * float(abs(x) + abs(y));
        float w = max(wDepth * wSpatial, 0.0);
        fog += texture2D(tFog, uv) * w;
        wSum += w;
      }
    }
    fog /= max(wSum, 1e-4);

    // Near-side bleed of background fog onto subject rims — softstep mix so the
    // fog layer meets the bust as a transparency gradient, not a hard cut.
    if (uFogEdgeSoft > 1e-4 && uFogEdgeDepth > 1e-6) {
      vec4 farFog = vec4(0.0);
      float farW = 0.0;
      float edge = 0.0;
      for (int y = -4; y <= 4; y++) {
        for (int x = -4; x <= 4; x++) {
          if (x == 0 && y == 0) continue;
          vec2 uv = vUv + vec2(float(x), float(y)) * uTexel;
          float d = readRawDepth(uv);
          float farther = smoothstep(0.0, uFogEdgeDepth, centerDepth - d);
          if (farther < 1e-4) continue;
          float distW = 1.0 - 0.08 * float(abs(x) + abs(y));
          float w = farther * distW;
          farFog += texture2D(tFog, uv) * w;
          farW += w;
          edge = max(edge, farther * distW);
        }
      }
      if (farW > 1e-4) {
        farFog /= farW;
        // Dissolve-style soft edge (threejs-shaders): smoothstep the mix weight.
        float mixA = smoothstep(0.0, 1.0, edge) * uFogEdgeSoft;
        fog = mix(fog, farFog, clamp(mixA, 0.0, 1.0));
      }
    }
  }

  // Screen-space output dither — breaks Mach banding on low-contrast alpha gradients.
  // Spatial-only (no uTime) — animated Bayer crawled as an edge/vignette strobe.
  // Separate from Bayer ray-start (along-ray). Grain is invisible at #070709; this is earlier.
  float dither = 0.0;
  if (uOutputDither > 1e-6 && pix < 0.5) {
    float b = bayer4(gl_FragCoord.xy);
    dither = (b - 0.5) * uOutputDither;
  }
  float a = clamp(fog.a * uCompositeOpacity + dither, 0.0, 1.0);
  // March stores premultiplied in-scatter in .rgb and (1 - transmittance) in .a.
  // Must be: scene * T + accum — NOT mix(scene, accum, a) which multiplies accum
  // by alpha a second time and erases thin haze (reads as “fog gone”).
  vec3 fogRgb = fog.rgb * uCompositeOpacity;
  vec3 outRgb = scene * (1.0 - a) + fogRgb;
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
  const dir = [];
  const cosInner = [];
  const cosOuter = [];
  for (let i = 0; i < n; i++) {
    pos.push(new THREE.Vector3());
    color.push(new THREE.Color(1, 1, 1));
    intensity.push(0);
    distance.push(8);
    decay.push(2);
    dir.push(new THREE.Vector3(0, -1, 0));
    cosInner.push(-1);
    cosOuter.push(-1);
  }
  return { pos, color, intensity, distance, decay, dir, cosInner, cosOuter };
}

const _lightWorld = new THREE.Vector3();
const _lightTarget = new THREE.Vector3();
const _lightDir = new THREE.Vector3();

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
      uNearTubeDensityBoost: { value: 1.25 },
      uNearTubeDensityRadius: { value: 2.8 },
      uVignetteCenter: { value: new THREE.Vector3() },
      uVignetteRadius: { value: 8.0 },
      uVignetteFeather: { value: 2.2 },
      uVignetteFog: { value: 0 },
      uFalloffNoiseWarp: { value: d.falloffNoiseWarp },
      uFalloffCeilingJitter: { value: d.falloffCeilingJitter },
      uFogDistFadeStart: { value: d.fogDistFadeStart },
      uFogDistFadeEnd: { value: d.fogDistFadeEnd },
      uFogNearFadeStart: { value: d.fogNearFadeStart },
      uFogNearFadeEnd: { value: d.fogNearFadeEnd },
      uFogSoftContactRange: { value: d.fogSoftContactRange ?? 0 },
      uNoiseYSlice: { value: d.noiseYSlice },
      uNoiseYScroll: { value: d.noiseYScroll },
      uBaseRaymarchStepCount: { value: d.baseRaymarchStepCount },
      uBaseMaxRayLength: { value: d.baseMaxRayLength },
      uNoiseBias: { value: d.noiseBias },
      uNoisePow: { value: d.noisePow },
      uGlobalScale: { value: d.globalScale },
      uNoiseMovement: { value: new THREE.Vector2(d.noiseMovementX, d.noiseMovementY) },
      uNoiseSpeed: { value: d.noiseSpeed },
      uDigitalNoiseCell: { value: d.digitalNoiseCell ?? 0 },
      uDigitalNoiseAmount: { value: d.digitalNoiseAmount ?? 0 },
      uSubjectWrapRadius: { value: d.subjectWrapRadius ?? 0 },
      uSubjectWrapBoost: { value: d.subjectWrapBoost ?? 0 },
      uSubjectWrapResidual: { value: d.subjectWrapResidual ?? 0 },
      uSubjectWrapMaxY: { value: d.subjectWrapMaxY ?? 3.8 },
      uLightPos: { value: lights.pos },
      uLightColor: { value: lights.color },
      uLightIntensity: { value: lights.intensity },
      uLightDistance: { value: lights.distance },
      uLightDecay: { value: lights.decay },
      uLightDir: { value: lights.dir },
      uLightCosInner: { value: lights.cosInner },
      uLightCosOuter: { value: lights.cosOuter },
      // Unlit fill inside the vignette bubble — neon still owns the hot core.
      uAmbient: { value: 0.28 },
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
      uDepthSigma: { value: 0.004 },
      uFogEdgeSoft: { value: d.fogEdgeSoft ?? 0 },
      uFogEdgeDepth: { value: d.fogEdgeDepth ?? 0.008 },
      uEnabled: { value: 1 },
      uOutputDither: { value: d.outputDither },
      uOutputPixelSize: { value: d.outputPixelSize ?? 0 },
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
    u.uFogSoftContactRange.value = p.fogSoftContactRange ?? 0;
    u.uNoiseYSlice.value = p.noiseYSlice;
    u.uNoiseYScroll.value = p.noiseYScroll;
    u.uBaseRaymarchStepCount.value = p.baseRaymarchStepCount;
    u.uBaseMaxRayLength.value = p.baseMaxRayLength;
    u.uNoiseBias.value = p.noiseBias;
    u.uNoisePow.value = p.noisePow;
    u.uGlobalScale.value = p.globalScale;
    u.uNoiseSpeed.value = p.noiseSpeed;
    this.compositeMaterial.uniforms.uOutputDither.value = p.outputDither;
    this.compositeMaterial.uniforms.uOutputPixelSize.value = p.outputPixelSize ?? 0;
    if (this.compositeMaterial.uniforms.uFogEdgeSoft) {
      this.compositeMaterial.uniforms.uFogEdgeSoft.value = p.fogEdgeSoft ?? 0;
    }
    if (this.compositeMaterial.uniforms.uFogEdgeDepth) {
      this.compositeMaterial.uniforms.uFogEdgeDepth.value = p.fogEdgeDepth ?? 0.004;
    }
    u.uDigitalNoiseCell.value = p.digitalNoiseCell ?? 0;
    u.uDigitalNoiseAmount.value = p.digitalNoiseAmount ?? 0;
    u.uSubjectWrapRadius.value = p.subjectWrapRadius ?? 0;
    u.uSubjectWrapBoost.value = p.subjectWrapBoost ?? 0;
    if (u.uSubjectWrapResidual) u.uSubjectWrapResidual.value = p.subjectWrapResidual ?? 0;
    u.uSubjectWrapMaxY.value = p.subjectWrapMaxY ?? 3.8;
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
   * Accent shaft: tighten near-tube volumetric density (stock defaults 1.65 / 1.35).
   * @param {{ boost?: number, radius?: number } | null} tune
   */
  setNearTubeDensity(tune) {
    const u = this.marchMaterial.uniforms;
    if (!tune) {
      u.uNearTubeDensityBoost.value = 1.25;
      u.uNearTubeDensityRadius.value = 2.8;
      return;
    }
    if (typeof tune.boost === "number" && Number.isFinite(tune.boost)) {
      u.uNearTubeDensityBoost.value = tune.boost;
    }
    if (typeof tune.radius === "number" && Number.isFinite(tune.radius)) {
      u.uNearTubeDensityRadius.value = tune.radius;
    }
  }

  /**
   * Active-stop fog volume. Density fills the vignette bubble; `level` tracks neon
   * arrive (0→1) so fog preloads on approach and dies when leaving.
   * @param {{
   *   center?: THREE.Vector3 | null,
   *   level?: number,
   *   radius?: number,
   *   feather?: number
   * }} [opts]
   */
  setVignetteFog(opts = {}) {
    const u = this.marchMaterial.uniforms;
    if (!u?.uVignetteFog) return;
    if (opts.center) {
      u.uVignetteCenter.value.copy(opts.center);
      u.uVignetteCenter.value.y = 0;
    }
    if (typeof opts.level === "number" && Number.isFinite(opts.level)) {
      u.uVignetteFog.value = Math.max(0, Math.min(1, opts.level));
    }
    if (typeof opts.radius === "number" && Number.isFinite(opts.radius)) {
      u.uVignetteRadius.value = Math.max(0.5, opts.radius);
    }
    if (typeof opts.feather === "number" && Number.isFinite(opts.feather)) {
      u.uVignetteFeather.value = Math.max(0.05, opts.feather);
    }
  }

  /**
   * Neon PointLights + optional accent SpotLights (cone in-scatter).
   * @param {Array<THREE.PointLight | THREE.SpotLight | null | undefined>} lights
   */
  setLights(lights) {
    const u = this.marchMaterial.uniforms;
    for (let i = 0; i < VOLUMETRIC_FOG_MAX_LIGHTS; i++) {
      const L = lights?.[i];
      if (!L) {
        u.uLightIntensity.value[i] = 0;
        u.uLightCosOuter.value[i] = -1;
        continue;
      }
      L.getWorldPosition(_lightWorld);
      u.uLightPos.value[i].copy(_lightWorld);
      u.uLightColor.value[i].copy(L.color);
      // Prefer arrive-only fogIntensity so strike flicker does not strobe haze.
      const fogI = L.userData?.fogIntensity;
      u.uLightIntensity.value[i] =
        typeof fogI === "number" && Number.isFinite(fogI) ? fogI : L.intensity;
      // Point neon: mesh light stays short/steep (floor bubble); fog scatter
      // uses longer reach + softer decay so haze across the stop picks up color.
      if (L.isSpotLight) {
        u.uLightDistance.value[i] = L.distance || 8;
        u.uLightDecay.value[i] = L.decay ?? 2;
      } else {
        u.uLightDistance.value[i] = Math.max(L.distance || 0, VIGNETTE_FOG_LIGHT_DISTANCE);
        u.uLightDecay.value[i] = VIGNETTE_FOG_LIGHT_DECAY;
      }

      if (L.isSpotLight) {
        L.target.getWorldPosition(_lightTarget);
        _lightDir.copy(_lightTarget).sub(_lightWorld);
        if (_lightDir.lengthSq() < 1e-8) _lightDir.set(0, -1, 0);
        else _lightDir.normalize();
        u.uLightDir.value[i].copy(_lightDir);
        const outer = Math.cos(L.angle);
        const inner = Math.cos(L.angle * (1 - Math.min(1, Math.max(0, L.penumbra))));
        u.uLightCosInner.value[i] = inner;
        u.uLightCosOuter.value[i] = outer;
      } else {
        u.uLightDir.value[i].set(0, -1, 0);
        u.uLightCosInner.value[i] = -1;
        u.uLightCosOuter.value[i] = -1;
      }
    }
    u.uLightIntensity.value = u.uLightIntensity.value.slice();
    u.uLightDistance.value = u.uLightDistance.value.slice();
    u.uLightDecay.value = u.uLightDecay.value.slice();
    u.uLightCosInner.value = u.uLightCosInner.value.slice();
    u.uLightCosOuter.value = u.uLightCosOuter.value.slice();
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
