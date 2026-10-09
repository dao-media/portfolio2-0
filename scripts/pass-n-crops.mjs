/**
 * Pass N — before/after crops at Bust: rest and click-zoomed on the bust, at
 * a pinned floor (--mp, default 1.6). Usage:
 * node scripts/pass-n-crops.mjs <label> [--port 5179] [--query k=v] [--stop N] [--mp 1.6]
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^[\d.]+$/.test(a)) || "crops";
const num = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const port = num("--port", 5179);
const stop = num("--stop", 0);
const mp = num("--mp", 1.6);
const query = args.includes("--query") ? `flight=1&${args[args.indexOf("--query") + 1]}` : "flight=1";
const OUT = resolve("tmp/pass-n", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, waitSettled, hopTo, errors } = await bootStage({ port, query, holdMs: 8000, profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
if (stop) await hopTo(stop);
await dbg("debugAbToggle", "floor-freeze", false);
await dbg("debugPinFloor", mp);
await page.mouse.move(W * 0.12, H * 0.15);
await sleep(2500);
await page.screenshot({ path: `${OUT}/rest.png` });
// Bust / subject sits a little right of centre, lower half.
await page.mouse.click(W * 0.5, H * 0.62);
await sleep(2500);
await waitSettled();
await page.mouse.move(W * 0.12, H * 0.15);
await sleep(2000);
await page.screenshot({ path: `${OUT}/zoom.png` });
await browser.close();
console.log(OUT, "errors", JSON.stringify(errors.filter((e) => !/favicon/.test(e)).slice(0, 5)));
