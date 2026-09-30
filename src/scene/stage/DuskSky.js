/**
 * Ring sky. Preetham daylight from three's ocean example
 * (`webgl_shaders_ocean`), held late: elevation −1.5°, azimuth 180°,
 * turbidity 10, rayleigh 2. A view-elevation mask keeps most of the
 * frame night and feathers a sunset band off the floor.
 * The flight keeps the procedural space sky. This one is the
 * atmosphere you are standing inside.
 */
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { CAM_FAR, EXPOSURE, STAGE_BG, STAGE_FLOOR_RADIUS } from "./constants.js";
import { STAGE_FLOOR_Y } from "../vignettes/pcSceneBlockout.js";

/**
 * Degrees above the horizon. The ocean demo starts at 2°, which fills
 * this frame with sun. Negative puts the disc under the ring horizon.
 */
export const DUSK_ELEVATION = -1.5;
/** Ocean example `parameters.azimuth`. 180° puts the sun on −Z, the bust look. */
export const DUSK_AZIMUTH = 180;
export const DUSK_TURBIDITY = 10;
export const DUSK_RAYLEIGH = 2;
export const DUSK_MIE_COEFFICIENT = 0.005;
export const DUSK_MIE_DIRECTIONAL_G = 0.8;
/**
 * The example scales the box to 10000 inside a far plane of 20000.
 * Ours is CAM_FAR 220, and the shader already pins depth to the far plane.
 */
export const DUSK_SKY_SCALE = Math.min(160, CAM_FAR * 0.7);
/** The ocean demo tone-maps at 0.5. The stage sits at EXPOSURE 1.18, which clips this sun. */
export const DUSK_REFERENCE_EXPOSURE = 0.5;
/** View dir.y where the sunset band has faded to night. */
export const DUSK_GLOW_END = 0.12;
/** Rise off the floor. The silhouette is night; the color eases in over this span. */
export const DUSK_HORIZON_LOW = 0.0;
export const DUSK_HORIZON_HIGH = 0.055;

/**
 * @param {THREE.Scene} scene
 */
export function createDuskSky(scene) {
  const sky = new Sky();
  sky.name = "dusk-sky";
  sky.scale.setScalar(DUSK_SKY_SCALE);
  sky.frustumCulled = false;
  sky.renderOrder = -100;

  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = DUSK_TURBIDITY;
  uniforms.rayleigh.value = DUSK_RAYLEIGH;
  uniforms.mieCoefficient.value = DUSK_MIE_COEFFICIENT;
  uniforms.mieDirectionalG.value = DUSK_MIE_DIRECTIONAL_G;

  const phi = THREE.MathUtils.degToRad(90 - DUSK_ELEVATION);
  const theta = THREE.MathUtils.degToRad(DUSK_AZIMUTH);
  const sun = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  uniforms.sunPosition.value.copy(sun);

  sky.material.uniforms.uDuskScale = {
    value: DUSK_REFERENCE_EXPOSURE / EXPOSURE
  };
  sky.material.uniforms.uDuskNight = { value: new THREE.Color(STAGE_BG) };
  sky.material.uniforms.uDuskGlowEnd = { value: DUSK_GLOW_END };
  sky.material.uniforms.uDuskHorizonLow = { value: DUSK_HORIZON_LOW };
  sky.material.uniforms.uDuskHorizonHigh = { value: DUSK_HORIZON_HIGH };
  sky.material.uniforms.uDuskPitch = { value: 0 };
  sky.material.uniforms.uDuskAxis = { value: new THREE.Vector3(1, 0, 0) };
  sky.material.fragmentShader =
    `uniform float uDuskScale;
uniform vec3 uDuskNight;
uniform float uDuskGlowEnd;
uniform float uDuskHorizonLow;
uniform float uDuskHorizonHigh;
uniform float uDuskPitch;
uniform vec3 uDuskAxis;
` +
    sky.material.fragmentShader
      .replace(
        "vec3 direction = normalize( vWorldPosition - cameraPosition );",
        `vec3 direction = normalize( vWorldPosition - cameraPosition );
float duskSn = sin( uDuskPitch );
float duskCs = cos( uDuskPitch );
direction = normalize( direction * duskCs + cross( uDuskAxis, direction ) * duskSn + uDuskAxis * dot( uDuskAxis, direction ) * ( 1.0 - duskCs ) );`
      )
      .replace(
        "gl_FragColor = vec4( retColor, 1.0 );",
        `float duskUp = direction.y;
float duskRise = smoothstep( uDuskHorizonLow, uDuskHorizonHigh, duskUp );
float duskFall = 1.0 - smoothstep( uDuskHorizonHigh, uDuskGlowEnd, duskUp );
float duskGlow = duskRise * duskFall;
duskGlow = duskGlow * duskGlow * ( 3.0 - 2.0 * duskGlow );
vec3 duskCol = mix( uDuskNight, retColor * uDuskScale, duskGlow );
gl_FragColor = vec4( duskCol, 1.0 );`
      );
  sky.material.needsUpdate = true;

  scene.add(sky);

  return { mesh: sky, sun };
}

const _fwd = new THREE.Vector3();
const _axis = new THREE.Vector3();

/**
 * The intro quaternion is frozen, so a view-locked horizon stays glued
 * to the frame while the floor's far rim rises to meet it. Tilt the
 * sky by the change in rim depression so the band stays on that rim.
 * Zero at rest height, where the tuned band already meets the floor.
 * @param {THREE.ShaderMaterial} material
 * @param {THREE.Camera} camera
 * @param {number} restHeight
 * @param {boolean} active
 */
export function syncDuskHorizon(material, camera, restHeight, active) {
  const pitch = material?.uniforms?.uDuskPitch;
  const axis = material?.uniforms?.uDuskAxis;
  if (!pitch || !axis) return;
  if (!active || !camera) {
    pitch.value = 0;
    return;
  }
  _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const horiz = Math.hypot(_fwd.x, _fwd.z) || 1;
  const dx = _fwd.x / horiz;
  const dz = _fwd.z / horiz;
  const cx = camera.position.x;
  const cz = camera.position.z;
  const b = cx * dx + cz * dz;
  const c = cx * cx + cz * cz - STAGE_FLOOR_RADIUS * STAGE_FLOOR_RADIUS;
  const disc = b * b - c;
  const reach = Math.max(disc > 0 ? -b + Math.sqrt(disc) : STAGE_FLOOR_RADIUS, 1);
  const height = camera.position.y - STAGE_FLOOR_Y;
  const rest = restHeight - STAGE_FLOOR_Y;
  pitch.value = Math.atan2(height, reach) - Math.atan2(rest, reach);
  axis.value.copy(_axis.set(1, 0, 0).applyQuaternion(camera.quaternion));
}

/**
 * Keep the dusk at the ocean demo's brightness when Shift+E moves exposure.
 * @param {THREE.ShaderMaterial} material
 * @param {number} exposure
 */
export function syncDuskExposure(material, exposure) {
  const scale = material.uniforms.uDuskScale;
  if (!scale) return;
  scale.value = DUSK_REFERENCE_EXPOSURE / Math.max(exposure, 0.05);
}
