/**
 * Pass R R2b — diff two materialDump.js outputs (pass-r-desktop materials.json):
 * meshes matched by path, materials by slot; every changed field listed,
 * plus lighting / environment / renderer differences.
 * Usage: node scripts/pass-r-matdiff.mjs <a/materials.json> <b/materials.json>
 */
import { readFileSync } from "node:fs";

const [fa, fb] = process.argv.slice(2);
const a = JSON.parse(readFileSync(fa, "utf8"));
const b = JSON.parse(readFileSync(fb, "utf8"));
// uuids differ per session; compare everything else.
const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => k !== "uuid").map(([k, x]) => [k, strip(x)]));
  return v;
};
const diff = (x, y, path, out) => {
  x = strip(x);
  y = strip(y);
  if (JSON.stringify(x) === JSON.stringify(y)) return;
  if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x)) {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) diff(x[k], y[k], `${path}.${k}`, out);
    return;
  }
  out.push(`${path}: ${JSON.stringify(x)} → ${JSON.stringify(y)}`);
};
const byPath = (d) => {
  const m = new Map();
  for (const r of d.meshes ?? []) {
    let key = r.path;
    for (let n = 2; m.has(key); n += 1) key = `${r.path}#${n}`;
    m.set(key, r);
  }
  return m;
};
const ma = byPath(a);
const mb = byPath(b);
const out = [];
for (const k of new Set([...ma.keys(), ...mb.keys()])) {
  const x = ma.get(k);
  const y = mb.get(k);
  if (!x || !y) {
    out.push(`${k}: ${x ? "only in A" : "only in B"}`);
    continue;
  }
  const rows = [];
  diff({ ...x, materials: undefined }, { ...y, materials: undefined }, "", rows);
  const n = Math.max(x.materials.length, y.materials.length);
  for (let i = 0; i < n; i += 1) diff(x.materials[i], y.materials[i], `[${i}]`, rows);
  if (rows.length) out.push(`${k}\n    ${rows.join("\n    ")}`);
}
const lights = [];
diff(a.lighting, b.lighting, "lighting", lights);
console.log(`meshes A ${ma.size}, B ${mb.size}; changed ${out.length}`);
console.log(out.join("\n"));
console.log("\n" + lights.join("\n"));
