/**
 * Task 1 diagnostic harness: 60s stress at 3440x1232, cycling hop 0<->3 with a
 * continuous pointer sweep, capturing LoAF / longtask / event-timing / page-raf
 * stall telemetry already wired up in stageHost.js (window.__loaf, __longTasks,
 * __eventTasks, __pageStall, __msgStats) and the worker's program/floor stats
 * (window.__floor via postMessage capture).
 *
 * Usage:
 *   node scripts/hop-stall-stress.mjs            # as-is (periodic screenshots + pointer)
 *   node scripts/hop-stall-stress.mjs --no-screenshots   # pointer injection only
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5177;
const DURATION_MS = 60_000;
const VIEWPORT = { width: 3440, height: 1232 };
const NO_SCREENSHOTS = process.argv.includes("--no-screenshots");
const OUT = NO_SCREENSHOTS
  ? "public/debug/hop-stall-stress-no-screenshots.json"
  : "public/debug/hop-stall-stress-as-is.json";

const harnessLog = [];
function noteHarness(kind, start, end) {
  harnessLog.push({ kind, start: Math.round(start), end: Math.round(end) });
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false }
});
await server.listen();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });

page.on("console", (msg) => {
  if (msg.type() === "error") console.log("[page error]", msg.text());
});
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });

await page.waitForSelector("#fader.gone", { timeout: 120_000 });
await page.waitForTimeout(2000);

// Site opens on a black-hole flight; leave it via the Enter button before the
// vignette hop dots become interactive (body.is-black-hole hides .ui).
await page.waitForSelector("#bh-enter:not([hidden])", { timeout: 60_000 });
await page.click("#bh-enter");
await page.waitForSelector("body:not(.is-black-hole)", { timeout: 60_000 });
await page.waitForTimeout(1500);

// Expose a bridge so page-side __harness matches this driver's injected actions.
await page.evaluate(() => {
  window.__harness = window.__harness || [];
});

function pushPageHarness(kind, start, end) {
  return page.evaluate(
    ({ kind, start, end }) => {
      window.__harness = window.__harness || [];
      window.__harness.push({ kind, start, end });
      if (window.__harness.length > 64) window.__harness.shift();
    },
    { kind, start, end }
  );
}

const dots = await page.$$("#dots button");
console.log(`found ${dots.length} hop dots`);

const canvasBox = await page.locator("#scene-canvas").boundingBox();
const cx = canvasBox.x + canvasBox.width / 2;
const cy = canvasBox.y + canvasBox.height / 2;

const t0 = Date.now();
let hopTarget = 3;
let lastHop = Date.now();
let sweepAngle = 0;
let shotCount = 0;

async function clickHop(index) {
  if (!dots[index]) return;
  const t = performance_now();
  await dots[index].click();
  const t2 = performance_now();
  noteHarness("click", t, t2);
  await pushPageHarness("click", t, t2);
}

function performance_now() {
  return Date.now() - t0;
}

while (Date.now() - t0 < DURATION_MS) {
  const loopStart = Date.now();

  // continuous pointer sweep across the canvas
  sweepAngle += 0.35;
  const radius = Math.min(canvasBox.width, canvasBox.height) * 0.28;
  const x = cx + Math.cos(sweepAngle) * radius;
  const y = cy + Math.sin(sweepAngle * 0.7) * radius;
  const mtStart = performance_now();
  await page.mouse.move(x, y);
  const mtEnd = performance_now();
  noteHarness("pointer", mtStart, mtEnd);

  if (Date.now() - lastHop > 6000) {
    await clickHop(hopTarget);
    hopTarget = hopTarget === 3 ? 0 : 3;
    lastHop = Date.now();
  }

  if (!NO_SCREENSHOTS && Date.now() - t0 - shotCount * 5000 >= 5000) {
    shotCount += 1;
    const sStart = performance_now();
    await page.screenshot({ type: "png" });
    const sEnd = performance_now();
    noteHarness("screenshot", sStart, sEnd);
    await pushPageHarness("screenshot", sStart, sEnd);
  }

  const elapsed = Date.now() - loopStart;
  const target = 16;
  if (elapsed < target) await page.waitForTimeout(target - elapsed);
}

const report = await page.evaluate(() => {
  const loaf = (window.__loaf || []).slice().sort((a, b) => b.duration - a.duration).slice(0, 5);
  return {
    loafTop5: loaf,
    loafError: window.__loafError || null,
    longTasks: (window.__longTasks || []).slice(-20),
    longTaskError: window.__longTaskError || null,
    eventTasks: (window.__eventTasks || []).slice(-20),
    eventError: window.__eventError || null,
    pageStall: window.__pageStall || null,
    mainTasks: window.__mainTasks || [],
    pageTaskPeak: window.__pageTaskPeak || null,
    msgStats: window.__msgStats || {},
    floor: window.__floor || null,
    visibility: document.visibilityState
  };
});

report.harnessDriverLog = harnessLog;
report.mode = NO_SCREENSHOTS ? "no-screenshots" : "as-is";
report.maxMs = report.pageStall?.ms ?? report.floor?.maxMs ?? null;

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\n=== ${report.mode} ===`);
console.log("maxMs (pageStall):", report.pageStall?.ms, "label:", report.pageStall?.label, "trigger:", report.pageStall?.trigger);
console.log("floor.maxMs:", report.floor?.maxMs, "cause:", report.floor?.cause);
console.log("floor.programs:", report.floor?.programs, "hop03:", JSON.stringify(report.floor?.hop03));
console.log("msgStats:", JSON.stringify(report.msgStats));
console.log(`wrote ${OUT}`);

await browser.close();
await server.close();
