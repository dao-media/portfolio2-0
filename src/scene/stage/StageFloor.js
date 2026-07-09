import * as THREE from "three";
import { STAGE_BG, STAGE_FLOOR_RADIUS, STAGE_RADIUS } from "./constants.js";
import { STAGE_FLOOR_Y } from "../vignettes/pcSceneBlockout.js";

/** Match studio shell footprint. */
const FLOOR_SIZE = STAGE_FLOOR_RADIUS * 2.15;

/**
 * Turntable floor — flat STAGE_BG disc; rotates with `world` (vignettes + labels).
 * @returns {THREE.Mesh}
 */
export function buildStageFloor() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
    new THREE.MeshStandardMaterial({
      color: STAGE_BG,
      roughness: 0.94,
      metalness: 0.02,
      envMapIntensity: 0
    })
  );
  floor.name = "stage-floor";
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, STAGE_FLOOR_Y + 0.004, STAGE_RADIUS);
  floor.receiveShadow = true;

  return floor;
}
