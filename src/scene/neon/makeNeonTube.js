import * as THREE from "three";
import { neonGradientTexture } from "./neonGradientTexture.js";
import { NEON_CORE_MAX } from "../stage/constants.js";

/**
 * Neon tube Option 1 — glow via bloom, no Additive volume shell:
 *   1. Dark MeshStandard sleeve (physical body)
 *   2. Thin opaque glow skin just outside the sleeve (ShaderMaterial) —
 *      per-hue luminance boost so every color clears bloom threshold ~equally.
 *      Opaque + depthWrite — does not punch a dark “vacuum” over maple/bust.
 *
 * Root mesh is the GLOW SKIN so NeonSystem can drive intensity + scroll.
 *
 * @param {{ neonColors?: string[], tubeLength?: number, neonTubeXZ?: [number, number] }} def
 * @returns {THREE.Mesh}
 */
export function makeNeonTube(def) {
  const length = def.tubeLength ?? 4;
  const gradient = neonGradientTexture(def.neonColors ?? ["#00e5ff", "#ff2d95"]);

  const glowMat = makeNeonCoreMaterial(gradient);
  glowMat.userData.neonGradientMap = gradient;
  glowMat.userData.neonCoreMax = NEON_CORE_MAX;

  // Outer glow skin — must sit outside the opaque sleeve or bloom never sees it.
  const glowR = 0.068;
  const glowGeo = new THREE.CylinderGeometry(glowR, glowR, length, 24, 1, true);
  const mesh = new THREE.Mesh(glowGeo, glowMat);
  mesh.name = "neon-tube";
  mesh.userData.tubeLength = length;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;

  // PHYSICAL BODY — slightly inside the glow skin.
  const bodyGeo = new THREE.CylinderGeometry(0.058, 0.058, length, 24, 1, true);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.055, 0.06, 0.075),
    roughness: 0.38,
    metalness: 0.22,
    envMapIntensity: 0.55,
    side: THREE.DoubleSide
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = "neon-tube-body";
  body.castShadow = false;
  body.receiveShadow = true;
  body.renderOrder = 0;
  glowMat.userData.neonBodyMat = bodyMat;
  mesh.add(body);

  const xz = def.neonTubeXZ ?? [2.2, 0.85];
  mesh.position.set(xz[0], length * 0.5, xz[1]);
  return mesh;
}

/**
 * Opaque glow skin: equal bloom luminance across hues (no Additive volume).
 * @param {THREE.Texture} gradient
 */
function makeNeonCoreMaterial(gradient) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: gradient },
      uLevel: { value: 0 },
      uBloomTarget: { value: NEON_CORE_MAX },
      uMapOffset: { value: new THREE.Vector2(0, 0) }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D map;
      uniform float uLevel;
      uniform float uBloomTarget;
      uniform vec2 uMapOffset;
      varying vec2 vUv;

      void main() {
        if (uLevel < 1e-4) discard;
        float vv = fract(vUv.y + uMapOffset.y);
        vec3 ramp = texture2D(map, vec2(0.5, vv)).rgb;
        float peakC = max(ramp.r, max(ramp.g, ramp.b));
        vec3 hue = ramp / max(peakC, 1e-3);
        float L = dot(hue, vec3(0.2126, 0.7152, 0.0722));
        float boost = uBloomTarget / max(L, 0.05);
        vec3 col = hue * boost * uLevel;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false
  });
}
