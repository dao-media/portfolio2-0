/**
 * GATE 4 banding diagnose (after clean GL console).
 * Order: (a) HalfFloat RT → (b) Bayer ray-start dither → (c) height falloff look.
 * Does not change density. Captures grazing screenshots.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5196;
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
const glHits = [];
page.on("console", (msg) => {
  const t = msg.text();
  if (/GL_INVALID|incomplete|Framebuffer/i.test(t)) glHits.push(t);
});

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () =>
    Boolean(
      window.__stage?.introComplete &&
        !window.__stage?.locked &&
        window.__stage?._shouldRunIntroHeavyEffects?.()
    ),
  { timeout: BOOT_MS }
);
await page.waitForTimeout(600);
mkdirSync(OUT, { recursive: true });

const audit = await page.evaluate(() => {
  const stage = window.__stage;
  const pass = stage.volumetricFog;
  const THREE = stage.renderer?.constructor?.name; // not useful for enums
  // HalfFloatType in three is 1016 (Three r152+); read from fogTarget.
  const fogType = pass?.fogTarget?.texture?.type;
  const frag = pass?.marchMaterial?.fragmentShader ?? "";
  const hasBayerFn = /float bayer4\s*\(/.test(frag);
  const usesJitter = /bayer4\s*\(\s*gl_FragCoord\.xy\s*\)/.test(frag);
  const jitterWired = /float jitter\s*=\s*bayer4/.test(frag);
  const tStart = /t\s*=\s*jitter\s*\*\s*stepSize/.test(frag);
  return {
    fogMode: stage._fogMode,
    vol: stage.debugVolumetricFog(),
    fogTargetType: fogType,
    // three HalfFloatType === 1016
    isHalfFloat: fogType === 1016,
    composerType: stage.post?.composer?.inputBuffer?.texture?.type ?? null,
    composerIsHalfFloat: (stage.post?.composer?.inputBuffer?.texture?.type ?? null) === 1016,
    hasBayerFn,
    usesJitter,
    jitterWired,
    tStart,
    fogTarget: {
      w: pass?.fogTarget?.width,
      h: pass?.fogTarget?.height
    }
  };
});

await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/vol-fog-band-a-halffloat-grazing.png`
});

// (b) Prove Bayer is live: temporarily zero jitter by patching uniform path is hard;
// instead capture with steps=16 (baseline) then steps=64 (should reduce slice bands if dither weak).
await page.evaluate(() => {
  window.__stage.setVolumetricParams({ baseRaymarchStepCount: 16, halfRes: true });
});
await page.waitForTimeout(200);
await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/vol-fog-band-b-bayer-steps16.png`
});

await page.evaluate(() => {
  window.__stage.setVolumetricParams({ baseRaymarchStepCount: 64, halfRes: true });
});
await page.waitForTimeout(200);
await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/vol-fog-band-b-bayer-steps64.png`
});

// Restore defaults
await page.evaluate(() => {
  window.__stage.setVolumetricParams({ baseRaymarchStepCount: 16, halfRes: true });
});
await page.waitForTimeout(200);
await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/vol-fog-band-c-height-falloff-grazing.png`
});

const verdict = {
  gate: "GATE4-banding-abc",
  glHits: glHits.length,
  audit,
  conclusion: null
};

if (!audit.isHalfFloat || !audit.composerIsHalfFloat) {
  verdict.conclusion = "a-RT-FORMAT: not HalfFloat — likely 8-bit quantization bands over #070709";
} else if (!audit.hasBayerFn || !audit.usesJitter || !audit.jitterWired || !audit.tStart) {
  verdict.conclusion = "b-DITHER: Bayer ray-start missing or not wired — slice/quant bands expected";
} else {
  verdict.conclusion =
    "c-HEIGHT-FALLOFF: HalfFloat + Bayer present; remaining grazing band is density/height profile look (shape falloff/in-scatter — do not reopen depth)";
}

writeFileSync(`${OUT}/vol-fog-band-diagnose.json`, JSON.stringify(verdict, null, 2));
console.log(JSON.stringify(verdict, null, 2));

await browser.close();
await server.close();
if (glHits.length) process.exitCode = 1;
