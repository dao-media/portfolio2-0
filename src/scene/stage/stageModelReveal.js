import * as THREE from "three";

/**
 * Set uniform opacity on every mesh under a vignette root (for silent mount + fade-in).
 * @param {THREE.Object3D} root
 * @param {number} opacity
 */
export function setGroupRenderOpacity(root, opacity) {
  const o = THREE.MathUtils.clamp(opacity, 0, 1);
  root.traverse((obj) => {
    if (!obj.isMesh?.material) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach((mat) => {
      if (!mat) return;
      mat.transparent = o < 0.999;
      mat.opacity = o;
      mat.depthWrite = o > 0.92;
      mat.needsUpdate = true;
    });
  });
}

/**
 * @param {THREE.Object3D} root
 */
export function hideGroupForReveal(root) {
  setGroupRenderOpacity(root, 0);
}

/**
 * Frame-rate independent opacity ramp.
 * @param {THREE.Object3D} root
 * @param {number} start — 0→1
 * @param {number} end — 0→1
 * @param {number} dt — seconds
 * @param {number} [duration=1.35]
 * @returns {number} current opacity
 */
export function stepGroupReveal(root, start, end, dt, duration = 1.35) {
  const span = Math.max(duration, 0.001);
  const next = start + (end - start) * Math.min(1, dt / span);
  const opacity = end > start ? Math.min(next, end) : Math.max(next, end);
  setGroupRenderOpacity(root, opacity);
  return opacity;
}
