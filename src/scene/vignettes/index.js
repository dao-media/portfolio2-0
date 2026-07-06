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
    this._hovered = null;
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

  handlePointerUp() {
    return false;
  }

  handlePointerMove() {
    return false;
  }
}

export class PortalVignette extends BaseVignette {
  constructor(meta) {
    super(meta);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.85, 2),
      new THREE.MeshStandardMaterial({
        color: 0xffd166,
        metalness: 0.35,
        roughness: 0.28,
        emissive: 0x332200,
        emissiveIntensity: 0.35
      })
    );
    core.position.y = 1.05;
    this.group.add(core);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.45, 0.05, 16, 96),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.8,
        roughness: 0.18
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.05;
    this.group.add(ring);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.35, 0.22, 48),
      new THREE.MeshStandardMaterial({ color: 0x171923, roughness: 0.85, metalness: 0.1 })
    );
    pedestal.position.y = 0.11;
    this.group.add(pedestal);

    const label = createLabelSprite(meta.title, { scale: 1.1 });
    label.position.set(0, 2.35, 0);
    this.group.add(label);
  }

  update(time) {
    const pulse = 1 + Math.sin(time * 1.4) * 0.03;
    this.group.children[0].scale.setScalar(pulse);
    this.group.children[1].rotation.z = time * 0.18;
  }
}

export class WorkbenchVignette extends BaseVignette {
  /**
   * @param {object} meta
   * @param {{ showTerminal: () => void }} hooks
   */
  constructor(meta, hooks) {
    super(meta);
    this.hooks = hooks;

    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.18, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.92 })
    );
    desk.position.y = 0.55;
    this.group.add(desk);

    const monitor = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 1.02, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.55, metalness: 0.08 })
    );
    monitor.position.set(-0.35, 1.35, -0.15);
    this.group.add(monitor);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 0.72),
      new THREE.MeshStandardMaterial({
        color: 0x0b140d,
        emissive: 0x1d5d24,
        emissiveIntensity: 0.55,
        roughness: 0.35
      })
    );
    screen.position.set(-0.35, 1.35, -0.08);
    screen.userData.interactive = true;
    screen.userData.action = "terminal";
    this.group.add(screen);
    this.interactives.push(screen);

    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 1.05, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xe7e1d3, roughness: 0.62 })
    );
    tower.position.set(0.95, 1.02, 0.05);
    this.group.add(tower);

    const keyboard = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.05, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.8 })
    );
    keyboard.position.set(-0.2, 0.68, 0.42);
    this.group.add(keyboard);

    const label = createLabelSprite("Retro Workbench", { scale: 1.05 });
    label.position.set(0, 2.25, 0);
    this.group.add(label);
  }

  getFocusPoint() {
    return new THREE.Vector3(0.1, 1.05, 0);
  }

  getCameraBasePosition() {
    return new THREE.Vector3(0.35, 1.45, 3.85);
  }

  setActive() {
    this.hooks.showTerminal();
  }

  setInactive() {
    this.hooks.hideTerminal?.();
  }

  handlePointerDown(intersection) {
    if (intersection?.object?.userData?.action === "terminal") {
      this.hooks.showTerminal(true);
      return true;
    }
    return false;
  }
}

export class GalleryVignette extends BaseVignette {
  constructor(meta) {
    super(meta);
    const palette = [0xff6b6b, 0x4ecdc4, 0xffd166, 0x95e1d3, 0xc084fc];
    this.orbs = [];

    for (let i = 0; i < 5; i += 1) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 32, 32),
        new THREE.MeshStandardMaterial({
          color: palette[i],
          roughness: 0.25,
          metalness: 0.15,
          emissive: palette[i],
          emissiveIntensity: 0.12
        })
      );
      const angle = (i / 5) * Math.PI * 2;
      orb.position.set(Math.cos(angle) * 1.15, 1.05 + Math.sin(i) * 0.12, Math.sin(angle) * 1.15);
      orb.userData.interactive = true;
      orb.userData.index = i;
      this.group.add(orb);
      this.interactives.push(orb);
      this.orbs.push(orb);
    }

    const label = createLabelSprite("Project Orbits", { scale: 1.05 });
    label.position.set(0, 2.35, 0);
    this.group.add(label);
  }

  update(time) {
    this.orbs.forEach((orb, index) => {
      const base = index * 0.9;
      orb.position.y = 1.05 + Math.sin(time * 1.2 + base) * 0.18;
      orb.rotation.y = time * 0.6 + base;
    });
  }

  handlePointerDown(intersection) {
    const orb = intersection?.object;
    if (!orb?.userData?.interactive) return false;
    orb.scale.setScalar(1.35);
    window.setTimeout(() => orb.scale.setScalar(1), 180);
    return true;
  }
}
