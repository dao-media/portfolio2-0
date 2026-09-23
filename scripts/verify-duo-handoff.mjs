/**
 * Capture Duo hold→live handoffLog and flag stepping layers.
 *
 * Run: node scripts/verify-duo-handoff.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5297;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });

async function skipIntro(page) {
  for (let i = 0; i < 200; i++) {
    await page.evaluate(() => {
      document.querySelectorAll("button").forEach((b) => {
        const t = (b.textContent || "").toLowerCase();
        if (t.includes("skip") || t.includes("power") || t.includes("dane")) {
          try {
            b.click();
          } catch {
            /* ignore */
          }
        }
      });
    });
    if (await page.evaluate(() => Boolean(window.__stage?.introComplete))) break;
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => Boolean(window.__stage?.introComplete), {
    timeout: 180000
  });
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-duo-handoff",
  logLevel: "error",
  clearScreen: false
});
await server.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (err) => console.error("[pageerror]", err.message));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await skipIntro(page);

// Wait until Duo has finished sampling first live frames.
const result = await page.evaluate(async () => {
  const deadline = performance.now() + 30000;
  while (performance.now() < deadline) {
    const duo = window.__stage?.duoFab;
    const log = duo?.debugState?.()?.handoffLog ?? duo?._handoffLog;
    if (Array.isArray(log) && log.some((r) => r.tag === "live")) {
      // Ensure live sample budget is spent.
      const liveCount = log.filter((r) => r.tag === "live").length;
      if (liveCount >= 8 || duo?._handoffLiveLeft === 0) {
        return {
          entrance: duo._entrance,
          handoffLog: log,
          closedCenter: duo._closedCenterPivot?.toArray?.() ?? null,
          openCenter: duo._openCenterPivot?.toArray?.() ?? null,
          pop: duo.pop?.position?.toArray?.() ?? null
        };
      }
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  const duo = window.__stage?.duoFab;
  return {
    timedOut: true,
    entrance: duo?._entrance ?? null,
    handoffLog: duo?._handoffLog ?? [],
    ready: duo?.ready ?? false
  };
});

const log = result.handoffLog || [];
const stepped = log.filter((r) => Array.isArray(r.steps) && r.steps.length);
const boundary = [];
for (let i = 1; i < log.length; i++) {
  const a = log[i - 1];
  const b = log[i];
  if (
    (a.tag === "holding" || a.tag === "complete" || a.tag === "live-start") &&
    (b.tag === "live-start" || b.tag === "live")
  ) {
    boundary.push({ from: a, to: b, steps: b.steps || [] });
  }
}

const summary = {
  timedOut: Boolean(result.timedOut),
  entrance: result.entrance,
  sampleCount: log.length,
  tags: log.map((r) => r.tag),
  steppedFrames: stepped.map((r) => ({
    n: r.n,
    tag: r.tag,
    steps: r.steps,
    dRoot: r.dRoot,
    dPop: r.dPop,
    dIso: r.dIso,
    dModelScale: r.dModelScale,
    dCenterT: r.dCenterT,
    pop: r.pop,
    root: r.root,
    centerT: r.centerT
  })),
  boundary,
  closedCenter: result.closedCenter,
  openCenter: result.openCenter,
  finalPop: result.pop,
  holdTail: log.filter((r) => r.tag === "holding" || r.tag === "complete").slice(-3),
  liveHead: log.filter((r) => r.tag === "live-start" || r.tag === "live").slice(0, 6)
};

const outPath = `${OUT}/duo-handoff.json`;
writeFileSync(outPath, JSON.stringify({ summary, handoffLog: log }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`\nWrote ${outPath}`);

await browser.close();
await server.close();

if (summary.timedOut) process.exitCode = 2;
else if (stepped.length) process.exitCode = 1;
else process.exitCode = 0;
