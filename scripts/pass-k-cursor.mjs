/** Pass K item 7 — water-cursor rim freeze: runs vs skips while still, and the freeze delta (no-snap proof). */
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const port = Number(process.argv[2] || 5179);
const { browser, page, dbg, sleep } = await bootStage({ port, holdMs: 250, profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 60; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
await sleep(3000);
for (const [fx, fy] of [[0.5, 0.42], [0.44, 0.5], [0.56, 0.36], [0.62, 0.55]]) {
  // glide in so the blob is genuinely moving, then hold still
  for (let k = 1; k <= 12; k += 1) await page.mouse.move(W * (fx - 0.06 + 0.005 * k), H * fy);
  await sleep(150);
  const moving = await dbg("debugWaterCursorRim");
  await sleep(2500);
  const still = await dbg("debugWaterCursorRim");
  const delta = await dbg("debugWaterCursorFreezeDelta");
  console.log(JSON.stringify({ at: [fx, fy], moving, still, delta }));
}
await browser.close();
