/**
 * Pass S S1 — Bust metal variants (debugBustMetal, debug only) at Dane's
 * window: per variant a rest shot, a zoom shot with 100 % face / lapel
 * crops, uncapped frame ms at rest, and the vest / sleeve contrast (mean
 * linear luminance of fixed lit and shadow-side regions; analysed by
 * scripts/pass-s-contrast.py). C is swept over envMapIntensity.
 * Usage: node scripts/pass-s-bust.mjs <label> [--port 5179]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "bust";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const OUT = resolve("tmp/pass-s", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, waitSettled } = await bootStage({ port, profileDir: resolve("tmp/pass-q/chrome-profile-check") });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
const park = () => page.mouse.move(W * 0.06, H * 0.08);
const ROUGH_MEAN = 0.715; // ORM green-channel mean (pass-s-probe)
const VARIANTS = [
  ["A", null, {}],
  ["B", "B", {}],
  ["C-0.5", "C", { env: 0.5 }],
  ["C-1", "C", { env: 1 }],
  ["C-2", "C", { env: 2 }],
  ["C-4", "C", { env: 4 }],
  ["D-1", "D", { env: 1, roughMapMean: ROUGH_MEAN }],
  ["D-2", "D", { env: 2, roughMapMean: ROUGH_MEAN }]
];
const measure = async () => {
  await dbg("setFramePacing", 0);
  await sleep(500);
  const r = await dbg("debugMeasureFps", 3);
  await dbg("setFramePacing", null);
  return r?.meanIntervalMs ?? null;
};
const rows = [];
await waitSettled();
await park();
await sleep(2000);
for (const [name, v, opts] of VARIANTS) {
  const state = await dbg("debugBustMetal", v, opts);
  await sleep(1500);
  const ms = await measure();
  await sleep(500);
  await page.screenshot({ path: `${OUT}/rest-${name}.png` });
  rows.push({ name, ms, state });
  console.log(name, ms, JSON.stringify(state));
}
// Zoom on the bust, then the same variants (shots + crops only).
await page.mouse.click(W * 0.5, H * 0.62);
await sleep(2500);
await waitSettled();
await park();
await sleep(2500);
for (const [name, v, opts] of VARIANTS) {
  await dbg("debugBustMetal", v, opts);
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/zoom-${name}.png` });
}
await dbg("debugBustMetal", null);
await browser.close();
writeFileSync(`${OUT}/bust.json`, JSON.stringify(rows, null, 1));
