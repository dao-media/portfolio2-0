import * as THREE from "three";
import { BLACK_HOLE_HORIZON_FRAC, BLACK_HOLE_WORLD_DIAMETER } from "./BlackHoleModel.js";

/**
 * Black-hole flight utilities only — lensing math and the aerial-drop sky
 * pitch. The galactic-band dome that used to live here (a soft procedural
 * haze sphere, `createMilkyWayDome`/`updateMilkyWayDome`) has been removed:
 * it painted a grey gradient band behind the real star points and, being
 * `toneMapped: false`, could clear the bloom threshold and blur into haze.
 * The band is now made of real stars only — see {@link ../blackhole/StarField.js}.
 */

/**
 * World dome on the vignette ring, meters from the stage origin.
 * The ring camera sits about 28 m out, so this shell curves overhead and
 * shifts as the camera orbits. Far side stays inside CAM_FAR (220).
 */
export const SKY_DOME_RADIUS = 110;
/**
 * Ring band, as the Y component of a sky direction — kept for the cursor
 * hover star trail's shader (ProceduralStarfield.js), which still compiles
 * this band branch even though it never sets aBand > 0.5.
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

