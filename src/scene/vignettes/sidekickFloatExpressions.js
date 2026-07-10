import * as THREE from "three";
import gsap from "gsap";
import { SIDEKICK_EASE_IN, SIDEKICK_EASE_OUT } from "./sidekickMotionEasing.js";

/** @typedef {{ swivelTween?: boolean, isOpen?: boolean, anchorsReady?: boolean, aligned?: boolean, transitioning?: boolean, focusBlend?: number, isActive?: boolean }} SidekickExpressionState */

const MIN_IDLE_MS = 10_000;
const MAX_IDLE_MS = 26_000;
const RETRY_MS = 4_000;

const _randRange = (min, max) => min + Math.random() * (max - min);

/**
 * Idle “personality” routines layered on the Sidekick float bob.
 * Quick (<2s) one-shots scheduled at random while the phone rests closed.
 */
export class SidekickFloatExpressionController {
  /** @param {{ reducedMotion?: boolean }} [options] */
  constructor(options = {}) {
    this.reducedMotion = options.reducedMotion ?? false;
    this.offset = {
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(0, 0, 0, "YXZ"),
      bobScale: 1
    };
    this._timeline = null;
    this._lastId = null;
    this._nextAt = performance.now() + _randRange(MIN_IDLE_MS * 0.6, MIN_IDLE_MS);
  }

  /** @param {SidekickExpressionState} state */
  canPlay(state) {
    return (
      !this.reducedMotion &&
      !this._timeline &&
      Boolean(state.isActive) &&
      Boolean(state.aligned) &&
      Boolean(state.anchorsReady) &&
      !state.swivelTween &&
      !state.isOpen &&
      !state.transitioning &&
      (state.focusBlend ?? 0) < 0.02
    );
  }

  /** @param {number} now @param {SidekickExpressionState} state */
  tick(now, state) {
    if (this._timeline || this.reducedMotion) return;
    if (now < this._nextAt) return;

    if (!this.canPlay(state)) {
      this._nextAt = now + RETRY_MS;
      return;
    }

    this._playRandom();
  }

  cancel() {
    this._timeline?.kill();
    this._timeline = null;
    this._resetOffset();
  }

  isPlaying() {
    return Boolean(this._timeline);
  }

  /** Dev / manual trigger — skips the idle timer. @param {string} [id] */
  trigger(id) {
    if (this._timeline) return false;
    const expr =
      SIDEKICK_EXPRESSIONS.find((entry) => entry.id === id) ?? SIDEKICK_EXPRESSIONS[0];
    this._lastId = expr.id;
    this._resetOffset();
    this._timeline = expr.play(this.offset, () => {
      this._timeline = null;
      this._resetOffset();
      this._scheduleNext();
    });
    return true;
  }

  _resetOffset() {
    this.offset.position.set(0, 0, 0);
    this.offset.rotation.set(0, 0, 0);
    this.offset.bobScale = 1;
  }

  _scheduleNext(fromMs = performance.now()) {
    this._nextAt = fromMs + _randRange(MIN_IDLE_MS, MAX_IDLE_MS);
  }

  _playRandom() {
    const pool = SIDEKICK_EXPRESSIONS.filter((expr) => expr.id !== this._lastId);
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? SIDEKICK_EXPRESSIONS[0];
    this._lastId = pick.id;
    this._resetOffset();

    this._timeline = pick.play(this.offset, () => {
      this._timeline = null;
      this._resetOffset();
      this._scheduleNext();
    });
  }
}

/**
 * @param {import("./sidekickFloatExpressions.js").SidekickFloatExpressionController["offset"]} offset
 * @param {() => void} onComplete
 */
function playTwirl(offset, onComplete) {
  const p = { tilt: 0, spin: 0, lift: 0, bob: 1 };

  const apply = () => {
    offset.rotation.set(p.tilt, p.spin, 0, "YXZ");
    offset.position.set(0, p.lift, 0);
    offset.bobScale = p.bob;
  };

  const finish = () => {
    p.tilt = 0;
    p.spin = 0;
    p.lift = 0;
    p.bob = 1;
    apply();
    onComplete();
  };

  const tl = gsap.timeline({ onUpdate: apply, onComplete: finish });

  tl.to(p, { tilt: 1.05, lift: 0.04, bob: 0.58, duration: 0.36, ease: SIDEKICK_EASE_IN });
  tl.to(p, { spin: Math.PI * 2, duration: 0.9, ease: SIDEKICK_EASE_IN }, "<0.05");
  tl.to(p, { tilt: 0, spin: 0, lift: 0, bob: 1, duration: 0.58, ease: SIDEKICK_EASE_OUT });

  return tl;
}

/**
 * @param {import("./sidekickFloatExpressions.js").SidekickFloatExpressionController["offset"]} offset
 * @param {() => void} onComplete
 */
function playWalkSomersault(offset, onComplete) {
  const p = { x: 0, y: 0, z: 0, roll: 0, pitch: 0, flip: 0, bob: 1 };

  const apply = () => {
    offset.position.set(p.x, p.y, p.z);
    offset.rotation.set(p.flip + p.pitch, 0, p.roll, "YXZ");
    offset.bobScale = p.bob;
  };

  const finish = () => {
    p.x = 0;
    p.y = 0;
    p.z = 0;
    p.roll = 0;
    p.pitch = 0;
    p.flip = 0;
    p.bob = 1;
    apply();
    onComplete();
  };

  const tl = gsap.timeline({ onUpdate: apply, onComplete: finish });

  tl.to(p, { bob: 0.62, duration: 0.1, ease: SIDEKICK_EASE_IN });
  tl.to(p, { z: 0.055, x: -0.028, roll: -0.14, duration: 0.15, ease: SIDEKICK_EASE_IN });
  tl.to(p, { z: 0.11, x: 0.03, roll: 0.16, duration: 0.13, ease: SIDEKICK_EASE_IN });
  tl.to(p, { z: 0.17, x: -0.024, roll: -0.12, duration: 0.14, ease: SIDEKICK_EASE_IN });
  tl.to(p, { z: 0.24, x: 0.022, roll: 0.1, duration: 0.13, ease: SIDEKICK_EASE_IN });
  tl.to(p, { y: 0.018, pitch: -0.2, duration: 0.12, ease: SIDEKICK_EASE_IN });
  tl.to(p, {
    flip: Math.PI * 2,
    z: 0,
    x: 0,
    y: 0,
    roll: 0,
    pitch: 0,
    duration: 0.62,
    ease: SIDEKICK_EASE_OUT
  });
  tl.to(p, { bob: 1, duration: 0.48, ease: SIDEKICK_EASE_OUT }, "<0.14");

  return tl;
}

/** @type {{ id: string, play: typeof playTwirl }[]} */
export const SIDEKICK_EXPRESSIONS = [
  { id: "twirl", play: playTwirl },
  { id: "walkSomersault", play: playWalkSomersault }
];
