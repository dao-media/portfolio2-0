/**
 * Pass P — film-look study at one stop (A/B only; nothing ships). Dane's
 * window, real Chrome, ?flight=1&ao=1. For rest and zoom views, each variant:
 * uncapped frame ms (debugMeasureFps), a full-window shot and a 100% detail
 * crop. P3 exposure is matched to the current frame's mean linear luminance.
 * P6: texture audit at both views, anisotropy 16 shots, and a "drop mip 0"
 * downsize simulation of textures whose need fits half size (VRAM saved).
 * Clips (--clips): P2 accumulation + reset on cursor move, P4 medium grain.
 * Usage: node scripts/pass-p-study.mjs --stop 0|1 [--port 5179] [--clips]
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const num = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const stop = num("--stop", 0);
const port = num("--port", 5179);
const clips = args.includes("--clips");
const OUT = resolve("tmp/pass-p", `stop${stop}`);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, waitSettled, hopTo, errors } = await bootStage({ port, query: "flight=1&ao=1", holdMs: 8000, profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
if (stop) await hopTo(stop);
const park = () => page.mouse.move(W * 0.06, H * 0.08);
await park();
await dbg("debugAbToggle", "floor-freeze", false);
await dbg("debugPinFloor", null);
await dbg("debugFilmStudy", { ao: false });
await sleep(3000);

// Mean linear luminance of a screenshot (whole window).
const meanLum = (file) => {
  const raw = execFileSync("ffmpeg", ["-loglevel", "error", "-i", file, "-vf", "scale=640:-1,format=rgb24", "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 });
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  let s = 0;
  for (let i = 0; i < raw.length; i += 3) s += 0.2126 * lin(raw[i]) + 0.7152 * lin(raw[i + 1]) + 0.0722 * lin(raw[i + 2]);
  return s / (raw.length / 3);
};
const measure = async () => {
  await dbg("setFramePacing", 0);
  await sleep(500);
  const r = await dbg("debugMeasureFps", 2.5);
  await dbg("setFramePacing", null);
  return r?.meanIntervalMs ?? null;
};
// Detail crops (CSS px, 100% = device px in the 2x screenshot) per stop/view.
const DETAIL = {
  0: { rest: [700, 690, 450, 300], zoom: [560, 560, 450, 300] },
  1: { rest: [820, 360, 450, 300], zoom: [700, 360, 450, 300] }
}[stop] ?? { rest: [700, 400, 450, 300], zoom: [700, 400, 450, 300] };

const SUBTLE = { grain: 0.025, halation: 0.15 };
const MEDIUM = { grain: 0.05, halation: 0.35 };
const VARIANTS = [
  ["current", {}, {}],
  ["P1-3.2MP", { restMp: 3.2 }, { restMp: null }],
  ["P1-4.5MP", { restMp: 4.5 }, { restMp: null }],
  ["P1-native", { restMp: "native" }, { restMp: null }],
  ["P2-accum", { accum: true }, { accum: false }],
  ["P3-ACES", { tone: "aces" }, { tone: null }],
  ["P3-AgX", { tone: "agx" }, { tone: null }],
  ["P3-Neutral", { tone: "neutral" }, { tone: null }],
  ["P4-subtle", { film: SUBTLE }, { film: 0 }],
  ["P4-medium", { film: MEDIUM }, { film: 0 }],
  ["P5-AO", { ao: true }, { ao: false }],
  ["ALL", { restMp: 4.5, accum: true, tone: "agx", film: SUBTLE, ao: true }, { restMp: null, accum: false, tone: null, film: 0, ao: false }]
];

const results = { stop, views: {} };
// Same framing for every shot: wait until the camera pose matches the
// reference taken for "current" (something drifts the zoomed camera).
const poseDist = (a, b) => Math.max(...a.p.map((v, i) => Math.abs(v - b.p[i])), ...a.q.map((v, i) => Math.abs(v - b.q[i])));
async function waitPose(ref, ms = 6000) {
  const t0 = Date.now();
  let d = Infinity;
  for (;;) {
    const p = await dbg("debugCameraPose");
    d = poseDist(p, ref);
    if (d < 2e-4 || Date.now() - t0 > ms) return { d, accumN: p.accumN };
    await sleep(100);
  }
}
async function runView(view) {
  const rows = [];
  let target = null;
  let ref = null;
  const exposures = {};
  for (const [name, on, off] of VARIANTS) {
    const file = `${OUT}/${view}-${name}.png`;
    const patch = { ...on };
    if (patch.tone) patch.exposure = exposures[patch.tone] ?? 1;
    await dbg("debugFilmStudy", patch);
    await park();
    await sleep(name.startsWith("P1") || name === "ALL" ? 2500 : 1800);
    // P3: match exposure to the current frame's mean linear luminance.
    if (patch.tone && exposures[patch.tone] == null) {
      let e = 1;
      for (let k = 0; k < 4; k += 1) {
        await dbg("debugFilmStudy", { tone: patch.tone, exposure: e });
        await sleep(700);
        await page.screenshot({ path: file });
        const m = meanLum(file);
        if (!(m > 0) || Math.abs(m / target - 1) < 0.02) break;
        e *= Math.max(0.25, Math.min(4, target / m));
      }
      exposures[patch.tone] = e;
    }
    const ms = await measure();
    if (!ref) ref = await dbg("debugCameraPose");
    const pose = await waitPose(ref);
    await sleep(name.includes("accum") || name === "ALL" ? 900 : 300);
    const accumN = (await dbg("debugCameraPose")).accumN;
    await page.screenshot({ path: file });
    const [x, y, w, h] = DETAIL[view];
    await page.screenshot({ path: `${OUT}/${view}-${name}-detail.png`, clip: { x, y, width: w, height: h } });
    const lum = meanLum(file);
    if (name === "current") target = lum;
    rows.push({ name, ms, lum: +lum.toFixed(5), exposure: patch.tone ? +exposures[patch.tone].toFixed(3) : null, poseDiff: +pose.d.toExponential(2), accumN, state: await dbg("debugFilmStudy", {}) });
    console.log(view, name, ms, lum.toFixed(5), patch.tone ? exposures[patch.tone].toFixed(3) : "", "pose", pose.d.toExponential(1), accumN != null ? `accumN ${accumN}` : "");
    await dbg("debugFilmStudy", off);
  }
  // P6 — audit + anisotropy 16 + mip-0 drop simulation.
  const audit = await dbg("debugTextureAudit");
  await dbg("debugFilmStudy", { aniso: 16 });
  await sleep(800);
  const aniso16Ms = await measure();
  await page.screenshot({ path: `${OUT}/${view}-P6-aniso16.png` });
  const [x, y, w, h] = DETAIL[view];
  await page.screenshot({ path: `${OUT}/${view}-P6-aniso16-detail.png`, clip: { x, y, width: w, height: h } });
  results.views[view] = { rows, audit, aniso16Ms, exposures };
}

await runView("rest");
// Zoom: click the subject (Bust / PC), park the cursor, settle.
await page.mouse.click(W * 0.5, H * (stop === 1 ? 0.45 : 0.62));
await sleep(2500);
await waitSettled();
await park();
await sleep(2500);
await runView("zoom");

// P6 downsize simulation: textures whose need (max over both views) fits half
// size with 25% margin lose mip 0 (= half resolution) — shot at zoom.
const need = new Map();
for (const v of Object.values(results.views)) for (const r of v.audit ?? []) need.set(r.name, { ...r, need: Math.max(need.get(r.name)?.need ?? 0, r.need) });
const half = [...need.values()].filter((r) => r.w >= 1024 && r.need * 1.25 <= r.w / 2);
const mipBase = Object.fromEntries(half.map((r) => [r.name, 1]));
await dbg("debugFilmStudy", { mipBase });
await sleep(1000);
await page.screenshot({ path: `${OUT}/zoom-P6-half.png` });
const [dx, dy, dw, dh] = DETAIL.zoom;
await page.screenshot({ path: `${OUT}/zoom-P6-half-detail.png`, clip: { x: dx, y: dy, width: dw, height: dh } });
await dbg("debugFilmStudy", { mipBase: null, aniso: null });
const saved = half.reduce((a, r) => a + r.w * r.h * 4 * (4 / 3) * 0.75, 0);
results.p6 = { half: half.map((r) => ({ name: r.name, size: `${r.w}x${r.h}`, need: r.need })), vramSavedMb: +(saved / 1048576).toFixed(1), audit: [...need.values()] };

// Clips where motion matters (Bust only by default).
async function clip(name, setup, during, secs) {
  rmSync(`${OUT}/clip-${name}`, { recursive: true, force: true });
  mkdirSync(`${OUT}/clip-${name}`, { recursive: true });
  await setup();
  const cdp = await page.context().newCDPSession(page);
  let n = 0;
  const stamps = [];
  cdp.on("Page.screencastFrame", async (f) => {
    writeFileSync(`${OUT}/clip-${name}/f${String(n).padStart(4, "0")}.jpg`, Buffer.from(f.data, "base64"));
    stamps.push(f.metadata?.timestamp ?? Date.now() / 1000);
    n += 1;
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H });
  await during();
  await sleep(secs * 1000);
  await cdp.send("Page.stopScreencast");
  await sleep(300);
  let list = "";
  for (let i = 0; i < n; i += 1) list += `file 'f${String(i).padStart(4, "0")}.jpg'\nduration ${Math.max(0.001, (i + 1 < n ? stamps[i + 1] : stamps[i] + 1 / 30) - stamps[i]).toFixed(4)}\n`;
  writeFileSync(`${OUT}/clip-${name}/frames.txt`, list);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "frames.txt", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=60", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "18", `${OUT}/${name}.mp4`], { cwd: `${OUT}/clip-${name}` });
}
if (clips) {
  await page.keyboard.press("Escape");
  await sleep(2000);
  await waitSettled();
  await park();
  await sleep(1500);
  await clip("P2-accum-reset", async () => { await dbg("debugFilmStudy", { accum: true }); await sleep(1200); }, async () => {
    await sleep(1200);
    for (let i = 0; i < 20; i += 1) { await page.mouse.move(W * (0.06 + i * 0.01), H * 0.08); await sleep(30); }
    await sleep(1500);
  }, 0.5);
  await dbg("debugFilmStudy", { accum: false });
  await park();
  await clip("P4-medium-grain", async () => { await dbg("debugFilmStudy", { film: MEDIUM }); await sleep(800); }, async () => {}, 2.5);
  await dbg("debugFilmStudy", { film: 0 });
}
await browser.close();
results.errors = errors.filter((e) => !/favicon/.test(e)).slice(0, 8);
writeFileSync(`${OUT}/study.json`, JSON.stringify(results, null, 1));
console.log(JSON.stringify({ p6: { half: results.p6.half.length, vramSavedMb: results.p6.vramSavedMb }, errors: results.errors }));
