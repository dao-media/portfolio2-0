/**
 * Canonical volumetric-fog params — single source of truth for lab + stage.
 * Volatile knobs live here; README §12 cites this module (do not dual-maintain tables).
 *
 * TODO(GATE4-hardware): confirm full-quality default `baseRaymarchStepCount` — live
 *   is **64** with `baseMaxRayLength` **32** (≤~0.5 m/step; Manual 1 finalize).
 * TODO(GATE4-hardware): coarse / low-power — fog reduced steps vs OFF
 *   (pending Dane hardware number). Do not hardcode either path yet.
 */

/** @typedef {"boolean" | "number"} FogParamType */

/**
 * @typedef {object} FogParamSpec
 * @property {string} key
 * @property {FogParamType} type
 * @property {boolean|number} default
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 */

/** @type {FogParamSpec[]} */
export const FOG_PARAM_SCHEMA = [
  { key: "halfRes", type: "boolean", default: true },
  { key: "fogMinY", type: "number", default: -0.1, min: -2, max: 2, step: 0.05 },
  /**
   * Soft floor approach (exp path): density *= smoothstep(minY, minY+range, y).
   */
  { key: "fogFloorFadeRangeY", type: "number", default: 2.05, min: 0.05, max: 4, step: 0.05 },
  /**
   * March upper bound (legacy hard path only). With exp falloff, density and
   * clipYSlab skip this ceiling — leave it high so a rollback to expK≤0 is safe.
   */
  { key: "fogMaxY", type: "number", default: 12.8, min: 0.2, max: 16, step: 0.05 },
  { key: "fogFadeOutRangeY", type: "number", default: 1.2, min: 0.1, max: 4, step: 0.05 },
  { key: "fogFadeOutPow", type: "number", default: 1.8, min: 0.5, max: 4, step: 0.05 },
  { key: "heightFogFactor", type: "number", default: 0.54, min: 0, max: 1, step: 0.01 },
  { key: "heightFogStartY", type: "number", default: -1, min: -1, max: 4, step: 0.05 },
  /**
   * Legacy smoothstep lid end (only when heightFogExpK ≤ 0). Unused while exp
   * falloff is the live default.
   */
  { key: "heightFogEndY", type: "number", default: 0, min: 0, max: 8, step: 0.05 },
  /**
   * Exponential height falloff: amp * exp(-(y - start) * k). Higher k = shorter
   * dense column. Paired with haze fade below.
   */
  { key: "heightFogExpK", type: "number", default: 0.37, min: 0, max: 4, step: 0.01 },
  /**
   * Soft dense-fog top (~desk / lower PC). Above this Y, density fades toward
   * heightFogHazeFloor over heightFogHazeRangeY (smoothstep — not a hard lid).
   */
  { key: "heightFogHazeStartY", type: "number", default: 0.5, min: 0, max: 8, step: 0.05 },
  { key: "heightFogHazeRangeY", type: "number", default: 1.8, min: 0, max: 8, step: 0.05 },
  /** Residual density above the haze fade — keep low so it does not read as a tall veil. */
  { key: "heightFogHazeFloor", type: "number", default: 0.25, min: 0, max: 1, step: 0.01 },
  { key: "fogDensityMultiplier", type: "number", default: 0.35, min: 0, max: 0.4, step: 0.001 },
  // Keep step spacing ≤~0.7 m: baseMaxRayLength / baseRaymarchStepCount.
  // 32 / 64 = 0.50 m — Manual 1 (tighter than prior 32/46).
  { key: "baseRaymarchStepCount", type: "number", default: 64, min: 8, max: 128, step: 1 },
  /**
   * Max march length (m). NEVER raise without raising baseRaymarchStepCount —
   * 32/16 undersampled falloffCeilingJitter + globalScale into vertical columns.
   * Lab-clean spacing target ≤~0.7 m/step (32/64 = 0.50).
   */
  { key: "baseMaxRayLength", type: "number", default: 32, min: 10, max: 120, step: 1 },
  { key: "noiseBias", type: "number", default: 0.4, min: 0, max: 1, step: 0.01 },
  /**
   * Raises density contrast via pow(noise, p). 3 = approved cloud look (user
   * verified). Higher values crush thin wisps but risk Mach banding on soft edges.
   */
  { key: "noisePow", type: "number", default: 3, min: 0.5, max: 4, step: 0.05 },
  { key: "globalScale", type: "number", default: 3.25, min: 0.2, max: 4, step: 0.05 },
  { key: "noiseMovementX", type: "number", default: 0.06, min: -0.1, max: 0.1, step: 0.001 },
  { key: "noiseMovementY", type: "number", default: 0.06, min: -0.1, max: 0.1, step: 0.001 },
  /**
   * Multiplies XZ wind scroll (and Y-scroll if used): p.xz += movement * time * speed.
   */
  { key: "noiseSpeed", type: "number", default: 7.95, min: 0, max: 12, step: 0.05 },
  /**
   * Screen-space output dither (Mach banding on fog alpha/RGB). Amp is linear
   * color (±0.5*amp). Textbook 8-bit 1 LSB = ~0.004; 0.02 ≈ 5 LSB — visible
   * smearing of the fog gradient without making the Bayer 4×4 grid flash.
   * MAX SAFE ≈ 0.05 (±12/255, barely invisible). 0.4 = ±100/255 = full flicker.
   */
  { key: "outputDither", type: "number", default: 0.02, min: 0, max: 0.1, step: 0.002 },
  /**
   * Warp heightFalloff Y by density noise — modest so it does not lift the lid.
   */
  { key: "falloffNoiseWarp", type: "number", default: 0, min: 0, max: 1.5, step: 0.05 },
  /**
   * Per-pixel XZ jitter of the falloff origin (meters). Keep low — 6 m of
   * wobble read as a tall ceiling even with a low haze start.
   */
  { key: "falloffCeilingJitter", type: "number", default: 1.2, min: 0, max: 6, step: 0.05 },
  /**
   * Fill-side Y-slice offset — kept at 0.
   */
  { key: "noiseYSlice", type: "number", default: 0, min: 0, max: 4, step: 0.05 },
  /** Optional time scroll through the Y domain (same FBM, animated slice). */
  { key: "noiseYScroll", type: "number", default: -0.019, min: -0.2, max: 0.2, step: 0.001 }
];

