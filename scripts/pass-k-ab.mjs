/**
 * Pass K item 1.5 — attribute the Sidekick's sustained GPU cost: settle there,
 * wait for warm to finish, then for each system A/B it off vs on (5 s each,
 * twice, rAF-interval fps — gpuMs is unreliable on ANGLE/Metal).
 * Usage: node scripts/pass-k-ab.mjs <label> [--stop 2] [--port 5192]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "ab";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5192;
const stop = args.includes("--stop") ? Number(args[args.indexOf("--stop") + 1]) : 2;
const OUT = resolve("tmp/pass-k", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, hopTo } = await bootStage({ port, holdMs: 250, profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
await hopTo(stop);
await page.mouse.move(W * 0.12, H * 0.15);
await sleep(4000);
const only = args.includes("--toggles") ? args[args.indexOf("--toggles") + 1].split(",") : null;
const toggles = only ?? ["ground-fog", "wet-floor", "edge-glitch", "neon", "contact-pads", "bloom", "smaa", "sidekick-phone", "duo", "star-field", "water-cursor"];
// Pass K item 8 — pacing would cap both sides at 60 Hz; measure uncapped.
await dbg("setFramePacing", 0);
const rows = [];
const base = await dbg("debugMeasureFps", 5);
for (const name of toggles) {
  const on = [];
  const off = [];
  for (let k = 0; k < 2; k += 1) {
    await dbg("debugAbToggle", name, false);
    await sleep(600);
    off.push(await dbg("debugMeasureFps", 4));
    await dbg("debugAbToggle", name, true);
    await sleep(600);
    on.push(await dbg("debugMeasureFps", 4));
  }
  const mean = (xs) => xs.reduce((a, x) => a + x.meanIntervalMs, 0) / xs.length;
  const row = { toggle: name, onMs: +mean(on).toFixed(2), offMs: +mean(off).toFixed(2), savedMs: +(mean(on) - mean(off)).toFixed(2), onFps: on.map((x) => x.fps), offFps: off.map((x) => x.fps) };
  rows.push(row);
  console.log(JSON.stringify(row));
}
const perf = await dbg("debugPerf");
writeFileSync(`${OUT}/ab.json`, JSON.stringify({ stop, base, rows, perf }, null, 1));
await browser.close();
