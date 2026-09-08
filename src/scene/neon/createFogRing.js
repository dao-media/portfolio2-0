import * as THREE from "three";
import { NEON_FOG, NEON_FOG_LAYER } from "../stage/constants.js";

/**
 * Single annulus covering the vignette ring. World-XZ sampling lives in the material.
 * @param {THREE.Material} fogMaterial
 * @returns {THREE.Mesh}
 */
export function createFogRing(fogMaterial) {
  const geo = new THREE.RingGeometry(NEON_FOG.rInner, NEON_FOG.rOuter, 128, 4);
  const fog = new THREE.Mesh(geo, fogMaterial);
  fog.name = "neon-fog-ring";
  fog.rotation.x = -Math.PI / 2;
  fog.position.y = NEON_FOG.y;
  fog.renderOrder = 2;
  fog.castShadow = false;
  fog.receiveShadow = false;
  fog.layers.set(NEON_FOG_LAYER);
  fog.raycast = () => {};
  return fog;
}
