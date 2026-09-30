import * as THREE from "three";
import { BLACK_HOLE_HORIZON_FRAC, BLACK_HOLE_WORLD_DIAMETER } from "./BlackHoleModel.js";

/**
 * Authored radius of the star directions, meters from the origin. The sky
 * is drawn as directions around the camera, so this distance does not
 * parallax — a camera move does not shift the belt.
 */
export const MILKY_WAY_DISTANCE = 24000;
/** Camera-centered draw shell during the black-hole flight. Stays inside CAM_FAR (220). */
export const MILKY_WAY_SHELL = 40;
/**
 * World dome on the vignette ring, meters from the stage origin.
 * The ring camera sits about 28 m out, so this shell curves overhead and
 * shifts as the camera orbits. Far side stays inside CAM_FAR (220).
 */
export const SKY_DOME_RADIUS = 110;
/**
 * Galactic plane. One great circle, not a stack of ridges. From the
 * black-hole hold the flight draws the short arc that crosses the
 * top-right corner. On the ring that same arc is stretched around the
 * whole circle so the band crosses the sky.
 */
export const GALACTIC_PLANE_N = new THREE.Vector3(0.4352, 0.8796, 0.1921).normalize();
/** Flight half-length, radians, centered on the +π side of the circle. */
export const GALACTIC_ARC_HALF = 0.75;
/**
 * Ring band, as the Y component of a sky direction (sine of elevation).
 * A full circle at this height, so every stop sees it cross the sky.
 * About 14°, inside the vignette frame and above the horizon fade.
 */
export const RING_BAND_ELEV = 0.24;
/**
 * View-elevation sine of the horizon blend on the landed vignettes.
 * The night sky is black at {@link SKY_HORIZON_LOW} (just under the
 * horizon) and full by {@link SKY_HORIZON_HIGH} (~11°). Stars fade
 * inside that same band. The flight turns that fade off so the corner
 * arc stays bright while the camera looks downhill.
 */
export const SKY_HORIZON_LOW = -0.03;
export const SKY_HORIZON_HIGH = 0.2;
const BLACK_HOLE_DISK_RADIUS = BLACK_HOLE_WORLD_DIAMETER * 0.5;
/**
 * Inner edge of the warp, as a multiple of the event-horizon radius.
 * Above 1 so the field starts outside the dark circle.
 */
export const BLACK_HOLE_LENS_INNER_OUTSET = 1.18;
/**
 * Outer edge of the warp, as a multiple of the disk radius.
 * Just past the ring, not a wide halo.
 */
export const BLACK_HOLE_LENS_OUTER_TIGHT = 1.04;
/** World radius where the warp begins, meters. */
export const BLACK_HOLE_LENS_INNER_RADIUS =
  BLACK_HOLE_DISK_RADIUS * BLACK_HOLE_HORIZON_FRAC * BLACK_HOLE_LENS_INNER_OUTSET;
/** World radius where the warp ends, meters. */
export const BLACK_HOLE_LENS_OUTER_RADIUS = BLACK_HOLE_DISK_RADIUS * BLACK_HOLE_LENS_OUTER_TIGHT;
/**
 * Screen size of that band. 0.2 is 80% smaller than the disk-sized circle,
 * which was blacking out most of the starfield.
 */
export const BLACK_HOLE_LENS_SIZE_SCALE = 0.2;
/** Hold distance sqrt(5²+15²). Lens strength is 1 at this range. */
export const BLACK_HOLE_LENS_REF_DISTANCE = 15.81;
/**
 * Strength stays shut until the camera is inside half the 108 m approach
 * (54 m). It eases on from there and is 1 at the hold.
 */
export const BLACK_HOLE_LENS_APPEAR_DISTANCE = 54;
/**
 * Strength is (angular / hold angular) raised to this, then gated by
 * {@link BLACK_HOLE_LENS_APPEAR_DISTANCE}. Closer than the hold still
 * ramps up, capped at 2.4.
 */
export const BLACK_HOLE_LENS_FALLOFF = 1.8;

const _dropAxis = new THREE.Vector3();

/**
 * Pitch applied to the sky while the aerial drop is in flight.
 * The intro quaternion is frozen, so a pure height change does not
 * turn the camera. This angle is the bust's own vertical slide,
 * atan(remaining descent / look distance), and it is 0 at rest.
 * Negative pitches the sky down at the apex so it rises as the camera falls.
 * @param {number} descent meters still above rest height
 * @param {number} lookDistance horizontal meters from camera to the look point
 */
export function introSkyDropPitch(descent, lookDistance) {
  const drop = Math.max(descent, 0);
  if (drop < 0.02) return 0;
  return -Math.atan2(drop, Math.max(lookDistance, 1));
}

