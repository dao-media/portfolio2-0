/**
 * Pass S S4 — Archaeology globe at Dane's window: rest + zoom shots, the
 * globe gap (debugGlobeGap), whether the globe is fully on screen, and every
 * stop-3 prop root's world position (to prove nothing else moved).
 * Usage: node scripts/pass-s-globe.mjs <label> [--port 5179]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "globe";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const OUT = resolve("tmp/pass-s", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, hopTo, waitSettled } = await bootStage({ port, profileDir: resolve("tmp/pass-q/chrome-profile-check") });
await hopTo(3);
await page.mouse.move(W * 0.06, H * 0.08);
await sleep(4000);
const gap = await dbg("debugGlobeGap");
const props = await dbg("debugPropRoots", 3);
const onScreen = { rest: await dbg("debugGlobeOnScreen") };
await page.screenshot({ path: `${OUT}/rest.png` });
await page.mouse.click(W * 0.5, H * 0.5);
await sleep(2500);
await waitSettled();
await page.mouse.move(W * 0.06, H * 0.08);
await sleep(2500);
onScreen.zoom = await dbg("debugGlobeOnScreen");
await page.screenshot({ path: `${OUT}/zoom.png` });
await browser.close();
writeFileSync(`${OUT}/globe.json`, JSON.stringify({ gap, onScreen, props }, null, 1));
console.log(JSON.stringify({ gap, onScreen, props: props?.length }, null, 1));
