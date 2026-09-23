/**
 * Step A — isolate when Mach slab appears: fade-in vs deferred GLB; Desktop vs Sidekick.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5201;
const OUT = "public/debug";
const BOOT_MS = 120_000;
const HOP_MS = 25_000;

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false }
});
await server.listen();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
mkdirSync(OUT, { recursive: true });

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });

// Wait until intro done + unlocked, but BEFORE heavy effects if possible.
await page.waitForFunction(
  () => Boolean(window.__stage?.introComplete && !window.__stage?.locked),
  { timeout: BOOT_MS }
);

const preHeavy = await page.evaluate(() => {
  const s = window.__stage;
  return {
    heavy: s._shouldRunIntroHeavyEffects?.() ?? null,
    heavyAfter: s._introHeavyEffectsAfter ?? 0,
    now: performance.now(),
    vol: s.debugVolumetricFog?.(),
    sidekickReady: Boolean(s.vignettes?.[2]?.instance?.sidekickRoot),
    archaeologyShelf: Boolean(s.vignettes?.[3]?.instance?.packRoot),
    archaeologyStele: Boolean(s.vignettes?.[3]?.instance?.steleRoot),
    desktopPc: Boolean(s.vignettes?.[1]?.instance?.pcRoot)
  };
});

// Capture just as fog starts fading (densityScale leaving 0).
await page.waitForFunction(
  () => {
    const v = window.__stage?.debugVolumetricFog?.();
    return Boolean(window.__stage?._shouldRunIntroHeavyEffects?.() && v && v.densityScale > 0.05);
  },
  { timeout: 30_000 }
);
await page.waitForTimeout(50);
const atFadeStart = await page.evaluate(() => ({
  vol: window.__stage.debugVolumetricFog(),
  sidekickReady: Boolean(window.__stage.vignettes?.[2]?.instance?.sidekickRoot),
  archaeologyShelf: Boolean(window.__stage.vignettes?.[3]?.instance?.packRoot),
  archaeologyStele: Boolean(window.__stage.vignettes?.[3]?.instance?.steleRoot)
}));
await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/vol-fog-trigger-a1-fade-start.png`
});

// Capture when fade completes (densityScale ~1), still at Bust.
await page.waitForFunction(
  () => (window.__stage?.debugVolumetricFog?.()?.densityScale ?? 0) >= 0.98,
  { timeout: 10_000 }
);
await page.waitForTimeout(100);
const atFadeDone = await page.evaluate(() => ({
  vol: window.__stage.debugVolumetricFog(),
  sidekickReady: Boolean(window.__stage.vignettes?.[2]?.instance?.sidekickRoot),
  archaeologyShelf: Boolean(window.__stage.vignettes?.[3]?.instance?.packRoot),
  archaeologyStele: Boolean(window.__stage.vignettes?.[3]?.instance?.steleRoot)
}));
await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/vol-fog-trigger-a1-fade-done.png`
});

// Wait for deferred Sidekick if not yet present, then capture Bust again.
await page.waitForFunction(
  () => Boolean(window.__stage?.vignettes?.[2]?.instance?.sidekickRoot),
  { timeout: BOOT_MS }
).catch(() => {});
await page.waitForTimeout(400);
const afterSidekick = await page.evaluate(() => ({
  vol: window.__stage.debugVolumetricFog(),
  sidekickReady: Boolean(window.__stage.vignettes?.[2]?.instance?.sidekickRoot),
  archaeologyShelf: Boolean(window.__stage.vignettes?.[3]?.instance?.packRoot),
  archaeologyStele: Boolean(window.__stage.vignettes?.[3]?.instance?.steleRoot)
}));
await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/vol-fog-trigger-a2-after-sidekick-monolith.png`
});

async function hopTo(index) {
  const current = await page.evaluate(() => window.__stage.current);
  const steps = ((index - current) % 4 + 4) % 4;
  for (let i = 0; i < steps; i += 1) {
    await page.evaluate(() => window.__stage.advance(1));
    await page.waitForFunction(() => Boolean(window.__stage?.cameraRig?.state?.isSettled), {
      timeout: HOP_MS
    });
    await page.waitForTimeout(300);
  }
}

// Desktop ~90°
await hopTo(1);
await page.waitForTimeout(400);
const atDesktop = await page.evaluate(() => ({
  current: window.__stage.current,
  deg: window.__stage._getDisplayStageDegrees?.() ?? null,
  vol: window.__stage.debugVolumetricFog()
}));
await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/vol-fog-trigger-a2-desktop.png`
});

// Sidekick
await hopTo(2);
await page.waitForTimeout(400);
const atSidekick = await page.evaluate(() => ({
  current: window.__stage.current,
  deg: window.__stage._getDisplayStageDegrees?.() ?? null,
  vol: window.__stage.debugVolumetricFog(),
  sidekickReady: Boolean(window.__stage.vignettes?.[2]?.instance?.sidekickRoot)
}));
await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/vol-fog-trigger-a2-sidekick.png`
});

// Archaeology (after shelf/rex if available)
await hopTo(3);
await page.waitForTimeout(600);
const atArchaeology = await page.evaluate(() => ({
  current: window.__stage.current,
  deg: window.__stage._getDisplayStageDegrees?.() ?? null,
  vol: window.__stage.debugVolumetricFog(),
  archaeologyShelf: Boolean(window.__stage.vignettes?.[3]?.instance?.packRoot),
  archaeologyStele: Boolean(window.__stage.vignettes?.[3]?.instance?.steleRoot)
}));
await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/vol-fog-trigger-a2-travel.png`
});

const report = {
  gate: "GATE4-mach-trigger-A",
  preHeavy,
  atFadeStart,
  atFadeDone,
  afterSidekick,
  atDesktop,
  atSidekick,
  atArchaeology,
  judge: {
    a1:
      "Compare vol-fog-trigger-a1-fade-start.png vs fade-done.png. If slab is already at fade-start/done before Sidekick/Archaeology commit, 'clean at load' was density≈0 (fog not drawing yet).",
    a2:
      "Compare a2-desktop vs a2-sidekick vs a2-travel vs monolith after-sidekick. Uniform slab at Desktop → global; only near deferred props → depth-triggered."
  }
};

writeFileSync(`${OUT}/vol-fog-trigger-a.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
