/**
 * Pass Q — version-agnostic settled shots for bisecting old commits (no
 * debug API needed): boot, click Enter if present, settle, shoot Bust, then
 * ArrowRight to Desktop and shoot. Dane's window, real Chrome.
 * Usage: node scripts/pass-q-shot.mjs <outDir> [--port 5185]
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const out = resolve(args.find((a) => !a.startsWith("--")) || "tmp/pass-q/shot");
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5185;
mkdirSync(out, { recursive: true });
const context = await chromium.launchPersistentContext(resolve("tmp/pass-q/chrome-profile-bisect"), {
  channel: "chrome",
  headless: false,
  args: [`--window-size=${W},${H + 87}`, "--window-position=0,0"],
  viewport: { width: W, height: H },
  deviceScaleFactor: 2
});
const page = context.pages()[0] ?? (await context.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
try {
  await page.waitForSelector("#bh-enter:not([hidden])", { timeout: 90_000 });
  await page.waitForTimeout(1500);
  await page.click("#bh-enter");
} catch {
  // older builds: no Enter button
}
await page.waitForTimeout(22_000);
await page.mouse.move(W * 0.06, H * 0.08);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/bust.png` });
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(7000);
await page.mouse.move(W * 0.06, H * 0.09);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/desktop.png` });
await context.close();
console.log(out, "errors", JSON.stringify(errors.slice(0, 3)));
