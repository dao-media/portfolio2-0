/**
 * Pass Q Q1 — repro at Dane's window: fresh session at settled Bust, then
 * after one full hop cycle at Bust and Desktop. Each point: full shot,
 * debugStopTextureReport for all four stops, debugStopFade,
 * debugStopMaterials per stop, debugBustDraw.
 * Usage: node scripts/pass-q-repro.mjs <label> [--port 5179] [--query k=v]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--")) || "repro";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const extra = args.includes("--query") ? `&${args[args.indexOf("--query") + 1]}` : "";
const OUT = resolve("tmp/pass-q", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, hopTo, errors } = await bootStage({ port, query: `flight=1${extra}`, holdMs: 8000, profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
await page.mouse.move(W * 0.06, H * 0.08);
const out = { points: {} };
async function point(name) {
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const p = { fade: await dbg("debugStopFade"), stops: {}, materials: {}, bust: await dbg("debugBustDraw") };
  for (let i = 0; i < 4; i += 1) {
    const r = await dbg("debugStopTextureReport", i);
    p.stops[i] = { textures: r.textures, uniform: r.uniform, black: r.black, unreadable: r.unreadable, notResident: r.notResident, untexturedMeshes: r.untexturedMeshes, queuePending: r.queuePending };
    p.materials[i] = await dbg("debugStopMaterials", i);
  }
  out.points[name] = p;
  const s = Object.entries(p.stops).map(([i, r]) => `${i}:${r.textures}t/${r.uniform.length}u/${r.black}b/${r.unreadable.length}x/${r.notResident.length}nr`).join(" ");
  console.log(name, "fade", JSON.stringify(p.fade.fades), "culled", JSON.stringify(p.fade.culled), "| tex", s, "| matOff", Object.values(p.materials).map((m) => m.off.length).join(","));
}
await point("fresh-bust");
for (const s of [1, 2, 3, 0]) await hopTo(s);
await point("cycle-bust");
await hopTo(1);
await point("cycle-desktop");
await browser.close();
out.errors = errors.filter((e) => !/favicon/.test(e)).slice(0, 10);
writeFileSync(`${OUT}/repro.json`, JSON.stringify(out, null, 1));
console.log("errors", JSON.stringify(out.errors));
