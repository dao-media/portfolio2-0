import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

let _rectReady = false;

/**
 * Slots that used to be created under a vignette and disappear when that
 * content hid. They are mounted once on the scene. Vignettes only write
 * intensity, color, and pose. Intensity 0 keeps the shader light count.
 *
 * Neon point lights, accent spots, the POV spot, portal sun/fill/ambient,
 * and the stage ambient/hemisphere are already created once elsewhere and
 * stay on the scene. This rig is the three slots whose parent used to toggle.
 *
 * @param {THREE.Scene} scene
 */
export function createStageLightRig(scene) {
  if (!_rectReady) {
    RectAreaLightUniformsLib.init();
    _rectReady = true;
  }

  const group = new THREE.Group();
  group.name = "stage-light-rig";

  const spill = new THREE.RectAreaLight(0xffffff, 0, 0.4, 0.3);
  spill.name = "stage-screen-spill";

  const glow = new THREE.PointLight(0xffffff, 0, 3, 1.85);
  glow.name = "stage-screen-glow";
  glow.castShadow = false;

  const scrollball = new THREE.PointLight(0xff4428, 0, 1, 2);
  scrollball.name = "stage-scrollball";
  scrollball.castShadow = false;

  group.add(spill, glow, scrollball);
  scene.add(group);

  return { group, spill, glow, scrollball };
}
