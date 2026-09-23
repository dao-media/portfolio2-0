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
   * Soft floor approach (exp path): density *= smoothstep(minY, minY+range, y)^2
   * (squared so the grazing shelf at world-Y ~0.75 stays near zero). Applied
   * AFTER vignette dens replace. Live **1.2** — **3.6** crushed the bank when
   * stacked with a high expK. Bust waterline = plane exclusion.
   */
  { key: "fogFloorFadeRangeY", type: "number", default: 1.2, min: 0.05, max: 6, step: 0.05 },
  /**
   * March upper bound (legacy hard path only). With exp falloff, density and
   * clipYSlab skip this ceiling — leave it high so a rollback to expK≤0 is safe.
   */
  { key: "fogMaxY", type: "number", default: 12.8, min: 0.2, max: 16, step: 0.05 },
  { key: "fogFadeOutRangeY", type: "number", default: 1.2, min: 0.1, max: 4, step: 0.05 },
  { key: "fogFadeOutPow", type: "number", default: 1.2, min: 0.5, max: 4, step: 0.05 },
  { key: "heightFogFactor", type: "number", default: 0.54, min: 0, max: 1, step: 0.01 },
  { key: "heightFogStartY", type: "number", default: -1, min: -1, max: 4, step: 0.05 },
  /**
   * Legacy smoothstep lid end (only when heightFogExpK ≤ 0). Unused while exp
   * falloff is the live default.
   */
  { key: "heightFogEndY", type: "number", default: 0, min: 0, max: 8, step: 0.05 },
  /**
   * Exponential height falloff. Live **0.5** — open neon-lit bank.
   * Was **2.8** during the waterline chase (fog vanished with the soft floor).
   * Bust waterline is plane exclusion (`fogSoftContactRange`), not bank crush.
   */
  { key: "heightFogExpK", type: "number", default: 0.5, min: 0, max: 4, step: 0.01 },
  /**
   * Soft dense-fog top (the ceiling). Live start **0.05** / range **1.8** /
   * floor **0.05** — −60% vs prior start/floor **0.12** (still too high).
   * Do NOT restore hazeFloor **0.55** + range **2.8** (full-screen wash).
   * Keep range ≥**1.8** (tighter lids stamp grazing bands — §20.9b).
   */
  { key: "heightFogHazeStartY", type: "number", default: 0.05, min: 0, max: 8, step: 0.05 },
  { key: "heightFogHazeRangeY", type: "number", default: 1.8, min: 0, max: 8, step: 0.05 },
  /** Residual above haze — **0.05** (−60% from **0.12**). */
  { key: "heightFogHazeFloor", type: "number", default: 0.05, min: 0, max: 1, step: 0.01 },
  { key: "fogDensityMultiplier", type: "number", default: 0.65, min: 0, max: 0.7, step: 0.001 },
  // Cap on march samples. Live spacing = baseMaxRayLength / this (~0.5 m).
  // VolumetricFogPass: fixed world spacing + step count QUANTIZED to buckets of 8
  // from rayLen (not raw per-frame ceil) — near stays cheap, count is temporally
  // stable (raw ceil pulsed fog under camera micro-jitter).
  { key: "baseRaymarchStepCount", type: "number", default: 64, min: 8, max: 128, step: 1 },
  /**
   * Max march length (m). NEVER raise without raising baseRaymarchStepCount —
   * 32/16 undersampled falloffCeilingJitter + globalScale into vertical columns.
   * Lab-clean spacing target ≤~0.7 m/step (32/64 = 0.50). Step count is quantized
   * from rayLen (buckets of 8) with fixed world spacing — do not restore raw
   * per-pixel ceil(rayLen/spacing) (temporal fog flash).
   */
  { key: "baseMaxRayLength", type: "number", default: 32, min: 10, max: 120, step: 1 },
  { key: "noiseBias", type: "number", default: 0.22, min: 0, max: 1, step: 0.01 },
  /**
   * Raises density contrast via pow(noise, p). Higher = puffier separated
   * clouds (scattered depth pockets); lower = even haze wash.
   * Live **2.4** — softer billows; **3.55** stacked into a flat waterline on the bust.
   */
  { key: "noisePow", type: "number", default: 2.4, min: 0.5, max: 4, step: 0.05 },
  /**
   * Lower = larger cloud puffs / bigger voids between (scattered sections).
   * Scatter pass: **1.05** (was Manual 1 **1.45**).
   */
  { key: "globalScale", type: "number", default: 1.05, min: 0.2, max: 4, step: 0.05 },
  { key: "noiseMovementX", type: "number", default: 0.06, min: -0.1, max: 0.1, step: 0.001 },
  { key: "noiseMovementY", type: "number", default: 0.06, min: -0.1, max: 0.1, step: 0.001 },
  /**
   * Multiplies XZ wind scroll (and Y-scroll if used): p.xz += movement * time * speed.
   */
  { key: "noiseSpeed", type: "number", default: 7.95, min: 0, max: 12, step: 0.05 },
  /**
   * Screen-space output dither (Mach banding on fog alpha/RGB). Amp is linear
   * color (±0.5*amp). Textbook 8-bit 1 LSB = ~0.004; 0.02 ≈ 5 LSB.
   * Bayer 4×4 is intentionally STATIC (gl_FragCoord only) — animating with
   * uTime caused the edge/vignette strobe. Do not reintroduce a time offset.
   * MAX SAFE ≈ 0.05 (±12/255). 0 = Mach banding returns. 0.4 = ±100/255 flicker.
   */
  { key: "outputDither", type: "number", default: 0.02, min: 0, max: 0.1, step: 0.002 },
  /**
   * Legacy screen UV block quantize — keep **0**. Chunky composite made objects
   * behind fog look mosaic; digital look lives in density instead.
   */
  { key: "outputPixelSize", type: "number", default: 0, min: 0, max: 32, step: 1 },
  /**
   * World-space digital density (m). Fog is hashed voxels when amount > 0.
   * **0** with amount **0** = soft FBM (default).
   */
  { key: "digitalNoiseCell", type: "number", default: 0.14, min: 0, max: 0.8, step: 0.01 },
  /**
   * 0 = soft volumetric (default), 1 = full digital-noise density (hash cells).
   */
  { key: "digitalNoiseAmount", type: "number", default: 0, min: 0, max: 1, step: 0.05 },
  /**
   * Soft subject density boost — XZ distance only (NO maxY ceiling).
   * A Y cutoff on this multiplier reintroduced §20.9b grazing bands
   * (metric rows ~487–657 ≈ world-Y 0.3–1.7). Fade by radius smoothstep only.
   */
  { key: "subjectWrapRadius", type: "number", default: 4.2, min: 0, max: 10, step: 0.1 },
  /** Density multiply near stop center. Live **2.0** — presence around neon/bust; waterline blocked by plane exclusion. */
  { key: "subjectWrapBoost", type: "number", default: 2, min: 0, max: 4, step: 0.05 },
  /**
   * Height-independent whisper dens in the stop. Live **0** — residual above a
   * low bank re-creates a luminance shelf. Prefer wrap boost + open expK.
   */
  { key: "subjectWrapResidual", type: "number", default: 0, min: 0, max: 1, step: 0.01 },
  /**
   * Unused by march (compat). Was **3.8** Y clamp — do not restore a density
   * multiplier maxY. Knob left high so old tuner saves cannot re-clamp.
   */
  { key: "subjectWrapMaxY", type: "number", default: 12, min: 0.5, max: 16, step: 0.1 },
  /**
   * Domain-warp heightFalloff Y by density noise so blobs churn instead of
   * sitting still while texture scrolls across them. 0 = static slabs;
   * 1.5 = natural movement (pre-lid-fix default restored).
   */
  { key: "falloffNoiseWarp", type: "number", default: 1.85, min: 0, max: 2, step: 0.05 },
  /**
   * Per-pixel XZ jitter of the falloff origin (meters). Live **0.35** — high
   * values (≈1 m) reinforced a flat fog lid through the bust. Keep modest.
   */
  { key: "falloffCeilingJitter", type: "number", default: 0.35, min: 0, max: 6, step: 0.05 },
  /**
   * Camera-distance density fade (m). Soft-out BEFORE baseMaxRayLength so the
   * far-arc march cutoff is not a hard band. MUST stay past Bust grazing floor
   * hits (~10–16 m at rest) — Manual 1 **12→18** projected as density-locked
   * horizontal shelves at rows ~589–623 (§20.9b relapse). Live **24→32**.
   */
  { key: "fogDistFadeStart", type: "number", default: 24, min: 4, max: 80, step: 0.5 },
  { key: "fogDistFadeEnd", type: "number", default: 32, min: 8, max: 120, step: 0.5 },
  /**
   * Near-camera density soft-in (m). Thins fog within this range of the camera
   * so near screen-filling subjects (stop-0 bust / maple) are not crushed
   * opaque. Distant look unchanged past fogNearFadeEnd. 0 end = disabled.
   */
  { key: "fogNearFadeStart", type: "number", default: 0.35, min: 0, max: 8, step: 0.1 },
  { key: "fogNearFadeEnd", type: "number", default: 3.5, min: 0, max: 16, step: 0.25 },
  /**
   * Subject-plane exclusion (m). Live **2.0** — clearGap (~45%) + fade so dens
   * never sits on the opaque depth plane (bust/apples). Fog remains in FRONT
   * of the gap and on miss rays behind/around. Pair with fogEdgeSoft bleed.
   */
  { key: "fogSoftContactRange", type: "number", default: 2, min: 0, max: 6, step: 0.05 },
  /**
   * Screen-space silhouette blend (0–1). Bleeds background (“behind”) fog onto
   * the NEAR side of depth edges so plane exclusion is not a dark cutout.
   * Live **0.9**.
   */
  { key: "fogEdgeSoft", type: "number", default: 0.9, min: 0, max: 1, step: 0.05 },
  /**
   * Packed-depth delta for silhouette detection. Live **0.012**.
   */
  { key: "fogEdgeDepth", type: "number", default: 0.012, min: 0.0001, max: 0.05, step: 0.0001 },
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
 * Fill is hard-clamped to this value — never re-add coreKeep excess above the
 * cap (that strobed bloom as densityScale ramped 0→1 on intro land).
 * `FOG_IN_SCATTER_CORE_KEEP` kept for FogTuner / __stage API compatibility only.
 */
export const FOG_IN_SCATTER_FILL_CAP = 0.88;
export const FOG_IN_SCATTER_CORE_KEEP = 0.22;

/** Density full on land; composite opacity fades over this many ms (no in-scatter ramp). */
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
