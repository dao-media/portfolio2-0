/**
 * Pass S S2 — Bust film look (P4 medium, f0018) at Dane's window: rest shot at
 * f0018's framing (cursor parked top-left), uncapped ms, the film weights at
 * every stop (0 away from Bust), and the per-frame weight across one hop out
 * and back (no pop: it follows the stop fade).
 * Usage: node scripts/pass-s-film.mjs <label> [--off] [--port 5179]  (--off = ?stopfilm=0)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "film";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const off = args.includes("--off");
const OUT = resolve("tmp/pass-s", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, waitSettled, hopTo } = await bootStage({ port, query: `flight=1${off ? "&stopfilm=0" : ""}`, profileDir: resolve("tmp/pass-q/chrome-profile-check") });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
await waitSettled();
await page.mouse.move(W * 0.06, H * 0.08);
await sleep(3000);
await dbg("setFramePacing", 0);
await sleep(500);
const fps = await dbg("debugMeasureFps", 4);
await dbg("setFramePacing", null);
await page.screenshot({ path: `${OUT}/rest.png` });
const weights = { 0: await dbg("debugStopFilm") };
const trace = dbg("debugStopFilmTrace", 4);
await sleep(200);
await dbg("goTo", 1);
await sleep(1800);
await dbg("goTo", 0);
const hop = await trace;
for (const s of [1, 2, 3]) {
  await hopTo(s);
  await sleep(1500);
  weights[s] = await dbg("debugStopFilm");
}
await browser.close();
writeFileSync(`${OUT}/film.json`, JSON.stringify({ off, ms: fps?.meanIntervalMs, weights, hop }, null, 1));
let maxStep = 0;
for (let i = 1; i < (hop?.length ?? 0); i += 1) maxStep = Math.max(maxStep, Math.abs(hop[i][1] - hop[i - 1][1]));
console.log(JSON.stringify({ off, ms: fps?.meanIntervalMs, weights, hopFrames: hop?.length, maxGrainStepPerFrame: +maxStep.toFixed(4) }));
