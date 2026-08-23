import * as THREE from "three";
import {
  NEON_FOG_LAYER,
  NEON_LIGHT_DECAY,
  NEON_LIGHT_DISTANCE,
  NEON_LIGHT_HEIGHT,
  NEON_MAX_EMISSIVE,
  NEON_MAX_LIGHT,
  vignetteAngle
} from "../stage/constants.js";
import { createFogPlane } from "./createFogPlane.js";
import { makeNeonTube } from "./makeNeonTube.js";

const _LIGHT_POS = new THREE.Vector3();

/**
 * Camera travels to fixed ring stops, so the single neon light follows the
 * front-most tube. Recolor at the hop midpoint (both intensities ~0).
 */
export class NeonSystem {
  /**
   * @param {{ scene: THREE.Scene, camera: THREE.Camera, fogMaterial: THREE.Material }} opts
   */
  constructor({ scene, camera, fogMaterial }) {
    this.fogMaterial = fogMaterial;
    this.entries = [];

    this.light = new THREE.PointLight(
      0xffffff,
      0,
      NEON_LIGHT_DISTANCE,
      NEON_LIGHT_DECAY
    );
    this.light.name = "neon-fog-light";
    this.light.castShadow = false;
    this.light.layers.set(NEON_FOG_LAYER);
    scene.add(this.light);
    camera.layers.enable(NEON_FOG_LAYER);
  }

  /**
   * @param {{ def: { neonColors?: string[], tubeLength?: number, fogSize?: number }, group: THREE.Group, tube?: THREE.Mesh, fogLightColor?: THREE.Color }} vignette
   */
  attach(vignette) {
    const tube = makeNeonTube(vignette.def);
    const fog = createFogPlane(this.fogMaterial, vignette.def.fogSize);
    vignette.group.add(tube);
    vignette.group.add(fog);

    const fogLightColor = new THREE.Color(vignette.def.neonColors?.[0] ?? "#00e5ff");
    vignette.tube = tube;
    vignette.fog = fog;
    vignette.fogLightColor = fogLightColor;
    this.entries.push({ vignette, tube, fog, fogLightColor });
  }

  /**
   * @param {number} theta Camera orbit angle
   * @param {number} total Stop count
   */
  update(theta, total) {
    const n = this.entries.length;
    if (!n) return;

    let best = this.entries[0];
    let bestAmt = 0;

    for (let i = 0; i < n; i += 1) {
      const amt = neonActiveAmount(theta, i, total || n);
      const entry = this.entries[i];
      entry.tube.material.emissiveIntensity = amt * NEON_MAX_EMISSIVE;
      if (amt >= bestAmt) {
        bestAmt = amt;
        best = entry;
      }
    }

    this.light.intensity = bestAmt * NEON_MAX_LIGHT;
    this.light.color.copy(best.fogLightColor);
    best.tube.getWorldPosition(_LIGHT_POS);
    this.light.position.set(_LIGHT_POS.x, NEON_LIGHT_HEIGHT, _LIGHT_POS.z);
  }
}

/** 1 at the stop, 0 at the hop midpoint — both scenes sit near-zero there. */
export function neonActiveAmount(theta, index, total) {
  const target = vignetteAngle(index, total);
  let delta = theta - target;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  const halfSector = Math.PI / Math.max(total, 1);
  const t = 1 - Math.min(Math.abs(delta) / halfSector, 1);
  return t * t * (3 - 2 * t);
}
