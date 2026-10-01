import { BLACK_HOLE_HORIZON_FRAC, BLACK_HOLE_WORLD_DIAMETER } from "./BlackHoleModel.js";

/**
 * Black-hole flight utilities only — lensing math. The galactic-band dome
 * that used to live here (a soft procedural haze sphere,
 * `createMilkyWayDome`/`updateMilkyWayDome`) has been removed: it painted a
 * grey gradient band behind the real star points and, being
 * `toneMapped: false`, could clear the bloom threshold and blur into haze.
 * The band is now made of real stars only — see {@link ../blackhole/StarField.js}.
 * The aerial-drop sky pitch that used to live here has also been removed:
 * stars are rendered at infinity (rotation-only projection, see
 * StarField.js and ProceduralStarfield.js) and must not visibly respond to
 * a camera translation at all, which is what that pitch existed to fake.
 */

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

