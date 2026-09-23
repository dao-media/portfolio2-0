/** Earth-style axial spin + subtle bob + axis wobble (no orbital swing). */

import {
  DUO_AMP_X,
  DUO_AMP_Y,
  DUO_AMP_ROLL,
  DUO_AMP_PITCH,
  DUO_SPIN,
  DUO_WOBBLE_HZ
} from "./duoConstants.js";

/**
 * @param {number} pos
 * @param {number} vel
 * @param {number} target
 * @param {number} stiffness
 * @param {number} damping
 * @param {number} dt
 */
function springStep(pos, vel, target, stiffness, damping, dt) {
  const accel = stiffness * (target - pos) - damping * vel;
  const nextVel = vel + accel * dt;
  return [pos + nextVel * dt, nextVel];
}

function wrapDelta(d) {
  let x = d;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/**
 * Spin around the phone’s own up axis (dead-center pivot). Bob is translation
 * only; pitch/roll are tiny axial nutation — never a lean that reads as orbit.
 */
export class DuoIdleMotion {
  constructor() {
    this._phase = Math.random() * Math.PI * 2;
    this.x = 0;
    this.y = 0;
    /** Continuous axial yaw (radians) — Earth’s rotation. */
    this.spinYaw = 0;
    this.roll = 0;
    this.pitch = 0;
    this._vx = 0;
    this._vy = 0;
    this._vRoll = 0;
    this._vPitch = 0;
  }

  /** Hard-zero pose + velocities (entrance → spin starts from rest facing). */
  reset() {
    this.x = 0;
    this.y = 0;
    this.spinYaw = 0;
    this.roll = 0;
    this.pitch = 0;
    this._vx = 0;
    this._vy = 0;
    this._vRoll = 0;
    this._vPitch = 0;
    this._phase = Math.random() * Math.PI * 2;
    return this;
  }

  /**
   * @param {number} dt
   * @param {number} time
   * @param {{
   *   spin?: number,
   *   bob?: number,
   *   wobble?: number,
   *   faceYaw?: number | null
   * }} [opts]
   *   spin/bob/wobble 0–1 strengths.
   *   faceYaw — when set, ease spinYaw toward this angle (hover face-on).
   */
  tick(dt, time, opts = {}) {
    const spinS = Math.max(0, opts.spin ?? 0);
    const bobS = Math.max(0, opts.bob ?? 0);
    const wobbleS = Math.max(0, opts.wobble ?? spinS);
    const faceYaw = opts.faceYaw;

    const t = time + this._phase;
    const w = DUO_WOBBLE_HZ * Math.PI * 2;

    // —— Bob (translation) ——
    if (bobS > 1e-4) {
      const targetY =
        (Math.sin(t * 0.55) * 0.6 + Math.sin(t * 0.23 + 1.1) * 0.4) *
        DUO_AMP_Y *
        bobS;
      const targetX =
        (Math.sin(t * 0.37 + 0.7) * 0.55 + Math.sin(t * 0.19 + 2.1) * 0.45) *
        DUO_AMP_X *
        bobS;
      [this.x, this._vx] = springStep(this.x, this._vx, targetX, 10, 3.2, dt);
      [this.y, this._vy] = springStep(this.y, this._vy, targetY, 11, 3.4, dt);
    } else {
      [this.x, this._vx] = springStep(this.x, this._vx, 0, 14, 4.2, dt);
      [this.y, this._vy] = springStep(this.y, this._vy, 0, 14, 4.2, dt);
    }

    // —— Axial spin or face-camera hold ——
    if (faceYaw != null && Number.isFinite(faceYaw)) {
      const d = wrapDelta(faceYaw - this.spinYaw);
      this.spinYaw += d * Math.min(1, 5.2 * dt);
    } else if (spinS > 1e-4) {
      this.spinYaw += DUO_SPIN * spinS * dt;
    }

    // —— Nutation (halted on hover face) ——
    if (wobbleS > 1e-4) {
      const targetRoll = Math.sin(t * w + 0.4) * DUO_AMP_ROLL * wobbleS;
      const targetPitch = Math.cos(t * w * 0.87 + 1.1) * DUO_AMP_PITCH * wobbleS;
      [this.roll, this._vRoll] = springStep(
        this.roll,
        this._vRoll,
        targetRoll,
        12,
        3.6,
        dt
      );
      [this.pitch, this._vPitch] = springStep(
        this.pitch,
        this._vPitch,
        targetPitch,
        10.5,
        3.3,
        dt
      );
    } else {
      [this.roll, this._vRoll] = springStep(this.roll, this._vRoll, 0, 15, 4.4, dt);
      [this.pitch, this._vPitch] = springStep(
        this.pitch,
        this._vPitch,
        0,
        13,
        4,
        dt
      );
    }

    return this;
  }
}
