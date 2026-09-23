/**
 * Bust lawn edge capture at rest — irregular noise coverage (no disc / no short fringe).
 * Run: node scripts/verify-lawn-edge.mjs
 * Writes public/debug/lawn-edge-rest.png + lawn-edge-verify.json (frame-ms).
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5287;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });

async function skipIntro(page) {
  for (let i = 0; i < 160; i++) {
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
  await page.waitForFunction(() => Boolean(window.__stage?.introComplete && !window.__stage?.locked), {
    timeout: 120000
  });
}

async function settleBust(page) {
  await page.evaluate(() => {
    const s = window.__stage;
    const rig = s.cameraRig;
    rig.goToIndex?.(0);
    for (let i = 0; i < 120; i++) rig.update?.(1 / 60);
  });
  await page.waitForFunction(
    () => {
      const s = window.__stage;
      return (
        (s?.cameraRig?.state?.index ?? -1) === 0 &&
        Boolean(s?.vignettes?.[0]?.instance?.grassRoot)
      );
    },
    { timeout: 60000 }
  );
  await page.waitForTimeout(800);
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false }
});
await server.listen();
const origin = `http://127.0.0.1:${PORT}`;

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60000 });
  await skipIntro(page);
  await settleBust(page);

  const frameMs = await page.evaluate(async () => {
    const samples = [];
    await new Promise((resolve) => {
      let n = 0;
      let last = performance.now();
      const tick = (t) => {
        samples.push(t - last);
        last = t;
        if (++n >= 45) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const slice = samples.slice(10);
    const avg = slice.reduce((a, b) => a + b, 0) / Math.max(slice.length, 1);
    const max = Math.max(...slice);
    return { avgMs: Number(avg.toFixed(2)), maxMs: Number(max.toFixed(2)), n: slice.length };
  });

  const lawn = await page.evaluate(() => {
    const s = window.__stage;
    const bust = s?.vignettes?.[0]?.instance;
    return {
      hasGrass: Boolean(bust?.grassRoot),
      lawnParams: bust?.getLawnEdgeParams?.() ?? null,
      index: s?.cameraRig?.state?.index ?? null
    };
  });

  const pngPath = `${OUT}/lawn-edge-rest.png`;
  await page.locator("#scene-canvas").screenshot({ path: pngPath, type: "png" });

  const report = {
    ok: Boolean(lawn.hasGrass && lawn.index === 0),
    ts: Date.now(),
    frameMs,
    lawn,
    png: pngPath,
    note: "Expect irregular islanded lawn edge — no circular disc, no short-grass fringe."
  };
  writeFileSync(`${OUT}/lawn-edge-verify.json`, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await server.close();
}
