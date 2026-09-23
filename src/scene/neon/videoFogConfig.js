/**
 * Alpha VideoTexture fog trial — scene-anchored per-vignette sheets.
 * Master: masters/video-fog/seamless-low-cloud-loop-with-alpha-channel.mov
 * Web:   public/assets/video/fog/cloud-loop.{webm,mp4}
 *         (RGB carries fog density as grayscale so WebGL works even when
 *          browsers strip VP9/HEVC alpha from VideoTexture.)
 */

/** Public URLs (Vite root). Prefer WebM (VP9); MP4 is HEVC+alpha for Safari. */
export const VIDEO_FOG_SRC = Object.freeze({
  webm: "/assets/video/fog/cloud-loop.webm",
  mp4: "/assets/video/fog/cloud-loop.mp4"
});

/**
 * Native frame aspect (width / height). Matches cloud-loop 1280×720; live video
 * metadata overrides once ready. Width stays frustum-wide; height is capped
 * (`HEIGHT_MAX`) so the bank stays a low apron — not a full-aspect wall into
 * the canopy.
 */
export const VIDEO_FOG_ASPECT = 1280 / 720;

/**
 * Max sheet height (m). Window-wide width at native aspect was ~7–11 m tall and
 * parked the surviving fog in the tree. Cap keeps a ground bank.
 */
export const VIDEO_FOG_HEIGHT_MAX = 2.6;

/**
 * Minimum front-layer width (m) if frustum sizing is unavailable. Live width is
 * frustum width at the sheet × FRONT_WIDTH_OVERSCAN.
 */
export const VIDEO_FOG_SIZE_X = 12;

/**
 * Front sheet spans this × the *visible* fog core at sheet depth. Combined with
 * EDGE_FEATHER compensation so the soft bank still reads window-wide (not a
 * tiny center cloud).
 */
export const VIDEO_FOG_FRONT_WIDTH_OVERSCAN = 1.08;

/** Bottom of mid/back sheets (world Y). Slightly below 0 so banks meet the apron. */
export const VIDEO_FOG_Y = -0.05;

/**
 * Soft-contact fade distance (m). **0 = off.** Ground-fog luma is coplanar with
 * the apron; any soft distance > 0 zeros that band.
 */
export const VIDEO_FOG_SOFT_DISTANCE = 0;

/**
 * Pull each stop radially toward the ring exterior (toward the resting POV) so
 * sheets sit in open air in front of the vignette, not inside the subject.
 */
export const VIDEO_FOG_PULL = 1.4;

/** Multiplies recovered density (0–1). Back-most layer uses this full value. */
export const VIDEO_FOG_OPACITY = 0.252;

/** Stacked sheets for thickness. */
export const VIDEO_FOG_LAYER_COUNT = 3;

/** Push each deeper layer away from the camera along the stop look (−local Z). */
export const VIDEO_FOG_LAYER_DEPTH = 1.15;

/**
 * Scale multiplier per deeper layer (front = 1, L=1 → growth, L=2 → growth²…).
 * Deeper frames read larger in the scene, not smaller. Height still capped.
 */
export const VIDEO_FOG_LAYER_SCALE_GROWTH = 1.32;

/**
 * Per-layer opacity: front = OPACITY × falloff^(n−1), back = OPACITY.
 * Front layers stay thinner so depth reads through the stack.
 */
export const VIDEO_FOG_LAYER_OPACITY_FALLOFF = 0.65;

/**
 * UV edge mask (0–0.5). Large feather so each sheet dissolves instead of
 * reading as a hard rectangle.
 */
export const VIDEO_FOG_EDGE_FEATHER = 0.42;

/**
 * Bottom-edge dissolve (UV Y from 0 → feather). Soft apron cut without erasing
 * the ground-fog band (0.62 left only the canopy wisps).
 */
export const VIDEO_FOG_BOTTOM_FEATHER = 0.28;

/**
 * Match CameraRig `parallax.maxOffset` (StageExperience ≈ 0.245). Used only to
 * bake the fixed front-sheet bottom below the rest-POV frustum.
 */
export const VIDEO_FOG_PARALLAX_MAX = 0.245;

/**
 * Extra meters below the rest-POV worst-case screen-bottom hit.
 */
export const VIDEO_FOG_FRONT_EDGE_PAD = 0.45;

/**
 * Fixed world Y for the **front** sheet’s bottom edge (scene-anchored). Slightly
 * below mid/back so the soft edge sits under the apron; short `HEIGHT_MAX` banks
 * no longer need the old −1.2 bury (that shoved surviving fog into the canopy).
 * Mid/back layers keep VIDEO_FOG_Y.
 */
export const VIDEO_FOG_FRONT_Y = -0.35;

/**
 * Arrive travel (0→1 with neon): delay between layer starts in arrive-space.
 * Back leads; front trails. Paired with ARRIVE_EASE for a slow ramp (not a pop).
 */
export const VIDEO_FOG_ARRIVE_STAGGER = 0.36;

/**
 * Pow on each layer’s smoothstep arrive ( >1 = slower early fade / grow ).
 */
export const VIDEO_FOG_ARRIVE_EASE = 2.4;

/** Scale fraction at layer arrive t=0. */
export const VIDEO_FOG_ARRIVE_SCALE_MIN = 0.12;

/** Land composite fade for video fog (ms) — slower than volumetric’s 400. */
export const VIDEO_FOG_FADE_IN_MS = 1200;

/** Tint — cool fill that still reads under neon (additive path). */
export const VIDEO_FOG_TINT = 0xd0dae6;

/**
 * Opacity vs distance to the stop neon (world XZ). Core stays dense; wings thin.
 * `MIN`/`MAX` multiply base layer opacity (MAX can boost the tube apron).
 */
export const VIDEO_FOG_NEON_RADIUS = 2.5;
export const VIDEO_FOG_NEON_FEATHER = 6.0;
export const VIDEO_FOG_NEON_MIN = 0.18;
export const VIDEO_FOG_NEON_MAX = 1.2;

/**
 * How strongly fog tint pulls toward the live neon color near the tube
 * (× arrive × proximity). Real-world scatter — not a full recolor of the bank.
 */
export const VIDEO_FOG_NEON_COLOR_MIX = 0.85;
