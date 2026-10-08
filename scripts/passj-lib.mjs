/**
 * Shared boot for the Pass J probes: real branded Chrome, the user's window
 * (1837×1222 CSS, DSF 2), ?flight=1, black-hole hold → spiral → drop →
 * settled. Returns { browser, page, dbg, sleep, hopTo, shot }.
 */
import { chromium } from "playwright";

export const W = 1837;
export const H = 1222;

export async function bootStage({ port = 5190, holdMs = 15_000, query = "flight=1", log = console.log } = {}) {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: [`--window-size=${W},${H + 87}`, "--window-position=0,0"]
  });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = await context.newPage();
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
  await page.goto(`http://127.0.0.1:${port}/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#bh-enter:not([hidden])", { timeout: 240_000 });
  log("enter visible");
  await sleep(holdMs);
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
  return { browser, page, dbg, sleep, hopTo, shot, waitSettled, errors };
}
