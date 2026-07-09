import * as THREE from "three";
import { damp, easeOutCubic } from "./math.js";

export class CameraRig {
  /**
   * @param {THREE.PerspectiveCamera} camera
   */
  constructor(camera) {
    this.camera = camera;
    this.introProgress = 0;
    this.introComplete = false;
    this.orbitOffset = new THREE.Vector2();
    this.orbitTarget = new THREE.Vector2();
    this.canStartDrag = () => true;
    this._dragActive = false;
    this._pointerId = null;
    this._lastPointer = new THREE.Vector2();
  }

  attach(canvas) {
    this.canvas = canvas;
    this.isDragging = false;
    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointermove", this._onPointerMove);
    canvas.addEventListener("pointerup", this._onPointerUp);
    canvas.addEventListener("pointercancel", this._onPointerUp);
  }

  detach() {
    if (!this.canvas) return;
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.canvas.removeEventListener("pointerup", this._onPointerUp);
    this.canvas.removeEventListener("pointercancel", this._onPointerUp);
  }

  _onPointerDown = (event) => {
    if (!this.introComplete || !this.canStartDrag()) return;
    this._dragActive = true;
    this.isDragging = true;
    this._pointerId = event.pointerId;
    this._lastPointer.set(event.clientX, event.clientY);
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add("is-dragging");
  };

  _onPointerMove = (event) => {
    if (!this._dragActive || event.pointerId !== this._pointerId) return;
    const dx = event.clientX - this._lastPointer.x;
    const dy = event.clientY - this._lastPointer.y;
    this._lastPointer.set(event.clientX, event.clientY);
    this.orbitTarget.x = THREE.MathUtils.clamp(this.orbitTarget.x + dx * 0.004, -0.35, 0.35);
    this.orbitTarget.y = THREE.MathUtils.clamp(this.orbitTarget.y + dy * 0.003, -0.18, 0.18);
  };

  _onPointerUp = (event) => {
    if (event.pointerId !== this._pointerId) return;
    this._dragActive = false;
    this.isDragging = false;
    this._pointerId = null;
    this.canvas.classList.remove("is-dragging");
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* noop */
    }
  };

  startIntro() {
    this.introProgress = 0;
    this.introComplete = false;
  }

  /**
   * @param {THREE.Vector3} focusPoint
   * @param {THREE.Vector3} settledPosition
   * @param {number} dt
   */
  updateIntro(focusPoint, settledPosition, dt) {
    if (this.introComplete) return;
    this.introProgress = Math.min(1, this.introProgress + dt / 2.1);
    const eased = easeOutCubic(this.introProgress);
    const dropHeight = 4.8;
    const start = settledPosition.clone().add(new THREE.Vector3(0, dropHeight, 0.35));
    this.camera.position.lerpVectors(start, settledPosition, eased);
    this.camera.lookAt(focusPoint);
    if (this.introProgress >= 1) this.introComplete = true;
  }

  /**
   * @param {THREE.Vector3} focusPoint
   * @param {THREE.Vector3} basePosition
   * @param {number} dt
   */
  updateOrbit(focusPoint, basePosition, dt) {
    this.orbitOffset.x = damp(this.orbitOffset.x, this.orbitTarget.x, 10, dt);
    this.orbitOffset.y = damp(this.orbitOffset.y, this.orbitTarget.y, 10, dt);

    if (!this._dragActive) {
      this.orbitTarget.x = damp(this.orbitTarget.x, 0, 4.5, dt);
      this.orbitTarget.y = damp(this.orbitTarget.y, 0, 4.5, dt);
    }

    const offset = new THREE.Vector3(
      Math.sin(this.orbitOffset.x) * 0.55,
      this.orbitOffset.y * 0.8,
      Math.cos(this.orbitOffset.x) * 0.55
    );
    this.camera.position.copy(basePosition).add(offset);
    this.camera.lookAt(focusPoint);
  }
}