/**
 * Camera right axis, the hinge for {@link introSkyDropPitch}.
 * @param {THREE.Camera} camera
 * @param {THREE.Vector3} [target]
 */
export function skyDropAxis(camera, target = _dropAxis) {
  return target.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
}

/**
 * Annulus radii and strength from camera-to-hole distance.
 * The band starts outside the event horizon and ends just past the ring.
 * Strength is 0 outside 54 m, eases on through the second half of the
 * approach, and is 1 at the hold.
 * @param {THREE.Camera} camera
 * @param {THREE.Vector3} holePos
 */
export function blackHoleLensFromCamera(camera, holePos) {
  const dist = Math.max(camera.position.distanceTo(holePos), 0.75);
  const innerAngular = Math.atan((BLACK_HOLE_LENS_INNER_RADIUS * BLACK_HOLE_LENS_SIZE_SCALE) / dist);
  const outerAngular = Math.atan((BLACK_HOLE_LENS_OUTER_RADIUS * BLACK_HOLE_LENS_SIZE_SCALE) / dist);
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  const toUv = (angular) => (Math.tan(angular) / Math.max(tanHalf, 1e-4)) * 0.5;
  const refAngular = Math.atan(
    (BLACK_HOLE_LENS_OUTER_RADIUS * BLACK_HOLE_LENS_SIZE_SCALE) / BLACK_HOLE_LENS_REF_DISTANCE
  );
  const t = outerAngular / Math.max(refAngular, 1e-4);
  const span = BLACK_HOLE_LENS_APPEAR_DISTANCE - BLACK_HOLE_LENS_REF_DISTANCE;
  const u = Math.min(1, Math.max(0, (BLACK_HOLE_LENS_APPEAR_DISTANCE - dist) / span));
  const appear = u * u * (3 - 2 * u);
  const strength = Math.min(2.4, Math.pow(t, BLACK_HOLE_LENS_FALLOFF) * appear);
  return {
    dist,
    angular: outerAngular,
    uvRadius: toUv(outerAngular),
    innerAngular,
    outerAngular,
    innerUv: toUv(innerAngular),
    outerUv: toUv(outerAngular),
    strength
  };
}

