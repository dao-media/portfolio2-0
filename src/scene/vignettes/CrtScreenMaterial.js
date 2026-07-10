import * as THREE from "three";

/** Flat CRT face — no bloom, glare shell, or in-shader glow. */
export function createCrtScreenMaterial(texture) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: true,
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  material.name = "pc_3";
  return material;
}
