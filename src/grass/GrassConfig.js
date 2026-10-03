/**
 * Bust lawn procedural grass — defaults (Grassworks-class WebGL path).
 * Finite meadow (not infinite tiles). Live knobs in lawnEdgeConfig.js.
 *
 * Patch size → placement radius (more blades fill in).
 * Blade length → instance height + spacing (density tracks blade size).
 * Root stays unscaled so the two never couple.
 */

/**
 * Pass I item 2: this, not GRASS_BASE_CELL/GRASS_MIN_CELL below, is the real
 * lever at Bust's actual settings (bladeLength ~0.13, bladeDensity 2) —
 * `resolveCell` in buildInstances.js estimates lattice candidates before
 * coverage culling and, whenever that estimate exceeds this cap (it does,
 * at the live-tuned density here), *replaces* the cell size with one solved
 * directly from `radius` and this constant, ignoring GRASS_BASE_CELL/
 * GRASS_MIN_CELL entirely — confirmed by edits to those two doing nothing
 * live, while `setLawnEdgeParams({bladeDensity})` changed instance count
 * immediately. Cut 60,000 -> 17,000 to bring the kept count (and so the
 * lawn's beauty+depth triangle total, together with the segments cut below)
 * from 911,120 down near the ~150k target without touching coverage/edge
 * shaping. Before/after crops at rest distance for approval.
 */
export const GRASS_MAX_INSTANCES = 17000;
/** Starting InstancedMesh capacity (grows on demand). */
export const GRASS_INITIAL_CAPACITY = 12000;
/** Unit disc radius at patchScale = 1 (matches BustVignette GRASS_RADIUS cover). */
export const GRASS_BASE_RADIUS = 4.162;
/**
 * Reference blade spacing at bladeLength = 1.
 * Tuned for the ~4 m cover disc. Not the active constraint at Bust's
 * current density (see GRASS_MAX_INSTANCES above) — left at its original
 * value; only matters if a future tuning drops density enough to escape
 * that clamp.
 */
export const GRASS_BASE_CELL = 0.032;
/** Never denser than this — keeps the cover disc fillable under the instance budget. */
export const GRASS_MIN_CELL = 0.028;
/** Blade height in grass-local units at bladeLength = 1. */
export const GRASS_BLADE_HEIGHT = 0.58;
/** Blade base width at bladeLength = 1. */
export const GRASS_BLADE_WIDTH = 0.028;
/** Tip keeps at least this fraction of base half-width (hairline tips shimmer w/o MSAA). */
export const GRASS_BLADE_TIP_WIDTH_FRAC = 0.22;
/** Near-field segment count (LOD0). Pass I: 5 -> 3 (see GRASS_BASE_CELL above). */
export const GRASS_BLADE_SEGMENTS = 3;
/** Tip-weighted wind strength (local units). */
export const GRASS_WIND_STRENGTH = 0.042;
export const GRASS_WIND_SPEED = 0.72;
export const GRASS_WIND_NOISE_SCALE = 1.15;
/** Tip stiffness exponent (higher = only tips move). */
export const GRASS_BLADE_STIFFNESS = 2.1;
/** Base / tip albedo — wider split so neon key doesn’t flatten the meadow. */
export const GRASS_COLOR_BASE = 0x12380e;
export const GRASS_COLOR_TIP = 0x56b82e;
/** Thin ground disc under blades (receives neon + blade shadows).
 * Was near-black (`0x081806`) — shadows could not read. Keep mid-green so
 * neon-lit dirt still shows a darker contact pool under each blade. */
export const GRASS_GROUND_COLOR = 0x2a5224;

/** @deprecated Prefer cell-based placement. */
export const GRASS_GRID_RES = 110;
