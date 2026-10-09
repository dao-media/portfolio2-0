/**
 * Pass M — 10 s clip at Dane's window (1837×1222, DSF 2, real Chrome):
 * instant click on Enter → spiral → black gap → drop → land. CDP screencast
 * starts just before the click; each frame keeps its real duration (ffmpeg
 * concat), so stalls show as held frames. Also saves the flight dump.
 * Usage: node scripts/pass-m-clip.mjs [label] [--port 5179] [--secs 10]
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "clip";
const num = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const port = num("--port", 5179);
const secs = num("--secs", 10);
const OUT = resolve("tmp/pass-m", label);
rmSync(`${OUT}/frames`, { recursive: true, force: true });
mkdirSync(`${OUT}/frames`, { recursive: true });
let cdp = null;
let n = 0;
const stamps = [];
let clickAt = null;
const { browser, dbg, sleep } = await bootStage({
  port,
  holdMs: 250,
  profileDir: resolve("tmp/pass-k/chrome-profile"),
  beforeClick: async (_dbg, pg) => {
    cdp = await pg.context().newCDPSession(pg);
    cdp.on("Page.screencastFrame", async (f) => {
      writeFileSync(`${OUT}/frames/f${String(n).padStart(4, "0")}.jpg`, Buffer.from(f.data, "base64"));
      stamps.push(f.metadata?.timestamp ?? Date.now() / 1000);
      n += 1;
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
    clickAt = Date.now() / 1000;
  }
});
// bootStage returns once landed; keep recording to `secs` after the click.
const left = secs - (Date.now() / 1000 - clickAt);
if (left > 0) await sleep(left * 1000);
await cdp.send("Page.stopScreencast");
await sleep(300);
const flight = await dbg("flightDump");
const gaps = await dbg("debugGap");
await browser.close();
writeFileSync(`${OUT}/flight.json`, JSON.stringify(flight));
// Real per-frame durations; the last frame holds until `secs`.
const end = stamps[0] + secs;
let list = "";
for (let i = 0; i < n; i += 1) {
  const next = i + 1 < n ? stamps[i + 1] : end;
  list += `file 'frames/f${String(i).padStart(4, "0")}.jpg'\nduration ${Math.max(0.001, next - stamps[i]).toFixed(4)}\n`;
}
list += `file 'frames/f${String(n - 1).padStart(4, "0")}.jpg'\n`;
writeFileSync(`${OUT}/frames.txt`, list);
execFileSync(
  "ffmpeg",
  ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${OUT}/frames.txt`, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=60", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "20", `${OUT}/${label}.mp4`],
  { cwd: OUT }
);
const ms = flight.milestones;
const rel = (m) => (m ? Math.round(m.t) : null);
const out = {
  frames: n,
  fps: +((n - 1) / Math.max(0.1, stamps[n - 1] - stamps[0])).toFixed(1),
  gaps,
  milestones: ms
    .filter((m) => ["enter-shown", "bust-ready", "gap-start", "gap-end", "gap-skip", "stop-integrated", "stop-ready", "land"].includes(m.kind) || (m.kind === "mark" && /^integrate/.test(m.data?.label)))
    .map((m) => ({ t: rel(m), frame: m.frame, kind: m.kind, data: m.data }))
};
writeFileSync(`${OUT}/clip.json`, JSON.stringify(out, null, 1));
console.log(`${OUT}/${label}.mp4`, n, "frames", out.fps, "fps");
