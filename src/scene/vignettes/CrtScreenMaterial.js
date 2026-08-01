import * as THREE from "three";

/** Peak phosphor brightness when the CRT is fully powered. */
export const CRT_SCREEN_GLOW_MAX = 0.72;

/**
 * CRT face — self-illuminated by the live canvas texture so the glass reads as
 * a lit phosphor panel. Room spill is handled separately by ScreenLightRig.
 *
 * Diffuse color stays black so scene lights don't wash white UI pages to
 * stark white; the image comes entirely from emissiveMap.
 */
export function createCrtScreenMaterial(texture) {
  const material = new THREE.MeshStandardMaterial({
    color: 0x000000,
    map: null,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: texture,
    emissiveIntensity: 0,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0,
    toneMapped: true,
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  material.name = "pc_3";
  material.userData.crtScreen = true;
  return material;
}

/**
 * Drive CRT phosphor brightness from power/boot progress.
 * @param {THREE.Material | null | undefined} material
 * @param {number} intensity 0 = off, ~CRT_SCREEN_GLOW_MAX = powered
 */
export function setCrtScreenGlow(material, intensity) {
  if (!material?.userData?.crtScreen) return;
  const next = THREE.MathUtils.clamp(intensity, 0, CRT_SCREEN_GLOW_MAX);
  if (Math.abs((material.emissiveIntensity ?? 0) - next) < 1e-4) return;
  material.emissiveIntensity = next;
}
