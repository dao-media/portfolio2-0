/**
 * Closed-phone rest motion. A slow vertical bob, a smaller lateral sway,
 * and a lean that follows the sway. Springs keep the handoff into the
 * open swivel from popping.
 */

/** Meters. The fitted phone is about 0.8 m tall. */
export const SIDEKICK_BOB_Y = 0.028;
/** Meters, vignette-group X (left–right at the stop). */
export const SIDEKICK_SWAY_X = 0.01;
/** Radians of lean around the stop's view axis. About 1.3°. */
export const SIDEKICK_LEAN = 0.022;
/** Cycles per second. Bob is a little quicker than the sway. */
export const SIDEKICK_BOB_HZ = 0.17;
export const SIDEKICK_SWAY_HZ = 0.11;

const TAU = Math.PI * 2;

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

export class SidekickIdleFloat {
  constructor() {
    this._phase = Math.random() * TAU;
    this.y = 0;
    this.x = 0;
    this.lean = 0;
    this._vy = 0;
    this._vx = 0;
    this._vLean = 0;
    this._strength = 0;
  }

  /**
   * @param {number} dt Seconds since last tick
   * @param {number} time Scene elapsed seconds
   * @param {boolean} resting Closed, not zoomed
   * @returns {{ x: number, y: number, lean: number }}
   */
  tick(dt, time, resting) {
    const step = Math.min(Math.max(dt, 0), 0.05);
    const goal = resting ? 1 : 0;
    this._strength += (goal - this._strength) * (1 - Math.exp(-step * 3.2));

    const s = this._strength;
    const t = time + this._phase;
    const bob = Math.sin(t * SIDEKICK_BOB_HZ * TAU) * SIDEKICK_BOB_Y * s;
    const swayWave = Math.sin(t * SIDEKICK_SWAY_HZ * TAU + 0.7);
    const sway = swayWave * SIDEKICK_SWAY_X * s;
    const lean = swayWave * SIDEKICK_LEAN * s;

    [this.y, this._vy] = springStep(this.y, this._vy, bob, 8, 3.2, step);
    [this.x, this._vx] = springStep(this.x, this._vx, sway, 7, 3, step);
    [this.lean, this._vLean] = springStep(this.lean, this._vLean, lean, 8, 3.2, step);

    return { x: this.x, y: this.y, lean: this.lean };
  }
}
