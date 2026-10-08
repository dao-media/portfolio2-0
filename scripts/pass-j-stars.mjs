/**
 * Pass J item 5 — track 20 ring stars for 10 s still, then 10 s during slow
 * cursor parallax, at the user's window size. Writes tmp/pass-j/<label>/stars.json.
 * Usage: node scripts/pass-j-stars.mjs <label> [--port 5190] [--stop 1]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { bootStage, W, H } from "./passj-lib.mjs";

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "stars";
const opt = (n, d) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
const OUT = `tmp/pass-j/${label}`;
mkdirSync(OUT, { recursive: true });

const { browser, page, dbg, sleep, hopTo } = await bootStage({ port: opt("port", 5190) });
await hopTo(opt("stop", 1));
await page.mouse.move(W / 2, H / 2);
await sleep(3000);

const still = await dbg("debugStarTrack", 10, 20);
// Slow parallax: a 10 s ellipse around center, ~0.1 Hz.
const moving = dbg("debugStarTrack", 10, 20);
const t0 = Date.now();
while (Date.now() - t0 < 10_500) {
  const a = ((Date.now() - t0) / 10_000) * Math.PI * 2;
  await page.mouse.move(W / 2 + Math.cos(a) * W * 0.18, H / 2 + Math.sin(a) * H * 0.12);
  await sleep(16);
}
const parallax = await moving;
// Supplementary: stars only move under camera *rotation* (they are at
// infinity, rotation-only projection), and cursor parallax only translates
// the camera — so a hop is the one real sky-motion case. Track across one.
const hopping = dbg("debugStarTrack", 5, 20);
await sleep(400);
await dbg("advance", 1);
const hop = await hopping;
writeFileSync(`${OUT}/stars.json`, JSON.stringify({ still, parallax, hop }, null, 1));
for (const [name, r] of [["still", still], ["parallax", parallax], ["hop", hop]]) {
  const rows = r?.stars || [];
  const worst = Math.max(...rows.map((s) => s.maxFrameJumpPct ?? 0));
  console.log(`${name}: ${rows.length} stars, worst frame jump ${worst}% buffers ${JSON.stringify(r?.bufferSizes)}`);
  for (const s of rows) console.log(`  #${s.star} mag ${s.mag} frames ${s.frames} min ${s.minPctOfMean}% max ${s.maxPctOfMean}% jump ${s.maxFrameJumpPct}% drift ${s.driftPx}px`);
}
await browser.close();
