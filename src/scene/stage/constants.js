import * as THREE from "three";

export const STAGE_RADIUS = 18;

/** Seamless floor, backdrop, and canvas clear color. */
export const STAGE_BG = 0x141414;

/** Camera sits this far past the look point on +Z — keeps vignette framing when radius changes. */
const CAM_BACKOFF = 8.6 * 1.04;
export const FT_TO_M = 0.3048;

/** Default resting POV — further back and shifted so the vignette sits slightly left of center. */
export const CAM_REST_BACK_FT = 4;
export const CAM_REST_OFFSET_X_FT = 3;
export const CAM_REST_BACK = CAM_REST_BACK_FT * FT_TO_M;
export const CAM_REST_OFFSET_X = CAM_REST_OFFSET_X_FT * FT_TO_M;

export const CAM_Y = 2.85;
/** Close / focused POV on +Z (before resting pullback is applied). */
export const CAM_Z = STAGE_RADIUS + CAM_BACKOFF;
export const CAM_FOV = 42;
/** Near/far — far must clear the studio shell walls (~180 m from rest cam). */
export const CAM_NEAR = 0.1;
export const CAM_FAR = 220;
export const LOOK = new THREE.Vector3(0, 2.35, STAGE_RADIUS);

/** Disabled — vignette moves no longer dolly in/out; use click-to-focus instead. */
export const CAM_TRANSITION_PULLBACK = 0;

/** Pointer parallax — scene shifts with cursor; half of the original travel. */
export const PARALLAX_CAM_X = -0.1375;
export const PARALLAX_CAM_Y = 0.075;
export const PARALLAX_LOOK_X = -0.1;
export const PARALLAX_LOOK_Y = 0.05;

/** Floor disc and degree labels scale with the turntable ring. */
export const STAGE_FLOOR_RADIUS = STAGE_RADIUS * (70 / 9);
export const STAGE_LABEL_RADIUS = STAGE_RADIUS * (11.8 / 9);

/** Fixed world point the POV spotlight always hits — vignettes rotate through this pool. */
export const SPOT_TARGET = LOOK.clone();

export const AMBIENT_INTENSITY = 0.06;
export const HEMI_INTENSITY = 0.04;
export const FILL_INTENSITY = 0;
export const EXPOSURE = 1.18;
/**
 * Neutral RoomEnvironment IBL on `scene.environment`.
 * The CRT cube capture must not be applied to the scene (it recolors every
 * MeshStandard material). Travel pack / T-rex are otherwise black silhouettes
 * against STAGE_BG — they need *some* env fill, but not key light. Spot **118**
 * + ACES **1.18** were tuned without IBL; full-strength RoomEnvironment (1.0)
 * washed every MeshStandard prop to glowing white. Keep this a modest fill.
 */
export const STAGE_ENV_INTENSITY = 0.22;

/** 10 ft above the viewer's head — spotlight origin. */
export const SPOT_HEIGHT_FT = 10;
export const SPOT_HEIGHT_M = SPOT_HEIGHT_FT * 0.3048;
export const SPOT_INTENSITY = 118;
export const SPOT_ANGLE = Math.PI / 5.2;
export const SPOT_PENUMBRA = 0.52;
export const SPOT_DISTANCE = 52;
export const SPOT_DECAY = 1.35;

/**
 * DEV work raster. 1 = full DPR cap. 0.6 draws objects at 60% buffer size.
 * Screen canvases (XP / MySpace / Sidekick SMS) are not scaled.
 */
export const WORK_RENDER_SCALE = 0.6;

/** Real-time shadow map for the POV spot. */
export const SPOT_SHADOW = {
  mapSize: 2048,
  near: 0.35,
  far: SPOT_DISTANCE,
  bias: -0.00006,
  normalBias: 0.028,
  radius: 2.4
};

/** Legacy post mask — disabled; lighting uses SpotLight.castShadow instead. */
export const SPOT_MASK = {
  sharpness: 14,
  edgeWidth: 0.004,
  penumbraScale: 0.12
};

/**
 * Neon fog lives on its own layer so the POV spot cannot wash it grey.
 */
export const NEON_FOG_LAYER = 2;

