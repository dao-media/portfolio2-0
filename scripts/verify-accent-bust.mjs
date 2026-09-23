/**
 * Bust capture: accent rim silhouette separation + volumetric shaft.
 * Blacks must stay black (no global fill lift).
 *
 * Run: node scripts/verify-accent-bust.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5291;
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

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-accent-bust",
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

const metrics = await page.evaluate(async () => {
  const s = window.__stage;
  const rig = s.cameraRig;
  rig.goToIndex?.(0);
  for (let i = 0; i < 120; i++) rig.update?.(1 / 60);

  // Wait for bust + accents
  for (let i = 0; i < 90; i++) {
    if (s.vignettes?.[0]?.instance?.bustRoot && s.accentLights) break;
    await new Promise((r) => requestAnimationFrame(r));
  }

  const t0 = performance.now();
  let frames = 0;
  await new Promise((resolve) => {
    const tick = () => {
      frames += 1;
      if (frames >= 45) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const elapsed = performance.now() - t0;
  const msPerFrame = elapsed / frames;

  // Sample a few dark corner pixels via canvas read — blacks stay near black
  const canvas = document.querySelector("#scene-canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  let cornerLuma = null;
  /** @type {{ x: number, y: number, rgb: number[], luma: number }[]} */
  const samples = [];
  if (gl) {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(4);
    gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    cornerLuma = (0.2126 * buf[0] + 0.7152 * buf[1] + 0.0722 * buf[2]) / 255;
    // Bust sits lower-left-center; probe left silhouette band + right key side.
    const probes = [
      [0.38, 0.48, "leftSilhouette"],
      [0.42, 0.42, "leftCheek"],
      [0.55, 0.48, "rightKey"],
      [0.08, 0.9, "void"]
    ];
    for (const [nx, ny, label] of probes) {
      const x = Math.floor(nx * w);
      const y = Math.floor(ny * h);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const luma = (0.2126 * buf[0] + 0.7152 * buf[1] + 0.0722 * buf[2]) / 255;
      samples.push({
        label,
        x,
        y,
        rgb: [buf[0], buf[1], buf[2]],
        luma
      });
    }
  }

  const dbg = s.debugAccent?.() ?? null;
  const a = s.accentLights;
  const neon = s.neon?.stopLights?.[0]?.light;
  const sub = s._accentSubjectForStop?.(0);
  const tmp = a.rimA.position.clone();
  const camP = s.camera.getWorldPosition(tmp.clone());
  const neonP = neon ? neon.getWorldPosition(tmp.clone()) : null;
  const rimAW = a.rimA.getWorldPosition(tmp.clone());
  // Subject world position from matrix (bustRoot origin ≈ pedestal).
  const subP = sub ? sub.getWorldPosition(tmp.clone()) : null;
  const pointLights = [];
  s.scene.traverse((o) => {
    if (!o.isPointLight) return;
    const p = o.getWorldPosition(tmp.clone());
    pointLights.push({
      name: o.name,
      intensity: o.intensity,
      distance: o.distance,
      decay: o.decay,
      color: [o.color.r, o.color.g, o.color.b],
      pos: [p.x, p.y, p.z],
      layers: o.layers.mask
    });
  });
  return {
    msPerFrame,
    fpsEst: 1000 / msPerFrame,
    cornerLuma,
    samples,
    accent: dbg,
    probe: {
      subject: sub?.name ?? null,
      subjectPos: subP ? [subP.x, subP.y, subP.z] : null,
      cam: [camP.x, camP.y, camP.z],
      neon: neonP ? [neonP.x, neonP.y, neonP.z] : null,
      rimA: [rimAW.x, rimAW.y, rimAW.z],
      rimAToSubject: subP ? rimAW.distanceTo(subP) : null,
      rimIntensity: a.rimA.intensity,
      rimDistance: a.rimA.distance,
      rimDecay: a.rimA.decay,
      pointLights
    },
    ambient: s.environment?.children?.find?.((c) => c.isAmbientLight)?.intensity ?? null,
    hemi: s.environment?.children?.find?.((c) => c.isHemisphereLight)?.intensity ?? null
  };
});

const shotPath = `${OUT}/accent-bust-rim-shaft.png`;
await page.screenshot({ path: shotPath, type: "png" });

writeFileSync(
  `${OUT}/accent-bust-rim-shaft.json`,
  JSON.stringify({ ts: new Date().toISOString(), metrics, shotPath }, null, 2)
);

console.log(JSON.stringify({ ok: true, shotPath, metrics }, null, 2));

await browser.close();
await server.close();
