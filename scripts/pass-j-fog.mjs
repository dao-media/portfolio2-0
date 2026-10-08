/** Pass J item 7 — Sidekick ground fog: screenshots (lid closed/open, fog on/off) + A/B fps cost. */
import { mkdirSync, writeFileSync } from "node:fs";
import { bootStage, W, H } from "./passj-lib.mjs";
const OUT = "tmp/pass-j/fog";
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, hopTo, shot } = await bootStage({ port: Number(process.argv[2] || 5192) });
await hopTo(2);
await page.mouse.move(W * 0.2, H * 0.2);
await sleep(3000);
console.log("params", JSON.stringify(await dbg("getGroundFogParams")));
await shot(`${OUT}/closed-fog.png`);
await dbg("debugAbToggle", "ground-fog", false); await sleep(600);
await shot(`${OUT}/closed-nofog.png`);
const cost = [];
for (let i = 0; i < 2; i += 1) {
  await dbg("debugAbToggle", "ground-fog", true); await sleep(800);
  const on = await dbg("debugMeasureFps", 5);
  await dbg("debugAbToggle", "ground-fog", false); await sleep(800);
  const off = await dbg("debugMeasureFps", 5);
  cost.push({ on, off });
}
await dbg("debugAbToggle", "ground-fog", true); await sleep(600);
// Open the lid: click the active stop (toggles zoom + lid swivel).
await page.mouse.click(W * 0.5, H * 0.6);
for (let i = 0; i < 40; i++) { await sleep(250); const s = await dbg("debugScrollCapture"); if (s?.cameraZoomed && s?.cameraSettled) break; }
await sleep(2500);
await shot(`${OUT}/open-fog.png`);
await dbg("debugAbToggle", "ground-fog", false); await sleep(600);
await shot(`${OUT}/open-nofog.png`);
await dbg("debugAbToggle", "ground-fog", true);
writeFileSync(`${OUT}/cost.json`, JSON.stringify(cost, null, 1));
console.log(JSON.stringify(cost.map((c) => ({ onFps: c.on.fps, offFps: c.off.fps, onMs: c.on.meanIntervalMs, offMs: c.off.meanIntervalMs }))));
await browser.close();
