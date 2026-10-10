/**
 * Pass R — what lights up in the sky band at Desktop rest? Same setup as
 * pass-j-stars (hop to Desktop, cursor centred, 3 s settle), then 10 s of
 * PNG shots of the top 45% of the window (still camera), optionally with
 * the pass-j-stars cursor ellipse. Analysis: scripts/pass-r-flicker.py.
 * Usage: node scripts/pass-r-flicker.mjs <label> [--sky R] [--parallax] [--port 5179]
 */
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "flicker";
const opt = (n, d) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
const OUT = resolve("tmp/pass-r/flicker", label);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, hopTo } = await bootStage({ port: opt("port", 5179) });
if (args.includes("--sky")) await dbg("setSkyParallaxRadius", opt("sky", 0));
await hopTo(1);
await page.mouse.move(W / 2, H / 2);
await sleep(3000);
const parallax = args.includes("--parallax");
const t0 = Date.now();
let n = 0;
while (Date.now() - t0 < 10_000) {
  if (parallax) {
    const a = ((Date.now() - t0) / 10_000) * Math.PI * 2;
    await page.mouse.move(W / 2 + Math.cos(a) * W * 0.18, H / 2 + Math.sin(a) * H * 0.12);
  }
  await page.screenshot({ path: `${OUT}/f${String(n).padStart(3, "0")}.png`, clip: { x: 0, y: 0, width: W, height: Math.round(H * 0.45) } });
  n += 1;
}
await browser.close();
console.log(OUT, n, "frames");
