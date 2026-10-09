/**
 * Pass M — M4 acceptance at Dane's window (1837×1222, DSF 2, real Chrome,
 * ?flight=1). Click Enter at once (or after --wait ms); score:
 *   land → +10 s, first hop to Desktop, first hop to Archaeology, Sidekick by
 *   two back-to-back hops; plus gap (start / end reason / extra ms) and each
 *   stop's integrated / ready time relative to land.
 * --rush: double-hop to Sidekick the moment it lands (worst case for
 * "ready before a two-hop arrival").
 * Usage: node scripts/pass-m.mjs <label> [--port 5179] [--cold] [--wait 8000] [--rush] [--warmup] [--forceface] [--query k=v]
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "m";
const num = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const port = num("--port", 5179);
const wait = num("--wait", 250);
const cold = args.includes("--cold");
const rush = args.includes("--rush");
// --forceface: every stop's static shadow uses the M3 face-by-face path.
const forceFace = args.includes("--forceface");
// --query k=v: extra page query (e.g. gaptiers=1)
const query = args.includes("--query") ? `flight=1&${args[args.indexOf("--query") + 1]}` : "flight=1";
const OUT = resolve("tmp/pass-m", label);
mkdirSync(OUT, { recursive: true });
const profileDir = resolve(cold ? "tmp/pass-k/chrome-profile-cold" : "tmp/pass-k/chrome-profile");
if (cold) rmSync(profileDir, { recursive: true, force: true });
if (args.includes("--warmup")) {
  const w = await bootStage({ port, holdMs: 0, profileDir: resolve("tmp/pass-k/chrome-profile") });
  await w.sleep(4000);
  await w.browser.close();
}
const { browser, page, dbg, sleep, waitSettled, enterMs } = await bootStage({
  port,
  query,
  holdMs: wait,
  profileDir,
  beforeClick: forceFace ? (d) => d("debugForceFaceBake", true) : null
});
const mark = (l) => dbg("flightMark", l);
const idx = async () => (await dbg("debugScrollCapture"))?.current;
async function hop(dir) {
  await dbg("advance", dir);
  await sleep(200);
  await waitSettled();
  await sleep(600);
}
async function doubleHopToSidekick() {
  await dbg("advance", 1);
  for (let i = 0; i < 100 && (await idx()) !== 1; i += 1) await sleep(50);
  // arrive at Desktop -> next hop as soon as the stage accepts it
  for (let i = 0; i < 100; i += 1) {
    const s = await dbg("debugScrollCapture");
    if (s?.cameraSettled) break;
    await sleep(40);
  }
  await dbg("advance", 1);
  await sleep(200);
  await waitSettled();
  await sleep(600);
}
await page.mouse.move(W * 0.12, H * 0.15);
if (rush) {
  await mark("sk-start");
  await doubleHopToSidekick();
  await mark("sk-end");
  await sleep(4000);
} else {
  await sleep(10_000);
  await mark("land-idle-end");
  await mark("hop1-start"); await hop(1); await mark("hop1-end");
  await hop(-1);
  await mark("hop3-start"); await hop(-1); await mark("hop3-end");
  await hop(1);
  await mark("sk-start"); await doubleHopToSidekick(); await mark("sk-end");
}
const flight = await dbg("flightDump");
const gaps = await dbg("debugGap");
await browser.close();
writeFileSync(`${OUT}/flight.json`, JSON.stringify(flight));
const ms = flight.milestones;
const fr = (pred) => ms.find(pred);
const markF = (l) => fr((m) => m.kind === "mark" && m.data.label === l)?.frame;
const land = fr((m) => m.kind === "land");
const log = flight.frameLog.map((r) => Object.fromEntries(flight.frameLogColumns.map((c, i) => [c, r[i]])));
function score(a, b) {
  if (a == null || b == null) return null;
  const rows = log.filter((r) => r.frame >= a && r.frame <= b && r.frameMs != null);
  const slow = rows.filter((r) => r.frameMs > 33).sort((x, y) => y.frameMs - x.frameMs);
  return { frames: rows.length, over50: rows.filter((r) => r.frameMs > 50).length, over33: slow.length, worst: slow.slice(0, 4).map((r) => [r.frame, Math.round(r.frameMs), r.cause, r.explained]), resizes: (flight.resizeLog || []).filter((z) => z.frame >= a && z.frame <= b).length };
}
const rel = (m) => (m && land ? m.t - land.t : null);
const result = {
  label, cold, wait, rush, enterMs,
  enterShown: fr((m) => m.kind === "enter-shown")?.t ?? null,
  gapStart: fr((m) => m.kind === "gap-start")?.data ?? null,
  gapSkip: fr((m) => m.kind === "gap-skip")?.data ?? null,
  gapEnd: fr((m) => m.kind === "gap-end")?.data ?? null,
  gaps,
  stopIntegratedRelLandMs: Object.fromEntries(ms.filter((m) => m.kind === "stop-integrated").map((m) => [m.data.stop, rel(m)])),
  stopReadyRelLandMs: Object.fromEntries(ms.filter((m) => m.kind === "stop-ready").map((m) => [m.data.stop, rel(m)])),
  integrateDone: fr((m) => m.kind === "mark" && String(m.data.label).startsWith("integrate-done"))?.data?.label ?? null,
  windows: rush
    ? { sidekickRush: score(markF("sk-start"), markF("sk-end")) }
    : {
        land10s: score(land?.frame, markF("land-idle-end")),
        hopDesktop: score(markF("hop1-start"), markF("hop1-end")),
        hopArchaeology: score(markF("hop3-start"), markF("hop3-end")),
        sidekickDouble: score(markF("sk-start"), markF("sk-end"))
      },
  postLandUnits: ms.filter((m) => m.kind === "bg-unit").reduce((a, m) => ((a[m.data.kind] = (a[m.data.kind] ?? 0) + 1), a), {})
};
writeFileSync(`${OUT}/score.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result));
