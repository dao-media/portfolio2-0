/**
 * Mach-band look pass: step 0 (still vs motion) + lever 1 / lever 2 A/B.
 * Stops after levers 1+2 — does not enable 3/4.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5198;
const OUT = "public/debug";
const BOOT_MS = 120_000;

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false }
});
await server.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () =>
    Boolean(
      window.__stage?.introComplete &&
        !window.__stage?.locked &&
        window.__stage?._shouldRunIntroHeavyEffects?.() &&
        window.__stage?.debugVolumetricFog?.()?.densityScale >= 1
    ),
  { timeout: BOOT_MS }
);
await page.waitForTimeout(400);
mkdirSync(OUT, { recursive: true });

async function setLevers(outputDither, falloffNoiseWarp) {
  return page.evaluate(
    ({ d, w }) =>
      window.__stage.setVolumetricParams({
        outputDither: d,
        falloffNoiseWarp: w,
        baseRaymarchStepCount: 16,
        halfRes: true
      }),
    { d: outputDither, w: falloffNoiseWarp }
  );
}

async function snap(name) {
  await page.waitForTimeout(180);
  await page.locator("#scene-canvas").screenshot({ path: `${OUT}/${name}` });
}

// --- STEP 0: still vs motion ---
await setLevers(0, 0);
// Freeze noise for a true still (band at rest framing).
await page.evaluate(() => {
  window.__stage.volumetricFog?.setNoiseFrozen?.(true);
});
await snap("vol-fog-mach-step0-still.png");

// Motion: unfreeze noise + slow orbit drift; capture frame sequence.
await page.evaluate(() => {
  window.__stage.volumetricFog?.setNoiseFrozen?.(false);
});
const motionFrames = [];
const baseTheta = await page.evaluate(() => window.__stage.cameraRig?.state?.theta ?? 0);
for (let i = 0; i < 8; i += 1) {
  await page.evaluate(
    ({ t0, i }) => {
      const stage = window.__stage;
      const rig = stage.cameraRig;
      if (rig) {
        const t = t0 + (i / 7) * (Math.PI / 90);
        rig.state.theta = t;
        rig.state.thetaTarget = t;
        rig.update?.(1 / 60);
      }
      // Advance fog clock so FBM scrolls between frames.
      stage.volumetricFog?.setTime?.((i + 1) * 0.35);
    },
    { t0: baseTheta, i }
  );
  await page.waitForTimeout(100);
  const name = `vol-fog-mach-step0-motion-${String(i).padStart(2, "0")}.png`;
  await page.locator("#scene-canvas").screenshot({ path: `${OUT}/${name}` });
  motionFrames.push(name);
}
await page.evaluate((t0) => {
  const rig = window.__stage.cameraRig;
  if (!rig) return;
  rig.state.theta = t0;
  rig.state.thetaTarget = t0;
  window.__stage.volumetricFog?.setNoiseFrozen?.(false);
}, baseTheta);
await page.waitForTimeout(300);

// --- LEVER 1 A/B: output dither only ---
await setLevers(0, 0);
await snap("vol-fog-mach-lever1-off.png");
await setLevers(0.004, 0);
await snap("vol-fog-mach-lever1-on.png");

// --- LEVER 2 A/B: falloff Y-warp only (dither off) ---
await setLevers(0, 0);
await snap("vol-fog-mach-lever2-off.png");
await setLevers(0, 0.45);
await snap("vol-fog-mach-lever2-on.png");

// Leave both off for human judge defaults; report candidates.
await setLevers(0, 0);

const densityNote = await page.evaluate(() => {
  const frag = window.__stage.volumetricFog?.marchMaterial?.fragmentShader ?? "";
  return {
    alreadyNoiseTimesFalloff: /return n \* heightFalloff/.test(frag),
    hasYWarp: /uFalloffNoiseWarp/.test(frag),
    hasOutputDither: /uOutputDither/.test(
      window.__stage.volumetricFog?.compositeMaterial?.fragmentShader ?? ""
    ),
    noiseScrollsXZOnly: /p\.xz \+= uNoiseMovement/.test(frag)
  };
});

const report = {
  gate: "GATE4-mach-band-step0-lever1-2",
  step0: {
    still: "vol-fog-mach-step0-still.png",
    motionFrames,
    note: "Compare still vs motion sequence: if the horizontal slab vanishes or softens in motion, it may be still-only Mach banding."
  },
  densityBaseline: densityNote,
  lever1: {
    knob: "outputDither",
    off: "vol-fog-mach-lever1-off.png",
    on: "vol-fog-mach-lever1-on.png",
    onValue: 0.004,
    what: "Screen-space Bayer dither on fog alpha + final RGB (pixel+time). Not ray-start jitter."
  },
  lever2: {
    knob: "falloffNoiseWarp",
    off: "vol-fog-mach-lever2-off.png",
    on: "vol-fog-mach-lever2-on.png",
    onValue: 0.45,
    what: "Baseline already density=noise*heightFalloff(y). Lever 2 warps y by (n-0.5)*warp so iso-surfaces aren't flat horizontals.",
    note: "A/B with dither OFF so lever is isolated."
  },
  notDone: ["lever3-3d-y-noise-scroll", "lever4-more-steps"],
  fogConfigAfterScript: {
    outputDither: 0,
    falloffNoiseWarp: 0
  }
};

writeFileSync(`${OUT}/vol-fog-mach-band.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
