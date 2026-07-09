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

/** 10 ft above the viewer's head — spotlight origin. */
export const SPOT_HEIGHT_FT = 10;
export const SPOT_HEIGHT_M = SPOT_HEIGHT_FT * 0.3048;
export const SPOT_INTENSITY = 118;
export const SPOT_ANGLE = Math.PI / 5.2;
export const SPOT_PENUMBRA = 0.52;
export const SPOT_DISTANCE = 52;
export const SPOT_DECAY = 1.35;

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
 * Default selective bloom tuning — for SpotlightBloomPass when the lighting pass is wired up.
 * @see stage/SpotlightBloomPass.js
 */
export const SPOTLIGHT_BLOOM = {
  threshold: 0,
  strength: 0.52,
  radius: 0.42
};

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

/** Capture scroll ramps in above this blend; stage scroll resumes below it on exit. */
export const SCROLL_CAPTURE_WHEEL_ON = 0.34;
export const SCROLL_CAPTURE_WHEEL_OFF = 0.52;

/** Wheel must be idle this long before the next vignette step can fire. */
export const WHEEL_GESTURE_IDLE_MS = 320;

/** Second gesture within this window (while at rest) uses the vigorous profile. */
export const VIGOROUS_SCROLL_MS = 160;

/** Normal vignette settle — full duration at rest. */
export const TRANSITION_DURATION = 1.8;

/** Vigorous scroll: faster move (1.35× speed) with half-strength ease. */
export const TRANSITION_VIGOROUS_SPEED = 1.35;

export function vignetteAngle(index, total) {
  return index * ((Math.PI * 2) / total);
}

/** Ring label / readout degrees for vignette stops (0°, 120°, 240°, …). */
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
