import { screenUvToCanvas } from "./screenTextureMap.js";

const GRID_COLS = 28;
const GRID_ROWS = 20;

/** Extra convex bow on each edge — fraction of content width/height. */
export const CRT_WARP_BULGE_X = 0.028;
export const CRT_WARP_BULGE_Y = 0.036;

/** Widen edge sampling on the monitor mesh UV shell. */
const EDGE_UV_TOLERANCE = 0.018;

/**
 * Build a Coons-patch warp that maps a unit square (flat page) onto the curved CRT
 * content opening derived from the monitor mesh edge vertices.
 */
export function buildCrtContentWarp(mesh, contentRect, width, height, bounds, map) {
  if (!mesh?.geometry?.attributes?.uv || !bounds || !contentRect) return null;

  const uvAttr = mesh.geometry.attributes.uv;
  const uSpan = bounds.uMax - bounds.uMin || 1;
  const vSpan = bounds.vMax - bounds.vMin || 1;

  const u0 = bounds.uMin + (contentRect.x / width) * uSpan;
  const u1 = bounds.uMin + ((contentRect.x + contentRect.w) / width) * uSpan;
  const v0 = bounds.vMin + (contentRect.y / height) * vSpan;
  const v1 = bounds.vMin + ((contentRect.y + contentRect.h) / height) * vSpan;

  const toCanvas = (u, v) => {
    const p = screenUvToCanvas({ x: u, y: v }, width, height, bounds, map);
    return { x: p.x, y: p.y };
  };

  const corners = {
    tl: toCanvas(u0, v0),
    tr: toCanvas(u1, v0),
    bl: toCanvas(u0, v1),
    br: toCanvas(u1, v1)
  };

  const edges = {
    top: sampleMeshEdge(uvAttr, (u, v) => Math.abs(v - v0) < EDGE_UV_TOLERANCE, "u", toCanvas),
    bottom: sampleMeshEdge(uvAttr, (u, v) => Math.abs(v - v1) < EDGE_UV_TOLERANCE, "u", toCanvas),
    left: sampleMeshEdge(uvAttr, (u, v) => Math.abs(u - u0) < EDGE_UV_TOLERANCE, "v", toCanvas),
    right: sampleMeshEdge(uvAttr, (u, v) => Math.abs(u - u1) < EDGE_UV_TOLERANCE, "v", toCanvas)
  };

  // Ensure corners anchor each edge; fall back to linear chords if mesh samples are sparse.
  ensureEdgeEndpoints(edges.top, corners.tl, corners.tr, "u", u0, u1);
  ensureEdgeEndpoints(edges.bottom, corners.bl, corners.br, "u", u0, u1);
  ensureEdgeEndpoints(edges.left, corners.tl, corners.bl, "v", v0, v1);
  ensureEdgeEndpoints(edges.right, corners.tr, corners.br, "v", v0, v1);

  applyConvexEdgeBulge(edges, contentRect, CRT_WARP_BULGE_X, CRT_WARP_BULGE_Y);

  const bbox = computeWarpBounds(corners, edges);

  return {
    corners,
    edges,
    bbox,
    uvBounds: { u0, u1, v0, v1 },
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
    contentRect: { ...contentRect }
  };
}

function sampleMeshEdge(uvAttr, filter, sortKey, toCanvas) {
  const raw = [];
  for (let i = 0; i < uvAttr.count; i += 1) {
    const u = uvAttr.getX(i);
    const v = uvAttr.getY(i);
    if (!filter(u, v)) continue;
    const c = toCanvas(u, v);
    raw.push({ u, v, x: c.x, y: c.y });
  }

  raw.sort((a, b) => a[sortKey] - b[sortKey]);

  const deduped = [];
  for (const p of raw) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.abs(p[sortKey] - last[sortKey]) > 0.008) deduped.push(p);
  }
  return deduped;
}

/** Bow each edge midpoint outward to mimic convex CRT glass. */
function applyConvexEdgeBulge(edges, contentRect, bulgeXRatio, bulgeYRatio) {
  const bulgeX = contentRect.w * bulgeXRatio;
  const bulgeY = contentRect.h * bulgeYRatio;

  bulgeHorizontalEdge(edges.top, "u", -bulgeY);
  bulgeHorizontalEdge(edges.bottom, "u", bulgeY);
  bulgeVerticalEdge(edges.left, "v", -bulgeX);
  bulgeVerticalEdge(edges.right, "v", bulgeX);
}

function bulgeHorizontalEdge(edge, key, deltaY) {
  if (!edge.length || Math.abs(deltaY) < 1e-4) return;
  const keyMin = edge[0][key];
  const keyMax = edge[edge.length - 1][key];
  const span = keyMax - keyMin || 1;
  for (const p of edge) {
    const t = (p[key] - keyMin) / span;
    p.y += deltaY * Math.sin(Math.PI * t);
  }
}

