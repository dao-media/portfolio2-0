import * as THREE from "three";

export const BLACK_HOLE_PHASE = {
  INACTIVE: "INACTIVE",
  APPROACH: "APPROACH",
  SPIRAL: "SPIRAL",
  COMPLETE: "COMPLETE"
};

/**
 * Singularity sits on −Z, inside the night dome (radius ~180), looking away
 * from the vignette ring so the stage is behind the camera.
 * The approach stays on the hold sightline (looking down ~18°). The spiral
 * keeps that elevation and orbits the hole, so the disk's tilt stays put
 * while the camera circles in.
 */
export const BLACK_HOLE_CENTER = new THREE.Vector3(0, 6.2, -148);
export const BLACK_HOLE_HOLD_Z = -133;
/** Above the disk so the hold looks down onto the horizontal ring (~18°). */
const HOLD_Y = 11.2;
/** Unit vector from the hole to the hold camera. */
const REST_DIR = new THREE.Vector3(
  0,
  HOLD_Y - BLACK_HOLE_CENTER.y,
  BLACK_HOLE_HOLD_Z - BLACK_HOLE_CENTER.z
).normalize();
/** Far end of that sightline. Same range as the old z −40 start. */
export const BLACK_HOLE_APPROACH_DISTANCE = 108;
export const BLACK_HOLE_APPROACH_START = new THREE.Vector3()
  .copy(BLACK_HOLE_CENTER)
  .addScaledVector(REST_DIR, BLACK_HOLE_APPROACH_DISTANCE);
/**
 * Cursor parallax fades in over the last of the approach and is full at the
 * hold. Same offset the vignettes use (`CameraRig` parallax); spiral clears it.
 */
export const BLACK_HOLE_REST_PARALLAX_START = 0.85;
export const BLACK_HOLE_REST_PARALLAX_FULL = 0.2;

/** Approach ease. 2.5 in the draft finishes during the opaque boot gate. */
export const BLACK_HOLE_APPROACH_EASE = 0.65;

export const BLACK_HOLE_RADIUS_DECAY = 1.15;
/** Orbit rate during the close. ~2.6 rad/s is about one turn before the 2.45 s cap. */
export const BLACK_HOLE_ANGULAR_SPEED = 2.6;
/** Spiral is brief — r0·e^(−k t) to 0.12 would run ~4 s and leave the dome. */
export const BLACK_HOLE_SPIRAL_MAX_SEC = 2.45;
export const BLACK_HOLE_SPIRAL_RADIUS_END = 0.42;

const REST_HORIZ = Math.hypot(REST_DIR.x, REST_DIR.z);
const REST_ELEV_Y = REST_DIR.y;
const REST_AZIMUTH = Math.atan2(REST_DIR.x, REST_DIR.z);

/**
 * Approach toward the hole along the hold sightline, then a logarithmic
 * spiral at that same elevation. Owns the camera until COMPLETE. CameraRig
 * must stay pose-suspended.
 */
export class BlackHoleCameraSequence {
  constructor(camera) {
    this.camera = camera;
    this.phase = BLACK_HOLE_PHASE.APPROACH;
    this.spiralTime = 0;
    this.initialRadius = 15;
    this.radiusDecayRate = BLACK_HOLE_RADIUS_DECAY;
    this.position = BLACK_HOLE_APPROACH_START.clone();
    this.lookAtTarget = BLACK_HOLE_CENTER.clone();
    this._applyPose();
  }

  /**
   * 0 while flying in, 1 once the hold has settled. Smoothstep between
   * {@link BLACK_HOLE_REST_PARALLAX_START} and {@link BLACK_HOLE_REST_PARALLAX_FULL}.
   */
  restParallaxBlend() {
    if (this.phase !== BLACK_HOLE_PHASE.APPROACH) return 0;
    const remain = Math.hypot(
      this.position.z - BLACK_HOLE_HOLD_Z,
      this.position.y - HOLD_Y
    );
    const span = BLACK_HOLE_REST_PARALLAX_START - BLACK_HOLE_REST_PARALLAX_FULL;
    const t = (BLACK_HOLE_REST_PARALLAX_START - remain) / span;
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  }

  triggerSpiral() {
    if (this.phase !== BLACK_HOLE_PHASE.APPROACH) return false;
    this.initialRadius = Math.max(1.5, this.position.distanceTo(BLACK_HOLE_CENTER));
    this.phase = BLACK_HOLE_PHASE.SPIRAL;
    this.spiralTime = 0;
    return true;
  }

  /**
   * @param {number} dt seconds
   * @param {() => void} [onSpiralComplete]
   */
  update(dt, onSpiralComplete) {
    if (
      this.phase === BLACK_HOLE_PHASE.INACTIVE ||
      this.phase === BLACK_HOLE_PHASE.COMPLETE
    ) {
      return;
    }

    const step = Math.min(Math.max(dt, 0), 0.05);

    if (this.phase === BLACK_HOLE_PHASE.APPROACH) {
      const k = 1 - Math.exp(-BLACK_HOLE_APPROACH_EASE * step);
      const holdX = BLACK_HOLE_CENTER.x;
      this.position.x += (holdX - this.position.x) * k;
      this.position.y += (HOLD_Y - this.position.y) * k;
      this.position.z += (BLACK_HOLE_HOLD_Z - this.position.z) * k;
      this._applyPose();
      return;
    }

    this.spiralTime += step;
    const t = this.spiralTime;
    const currentRadius = this.initialRadius * Math.exp(-this.radiusDecayRate * t);
    const angle = REST_AZIMUTH + BLACK_HOLE_ANGULAR_SPEED * t;
    const ring = currentRadius * REST_HORIZ;
    this.position.set(
      BLACK_HOLE_CENTER.x + Math.sin(angle) * ring,
      BLACK_HOLE_CENTER.y + currentRadius * REST_ELEV_Y,
      BLACK_HOLE_CENTER.z + Math.cos(angle) * ring
    );
    this._applyPose();

    if (currentRadius <= BLACK_HOLE_SPIRAL_RADIUS_END || t >= BLACK_HOLE_SPIRAL_MAX_SEC) {
      this.phase = BLACK_HOLE_PHASE.COMPLETE;
      onSpiralComplete?.();
    }
  }

  _applyPose() {
    this.camera.position.copy(this.position);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.lookAtTarget);
  }
}
