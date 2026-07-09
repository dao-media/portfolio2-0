/**
 * Exponential smoothing — exact under variable dt.
 * @param {number} current
 * @param {number} target
 * @param {number} rate — 1/seconds (~8–12 ≈ old 0.15 lerp @ 60fps)
 * @param {number} dt — seconds
 */
export function damp(current, target, rate, dt) {
  if (!Number.isFinite(current)) return target;
  if (!Number.isFinite(target)) return current;
  if (!Number.isFinite(rate) || !Number.isFinite(dt)) return target;
  return target + (current - target) * Math.exp(-rate * dt);
}

/** Semi-implicit Euler spring — stable under uneven dt, overshoots when underdamped. */
export class Spring {
  /**
   * @param {number} [stiffness=170]
   * @param {number} [damping=14]
   */
  constructor(stiffness = 170, damping = 14) {
    this.k = Number.isFinite(stiffness) ? stiffness : 170;
    this.c = Number.isFinite(damping) ? damping : 14;
    this.value = 0;
    this.velocity = 0;
    this.target = 0;
  }

  /** @param {number} dt — seconds, clamped internally */
  update(dt) {
    dt = Math.min(Math.max(Number.isFinite(dt) ? dt : 0.016, 0.001), 1 / 30);

    if (!Number.isFinite(this.value) || !Number.isFinite(this.velocity)) {
      this.reset();
      return 0;
    }

    const accel = this.k * (this.target - this.value) - this.c * this.velocity;
    if (!Number.isFinite(accel)) {
      this.reset();
      return 0;
    }

    this.velocity += accel * dt;
    this.value += this.velocity * dt;

    if (!Number.isFinite(this.value) || !Number.isFinite(this.velocity)) {
      this.reset();
      return 0;
    }

    return this.value;
  }

  reset() {
    this.value = 0;
    this.velocity = 0;
    this.target = 0;
  }
}
