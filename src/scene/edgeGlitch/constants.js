/**
 * Cursor-proximity edge glitch — constants.
 * Screen-space silhouette SDF (runtime JFA). Opaque bust has no UV alpha.
 *
 * Look: DigitalGlitch beauty tears + RGB split along the silhouette rim.
 * Local around edge-origin; proximity boosts WIDTH + INTENSITY more than SCALE.
 * Live tune via EdgeGlitchTuner (Shift+G) → FINALIZE patches these exports.
 * Not glitch-gl.
 */

/** @typedef {{ key: string, constName: string, type: "number", default: number, min: number, max: number, step: number, label: string, hint?: string }} EdgeGlitchParamSpec */

/** Schema for EdgeGlitchTuner + FINALIZE. */
export const EDGE_GLITCH_PARAM_SCHEMA = /** @type {EdgeGlitchParamSpec[]} */ ([
  {
    key: "armOuter",
    constName: "EDGE_GLITCH_ARM_OUTER",
    type: "number",
    default: 0.06,
    min: 0.005,
    max: 0.2,
    step: 0.001,
    label: "arm outer (trigger)",
    hint: "Cursor→edge distance before glitch arms. Lower = tighter trigger."
  },
  {
    key: "armRamp",
    constName: "EDGE_GLITCH_ARM_RAMP",
    type: "number",
    default: 1,
    min: 0.25,
    max: 6.0,
    step: 0.05,
    label: "arm ramp exponent",
    hint: "Falloff shape inside the arm. Higher = weaker until closer to the edge."
  },
  {
    key: "localBase",
    constName: "EDGE_GLITCH_LOCAL_BASE",
    type: "number",
    default: 0.032,
    min: 0.01,
    max: 0.2,
    step: 0.001,
    label: "local base (strip width)",
    hint: "Base UV radius of the glitched strip around the edge-origin."
  },
  {
    key: "localGrowth",
    constName: "EDGE_GLITCH_LOCAL_GROWTH",
    type: "number",
    default: 0.042,
    min: 0.0,
    max: 0.1,
    step: 0.001,
    label: "local growth",
    hint: "How much strip radius grows with proximity (keep small vs width/intensity)."
  },
  {
    key: "intensity",
    constName: "EDGE_GLITCH_INTENSITY",
    type: "number",
    default: 0.16,
    min: 0.0,
    max: 0.5,
    step: 0.005,
    label: "intensity",
    hint: "Max beauty-buffer horizontal tear at full proximity."
  }
]);

/** @returns {Record<string, number>} */
export function createEdgeGlitchParams() {
  /** @type {Record<string, number>} */
  const out = {};
  for (const spec of EDGE_GLITCH_PARAM_SCHEMA) {
    out[spec.key] = spec.default;
  }
  return out;
}

export const EDGE_GLITCH_SDF_SIZE = 256;
/** Bilateral rim half-width (SDF) — hugs alpha; deep interior = 0. */
export const EDGE_GLITCH_BAND_OUTER = 0.028;
/**
 * Base local falloff radius from the edge-origin (UV). Soft fade — not a hard box.
 */
export const EDGE_GLITCH_LOCAL_BASE = 0.032;
/**
 * How much local radius grows as cursor nears the edge (small — scale ≪ width/intensity).
 */
export const EDGE_GLITCH_LOCAL_GROWTH = 0.042;
/** @deprecated Alias of LOCAL_BASE for older probes. */
export const EDGE_GLITCH_CURSOR_OUTER = EDGE_GLITCH_LOCAL_BASE;
/**
 * Cursor→edge arm (SDF). Hard gate — outside it the effect is fully off.
 */
export const EDGE_GLITCH_ARM_OUTER = 0.06;
/**
 * Proximity = pow(1 − d/arm, armRamp). Higher = steeper near-edge ramp.
 */
export const EDGE_GLITCH_ARM_RAMP = 1;
/** Horizontal tear strip count. */
export const EDGE_GLITCH_TEAR_BANDS = 88;
/** Max beauty-buffer horizontal tear (at full proximity). */
export const EDGE_GLITCH_INTENSITY = 0.16;
/** Max RGB sample offset (at full proximity). */
export const EDGE_GLITCH_RGB_SPLIT = 0.042;
/** Tear pattern refresh rate. */
export const EDGE_GLITCH_NOISE_HZ = 16.0;
/** Soft window-Z half-width for occlusion fade at rim ∩ occluder. */
export const EDGE_GLITCH_OCC_SOFT = 0.004;
/** Bias so coplanar bust vs scene reads as visible (not half-occluded). */
export const EDGE_GLITCH_OCC_BIAS = 0.0015;
export const EDGE_GLITCH_STAGE = 3;
export const EDGE_GLITCH_DEBUG = false;
