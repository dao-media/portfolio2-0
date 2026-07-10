import {
  CAM_Y,
  CAM_Z,
  CAM_REST_BACK,
  CAM_REST_OFFSET_X,
  DESKTOP_REST_EXTRA_BACK
} from "./constants.js";
import { clamp, finite } from "./stageScrollUtils.js";

/** Total vertical drop from pageload aerial POV to ground rest (meters). */
export const INTRO_TRACK_DESCENT = 11;

/** Track progress where cursor parallax begins easing onto the POV. */
export const INTRO_PARALLAX_TRACK_START = 0.78;

/** Extra settle time after the main drop — brief parallax blend only (ms). */
export const INTRO_TRACK_SETTLE_MS = 420;

/** Track progress when silent model integration may begin. */
export const INTRO_MODEL_INTEGRATE_TRACK = 0.38;

/** Track progress when mounted models begin fading in. */
export const INTRO_MODEL_REVEAL_TRACK = 0.58;

/**
 * @param {Array<[number, number]>} keyframes — [t, value] pairs, t in 0→1
 * @param {number} t
 */
export function interpolateTrackKeyframes(keyframes, t) {
  const u = clamp(finite(t, 0), 0, 1);
  if (!keyframes.length) return 0;
  if (u <= keyframes[0][0]) return finite(keyframes[0][1], 0);
  if (u >= keyframes[keyframes.length - 1][0]) {
    return finite(keyframes[keyframes.length - 1][1], 0);
  }

  for (let i = 0; i < keyframes.length - 1; i += 1) {
    const t0 = keyframes[i][0];
    const v0 = finite(keyframes[i][1], 0);
    const t1 = keyframes[i + 1][0];
    const v1 = finite(keyframes[i + 1][1], 0);
    if (u < t0 || u > t1) continue;
    const span = Math.max(t1 - t0, 1e-6);
    const local = clamp((u - t0) / span, 0, 1);
    const ease = local * local * (3 - 2 * local);
    return v0 + (v1 - v0) * ease;
  }

  return finite(keyframes[keyframes.length - 1][1], 0);
}

/**
 * Remaining descent fraction at track progress u — ease-out quintic, zero velocity at rest.
 * @param {number} trackT 0→1 linear intro clock
 * @returns {number} 1 at start, 0 at rest
 */
export function introDescentFraction(trackT) {
  const u = clamp(finite(trackT, 0), 0, 1);
  if (u >= 1) return 0;
  if (u <= 0) return 1;
  const remaining = 1 - u;
  return remaining * remaining * remaining * remaining * remaining;
}

/**
 * Overall intro arc easing — kept for tests; motion uses introDescentFraction on linear time.
 * @param {number} linear — elapsed / total motion duration, 0→1
 */
export function introTrackEase(linear) {
  const t = clamp(finite(linear, 0), 0, 1);
  if (t >= 1 - 1e-6) return 1;
  if (t <= 1e-6) return 0;
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Sample the pageload → ground-rest camera track.
 * t=0 aerial, t=1 monolith ground rest (matches _applyCameraPose fast path).
 *
 * @param {number} trackT — 0→1 linear intro clock
 * @param {number} [descent=INTRO_TRACK_DESCENT]
 * @returns {{ x: number, y: number, z: number, descent: number }}
 */
export function sampleIntroGroundTrack(trackT, descent = INTRO_TRACK_DESCENT) {
  const d = finite(descent, INTRO_TRACK_DESCENT);
  const u = clamp(finite(trackT, 0), 0, 1);
  const descentOffset = d * introDescentFraction(u);

  return {
    x: CAM_REST_OFFSET_X,
    y: CAM_Y + descentOffset,
    z: CAM_Z + CAM_REST_BACK,
    descent: descentOffset
  };
}

/**
 * Parallax influence along the intro track — 0 until approach, 1 at ground rest.
 * @param {number} trackT
 */
export function introTrackParallaxBlend(trackT) {
  const u = clamp(finite(trackT, 0), 0, 1);
  if (u <= INTRO_PARALLAX_TRACK_START) return 0;
  const handoff = clamp((u - INTRO_PARALLAX_TRACK_START) / (1 - INTRO_PARALLAX_TRACK_START), 0, 1);
  return handoff * handoff * handoff * (handoff * (handoff * 6 - 15) + 10);
}

/**
 * Vignette rest stops on the shared ground track — Z pullbacks per stop.
 * @param {number} vignetteIndex
 * @param {number} [focusBlend=0]
 */
export function vignetteRestTrackOffset(vignetteIndex, focusBlend = 0) {
  const focus = clamp(finite(focusBlend, 0), 0, 1);
  if (vignetteIndex === 1) {
    return -DESKTOP_REST_EXTRA_BACK * (1 - focus);
  }
  return 0;
}

/**
 * @param {number} trackT
 * @param {number} vignetteIndex
 * @param {number} [focusBlend=0]
 */
export function sampleVignetteRestTrack(trackT, vignetteIndex, focusBlend = 0) {
  const base = sampleIntroGroundTrack(Math.min(trackT, 1));
  const zOffset = vignetteRestTrackOffset(vignetteIndex, focusBlend);
  return {
    x: base.x,
    y: base.y,
    z: base.z + zOffset,
    descent: base.descent,
    parallaxBlend: introTrackParallaxBlend(trackT)
  };
}

/** @returns {{ passed: number, failed: number, results: { name: string, ok: boolean, error?: string }[] }} */
export function runStageCameraTrackStressTest() {
  const results = [];

  const run = (name, fn) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  };

  run("intro track lands at ground rest Y/Z", () => {
    const end = sampleIntroGroundTrack(1);
    if (Math.abs(end.y - CAM_Y) > 1e-4) throw new Error(`y=${end.y}`);
    if (Math.abs(end.z - (CAM_Z + CAM_REST_BACK)) > 1e-4) throw new Error(`z=${end.z}`);
    if (Math.abs(end.x - CAM_REST_OFFSET_X) > 1e-4) throw new Error(`x=${end.x}`);
  });

  run("intro descent fraction is monotonic", () => {
    let prev = Infinity;
    for (let i = 0; i <= 100; i += 1) {
      const f = introDescentFraction(i / 100);
      if (f > prev + 1e-4) throw new Error(`non-monotonic at ${i / 100}`);
      prev = f;
    }
  });

  run("intro descent fraction ends at 0", () => {
    if (introDescentFraction(1) > 1e-4) throw new Error("not 0 at rest");
    if (Math.abs(introDescentFraction(0) - 1) > 1e-4) throw new Error("not 1 at start");
  });

  run("intro track parallax blend ends at 1", () => {
    if (introTrackParallaxBlend(1) < 0.999) throw new Error("blend not 1 at rest");
    if (introTrackParallaxBlend(0) > 1e-4) throw new Error("blend not 0 at start");
  });

  run("intro track ease is monotonic 0→1", () => {
    let prev = -1;
    for (let i = 0; i <= 100; i += 1) {
      const v = introTrackEase(i / 100);
      if (v < prev - 1e-6) throw new Error(`ease non-monotonic at ${i / 100}`);
      prev = v;
    }
  });

  const passed = results.filter((r) => r.ok).length;
  return { passed, failed: results.length - passed, results };
}
