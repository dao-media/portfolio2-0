/**
 * Environment + fill starting point for Shift+E.
 * These are the live defaults, not a finished eyeball bake — the tuner logs
 * each change so the numbers can be copied back here after tuning.
 * POV spot, neon, and accent lights are not in this schema.
 */

import {
  AMBIENT_INTENSITY,
  EXPOSURE,
  HEMI_INTENSITY,
  STAGE_ENV_INTENSITY
} from "./constants.js";

/** @typedef {{
 *   key: string,
 *   type: "number",
 *   default: number,
 *   min: number,
 *   max: number,
 *   step: number,
 *   label: string,
 *   hint?: string
 * }} EnvLightParamSpec */

/** Schema for EnvLightTuner. */
export const ENV_LIGHT_PARAM_SCHEMA = /** @type {EnvLightParamSpec[]} */ ([
  {
    key: "environmentIntensity",
    type: "number",
    default: STAGE_ENV_INTENSITY,
    min: 0,
    max: 2,
    step: 0.01,
    label: "environment",
    hint: "scene.environmentIntensity. RoomEnvironment PMREM. 0 = IBL off."
  },
  {
    key: "ambientIntensity",
    type: "number",
    default: AMBIENT_INTENSITY,
    min: 0,
    max: 0.5,
    step: 0.005,
    label: "ambient",
    hint: "Flat white AmbientLight. Env should do this job; keep it near off."
  },
  {
    key: "hemiIntensity",
    type: "number",
    default: HEMI_INTENSITY,
    min: 0,
    max: 0.5,
    step: 0.005,
    label: "hemisphere",
    hint: "Sky 0xd8dce8 / ground STAGE_BG. Tint only."
  },
  {
    key: "exposure",
    type: "number",
    default: EXPOSURE,
    min: 0.4,
    max: 2.2,
    step: 0.01,
    label: "exposure",
    hint: "ACES Filmic toneMappingExposure. Mapping stays ACES."
  }
]);

/** @returns {Record<string, number>} */
export function createEnvLightParams() {
  /** @type {Record<string, number>} */
  const params = {};
  for (const spec of ENV_LIGHT_PARAM_SCHEMA) params[spec.key] = spec.default;
  return params;
}
