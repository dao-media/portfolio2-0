/**
 * Pass S S5 — Sidekick magnet metal before/after at Sidekick zoom: shot with
 * the shipped metal clone, then with its metalness patched back to the old 0
 * (debugApplyLook), cropped to the magnet's screen box (debugMeshMask).
 * Usage: node scripts/pass-s-magnet.mjs [--port 5179]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const port = process.argv.includes("--port") ? Number(process.argv[process.argv.indexOf("--port") + 1]) : 5179;
const OUT = resolve("tmp/pass-s/magnet");
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, hopTo, waitSettled } = await bootStage({ port, profileDir: resolve("tmp/pass-q/chrome-profile-check") });
await hopTo(2);
await page.mouse.click(W * 0.5, H * 0.5);
await sleep(2500);
await waitSettled();
await page.mouse.move(W * 0.06, H * 0.08);
await sleep(2500);
const box = async () => {
  const m = await dbg("debugMeshMask", "magnet", 1);
  const bits = Buffer.from(m.bits, "base64");
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let k = 0; k < m.w * m.h; k += 1) {
    if (!(bits[k >> 3] & (1 << (k & 7)))) continue;
    const x = k % m.w;
    const y = Math.floor(k / m.w);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const sx = W / m.w;
  return { covered: m.covered, css: x1 < 0 ? null : [Math.round(x0 * sx), Math.round(y0 * sx), Math.round(x1 * sx), Math.round(y1 * sx)] };
};
const b = await box();
const dump = await dbg("debugMaterialDump", 2);
const mag = dump.meshes.find((r) => r.path.endsWith("/magnet"));
const pad = 60;
const clip = b.css ? { x: Math.max(0, b.css[0] - pad), y: Math.max(0, b.css[1] - pad), width: Math.min(W, b.css[2] - b.css[0] + 2 * pad), height: Math.min(H, b.css[3] - b.css[1] + 2 * pad) } : null;
await page.screenshot({ path: `${OUT}/after-full.png` });
if (clip) await page.screenshot({ path: `${OUT}/after.png`, clip });
await dbg("debugApplyLook", { materials: [{ stop: 2, path: mag.path, i: 0, fields: { metalness: 0, roughness: 0.5528 } }] });
await sleep(1500);
await page.screenshot({ path: `${OUT}/before-full.png` });
if (clip) await page.screenshot({ path: `${OUT}/before.png`, clip });
await dbg("debugApplyLook", { restore: true });
await browser.close();
writeFileSync(`${OUT}/magnet.json`, JSON.stringify({ box: b, material: mag?.materials?.[0] }, null, 1));
console.log(JSON.stringify({ box: b, name: mag?.materials?.[0]?.name, metalness: mag?.materials?.[0]?.metalness, roughness: mag?.materials?.[0]?.roughness, visible: mag?.visible }));
