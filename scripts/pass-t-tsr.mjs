/**
 * Pass T T1 — still-camera TSR captures at Dane's window (1837×1222, DSF 2,
 * real Chrome). Frames are taken with raw CDP `Page.captureScreenshot` at
 * device scale: Playwright's page.screenshot pokes the page (a cursor
 * velocity blip) and resets the accumulator.
 *   default: per stop (rest, then zoom) wait for the accumulator, capture at
 *     frames 4 / 8 / 16 / 32 / 64 (convergence) and the converged frame.
 *   --ref: a `?tsr=0` session — the current 2.3 MP upscale per stop, then
 *     Pass P's native switch (restMp "native") for the native reference.
 * Usage: node scripts/pass-t-tsr.mjs <label> [--ref] [--stops 0,1,2,3] [--port 5179]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^[\d,]+$/.test(a)) || "tsr";
const num = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const port = Number(num("--port", 5179));
const ref = args.includes("--ref");
const stops = String(num("--stops", "0,1,2,3")).split(",").map(Number);
const OUT = resolve("tmp/pass-t", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, waitSettled, hopTo } = await bootStage({
  port,
  query: ref ? "flight=1&tsr=0" : "flight=1",
  profileDir: resolve("tmp/pass-q/chrome-profile-check")
});
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
const cdp = await page.context().newCDPSession(page);
const shot = async (path) => {
  const r = await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: H, scale: 2 } });
  writeFileSync(path, Buffer.from(r.data, "base64"));
};
const park = () => page.mouse.move(W * 0.06, H * 0.08);
const waitFrames = async (n, ms = 30000) => {
  const t0 = Date.now();
  let t = null;
  while (Date.now() - t0 < ms) {
    t = await dbg("debugTsr");
    if (t.accumulating && t.frames >= n) return t;
    await sleep(40);
  }
  return t;
};
const log = {};
const ZOOM_AT = { 0: [0.5, 0.62], 1: [0.5, 0.45], 2: [0.5, 0.5], 3: [0.5, 0.5] };
for (const stop of stops) {
  await hopTo(stop);
  await park();
  for (const view of ["rest", "zoom"]) {
    if (view === "zoom") {
      await page.mouse.click(W * ZOOM_AT[stop][0], H * ZOOM_AT[stop][1]);
      await sleep(2500);
      await waitSettled();
      await park();
    }
    await sleep(2500);
    const key = `s${stop}-${view}`;
    if (ref) {
      await shot(`${OUT}/${key}-current.png`);
      // Native reference: freeze the governor floor and wait for the draw
      // to reach display size (it can otherwise notch straight back down).
      await dbg("debugAbToggle", "floor-freeze", false);
      await dbg("debugPinFloor", null);
      await dbg("debugFilmStudy", { restMp: "native" });
      for (let k = 0; k < 60; k += 1) {
        const d = (await dbg("debugFilmStudy", {}))?.draw;
        if (d?.[0] >= W * 2 - 2) break;
        await sleep(100);
      }
      await sleep(1500);
      await shot(`${OUT}/${key}-native.png`);
      log[key] = { native: (await dbg("debugFilmStudy", {}))?.draw };
      await dbg("debugFilmStudy", { restMp: null });
      await dbg("debugAbToggle", "floor-freeze", true);
      await sleep(1500);
    } else {
      const conv = {};
      for (const n of [4, 8, 16, 32, 64]) {
        const t = await waitFrames(n);
        await shot(`${OUT}/${key}-f${n}.png`);
        conv[n] = t?.frames ?? null;
      }
      const t = await waitFrames(96);
      await shot(`${OUT}/${key}-tsr.png`);
      log[key] = { conv, final: t };
    }
    console.log(key, JSON.stringify(log[key]));
  }
  await page.keyboard.press("Escape");
  await sleep(2000);
  await waitSettled();
}
await browser.close();
writeFileSync(`${OUT}/log.json`, JSON.stringify(log, null, 1));
