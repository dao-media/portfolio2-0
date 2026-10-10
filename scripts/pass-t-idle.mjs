/**
 * Pass T — 60 s settled idle at every stop at Dane's window: rAF frame stats
 * (p50 / p95 / > 33 / > 50 ms) and the governor floor / draw-size states
 * (debugIdleStats), so a floor drop at idle is reported per stop.
 * Usage: node scripts/pass-t-idle.mjs <label> [--port 5179] [--query k=v] [--secs 60]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "idle";
const num = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const port = Number(num("--port", 5179));
const secs = Number(num("--secs", 60));
const extra = num("--query", null);
const OUT = resolve("tmp/pass-t", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, hopTo } = await bootStage({ port, query: extra ? `flight=1&${extra}` : "flight=1", profileDir: resolve("tmp/pass-q/chrome-profile-check") });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
const out = {};
for (const stop of [0, 1, 2, 3]) {
  await hopTo(stop);
  await page.mouse.move(W * 0.06, H * 0.08);
  await sleep(4000);
  out[stop] = await dbg("debugIdleStats", secs);
  console.log(stop, JSON.stringify(out[stop]));
}
await browser.close();
writeFileSync(`${OUT}/idle.json`, JSON.stringify(out, null, 1));
