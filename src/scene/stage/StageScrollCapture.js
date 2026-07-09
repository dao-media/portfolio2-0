import * as THREE from "three";
import { SCROLL_CAPTURE_DOM_SELECTORS } from "./scrollCaptureTargets.js";

/**
 * Central registry: when the pointer hovers a registered DOM node or 3D mesh,
 * stage turntable scroll is suppressed so the target can scroll / click instead.
 */
export class StageScrollCapture {
  /**
   * @param {string[]} [domSelectors]
   */
  constructor(domSelectors = SCROLL_CAPTURE_DOM_SELECTORS) {
    this.domSelectors = domSelectors;
    /** @type {Map<string, ScrollCaptureMeshTarget>} */
    this.meshTargets = new Map();
    this.activeDomKey = null;
    this.activeMeshId = null;
    this.lastHit = null;
    this._prevMeshId = null;
  }

  /**
   * @param {string} id
   * @param {ScrollCaptureMeshTarget} config
   */
  registerMesh(id, config) {
    this.meshTargets.set(id, { id, ...config });
  }

  unregisterMesh(id) {
    this.meshTargets.delete(id);
    if (this.activeMeshId === id) {
      this.activeMeshId = null;
      this.lastHit = null;
    }
  }

  /** @param {number} clientX @param {number} clientY */
  updateDomHover(clientX, clientY) {
    this.activeDomKey = null;
    const el = document.elementFromPoint(clientX, clientY);
    if (!el || el.id === "scene-canvas") return;

    for (const selector of this.domSelectors) {
      const match = el.closest(selector);
      if (!match) continue;
      if (match.hidden || match.getAttribute("aria-hidden") === "true") continue;
      this.activeDomKey = match.id || selector;
      return;
    }
  }

  /**
   * @param {THREE.Raycaster} raycaster
   * @param {THREE.Vector2} pointer
   * @param {THREE.Camera} camera
   * @param {number} activeVignetteIndex
   */
  updateMeshHover(raycaster, pointer, camera, activeVignetteIndex) {
    this._prevMeshId = this.activeMeshId;
    this.activeMeshId = null;
    this.lastHit = null;

    raycaster.setFromCamera(pointer, camera);

    for (const target of this.meshTargets.values()) {
      if (target.vignetteIndex !== undefined && target.vignetteIndex !== activeVignetteIndex) {
        continue;
      }

      const meshes = target.meshes ?? (target.mesh ? [target.mesh] : []);
      if (!meshes.length) continue;

      const hit = raycaster.intersectObjects(meshes, true)[0];
      if (hit) {
        this.activeMeshId = target.id;
        this.lastHit = hit;
        break;
      }
    }

    if (this._prevMeshId && this._prevMeshId !== this.activeMeshId) {
      this.meshTargets.get(this._prevMeshId)?.onPointerLeave?.();
    }

    return this.activeMeshId ? this.meshTargets.get(this.activeMeshId) : null;
  }

  get isActive() {
    return Boolean(this.activeDomKey || this.activeMeshId);
  }

  blocksParallax() {
    return this.isActive;
  }

  /**
   * @param {WheelEvent} event
   * @param {number} [weight=1] Blend weight for smooth capture handoff (0–1).
   * @returns {boolean} true if stage scroll was consumed/blocked
   */
  handleWheel(event, weight = 1) {
    if (!this.isActive || weight <= 0.001) return false;

    event.preventDefault();
    event.stopPropagation();

    if (this.activeMeshId) {
      const target = this.meshTargets.get(this.activeMeshId);
      target?.onWheel?.(event.deltaY * weight, this.lastHit);
    }

    return true;
  }

  handlePointerDown() {
    if (!this.activeMeshId) return false;
    const target = this.meshTargets.get(this.activeMeshId);
    return target?.onPointerDown?.(this.lastHit) ?? false;
  }

  handlePointerMove() {
    if (!this.activeMeshId) return false;
    const target = this.meshTargets.get(this.activeMeshId);
    return target?.onPointerMove?.(this.lastHit) ?? false;
  }

  clearPointer() {
    if (this.activeMeshId) {
      this.meshTargets.get(this.activeMeshId)?.onPointerLeave?.();
    }
    this.activeMeshId = null;
    this.activeDomKey = null;
    this.lastHit = null;
    this._prevMeshId = null;
  }

  /** Dev helper — list registered targets and hover state. */
  debugState() {
    return {
      activeDom: this.activeDomKey,
      activeMesh: this.activeMeshId,
      domSelectors: this.domSelectors,
      meshes: [...this.meshTargets.keys()]
    };
  }
}

/**
 * @typedef {object} ScrollCaptureMeshTarget
 * @property {string} id
 * @property {number} [vignetteIndex]
 * @property {THREE.Object3D} [mesh]
 * @property {THREE.Object3D[]} [meshes]
 * @property {(deltaY: number, hit?: THREE.Intersection) => void} [onWheel]
 * @property {(hit?: THREE.Intersection) => boolean} [onPointerDown]
 * @property {(hit?: THREE.Intersection) => boolean} [onPointerMove]
 * @property {() => void} [onPointerLeave]
 */
