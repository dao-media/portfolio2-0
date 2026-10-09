/**
 * Pass O O1 — Sidekick drop shadow: before (off) / after crops at rest, the
 * shadow's shape sampled through one bob period, phone-shell contrast, and a
 * 5 s screencast of the bob. Usage: node scripts/pass-o-drop.mjs <label> [--port 5179]
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--")) || "drop";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const OUT = resolve("tmp/pass-o", label);
rmSync(`${OUT}/frames`, { recursive: true, force: true });
mkdirSync(`${OUT}/frames`, { recursive: true });
const { browser, page, dbg, sleep, hopTo, errors } = await bootStage({ port, holdMs: 8000, profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
await hopTo(2);
await page.mouse.move(W * 0.06, H * 0.08);
await sleep(3500);
// Back to back (~150 ms apart) so the tube's colour cycle barely moves.
await dbg("debugAbToggle", "sk-drop", false);
await sleep(120);
await page.screenshot({ path: `${OUT}/before.png` });
await dbg("debugAbToggle", "sk-drop", true);
await sleep(120);
await page.screenshot({ path: `${OUT}/after.png` });
const samples = [];
for (let i = 0; i < 24; i += 1) {
  samples.push((await dbg("debugSidekickDrop"))?.last);
  await sleep(250);
}
// 5 s bob clip (real frame durations)
const cdp = await page.context().newCDPSession(page);
let n = 0;
const stamps = [];
cdp.on("Page.screencastFrame", async (f) => {
  writeFileSync(`${OUT}/frames/f${String(n).padStart(4, "0")}.jpg`, Buffer.from(f.data, "base64"));
  stamps.push(f.metadata?.timestamp ?? Date.now() / 1000);
  n += 1;
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W, maxHeight: H });
await sleep(5200);
await cdp.send("Page.stopScreencast");
await sleep(300);
const state = await dbg("debugSidekickDrop");
await browser.close();
let list = "";
for (let i = 0; i < n; i += 1) {
  const next = i + 1 < n ? stamps[i + 1] : stamps[i] + 1 / 30;
  list += `file 'frames/f${String(i).padStart(4, "0")}.jpg'\nduration ${Math.max(0.001, next - stamps[i]).toFixed(4)}\n`;
}
writeFileSync(`${OUT}/frames.txt`, list);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${OUT}/frames.txt`, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=60", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "20", `${OUT}/bob.mp4`], { cwd: OUT });
const pick = (k) => samples.filter(Boolean).map((s) => s[k]);
const range = (k) => [Math.min(...pick(k)), Math.max(...pick(k))];
const out = { params: state?.params, range: { h: range("h"), span: range("span"), opacity: range("opacity"), tight: range("tight") }, frames: n, errors: errors.filter((e) => !/favicon/.test(e)).slice(0, 5) };
writeFileSync(`${OUT}/drop.json`, JSON.stringify({ ...out, samples }, null, 1));
console.log(JSON.stringify(out));
