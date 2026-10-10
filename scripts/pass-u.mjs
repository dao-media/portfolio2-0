/**
 * Pass U — rest-budget re-test at Dane's window (1837×1222, DSF 2, real
 * Chrome). One session = one config for every stop:
 *   --cfg 2.3 | 3.2 | 4.5 | native   (?restmp=<cfg>)
 *   --cfg cap                         (2.3 MP on the old 1.75 canvas, ?canvascap=1)
 *   --cfg shipped                     (REST_BUDGET_MP_BY_STOP, no override)
 *   --idle: 60 s settled idle per stop (debugIdleStats: p50 / p95 / > 33 /
 *     > 50, floor drops, settled MP) + a full-frame CDP capture per stop.
 *   --stops 1,2: idle only these stops.
 *   --release: clear a leftover floor notch at each stop before its idle window.
 *   --cycles N: N trips round the ring; every hop is a 6 s window from the
 *     hop start (out of the previous stop's rest, in to the next stop's,
 *     including its post-settle budget switch).
 * Records the 1-min load average at boot.
 * Usage: node scripts/pass-u.mjs <label> --cfg 3.2 [--idle] [--cycles 4] [--port 5179]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^[\d.]+$/.test(a) && !["native", "cap"].includes(a)) || "u";
const num = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const cfg = String(num("--cfg", "2.3"));
const port = Number(num("--port", 5179));
const cycles = Number(num("--cycles", 0));
const idle = args.includes("--idle");
const OUT = resolve("tmp/pass-u", label);
mkdirSync(OUT, { recursive: true });
const load = loadavg();
const query = cfg === "cap" ? "flight=1&restmp=2.3&canvascap=1" : cfg === "shipped" ? "flight=1" : `flight=1&restmp=${cfg}`;
const { browser, page, dbg, sleep, hopTo, waitSettled } = await bootStage({ port, query, profileDir: resolve("tmp/pass-q/chrome-profile-check") });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
const park = () => page.mouse.move(W * 0.06, H * 0.08);
const cdp = await page.context().newCDPSession(page);
const shot = async (path) => {
  const r = await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: H, scale: 2 } });
  writeFileSync(path, Buffer.from(r.data, "base64"));
};
const out = { cfg, load: load.map((v) => +v.toFixed(2)), idle: {}, hops: [] };
if (idle) {
  const idleStops = String(num("--stops", "0,1,2,3")).split(",").map(Number);
  for (const stop of idleStops) {
    await hopTo(stop);
    await park();
    // --release: clear a floor notch left from landing / an earlier hop once
    // (debugPinFloor(null); governor values untouched) so the idle window
    // shows whether this stop's budget holds once reached.
    if (args.includes("--release")) await dbg("debugPinFloor", null);
    await sleep(4000);
    out.idle[stop] = await dbg("debugIdleStats", 60);
    await shot(`${OUT}/s${stop}.png`);
    console.log("idle", stop, JSON.stringify(out.idle[stop]).slice(0, 200));
  }
}
if (cycles) {
  await hopTo(0);
  await park();
  await sleep(4000);
  let from = 0;
  for (let c = 0; c < cycles; c += 1) {
    for (const to of [1, 2, 3, 0]) {
      const p = dbg("debugIdleStats", 6);
      await dbg("goTo", to);
      const r = await p;
      out.hops.push({ from, to, over50: r.over50, over33: r.over33, max: r.max, floorDrops: r.floorDrops });
      from = to;
      await waitSettled();
      await park();
      await sleep(1500);
    }
  }
  console.log("hops", out.hops.length, "over50", out.hops.reduce((s, h) => s + h.over50, 0));
}
await browser.close();
writeFileSync(`${OUT}/u.json`, JSON.stringify(out, null, 1));
