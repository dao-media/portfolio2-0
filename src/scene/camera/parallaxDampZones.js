import * as THREE from "three";
import { springTo } from "./spring.js";

/**
 * Soften cursor parallax while the pointer is over registered meshes/DOM.
 *
 * Usage:
 *   zones.registerMesh("pc-monitor", { meshes, scale: 0.2 });
 *   // each frame, after raycast hover:
 *   zones.setActive(pointerOverZone);
 *   zones.update(dt);
 *   // CameraRig parallax.setStrength(zones.scale) — strength is applied
 *   // relative to an entry anchor so framing doesn't yank toward center.
 *
 * `scale` is the parallax multiplier while inside (0.2 = 80% reduced).
 * Outside, scale eases back to 1 with a critically-damped spring.
 */

/** Default inside-zone parallax multiplier (80% reduction → 20% remain). */
export const PARALLAX_DAMP_INSIDE_SCALE = 0.2;

/** Spring omega for enter/leave taper — soft enough to hide the handoff. */
export const PARALLAX_DAMP_OMEGA = 3.2;

/**
 * @typedef {{
 *   id: string,
 *   meshes?: THREE.Object3D[],
 *   mesh?: THREE.Object3D,
 *   vignetteIndex?: number,
 *   scale?: number,
 *   domSelector?: string
 * }} ParallaxDampZone
 */

export function createParallaxDampZones({
  insideScale = PARALLAX_DAMP_INSIDE_SCALE,
  omega = PARALLAX_DAMP_OMEGA
} = {}) {
  /** @type {Map<string, ParallaxDampZone>} */
  const zones = new Map();

  let scale = 1;
  let scaleVelocity = 0;
  let scaleTarget = 1;
  let activeId = null;

  /**
   * @param {string} id
   * @param {Omit<ParallaxDampZone, "id">} config
   */
  function register(id, config = {}) {
    zones.set(id, {
      id,
      scale: config.scale ?? insideScale,
      meshes: config.meshes,
      mesh: config.mesh,
      vignetteIndex: config.vignetteIndex,
      domSelector: config.domSelector
    });
  }

  function unregister(id) {
    zones.delete(id);
    if (activeId === id) {
      activeId = null;
      scaleTarget = 1;
    }
  }

  /**
   * Mark whether the pointer is currently inside a damp zone.
   * @param {string | null} id — zone id, or null when outside all zones
   */
  function setActive(id) {
    if (id && !zones.has(id)) {
      activeId = null;
      scaleTarget = 1;
      return;
    }
    activeId = id;
    if (!id) {
      scaleTarget = 1;
      return;
    }
    scaleTarget = zones.get(id).scale ?? insideScale;
  }

  /**
   * Raycast registered meshes (same pattern as StageScrollCapture).
   * @param {THREE.Raycaster} raycaster
   * @param {THREE.Vector2} pointerNdc
   * @param {THREE.Camera} camera
   * @param {number} [activeVignetteIndex]
   * @returns {string | null}
   */
  function hitTest(raycaster, pointerNdc, camera, activeVignetteIndex) {
    raycaster.setFromCamera(pointerNdc, camera);

    for (const zone of zones.values()) {
      if (
        zone.vignetteIndex !== undefined &&
        activeVignetteIndex !== undefined &&
        zone.vignetteIndex !== activeVignetteIndex
      ) {
        continue;
      }

      if (zone.domSelector) {
        // DOM zones are resolved by the caller via setActive from elementFromPoint.
        continue;
      }

      const meshes = zone.meshes ?? (zone.mesh ? [zone.mesh] : []);
      if (!meshes.length) continue;

      const hit = raycaster.intersectObjects(meshes, true)[0];
      if (hit) return zone.id;
    }

    return null;
  }

  /**
   * Resolve DOM-based zones from a client point.
   * @param {number} clientX
   * @param {number} clientY
   * @returns {string | null}
   */
  function hitTestDom(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    for (const zone of zones.values()) {
      if (!zone.domSelector) continue;
      if (el.closest(zone.domSelector)) return zone.id;
    }
    return null;
  }

  function update(dt) {
    const clampedDt = Math.min(Math.max(dt, 0), 0.05);
    [scale, scaleVelocity] = springTo(scale, scaleVelocity, scaleTarget, omega, clampedDt);
    // Snap when essentially home — avoids endless micro-velocity.
    if (Math.abs(scale - scaleTarget) < 1e-4 && Math.abs(scaleVelocity) < 1e-4) {
      scale = scaleTarget;
      scaleVelocity = 0;
    }
  }

  return {
    register,
    unregister,
    setActive,
    hitTest,
    hitTestDom,
    update,
    get scale() {
      return scale;
    },
    get scaleTarget() {
      return scaleTarget;
    },
    get activeId() {
      return activeId;
    },
    debugState() {
      return {
        activeId,
        scale,
        scaleTarget,
        zones: [...zones.keys()]
      };
    }
  };
}
