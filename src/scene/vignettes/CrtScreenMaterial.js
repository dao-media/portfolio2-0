import * as THREE from "three";

/** Peak phosphor brightness when the CRT is fully powered (under bloom threshold). */
export const CRT_SCREEN_GLOW_MAX = 0.72;
/**
 * Brief warm-up peak during power-on — clears `NEON_BLOOM.luminanceThreshold` 1.0
 * so bloom reads a phosphor flash, then settles to CRT_SCREEN_GLOW_MAX.
 */
export const CRT_SCREEN_GLOW_BLOOM_PEAK = 1.35;

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
    // Do not pull the phosphor in front of the plastic bezel — that overdraw
    // reads as a view-dependent diagonal overhang.
    polygonOffset: false
  });
  material.name = "pc_3";
  material.userData.crtScreen = true;
  return material;
}

/**
 * Drive CRT phosphor brightness from power/boot progress.
 * @param {THREE.Material | null | undefined} material
 * @param {number} intensity 0 = off; steady ≤ CRT_SCREEN_GLOW_MAX; warm-up may exceed 1.0
 * @param {{ allowBloomPeak?: boolean }} [opts]
 */
export function setCrtScreenGlow(material, intensity, opts = {}) {
  if (!material?.userData?.crtScreen) return;
  const max = opts.allowBloomPeak ? CRT_SCREEN_GLOW_BLOOM_PEAK : CRT_SCREEN_GLOW_MAX;
  const next = THREE.MathUtils.clamp(intensity, 0, max);
  if (Math.abs((material.emissiveIntensity ?? 0) - next) < 1e-4) return;
  material.emissiveIntensity = next;
}

/**
 * Power-on warm-up envelope: rises through bloom threshold, then settles to steady.
 * @param {number} bootProgress 0..1
 * @returns {number} emissive intensity
 */
export function crtPowerOnGlowIntensity(bootProgress) {
  const p = THREE.MathUtils.clamp(bootProgress, 0, 1);
  if (p <= 0) return 0;
  if (p >= 1) return CRT_SCREEN_GLOW_MAX;
  // Peak near 35% of the boot, then ease down to steady.
  const peakAt = 0.35;
  if (p < peakAt) {
    const t = p / peakAt;
    return THREE.MathUtils.lerp(0, CRT_SCREEN_GLOW_BLOOM_PEAK, t * t);
  }
  const t = (p - peakAt) / (1 - peakAt);
  const ease = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(CRT_SCREEN_GLOW_BLOOM_PEAK, CRT_SCREEN_GLOW_MAX, ease);
}
