/** Pass K item 8 — long Sidekick idle: does pacing probe uncapped, and does it hold? */
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const port = Number(process.argv[2] || 5179);
const stop = Number(process.argv[3] || 2);
const { browser, page, dbg, sleep, hopTo } = await bootStage({ port, holdMs: 250, profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 60; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
await hopTo(stop);
await page.mouse.move(W * 0.12, H * 0.15);
await sleep(50_000);
const flight = await dbg("flightDump");
const pacing = await dbg("debugPacingStats");
console.log(JSON.stringify({ pacing, switches: flight.milestones.filter((m) => m.kind === "pace").map((m) => [m.frame, m.t, m.data]) }));
await browser.close();
