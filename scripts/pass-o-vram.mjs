/**
 * Pass O O2 — VRAM census after a full hop cycle (every stop drawn once).
 * Usage: node scripts/pass-o-vram.mjs <label> [--port 5179] [--query k=v] [--cycles N]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--")) || "vram";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const extra = args.includes("--query") ? `&${args[args.indexOf("--query") + 1]}` : "";
const OUT = resolve("tmp/pass-o", label);
mkdirSync(OUT, { recursive: true });
const { browser, dbg, sleep, hopTo, errors } = await bootStage({ port, query: `flight=1&vram=1${extra}`, holdMs: 8000, profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
const cycles = args.includes("--cycles") ? Number(args[args.indexOf("--cycles") + 1]) : 1;
const growth = [];
for (let c = 0; c < cycles; c += 1) {
  for (const s of [1, 2, 3, 0]) await hopTo(s);
  await sleep(1500);
  growth.push((await dbg("debugVram", 1)).totalMb);
}
console.log("total MB after each hop cycle:", JSON.stringify(growth));
const v = await dbg("debugVram", 25);
const caps = await dbg("debugGlCaps");
await browser.close();
writeFileSync(`${OUT}/vram.json`, JSON.stringify({ v, caps, growth, errors }, null, 1));
console.log("errors:", JSON.stringify(errors.slice(0, 5)));
console.log(JSON.stringify({ totalMb: v.totalMb, objects: v.objects, byCategoryMb: v.byCategoryMb, geometryBuffers: v.geometryBuffers }));
for (const r of v.top) console.log(String(r.mb).padStart(8), r.cat.padEnd(18), `${r.w}x${r.h}`, r.fmt, r.samples ?? "", r.name.slice(0, 90));
for (const r of v.topGeometry) console.log(String(r.mb).padStart(8), "geometry");
console.log("unlabelled groups:");
for (const g of v.unlabelledGroups ?? []) console.log(String(g.mb).padStart(9), String(g.n).padStart(4), g.k);
