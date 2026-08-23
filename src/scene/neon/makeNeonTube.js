import * as THREE from "three";
import { neonGradientTexture } from "./neonGradientTexture.js";

/**
 * Open-ended cylinder — dark body, all glow from the emissive map.
 * Intensity is driven by the neon controller each frame.
 * @param {{ neonColors?: string[], tubeLength?: number }} def
 * @returns {THREE.Mesh}
 */
export function makeNeonTube(def) {
  const length = def.tubeLength ?? 4;
  const geo = new THREE.CylinderGeometry(0.06, 0.06, length, 24, 1, true);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: neonGradientTexture(def.neonColors ?? ["#00e5ff", "#ff2d95"]),
    emissiveIntensity: 0,
    roughness: 0.35,
    metalness: 0.1,
    envMapIntensity: 0,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "neon-tube";
  mesh.position.set(2.2, length * 0.5, 0.85);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
