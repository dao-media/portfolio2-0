/**
 * Pass N — pixel diff of two PNGs over a crop: mean |Δ| (0–255, RGB) and % of
 * pixels with any channel Δ > 8. Uses ffmpeg to decode to raw RGB.
 * Usage: node scripts/pass-n-diff.mjs a.png b.png [x y w h]
 */
import { execFileSync } from "node:child_process";
const [a, b, ...crop] = process.argv.slice(2);
const [x, y, w, h] = crop.length === 4 ? crop.map(Number) : [null, null, null, null];
const raw = (f) => {
  const vf = x == null ? "format=rgb24" : `crop=${w}:${h}:${x}:${y},format=rgb24`;
  return execFileSync("ffmpeg", ["-loglevel", "error", "-i", f, "-vf", vf, "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
};
const A = raw(a);
const B = raw(b);
let sum = 0;
let big = 0;
const px = Math.min(A.length, B.length) / 3;
for (let i = 0; i < px; i += 1) {
  let any = false;
  for (let c = 0; c < 3; c += 1) {
    const d = Math.abs(A[i * 3 + c] - B[i * 3 + c]);
    sum += d;
    if (d > 8) any = true;
  }
  if (any) big += 1;
}
console.log(JSON.stringify({ meanAbs: +(sum / (px * 3)).toFixed(3), pctOver8: +((100 * big) / px).toFixed(3), px }));
