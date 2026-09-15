import * as THREE from "three";
import { STAGE_BG, STAGE_FLOOR_RADIUS, STAGE_RADIUS } from "./constants.js";
import { STAGE_FLOOR_Y } from "../vignettes/pcSceneBlockout.js";

/**
 * Infinite studio shell — inverted box interior (building-live-envmaps room shape)
 * with a flat floor and seamless walls/ceiling, all STAGE_BG.
 * Uses MeshBasicMaterial so the backdrop stays flat #070709 regardless of lights.
 * Bottom of the box sits below StageFloor so the wall|floor corner is under the
 * grazing sightline; the MeshBasic apron covers the join.
 */
export function buildStageStudioRoom() {
  const width = STAGE_FLOOR_RADIUS * 2.15;
  const depth = STAGE_FLOOR_RADIUS * 2.15;
  /** Extra below floor — push the hard wall|floor corner off-camera at grazing. */
  const belowFloor = 6;
  const height = 26 + belowFloor;

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshBasicMaterial({
      color: STAGE_BG,
      side: THREE.BackSide
    })
  );

  room.name = "stage-studio-room";
  // Center so top stays ~26 m above floor; bottom is belowFloor under the apron.
  room.position.set(0, STAGE_FLOOR_Y + height * 0.5 - belowFloor, STAGE_RADIUS);

  return room;
}
