/**
 * Bust lawn — live knobs (coverage edge + procedural grass feel).
 * Live tune via LawnEdgeTuner (Shift+L) → FINALIZE patches these exports.
 *
 * Schema `max: null` = no upper bound (slider soft-max auto-extends).
 */

/**
 * @typedef {{
 *   key: string,
 *   constName: string,
 *   type: "number",
 *   default: number,
 *   min: number,
 *   max: number | null,
 *   step: number,
 *   label: string,
 *   hint?: string,
 *   softMax?: number
 * }} LawnEdgeParamSpec
 */

/** Schema for LawnEdgeTuner + FINALIZE. */
export const LAWN_EDGE_PARAM_SCHEMA = /** @type {LawnEdgeParamSpec[]} */ ([
  {
    key: "patchScale",
    constName: "LAWN_PATCH_SCALE",
    type: "number",
    default: 1.59,
    min: 0.15,
    max: null,
    softMax: 3,
    step: 0.01,
    label: "patch size",
    hint: "1 = covers bust + neon + tree. Larger adds an outer ring of blades (uncapped)."
  },
  {
    key: "bladeLength",
    constName: "LAWN_BLADE_LENGTH",
    type: "number",
    default: 0.13,
    min: 0.05,
    max: null,
    softMax: 4,
    step: 0.01,
    label: "grass length",
    hint: "Blade height floor→ceiling (expanded). Soft-max extends past 4."
  },
  {
    key: "bladeDensity",
    constName: "LAWN_BLADE_DENSITY",
    type: "number",
    default: 2,
    min: 0.25,
    max: 4,
    step: 0.05,
    label: "grass density",
    hint: "1 = default spacing. Higher = tighter blades (more instances)."
  },
  {
    key: "tuftAmount",
    constName: "LAWN_TUFT_AMOUNT",
    type: "number",
    default: 0.79,
    min: 0,
    max: 1,
    step: 0.01,
    label: "tufts",
    hint: "How often random taller clumps appear (0 = even height, 1 = frequent tufts)."
  },
  {
    key: "breezeStrength",
    constName: "LAWN_BREEZE_STRENGTH",
    type: "number",
    default: 0.055,
    min: 0,
    max: 0.35,
    step: 0.001,
    label: "breeze strength",
    hint: "Tip-weighted wind displacement."
  },
  {
    key: "breezeSpeed",
    constName: "LAWN_BREEZE_SPEED",
    type: "number",
    default: 0.85,
    min: 0,
    max: 3.5,
    step: 0.01,
    label: "breeze speed",
    hint: "How fast the wind field scrolls / gusts."
  },
  {
    key: "coverageNoiseScale",
    constName: "LAWN_COVERAGE_NOISE_SCALE",
    type: "number",
    default: 3.2,
    min: 0.6,
    max: 10,
    step: 0.1,
    label: "coverage noise scale",
    hint: "Clump / island frequency. Higher = tighter tufts and stragglers."
  },
  {
    key: "edgeFalloff",
    constName: "LAWN_EDGE_FALLOFF",
    type: "number",
    default: 1.05,
    min: 0.4,
    max: 3.5,
    step: 0.05,
    label: "edge threshold falloff",
    hint: "How fast keep-threshold rises with radius (dense center → peaks-only rim)."
  },
  {
    key: "stragglerDensity",
    constName: "LAWN_STRAGGLER_DENSITY",
    type: "number",
    default: 0.47,
    min: 0,
    max: 1,
    step: 0.01,
    label: "straggler density",
    hint: "Lone full-height blades past the main mass."
  },
  {
    key: "shapeDistortion",
    constName: "LAWN_SHAPE_DISTORTION",
    type: "number",
    default: 0.3,
    min: 0,
    max: 1,
    step: 0.01,
    label: "patch shape distortion",
    hint: "Low-freq lobed / pinched outline — kills the round gestalt."
  }
]);

/** @returns {Record<string, number>} */
export function createLawnEdgeParams() {
  /** @type {Record<string, number>} */
  const out = {};
  for (const spec of LAWN_EDGE_PARAM_SCHEMA) {
    out[spec.key] = spec.default;
  }
  return out;
}

/** Footprint vs trio cover (1 = under bust + neon + tree). */
export const LAWN_PATCH_SCALE = 1.59;
/** Blade height multiplier (mesh Y scale). */
export const LAWN_BLADE_LENGTH = 0.13;
/** Placement density vs default spacing (1 = authored cell). */
export const LAWN_BLADE_DENSITY = 2;
/** Random taller clumps (0–1). */
export const LAWN_TUFT_AMOUNT = 0.79;
/** Tip-weighted wind strength. */
export const LAWN_BREEZE_STRENGTH = 0.055;
/** Wind scroll / gust rate. */
export const LAWN_BREEZE_SPEED = 0.85;
/** Coverage FBM frequency (blade XZ). */
export const LAWN_COVERAGE_NOISE_SCALE = 3.2;
/** Power on radial threshold ramp. */
export const LAWN_EDGE_FALLOFF = 1.05;
/** Extra edge survivors (0–1). */
export const LAWN_STRAGGLER_DENSITY = 0.47;
/** Outline lobe / pinch amount (0–1). */
export const LAWN_SHAPE_DISTORTION = 0.3;