/** Whole-strip emissive — must sit above bloom luminanceThreshold. */
export const NEON_MAX_EMISSIVE = 3.0;
/** Physical PointLight intensity. If fog/CRT halos: raise height first, then lower this. */
export const NEON_MAX_LIGHT = 10.0;
export const NEON_LIGHT_HEIGHT = 1.0;
export const NEON_LIGHT_DISTANCE = 8;
export const NEON_LIGHT_DECAY = 2;
/** Angular radius (rad) over which a stop light falls from 1 → 0. π = dark on the opposite arc. */
export const NEON_LIGHT_FALLOFF = Math.PI;

/** Bloom in the live composer, ahead of grain. Threshold 1 = only the active tube. */
export const NEON_BLOOM = {
  luminanceThreshold: 1.0,
  luminanceSmoothing: 0.2,
  intensity: 1.2,
  radius: 0.7,
  /** Bloom internals at half res — soft glow hides the scale. Try 0.66 if edges stair-step. */
  resolutionScale: 0.5
};

/** Baked fog atlas — 8×8 tiles, density in .r. Keep N/TILE/COLS/ROWS in lockstep with the runtime shader. */
export const FOG_ATLAS = {
  N: 64,
  TILE: 256,
  COLS: 8,
  ROWS: 8
};

export const NEON_FOG = {
  rInner: 14,
  rOuter: 22,
  y: 0.05,
  albedo: 0.75,
  /** Ground-glow only — haze carries atmosphere. Was 0.85 when the ring was judged alone. */
  opacity: 0.32,
  speed: 1.0,
  /** Spatial scale of the FBM bake over the ~44 m footprint (old 3.0 × 10/44). */
  uScale: 0.7,
  uLoopRadius: 1.5,
  footprint: 44,
  /** Outer radial feather (m). */
  feather: 2.5,
  /**
   * Inner radial feather (m). Wider than outer so the hole edge is a gradient,
   * not a hard strip — do not lower rInner / fill the disc.
   */
  featherInner: 6.0,
  driftAmp: 4.0,
  /**
   * Soft-particle fade distance (m) vs opaque scene depth.
   * Fog alpha → 0 as the ring approaches solid geometry (kills hard cuboid cuts).
   */
  softFade: 2.0,
  /**
   * World-XZ distance fade vs camera (m). Near arc at rest is ~6–14 m; far arc
   * ~42–50 m. Fade **20 → 36** sits in the dead gap — far/horizon band dies,
   * near pool stays full.
   */
  distFadeStart: 20,
  distFadeEnd: 36,
  /**
   * Y-billboard haze cards — atmosphere. Ring is ground-glow only.
   */
  hazeCount: 20,
  hazeCountCoarse: 12,
  hazeHeight: 6,
  hazeWidth: 5,
  hazeRadius: 18,
  hazeOpacity: 0.2,
  hazeCull: 0.08
};

/** Page-load gate: assets + fog bake cannot beat this wall-clock minimum. */
export const BOOT_MIN_MS = 2600;

/** Ignore normalized deltas below this (trackpad noise). */
export const WHEEL_MIN_DELTA = 1;

/** Ease into scroll-capture (CRT / Sidekick) — wheel handoff only. */
export const SCROLL_CAPTURE_BLEND_IN = 0.72;
export const SCROLL_CAPTURE_BLEND_OUT = 0.82;

/** Realtime parallax dial when entering/leaving no-scroll zones. */
export const PARALLAX_CAPTURE_IN = 0.088;
export const PARALLAX_CAPTURE_OUT = 0.062;
export const PARALLAX_FOLLOW = 0.045;
export const PARALLAX_FOLLOW_SETTLING = 0.11;
/** Faster parallax catch-up right after a vignette transition lands. */
export const PARALLAX_POST_TRANSITION_FOLLOW = 0.135;
export const PARALLAX_POST_TRANSITION_MS = 620;

/** Brief ramp after intro — parallax influence eases onto the resting POV (ms). */
export const INTRO_HANDOFF_MS = 680;
export const INTRO_PARALLAX_HANDOFF_FOLLOW = 0.14;
/** Brief pause at aerial POV so first-frame GPU compile doesn't hitch the drop. */
export const INTRO_SPRING_HOLD_MS = 240;
/**
 * Post-land delays — keep the ease-out / settle frames free of GPU upload and
 * cursor init. Deferred GLB fetch starts in `_initLoadGate`, not here.
 */
