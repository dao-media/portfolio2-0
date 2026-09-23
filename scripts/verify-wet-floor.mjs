/**
 * Bust capture: wet-concrete floor with neon puddle reflections (CubeCamera probe).
 * Measures frame-ms: matte (no probe) vs probe on. Confirms no POV-spot disc.
 *
 * Run: node scripts/verify-wet-floor.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5293;
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
  await page.waitForFunction(() => Boolean(window.__stage?.introComplete), {
    timeout: 120000
  });
}

/** @param {import('playwright').Page} page @param {number} frames */
async function measureMs(page, frames = 45) {
  return page.evaluate(async (n) => {
    const t0 = performance.now();
    let frames = 0;
    await new Promise((resolve) => {
      const tick = () => {
        frames += 1;
        if (frames >= n) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - t0;
    return { msPerFrame: elapsed / frames, fpsEst: (1000 * frames) / elapsed };
  }, frames);
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-wet-floor",
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

await page.evaluate(async () => {
  const s = window.__stage;
  const rig = s.cameraRig;
  rig.goToIndex?.(0);
  for (let i = 0; i < 120; i++) rig.update?.(1 / 60);
  for (let i = 0; i < 90; i++) {
    if (s.wetFloor && s._wetFloorMaterial?.map) break;
    await new Promise((r) => requestAnimationFrame(r));
  }
  s.camera.position.y = 3.6;
  s.camera.lookAt(0, 0.15, 18);
});

// Warm-up before timing (avoids intro hitch skewing matte vs probe)
await page.waitForTimeout(600);

// --- Baseline: matte (probe off) ---
await page.evaluate(() => {
  window.__stage.setWetFloorParams?.({ enabled: 0, envStrength: 0 });
});
await page.waitForTimeout(300);
const matte = await measureMs(page, 60);

// --- Probe on ---
await page.evaluate(() => {
  window.__stage.setWetFloorParams?.({
    enabled: 1,
    envStrength: 0.28,
    roughness: 1,
    roughnessInfluence: 1,
    probeEveryN: 3,
    probeSize: 128,
    colorGain: 0.38,
    uvRepeat: 14
  });
});
await page.waitForTimeout(500);
const probe = await measureMs(page, 60);

const metrics = await page.evaluate(() => {
  const s = window.__stage;
  const canvas = document.querySelector("#scene-canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  let cornerLuma = null;
  const samples = [];
  if (gl) {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(4);
    gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    cornerLuma = (0.2126 * buf[0] + 0.7152 * buf[1] + 0.0722 * buf[2]) / 255;
    // Floor near neon (right of bust) vs dry mid-apron vs void
    for (const [nx, ny, label] of [
      [0.58, 0.28, "nearNeonFloor"],
      [0.35, 0.22, "dryFloor"],
      [0.08, 0.9, "void"]
    ]) {
      gl.readPixels(Math.floor(nx * w), Math.floor(ny * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      samples.push({
        label,
        rgb: [buf[0], buf[1], buf[2]],
        luma: (0.2126 * buf[0] + 0.7152 * buf[1] + 0.0722 * buf[2]) / 255
      });
    }
  }
  const mesh = s._wetFloorMesh;
  const spot = s.spotLight;
  return {
    cornerLuma,
    samples,
    wet: s.debugWetFloor?.() ?? null,
    floorLayer: mesh?.layers?.mask ?? null,
    spotLayer: spot?.layers?.mask ?? null,
    spotIntensity: spot?.intensity ?? null,
    ambient: s.environment?.children?.find?.((c) => c.isAmbientLight)?.intensity ?? null
  };
});

const shotPath = `${OUT}/wet-floor-neon-puddles.png`;
await page.screenshot({ path: shotPath, type: "png" });

const deltaMs = probe.msPerFrame - matte.msPerFrame;
const report = {
  ts: new Date().toISOString(),
  approach: "CubeCamera probe (128², every 3 frames) — planar Reflector NOT used",
  matte,
  probe,
  deltaMsPerFrame: deltaMs,
  recommendation:
    deltaMs < 4
      ? "Probe cost acceptable — stay on CubeCamera; do not escalate to Reflector."
      : "Probe expensive — raise probeEveryN or drop size to 64 before considering Reflector.",
  metrics,
  shotPath
};

writeFileSync(`${OUT}/wet-floor-neon-puddles.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, ...report }, null, 2));

await browser.close();
await server.close();
