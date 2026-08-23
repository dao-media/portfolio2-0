import * as THREE from "three";
import CustomShaderMaterial from "three-custom-shader-material/vanilla";
import { FOG_ATLAS, NEON_FOG } from "../stage/constants.js";

/**
 * Lit grey fog — hue comes from the neon PointLight, density from the baked atlas.
 * Do not write csm_FragColor; that bypasses lighting.
 */
export function createFogMaterial({ reducedMotion = false } = {}) {
  const { N, TILE, COLS, ROWS } = FOG_ATLAS;
  const albedo = NEON_FOG.albedo;

  return new CustomShaderMaterial({
    baseMaterial: THREE.MeshStandardMaterial,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: true,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0,
    toneMapped: true,
    side: THREE.FrontSide,
    uniforms: {
      uFogAtlas: { value: null },
      uTime: { value: 0 },
      uSpeed: { value: reducedMotion ? 0 : NEON_FOG.speed },
      uAlbedo: { value: new THREE.Color(albedo, albedo, albedo) },
      uOpacity: { value: NEON_FOG.opacity }
    },
    vertexShader: /* glsl */ `
      varying vec2 vFogUv;
      void main() {
        vFogUv = uv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vFogUv;
      uniform sampler2D uFogAtlas;
      uniform float uTime, uSpeed, uOpacity;
      uniform vec3 uAlbedo;
      const float N = ${N}.0;
      const float COLS = ${COLS}.0;
      const float ROWS = ${ROWS}.0;
      const float TILE = ${TILE}.0;

      vec2 cellUV(vec2 uv, float idx) {
        float col = mod(idx, COLS);
        float row = floor(idx / COLS);
        vec2 inset = uv * (1.0 - 2.0 / TILE) + (1.0 / TILE);
        return (vec2(col, row) + inset) / vec2(COLS, ROWS);
      }

      void main() {
        float t  = fract(uTime * uSpeed * 0.1) * N;
        float i0 = floor(t);
        float i1 = mod(i0 + 1.0, N);
        float b  = fract(t);
        float n  = mix(
          texture2D(uFogAtlas, cellUV(vFogUv, i0)).r,
          texture2D(uFogAtlas, cellUV(vFogUv, i1)).r,
          b
        );

        float d    = distance(vFogUv, vec2(0.5));
        float edge = 1.0 - smoothstep(0.35, 0.5, d);

        csm_DiffuseColor = vec4(uAlbedo, n * edge * uOpacity);
      }
    `
  });
}
