/**
 * Phase-1 performance governor — motion DPR + adaptive step-down under load.
 * Additive on top of setWorkQuality / _applyRenderScale.
 *
 * Edge glitch is a fixed feature — NEVER stepped down here.
 */

/** Motion target absolute DPR (retina softness hidden by camera motion). */
export const MOTION_DPR = 1.0;
/** Seconds to ease between motion / settled DPR. */
export const MOTION_DPR_RAMP_SEC = 0.2;
/** Sustained frame budget before stepping down (ms). ~50 FPS. */
export const PERF_GOVERNOR_BUDGET_MS = 20;
/** EMA time constant for frame ms (seconds). */
export const PERF_GOVERNOR_EMA_SEC = 0.35;
/** Hold over-budget this long before a step-down (seconds). */
export const PERF_GOVERNOR_DOWN_HOLD_SEC = 0.6;
/** Hold under-budget this long before a step-up (seconds). */
export const PERF_GOVERNOR_UP_HOLD_SEC = 1.4;

/**
 * Governor levels (0 = full quality). Step-down order:
 * 0 full → 1 DPR×0.85 → 2 DPR×0.7 + shadow 512 → 3 + wet probe slower
 * Edge glitch is never disabled.
 */
export const PERF_GOVERNOR_LEVELS = Object.freeze([
  Object.freeze({
    id: 0,
    label: "full",
    dprMul: 1,
    shadowMul: 1,
    wetProbeEveryN: null
  }),
  Object.freeze({
    id: 1,
    label: "dpr-soft",
    dprMul: 0.85,
    shadowMul: 1,
    wetProbeEveryN: null
  }),
  Object.freeze({
    id: 2,
    label: "shadow-512",
    dprMul: 0.7,
    shadowMul: 0.5,
    wetProbeEveryN: null
  }),
  Object.freeze({
    id: 3,
    label: "wet-slow",
    dprMul: 0.7,
    shadowMul: 0.5,
    wetProbeEveryN: 6
  })
]);

export class StagePerfGovernor {
  constructor() {
    this.level = 0;
    this.emaMs = 16.7;
    this._overSec = 0;
    this._underSec = 0;
    /** Motion DPR factor 0..1 (1 = full settled DPR). */
    this.motionDprFactor = 1;
    this._motionTarget = 1;
  }

  /**
   * @param {number} dt
   * @param {{ settled: boolean, fullDpr: number, frameMs: number }} opts
   */
  tick(dt, opts) {
    const safeDt = Math.min(0.05, Math.max(0, dt || 0));
    const fullDpr = Math.max(1e-3, opts.fullDpr || 1);
    const motionFactor = Math.min(1, MOTION_DPR / fullDpr);
    this._motionTarget = opts.settled ? 1 : motionFactor;
    const ramp = MOTION_DPR_RAMP_SEC > 0 ? safeDt / MOTION_DPR_RAMP_SEC : 1;
    this.motionDprFactor += (this._motionTarget - this.motionDprFactor) * Math.min(1, ramp);

    const frameMs = Math.max(0, opts.frameMs || 16.7);
    const k = PERF_GOVERNOR_EMA_SEC > 0 ? 1 - Math.exp(-safeDt / PERF_GOVERNOR_EMA_SEC) : 1;
    this.emaMs += (frameMs - this.emaMs) * k;

    const maxLevel = PERF_GOVERNOR_LEVELS.length - 1;
    if (this.level > maxLevel) this.level = maxLevel;

    if (this.emaMs > PERF_GOVERNOR_BUDGET_MS) {
      this._overSec += safeDt;
      this._underSec = 0;
      if (this._overSec >= PERF_GOVERNOR_DOWN_HOLD_SEC && this.level < maxLevel) {
        this.level += 1;
        this._overSec = 0;
      }
    } else {
      this._underSec += safeDt;
      this._overSec = 0;
      if (this._underSec >= PERF_GOVERNOR_UP_HOLD_SEC && this.level > 0) {
        this.level -= 1;
        this._underSec = 0;
      }
    }
  }

  get profile() {
    const maxLevel = PERF_GOVERNOR_LEVELS.length - 1;
    if (this.level > maxLevel) this.level = maxLevel;
    return PERF_GOVERNOR_LEVELS[this.level] ?? PERF_GOVERNOR_LEVELS[0];
  }

  /** Combined scale applied on top of work-quality render scale. */
  get effectiveDprMul() {
    return this.motionDprFactor * (this.profile.dprMul ?? 1);
  }

  dump() {
    const p = this.profile;
    return {
      level: this.level,
      label: p.label,
      emaMs: +this.emaMs.toFixed(2),
      motionDprFactor: +this.motionDprFactor.toFixed(3),
      dprMul: p.dprMul,
      shadowMul: p.shadowMul,
      wetProbeEveryN: p.wetProbeEveryN,
      effectiveDprMul: +this.effectiveDprMul.toFixed(3)
    };
  }
}
