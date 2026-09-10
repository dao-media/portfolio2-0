/**
 * Canonical volumetric-fog params — single source of truth for lab + stage.
 * Volatile knobs live here; README §12 cites this module (do not dual-maintain tables).
 *
 * TODO(GATE4-hardware): confirm full-quality default `baseRaymarchStepCount` — 16 vs 12
 *   (pending Dane mid-GPU absolute). Do not hardcode the other value yet.
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
  { key: "fogMinY", type: "number", default: -0.2, min: -2, max: 2, step: 0.05 },
  /**
   * Soft floor approach (exp path): density *= smoothstep(minY, minY+range, y).
   * Kills the grazing bottom slab edge (floor-depth hard stop). Legacy path
   * still hard-zeros below fogMinY.
   */
  { key: "fogFloorFadeRangeY", type: "number", default: 1.2, min: 0.05, max: 4, step: 0.05 },
  /**
   * March upper bound (legacy hard path only). With exp falloff, density and
   * clipYSlab skip this ceiling — leave it high so a rollback to expK≤0 is safe.
   */
  { key: "fogMaxY", type: "number", default: 16, min: 0.2, max: 16, step: 0.05 },
  { key: "fogFadeOutRangeY", type: "number", default: 1.2, min: 0.1, max: 4, step: 0.05 },
  { key: "fogFadeOutPow", type: "number", default: 2.0, min: 0.5, max: 4, step: 0.05 },
  { key: "heightFogFactor", type: "number", default: 0.85, min: 0, max: 1, step: 0.01 },
  { key: "heightFogStartY", type: "number", default: 0.0, min: -1, max: 4, step: 0.05 },
  /**
   * Legacy smoothstep lid end (only when heightFogExpK ≤ 0). Neutralized at
   * schema max while exp falloff is the live default.
   */
  { key: "heightFogEndY", type: "number", default: 8, min: 0, max: 8, step: 0.05 },
  /**
   * Exponential height falloff: amp * exp(-(y - start) * k). Live lid fix —
   * no binary end Y / fogMaxY gate. k 0.18: grazing top contrast ~3
   * (k≥~0.5 re-forms a saturated soft sheet that scores like the old hard lid).
   */
  { key: "heightFogExpK", type: "number", default: 0.18, min: 0, max: 4, step: 0.01 },
  { key: "fogDensityMultiplier", type: "number", default: 0.16, min: 0, max: 0.2, step: 0.001 },
  // TODO(GATE4-hardware): 16 vs 12 — leave 16 until hardware absolute lands.
  { key: "baseRaymarchStepCount", type: "number", default: 16, min: 8, max: 128, step: 1 },
  { key: "baseMaxRayLength", type: "number", default: 40, min: 10, max: 120, step: 1 },
  { key: "noiseBias", type: "number", default: 0.28, min: 0, max: 1, step: 0.01 },
  { key: "noisePow", type: "number", default: 1.4, min: 0.5, max: 3, step: 0.05 },
  { key: "globalScale", type: "number", default: 1.0, min: 0.2, max: 4, step: 0.05 },
  { key: "noiseMovementX", type: "number", default: 0.02, min: -0.1, max: 0.1, step: 0.001 },
  { key: "noiseMovementY", type: "number", default: 0.01, min: -0.1, max: 0.1, step: 0.001 },
  /**
   * Multiplies XZ wind scroll (and Y-scroll if used): p.xz += movement * time * speed.
   * Lab: crank this to see fog travel / roil. 1 = committed look.
   */
  { key: "noiseSpeed", type: "number", default: 1, min: 0, max: 12, step: 0.05 },
  /** Screen-space output dither (Mach banding). Separate from Bayer ray-start. */
  { key: "outputDither", type: "number", default: 0, min: 0, max: 0.02, step: 0.0005 },
  /**
   * Warp heightFalloff Y by density noise (fill scramble — weak on the lid).
   */
  { key: "falloffNoiseWarp", type: "number", default: 0, min: 0, max: 1.5, step: 0.05 },
  /**
   * Per-pixel XZ jitter of the falloff origin (meters). Experimental — default 0
   * so lab/stage keep the signed-off density profile.
   */
  { key: "falloffCeilingJitter", type: "number", default: 0, min: 0, max: 6, step: 0.05 },
  /**
   * Fill-side Y-slice offset — kept at 0 (wrong fix for the horizon lid).
   */
  { key: "noiseYSlice", type: "number", default: 0, min: 0, max: 4, step: 0.05 },
  /** Optional time scroll through the Y domain (same FBM, animated slice). */
  { key: "noiseYScroll", type: "number", default: 0, min: -0.2, max: 0.2, step: 0.001 }
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
