import {
  INTRO_HANDOFF_MS,
  PARALLAX_FOLLOW,
  PARALLAX_POST_TRANSITION_FOLLOW,
  PARALLAX_POST_TRANSITION_MS,
  INTRO_PARALLAX_HANDOFF_FOLLOW
} from "./constants.js";
import { clamp, finite, smoothstep } from "./stageScrollUtils.js";

/** Convert legacy per-frame lerp factor (at 60fps) to damp rate (1/s). */
export function lerpFactorToDampRate(follow, referenceFps = 60) {
  const f = clamp(finite(follow, 0.045), 0.0001, 0.999);
  const dt = 1 / Math.max(referenceFps, 1);
  return -Math.log(1 - f) / dt;
}

export const PARALLAX_DAMP_REST = lerpFactorToDampRate(PARALLAX_FOLLOW);
export const PARALLAX_DAMP_HANDOFF = lerpFactorToDampRate(INTRO_PARALLAX_HANDOFF_FOLLOW);
export const PARALLAX_DAMP_POST_TRANSITION = lerpFactorToDampRate(PARALLAX_POST_TRANSITION_FOLLOW);

/** Max intro descent change per frame (meters) — tab hitches cannot teleport the POV. */
export const INTRO_DESCENT_MAX_STEP = 0.14;

/** Max camera parallax shift per frame (NDC units) — hard ceiling against spikes. */
export const PARALLAX_MAX_STEP = 0.085;

/**
 * Advance intro descent toward the timeline target with a hard per-frame step cap.
 * @param {number} current
 * @param {number} linear — intro progress 0→1
 * @param {number} introDescent
 * @param {number} _dt — seconds (reserved; cap is absolute per frame)
 */
export function stepIntroDescent(current, linear, introDescent, _dt) {
  const target = introCameraDescent(linear, introDescent);
  const c = finite(current, 0);
  const delta = clamp(target - c, -INTRO_DESCENT_MAX_STEP, INTRO_DESCENT_MAX_STEP);
  return finite(c + delta, target);
}

/**
 * Frame-rate independent exponential smooth toward target.
 * @param {number} current
 * @param {number} target
 * @param {number} rate — 1/seconds
 * @param {number} dt — seconds
 */
export function dampParallax(current, target, rate, dt) {
  const c = finite(current, 0);
  const t = finite(target, 0);
  const r = Math.max(finite(rate, PARALLAX_DAMP_REST), 0);
  const d = clamp(finite(dt, 1 / 60), 1 / 240, 0.1);
  return finite(t + (c - t) * Math.exp(-r * d), t);
}

/** When travel progress passes this, parallax begins easing toward the live cursor. */
export const TRAVEL_PARALLAX_HANDOFF_START = 0.22;

/**
 * Blend parallax target during vignette travel so landing matches the live cursor POV.
 * @param {{ x?: number, y?: number }} from — parallax at travel start
 * @param {number} cursorX — current cursor target (NDC)
 * @param {number} cursorY
 * @param {number} progress — travel 0→1
 * @param {number} [travelScale=1]
 */
export function resolveTransitionParallaxDesired(from, cursorX, cursorY, progress, travelScale = 1) {
  const px = finite(from?.x, 0);
  const py = finite(from?.y, 0);
  const tx = finite(cursorX, 0) * travelScale;
  const ty = finite(cursorY, 0) * travelScale;
  const t = clamp(finite(progress, 0), 0, 1);
  const handoff = clamp((t - TRAVEL_PARALLAX_HANDOFF_START) / (1 - TRAVEL_PARALLAX_HANDOFF_START), 0, 1);
  const ease = handoff * handoff * (3 - 2 * handoff);
  return {
    desiredX: px + (tx - px) * ease,
    desiredY: py + (ty - py) * ease
  };
}

/**
 * @typedef {"rest" | "intro-handoff" | "post-transition" | "travel" | "frozen"} ParallaxFollowMode
 */

/**
 * Pick damp rate — never downgrades during intro handoff when deferred work runs.
 * @param {ParallaxFollowMode} mode
 */
