/**
 * Pass N N3 — Sidekick at rest: current vs a dev variant (debugAbToggle
 * name, off = variant), full-window shots + phone-shell contrast (relative
 * luminance p90 / p10 over the phone's on-screen box, LCD excluded).
 * Usage: node scripts/pass-n-sidekick.mjs <label> [--port 5179] [--variant sk-shadow-preview]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--")) || "sk";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const variant = args.includes("--variant") ? args[args.indexOf("--variant") + 1] : "sk-shadow-preview";
const OUT = resolve("tmp/pass-n", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, hopTo } = await bootStage({ port, holdMs: 8000, profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
await hopTo(2);
await page.mouse.move(W * 0.06, H * 0.08);
await sleep(3500);
const fp = await dbg("debugSidekickScreenFootprint");
const k = (fp?.deviceW ?? W) / W;
// LCD box in CSS px; the shell is the LCD box grown (the phone is ~2x the LCD).
const [lx, ly, lw, lh] = (fp?.screenBoxPx ?? [0, 0, 0, 0]).map((v) => v / k);
const shell = { x: Math.max(0, lx - lw * 0.55), y: Math.max(0, ly - lh * 0.6), w: lw * 2.1, h: lh * 2.2 };
const contrast = (file) => {
  const dsf = 2;
  const vf = `crop=${Math.round(shell.w * dsf)}:${Math.round(shell.h * dsf)}:${Math.round(shell.x * dsf)}:${Math.round(shell.y * dsf)},format=rgb24`;
  const raw = execFileSync("ffmpeg", ["-loglevel", "error", "-i", file, "-vf", vf, "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
  const cw = Math.round(shell.w * dsf);
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = [];
  for (let i = 0; i < raw.length / 3; i += 1) {
    const x = (i % cw) / dsf + shell.x;
    const y = Math.floor(i / cw) / dsf + shell.y;
    if (x >= lx && x <= lx + lw && y >= ly && y <= ly + lh) continue; // LCD
    const L = 0.2126 * lin(raw[i * 3]) + 0.7152 * lin(raw[i * 3 + 1]) + 0.0722 * lin(raw[i * 3 + 2]);
    if (L > 0.002) lum.push(L); // shell, not black background
  }
  lum.sort((a, b) => a - b);
  const q = (p) => lum[Math.floor((lum.length - 1) * p)];
  return { px: lum.length, p90: +q(0.9).toFixed(4), p10: +q(0.1).toFixed(4), ratio: +((q(0.9) + 0.05) / (q(0.1) + 0.05)).toFixed(2) };
};
await page.screenshot({ path: `${OUT}/current.png` });
await dbg("debugAbToggle", variant, false);
await sleep(2500);
await page.screenshot({ path: `${OUT}/variant.png` });
await dbg("debugAbToggle", variant, true);
const shadow = await dbg("debugStopShadow", 2);
await browser.close();
const out = { variant, shell, current: contrast(`${OUT}/current.png`), variantContrast: contrast(`${OUT}/variant.png`), casters: shadow?.casters };
writeFileSync(`${OUT}/sk.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
