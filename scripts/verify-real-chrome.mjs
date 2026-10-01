/**
 * Standard verification harness — real, headed Chrome (never the Claude
 * Browser pane), window visible and focused, real GPU.
 *
 * document.visibilityState is logged every second; if it ever reads
 * anything but "visible" the run is discarded (throttling invalidates
 * timing/frame-rate evidence, though not material/texture pixel readbacks).
 *
 * Console capture has three tiers, each catching what the others miss:
 *  - page.on("console")            → main-thread console.* (incl. relayed
 *                                     "[stage.worker]" errors from stageHost)
 *  - worker.on("console")          → console.* called DIRECTLY inside the
 *                                     stage worker (e.g. warmVignette0's
 *                                     "texture upload failed" warns) — these
 *                                     never reach page.on("console").
 *  - CDP Log.entryAdded            → browser/GPU-driver level entries (GL
 *                                     validation warnings) — not console.*
 *                                     calls at all, only visible via CDP.
 * Skipping any tier reproduces exactly the blind spots that hid 143 real
 * chunk-upload GL warnings during the bust/tree texture bug investigation.
 *
 * Usage: node scripts/verify-real-chrome.mjs [url] [outJsonPath]
 */
import { writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:5190/";
const OUT = process.argv[3] || "/tmp/verify-real-chrome.json";
const VIS_LOG = "/tmp/verify-real-chrome-visibility.log";
writeFileSync(VIS_LOG, "");

const browser = await chromium.launch({ headless: false, args: ["--start-maximized"] });
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();

const consoleLog = [];
page.on("console", (msg) => {
  consoleLog.push({ t: Date.now(), type: msg.type(), text: msg.text() });
});
page.on("pageerror", (e) => consoleLog.push({ t: Date.now(), type: "pageerror", text: e.message }));
page.on("worker", (worker) => {
  worker.on("console", (msg) => {
    consoleLog.push({ t: Date.now(), type: `worker:${msg.type()}`, text: msg.text() });
  });
});
const cdp = await context.newCDPSession(page);
await cdp.send("Log.enable");
cdp.on("Log.entryAdded", (e) => {
  consoleLog.push({ t: Date.now(), type: `cdplog:${e.entry.level}`, text: e.entry.text });
});

const t0 = Date.now();
const timeline = []; // { bucket10s, event }
function mark(event) {
  timeline.push({ tMs: Date.now() - t0, bucket10s: Math.floor((Date.now() - t0) / 10000), event });
}

await page.bringToFront();
await page.goto(URL, { waitUntil: "domcontentloaded" });
mark("goto");

let discarded = false;
const visTimer = setInterval(async () => {
  try {
    const vis = await page.evaluate(() => document.visibilityState);
    appendFileSync(VIS_LOG, `${new Date().toISOString()} ${vis}\n`);
    if (vis !== "visible") discarded = true;
  } catch {
    /* navigating, ignore this tick */
  }
}, 1000);

await page.waitForSelector("#fader.gone", { timeout: 120_000 });
mark("fader-gone");
await page.bringToFront();
await page.waitForSelector("#bh-enter:not([hidden])", { timeout: 120_000 });
mark("enter-visible");
await page.bringToFront();
await page.click("#bh-enter");
mark("enter-clicked");
await page.waitForSelector("body:not(.is-black-hole)", { timeout: 60_000 });
mark("black-hole-exit");

for (let i = 0; i < 60; i += 1) {
  await page.bringToFront();
  const warm = await page.evaluate(() => window.__stageDebug?.("debugWarmState"));
  const resolved = await warm;
  if (resolved?.done) {
    mark("warm-complete");
    break;
  }
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(3000);
mark("settle+3s");

await page.screenshot({ path: "/tmp/verify-real-chrome.png", timeout: 10_000 }).catch((e) =>
  console.log("screenshot skipped:", e.message)
);

clearInterval(visTimer);

const visLines = readFileSync(VIS_LOG, "utf8").trim().split("\n").filter(Boolean);
const hiddenCount = visLines.filter((l) => l.includes(" hidden")).length;

const errorsAndWarnings = consoleLog.filter((c) =>
  /error|warn|pageerror/i.test(c.type)
);
const chunkWarnings = consoleLog.filter((c) =>
  /glCopySubTextureCHROMIUM|glTexImage2DRobustANGLE|Texture is immutable|Offset overflows/.test(c.text)
);
const workerErrors = consoleLog.filter((c) => c.type.startsWith("worker:") && /error|warn/i.test(c.type));

writeFileSync(
  OUT,
  JSON.stringify(
    {
      discardedDueToHidden: discarded,
      hiddenTicks: hiddenCount,
      totalVisTicks: visLines.length,
      chunkWarningCount: chunkWarnings.length,
      chunkWarningsFirst10: chunkWarnings.slice(0, 10),
      workerErrorCount: workerErrors.length,
      workerErrors,
      allErrorsAndWarnings: errorsAndWarnings,
      timeline
    },
    null,
    2
  )
);

console.log("discarded:", discarded, "hiddenTicks:", hiddenCount, "/", visLines.length);
console.log("chunkWarnings:", chunkWarnings.length);
console.log("workerErrors:", workerErrors.length);
console.log(`wrote ${OUT}`);
console.log("screenshot: /tmp/verify-real-chrome.png");

await browser.close();