export const INTRO_POST_LAND_WARM_MS = 900;
export const INTRO_POST_LAND_CURSOR_MS = 720;
/** @deprecated — fetches no longer gate on descent progress; kept for stress docs. */
export const INTRO_MODEL_FETCH_TRACK = 1.1;
/** @deprecated — texture warm is post-land only. */
export const INTRO_ASSET_WARM_TRACK = 1.1;
/** Keep the post-intro frame lean until deferred integration finishes. */
export const INTRO_SETTLE_GRACE_MS = 1200;
/** Extra pause after handoff + settle before model integration begins. */
export const INTRO_INTEGRATION_DELAY_MS = 500;
/** Delay CRT / screen-light GPU work until models have been visible for a beat. */
export const INTRO_HEAVY_EFFECTS_DELAY_MS = 2000;
/** Defer Sidekick screen atlas bake until after the intro reveal. */
export const INTRO_SIDEKICK_BAKE_DELAY_MS = 4500;
/** Max wait before deferred intro work runs (avoid idle firing mid-handoff). */
export const INTRO_DEFERRED_IDLE_TIMEOUT_MS = 5000;
/** Meshes upgraded per frame during PC material integration. */
export const INTRO_MATERIAL_BATCH_SIZE = 1;
/** Extra display frames to yield between material batches (spreads GPU upload). */
export const INTRO_MATERIAL_YIELD_FRAMES = 2;

/** Desktop click-to-focus — boot gating and parallax lock threshold. */
export const FOCUS_BLEND_THRESHOLD = 0.85;
export const FOCUS_ENTER_DURATION = 0.72;
export const FOCUS_EXIT_DURATION = 0.82;
/** Extra resting distance on the desktop vignette only — fades out during focus so boot zoom is unchanged. */
export const DESKTOP_REST_EXTRA_BACK = 3 * FT_TO_M;
/** Parallax travel retained at full zoom — scene still follows the cursor, softly. */
export const DESKTOP_FOCUS_PARALLAX_SCALE = 0.38;
export const FOCUS_PARALLAX_EASE_DURATION = 0.28;

/** Capture scroll ramps in above this blend; stage scroll resumes below it on exit. */
export const SCROLL_CAPTURE_WHEEL_ON = 0.34;
export const SCROLL_CAPTURE_WHEEL_OFF = 0.52;

/** Wheel must be idle this long before the next vignette step can fire. */
export const WHEEL_GESTURE_IDLE_MS = 320;

/** Second gesture within this window (while at rest) uses the vigorous profile. */
export const VIGOROUS_SCROLL_MS = 160;

/** Accumulated opposing wheel delta required to interrupt an in-flight transition. */
export const WHEEL_REVERSE_INTERRUPT_DELTA = 96;

/** Ignore reverse scroll until the move has started (ms or progress — whichever comes first). */
export const TRANSITION_COMMIT_MS = 200;
export const TRANSITION_COMMIT_PROGRESS = 0.07;

/** Normal vignette settle — full duration at rest. */
export const TRANSITION_DURATION = 1.8;

/** Vigorous scroll: faster move (1.35× speed) with half-strength ease. */
export const TRANSITION_VIGOROUS_SPEED = 1.35;

export function vignetteAngle(index, total) {
  return index * ((Math.PI * 2) / total);
}

/** Ring label / readout degrees for vignette stops (0°, 90°, 180°, 270°, …). */
export function vignetteStageDegrees(index, total) {
  return index * (360 / total);
}

/** World Y rotation that brings `index` to the POV at +Z. */
export function vignetteAnchorRotation(index, total) {
  return -THREE.MathUtils.degToRad(vignetteStageDegrees(index, total));
}

/** Signed delta from `fromY` to `anchorY`, honoring scroll direction when paths differ. */
export function rotationDeltaToAnchor(fromY, anchorY, dirHint) {
  let delta = anchorY - fromY;
  delta = THREE.MathUtils.euclideanModulo(delta + Math.PI, Math.PI * 2) - Math.PI;
  if (dirHint == null) return delta;
  if (dirHint === 1 && delta < 0) return delta;
  if (dirHint === -1 && delta > 0) return delta;
  if (dirHint === 1 && delta > 0) delta -= Math.PI * 2;
  if (dirHint === -1 && delta < 0) delta += Math.PI * 2;
  return delta;
}

/** Place each vignette on the turntable ring, facing the center. */
export function placeOnStage(group, index, total) {
  const angle = vignetteAngle(index, total);
  group.position.set(Math.sin(angle) * STAGE_RADIUS, 0, Math.cos(angle) * STAGE_RADIUS);
  group.rotation.y = angle;
  return angle;
}
