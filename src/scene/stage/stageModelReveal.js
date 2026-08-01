import * as THREE from "three";

/**
 * Set uniform opacity on every mesh under a vignette root (for silent mount + fade-in).
 * Preserves each material's authored transparent / depthWrite / alphaTest when the
 * fade completes — clobbering those (e.g. forcing opaque) kills Sidekick keyboard
 * label decals that need cutout / non-depth-writing blend.
 * @param {THREE.Object3D} root
 * @param {number} opacity
 */
export function setGroupRenderOpacity(root, opacity) {
  if (!root) return;
  const o = THREE.MathUtils.clamp(opacity, 0, 1);

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach((mat) => {
      if (!mat) return;
      if (!mat.userData.__revealAuthored) {
        mat.userData.__revealAuthored = {
          transparent: Boolean(mat.transparent),
          depthWrite: mat.depthWrite !== false,
          depthTest: mat.depthTest !== false,
          opacity: Number.isFinite(mat.opacity) ? mat.opacity : 1,
          alphaTest: Number.isFinite(mat.alphaTest) ? mat.alphaTest : 0
        };
      }
      const auth = mat.userData.__revealAuthored;

      if (o >= 0.999) {
        const modeChanged =
          mat.transparent !== auth.transparent ||
          mat.depthWrite !== auth.depthWrite ||
          mat.depthTest !== auth.depthTest ||
          mat.alphaTest !== auth.alphaTest;
        mat.transparent = auth.transparent;
        mat.depthWrite = auth.depthWrite;
        mat.depthTest = auth.depthTest;
        mat.alphaTest = auth.alphaTest;
        mat.opacity = auth.opacity;
        if (modeChanged) mat.needsUpdate = true;
        return;
      }

      // Mid-fade: must be transparent; suppress depth writes until nearly opaque.
      const nextTransparent = true;
      const nextDepthWrite = o > 0.92 ? auth.depthWrite : false;
      const nextOpacity = auth.opacity * o;
      const modeChanged =
        mat.transparent !== nextTransparent || mat.depthWrite !== nextDepthWrite;
      mat.transparent = nextTransparent;
      mat.depthWrite = nextDepthWrite;
      mat.opacity = nextOpacity;
      if (modeChanged) mat.needsUpdate = true;
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
