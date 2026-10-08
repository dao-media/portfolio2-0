/**
 * Pass K K3 — Sidekick ground fog captures: wide, fog-edge close-up, and a
 * ~5 s drift clip (frames + mp4 via ffmpeg). Usage:
 *   node scripts/pass-k-k3.mjs <label> [--port 5179]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "k3";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const OUT = resolve("tmp/pass-k", label);
mkdirSync(`${OUT}/frames`, { recursive: true });
const { browser, page, dbg, sleep, hopTo } = await bootStage({ port, holdMs: 250, profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 60; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
await hopTo(2);
page.on("console", (m) => { if (m.type() === "error") console.log("console error", m.text().slice(0, 300)); });
page.on("worker", (w) => w.on("console", (m) => { if (m.type() === "error" || /THREE.WebGLProgram|Shader Error/.test(m.text())) console.log("worker", m.type(), m.text().slice(0, 600)); }));
await page.mouse.move(W * 0.04, H * 0.06);
await sleep(4000);
await page.screenshot({ path: `${OUT}/wide.png` });
const box = await dbg("debugGroundFogScreenBox");
// Close-up: the left edge of the fog footprint, at the floor line.
const cw = 520;
const ch = 300;
const cx = Math.max(0, Math.min(W - cw, (box?.x ?? W * 0.3) - cw * 0.35));
const cy = Math.max(0, Math.min(H - ch, (box?.cy ?? H * 0.75) - ch * 0.5));
const clip = { x: cx, y: cy, width: cw, height: ch };
await page.screenshot({ path: `${OUT}/edge.png`, clip });
// Drift clip: CDP screencast of the page for ~5 s, cropped around the phone.
const vw = Math.min(W, Math.round((box?.w ?? 900) * 1.4));
const vh = Math.min(H, Math.round(vw * 0.5625));
const vclip = { x: Math.max(0, Math.min(W - vw, (box?.cx ?? W / 2) - vw / 2)), y: Math.max(0, Math.min(H - vh, (box?.cy ?? H * 0.7) - vh * 0.6)), width: vw, height: vh };
const cdp = await page.context().newCDPSession(page);
let n = 0;
const stamps = [];
cdp.on("Page.screencastFrame", async (f) => {
  writeFileSync(`${OUT}/frames/f${String(n).padStart(4, "0")}.jpg`, Buffer.from(f.data, "base64"));
  stamps.push(f.metadata?.timestamp ?? Date.now() / 1000);
  n += 1;
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
await sleep(5200);
await cdp.send("Page.stopScreencast");
await sleep(300);
const span = stamps.length > 1 ? stamps[stamps.length - 1] - stamps[0] : 5;
const fps = (n - 1) / Math.max(0.1, span);
const params = await dbg("getGroundFogParams");
await browser.close();
try {
  // Screencast frames are CSS-px sized (viewport), so crop in CSS px.
  const crop = `crop=${vclip.width}:${vclip.height}:${vclip.x}:${vclip.y},scale=trunc(iw/2)*2:trunc(ih/2)*2`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", fps.toFixed(2), "-i", `${OUT}/frames/f%04d.jpg`, "-vf", crop, "-pix_fmt", "yuv420p", `${OUT}/drift.mp4`]);
} catch (error) {
  console.warn("ffmpeg failed", error.message);
}
writeFileSync(`${OUT}/k3.json`, JSON.stringify({ box, clip, vclip, frames: n, fps: +fps.toFixed(2), params }, null, 1));
console.log(JSON.stringify({ box, frames: n, fps: +fps.toFixed(2) }));
