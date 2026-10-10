/**
 * Pass R R2 — Desktop look at Dane's window (1837×1222, DSF 2, real Chrome):
 * settled rest + zoom shots, 100% crops (tower front, keyboard, monitor
 * bezel, speaker) and a per-mesh material + lighting dump of the Desktop
 * stop (src/scene/stage/materialDump.js).
 *   --old: a pre-worker checkout (e.g. 1fe1b71) served on --port; the stage
 *     is `window.__stage` on the page and the dump module is imported there
 *     (copy materialDump.js into that checkout first).
 *   default: this checkout (worker stage, ?flight=1, debug bridge).
 *   --look '<json>': HEAD only — debugApplyLook patch before the shots.
 *   --allstops: also dump stops 0, 2 and 3 (materials-stop<i>.json).
 * Usage: node scripts/pass-r-desktop.mjs <label> [--old] [--port 5179] [--look '{...}'] [--allstops]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { bootStage, W, H } from "./passj-lib.mjs";

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !a.startsWith("{")) || "desk";
const num = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const port = num("--port", 5179);
const old = args.includes("--old");
const look = args.includes("--look") ? JSON.parse(args[args.indexOf("--look") + 1]) : null;
const OUT = resolve("tmp/pass-r/desktop", label);
mkdirSync(OUT, { recursive: true });
const CROPS = {
  tower: { x: 1150, y: 430, width: 300, height: 400 },
  keyboard: { x: 450, y: 960, width: 500, height: 220 },
  bezel: { x: 380, y: 360, width: 420, height: 220 },
  speaker: { x: 190, y: 760, width: 200, height: 340 }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let page;
let close;
let dump;
let settle;
if (old) {
  const context = await chromium.launchPersistentContext(resolve("tmp/pass-q/chrome-profile-bisect"), {
    channel: "chrome",
    headless: false,
    args: [`--window-size=${W},${H + 87}`, "--window-position=0,0"],
    viewport: { width: W, height: H },
    deviceScaleFactor: 2
  });
  page = context.pages()[0] ?? (await context.newPage());
  close = () => context.close();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector("#bh-enter:not([hidden])", { timeout: 90_000 });
    await page.waitForTimeout(1500);
    await page.click("#bh-enter");
  } catch {
    // no Enter button on this build
  }
  settle = async () => {
    for (let k = 0; k < 200; k += 1) {
      if (await page.evaluate(() => Boolean(window.__stage?.introComplete && window.__stage?.cameraRig?.state?.isSettled))) return;
      await sleep(150);
    }
  };
  await settle();
  await sleep(4000);
  await page.evaluate(() => window.__stage.goTo(1));
  dump = (stop = 1) =>
    page.evaluate(async (i) => {
      const m = await import("/src/scene/stage/materialDump.js");
      return m.dumpStopMaterials(window.__stage, i);
    }, stop);
} else {
  const s = await bootStage({ port, profileDir: resolve("tmp/pass-q/chrome-profile-check") });
  page = s.page;
  close = () => s.browser.close();
  settle = s.waitSettled;
  await s.hopTo(1);
  if (look) await s.dbg("debugApplyLook", look);
  dump = (stop = 1) => s.dbg("debugMaterialDump", stop);
}
await sleep(2500);
await settle();
await page.mouse.move(W * 0.06, H * 0.08);
await sleep(3000);
await page.screenshot({ path: `${OUT}/rest.png` });
for (const [name, clip] of Object.entries(CROPS)) await page.screenshot({ path: `${OUT}/crop-${name}.png`, clip });
const data = await dump();
writeFileSync(`${OUT}/materials.json`, JSON.stringify(data, null, 1));
// --allstops: the other three stops' materials too (deferred GLBs have
// loaded by now — the Desktop hop comes ≥ 6 s after landing).
if (args.includes("--allstops")) for (const i of [0, 2, 3]) writeFileSync(`${OUT}/materials-stop${i}.json`, JSON.stringify(await dump(i), null, 1));
// Zoom: click the PC, park the cursor, settle.
await page.mouse.click(W * 0.5, H * 0.45);
await sleep(2500);
await settle();
await page.mouse.move(W * 0.06, H * 0.08);
await sleep(2500);
await page.screenshot({ path: `${OUT}/zoom.png` });
await close();
console.log(OUT, "meshes", data?.meshes?.length ?? data);
