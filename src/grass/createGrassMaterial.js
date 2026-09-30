/**
 * MeshStandard grass material — tip/base color + tip-weighted wind (vertex).
 * Receives scene neon / shadows. Shadow depth must share the same wind (customDepthMaterial).
 *
 * Lighting is intentionally uneven: per-blade hue/value jitter, world-space clump
 * AO, stronger root darkening, and a soft tip wrap so the meadow doesn’t read as
 * a flat neon wash.
 */

import * as THREE from "three";
import {
  GRASS_BLADE_STIFFNESS,
  GRASS_COLOR_BASE,
  GRASS_COLOR_TIP,
  GRASS_WIND_NOISE_SCALE,
  GRASS_WIND_SPEED,
  GRASS_WIND_STRENGTH
} from "./GrassConfig.js";

const WIND_GLSL = /* glsl */ `
uniform float uGrassTime;
uniform float uWindStrength;
uniform float uWindSpeed;
uniform float uWindNoiseScale;
uniform float uWindDetail;
uniform float uBladeStiffness;
uniform vec3 uWindDir;
attribute vec4 aBlade;
attribute vec2 aPhase;
varying float vGrassH;
varying float vBladeVar;
varying vec2 vBladeXZ;

float grassHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float grassNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = grassHash(i);
  float b = grassHash(i + vec2(1.0, 0.0));
  float c = grassHash(i + vec2(0.0, 1.0));
  float d = grassHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
`;

const WIND_VERTEX_BODY = /* glsl */ `
vGrassH = uv.y;
vBladeVar = aBlade.w;
vBladeXZ = instanceMatrix[3].xz;
float tip = pow(max(uv.y, 0.0), max(uBladeStiffness, 0.5));
float t = uGrassTime * uWindSpeed * (0.55 + aPhase.y) + aPhase.x;
// Low-frequency gust only — high-freq noise shimmered under neon (no MSAA).
float gust = sin(t) * 0.55 + sin(t * 0.31 + aPhase.x) * 0.45;
float n = 0.0;
if (uWindDetail > 0.5) {
  vec2 nUv = (instanceMatrix[3].xz) * uWindNoiseScale + vec2(t * 0.08, t * 0.06);
  n = grassNoise(nUv) * 2.0 - 1.0;
}
vec3 wdir = normalize(vec3(uWindDir.x, 0.0, uWindDir.z));
transformed += wdir * (uWindStrength * tip * (0.62 + 0.32 * gust + 0.1 * n));
transformed.x += aBlade.z * tip * 0.03;
`;

/**
 * @param {{ tipColor?: THREE.Color, baseColor?: THREE.Color }} [opts]
 */
export function createGrassMaterial(opts = {}) {
  const tipColor = opts.tipColor ?? new THREE.Color(GRASS_COLOR_TIP);
  const baseColor = opts.baseColor ?? new THREE.Color(GRASS_COLOR_BASE);

  const mat = new THREE.MeshStandardMaterial({
    color: tipColor.clone(),
    roughness: 1,
    metalness: 0,
    side: THREE.FrontSide,
    envMapIntensity: 0,
    depthWrite: false,
    depthFunc: THREE.EqualDepth,
    dithering: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });

  mat.userData.__grassWind = true;
  mat.userData.grassUniforms = {
    uGrassTime: { value: 0 },
    uWindStrength: { value: GRASS_WIND_STRENGTH },
    uWindSpeed: { value: GRASS_WIND_SPEED },
    uWindNoiseScale: { value: GRASS_WIND_NOISE_SCALE },
    uWindDetail: { value: 1 },
    uBladeStiffness: { value: GRASS_BLADE_STIFFNESS },
    uWindDir: { value: new THREE.Vector3(0.7, 0, 0.3).normalize() },
    uGrassTip: { value: tipColor.clone() },
    uGrassBase: { value: baseColor.clone() }
  };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.grassUniforms);
    mat.userData.__grassShader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
