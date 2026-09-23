/**
 * Dynamic accent lighting — rim + sweep + fog shaft (stop 0 first).
 * Accents only — does NOT restore ambient / hemi / IBL fill.
 * Live tune via AccentTuner (Shift+A) → FINALIZE patches these exports.
 */

/** @typedef {{
 *   key: string,
 *   constName: string,
 *   type: "number",
 *   default: number,
 *   min: number,
 *   max: number,
 *   step: number,
 *   label: string,
 *   hint?: string
 * }} AccentParamSpec */

/** Schema for AccentTuner + FINALIZE. */
export const ACCENT_PARAM_SCHEMA = /** @type {AccentParamSpec[]} */ ([
  {
    key: "enabled",
    constName: "ACCENT_ENABLED",
    type: "number",
    default: 1,
    min: 0,
    max: 1,
    step: 1,
    label: "enabled",
    hint: "1 = accents on (stop 0). 0 = all accent lights intensity 0."
  },
  {
    key: "rimCount",
    constName: "ACCENT_RIM_COUNT",
    type: "number",
    default: 1,
    min: 0,
    max: 2,
    step: 1,
    label: "rim count",
    hint: "1–2 silhouette SpotLights. Dropped by setWorkQuality on low power."
  },
  {
    key: "rimIntensity",
    constName: "ACCENT_RIM_INTENSITY",
    type: "number",
    default: 14,
    min: 0,
    max: 120,
    step: 0.05,
    label: "rim intensity",
    hint: "Primary rim SpotLight intensity. Tight angle — edge only."
  },
  {
    key: "rim2Mul",
    constName: "ACCENT_RIM2_MUL",
    type: "number",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
    label: "rim 2 mul",
    hint: "Second rim intensity = rimIntensity × this."
  },
  {
    key: "rimColorR",
    constName: "ACCENT_RIM_COLOR_R",
    type: "number",
    default: 0.37,
    min: 0,
    max: 1,
    step: 0.01,
    label: "rim color R",
    hint: "Cyan-ish rim — separates silhouette from black."
  },
  {
    key: "rimColorG",
    constName: "ACCENT_RIM_COLOR_G",
    type: "number",
    default: 0.94,
    min: 0,
    max: 1,
    step: 0.01,
    label: "rim color G"
  },
  {
    key: "rimColorB",
    constName: "ACCENT_RIM_COLOR_B",
    type: "number",
    default: 1,
    min: 0,
    max: 1,
    step: 0.01,
    label: "rim color B"
  },
  {
    key: "rimDistance",
    constName: "ACCENT_RIM_DISTANCE",
    type: "number",
    default: 3.4,
    min: 0.5,
    max: 10,
    step: 0.05,
    label: "rim distance",
    hint: "Spot range (m). Short = edge only, no scene fill."
  },
  {
    key: "rimDecay",
    constName: "ACCENT_RIM_DECAY",
    type: "number",
    default: 2.6,
    min: 0.5,
    max: 4,
    step: 0.05,
    label: "rim decay"
  },
  {
    key: "rimAngle",
    constName: "ACCENT_RIM_ANGLE",
    type: "number",
    default: 0.25,
    min: 0.08,
    max: 0.8,
    step: 0.01,
    label: "rim angle (rad)",
    hint: "Cone half-angle. Keep tight so only the silhouette catches."
  },
  {
    key: "rimPenumbra",
    constName: "ACCENT_RIM_PENUMBRA",
    type: "number",
    default: 0.72,
    min: 0,
    max: 1,
    step: 0.01,
    label: "rim penumbra"
  },
  {
    key: "rimBack",
    constName: "ACCENT_RIM_BACK",
    type: "number",
    default: 0.85,
    min: 0,
    max: 4,
    step: 0.05,
    label: "rim back (m)",
    hint: "Meters behind subject along −camera (rim B uses a fraction)."
  },
  {
    key: "rimCamBias",
    constName: "ACCENT_RIM_CAM_BIAS",
    type: "number",
    default: 0.2,
    min: -1,
    max: 2,
    step: 0.05,
    label: "rim cam bias (m)",
    hint: "Positive = toward camera so FrontSide silhouette edges catch the rim."
  },
  {
    key: "rimSide",
    constName: "ACCENT_RIM_SIDE",
    type: "number",
    default: 1.55,
    min: 0,
    max: 3,
    step: 0.05,
    label: "rim side (m)",
    hint: "Lateral offset on the shadow side (away from neon)."
  },
  {
    key: "rimHeight",
    constName: "ACCENT_RIM_HEIGHT",
    type: "number",
    default: 0.05,
    min: -1,
    max: 2,
    step: 0.05,
    label: "rim height (m)",
    hint: "Y offset from subject AABB center (chest), not floor."
  },
  {
    key: "sweepIntensity",
    constName: "ACCENT_SWEEP_INTENSITY",
    type: "number",
    default: 1.45,
    min: 0,
    max: 8,
    step: 0.05,
    label: "sweep intensity",
    hint: "Orbiting accent SpotLight. Subtle — not a strobe."
  },
  {
    key: "sweepColorR",
    constName: "ACCENT_SWEEP_COLOR_R",
    type: "number",
    default: 0.62,
    min: 0,
    max: 1,
    step: 0.01,
    label: "sweep color R"
  },
  {
    key: "sweepColorG",
    constName: "ACCENT_SWEEP_COLOR_G",
    type: "number",
    default: 1,
    min: 0,
    max: 1,
    step: 0.01,
    label: "sweep color G"
  },
  {
    key: "sweepColorB",
    constName: "ACCENT_SWEEP_COLOR_B",
    type: "number",
    default: 0.1,
    min: 0,
    max: 1,
    step: 0.01,
    label: "sweep color B"
  },
  {
    key: "sweepDistance",
    constName: "ACCENT_SWEEP_DISTANCE",
    type: "number",
    default: 2.6,
    min: 0.5,
    max: 8,
    step: 0.05,
    label: "sweep distance"
  },
  {
    key: "sweepDecay",
    constName: "ACCENT_SWEEP_DECAY",
    type: "number",
    default: 2.3,
    min: 0.5,
    max: 4,
    step: 0.05,
    label: "sweep decay"
  },
  {
    key: "sweepAngle",
    constName: "ACCENT_SWEEP_ANGLE",
    type: "number",
    default: 0.34,
    min: 0.08,
    max: 0.9,
    step: 0.01,
    label: "sweep angle (rad)"
  },
  {
    key: "sweepPenumbra",
    constName: "ACCENT_SWEEP_PENUMBRA",
    type: "number",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.01,
    label: "sweep penumbra"
  },
  {
    key: "sweepRadius",
    constName: "ACCENT_SWEEP_RADIUS",
    type: "number",
    default: 2.35,
    min: 0.5,
    max: 6,
    step: 0.05,
    label: "sweep orbit radius"
  },
  {
    key: "sweepHeight",
    constName: "ACCENT_SWEEP_HEIGHT",
    type: "number",
    default: 2.05,
    min: 0.2,
    max: 5,
    step: 0.05,
    label: "sweep height"
  },
  {
    key: "sweepSpeed",
    constName: "ACCENT_SWEEP_SPEED",
    type: "number",
    default: 0.11,
    min: 0,
    max: 0.8,
    step: 0.005,
    label: "sweep speed (rad/s)",
    hint: "Slow drift. reduced-motion freezes angle."
  },
  {
    key: "shaftEnabled",
    constName: "ACCENT_SHAFT_ENABLED",
    type: "number",
    default: 1,
    min: 0,
    max: 1,
    step: 1,
    label: "shaft enabled",
    hint: "Dedicated SpotLight fed into volumetric in-scatter for a defined shaft."
  },
  {
    key: "shaftIntensity",
    constName: "ACCENT_SHAFT_INTENSITY",
    type: "number",
    default: 0.35,
    min: 0,
    max: 4,
    step: 0.05,
    label: "shaft mesh intensity",
    hint: "Direct Spot on meshes — keep low so it stays an accent."
  },
  {
    key: "shaftFogBoost",
    constName: "ACCENT_SHAFT_FOG_BOOST",
    type: "number",
    default: 6.5,
    min: 0,
    max: 20,
    step: 0.1,
    label: "shaft fog boost",
    hint: "Intensity multiplier when feeding VolumetricFogPass (cranks in-scatter)."
  },
  {
    key: "shaftColorR",
    constName: "ACCENT_SHAFT_COLOR_R",
    type: "number",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.01,
    label: "shaft color R"
  },
  {
    key: "shaftColorG",
    constName: "ACCENT_SHAFT_COLOR_G",
    type: "number",
    default: 1,
    min: 0,
    max: 1,
    step: 0.01,
    label: "shaft color G"
  },
  {
    key: "shaftColorB",
    constName: "ACCENT_SHAFT_COLOR_B",
    type: "number",
    default: 0.85,
    min: 0,
    max: 1,
    step: 0.01,
    label: "shaft color B"
  },
  {
    key: "shaftDistance",
    constName: "ACCENT_SHAFT_DISTANCE",
    type: "number",
    default: 5.5,
    min: 1,
    max: 14,
    step: 0.1,
    label: "shaft distance"
  },
  {
    key: "shaftDecay",
    constName: "ACCENT_SHAFT_DECAY",
    type: "number",
    default: 2.2,
    min: 0.5,
    max: 4,
    step: 0.05,
    label: "shaft decay"
  },
  {
    key: "shaftAngle",
    constName: "ACCENT_SHAFT_ANGLE",
    type: "number",
    default: 0.18,
    min: 0.05,
    max: 0.6,
    step: 0.01,
    label: "shaft angle (rad)",
    hint: "Tight cone → defined volumetric shaft."
  },
  {
    key: "shaftPenumbra",
    constName: "ACCENT_SHAFT_PENUMBRA",
    type: "number",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.01,
    label: "shaft penumbra"
  },
  {
    key: "shaftBack",
    constName: "ACCENT_SHAFT_BACK",
    type: "number",
    default: 0.45,
    min: -2,
    max: 3,
    step: 0.05,
    label: "shaft back (m)"
  },
  {
    key: "shaftSide",
    constName: "ACCENT_SHAFT_SIDE",
    type: "number",
    default: -0.35,
    min: -3,
    max: 3,
    step: 0.05,
    label: "shaft side (m)"
  },
  {
    key: "shaftHeight",
    constName: "ACCENT_SHAFT_HEIGHT",
    type: "number",
    default: 3.4,
    min: 0.5,
    max: 8,
    step: 0.05,
    label: "shaft height (m)"
  },
  {
    key: "nearTubeDensityBoost",
    constName: "ACCENT_NEAR_TUBE_DENSITY_BOOST",
    type: "number",
    default: 1.15,
    min: 0,
    max: 4,
    step: 0.05,
    label: "near-tube density boost",
    hint: "Volumetric denser air near active neon. Keep modest — high+wide = lit fog ball cutting the bust."
  },
  {
    key: "nearTubeDensityRadius",
    constName: "ACCENT_NEAR_TUBE_DENSITY_RADIUS",
    type: "number",
    default: 1.1,
    min: 0.2,
    max: 4,
    step: 0.05,
    label: "near-tube density radius",
    hint: "Wider wrap so props stay in denser air (was 0.9)."
  }
]);