function bulgeVerticalEdge(edge, key, deltaX) {
  if (!edge.length || Math.abs(deltaX) < 1e-4) return;
  const keyMin = edge[0][key];
  const keyMax = edge[edge.length - 1][key];
  const span = keyMax - keyMin || 1;
  for (const p of edge) {
    const t = (p[key] - keyMin) / span;
    p.x += deltaX * Math.sin(Math.PI * t);
  }
}

function ensureEdgeEndpoints(edge, start, end, key, keyMin, keyMax) {
  if (!edge.length) {
    edge.push(
      { [key]: keyMin, x: start.x, y: start.y },
      { [key]: keyMax, x: end.x, y: end.y }
    );
    return;
  }
  if (Math.abs(edge[0][key] - keyMin) > 0.002) {
    edge.unshift({ [key]: keyMin, x: start.x, y: start.y });
  } else {
    edge[0].x = start.x;
    edge[0].y = start.y;
  }
  const last = edge[edge.length - 1];
  if (Math.abs(last[key] - keyMax) > 0.002) {
    edge.push({ [key]: keyMax, x: end.x, y: end.y });
  } else {
    last.x = end.x;
    last.y = end.y;
  }
}

function computeWarpBounds(corners, edges) {
  const pts = [
    corners.tl,
    corners.tr,
    corners.bl,
    corners.br,
    ...edges.top,
    ...edges.bottom,
    ...edges.left,
    ...edges.right
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return {
    x: x0,
    y: y0,
    w: Math.max(1, x1 - x0),
    h: Math.max(1, y1 - y0)
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sampleEdge(edge, key, keyMin, keyMax, t) {
  const target = lerp(keyMin, keyMax, t);
  if (edge.length === 1) return { x: edge[0].x, y: edge[0].y };

  if (target <= edge[0][key]) return { x: edge[0].x, y: edge[0].y };
  const last = edge[edge.length - 1];
  if (target >= last[key]) return { x: last.x, y: last.y };

  for (let i = 0; i < edge.length - 1; i += 1) {
    const a = edge[i];
    const b = edge[i + 1];
    if (target >= a[key] && target <= b[key]) {
      const span = b[key] - a[key] || 1;
      const u = (target - a[key]) / span;
      return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) };
    }
  }

  return { x: last.x, y: last.y };
}

/** Map normalized page coords (0–1) to canvas pixels on the curved CRT opening. */
export function evalContentWarp(warp, u, v) {
  if (!warp) return null;

  const { corners, edges, uvBounds } = warp;
  const { u0, u1, v0, v1 } = uvBounds;

  const top = sampleEdge(edges.top, "u", u0, u1, u);
  const bottom = sampleEdge(edges.bottom, "u", u0, u1, u);
  const left = sampleEdge(edges.left, "v", v0, v1, v);
  const right = sampleEdge(edges.right, "v", v0, v1, v);

  const x =
    (1 - v) * top.x +
    v * bottom.x +
    (1 - u) * left.x +
    u * right.x -
    ((1 - u) * (1 - v) * corners.tl.x +
      u * (1 - v) * corners.tr.x +
      (1 - u) * v * corners.bl.x +
      u * v * corners.br.x);

  const y =
    (1 - v) * top.y +
    v * bottom.y +
    (1 - u) * left.y +
    u * right.y -
    ((1 - u) * (1 - v) * corners.tl.y +
      u * (1 - v) * corners.tr.y +
      (1 - u) * v * corners.bl.y +
      u * v * corners.br.y);

  return { x, y };
}

/** Inverse map: canvas pixel → normalized page coords (0–1). */
export function canvasToContentWarp(warp, x, y) {
  if (!warp) return null;

  const cols = warp.gridCols;
  const rows = warp.gridRows;
  let best = null;
  let bestDist = Infinity;

  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const u0 = i / cols;
      const v0 = j / rows;
      const u1 = (i + 1) / cols;
      const v1 = (j + 1) / rows;
      const p00 = evalContentWarp(warp, u0, v0);
      const p10 = evalContentWarp(warp, u1, v0);
      const p01 = evalContentWarp(warp, u0, v1);
      const p11 = evalContentWarp(warp, u1, v1);
      const hit = pointInQuadUv(x, y, p00, p10, p11, p01, u0, v0, u1, v1);
      if (hit) {
        const d = (hit.u - 0.5) ** 2 + (hit.v - 0.5) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = hit;
        }
      }
    }
  }

  return best;
}

