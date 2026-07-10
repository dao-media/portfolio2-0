/** Spring-damped idle hover — chases layered sine targets for loose, gravity-like motion. */

const AMP_Y = 0.042;
const AMP_Z = 0.028;
/** Roll / pitch wave — opposite sides rise and fall out of phase. */
const AMP_ROLL = 0.034;
const AMP_PITCH = 0.022;

/**
 * Damped spring toward a moving target (semi-implicit Euler).
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

export class SidekickIdleFloat {
  constructor() {
    this._phase = Math.random() * Math.PI * 2;
    this.y = 0;
    this.z = 0;
    this.roll = 0;
    this.pitch = 0;
    this._vy = 0;
    this._vz = 0;
    this._vRoll = 0;
    this._vPitch = 0;
  }

  /**
   * @param {number} dt Seconds since last tick
   * @param {number} time Scene elapsed seconds
   * @param {number} strength 0–1 blend (focus, ramp, expression damp)
   * @returns {{ y: number, z: number, roll: number, pitch: number }}
   */
  tick(dt, time, strength) {
    const s = Math.max(0, strength);
    if (s <= 1e-4) {
      [this.y, this._vy] = springStep(this.y, this._vy, 0, 14, 4.2, dt);
      [this.z, this._vz] = springStep(this.z, this._vz, 0, 12, 3.8, dt);
      [this.roll, this._vRoll] = springStep(this.roll, this._vRoll, 0, 15, 4.4, dt);
      [this.pitch, this._vPitch] = springStep(this.pitch, this._vPitch, 0, 13, 4, dt);
      return { y: this.y, z: this.z, roll: this.roll, pitch: this.pitch };
    }

    const t = time + this._phase;

    const targetY =
      (Math.sin(t * 0.52) * 0.52 +
        Math.sin(t * 0.24 + 1.18) * 0.3 +
        Math.sin(t * 0.67 + 0.35) * 0.18) *
      AMP_Y *
      s;

    const targetZ =
      (Math.sin(t * 0.38 + 0.52) * 0.62 + Math.sin(t * 0.17 + 2.05) * 0.38) * AMP_Z * s;

    const targetRoll =
      (Math.sin(t * 0.44 + 0.85) * 0.54 + Math.sin(t * 0.28 + 2.35) * 0.46) * AMP_ROLL * s;

    const targetPitch =
      (Math.sin(t * 0.33 + 1.55) * 0.56 + Math.sin(t * 0.49 + 0.25) * 0.44) * AMP_PITCH * s;

    [this.y, this._vy] = springStep(this.y, this._vy, targetY, 11, 3.4, dt);
    [this.z, this._vz] = springStep(this.z, this._vz, targetZ, 9.5, 3.1, dt);
    [this.roll, this._vRoll] = springStep(this.roll, this._vRoll, targetRoll, 12, 3.6, dt);
    [this.pitch, this._vPitch] = springStep(this.pitch, this._vPitch, targetPitch, 10.5, 3.3, dt);

    return { y: this.y, z: this.z, roll: this.roll, pitch: this.pitch };
  }
}