const MilkyWayNebulaShader = {
  uniforms: {
    uTime: { value: 0 },
    uBlackHoleScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    uLensingInner: { value: 0 },
    uLensingOuter: { value: 0 },
    uLensingStrength: { value: 0 },
    uFlight: { value: 0 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vScreen;
    varying vec3 vDir;
    varying vec3 vView;
    void main() {
      // Infinite sky. The shell is camera-centered and world-aligned, so
      // this direction does not change when the camera translates.
      vec3 D = normalize(position);
      vView = D;
      vDir = D;
      vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vScreen = clip.xy / clip.w * 0.5 + 0.5;
      gl_Position = clip;
      gl_Position.z = clip.w * 0.999;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec2 uBlackHoleScreenPos;
    uniform float uLensingInner;
    uniform float uLensingOuter;
    uniform float uLensingStrength;
    uniform float uFlight;

    varying vec2 vScreen;
    varying vec3 vDir;
    varying vec3 vView;

    // Same soft cloud in flight and on the ring. The flight still clips
    // it to the short arc; the ring does not.
    float filamentStars(float along, float across) {
      float wave = 0.01 * sin(along * 2.2);
      wave += 0.018 * sin(along * 6.3 + 1.4);
      float ridge = abs(across - wave);
      float filaments = exp(-ridge * ridge * 220.0);
      float clump = 0.65 + 0.35 * sin(along * 4.7 + 0.6) * sin(along * 1.9);
      return filaments * clump * 0.045;
    }

    void main() {
      vec3 dir = normalize(vDir);
      vec2 toBh = vScreen - uBlackHoleScreenPos;
      float distToBh = length(toBh);
      if (uLensingStrength > 0.001 && distToBh > uLensingInner && distToBh < uLensingOuter) {
        float span = max(uLensingOuter - uLensingInner, 1e-4);
        float u = (distToBh - uLensingInner) / span;
        float onset = smoothstep(0.0, 0.08, u);
        float tight = smoothstep(1.0, 0.9, u);
        float pull = uLensingStrength * onset * tight;
        vec2 distortion = normalize(toBh) * pull * span * 0.85;
        vec3 side = cross(dir, vec3(0.0, 1.0, 0.0));
        if (dot(side, side) < 1e-4) side = cross(dir, vec3(1.0, 0.0, 0.0));
        side = normalize(side);
        vec3 lift = cross(side, dir);
        dir = normalize(dir + side * distortion.x + lift * distortion.y);
      }

      float flight = step(0.5, uFlight);
      vec3 planeN = normalize(vec3(${GALACTIC_PLANE_N.x.toFixed(5)}, ${GALACTIC_PLANE_N.y.toFixed(5)}, ${GALACTIC_PLANE_N.z.toFixed(5)}));
      vec3 tangent = normalize(cross(planeN, vec3(0.0, 1.0, 0.0)));
      vec3 bitangent = normalize(cross(planeN, tangent));
      float planeAcross = dot(dir, planeN);
      float planeAlong = atan(dot(dir, bitangent), dot(dir, tangent));
      float fromPi = 3.141593 - abs(planeAlong);
      float across = mix(dir.y - ${RING_BAND_ELEV.toFixed(3)}, planeAcross, flight);
      float along = mix(atan(dir.z, dir.x), planeAlong, flight);
      float arcFade = mix(1.0, step(fromPi, ${GALACTIC_ARC_HALF.toFixed(3)}), flight);
      float stars = filamentStars(along, across) * arcFade;
      float haloAcross = abs(across);
      float halo = exp(-haloAcross * haloAcross * 240.0) * arcFade;
      // Continuous dust only. A floor() cell here is tens of pixels on screen
      // and reads as rectangles in the band.
      vec3 dust = vec3(0.94, 0.95, 1.0);
      float shimmer = 0.97 + 0.03 * sin(uTime * 0.35 + along * 4.0);
      // Same black as the hole core (Blackhole_core base color 0). Tone mapping is off, so 0 stays 0.
      vec3 deepSpace = vec3(0.0);
      float elev = vView.y;
      float skyW = smoothstep(${SKY_HORIZON_LOW.toFixed(3)}, ${SKY_HORIZON_HIGH.toFixed(3)}, elev);
      skyW = skyW * skyW * (3.0 - 2.0 * skyW);
      float starW = smoothstep(0.0, ${SKY_HORIZON_HIGH.toFixed(3)}, elev);
      if (uFlight > 0.5) {
        skyW = 1.0;
        starW = 1.0;
      }
      vec3 lit = deepSpace + dust * (stars * 0.7 + halo * 0.035) * shimmer * starW;
      vec3 finalSky = mix(vec3(0.0), lit, skyW);
      gl_FragColor = vec4(finalSky, 1.0);
    }
  `
};

/**
 * Inside-out galactic dome. Lensing uses screen position so the warp
 * follows the hole instead of a fixed sphere UV.
 * @param {number} [radius]
 */
export function createMilkyWayDome(radius = MILKY_WAY_SHELL) {
  const geometry = new THREE.SphereGeometry(radius, 192, 96);
  const material = new THREE.ShaderMaterial({
    name: "MilkyWayNebula",
    uniforms: THREE.UniformsUtils.clone(MilkyWayNebulaShader.uniforms),
    vertexShader: MilkyWayNebulaShader.vertexShader,
    fragmentShader: MilkyWayNebulaShader.fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "milky-way-dome";
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  mesh.userData.bhNdc = new THREE.Vector3();
  return mesh;
}

/**
 * @param {THREE.Mesh} dome
 * @param {THREE.Camera} camera
 * @param {number} time
 * @param {THREE.Vector3 | null} blackHolePos
 * @param {boolean} lens
 * @param {number} [dropPitch] radians, aerial-drop pitch around the camera's right axis
 * @param {THREE.Vector3} [dropAxis]
 * @param {boolean} [worldDome] ring shell, fixed at the origin
 */
export function updateMilkyWayDome(dome, camera, time, blackHolePos, lens, dropPitch = 0, dropAxis = null, worldDome = false) {
  const uniforms = dome?.material?.uniforms;
  if (!uniforms || !camera) return;
  if (worldDome) {
    dome.position.set(0, 0, 0);
    dome.quaternion.identity();
    dome.scale.setScalar(SKY_DOME_RADIUS / MILKY_WAY_SHELL);
  } else {
    dome.scale.setScalar(1);
    dome.position.copy(camera.position);
    if (Math.abs(dropPitch) > 1e-4 && dropAxis) {
      dome.quaternion.setFromAxisAngle(dropAxis, dropPitch);
    } else {
      dome.quaternion.identity();
    }
  }
  uniforms.uTime.value = time;
  uniforms.uFlight.value = lens ? 1 : 0;
  if (!lens || !blackHolePos) {
    uniforms.uLensingStrength.value = 0;
    uniforms.uLensingInner.value = 0;
    uniforms.uLensingOuter.value = 0;
    return;
  }
  const scale = blackHoleLensFromCamera(camera, blackHolePos);
  uniforms.uLensingInner.value = scale.innerUv;
  uniforms.uLensingOuter.value = scale.outerUv;
  uniforms.uLensingStrength.value = scale.strength;
  const ndc = dome.userData.bhNdc.copy(blackHolePos).project(camera);
  uniforms.uBlackHoleScreenPos.value.set((ndc.x + 1) * 0.5, (ndc.y + 1) * 0.5);
}