function pointInQuadUv(px, py, p00, p10, p11, p01, u0, v0, u1, v1) {
  for (let pass = 0; pass < 2; pass += 1) {
    let lu = 0.5;
    let lv = 0.5;
    for (let k = 0; k < 14; k += 1) {
      const p0 = bilinearPoint(p00, p10, p11, p01, lu, lv);
      const du = 0.001;
      const dv = 0.001;
      const pu = bilinearPoint(p00, p10, p11, p01, lu + du, lv);
      const pv = bilinearPoint(p00, p10, p11, p01, lu, lv + dv);
      const dx = px - p0.x;
      const dy = py - p0.y;
      const j11 = (pu.x - p0.x) / du;
      const j12 = (pv.x - p0.x) / dv;
      const j21 = (pu.y - p0.y) / du;
      const j22 = (pv.y - p0.y) / dv;
      const det = j11 * j22 - j12 * j21;
      if (Math.abs(det) < 1e-8) break;
      lu += (j22 * dx - j12 * dy) / det;
      lv += (-j21 * dx + j11 * dy) / det;
      lu = Math.max(0, Math.min(1, lu));
      lv = Math.max(0, Math.min(1, lv));
    }
    const p = bilinearPoint(p00, p10, p11, p01, lu, lv);
    const dist = (p.x - px) ** 2 + (p.y - py) ** 2;
    if (dist < 36) {
      return {
        u: lerp(u0, u1, lu),
        v: lerp(v0, v1, lv)
      };
    }
    if (pass === 0) {
      lu = 0.25;
      lv = 0.75;
    }
  }
  return null;
}

function bilinearPoint(p00, p10, p11, p01, u, v) {
  return {
    x: (1 - u) * (1 - v) * p00.x + u * (1 - v) * p10.x + u * v * p11.x + (1 - u) * v * p01.x,
    y: (1 - u) * (1 - v) * p00.y + u * (1 - v) * p10.y + u * v * p11.y + (1 - u) * v * p01.y
  };
}

function drawImageTriangle(ctx, image, sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dx0, dy0);
  ctx.lineTo(dx1, dy1);
  ctx.lineTo(dx2, dy2);
  ctx.closePath();
  ctx.clip();

  const denom = sx0 * (sy2 - sy1) + sx1 * (sy0 - sy2) + sx2 * (sy1 - sy0);
  if (Math.abs(denom) < 1e-6) {
    ctx.restore();
    return;
  }

  const m11 = (dx0 * (sy2 - sy1) + dx1 * (sy0 - sy2) + dx2 * (sy1 - sy0)) / denom;
  const m12 = (dy0 * (sy2 - sy1) + dy1 * (sy0 - sy2) + dy2 * (sy1 - sy0)) / denom;
  const m21 = (dx0 * (sx1 - sx2) + dx1 * (sx2 - sx0) + dx2 * (sx0 - sx1)) / denom;
  const m22 = (dy0 * (sx1 - sx2) + dy1 * (sx2 - sx0) + dy2 * (sx0 - sx1)) / denom;
  const dx = (dx0 * (sx2 * sy1 - sx1 * sy2) + dx1 * (sx0 * sy2 - sx2 * sy0) + dx2 * (sx1 * sy0 - sx0 * sy1)) / denom;
  const dy = (dy0 * (sx2 * sy1 - sx1 * sy2) + dy1 * (sx0 * sy2 - sx2 * sy0) + dy2 * (sx1 * sy0 - sx0 * sy1)) / denom;

  ctx.transform(m11, m12, m21, m22, dx, dy);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

/**
 * Draw a flat captured page bitmap onto the CRT canvas using the curved Coons patch.
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} pageBitmap
 * @param {ReturnType<typeof buildCrtContentWarp>} warp
 * @param {number} srcW
 * @param {number} srcH
 */
export function drawWarpedPage(ctx, pageBitmap, warp, srcW, srcVisibleH, scrollY = 0) {
  if (!warp || !pageBitmap) return;

  const cols = warp.gridCols;
  const rows = warp.gridRows;
  const maxSrcY = pageBitmap.height;

  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const u0 = i / cols;
      const v0 = j / rows;
      const u1 = (i + 1) / cols;
      const v1 = (j + 1) / rows;

      const d00 = evalContentWarp(warp, u0, v0);
      const d10 = evalContentWarp(warp, u1, v0);
      const d01 = evalContentWarp(warp, u0, v1);
      const d11 = evalContentWarp(warp, u1, v1);

      const sx0 = u0 * srcW;
      const sx1 = u1 * srcW;
      const sy0 = Math.min(maxSrcY, scrollY + v0 * srcVisibleH);
      const sy1 = Math.min(maxSrcY, scrollY + v1 * srcVisibleH);

      drawImageTriangle(ctx, pageBitmap, sx0, sy0, sx1, sy0, sx1, sy1, d00.x, d00.y, d10.x, d10.y, d11.x, d11.y);
      drawImageTriangle(ctx, pageBitmap, sx0, sy0, sx1, sy1, sx0, sy1, d00.x, d00.y, d11.x, d11.y, d01.x, d01.y);
    }
  }
}
