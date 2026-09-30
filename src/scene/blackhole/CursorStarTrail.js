import * as THREE from "three";
import { createRevealStarfield, updateStarfield } from "./ProceduralStarfield.js";

/**
 * Extra field stars uncovered by the cursor smudge. Same look as the sky.
 * Packed across the hold view, not the whole sphere, so the wipe is a sky
 * and not a handful of dots.
 */
export const REVEAL_STAR_COUNT = 16000;
/** Below this blob speed (px/s) the smudge closes. */
export const CURSOR_TRAIL_MIN_SPEED = 80;
/** Flame length in pixels at a crawl and at full momentum. */
export const CURSOR_TRAIL_LENGTH_MIN = 48;
export const CURSOR_TRAIL_LENGTH_MAX = 168;
/** Half-width of the belly, in pixels, at a crawl and at full momentum. */
export const CURSOR_TRAIL_HALF_WIDTH_MIN = 12;
export const CURSOR_TRAIL_HALF_WIDTH_MAX = 42;

/**
 * Dense sky, hidden until the teardrop smudge passes over it.
 * Star directions are fixed. Only the mask follows the blob.
 */
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

export function createCursorStarTrail() {
  const points = createRevealStarfield(REVEAL_STAR_COUNT);
  points.userData.headingX = 1;
  points.userData.headingY = 0;
  points.userData.momentum = 0;
  points.userData.seeded = false;
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
 *   time?: number
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

  const momentumTarget = canSeed ? Math.min(1, (speed - CURSOR_TRAIL_MIN_SPEED) / 720) : 0;
  const momentumK = 1 - Math.exp(-(canSeed ? 7 : 4) * step);
  trail.userData.momentum += (momentumTarget - trail.userData.momentum) * momentumK;
  if (canSeed) {
    const inv = 1 / speed;
    const turn = 1 - Math.exp(-9 * step);
    trail.userData.headingX += (opts.vx * inv - trail.userData.headingX) * turn;
    trail.userData.headingY += (opts.vy * inv - trail.userData.headingY) * turn;
    const hLen = Math.hypot(trail.userData.headingX, trail.userData.headingY) || 1;
    trail.userData.headingX /= hLen;
    trail.userData.headingY /= hLen;
  }

  if (canSeed && !trail.userData.seeded) seedRevealField(trail, camera);

  const momentum = trail.userData.momentum;
  const open = canSeed || momentum > 0.04;
  trail.visible = open;
  uniforms.uMaskGain.value = open ? 1 : 0;
  if (!open) return;

  updateStarfield(trail, camera, opts.time ?? 0, {
    wrap: true,
    horizonFade: false,
    pixelRatio: opts.pixelRatio,
    worldDome: false
  });

  const length = CURSOR_TRAIL_LENGTH_MIN + (CURSOR_TRAIL_LENGTH_MAX - CURSOR_TRAIL_LENGTH_MIN) * momentum;
  const halfWidth =
    CURSOR_TRAIL_HALF_WIDTH_MIN +
    (CURSOR_TRAIL_HALF_WIDTH_MAX - CURSOR_TRAIL_HALF_WIDTH_MIN) * momentum;
  uniforms.uCursorPx.value.set(opts.x || 0, opts.y || 0);
  uniforms.uHeading.value.set(trail.userData.headingX, trail.userData.headingY);
  uniforms.uViewport.value.set(opts.width || 1, opts.height || 1);
  uniforms.uTrailLength.value = length;
  uniforms.uTrailHalf.value = halfWidth;
}
