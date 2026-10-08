/**
 * Pass K item 1 — Dane's post-land lag, reproduced: warm-cache profile (Enter
 * appears early), Enter clicked at once, cursor still, land -> +10 s idle, then
 * hop to Sidekick and 20 s idle. Scores both windows from the flight frame log:
 * frames > 50 ms, frames > 33 ms, governor resizes while idle.
 *
 * Usage: node scripts/pass-k-land.mjs <label> [--port 5192] [--warmup]
 *   --warmup  one throwaway boot first so the profile's HTTP cache is hot
 *   --cold    fresh, empty Chrome profile (cold HTTP cache)
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "land";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5192;
const OUT = resolve("tmp/pass-k", label);
const cold = args.includes("--cold");
const profileDir = resolve(cold ? "tmp/pass-k/chrome-profile-cold" : "tmp/pass-k/chrome-profile");
if (cold) rmSync(profileDir, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

if (args.includes("--warmup")) {
  // Always the warm profile: also warms Vite's own transform cache, so a
  // --cold run measures the browser's cold HTTP cache, not a cold dev server.
  const warm = await bootStage({ port, holdMs: 0, profileDir: resolve("tmp/pass-k/chrome-profile") });
  await warm.sleep(5000);
  await warm.browser.close();
}

const t0 = Date.now();
const { browser, page, dbg, sleep, hopTo, shot, enterMs } = await bootStage({ port, holdMs: 250, profileDir });
console.log(`landed after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.mouse.move(W * 0.12, H * 0.15);
await sleep(10_000);
await dbg("flightMark", "land-idle-end");
await shot(`${OUT}/bust-settled.png`);
await hopTo(2);
await page.mouse.move(W * 0.12, H * 0.15);
await sleep(1500);
await dbg("flightMark", "sidekick-idle-start");
await sleep(20_000);
await dbg("flightMark", "sidekick-idle-end");
await shot(`${OUT}/sidekick-settled.png`);
const pacing = await dbg("debugPacingStats");
const chunkCost = await dbg("debugChunkStepCost");
const flight = await dbg("flightDump");
writeFileSync(`${OUT}/flight.json`, JSON.stringify(flight));
await browser.close();

const log = flight.frameLog.map((r) => Object.fromEntries(flight.frameLogColumns.map((c, i) => [c, r[i]])));
const ms = (name) => flight.milestones.find((m) => (m.kind === "mark" ? m.data.label === name : m.kind === name));
function score(name, fromFrame, toFrame) {
  const rows = log.filter((r) => r.frame >= fromFrame && r.frame <= toFrame && r.frameMs != null);
  const over50 = rows.filter((r) => r.frameMs > 50);
  const over33 = rows.filter((r) => r.frameMs > 33);
  const resizes = (flight.resizeLog || []).filter((z) => z.frame >= fromFrame && z.frame <= toFrame);
  const causes = {};
  for (const r of over33) causes[r.cause] = (causes[r.cause] ?? 0) + 1;
  return {
    window: name,
    frames: rows.length,
    over50: over50.length,
    over33: over33.length,
    worst: over33.sort((a, b) => b.frameMs - a.frameMs).slice(0, 8).map((r) => [r.frame, r.frameMs, r.cpuWorkMs, r.cause, r.explained]),
    causes,
    resizes: resizes.map((z) => [z.frame, z.dw, z.phase])
  };
}
const land = ms("land")?.frame ?? 0;
const landEnd = ms("land-idle-end")?.frame ?? land;
const skA = ms("sidekick-idle-start")?.frame ?? 0;
const skB = ms("sidekick-idle-end")?.frame ?? 0;
const result = {
  enterMs,
  pacing,
  chunkCost,
  paceSwitches: flight.milestones.filter((m) => m.kind === "pace").map((m) => [m.frame, m.data.ms, m.data.reason, m.data.stop]),
  landWindow: score("land -> +10 s", land, landEnd),
  sidekickWindow: score("Sidekick 20 s idle", skA, skB)
};
writeFileSync(`${OUT}/score.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
