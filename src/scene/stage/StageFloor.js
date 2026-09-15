import * as THREE from "three";
import { STAGE_BG, STAGE_FLOOR_RADIUS } from "./constants.js";
import { STAGE_FLOOR_Y } from "../vignettes/pcSceneBlockout.js";

/** Matches studio shell footprint. */
const APRON_SIZE = STAGE_FLOOR_RADIUS * 2.15;

/**
 * Unlit stage floor — MeshBasic only.
 *
 * A MeshStandard disc on layer 0 took the POV SpotLight as a soft round pool.
 * Neon floor anchoring is additive glow cards under each tube (`NeonSystem`),
 * not a lit floor material.
 *
 * @returns {THREE.Group}
 */
export function buildStageFloor() {
  const group = new THREE.Group();
  group.name = "stage-floor";
  group.position.set(0, STAGE_FLOOR_Y + 0.004, 0);

  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(APRON_SIZE, APRON_SIZE),
    new THREE.MeshBasicMaterial({ color: STAGE_BG })
  );
  apron.name = "stage-floor-apron";
  apron.rotation.x = -Math.PI / 2;
  apron.receiveShadow = false;
  group.add(apron);

  return group;
}
