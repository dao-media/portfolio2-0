/**
 * Pass Q Q3 — arena-anchored sky. Dane's window, real Chrome, ?flight=1.
 *   --drift: at Bust rest, the finite-R vs infinity offset (= drift over
 *     the drop: the camera does not rotate on the way down) for a sweep of
 *     radii, and at Desktop rest after one hop.
 *   --clip <subtle|medium|strong|R>: 14 s clip from the Enter click (drop)
 *     through one hop to Desktop, with the radius set before the click.
 *   --trace <preset>: per-frame extra-parallax offset across the handoff.
 * Usage: node scripts/pass-q-sky.mjs --drift | --clip subtle | --trace strong [--port 5179]
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
import { SKY_PARALLAX_PRESETS } from "../src/scene/blackhole/StarField.js";

const args = process.argv.slice(2);
const num = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const port = num("--port", 5179);
const clipName = args.includes("--clip") ? args[args.indexOf("--clip") + 1] : null;
const OUT = resolve("tmp/pass-q/sky");
mkdirSync(OUT, { recursive: true });

if (args.includes("--drift")) {
  const { browser, dbg, sleep, hopTo, waitSettled } = await bootStage({ port, profileDir: resolve("tmp/pass-q/chrome-profile-check") });
  await waitSettled();
  await sleep(1500);
  const radii = [100, 160, 250, 400, 600, 1000, 1600, 2500];
  const res = { bust: [], desktop: [] };
  for (const r of radii) res.bust.push(await dbg("debugSkyDrift", r));
  await hopTo(1);
  await sleep(1500);
  for (const r of radii) res.desktop.push(await dbg("debugSkyDrift", r));
  res.travel = await dbg("setSkyParallaxRadius", SKY_PARALLAX_PRESETS.subtle);
  await browser.close();
  writeFileSync(`${OUT}/drift.json`, JSON.stringify(res, null, 1));
  for (const k of ["bust", "desktop"]) for (const r of res[k]) console.log(k, r.radius, "median", r.medianPx, "p95", r.p95Px, "mean dx,dy", r.meanDx, r.meanDy, `(${r.stars} stars)`);
  process.exit(0);
}

if (args.includes("--trace")) {
  // Handoff continuity: per-frame extra-parallax offset from the click to 6 s after landing.
  const name = args[args.indexOf("--trace") + 1] ?? "strong";
  const radius = SKY_PARALLAX_PRESETS[name] ?? Number(name);
  const { browser, dbg, sleep } = await bootStage({
    port,
    holdMs: 250,
    profileDir: resolve("tmp/pass-q/chrome-profile-check"),
    beforeClick: async (d) => {
      await d("setSkyParallaxRadius", radius);
      await d("debugSkyTrace", true);
    }
  });
  await sleep(6000);
  const tr = await dbg("debugSkyTrace", false);
  await browser.close();
  writeFileSync(`${OUT}/trace-${name}.json`, JSON.stringify(tr));
  const ring = tr.rows.filter((r) => !r.flight);
  console.log(name, "frames", tr.frames, "first ring frame", JSON.stringify(tr.firstRing), "max step px", tr.maxStepPx, "final", JSON.stringify(tr.last));
  for (const k of [0, 0.25, 0.5, 0.75, 1]) { const r = ring.find((x) => x.travel >= k); if (r) console.log(" travel>=", k, "off px", r.off, "y", r.y); }
  process.exit(0);
}

if (clipName) {
  const radius = SKY_PARALLAX_PRESETS[clipName] ?? Number(clipName);
  const dir = `${OUT}/clip-${clipName}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(`${dir}/frames`, { recursive: true });
  let cdp = null;
  let n = 0;
  const stamps = [];
  let clickAt = 0;
  const { browser, dbg, sleep, page } = await bootStage({
    port,
    holdMs: 250,
    profileDir: resolve("tmp/pass-q/chrome-profile-check"),
    beforeClick: async (d, pg) => {
      await d("setSkyParallaxRadius", radius);
      cdp = await pg.context().newCDPSession(pg);
      cdp.on("Page.screencastFrame", async (f) => {
        writeFileSync(`${dir}/frames/f${String(n).padStart(4, "0")}.jpg`, Buffer.from(f.data, "base64"));
        stamps.push(f.metadata?.timestamp ?? Date.now() / 1000);
        n += 1;
        await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
      });
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
      clickAt = Date.now() / 1000;
    }
  });
  await page.mouse.move(W * 0.5, H * 0.3);
  const left = 9 - (Date.now() / 1000 - clickAt);
  if (left > 0) await sleep(left * 1000);
  await dbg("advance", 1);
  await sleep(5000);
  await cdp.send("Page.stopScreencast");
  await sleep(300);
  const state = await dbg("setSkyParallaxRadius", radius);
  await browser.close();
  let list = "";
  for (let i = 0; i < n; i += 1) list += `file 'frames/f${String(i).padStart(4, "0")}.jpg'\nduration ${Math.max(0.001, (i + 1 < n ? stamps[i + 1] : stamps[i] + 1 / 30) - stamps[i]).toFixed(4)}\n`;
  writeFileSync(`${dir}/frames.txt`, list);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "frames.txt", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=60", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "18", `${OUT}/sky-${clipName}.mp4`], { cwd: dir });
  console.log(`${OUT}/sky-${clipName}.mp4`, n, "frames", JSON.stringify(state));
}
