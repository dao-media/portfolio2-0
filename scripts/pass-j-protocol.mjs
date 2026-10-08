/**
 * Pass J verification protocol — the user's own sequence, at the user's own
 * window size, in real (branded) Chrome with ?flight=1:
 *
 *   hold 15 s → spiral → drop → settle 10 s → hop 0→1→2→3→0 → hop back 0→3→2→1→0
 *
 * Writes everything to an out directory (default tmp/pass-j/<label>):
 *   - settled-<stop>.png for each stop on the forward pass, midhop-<a>-<b>.png
 *   - flight.json (full flightDump), summary.json (trigger totals, hop
 *     records, per-hop POP-IN/BLINK reasons, visibility proof)
 *
 * Extra probes (horizon / stars / duo / fog / PC) run when their flag is set:
 *   --horizon   sample pixels above/below the horizon at stops 0, 1, 2
 *   --no-back   skip the reverse leg
 *
 * Usage: node scripts/pass-j-protocol.mjs [label] [--horizon] [--port 5190]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--")) || "run";
const flag = (name) => args.includes(`--${name}`);
const portIdx = args.indexOf("--port");
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : 5190;
const OUT = resolve("tmp/pass-j", label);
mkdirSync(OUT, { recursive: true });

const W = 1837;
const H = 1222;

const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: [`--window-size=${W},${H + 87}`, "--window-position=0,0"]
});
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2
});
const page = await context.newPage();
const consoleLog = [];
page.on("console", (m) => consoleLog.push({ type: m.type(), text: m.text() }));
page.on("pageerror", (e) => consoleLog.push({ type: "pageerror", text: e.message }));
page.on("worker", (w) => w.on("console", (m) => consoleLog.push({ type: `worker:${m.type()}`, text: m.text() })));

async function dbg(method, ...a) {
  return page.evaluate(
    ([m, x]) => (window.__stageDebug ? window.__stageDebug(m, ...x) : null),
    [method, a]
  );
}
const sleep = (ms) => page.waitForTimeout(ms);
const t0 = Date.now();
const timeline = [];
const mark = (event, extra) => {
  const row = { tMs: Date.now() - t0, event, ...(extra || {}) };
  timeline.push(row);
  console.log(`[${(row.tMs / 1000).toFixed(1)}s] ${event}${extra ? " " + JSON.stringify(extra) : ""}`);
};

let hidden = 0;
const visTimer = setInterval(async () => {
  try {
    if ((await page.evaluate(() => document.visibilityState)) !== "visible") hidden += 1;
  } catch {}
}, 1000);

await page.bringToFront();
await page.goto(`http://127.0.0.1:${PORT}/?flight=1`, { waitUntil: "domcontentloaded" });
mark("goto");
await page.waitForSelector("#bh-enter:not([hidden])", { timeout: 180_000 });
mark("enter-visible");
// The user's hold: 15 s looking at the black hole before engaging.
await sleep(15_000);
mark("hold-done");
await page.bringToFront();
await page.click("#bh-enter");
mark("spiral");
await page.waitForSelector("body:not(.is-black-hole)", { timeout: 90_000 });
mark("drop");
for (let i = 0; i < 120; i += 1) {
  const s = await dbg("debugScrollCapture");
  if (s?.introComplete && s.cameraSettled && !s.locked) break;
  await sleep(500);
}
mark("landed");
await sleep(10_000);
mark("settle-10s");

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function stopState() {
  return dbg("debugStopFade").catch(() => null);
}

async function hop(dir, midShot) {
  const before = await dbg("debugScrollCapture");
  await dbg("advance", dir);
  const from = before?.current;
  const hopT0 = Date.now();
  const samples = [];
  let mid = false;
  while (Date.now() - hopT0 < 20_000) {
    const s = await dbg("debugScrollCapture");
    const fade = await stopState();
    samples.push({ t: Date.now() - hopT0, settled: s?.cameraSettled, current: s?.current, fade });
    if (midShot && !mid && Date.now() - hopT0 > 450) {
      mid = true;
      await shot(`midhop-${from}-${s?.current}`);
    }
    if (s?.cameraSettled && Date.now() - hopT0 > 300) break;
    await sleep(60);
  }
  await sleep(1200);
  const after = await dbg("debugScrollCapture");
  mark("hop", { from, to: after?.current, ms: Date.now() - hopT0 });
  return { from, to: after?.current, samples };
}

const hops = [];
await shot("settled-0");
for (let i = 0; i < 4; i += 1) {
  hops.push(await hop(1, i === 0));
  await sleep(1500);
  const cur = (await dbg("debugScrollCapture"))?.current;
  if (i < 3) await shot(`settled-${cur}`);
}
if (!flag("no-back")) {
  for (let i = 0; i < 4; i += 1) {
    hops.push(await hop(-1, false));
    await sleep(1500);
  }
}
mark("hops-done");

const extras = {};
if (flag("horizon")) {
  extras.horizon = [];
  for (const stop of [0, 1, 2]) {
    while ((await dbg("debugScrollCapture"))?.current !== stop) {
      await dbg("advance", 1);
      for (let k = 0; k < 80; k += 1) {
        await sleep(200);
        if ((await dbg("debugScrollCapture"))?.cameraSettled) break;
      }
    }
    await sleep(2500);
    await shot(`horizon-${stop}`);
    extras.horizon.push({ stop, png: `horizon-${stop}.png`, probe: await dbg("debugHorizonProbe").catch(() => null) });
  }
}

extras.programLeak = await dbg("debugProgramLeakRows").catch(() => null);
// Item 2: shadow-map renders per light over 5 s settled (back on Bust).
extras.shadowsSettledBust = await dbg("debugShadowReport", 5).catch(() => null);
const flight = await dbg("flightDump");
writeFileSync(`${OUT}/flight.json`, JSON.stringify(flight, null, 1));
const summary = {
  label,
  window: { W, H, dsf: 2 },
  hiddenTicks: hidden,
  totalCounts: flight?.totalCounts,
  totalCountsByPhase: flight?.totalCountsByPhase,
  reasonCounts: flight?.reasonCounts,
  topSlow: (flight?.topSlow || []).map((r) => ({
    frame: r.frame,
    phase: r.phase,
    frameMs: r.frameMs,
    cpuWorkMs: r.cpuWorkMs,
    cause: r.frameCause,
    sections: r.cpuSections,
    rig: r.rigSections,
    drawingBuffer: r.drawingBuffer,
    programsCreated: r.programsCreated
  })),
  hops: hops.map((h) => ({ from: h.from, to: h.to, samples: h.samples.length, fadeTrace: h.samples.map((s) => [s.t, s.fade?.fades]) })),
  extras,
  timeline,
  errors: consoleLog.filter((c) => /error|pageerror/i.test(c.type)).slice(0, 40)
};
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ totalCounts: summary.totalCounts, byPhase: summary.totalCountsByPhase, reasons: summary.reasonCounts }, null, 1));
clearInterval(visTimer);
await browser.close();
