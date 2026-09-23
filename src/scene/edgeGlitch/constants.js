/**
 * Cursor-proximity edge glitch — restored 9/15–9/16 look.
 * Screen-space silhouette SDF (runtime JFA). Opaque subjects have no UV alpha.
 *
 * LOOK = beauty-buffer horizontal tears + RGB split (DigitalGlitch-style).
 * FIELD = L1 diamond at CROSS POINT (spanAlong / spanOut / spanIn).
 * Shift+G → FINALIZE patches exports. Not glitch-gl. Not SubjectDissolvePass.
 */

/** @typedef {{ key: string, constName: string, type: "number", default: number, min: number, max: number, step: number, label: string, hint?: string }} EdgeGlitchParamSpec */

/** Schema for EdgeGlitchTuner + FINALIZE. */
export const EDGE_GLITCH_PARAM_SCHEMA = /** @type {EdgeGlitchParamSpec[]} */ ([
  {
    key: "liquidArmOuter",
    constName: "EDGE_GLITCH_LIQUID_ARM_OUTER",
    type: "number",
    default: 0.15,
    min: 0.02,
    max: 0.28,
    step: 0.001,
    label: "cursor rim arm",
    hint: "Water-cursor rim couple outer gate (SDF). Not a visual liquid layer."
  },
  {
    key: "glitchArmOuter",
    constName: "EDGE_GLITCH_GLITCH_ARM_OUTER",
    type: "number",
    default: 0.06,
    min: 0.01,
    max: 0.2,
    step: 0.001,
    label: "glitch arm",
    hint: "Cursor→edge distance where tears start."
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
    hint: "Proximity power. Higher = weaker until closer to the edge."
  },
  {
    key: "spanAlong",
    constName: "EDGE_GLITCH_SPAN_ALONG",
    type: "number",
    default: 0.028,
    min: 0.006,
    max: 0.12,
    step: 0.001,
    label: "span along (diamond)",
    hint: "Half-extent along the edge tangent from the cross point."
  },
  {
    key: "spanOut",
    constName: "EDGE_GLITCH_SPAN_OUT",
    type: "number",
    default: 0.016,
    min: 0.004,
    max: 0.1,
    step: 0.001,
    label: "span out (outside)",
    hint: "Outside half of the diamond (signed SDF > 0)."
  },
  {
    key: "spanIn",
    constName: "EDGE_GLITCH_SPAN_IN",
    type: "number",
    default: 0.016,
    min: 0.004,
    max: 0.08,
    step: 0.001,
    label: "span in (inside)",
    hint: "Inside half of the diamond (signed SDF < 0)."
  },
  {
    key: "intensity",
    constName: "EDGE_GLITCH_INTENSITY",
    type: "number",
    default: 0.16,
    min: 0,
    max: 0.5,
    step: 0.005,
    label: "tear intensity",
    hint: "Max beauty-buffer horizontal tear at full proximity."
  },
  {
    key: "rgbSplit",
    constName: "EDGE_GLITCH_RGB_SPLIT",
    type: "number",
    default: 0.042,
    min: 0,
    max: 0.12,
    step: 0.001,
    label: "RGB split",
    hint: "Max chromatic sample offset (UV) at full proximity."
  },
  {
    key: "tearBands",
    constName: "EDGE_GLITCH_TEAR_BANDS",
    type: "number",
    default: 88,
    min: 24,
    max: 160,
    step: 1,
    label: "tear bands",
    hint: "Horizontal tear strip count (heights hashed irregular)."
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
/** @deprecated Bilateral rim width retired — diamond spanOut/spanIn own the across axis. */
export const EDGE_GLITCH_BAND_OUTER = 0.028;
export const EDGE_GLITCH_SPAN_ALONG = 0.028;
export const EDGE_GLITCH_SPAN_OUT = 0.016;
export const EDGE_GLITCH_SPAN_IN = 0.016;
/** @deprecated */
export const EDGE_GLITCH_LOCAL_BASE = EDGE_GLITCH_SPAN_ALONG;
/** @deprecated */
export const EDGE_GLITCH_LOCAL_GROWTH = 0;
/** @deprecated */
export const EDGE_GLITCH_CURSOR_OUTER = EDGE_GLITCH_SPAN_ALONG;
/** @deprecated Alias of cursor-rim arm for WaterCursor / stale probes. */
export const EDGE_GLITCH_ARM_OUTER = 0.15;
export const EDGE_GLITCH_LIQUID_ARM_OUTER = 0.15;
export const EDGE_GLITCH_GLITCH_ARM_OUTER = 0.06;
export const EDGE_GLITCH_ARM_RAMP = 1;

export const EDGE_GLITCH_TEAR_BANDS = 88;
export const EDGE_GLITCH_TEAR_BANDS_MAX = 160;
export const EDGE_GLITCH_INTENSITY = 0.16;
export const EDGE_GLITCH_RGB_SPLIT = 0.042;
/** @deprecated px alias unused by restored UV-split look. */
export const EDGE_GLITCH_RGB_SPLIT_PX = 0;
export const EDGE_GLITCH_NOISE_HZ = 16.0;
export const EDGE_GLITCH_OCC_SOFT = 0.004;
export const EDGE_GLITCH_OCC_BIAS = 0.0015;

/** @deprecated Dissolve / Fork-A experiments retired — beauty tear restored. */
export const EDGE_GLITCH_SHEAR_PX = 0;
export const EDGE_GLITCH_FADE_GAIN = 0;
export const EDGE_GLITCH_DROPOUT = 0;
export const EDGE_GLITCH_SYNC_ROLL_PX = 0;
export const EDGE_GLITCH_DISSOLVE_LINE = 0;
export const EDGE_GLITCH_DISSOLVE_LINE_CAP = 0;
export const EDGE_GLITCH_BAND_COUNT = EDGE_GLITCH_TEAR_BANDS;
export const EDGE_GLITCH_REVEAL_BOOST = 1.0;
export const EDGE_GLITCH_TEAR_AMP_PX = 0;
export const EDGE_GLITCH_FRINGE_AMOUNT = 0;
export const EDGE_GLITCH_FRINGE_CAP = 0;
export const EDGE_GLITCH_SCANLINE_AMOUNT = 0;
export const EDGE_GLITCH_SCANLINE_CAP = 0;
export const EDGE_GLITCH_INJECT_AMOUNT = 0;
export const EDGE_GLITCH_BONUS_COUNT = 0;
export const EDGE_GLITCH_BONUS_INTENSITY = 0;
export const EDGE_GLITCH_BONUS_RHYTHM = 16;
export const EDGE_GLITCH_BONUS_MAX = 3;

export const EDGE_GLITCH_STAGE = 3;
export const EDGE_GLITCH_DEBUG = false;
