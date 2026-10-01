/**
 * Captures real video (not internal GL polling) of the window from just
 * before the camera settles on the ring (post-drop land) through 5s after,
 * plus a correlated event/state log polled at ~30ms via the new
 * debugSettleProbe() bridge method. Finds frames where mean luminance drops
 * >50% vs the previous frame (ffmpeg signalstats YAVG) and reports what the
 * nearest-in-time probe sample shows fired around that timestamp.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const OUT_DIR = process.argv[2] || mkdtempSync(path.join(tmpdir(), "settle-capture-"));
const VIDEO_W = 1400;
const VIDEO_H = 900;

async function dbg(page, method, ...args) {
  return page.evaluate(
    ([m, a]) => (window.__stageDebug ? window.__stageDebug(m, ...a) : null),
    [method, args]
  );
}

const browser = await chromium.launch({
  headless: false,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const recordingStartWallClock = Date.now();
const context = await browser.newContext({
  viewport: { width: VIDEO_W, height: VIDEO_H },
  recordVideo: { dir: OUT_DIR, size: { width: VIDEO_W, height: VIDEO_H } }
});
const page = await context.newPage();
await page.bringToFront();
await page.goto("http://localhost:5190/", { waitUntil: "domcontentloaded" });
await page.bringToFront();

const probeLog = [];
let probing = false;
async function pollProbe() {
  while (probing) {
    const sample = await dbg(page, "debugSettleProbe");
    if (sample) probeLog.push({ wallMs: Date.now() - recordingStartWallClock, ...sample });
    await page.waitForTimeout(30);
  }
}

// Trigger the spiral the same way the smoke test does (navigator.webdriver
// doesn't propagate into the worker, so no auto-trigger here either).
let bridgeUp = false;
for (let i = 0; i < 120; i += 1) {
  bridgeUp = Boolean(await dbg(page, "debugUploadTimeline"));
  if (bridgeUp) break;
  await page.waitForTimeout(500);
}
for (let i = 0; i < 120; i += 1) {
  const s = await dbg(page, "debugUploadTimeline");
  const scroll = await dbg(page, "debugScrollCapture");
  if (s?.blackHoleActive && scroll?.locked === false) break;
  await page.waitForTimeout(250);
}
{
  const box = await page.locator("#scene-canvas").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
console.log("clicked to trigger spiral");

// Start probing + recording coverage 1s before land: poll rigHeight until it
// starts dropping from the apex (13.85), which is "about to land."
let aboutToLand = false;
for (let i = 0; i < 300; i += 1) {
  const s = await dbg(page, "debugUploadTimeline");
  if (s?.blackHoleActive === false && s?.rigHeight != null) {
    aboutToLand = true;
    break;
  }
  await page.waitForTimeout(50);
}
if (!aboutToLand) {
  console.error("never reached post-spiral state; aborting");
  await context.close();
  await browser.close();
  process.exit(1);
}
console.log("spiral ended, starting probe capture");
probing = true;
const pollPromise = pollProbe();

// Keep recording through land + settle + 5s after settle.
let settledAt = null;
for (let i = 0; i < 400; i += 1) {
  const scroll = await dbg(page, "debugScrollCapture");
  if (scroll?.introComplete && scroll?.cameraSettled) {
    settledAt = Date.now();
    break;
  }
  await page.waitForTimeout(50);
}
if (settledAt == null) {
  console.error("never reached settled state within budget");
} else {
  console.log("settled, recording 5s more");
  await page.waitForTimeout(5000);
}

probing = false;
await pollPromise;
const contextLossLog = (await dbg(page, "debugContextLossLog")) || [];
const rawLiveStepLog = (await dbg(page, "debugLiveStepLog")) || [];
await context.close(); // finalizes the video file
await browser.close();

// Both probeLog and rawLiveStepLog use the page's performance.now() (tMs);
// probeLog also carries wallMs (Node Date.now() - recordingStartWallClock,
// the same space video ptsTime*1000 lives in). Derive a tMs -> wallMs offset
// from probeLog and apply it to the step log so everything shares one clock.
const clockOffset =
  probeLog.length > 0
    ? probeLog.reduce((sum, p) => sum + (p.wallMs - p.tMs), 0) / probeLog.length
    : 0;
const liveStepLog = rawLiveStepLog.map((s) => ({ wallMs: Math.round(s.tMs + clockOffset), ...s }));
writeFileSync(path.join(OUT_DIR, "live-step-log.json"), JSON.stringify(liveStepLog, null, 2));

writeFileSync(path.join(OUT_DIR, "probe-log.json"), JSON.stringify(probeLog, null, 2));
console.log(`probe log: ${probeLog.length} samples -> ${path.join(OUT_DIR, "probe-log.json")}`);

// Find the recorded video file.
const fs = await import("node:fs");
const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".webm"));
if (!files.length) {
  console.error("no video file produced");
  process.exit(1);
}
const videoPath = path.join(OUT_DIR, files[0]);
console.log("video:", videoPath);

// Per-frame mean luma (YAVG) via ffmpeg signalstats + metadata=print to stdout.
const statsOut = execFileSync(
  "ffmpeg",
  [
    "-i", videoPath,
    "-vf", "signalstats,metadata=print:file=-",
    "-f", "null",
    "-"
  ],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 }
).toString();
writeFileSync(path.join(OUT_DIR, "ffmpeg-signalstats.log"), statsOut);

// Parse "frame:N pts:... pts_time:T" followed by "lavfi.signalstats.YAVG=V".
const lines = statsOut.split("\n");
const frames = [];
let cur = null;
for (const line of lines) {
  const fm = line.match(/^frame:(\d+)\s+pts:\S+\s+pts_time:([\d.]+)/);
  if (fm) {
    if (cur) frames.push(cur);
    cur = { n: Number(fm[1]), ptsTime: Number(fm[2]), yavg: null };
    continue;
  }
  const ym = line.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  if (ym && cur) cur.yavg = Number(ym[1]);
}
if (cur) frames.push(cur);
writeFileSync(path.join(OUT_DIR, "frames.json"), JSON.stringify(frames, null, 2));
console.log(`parsed ${frames.length} video frames with luminance`);

const drops = [];
for (let i = 1; i < frames.length; i += 1) {
  const prev = frames[i - 1];
  const now = frames[i];
  if (prev.yavg == null || now.yavg == null) continue;
  if (prev.yavg > 5 && now.yavg < prev.yavg * 0.5) {
    drops.push({ frame: now.n, ptsTime: now.ptsTime, prevYavg: prev.yavg, yavg: now.yavg });
  }
}
console.log(`\n${drops.length} frame(s) with >50% luminance drop vs previous frame:`);
for (const d of drops) {
  const dropWallMs = d.ptsTime * 1000;
  let nearest = null;
  let nearestDelta = Infinity;
  for (const p of probeLog) {
    const delta = Math.abs(p.wallMs - dropWallMs);
    if (delta < nearestDelta) {
      nearestDelta = delta;
      nearest = p;
    }
  }
  // Steps within +/-80ms of the drop (one or two ticks either side).
  const nearbySteps = liveStepLog.filter((s) => Math.abs(s.wallMs - dropWallMs) <= 80);
  console.log(
    `  frame ${d.frame} @ ${d.ptsTime.toFixed(3)}s: YAVG ${d.prevYavg.toFixed(1)} -> ${d.yavg.toFixed(1)} | nearest probe (Δ${nearestDelta}ms): worldVisible=${nearest?.worldVisible} skipBeauty=${nearest?.skipBeauty} | steps nearby: ${JSON.stringify(nearbySteps)}`
  );
}
if (!drops.length) {
  console.log("  (none found — no >50% luma drop between consecutive frames in this capture)");
}

// Also report every drawingBuffer/restFidelityKey/programCount change across
// the whole probe log, timestamped — "every object that appears after land
// and when" proxy (program count jumps = new compiles; restFidelityKey
// changes = lantern shadow / wet-probe bakes; drawingBuffer changes = resize).
console.log("\nstate transitions across the probe log:");
let prevState = null;
for (const p of probeLog) {
  if (!prevState) {
    prevState = p;
    continue;
  }
  const changes = [];
  if (prevState.drawingBuffer.width !== p.drawingBuffer.width || prevState.drawingBuffer.height !== p.drawingBuffer.height) {
    changes.push(`resize ${prevState.drawingBuffer.width}x${prevState.drawingBuffer.height} -> ${p.drawingBuffer.width}x${p.drawingBuffer.height}`);
  }
  if (prevState.restFidelityKey !== p.restFidelityKey) {
    changes.push(`restFidelityKey "${prevState.restFidelityKey}" -> "${p.restFidelityKey}"`);
  }
  if (prevState.programCount !== p.programCount) {
    changes.push(`programCount ${prevState.programCount} -> ${p.programCount}`);
  }
  if (prevState.governorLevel !== p.governorLevel) {
    changes.push(`governorLevel ${prevState.governorLevel} -> ${p.governorLevel}`);
  }
  if (prevState.worldVisible !== p.worldVisible) {
    changes.push(`worldVisible ${prevState.worldVisible} -> ${p.worldVisible}`);
  }
  if (Math.abs((prevState.modelRevealOpacity ?? 0) - (p.modelRevealOpacity ?? 0)) > 0.001 && (p.modelRevealOpacity === 0 || p.modelRevealOpacity === 1)) {
    changes.push(`modelRevealOpacity -> ${p.modelRevealOpacity}`);
  }
  if (changes.length) {
    console.log(`  @${p.wallMs}ms: ${changes.join("; ")}`);
  }
  prevState = p;
}

console.log(`\nwebglcontextlost/restored events: ${contextLossLog.length ? JSON.stringify(contextLossLog) : "none"}`);
console.log(`\nfull outputs in: ${OUT_DIR}`);