/** Committed defaults derived from schema. */
export const FOG_DEFAULTS = Object.freeze(
  Object.fromEntries(FOG_PARAM_SCHEMA.map((s) => [s.key, s.default]))
);

/**
 * Soft luminance cap for in-scatter fill (bloom threshold is 1.0).
 * Fill stays under; near-tube cores keep a fraction of excess so they can still bloom.
 */
export const FOG_IN_SCATTER_FILL_CAP = 0.88;
export const FOG_IN_SCATTER_CORE_KEEP = 0.22;

/** Density fade-in after heavy-effects arm (ms). */
export const FOG_HEAVY_FADE_IN_MS = 400;

/** @returns {Record<string, boolean|number>} mutable copy of committed defaults */
export function createFogParams() {
  return { ...FOG_DEFAULTS };
}

/**
 * Clamp / coerce to schema; drop unknown keys.
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, boolean|number>}
 */
export function clampFogParams(raw) {
  /** @type {Record<string, boolean|number>} */
  const out = {};
  if (!raw || typeof raw !== "object") return { ...FOG_DEFAULTS };
  for (const spec of FOG_PARAM_SCHEMA) {
    const v = raw[spec.key];
    if (spec.type === "boolean") {
      out[spec.key] = typeof v === "boolean" ? v : Boolean(spec.default);
      continue;
    }
    let n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) n = /** @type {number} */ (spec.default);
    if (spec.min != null) n = Math.max(spec.min, n);
    if (spec.max != null) n = Math.min(spec.max, n);
    out[spec.key] = n;
  }
  return out;
}
