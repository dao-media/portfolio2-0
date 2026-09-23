/**
 * Wet-concrete arena floor — puddle reflections via roughness map + CubeCamera probe.
 * Does NOT restore POV-spot fill on the floor (layer-masked). Shift+W → FINALIZE.
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
 * }} WetFloorParamSpec */

/** Schema for WetFloorTuner + FINALIZE. */
export const WET_FLOOR_PARAM_SCHEMA = /** @type {WetFloorParamSpec[]} */ ([
  {
    key: "enabled",
    constName: "WET_FLOOR_ENABLED",
    type: "number",
    default: 1,
    min: 0,
    max: 1,
    step: 1,
    label: "enabled",
    hint: "1 = wet MeshStandard floor + probe. 0 = dark matte (no env)."
  },
  {
    key: "envStrength",
    constName: "WET_FLOOR_ENV_STRENGTH",
    type: "number",
    default: 0.03,
    min: 0,
    max: 4,
    step: 0.05,
    label: "reflection strength",
    hint: "CubeCamera envMapIntensity — keep low; neon PointLight speculars drive near-tube puddles."
  },
  {
    key: "roughness",
    constName: "WET_FLOOR_ROUGHNESS",
    type: "number",
    default: 1,
    min: 0.2,
    max: 1,
    step: 0.01,
    label: "roughness base",
    hint: "Multiplies roughnessMap — 1 = map fully owns wet vs dry."
  },
  {
    key: "roughnessInfluence",
    constName: "WET_FLOOR_ROUGHNESS_INFLUENCE",
    type: "number",
    default: 1,
    min: 0,
    max: 1,
    step: 0.01,
    label: "roughness map influence",
    hint: "0 = ignore map (uniform); 1 = puddles from map."
  },
  {
    key: "metalness",
    constName: "WET_FLOOR_METALNESS",
    type: "number",
    default: 0.08,
    min: 0,
    max: 0.4,
    step: 0.01,
    label: "metalness"
  },
  {
    key: "colorGain",
    constName: "WET_FLOOR_COLOR_GAIN",
    type: "number",
    default: 0.12,
    min: 0.05,
    max: 1.2,
    step: 0.01,
    label: "albedo gain",
    hint: "Crush so unlit apron is void-black; only the neon bubble stains puddles."
  },
  {
    key: "normalScale",
    constName: "WET_FLOOR_NORMAL_SCALE",
    type: "number",
    default: 0.7,
    min: 0,
    max: 2,
    step: 0.05,
    label: "normal scale"
  },
  {
    key: "uvRepeat",
    constName: "WET_FLOOR_UV_REPEAT",
    type: "number",
    default: 32,
    min: 4,
    max: 120,
    step: 1,
    label: "UV repeat",
    hint: "Tiles across the large apron. Higher = smaller concrete scale."
  },
  {
    key: "probeSize",
    constName: "WET_FLOOR_PROBE_SIZE",
    type: "number",
    default: 128,
    min: 64,
    max: 256,
    step: 64,
    label: "probe size",
    hint: "CubeCamera resolution per face. 128 is the budget pick."
  },
  {
    key: "probeEveryN",
    constName: "WET_FLOOR_PROBE_EVERY_N",
    type: "number",
    default: 3,
    min: 1,
    max: 8,
    step: 1,
    label: "probe every N frames",
    hint: "Skip frames to keep ~40 FPS. 1 = every frame."
  },
  {
    key: "probeNear",
    constName: "WET_FLOOR_PROBE_NEAR",
    type: "number",
    default: 0.2,
    min: 0.05,
    max: 2,
    step: 0.05,
    label: "probe near"
  },
  {
    key: "probeFar",
    constName: "WET_FLOOR_PROBE_FAR",
    type: "number",
    default: 80,
    min: 20,
    max: 220,
    step: 5,
    label: "probe far"
  }
]);

export function createWetFloorParams() {
  return Object.fromEntries(
    WET_FLOOR_PARAM_SCHEMA.map((s) => [s.key, s.default])
  );
}

export const WET_FLOOR_DEFAULTS = Object.freeze(createWetFloorParams());

export const WET_FLOOR_ENABLED = 1;
export const WET_FLOOR_ENV_STRENGTH = 0.03;
export const WET_FLOOR_ROUGHNESS = 1;
export const WET_FLOOR_ROUGHNESS_INFLUENCE = 1;
export const WET_FLOOR_METALNESS = 0.08;
export const WET_FLOOR_COLOR_GAIN = 0.12;
export const WET_FLOOR_NORMAL_SCALE = 0.7;
export const WET_FLOOR_UV_REPEAT = 32;
export const WET_FLOOR_PROBE_SIZE = 128;
export const WET_FLOOR_PROBE_EVERY_N = 3;
export const WET_FLOOR_PROBE_NEAR = 0.2;
export const WET_FLOOR_PROBE_FAR = 80;

/** Runtime texture URLs (optimized from masters/concrete-6/). */
export const WET_FLOOR_TEX = Object.freeze({
  baseColor: "/assets/textures/concrete-wet/baseColor.jpg",
  roughness: "/assets/textures/concrete-wet/roughness.jpg",
  normal: "/assets/textures/concrete-wet/normal.jpg",
  metallic: "/assets/textures/concrete-wet/metallic.jpg"
});
