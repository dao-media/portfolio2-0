/**
 * CPU port of Bust lawnCoverageAlive — deterministic keep/cull for instance placement.
 * Must stay in sync with GLSL in BustVignette / grass material.
 */

function fract(x) {
  return x - Math.floor(x);
}

function lawnHash(px, py) {
  return fract(Math.sin(px * 127.1 + py * 311.7) * 43758.5453123);
}

function lawnNoise(px, py) {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const a = lawnHash(ix, iy);
  const b = lawnHash(ix + 1, iy);
  const c = lawnHash(ix, iy + 1);
  const d = lawnHash(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy * (1 - ux) + (d - b) * ux * uy;
}

export function lawnFbm(px, py) {
  let v = 0;
  let a = 0.5;
  let x = px;
  let y = py;
  for (let i = 0; i < 4; i++) {
    v += a * lawnNoise(x, y);
    const nx = x * 2.07 + 1.7;
    const ny = y * 2.07 + 9.2;
    x = nx;
    y = ny;
    a *= 0.5;
  }
  return v;
}

/**
 * @param {number} x grass-local X
 * @param {number} z grass-local Z
 * @param {{
 *   radius: number,
 *   coverageNoiseScale: number,
 *   edgeFalloff: number,
 *   stragglerDensity: number,
 *   shapeDistortion: number
 * }} p
 * @returns {boolean}
 */
export function lawnCoverageAlive(x, z, p) {
  const radius = Math.max(p.radius, 1e-4);
  const rNorm = Math.hypot(x, z) / radius;
  const shapeN = lawnFbm(
    x * (p.coverageNoiseScale * 0.22) + 11.3,
    z * (p.coverageNoiseScale * 0.22) + 2.9
  );
  const shapeMul = 1 + p.shapeDistortion * 1.35 * (shapeN * 2 - 1);
  const rShaped = rNorm / Math.max(shapeMul, 0.32);
  const cov = lawnFbm(x * p.coverageNoiseScale + 3.1, z * p.coverageNoiseScale + 7.7);
  const t = Math.min(1.4, Math.max(0, rShaped));
  const edgeT = Math.min(1, Math.max(0, (t - 0.08) / (0.88 - 0.08)));
  const smoothEdge = edgeT * edgeT * (3 - 2 * edgeT);
  let thresh =
    0.06 +
    (0.92 - 0.06) * Math.pow(smoothEdge, Math.max(p.edgeFalloff, 0.25));
  const stragT = Math.min(1, Math.max(0, (t - 0.45) / (1.05 - 0.45)));
  thresh -= p.stragglerDensity * 0.28 * (stragT * stragT * (3 - 2 * stragT));
  thresh = Math.min(0.96, Math.max(0.02, thresh));
  let alive = cov >= thresh ? 1 : 0;
  const cutoff = 0.78 + (1.02 - 0.78) * p.stragglerDensity;
  if (rShaped > cutoff) alive = 0;
  return alive > 0.5;
}

/**
 * Polar silhouette of the main lawn mass (matches blade coverage, not a hard circle).
 * Used for the ground disc so dirt does not stick out past lobed grass edges.
 *
 * @param {{
 *   radius: number,
 *   coverageNoiseScale: number,
 *   edgeFalloff: number,
 *   stragglerDensity: number,
 *   shapeDistortion: number
 * }} p
 * @param {{ segments?: number, shrink?: number }} [opts]
 * @returns {{ x: number, z: number }[]}
 */
export function sampleCoverageOutline(p, opts = {}) {
  const segments = Math.max(24, opts.segments ?? 96);
  const shrink = opts.shrink ?? 0.94;
  const radius = Math.max(p.radius, 1e-4);
  /** @type {{ x: number, z: number }[]} */
  const pts = [];
  // Ignore lone stragglers for the dirt plate — only the contiguous meadow body.
  const body = { ...p, stragglerDensity: 0 };
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let lo = 0;
    let hi = radius;
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) * 0.5;
      if (lawnCoverageAlive(c * mid, s * mid, body)) lo = mid;
      else hi = mid;
    }
    const r = Math.max(lo * shrink, radius * 0.08);
    pts.push({ x: c * r, z: s * r });
  }
  return pts;
}
