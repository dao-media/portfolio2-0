/**
 * Pass S — one-session probe: Bust texture stats (S1 D), globe gap (S4),
 * Sidekick magnet coverage (S5), and the shipped per-stop film look (S2) /
 * Desktop native rest draw size (S3).
 * Usage: node scripts/pass-s-probe.mjs <label> [--port 5179]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "probe";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const OUT = resolve("tmp/pass-s", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, hopTo, waitSettled } = await bootStage({ port, profileDir: resolve("tmp/pass-q/chrome-profile-check") });
const out = {};
await waitSettled();
await page.mouse.move(W * 0.06, H * 0.08);
await sleep(2500);
out.bustTex = {};
for (const slot of ["map", "roughnessMap", "metalnessMap", "normalMap"]) out.bustTex[slot] = await dbg("debugTexStats", 0, "bust/Mesh_0", slot, 128, slot === "metalnessMap" ? 2 : 1);
out.film0 = await dbg("debugFilmStudy", {});
out.draw0 = [await dbg("debugCameraPose"), out.film0?.draw];
for (const stop of [1, 2, 3]) {
  await hopTo(stop);
  await page.mouse.move(W * 0.06, H * 0.08);
  await sleep(3500);
  out[`draw${stop}`] = (await dbg("debugFilmStudy", {}))?.draw;
  if (stop === 2) out.magnet = await dbg("debugMeshMask", "magnet", 2).then((m) => ({ covered: m?.covered, w: m?.w, h: m?.h }));
  if (stop === 3) out.globe = await dbg("debugGlobeGap");
}
await browser.close();
writeFileSync(`${OUT}/probe.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ bustTex: Object.fromEntries(Object.entries(out.bustTex).map(([k, v]) => [k, v?.channels ?? v])), draws: [out.film0?.draw, out.draw1, out.draw2, out.draw3], magnet: out.magnet, globe: out.globe }, null, 1));
