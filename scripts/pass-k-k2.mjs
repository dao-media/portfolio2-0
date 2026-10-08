/**
 * Pass K K2 — shadow-side fill study (nothing ships). Boots with ?ao=1 so
 * variant C exists; at each stop captures current / A / B / C (full page,
 * Dane's window) and the uncapped frame time of each variant.
 * Usage: node scripts/pass-k-k2.mjs <label> [--port 5179]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "k2";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const OUT = resolve("tmp/pass-k", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, hopTo } = await bootStage({ port, holdMs: 250, query: "flight=1&ao=1", profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 60; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
const perf = {};
for (const stop of [0, 1, 2, 3]) {
  await hopTo(stop);
  await page.mouse.move(W * 0.04, H * 0.06);
  await sleep(3500);
  perf[stop] = {};
  for (const v of ["current", "A", "B", "C"]) {
    const r = await dbg("debugK2Variant", v);
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/stop${stop}-${v}.png` });
    await dbg("setFramePacing", 0);
    await sleep(400);
    const fps = await dbg("debugMeasureFps", 3);
    await dbg("setFramePacing", null);
    perf[stop][v] = { meanIntervalMs: fps?.meanIntervalMs ?? null, fps: fps?.fps ?? null, applied: r };
    console.log(stop, v, JSON.stringify(perf[stop][v]));
  }
  await dbg("debugK2Variant", "current");
}
const census = await dbg("debugEnvMapCensus");
writeFileSync(`${OUT}/k2.json`, JSON.stringify({ perf, census }, null, 1));
await browser.close();
