import * as THREE from "three";
import { BaseVignette, createLabelSprite } from "./BaseVignette.js";

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

export { DesktopVignette } from "./DesktopVignette.js";
