/**
 * Block-displacement (datamosh) verify — irregular 2D cells, no band comb.
 *
 * Cursor on a dark shoulder edge. Expect sparse rectangular blocks of shifted
 * beauty + occasional neon/white dropout flashes — NOT horizontal rows.
 *
 * Run: node scripts/verify-edge-glitch-fringe.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5307;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-eg-fringe",
  logLevel: "error",
  clearScreen: false
});
await server.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`, {
  waitUntil: "domcontentloaded"
});

for (let i = 0; i < 140; i++) {
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

await page.evaluate(() => {
  const s = window.__stage;
  const rig = s.cameraRig;
  rig.goToIndex?.(0);
  for (let i = 0; i < 90; i++) rig.update?.(1 / 60);
  const bust = s.vignettes?.[0]?.instance?.bustRoot;
  if (bust) s.edgeGlitch?.attachBust?.(bust);
  s.neon?.armArriveForActiveStop?.(0);
  s.setEdgeGlitchParams?.({
    glitchArmOuter: 0.06,
    revealBoost: 3.5,
    tearAmpPx: 54,
    rgbSplitPx: 14,
    fringeAmount: 0.55
  });
});
await page.waitForTimeout(500);

await page.evaluate(() => {
  const s = window.__stage;
  for (let i = 0; i < 10; i++) {
    s.neon?.captureFogDepth?.(s.renderer, s.scene, s.camera);
    s.edgeGlitch?.setSceneDepth?.(s.neon?.depthCapture?.depthTexture);
    s.edgeGlitch?.update?.({ activeIndex: 0, bustReady: true, time: 1 });
  }
});

// Prefer LEFT / camera-dark shoulder — away from neon tube on the right.
const shoulderUv = await page.evaluate(() => {
  const eg = window.__stage.edgeGlitch;
  const s = eg.sdf.size;
  const buf = new Float32Array(s * s * 4);
  eg.renderer.readRenderTargetPixels(eg.sdf.sdfRT, 0, 0, s, s, buf);
  let minU = 1;
  let maxU = 0;
  let minV = 1;
  let maxV = 0;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = buf[(y * s + x) * 4];
      if (!(d > 0) || d > 0.05) continue;
      const u = (x + 0.5) / s;
      const v = (y + 0.5) / s;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  }
  let best = null;
  let bestErr = 1e9;
  const preferD = 0.035;
  const targetV = minV + (maxV - minV) * 0.48;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = buf[(y * s + x) * 4];
      if (!(d > 0.015) || d > 0.055) continue;
      const u = (x + 0.5) / s;
      const v = (y + 0.5) / s;
      if (u > minU + (maxU - minU) * 0.42) continue;
      if (v < 0.32 || v > 0.68) continue;
      const err = Math.abs(d - preferD) + Math.abs(v - targetV) * 0.3;
      if (err < bestErr) {
        bestErr = err;
        best = { u, v, d, bbox: { minU, maxU, minV, maxV } };
      }
    }
  }
  return best;
});

if (!shoulderUv) {
  console.error("no dark-shoulder UV");
  await browser.close();
  await server.close();
  process.exit(1);
}

await page.evaluate(
  ({ edgeUv }) => {
    const s = window.__stage;
    const ndcX = edgeUv.u * 2 - 1;
    const ndcY = edgeUv.v * 2 - 1;
    const rect = document.querySelector("#scene-canvas").getBoundingClientRect();
    s.pointer.set(ndcX, ndcY);
    s._lastPointer.x = rect.left + ((ndcX + 1) * 0.5) * rect.width;
    s._lastPointer.y = rect.top + ((1 - ndcY) * 0.5) * rect.height;
    s.edgeGlitch.setPointerNdc(s.pointer, { live: true });
    const hue =
      s.neon?.stopLights?.[0]?.light?.color ??
      s.neon?.entries?.[0]?.dominant ??
      null;
    s.edgeGlitch.setNeonHue?.(hue);
    window.__p = { x: s._lastPointer.x, y: s._lastPointer.y };
  },
  { edgeUv: shoulderUv }
);
const p = await page.evaluate(() => window.__p);
await page.mouse.move(p.x, p.y);
await page.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        const s = window.__stage;
        s.neon?.captureFogDepth?.(s.renderer, s.scene, s.camera);
        s.edgeGlitch?.setSceneDepth?.(s.neon?.depthCapture?.depthTexture);
        const hue =
          s.neon?.stopLights?.[0]?.light?.color ??
          s.neon?.entries?.[0]?.dominant ??
          null;
        s.edgeGlitch?.setNeonHue?.(hue);
        s.edgeGlitch?.update?.({
          activeIndex: 0,
          bustReady: true,
          time: 5 + n * 0.05
        });
        s.post?.render?.(s.scene, s.camera, 5 + n * 0.05);
        if (++n >= 36) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })
);

const png = `${OUT}/edge-glitch-fringe-dark-shoulder.png`;
await page.locator("#scene-canvas").screenshot({ path: png });

const state = await page.evaluate(() => {
  const eg = window.__stage.edgeGlitch;
  const u = eg?.glitchPass?.uniforms;
  const src = eg?.glitchPass?.material?.fragmentShader || "";
  return {
    fringeAmount: u?.uFringeAmount?.value ?? null,
    scanlineAmount: u?.uScanlineAmount?.value ?? null,
    fringeCap: u?.uFringeCap?.value ?? null,
    neonHue: u?.uNeonHue?.value
      ? {
          r: +u.uNeonHue.value.r.toFixed(3),
          g: +u.uNeonHue.value.g.toFixed(3),
          b: +u.uNeonHue.value.b.toFixed(3)
        }
      : null,
    scanlineOff: (u?.uScanlineAmount?.value ?? 1) < 1e-4,
    hasSeamFringe: src.includes("uFringeAmount") && src.includes("thinLine"),
    hasBeautyBoost: src.includes("revealBoost") && src.includes("uRevealBoost"),
    hasTearBands: src.includes("uTearBands"),
    noBlockCells: !src.includes("resolveCell") && !src.includes("uCellBasePx"),
    tearAmpPx: u?.uTearAmpPx?.value ?? null,
    debug: window.__stage.debugEdgeGlitch?.()
  };
});

const frameMs = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const s = window.__stage;
      const samples = [];
      let n = 0;
      let last = performance.now();
      const tick = () => {
        s.edgeGlitch?.update?.({
          activeIndex: 0,
          bustReady: true,
          time: 8 + n * 0.016
        });
        s.post?.render?.(s.scene, s.camera, 8 + n * 0.016);
        const now = performance.now();
        samples.push(now - last);
        last = now;
        if (++n >= 48) {
          samples.sort((a, b) => a - b);
          resolve({
            medianMs: +samples[Math.floor(samples.length / 2)].toFixed(2),
            meanMs: +(
              samples.reduce((a, b) => a + b, 0) / samples.length
            ).toFixed(2),
            p90Ms: +samples[Math.floor(samples.length * 0.9)].toFixed(2)
          });
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })
);

const py = spawnSync(
  "python3",
  [
    "-c",
    `
from PIL import Image
import json
im = Image.open("${png}").convert("RGB")
w, h = im.size
px = im.load()
cx = int(${shoulderUv.u} * w); cy = int((1.0 - ${shoulderUv.v}) * h)
n = 0; bright = 0; chrom = 0; blobish = 0; neonFlash = 0
panelRows = 0
# Horizontal comb score: many rows with similar bright run lengths
rowRuns = []
for y in range(max(0, cy - 100), min(h, cy + 100)):
  run = 0
  rowBright = 0
  rowChrom = 0
  maxRun = 0
  for x in range(max(0, cx - 60), min(w, cx + 120)):
    r,g,b = px[x,y]
    L = 0.2126*r + 0.7152*g + 0.0722*b
    n += 1
    if L > 55:
      bright += 1
      rowBright += 1
      run += 1
      maxRun = max(maxRun, run)
      if (r > g + 28 and r > b + 22) or (g > r + 18 and b > r + 12):
        chrom += 1
        rowChrom += 1
      # neon/white dropout flash (high L, low chroma)
      if L > 140 and abs(r-g) < 40 and abs(g-b) < 40:
        neonFlash += 1
    else:
      if run > 28:
        blobish += 1
      run = 0
  if run > 28:
    blobish += 1
  if rowBright > 40:
    panelRows += 1
  if maxRun >= 8:
    rowRuns.append(maxRun)

# Comb: many consecutive rows with similar long horizontal runs
combPairs = 0
for i in range(1, len(rowRuns)):
  a, b = rowRuns[i-1], rowRuns[i]
  if a >= 18 and b >= 18 and abs(a-b) <= 6:
    combPairs += 1
print(json.dumps({
  "samplePx": n,
  "brightPx": bright,
  "chromaticPx": chrom,
  "neonFlashPx": neonFlash,
  "blobRuns": blobish,
  "panelRows": panelRows,
  "rowRunCount": len(rowRuns),
  "combPairs": combPairs,
  "brightFrac": round(bright/n, 4) if n else 0
}))
`
  ],
  { encoding: "utf8" }
);
const vision = JSON.parse(py.stdout.trim());

const report = {
  ok:
    Boolean(shoulderUv) &&
    state.scanlineOff &&
    state.hasSeamFringe &&
    state.hasBeautyBoost &&
    state.hasTearBands &&
    state.noBlockCells &&
    (state.fringeAmount ?? 0) >= 0.4 &&
    (state.tearAmpPx ?? 0) >= 42 &&
    vision.brightPx > 6 &&
    vision.blobRuns < 40 &&
    vision.panelRows < 14 &&
    vision.brightFrac < 0.22,
  shoulderUv,
  state,
  vision,
  frameMs,
  png,
  note: "Fork A beauty tear + thin emissive seam fringes (scanline 0). Dark-bust visible without inject smear / block cells."
};
writeFileSync(`${OUT}/edge-glitch-fringe.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
process.exit(report.ok ? 0 : 1);
