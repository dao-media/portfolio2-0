/**
 * Map a `w × h` DOM element onto an arbitrary (perspective) quad via a CSS
 * `matrix3d`. Standard 4-point-correspondence projective transform ("general
 * 2D projection"): solve a 3×3 homography from the unit square to each of
 * the source and destination quads, then combine. The element must be
 * positioned at its own (0,0) with `transform-origin: 0 0` — the transform
 * assumes its untransformed box occupies `[0,w] × [0,h]`.
 *
 * No `perspective` CSS is needed: `matrix3d`'s homogeneous divide (the same
 * per-vertex `x/w, y/w` the browser already does for 3D transforms) IS the
 * projective map — the last row of the matrix carries the quad's actual
 * convergence, so straight edges really do converge the way the camera sees
 * them, not just an affine skew.
 */

/** 3×3 adjugate (classical adjoint), row-major. */
function adj3(m) {
  return [
    m[4] * m[8] - m[5] * m[7],
    m[2] * m[7] - m[1] * m[8],
    m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8],
    m[0] * m[8] - m[2] * m[6],
    m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6],
    m[1] * m[6] - m[0] * m[7],
    m[0] * m[4] - m[1] * m[3]
  ];
}

/** Row-major 3×3 × 3×3. */
function mul3(a, b) {
  const out = new Array(9);
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r * 3 + c] =
        a[r * 3 + 0] * b[0 * 3 + c] + a[r * 3 + 1] * b[1 * 3 + c] + a[r * 3 + 2] * b[2 * 3 + c];
    }
  }
  return out;
}

/** Row-major 3×3 × column vector. */
function mul3v(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
  ];
}

/** Homography sending (1,0,0),(0,1,0),(0,0,1),(1,1,1) → the 4 given points. */
function basisToPoints(x1, y1, x2, y2, x3, y3, x4, y4) {
  const m = [x1, x2, x3, y1, y2, y3, 1, 1, 1];
  const v = mul3v(adj3(m), [x4, y4, 1]);
  return mul3(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

/** Homography mapping quad1 (source) onto quad2 (destination). */
function general2DProjection(
  x1s, y1s, x1d, y1d,
  x2s, y2s, x2d, y2d,
  x3s, y3s, x3d, y3d,
  x4s, y4s, x4d, y4d
) {
  const s = basisToPoints(x1s, y1s, x2s, y2s, x3s, y3s, x4s, y4s);
  const d = basisToPoints(x1d, y1d, x2d, y2d, x3d, y3d, x4d, y4d);
  return mul3(d, adj3(s));
}

/**
 * @param {number} w source element width (its own unscaled box).
 * @param {number} h source element height.
 * @param {[number, number][]} corners 4 destination points, in the SAME
 *   order as the source square's TL, TR, BR, BL — i.e. `[[x,y] for TL, TR,
 *   BR, BL]`, in the ancestor coordinate space the transform applies in
 *   (normally viewport/client pixels, with the element `position: fixed`).
 * @returns {string} a CSS `matrix3d(...)` value.
 */
export function quadToMatrix3d(w, h, corners) {
  const [[x1d, y1d], [x2d, y2d], [x3d, y3d], [x4d, y4d]] = corners;
  const t = general2DProjection(
    0, 0, x1d, y1d,
    w, 0, x2d, y2d,
    w, h, x3d, y3d,
    0, h, x4d, y4d
  );
  const scale = t[8] || 1;
  const m = t.map((v) => v / scale);
  // Embed the 2D (z=0) projective map m (row-major, x'=[m0 m1 m2]·[x,y,1],
  // y'=[m3 m4 m5]·[x,y,1], w'=[m6 m7 m8]·[x,y,1]) into a CSS matrix3d —
  // column-major 4×4 acting on (x, y, 0, 1).
  return (
    `matrix3d(${m[0]}, ${m[3]}, 0, ${m[6]}, ` +
    `${m[1]}, ${m[4]}, 0, ${m[7]}, ` +
    `0, 0, 1, 0, ` +
    `${m[2]}, ${m[5]}, 0, ${m[8]})`
  );
}