${WIND_GLSL}`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
${WIND_VERTEX_BODY}`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uGrassTip;
uniform vec3 uGrassBase;
varying float vGrassH;
varying float vBladeVar;
varying vec2 vBladeXZ;

float grassHashF(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float grassNoiseF(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = grassHashF(i);
  float b = grassHashF(i + vec2(1.0, 0.0));
  float c = grassHashF(i + vec2(0.0, 1.0));
  float d = grassHashF(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float hv = clamp(vGrassH, 0.0, 1.0);
float blade = clamp(vBladeVar, 0.0, 1.0);
float bladeB = grassHashF(vBladeXZ * 13.7 + vec2(blade * 17.0, 3.1));

// Per-blade hue/value — warm chartreuse ↔ cool deep green (breaks neon flat fill).
vec3 tipCool = uGrassTip * vec3(0.78, 1.02, 1.18);
vec3 tipWarm = uGrassTip * vec3(1.12, 1.05, 0.72);
vec3 tipVar = mix(tipCool, tipWarm, blade);
tipVar *= mix(0.72, 1.12, bladeB);

vec3 baseCool = uGrassBase * vec3(0.75, 0.95, 1.15);
vec3 baseWarm = uGrassBase * vec3(1.15, 1.05, 0.7);
vec3 baseVar = mix(baseCool, baseWarm, bladeB);
baseVar *= mix(0.55, 0.95, blade);

// Squared height ramp — denser shade in the lower half of each blade.
vec3 grassCol = mix(baseVar, tipVar, pow(hv, 1.15));

// Root occlusion + world clump AO (dense patches stay darker).
float rootAo = mix(0.32, 1.0, pow(hv, 1.45));
float clump =
  0.55 * grassNoiseF(vBladeXZ * 0.55) +
  0.30 * grassNoiseF(vBladeXZ * 1.4 + 9.0) +
  0.15 * grassNoiseF(vBladeXZ * 3.2 + 2.7);
float clumpAo = mix(0.58, 1.05, clump);
float tipFade = smoothstep(0.0, 0.14, 1.0 - hv);
diffuseColor.rgb = grassCol * rootAo * clumpAo * mix(0.78, 1.0, tipFade);
`
      )
      .replace(
        "#include <lights_physical_fragment>",
        `#include <lights_physical_fragment>
// Kill dielectric F0 — neon specular on thin blades crawls (composer MSAA = 0).
material.specularColor = vec3(0.0);
`
      );
  };

  mat.customProgramCacheKey = () => "grass-wind:v7-prepass";

  const prepass = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    depthFunc: THREE.LessEqualDepth,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  prepass.userData.__grassWind = true;
  prepass.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.grassUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
${WIND_GLSL}`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
${WIND_VERTEX_BODY}`
      );
  };
  prepass.customProgramCacheKey = () => "grass-prepass:v1";
  mat.userData.prepassMaterial = prepass;

  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.FrontSide
  });
  depthMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.grassUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
${WIND_GLSL}`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
${WIND_VERTEX_BODY}`
      );
  };
  depthMat.customProgramCacheKey = () => "grass-wind-depth:v6-rest";
  mat.userData.depthMaterial = depthMat;

  // PointLight shadows use MeshDistanceMaterial (cube map), not depth packing.
  const distMat = new THREE.MeshDistanceMaterial({
    side: THREE.FrontSide
  });
  distMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.grassUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
${WIND_GLSL}`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
${WIND_VERTEX_BODY}`
      );
  };
  distMat.customProgramCacheKey = () => "grass-wind-distance:v6-rest";
  mat.userData.distanceMaterial = distMat;

  mat.shadowSide = THREE.FrontSide;

  return mat;
}

/**
 * @param {THREE.MeshStandardMaterial} mat
 * @param {number} timeSec
 */
export function setGrassTime(mat, timeSec) {
  const u = mat?.userData?.grassUniforms;
  if (u?.uGrassTime) u.uGrassTime.value = timeSec;
}
