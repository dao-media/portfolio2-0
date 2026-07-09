import * as THREE from "three";
import { STAGE_BG, STAGE_FLOOR_RADIUS, STAGE_RADIUS } from "./constants.js";
import { STAGE_FLOOR_Y } from "../vignettes/pcSceneBlockout.js";

/**
 * Infinite studio shell — inverted box interior (building-live-envmaps room shape)
 * with a flat floor and seamless walls/ceiling, all STAGE_BG.
 * Uses MeshBasicMaterial so the backdrop stays flat #141414 regardless of lights.
 */
export function buildStageStudioRoom() {
  const width = STAGE_FLOOR_RADIUS * 2.15;
  const depth = STAGE_FLOOR_RADIUS * 2.15;
  const height = 26;

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshBasicMaterial({
      color: STAGE_BG,
      side: THREE.BackSide
    })
  );

  room.name = "stage-studio-room";
  room.position.set(0, STAGE_FLOOR_Y + height * 0.5, STAGE_RADIUS);

  return room;
}
