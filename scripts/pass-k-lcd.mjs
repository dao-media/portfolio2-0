/**
 * Pass K item 6 — Sidekick LCD: on-screen footprint (rest + click-zoom) and
 * phone-screen crops at Dane's window. Usage: node scripts/pass-k-lcd.mjs <label> [--port 5179]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "lcd";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const OUT = resolve("tmp/pass-k", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, hopTo, waitSettled } = await bootStage({ port, holdMs: 250, profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 60; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
await hopTo(2);
await page.mouse.move(W * 0.06, H * 0.08);
await sleep(3000);
const out = {};
async function capture(tag) {
  const fp = await dbg("debugSidekickScreenFootprint");
  out[tag] = fp;
  const [x, y, w, h] = fp.screenBoxPx;
  const pad = 40;
  // Device px of the stage's own full ratio (1.75 here, not the DSF) → CSS px.
  const k = fp.deviceW / W;
  const clip = { x: Math.max(0, x / k - pad), y: Math.max(0, y / k - pad), width: w / k + pad * 2, height: h / k + pad * 2 };
  await page.screenshot({ path: `${OUT}/${tag}.png`, clip });
  return fp;
}
await dbg("setUploadTiming", true);
await page.evaluate(() => { window.__sidekickBitmapStats = null; });
const rest = await capture("rest");
const [x, y, w, h] = rest.screenBoxPx;
await page.mouse.click((x + w / 2) / (rest.deviceW / W), (y + h / 2) / (rest.deviceW / W));
await sleep(3000);
await waitSettled();
await page.mouse.move(W * 0.06, H * 0.08);
await sleep(1500);
await capture("zoom");
out.bitmaps = await dbg("debugBitmapCounts");
out.pageBitmap = await page.evaluate(() => {
  const st = window.__sidekickBitmapStats;
  return st ? { n: st.n, w: st.w, avgMs: +(st.totalMs / Math.max(1, st.n)).toFixed(2), maxMs: +st.maxMs.toFixed(2) } : null;
});
writeFileSync(`${OUT}/footprint.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
await browser.close();