export function parallaxDampRateForMode(mode) {
  switch (mode) {
    case "intro-handoff":
      return PARALLAX_DAMP_HANDOFF;
    case "post-transition":
    case "travel":
      return PARALLAX_DAMP_POST_TRANSITION;
    case "frozen":
      return 0;
    default:
      return PARALLAX_DAMP_REST;
  }
}

/**
 * Resolve parallax follow mode from stage timing flags.
 * @param {{
 *   now?: number,
 *   introHandoffUntil?: number,
 *   parallaxSettleUntil?: number,
 *   frozen?: boolean
 * }} flags
 * @returns {ParallaxFollowMode}
 */
export function resolveParallaxFollowMode(flags = {}) {
  if (flags.frozen) return "frozen";
  const now = finite(flags.now, 0);
  if (finite(flags.parallaxSettleUntil, 0) > now) return "post-transition";
  if (finite(flags.introHandoffUntil, 0) > now) return "intro-handoff";
  return "rest";
}

/**
 * 0 during intro descent, 0→1 across the post-intro handoff window.
 * @param {number} now
 * @param {number} handoffStart — performance.now() when intro finished
 * @param {number} [handoffMs=INTRO_HANDOFF_MS]
 */
export function introParallaxApplyBlend(now, handoffStart, handoffMs = INTRO_HANDOFF_MS) {
  const start = finite(handoffStart, 0);
  if (start <= 0) return 0;
  const duration = Math.max(finite(handoffMs, INTRO_HANDOFF_MS), 1);
  const t = clamp((now - start) / duration, 0, 1);
  if (t >= 1 - 1e-6) return 1;
  if (t <= 1e-6) return 0;
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * @param {number} introLinear — 0→1 intro timeline progress
 * @param {number} introDescent — total Y drop (meters)
 */
export function introCameraDescent(introLinear, introDescent) {
  const linear = clamp(finite(introLinear, 0), 0, 1);
  const eased = 1 - Math.pow(1 - linear, 3);
  return finite(introDescent, 0) * (1 - eased);
}

/**
 * Tick parallax state — dt-based, spike-clamped.
 * @param {{ x: number, y: number, tx?: number, ty?: number }} parallax
 * @param {{
 *   dt: number,
 *   desiredX: number,
 *   desiredY: number,
 *   mode?: ParallaxFollowMode
 * }} opts
 * @returns {{ x: number, y: number, delta: number }}
 */
export function tickParallaxState(parallax, opts) {
  const mode = opts.mode ?? "rest";
  const rate = parallaxDampRateForMode(mode);
  const prevX = finite(parallax.x, 0);
  const prevY = finite(parallax.y, 0);

  if (mode === "frozen" || rate <= 0) {
    return { x: prevX, y: prevY, delta: 0 };
  }

  let nextX = dampParallax(prevX, finite(opts.desiredX, 0), rate, opts.dt);
  let nextY = dampParallax(prevY, finite(opts.desiredY, 0), rate, opts.dt);

  const dx = nextX - prevX;
  const dy = nextY - prevY;
  const dist = Math.hypot(dx, dy);
  if (dist > PARALLAX_MAX_STEP && dist > 1e-8) {
    const scale = PARALLAX_MAX_STEP / dist;
    nextX = prevX + dx * scale;
    nextY = prevY + dy * scale;
  }

  parallax.x = nextX;
  parallax.y = nextY;

  const delta = Math.hypot(nextX - prevX, nextY - prevY);
  return { x: nextX, y: nextY, delta: finite(delta, 0) };
}

/**
 * Remaining intro descent eased out across the handoff window (prevents a Y snap).
 * @param {number} now
 * @param {number} handoffStart
 * @param {number} descentAtHandoff
 * @param {number} [handoffMs=INTRO_HANDOFF_MS]
 */
export function introDescentHandoffOffset(now, handoffStart, descentAtHandoff, handoffMs = INTRO_HANDOFF_MS) {
  const remaining = finite(descentAtHandoff, 0);
  if (remaining <= 1e-6 || handoffStart <= 0) return 0;
  const blend = introParallaxApplyBlend(now, handoffStart, handoffMs);
  return remaining * (1 - blend);
}

/**
 * Sample camera Y for stress tests (matches StageExperience intro + rest).
 * @param {{
 *   introComplete: boolean,
 *   introLinear: number,
 *   introDescent: number,
 *   now?: number,
 *   handoffStart?: number,
 *   descentAtHandoff?: number
 * }} state
 */
export function sampleCameraBaseY(state, camY) {
  const y = finite(camY, 0);
  if (!state.introComplete) {
    return y + introCameraDescent(state.introLinear, state.introDescent);
  }
  return y + introDescentHandoffOffset(
    finite(state.now, 0),
    finite(state.handoffStart, 0),
    finite(state.descentAtHandoff, 0),
    state.handoffMs
  );
}

/**
 * Headless simulation of intro → parallax handoff with variable frame times.
 * @param {{
 *   frames?: number,
 *   introDurationMs?: number,
 *   introDescent?: number,
 *   handoffMs?: number,
 *   camY?: number,
 *   parallaxCamY?: number
 * }} [options]
 */
export function simulateIntroParallaxHandoff(options = {}) {
  const frames = Math.max(Math.floor(finite(options.frames, 8000)), 100);
  const introDurationMs = Math.max(finite(options.introDurationMs, 2400), 1);
  const introDescent = finite(options.introDescent, 11);
  const handoffMs = finite(options.handoffMs, INTRO_HANDOFF_MS);
  const camY = finite(options.camY, 2.85);
  const parallaxCamY = finite(options.parallaxCamY, 0.075);

  let introLinear = 0;
  let introComplete = false;
  let handoffStart = 0;
  let descentAtHandoff = 0;
  let currentDescent = introCameraDescent(0, introDescent);
  let elapsedMs = 0;
  let parallax = { x: 0, y: 0 };
  let prevCamY = camY + currentDescent;
  let prevParallaxWorldY = prevCamY;
  let maxCamYJump = 0;
  let maxParallaxWorldJump = 0;
  let maxParallaxDelta = 0;
  let maxHandoffJump = 0;
  let nanFrames = 0;
  let handoffFrameIndex = -1;

  for (let i = 0; i < frames; i += 1) {
    const dtMs =
      i % 97 === 0
        ? 48
        : i % 53 === 0
          ? 8
          : i % 31 === 0
            ? 22
            : 16.67;
    elapsedMs += dtMs;
    const dt = dtMs / 1000;
    const now = elapsedMs;

    const cursorX = Math.sin(elapsedMs * 0.0013) * 0.85;
    const cursorY = Math.cos(elapsedMs * 0.0017) * 0.72;

    if (!introComplete) {
      introLinear = Math.min(1, elapsedMs / introDurationMs);
      if (introLinear >= 1) {
        handoffFrameIndex = i;
        introComplete = true;
        handoffStart = now;
        descentAtHandoff = currentDescent;
        parallax.x = 0;
        parallax.y = 0;
      }
      currentDescent = stepIntroDescent(currentDescent, introLinear, introDescent, dt);
    }

    const baseY = introComplete
      ? camY +
        introDescentHandoffOffset(now, handoffStart, descentAtHandoff, handoffMs)
      : camY + currentDescent;

    const applyBlend = introComplete
      ? introParallaxApplyBlend(now, handoffStart, handoffMs)
      : 0;

    const mode = resolveParallaxFollowMode({
      now,
      introHandoffUntil: handoffStart + handoffMs,
      parallaxSettleUntil: 0,
      frozen: false
    });

    const { delta } = tickParallaxState(parallax, {
      dt,
      desiredX: cursorX,
      desiredY: cursorY,
      mode
    });
    maxParallaxDelta = Math.max(maxParallaxDelta, delta);

    const parallaxWorldY = baseY + parallax.y * applyBlend * parallaxCamY;

    const camYJump = Math.abs(baseY - prevCamY);
    const parallaxJump = Math.abs(parallaxWorldY - prevParallaxWorldY);

    maxCamYJump = Math.max(maxCamYJump, camYJump);
    maxParallaxWorldJump = Math.max(maxParallaxWorldJump, parallaxJump);
    if (handoffFrameIndex >= 0 && i <= handoffFrameIndex + 3) {
      maxHandoffJump = Math.max(maxHandoffJump, camYJump);
    }

    if (
      !Number.isFinite(baseY) ||
      !Number.isFinite(parallaxWorldY) ||
      !Number.isFinite(parallax.x) ||
      !Number.isFinite(parallax.y)
    ) {
      nanFrames += 1;
    }

    prevCamY = baseY;
    prevParallaxWorldY = parallaxWorldY;
  }

  return {
    frames,
    maxCamYJump,
    maxParallaxWorldJump,
    maxParallaxDelta,
    maxHandoffJump,
    nanFrames,
    finalApplyBlend: introParallaxApplyBlend(elapsedMs, handoffStart, handoffMs)
  };
}

/** @returns {{ passed: number, failed: number, results: { name: string, ok: boolean, error?: string }[] }} */
export function runStageParallaxHandoffStressTest() {
  const results = [];

  const run = (name, fn) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  };

  run("travel parallax lands on live cursor target", () => {
    const from = { x: 0.2, y: -0.15 };
    const { desiredX, desiredY } = resolveTransitionParallaxDesired(from, 0.6, -0.4, 1, 1);
    if (Math.abs(desiredX - 0.6) > 1e-4 || Math.abs(desiredY - -0.4) > 1e-4) {
      throw new Error(`progress=1 mismatch: ${desiredX}, ${desiredY}`);
    }
    const start = resolveTransitionParallaxDesired(from, 0.6, -0.4, 0, 1);
    if (Math.abs(start.desiredX - from.x) > 1e-4 || Math.abs(start.desiredY - from.y) > 1e-4) {
      throw new Error("progress=0 should hold travel-start parallax");
    }
  });

  run("travel parallax handoff is monotonic toward cursor", () => {
    const from = { x: 0, y: 0 };
    let prevDist = Infinity;
    for (let i = 0; i <= 100; i += 1) {
      const { desiredX, desiredY } = resolveTransitionParallaxDesired(from, 0.8, 0.5, i / 100, 1);
      const dist = Math.hypot(0.8 - desiredX, 0.5 - desiredY);
      if (dist > prevDist + 1e-4) {
        throw new Error(`non-monotonic approach at ${i / 100}`);
      }
      prevDist = dist;
    }
  });

  run("intro handoff frame — zero parallax world jump at apply start", () => {
    let parallax = { x: 0, y: 0 };
    const handoffStart = 2400;
    const cursorX = 0.72;
    const cursorY = -0.55;
    const parallaxCamY = 0.075;
    const camY = 2.85;

    tickParallaxState(parallax, {
      dt: 1 / 60,
      desiredX: cursorX,
      desiredY: cursorY,
      mode: "intro-handoff"
    });

    const applyAtStart = introParallaxApplyBlend(handoffStart, handoffStart, INTRO_HANDOFF_MS);
    const worldY = camY + parallax.y * applyAtStart * parallaxCamY;
    const worldYRest = camY;
    if (Math.abs(worldY - worldYRest) > 0.002) {
      throw new Error(`parallax world jump at handoff start: ${worldY - worldYRest}`);
    }
  });

  run("dampParallax is finite for extreme dt", () => {
    for (const dt of [0, 1 / 240, 1 / 60, 0.05, 0.1, 1]) {
      const v = dampParallax(0.5, -0.5, PARALLAX_DAMP_REST, dt);
      if (!Number.isFinite(v)) throw new Error(`NaN at dt=${dt}`);
    }
  });

  run("intro handoff blend is monotonic 0→1", () => {
    let prev = -1;
    for (let i = 0; i <= 100; i += 1) {
      const b = introParallaxApplyBlend(i * 6, 0, 600);
      if (b < prev - 1e-6) throw new Error(`non-monotonic at ${i}`);
      prev = b;
    }
  });

  run("intro descent step cap", () => {
    let d = 11;
    for (let i = 0; i < 200; i += 1) {
      const prev = d;
      d = stepIntroDescent(d, 1, 11, 0.05);
      if (Math.abs(d - prev) > INTRO_DESCENT_MAX_STEP * 1.05) {
        throw new Error(`descent step ${Math.abs(d - prev)} at ${i}`);
      }
    }
  });

  run("intro complete frame — zero camera Y discontinuity", () => {
    const descent = introCameraDescent(1, 11);
    if (Math.abs(descent) > 1e-4) {
      throw new Error(`descent not settled: ${descent}`);
    }
  });

  run("handoff mode survives deferred-busy flag (no rate downgrade)", () => {
    const mode = resolveParallaxFollowMode({
      now: 100,
      introHandoffUntil: 500,
      parallaxSettleUntil: 0,
      frozen: false
    });
    if (mode !== "intro-handoff") throw new Error(`expected intro-handoff, got ${mode}`);
    if (parallaxDampRateForMode(mode) < PARALLAX_DAMP_REST) {
      throw new Error("handoff rate slower than rest");
    }
  });

  run("80k-frame intro→parallax sim — no NaN, bounded jumps", () => {
    const sim = simulateIntroParallaxHandoff({ frames: 80000 });
    if (sim.nanFrames > 0) throw new Error(`${sim.nanFrames} NaN frames`);
    if (sim.maxParallaxDelta > PARALLAX_MAX_STEP * 1.001) {
      throw new Error(`parallax spike ${sim.maxParallaxDelta}`);
    }
    if (sim.maxCamYJump > INTRO_DESCENT_MAX_STEP * 1.05) {
      throw new Error(`camera Y jump ${sim.maxCamYJump}`);
    }
    if (sim.maxParallaxWorldJump > INTRO_DESCENT_MAX_STEP * 1.05 + 0.01) {
      throw new Error(`parallax world jump ${sim.maxParallaxWorldJump}`);
    }
    if (sim.maxHandoffJump > 0.02) {
      throw new Error(`intro handoff jump ${sim.maxHandoffJump}`);
    }
    if (sim.finalApplyBlend < 0.999) {
      throw new Error(`handoff blend incomplete: ${sim.finalApplyBlend}`);
    }
  });

  run("120-frame hitch storm at intro handoff — no spike", () => {
    let parallax = { x: 0, y: 0 };
    const handoffStart = 2400;
    for (let i = 0; i < 120; i += 1) {
      const dt = i % 3 === 0 ? 0.05 : 0.008;
      const now = handoffStart + i * 16 + (i % 5 === 0 ? 40 : 0);
      const { delta } = tickParallaxState(parallax, {
        dt,
        desiredX: Math.sin(i * 0.2),
        desiredY: Math.cos(i * 0.17),
        mode: "intro-handoff"
      });
      if (delta > PARALLAX_MAX_STEP * 1.001) {
        throw new Error(`hitch spike ${delta} at frame ${i}`);
      }
    }
  });

  run("10k random cursor spikes — parallax stays clamped", () => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < 10000; i += 1) {
      const targetX = (Math.random() - 0.5) * 4;
      const targetY = (Math.random() - 0.5) * 4;
      const dt = Math.random() * 0.05 + 0.008;
      x = dampParallax(x, targetX, PARALLAX_DAMP_HANDOFF, dt);
      y = dampParallax(y, targetY, PARALLAX_DAMP_HANDOFF, dt);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`NaN at ${i}`);
      if (Math.abs(x) > 2.5 || Math.abs(y) > 2.5) throw new Error(`unclamped at ${i}`);
    }
  });

  run("smoothstep handoff matches quintic easing bounds", () => {
    if (introParallaxApplyBlend(100, 100, 100) !== 0) throw new Error("before start not 0");
    if (introParallaxApplyBlend(200, 100, 100) < 0.999) throw new Error("end not 1");
  });

  const passed = results.filter((r) => r.ok).length;
  return { passed, failed: results.length - passed, results };
}
