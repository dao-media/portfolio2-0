import * as THREE from "three";

/** @param {number} value @param {number} fallback */
export function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/** @param {number} value @param {number} min @param {number} max */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return (min + max) * 0.5;
  return Math.min(max, Math.max(min, value));
}

/** DOM_DELTA_* — duplicated for headless stress tests (no WheelEvent in Node). */
const DOM_DELTA_PIXEL = 0;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

/** Normalize wheel deltas across line / pixel / page modes. */
export function normalizeWheelDelta(event, viewportHeight = window.innerHeight) {
  let { deltaY, deltaMode } = event;
  const h = Math.max(finite(viewportHeight, 800), 1);
  if (deltaMode === DOM_DELTA_LINE) deltaY *= 48;
  else if (deltaMode === DOM_DELTA_PAGE) deltaY *= h * 0.85;
  return finite(deltaY, 0);
}

export function smoothstep(edge0, edge1, x) {
  const denom = edge1 - edge0;
  if (Math.abs(denom) < 1e-8) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / denom, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Parallax target in NDC-ish [-1, 1] from client coordinates.
 * Uses canvas rect when provided so raycast + parallax share the same space.
 */
export function parallaxTargetFromClient(clientX, clientY, viewport = {}) {
  const {
    left = 0,
    top = 0,
    width = window.innerWidth,
    height = window.innerHeight
  } = viewport;

  const w = Math.max(finite(width, 1), 1);
  const h = Math.max(finite(height, 1), 1);
  const x = finite(clientX, left + w * 0.5);
  const y = finite(clientY, top + h * 0.5);

  return {
    tx: clamp(((x - left) / w - 0.5) * 2, -2, 2),
    ty: clamp(((y - top) / h - 0.5) * 2, -2, 2)
  };
}

/** Pointer NDC for raycasting from client coords + canvas rect. */
export function pointerNdcFromClient(clientX, clientY, rect) {
  const w = Math.max(finite(rect?.width, 1), 1);
  const h = Math.max(finite(rect?.height, 1), 1);
  const x = finite(clientX, rect.left + w * 0.5);
  const y = finite(clientY, rect.top + h * 0.5);

  return {
    x: clamp(((x - rect.left) / w) * 2 - 1, -1.5, 1.5),
    y: clamp(-((y - rect.top) / h) * 2 + 1, -1.5, 1.5)
  };
}

/**
 * Resolve which vignette index wins when a transition is interrupted.
 * @param {number} progress 0–1
 * @param {number | null} pending target index
 * @param {number} fromIndex
 */
export function resolveInterruptedVignetteIndex(progress, pending, fromIndex) {
  const p = clamp(finite(progress, 0), 0, 1);
  const from = Math.max(0, Math.floor(finite(fromIndex, 0)));
  if (p >= 0.5 && pending != null && Number.isFinite(pending)) {
    return Math.max(0, Math.floor(pending));
  }
  return from;
}

/** @param {{ x?: number, y?: number, tx?: number, ty?: number }} parallax */
export function sanitizeParallax(parallax) {
  parallax.x = clamp(finite(parallax.x, 0), -2, 2);
  parallax.y = clamp(finite(parallax.y, 0), -2, 2);
  if ("tx" in parallax) parallax.tx = clamp(finite(parallax.tx, parallax.x), -2, 2);
  if ("ty" in parallax) parallax.ty = clamp(finite(parallax.ty, parallax.y), -2, 2);
  return parallax;
}

/** @param {number} rotationY */
export function sanitizeWorldRotation(rotationY) {
  if (!Number.isFinite(rotationY)) return 0;
  return rotationY;
}

/** @param {THREE.PerspectiveCamera} camera @param {THREE.Vector3} look */
export function sanitizeCameraPose(camera, look) {
  camera.position.x = clamp(finite(camera.position.x, 0), -50, 50);
  camera.position.y = clamp(finite(camera.position.y, 2.85), -10, 30);
  camera.position.z = clamp(finite(camera.position.z, 18), 5, 80);
  look.x = clamp(finite(look.x, 0), -50, 50);
  look.y = clamp(finite(look.y, 2.35), -10, 30);
  look.z = clamp(finite(look.z, 18), -50, 50);
}
