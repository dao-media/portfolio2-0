/**
 * Water-cursor × glitch-edge RESPONSE curves (blob only — glitch untouched).
 * Live tune via WaterCursorRimTuner (Shift+C) → FINALIZE patches these exports.
 */

/** @typedef {{ key: string, constName: string, type: "number", default: number, min: number, max: number, step: number, label: string, hint?: string }} WaterCursorRimParamSpec */

export const WATER_CURSOR_RIM_PARAM_SCHEMA = /** @type {WaterCursorRimParamSpec[]} */ ([
  {
    key: "blowExponent",
    constName: "WATER_CURSOR_BLOW_EXPONENT",
    type: "number",
    default: 2.8,
    min: 1.0,
    max: 6.0,
    step: 0.05,
    label: "blow exponent",
    hint: "Surface-tension ease-in. Higher = holds round longer, then necks fast near the edge."
  },
  {
    key: "neckPinch",
    constName: "WATER_CURSOR_NECK_PINCH",
    type: "number",
    default: 0.72,
    min: 0.0,
    max: 1.0,
    step: 0.01,
    label: "neck / pinch",
    hint: "Extra lateral squeeze near the edge."
  },
  {
    key: "recoilPushPx",
    constName: "WATER_CURSOR_RECOIL_PUSH_PX",
    type: "number",
    default: 10,
    min: 0,
    max: 48,
    step: 0.5,
    label: "recoil push (px)",
    hint: "Center offset away from the glitch along the SDF gradient."
  },
  {
    key: "slurpBand",
    constName: "WATER_CURSOR_RIM_SLURP_BAND",
    type: "number",
    default: 0.032,
    min: 0.008,
    max: 0.1,
    step: 0.001,
    label: "slurp band",
    hint: "|d| UV half-width of the crossing / neck zone."
  },
  {
    key: "snapThreshold",
    constName: "WATER_CURSOR_SNAP_THRESHOLD",
    type: "number",
    default: 0.01,
    min: 0.002,
    max: 0.05,
    step: 0.001,
    label: "snap threshold",
    hint: "Inside depth past which recoil releases (snap through)."
  }
]);

/** @returns {Record<string, number>} */
export function createWaterCursorRimParams() {
  /** @type {Record<string, number>} */
  const out = {};
  for (const spec of WATER_CURSOR_RIM_PARAM_SCHEMA) {
    out[spec.key] = spec.default;
  }
  return out;
}

/** Back-loaded surface-tension exponent on proximity → blow. */
export const WATER_CURSOR_BLOW_EXPONENT = 2.8;
/** Gate lateral squeeze (0–1). Shader floors waist so the mass stays one blob. */
export const WATER_CURSOR_NECK_PINCH = 0.72;
/** CSS-px center recoil away from glitch at full blow (fight the push — keep modest). */
export const WATER_CURSOR_RECOIL_PUSH_PX = 10;
/** |d| UV half-width of crossing / neck zone. */
export const WATER_CURSOR_RIM_SLURP_BAND = 0.032;
/** Inside |d| past which recoil snaps off. */
export const WATER_CURSOR_SNAP_THRESHOLD = 0.01;

/**
 * Surface-tension resistance: hold round, then give way near the edge.
 * smoothstep then pow — double back-load (ease-in, not linear stretch).
 * @param {number} proximity 0–1 linear arm proximity
 * @param {number} exponent back-loaded power (≥1)
 */
export function rimBlowFromProximity(proximity, exponent = WATER_CURSOR_BLOW_EXPONENT) {
  const p = Math.min(1, Math.max(0, proximity));
  const s = p * p * (3 - 2 * p);
  return Math.pow(s, Math.max(1, exponent));
}
