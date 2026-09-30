/**
 * Task 1 diagnostic, production build, against the already-running
 * `npm run preview` server (http://127.0.0.1:5180). Headless Chromium pages
 * report visibilityState "visible" (no pane/tab backgrounding), which is the
 * control we need against the Claude Browser pane's "hidden" runs.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const URL = "http://127.0.0.1:5180/";
const DURATION_MS = 60_000;
const VIEWPORT = { width: 3440, height: 1232 };
const NO_SCREENSHOTS = process.argv.includes("--no-screenshots");
const OUT = NO_SCREENSHOTS
  ? "public/debug/hop-stall-prod-no-screenshots.json"
  : "public/debug/hop-stall-prod-as-is.json";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: VIEWPORT });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#fader.gone", { timeout: 60_000 });
console.log("visibility after load:", await page.evaluate(() => document.visibilityState));

await page.waitForSelector("#bh-enter:not([hidden])", { timeout: 60_000 });
await page.click("#bh-enter");
await page.waitForSelector("body:not(.is-black-hole)", { timeout: 60_000 });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  window.__resetFloor?.();
  window.__pageStall = null;
  window.__loaf = [];
  window.__longTasks = [];
});

const dots = await page.$$("#dots button");
const canvasBox = await page.locator("#scene-canvas").boundingBox();
const cx = canvasBox.x + canvasBox.width / 2;
const cy = canvasBox.y + canvasBox.height / 2;

const t0 = Date.now();
let hopTarget = 3;
let lastHop = Date.now();
let sweepAngle = 0;
let shotCount = 0;

while (Date.now() - t0 < DURATION_MS) {
  const loopStart = Date.now();
  sweepAngle += 0.35;
  const radius = Math.min(canvasBox.width, canvasBox.height) * 0.28;
  const x = cx + Math.cos(sweepAngle) * radius;
  const y = cy + Math.sin(sweepAngle * 0.7) * radius;
  await page.mouse.move(x, y);

  if (Date.now() - lastHop > 6000) {
    await dots[hopTarget]?.click();
    hopTarget = hopTarget === 3 ? 0 : 3;
    lastHop = Date.now();
  }

  if (!NO_SCREENSHOTS && Date.now() - t0 - shotCount * 5000 >= 5000) {
    shotCount += 1;
    await page.screenshot({ type: "png" });
  }

  const elapsed = Date.now() - loopStart;
  if (elapsed < 16) await page.waitForTimeout(16 - elapsed);
}

const report = await page.evaluate(() => ({
  visibility: document.visibilityState,
  loafTop5: (window.__loaf || []).slice().sort((a, b) => b.duration - a.duration).slice(0, 5),
  longTasks: (window.__longTasks || []).slice(-20),
  eventTasks: (window.__eventTasks || []).slice(-20),
  pageStall: window.__pageStall || null,
  mainTasks: window.__mainTasks || [],
  msgStats: window.__msgStats || {},
  floorMaxMs: window.__floor?.maxMs,
  floorCause: window.__floor?.cause,
  floorBreaches: window.__floor?.breaches || [],
  floorPrograms: window.__floor?.programs,
  hop03: window.__floor?.hop03
}));
report.mode = NO_SCREENSHOTS ? "no-screenshots" : "as-is";

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\n=== prod ${report.mode} ===`);
console.log("visibility:", report.visibility);
console.log("pageStall:", report.pageStall);
console.log("floorMaxMs:", report.floorMaxMs, "cause:", report.floorCause);
console.log("floorPrograms:", report.floorPrograms, "hop03:", JSON.stringify(report.hop03));
console.log("msgStats:", JSON.stringify(report.msgStats));
console.log(`wrote ${OUT}`);

await browser.close();
