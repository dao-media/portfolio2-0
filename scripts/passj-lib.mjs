/**
 * Shared boot for the Pass J probes: real branded Chrome, the user's window
 * (1837×1222 CSS, DSF 2), ?flight=1, black-hole hold → spiral → drop →
 * settled. Returns { browser, page, dbg, sleep, hopTo, shot }.
 */
import { chromium } from "playwright";

export const W = 1837;
export const H = 1222;

export async function bootStage({
  port = 5190,
  holdMs = 15_000,
  query = "flight=1",
  log = console.log,
  // Pass K: a persistent profile keeps the HTTP cache warm between runs, so
  // Enter appears as early as it does on Dane's machine (~6.5 s, not ~48 s).
  profileDir = null,
  // Pass M: runs (with dbg, page) right before the Enter click.
  beforeClick = null
} = {}) {
  const launchArgs = [`--window-size=${W},${H + 87}`, "--window-position=0,0"];
  let browser;
  let context;
  if (profileDir) {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: "chrome",
      headless: false,
      args: launchArgs,
      viewport: { width: W, height: H },
      deviceScaleFactor: 2
    });
    browser = { close: () => context.close() };
  } else {
    browser = await chromium.launch({ channel: "chrome", headless: false, args: launchArgs });
    context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  }
  const page = context.pages()[0] ?? (await context.newPage());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("worker", (w) => w.on("console", (m) => m.type() === "error" && errors.push(`worker:${m.text()}`)));
  const dbg = (method, ...a) =>
    page.evaluate(([m, x]) => (window.__stageDebug ? window.__stageDebug(m, ...x) : null), [method, a]);
  const sleep = (ms) => page.waitForTimeout(ms);
  await page.bringToFront();
  const gotoAt = Date.now();
  await page.goto(`http://127.0.0.1:${port}/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#bh-enter:not([hidden])", { timeout: 240_000 });
  const enterMs = Date.now() - gotoAt;
  log(`enter visible after ${(enterMs / 1000).toFixed(1)} s`);
  await sleep(holdMs);
  if (beforeClick) await beforeClick(dbg, page);
  await page.click("#bh-enter");
  await page.waitForSelector("body:not(.is-black-hole)", { timeout: 90_000 });
  for (let i = 0; i < 160; i += 1) {
    const s = await dbg("debugScrollCapture");
    if (s?.introComplete && s.cameraSettled && !s.locked) break;
    await sleep(500);
  }
  log("landed");
  async function waitSettled() {
    for (let k = 0; k < 120; k += 1) {
      await sleep(150);
      const s = await dbg("debugScrollCapture");
      if (s?.cameraSettled) return s;
    }
    return null;
  }
  async function hopTo(index) {
    for (let n = 0; n < 4; n += 1) {
      const s = await dbg("debugScrollCapture");
      if (s?.current === index) return;
      await dbg("advance", 1);
      await sleep(300);
      await waitSettled();
    }
  }
  const shot = (path, clip) => page.screenshot({ path, ...(clip ? { clip } : {}) });
  return { browser, page, dbg, sleep, hopTo, shot, waitSettled, errors, enterMs };
}
