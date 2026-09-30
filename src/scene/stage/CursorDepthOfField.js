import * as THREE from "three";
import { CURSOR_DOF, WET_FLOOR_LAYER } from "./constants.js";

const _dest = new THREE.Vector3();

/**
 * Keeps a world-space focal point under the cursor.
 * Raycasts the active vignette and the floor. Does not read the GPU depth buffer.
 * Instanced grass is skipped; a miss falls back to the vignette anchor.
 */
export class CursorDepthOfField {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.enable(0);
    this.raycaster.layers.enable(WET_FLOOR_LAYER);
    /** Stable point the depth-of-field effect reads every frame. */
    this.point = new THREE.Vector3();
    this._ndc = new THREE.Vector2();
    this._list = [];
    this._ready = false;
  }

  /**
   * @param {THREE.Camera} camera
   * @param {THREE.Vector2} pointer NDC. Y is up.
   * @param {number} dt Seconds.
   * @param {{ vignette?: THREE.Object3D | null, floor?: THREE.Object3D | null }} roots
   */
  update(camera, pointer, dt, roots) {
    this._ndc.set(pointer?.x || 0, pointer?.y || 0);
    this.raycaster.setFromCamera(this._ndc, camera);
    this._fill(roots);
    const hits = this.raycaster.intersectObjects(this._list, false);
    if (hits.length > 0) {
      _dest.copy(hits[0].point);
    } else if (roots.vignette) {
      roots.vignette.getWorldPosition(_dest);
      _dest.y += 1.2;
    } else {
      return;
    }

    const k = 1 - Math.exp(-CURSOR_DOF.follow * Math.max(0, dt));
    if (!this._ready) {
      this.point.copy(_dest);
      this._ready = true;
    } else {
      this.point.lerp(_dest, k);
    }
  }

  /**
   * @param {{ vignette?: THREE.Object3D | null, floor?: THREE.Object3D | null }} roots
   */
  _fill(roots) {
    const list = this._list;
    list.length = 0;
    if (roots.floor) list.push(roots.floor);
    const vig = roots.vignette;
    if (!vig) return;
    vig.traverse((obj) => {
      if (!obj.isMesh || obj.isInstancedMesh) return;
      list.push(obj);
    });
  }
}
