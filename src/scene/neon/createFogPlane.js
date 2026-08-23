import * as THREE from "three";
import { NEON_FOG, NEON_FOG_LAYER } from "../stage/constants.js";

/**
 * Ground fog card — 1×1 segments; all detail is in the baked atlas.
 * @param {THREE.Material} fogMaterial
 * @param {number} [size]
 * @returns {THREE.Mesh}
 */
export function createFogPlane(fogMaterial, size = NEON_FOG.planeSize) {
  const fog = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), fogMaterial);
  fog.name = "neon-fog";
  fog.rotation.x = -Math.PI / 2;
  fog.position.y = NEON_FOG.y;
  fog.renderOrder = 2;
  fog.castShadow = false;
  fog.receiveShadow = false;
  fog.layers.set(NEON_FOG_LAYER);
  fog.raycast = () => {};
  return fog;
}
