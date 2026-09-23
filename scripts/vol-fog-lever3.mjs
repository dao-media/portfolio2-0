/**
 * Lever 3 A/B — cheap Y-slice noise (isolated: dither+warp OFF).
 * Still + motion captures + mean-frame cost vs fog-off / lever3-off.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5202;
const OUT = "public/debug";
const BOOT_MS = 120_000;
const SAMPLE_MS = 3500;

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
await page.waitForFunction(
  () =>
    Boolean(
      window.__stage?.introComplete &&
        !window.__stage?.locked &&
        window.__stage?._shouldRunIntroHeavyEffects?.() &&
        (window.__stage?.debugVolumetricFog?.()?.densityScale ?? 0) >= 1
    ),
  { timeout: BOOT_MS }
);
await page.waitForTimeout(400);

async function setParams(partial) {
  return page.evaluate((p) => {
    window.__stage.setVolumetricEnabled(true);
    return window.__stage.setVolumetricParams({
      outputDither: 0,
      falloffNoiseWarp: 0,
      halfRes: true,
      baseRaymarchStepCount: 16,
      ...p
    });
  }, partial);
}

async function measureMean(label, ms = SAMPLE_MS) {
  await page.evaluate(() => {
    const stage = window.__stage;
    if (stage._costSample?.raf) cancelAnimationFrame(stage._costSample.raf);
    stage._costSample = { n: 0, sumMs: 0, maxMs: 0, lastT: performance.now() };
    const tick = (t) => {
      const s = stage._costSample;
      if (!s) return;
      const dt = t - s.lastT;
      s.lastT = t;
      if (dt > 0 && dt < 250) {
        s.n += 1;
        s.sumMs += dt;
        if (dt > s.maxMs) s.maxMs = dt;
      }
      s.raf = requestAnimationFrame(tick);
    };
    stage._costSample.raf = requestAnimationFrame(tick);
  });
  await page.waitForTimeout(ms);
  const snap = await page.evaluate(() => {
    const s = window.__stage._costSample;
    if (s?.raf) cancelAnimationFrame(s.raf);
    window.__stage._costSample = null;
    return {
      meanFrameMs: s && s.n ? s.sumMs / s.n : null,
      maxFrameMs: s?.maxMs ?? null,
      n: s?.n ?? 0,
      vol: window.__stage.debugVolumetricFog()
    };
  });
  console.log(
    `${label} mean=${snap.meanFrameMs?.toFixed?.(2)} max=${snap.maxFrameMs?.toFixed?.(1)} n=${snap.n}`
  );
  return snap;
}

async function snap(name) {
  await page.waitForTimeout(150);
  await page.locator("#scene-canvas").screenshot({ path: `${OUT}/${name}` });
}

// --- Cost: fog off baseline ---
await page.evaluate(() => window.__stage.setVolumetricEnabled(false));
const costA = await measureMean("A fog-off");

// --- Lever 3 OFF ---
await setParams({ noiseYSlice: 0, noiseYScroll: 0 });
const costOff = await measureMean("B lever3-off");
await page.evaluate(() => window.__stage.volumetricFog?.setNoiseFrozen?.(true));
await snap("vol-fog-lever3-off-still.png");
await page.evaluate(() => window.__stage.volumetricFog?.setNoiseFrozen?.(false));

const motionOff = [];
for (let i = 0; i < 6; i += 1) {
  await page.evaluate((i) => window.__stage.volumetricFog?.setTime?.((i + 1) * 0.4), i);
  await page.waitForTimeout(80);
  const name = `vol-fog-lever3-off-motion-${String(i).padStart(2, "0")}.png`;
  await page.locator("#scene-canvas").screenshot({ path: `${OUT}/${name}` });
  motionOff.push(name);
}

// --- Lever 3 ON (cheap Y slice + mild Y scroll) ---
await setParams({ noiseYSlice: 1.1, noiseYScroll: 0.025 });
const costOn = await measureMean("B lever3-on");
await page.evaluate(() => window.__stage.volumetricFog?.setNoiseFrozen?.(true));
await snap("vol-fog-lever3-on-still.png");
await page.evaluate(() => window.__stage.volumetricFog?.setNoiseFrozen?.(false));

const motionOn = [];
for (let i = 0; i < 6; i += 1) {
  await page.evaluate((i) => window.__stage.volumetricFog?.setTime?.((i + 1) * 0.4), i);
  await page.waitForTimeout(80);
  const name = `vol-fog-lever3-on-motion-${String(i).padStart(2, "0")}.png`;
  await page.locator("#scene-canvas").screenshot({ path: `${OUT}/${name}` });
  motionOn.push(name);
}

// --- Step C: small dither on top of lever 3 ---
await setParams({ noiseYSlice: 1.1, noiseYScroll: 0.025, outputDither: 0.003 });
await snap("vol-fog-lever3-plus-dither-still.png");
await setParams({ noiseYSlice: 1.1, noiseYScroll: 0.025, outputDither: 0 });
await snap("vol-fog-lever3-no-dither-still.png");

// Leave lever 3 ON as the candidate default (user will confirm); dither/warp stay 0.
await setParams({ noiseYSlice: 1.1, noiseYScroll: 0.025, outputDither: 0, falloffNoiseWarp: 0 });
const live = await page.evaluate(() => window.__stage.debugVolumetricFog());
const uniforms = await page.evaluate(() => {
  const u = window.__stage.volumetricFog?.marchMaterial?.uniforms;
  return {
    noiseYSlice: u?.uNoiseYSlice?.value ?? null,
    noiseYScroll: u?.uNoiseYScroll?.value ?? null,
    outputDither: window.__stage.volumetricFog?.compositeMaterial?.uniforms?.uOutputDither?.value ?? null,
    falloffNoiseWarp: u?.uFalloffNoiseWarp?.value ?? null
  };
});

const report = {
  gate: "GATE4-lever3-Y-slice",
  triggerFromA: {
    a1: "clean-at-load was densityScale=0 (fog off until heavy-effects fade). Band present at fade-start.",
    a2: "GLOBAL — slab at Desktop 90° as well as Sidekick/Archaeology/Bust; not deferred-GLB depth-triggered."
  },
  lever3: {
    method: "cheap domain offset: p.x/z += y*noiseYSlice; p.y += noiseYScroll*time — same FBM, no extra octave",
    offStill: "vol-fog-lever3-off-still.png",
    onStill: "vol-fog-lever3-on-still.png",
    offMotion: motionOff,
    onMotion: motionOn,
    onValues: { noiseYSlice: 1.1, noiseYScroll: 0.025 }
  },
  stepC: {
    withDither: "vol-fog-lever3-plus-dither-still.png",
    withoutDither: "vol-fog-lever3-no-dither-still.png",
    ditherValue: 0.003,
    note: "Judge whether dither still helps once Y-slice breaks the slab."
  },
  cost: {
    fogOff: costA,
    lever3Off: costOff,
    lever3On: costOn,
    deltaOnVsOffMs: (costOn.meanFrameMs ?? 0) - (costOff.meanFrameMs ?? 0),
    deltaOnVsFogOffMs: (costOn.meanFrameMs ?? 0) - (costA.meanFrameMs ?? 0),
    priorBBaselineMs: 1.3,
    note: "ANGLE relative only — compare deltaOnVsFogOff to prior B≈+1.3ms."
  },
  liveUniforms: uniforms,
  liveDebug: live
};

writeFileSync(`${OUT}/vol-fog-lever3.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
