import * as THREE from "three";
import { STAGE_FLOOR_RADIUS, WET_FLOOR_LAYER } from "./constants.js";
import { STAGE_FLOOR_Y } from "../vignettes/pcSceneBlockout.js";
import { createWetFloorParams } from "../floor/wetFloorConfig.js";

/** Matches studio shell footprint. */
const APRON_SIZE = STAGE_FLOOR_RADIUS * 2.15;

/**
 * Wet-concrete arena floor — MeshStandard + roughness puddles.
 *
 * Lives on {@link WET_FLOOR_LAYER} so the POV SpotLight (layer 0 only) cannot
 * paint the §10/§20 round disc. Neon PointLights also enable this layer.
 *
 * @param {{
 *   map?: THREE.Texture,
 *   roughnessMap?: THREE.Texture,
 *   normalMap?: THREE.Texture,
 *   metalnessMap?: THREE.Texture
 * }} [maps]
 * @returns {{ group: THREE.Group, mesh: THREE.Mesh, material: THREE.MeshStandardMaterial }}
 */
export function buildStageFloor(maps = {}) {
  const p = createWetFloorParams();
  const group = new THREE.Group();
  group.name = "stage-floor";
  group.position.set(0, STAGE_FLOOR_Y + 0.004, 0);

  const gain = p.colorGain;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(gain, gain, gain),
    map: maps.map ?? null,
    roughnessMap: maps.roughnessMap ?? null,
    normalMap: maps.normalMap ?? null,
    metalnessMap: maps.metalnessMap ?? null,
    roughness: p.roughness,
    metalness: p.metalness,
    envMapIntensity: 0,
    // No scene.environment IBL — probe supplies envMap when live.
  });
  if (material.normalScale) {
    material.normalScale.set(p.normalScale, p.normalScale);
  }
  material.name = "wet-concrete-floor";

  const rep = p.uvRepeat;
  for (const tex of [maps.map, maps.roughnessMap, maps.normalMap, maps.metalnessMap]) {
    if (!tex) continue;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rep, rep);
  }

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(APRON_SIZE, APRON_SIZE),
    material
  );
  mesh.name = "stage-floor-apron";
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  // Layer 3 only — not lit by POV spot (layer 0). Neon enables layer 3.
  mesh.layers.set(WET_FLOOR_LAYER);
  group.add(mesh);
  // Group stays default layer 0 so parenting/tools still find it; mesh is what renders.
  group.userData.wetFloorMesh = mesh;
  group.userData.wetFloorMaterial = material;

  return { group, mesh, material };
}
