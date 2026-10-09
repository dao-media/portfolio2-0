/**
 * Pass N N1 — apple-tree cost at settled Bust: uncapped, floor pinned and
 * frozen at --mp (1.6), cursor parked. Each variant off vs on, 2× 4 s; a
 * full-window shot with the variant off (and one shipped) for the look.
 * Usage: node scripts/pass-n-ab.mjs <label> [--port 5179] [--mp 1.6] [--toggles a,b] [--settle ms] [--query k=v]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^[\d.]+$/.test(a)) || "ab";
const num = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const port = num("--port", 5179);
const mp = num("--mp", 1.6);
// ms after each toggle before measuring (a toggle that recompiles needs longer)
const settle = num("--settle", 700);
// extra query (e.g. lightskip=0)
const query = args.includes("--query") ? `flight=1&${args[args.indexOf("--query") + 1]}` : "flight=1";
const OUT = resolve("tmp/pass-n", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep } = await bootStage({ port, query, holdMs: 8000, profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
await page.mouse.move(W * 0.12, H * 0.15);
await dbg("debugAbToggle", "floor-freeze", false);
await dbg("debugPinFloor", mp);
await dbg("setFramePacing", 0);
await sleep(3000);
const census = await dbg("debugAppleCensus");
const lights = await dbg("debugLightCensus");
const perf = await dbg("debugPerf");
const only = args.includes("--toggles") ? args[args.indexOf("--toggles") + 1].split(",") : null;
const toggles = only ?? ["apple-tree", "apple-leaves", "apple-trunk", "apple-leaf-patch", "apple-leaf-cutout", "apple-leaf-cutout50", "apple-tree-frontside", "apple-prepass", "apple-cast", "apple-tree-noshadow", "apple-tree-cheap"];
await page.screenshot({ path: `${OUT}/shipped.png` });
const base = [];
for (let k = 0; k < 3; k += 1) base.push((await dbg("debugMeasureFps", 4)).meanIntervalMs);
console.log(JSON.stringify({ base, mean: +(base.reduce((a, b) => a + b, 0) / base.length).toFixed(2), lightSkip: lights?.[0]?.lightSkip }));
const rows = [];
for (const name of toggles) {
  const on = [];
  const off = [];
  for (let k = 0; k < 2; k += 1) {
    await dbg("debugAbToggle", name, false);
    await sleep(settle);
    if (k === 0) await page.screenshot({ path: `${OUT}/off-${name}.png` });
    off.push(await dbg("debugMeasureFps", 4));
    await dbg("debugAbToggle", name, true);
    await sleep(settle);
    on.push(await dbg("debugMeasureFps", 4));
  }
  const mean = (xs) => xs.reduce((a, x) => a + x.meanIntervalMs, 0) / xs.length;
  const row = { toggle: name, onMs: +mean(on).toFixed(2), offMs: +mean(off).toFixed(2), savedMs: +(mean(on) - mean(off)).toFixed(2) };
  rows.push(row);
  console.log(JSON.stringify(row));
}
await page.screenshot({ path: `${OUT}/shipped-after.png` });
writeFileSync(`${OUT}/ab.json`, JSON.stringify({ mp, perf, census, lights, rows }, null, 1));
console.log(JSON.stringify({ meshes: census?.meshes, leafTris: census?.leafTris, trunkTris: census?.trunkTris, draw: perf?.drawingBuffer ?? perf }).slice(0, 400));
await browser.close();
