/**
 * Pass L L1 — time-to-Enter, warm cache. One warm-up boot, then N measured
 * boots on the same persistent profile. Reports Enter time plus the slowest
 * resource fetches (so a stalled fetch is visible, not folded into the number).
 * Usage: node scripts/pass-l-enter.mjs <label> --port 5179 [--runs 3] [--profile dir]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "enter";
const port = Number(args[args.indexOf("--port") + 1] || 5179);
const runs = args.includes("--runs") ? Number(args[args.indexOf("--runs") + 1]) : 3;
const profile = resolve(args.includes("--profile") ? args[args.indexOf("--profile") + 1] : `tmp/pass-l/profile-${port}`);
const OUT = resolve("tmp/pass-l", label);
mkdirSync(OUT, { recursive: true });
const W = 1837, H = 1222;
async function boot(i) {
  const ctx = await chromium.launchPersistentContext(profile, { channel: "chrome", headless: false, args: [`--window-size=${W},${H + 87}`, "--window-position=0,0"], viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/?flight=1`, { waitUntil: "domcontentloaded" });
  let enterMs = null;
  try {
    await page.waitForSelector("#bh-enter:not([hidden])", { timeout: 120_000 });
    enterMs = Date.now() - t0;
  } catch {}
  const res = await page.evaluate(() => performance.getEntriesByType("resource").map((r) => [Math.round(r.startTime), Math.round(r.duration), r.name.replace(location.origin, "")]));
  const slow = res.sort((a, b) => b[1] - a[1]).slice(0, 6);
  let dump = null;
  try { dump = await page.evaluate(() => window.__stageDebug?.("flightDump")); } catch {}
  const ms = (dump?.milestones || []).filter((m) => ["fader-dismiss", "enter-shown", "bust-ready", "bust-load", "warm-phase"].includes(m.kind)).map((m) => [m.kind, m.t, m.data?.label ?? m.data?.phase ?? ""]).slice(0, 12);
  await ctx.close();
  return { run: i, enterMs, slowest: slow, milestones: ms };
}
const out = [];
for (let i = 0; i <= runs; i += 1) {
  const r = await boot(i);
  if (i > 0) out.push(r);
  console.log(i === 0 ? "warmup" : "run", JSON.stringify({ enterMs: r.enterMs, slowest: r.slowest.slice(0, 3), milestones: r.milestones }));
}
writeFileSync(`${OUT}/enter.json`, JSON.stringify(out, null, 1));
