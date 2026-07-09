import { SPOT_SHADOW } from "./constants.js";

/**
 * Enable PCF soft shadows on a Three.js SpotLight.
 * @see https://threejs.org/docs/#api/en/lights/SpotLight
 * @param {THREE.SpotLight} spotLight
 */
export function configureSpotShadow(spotLight) {
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.set(SPOT_SHADOW.mapSize, SPOT_SHADOW.mapSize);
  spotLight.shadow.camera.near = SPOT_SHADOW.near;
  spotLight.shadow.camera.far = SPOT_SHADOW.far;
  spotLight.shadow.bias = SPOT_SHADOW.bias;
  spotLight.shadow.normalBias = SPOT_SHADOW.normalBias;
  spotLight.shadow.radius = SPOT_SHADOW.radius;
}
