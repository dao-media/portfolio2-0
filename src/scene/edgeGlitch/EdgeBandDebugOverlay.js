import * as THREE from "three";
import {
  EDGE_GLITCH_ARM_OUTER,
  EDGE_GLITCH_ARM_RAMP,
  EDGE_GLITCH_BAND_OUTER,
  EDGE_GLITCH_LOCAL_BASE,
  EDGE_GLITCH_LOCAL_GROWTH
} from "./constants.js";
import { EDGE_GLITCH_MASK_GLSL } from "./edgeGlitchMask.glsl.js";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uEdgeSdf;
uniform float uBandOuter;
uniform float uArmOuter;
uniform float uArmRamp;
uniform float uLocalBase;
uniform float uLocalGrowth;
uniform vec2 uCursorUv;
uniform float uCursorActive;
uniform float uEnabled;
varying vec2 vUv;

${EDGE_GLITCH_MASK_GLSL}

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
  if (uEnabled < 0.5 || uCursorActive < 0.5) discard;
  float dCursor = texture2D(uEdgeSdf, uCursorUv).r;
  if (dCursor <= 0.0) discard;
  float tArm = clamp(1.0 - dCursor / max(uArmOuter, 1e-6), 0.0, 1.0);
  float proximity = pow(tArm, max(uArmRamp, 0.01));
  if (proximity < 1e-4) discard;
  vec2 edgeUv = projectToEdge(uCursorUv);
  float localR = uLocalBase + uLocalGrowth * proximity;
  float where = edgeGlitchWhere(vUv, uEdgeSdf, edgeUv, uBandOuter, localR);
  if (where < 1e-3) discard;

  vec3 farC = vec3(0.05, 0.15, 0.55);
  vec3 midC = vec3(0.0, 0.85, 0.95);
  vec3 edgeC = vec3(1.0, 0.92, 0.15);
  float a = where * proximity;
  vec3 col = mix(farC, midC, smoothstep(0.0, 0.55, a));
  col = mix(col, edgeC, smoothstep(0.55, 1.0, a));
  gl_FragColor = vec4(col, a * 0.9);
}
`;

/** Fullscreen debug — local rim × soft falloff from edge origin. */
export function createEdgeBandDebugOverlay(sdfTexture, opts = {}) {
  const uniforms = {
    uEdgeSdf: { value: sdfTexture },
    uBandOuter: { value: opts.bandOuter ?? EDGE_GLITCH_BAND_OUTER },
    uArmOuter: { value: opts.armOuter ?? EDGE_GLITCH_ARM_OUTER },
    uArmRamp: { value: opts.armRamp ?? EDGE_GLITCH_ARM_RAMP },
    uLocalBase: { value: opts.localBase ?? EDGE_GLITCH_LOCAL_BASE },
    uLocalGrowth: { value: opts.localGrowth ?? EDGE_GLITCH_LOCAL_GROWTH },
    uCursorUv: { value: new THREE.Vector2(-1, -1) },
    uCursorActive: { value: 0 },
    uEnabled: { value: 1 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.name = "edge-glitch-debug-overlay";
  mesh.frustumCulled = false;
  mesh.renderOrder = 998;
  mesh.userData.__edgeGlitchOverlay = true;
  mesh.userData.uniforms = uniforms;
  return mesh;
}
