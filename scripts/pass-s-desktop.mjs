/**
 * Pass S S3 — Desktop native rest at Dane's window: 60 s settled idle
 * (p50 / p95 / > 33 / > 50 ms, draw size, floor notch), 5 hops into and 5 out
 * of Desktop (> 50 ms frames per hop), and the VRAM census at Desktop.
 * Usage: node scripts/pass-s-desktop.mjs <label> [--port 5179] [--off]  (--off = ?restnative=0)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "desk";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const off = args.includes("--off");
const OUT = resolve("tmp/pass-s", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, hopTo, waitSettled } = await bootStage({ port, query: `flight=1&vram=1${off ? "&restnative=0" : ""}`, profileDir: resolve("tmp/pass-q/chrome-profile-check") });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
const park = () => page.mouse.move(W * 0.06, H * 0.08);
await hopTo(1);
await park();
await sleep(4000);
const idle = await dbg("debugIdleStats", 60);
const vram = await dbg("debugVram");
await page.screenshot({ path: `${OUT}/desktop-rest.png` });
const hops = { into: [], out: [] };
for (let k = 0; k < 5; k += 1) {
  let p = dbg("debugIdleStats", 3.5);
  await dbg("goTo", 0);
  hops.out.push(await p);
  await waitSettled();
  await sleep(2500);
  p = dbg("debugIdleStats", 3.5);
  await dbg("goTo", 1);
  hops.into.push(await p);
  await waitSettled();
  await park();
  await sleep(4000);
}
await browser.close();
const vramMb = vram?.totalMb ?? vram?.total ?? null;
writeFileSync(`${OUT}/desktop.json`, JSON.stringify({ off, idle, vramMb, vram, hops }, null, 1));
const sum = (a, k) => a.reduce((s, r) => s + (r?.[k] ?? 0), 0);
console.log(JSON.stringify({ off, idle, vramMb, hopsInto: { over50: sum(hops.into, "over50"), over33: sum(hops.into, "over33"), max: Math.max(...hops.into.map((r) => r.max)) }, hopsOut: { over50: sum(hops.out, "over50"), over33: sum(hops.out, "over33"), max: Math.max(...hops.out.map((r) => r.max)) } }, null, 1));