export function createAccentParams() {
  return Object.fromEntries(
    ACCENT_PARAM_SCHEMA.map((s) => [s.key, s.default])
  );
}

export const ACCENT_DEFAULTS = Object.freeze(createAccentParams());

export const ACCENT_ENABLED = 1;
export const ACCENT_RIM_COUNT = 1;
export const ACCENT_RIM_INTENSITY = 14;
export const ACCENT_RIM2_MUL = 0.5;
export const ACCENT_RIM_COLOR_R = 0.37;
export const ACCENT_RIM_COLOR_G = 0.94;
export const ACCENT_RIM_COLOR_B = 1;
export const ACCENT_RIM_DISTANCE = 3.4;
export const ACCENT_RIM_DECAY = 2.6;
export const ACCENT_RIM_ANGLE = 0.25;
export const ACCENT_RIM_PENUMBRA = 0.72;
export const ACCENT_RIM_BACK = 0.85;
export const ACCENT_RIM_CAM_BIAS = 0.2;
export const ACCENT_RIM_SIDE = 1.55;
export const ACCENT_RIM_HEIGHT = 0.05;
export const ACCENT_SWEEP_INTENSITY = 1.45;
export const ACCENT_SWEEP_COLOR_R = 0.62;
export const ACCENT_SWEEP_COLOR_G = 1;
export const ACCENT_SWEEP_COLOR_B = 0.1;
export const ACCENT_SWEEP_DISTANCE = 2.6;
export const ACCENT_SWEEP_DECAY = 2.3;
export const ACCENT_SWEEP_ANGLE = 0.34;
export const ACCENT_SWEEP_PENUMBRA = 0.55;
export const ACCENT_SWEEP_RADIUS = 2.35;
export const ACCENT_SWEEP_HEIGHT = 2.05;
export const ACCENT_SWEEP_SPEED = 0.11;
export const ACCENT_SHAFT_ENABLED = 1;
export const ACCENT_SHAFT_INTENSITY = 0.35;
export const ACCENT_SHAFT_FOG_BOOST = 6.5;
export const ACCENT_SHAFT_COLOR_R = 0.55;
export const ACCENT_SHAFT_COLOR_G = 1;
export const ACCENT_SHAFT_COLOR_B = 0.85;
export const ACCENT_SHAFT_DISTANCE = 5.5;
export const ACCENT_SHAFT_DECAY = 2.2;
export const ACCENT_SHAFT_ANGLE = 0.18;
export const ACCENT_SHAFT_PENUMBRA = 0.35;
export const ACCENT_SHAFT_BACK = 0.45;
export const ACCENT_SHAFT_SIDE = -0.35;
export const ACCENT_SHAFT_HEIGHT = 3.4;
export const ACCENT_NEAR_TUBE_DENSITY_BOOST = 1.15;
export const ACCENT_NEAR_TUBE_DENSITY_RADIUS = 1.1;

/** Stops that receive accents (extend later). */
export const ACCENT_STOP_INDICES = Object.freeze([0]);
