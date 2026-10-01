import * as THREE from "three";
import { createRevealStarfield, updateStarfield, CURSOR_TRAIL_SAMPLE_COUNT } from "./ProceduralStarfield.js";

/**
 * Extra field stars uncovered by the cursor smudge. Same look as the sky.
 * Packed across the hold view, not the whole sphere, so the wipe is a sky
 * and not a handful of dots.
 */
export const REVEAL_STAR_COUNT = 16000;
/** Below this cursor speed (px/s) the trail stops sampling new points. */
export const CURSOR_TRAIL_MIN_SPEED = 80;
/** Seconds of recent cursor motion the trail keeps — also the sample max age. */
export const CURSOR_TRAIL_TIME_WINDOW = 0.3;
/** Head circle radius, in pixels before the pixelRatio multiply. */
export const CURSOR_TRAIL_HEAD_RADIUS = 30;
/** Per-sample radius falloff: headRadius * (1 - age/maxAge)^p. */
export const CURSOR_TRAIL_TAPER_EXPONENT = 1.6;
/** Path span clamp, in pixels before the pixelRatio multiply — trims the oldest samples once exceeded. */
export const CURSOR_TRAIL_MAX_LENGTH = 336;

/**
 * Dense sky, hidden until the path-sampled smudge passes over it.
 * Star directions are fixed. Only the mask follows the cursor.
 */
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

export function createCursorStarTrail() {
  const points = createRevealStarfield(REVEAL_STAR_COUNT);
  points.userData.seeded = false;
  // Ring buffer of recent {x, y, t} samples, newest last. t is this
  // trail's own running clock (seconds), not wall time, so it survives
  // frame-rate variation the same way the rest of the tick does.
  points.userData.path = [];
  points.userData.sampleTimer = 0;
  points.userData.clock = 0;
  points.userData.tuning = {
    timeWindow: CURSOR_TRAIL_TIME_WINDOW,
    headRadius: CURSOR_TRAIL_HEAD_RADIUS,
    taperExponent: CURSOR_TRAIL_TAPER_EXPONENT,
    maxLength: CURSOR_TRAIL_MAX_LENGTH
  };
  return points;
}

/**
 * One-time scatter across the settled hold frame. Directions are stored
 * and never moved again.
 * @param {THREE.Points} trail
 * @param {THREE.Camera} camera
 */
function seedRevealField(trail, camera) {
  camera.updateMatrixWorld();
  const pos = trail.geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i += 1) {
    _ndc.set(Math.random() * 2.7 - 1.35, Math.random() * 2.5 - 1.15);
    _raycaster.setFromCamera(_ndc, camera);
    const d = _raycaster.ray.direction;
    pos.setXYZ(i, d.x * 24000, d.y * 24000, d.z * 24000);
  }
  pos.needsUpdate = true;
  trail.userData.seeded = true;
}

/**
 * @param {THREE.Points} trail
 * @param {THREE.Camera} camera
 * @param {number} dt
 * @param {{
 *   active?: boolean,
 *   x?: number,
 *   y?: number,
 *   vx?: number,
 *   vy?: number,
 *   width?: number,
 *   height?: number,
 *   pixelRatio?: number,
 *   presence?: number,
 *   time?: number,
 *   timeWindow?: number,
 *   headRadius?: number,
 *   taperExponent?: number,
 *   maxLength?: number
 * }} [opts]
 */
export function updateCursorStarTrail(trail, camera, dt, opts = {}) {
  const uniforms = trail?.material?.uniforms;
  if (!uniforms || !camera) return;

  const step = Math.min(Math.max(dt, 0), 0.05);
  const speed = Math.hypot(opts.vx || 0, opts.vy || 0);
  const canSeed =
    opts.active &&
    (opts.presence ?? 0) > 0.4 &&
    speed >= CURSOR_TRAIL_MIN_SPEED &&
    Number.isFinite(opts.x) &&
    Number.isFinite(opts.y) &&
    opts.width > 1 &&
    opts.height > 1;

  if (canSeed && !trail.userData.seeded) seedRevealField(trail, camera);

  const tuning = trail.userData.tuning;
  const timeWindow = Math.max(0.05, opts.timeWindow ?? tuning.timeWindow);
  const headRadius = Math.max(1, opts.headRadius ?? tuning.headRadius);
  const taperExponent = Math.max(0.1, opts.taperExponent ?? tuning.taperExponent);
  const maxLength = Math.max(1, opts.maxLength ?? tuning.maxLength);

  const now = (trail.userData.clock += step);
  const path = trail.userData.path;

  // Sample at a fixed rate, not per event, so the buffer represents a real
  // time window of motion rather than however many pointermove events fired.
  const sampleInterval = timeWindow / (CURSOR_TRAIL_SAMPLE_COUNT - 1);
  trail.userData.sampleTimer += step;
  if (canSeed && trail.userData.sampleTimer >= sampleInterval) {
    trail.userData.sampleTimer = 0;
    path.push({ x: opts.x, y: opts.y, t: now });
    while (path.length > CURSOR_TRAIL_SAMPLE_COUNT) path.shift();
  }

  // Age out samples past the window regardless of activity — a stopped
  // cursor shrinks to nothing on its own rather than holding a stale shape.
  while (path.length && now - path[0].t > timeWindow) path.shift();

  // Max-length clamp: trim the oldest samples until the path span (start to
  // head) is back within bounds, scaled by pixelRatio like the old teardrop was.
  const pixelRatio = opts.pixelRatio || 1;
  const maxLenPx = maxLength * pixelRatio;
  while (path.length > 2) {
    const head = path[path.length - 1];
    const tail = path[0];
    if (Math.hypot(head.x - tail.x, head.y - tail.y) <= maxLenPx) break;
    path.shift();
  }

  const open = canSeed || path.length > 0;
  trail.visible = open;
  uniforms.uMaskGain.value = open ? 1 : 0;
  if (!open) return;

  updateStarfield(trail, camera, opts.time ?? 0, {
    lensActive: true,
    horizonFade: false,
    pixelRatio
  });

  uniforms.uViewport.value.set(opts.width || 1, opts.height || 1);
  uniforms.uHeadRadius.value = headRadius * pixelRatio;
  uniforms.uTaperExp.value = taperExponent;

  const pathPx = uniforms.uPathPx.value;
  const pathAge = uniforms.uPathAge.value;
  for (let i = 0; i < CURSOR_TRAIL_SAMPLE_COUNT; i += 1) {
    // Newest sample first, so the head (age 0) sits at the cursor.
    const s = path[path.length - 1 - i];
    if (s) {
      pathPx[i].set(s.x, s.y);
      pathAge[i] = Math.min(1, (now - s.t) / timeWindow);
    } else {
      pathAge[i] = 1; // sentinel: shader skips age >= 1
    }
  }
}
