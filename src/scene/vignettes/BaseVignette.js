import * as THREE from "three";
import { createLabelSprite } from "../math.js";

export class BaseVignette {
  /**
   * @param {object} meta
   * @param {string} meta.id
   * @param {string} meta.title
   * @param {string} meta.subtitle
   * @param {number} meta.orbitAngle
   */
  constructor(meta) {
    this.meta = meta;
    this.group = new THREE.Group();
    this.group.name = meta.id;
    this.interactives = [];
  }

  mount(scene) {
    scene.add(this.group);
  }

  dispose() {
    this.group.removeFromParent();
  }

  update() {}

  setActive() {}

  setInactive() {}

  getFocusPoint() {
    return new THREE.Vector3(0, 0.8, 0);
  }

  getCameraBasePosition() {
    return new THREE.Vector3(0, 1.35, 4.2);
  }

  handlePointerDown() {
    return false;
  }

  handlePointerMove() {
    return false;
  }

  handlePointerLeave() {}
}

export { createLabelSprite };
