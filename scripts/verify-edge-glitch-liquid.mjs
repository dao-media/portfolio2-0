/**
 * LOCKED liquid bulge verify — neon rim + SDF-normal swell + dual arms.
 *
 * Cursor at ~liquidArm (0.15) from shoulder: rim + bulge; tears closer.
 * Reports frame-ms at bonusCount 0.
 *
 * Run: node scripts/verify-edge-glitch-liquid.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5305;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-eg-liquid-lock",
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
    bonusCount: 0,
    liquidArmOuter: 0.15,
    glitchArmOuter: 0.06,
    bulgeAmpPx: 14,
    liquidReveal: 3.0,
    edgeLightAmount: 0.35,
    surfaceTension: 1.4,
    bleedViscosity: 10,
    revealBoost: 3.5,
    tearAmpPx: 42,
    rgbSplitPx: 14
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
  // Prefer ~0.12–0.15 out on the right-ish shoulder (liquid arm zone).
  let best = null;
  let bestErr = 1e9;
  const preferD = 0.12;
  const targetV = minV + (maxV - minV) * 0.55;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = buf[(y * s + x) * 4];
      if (!(d > 0.06) || d > 0.16) continue;
      const u = (x + 0.5) / s;
      const v = (y + 0.5) / s;
      if (u < minU + (maxU - minU) * 0.45) continue;
      if (v < 0.35 || v > 0.72) continue;
      const err = Math.abs(d - preferD) + Math.abs(v - targetV) * 0.25;
      if (err < bestErr) {
        bestErr = err;
        best = { u, v, d, bbox: { minU, maxU, minV, maxV } };
      }
    }
  }
  return best;
});

if (!shoulderUv) {
  console.error("no shoulder UV in liquid-arm band");
  await browser.close();
  await server.close();
  process.exit(1);
}

async function aim(edgeUv, frames = 28, snapBulge = 14) {
  await page.evaluate(
    ({ edgeUv, snapBulge }) => {
      const s = window.__stage;
      const ndcX = edgeUv.u * 2 - 1;
      const ndcY = edgeUv.v * 2 - 1;
      const rect = document.querySelector("#scene-canvas").getBoundingClientRect();
      s.pointer.set(ndcX, ndcY);
      s._lastPointer.x = rect.left + ((ndcX + 1) * 0.5) * rect.width;
      s._lastPointer.y = rect.top + ((1 - ndcY) * 0.5) * rect.height;
      s.edgeGlitch.setPointerNdc(s.pointer, { live: true });
      s.edgeGlitch._bleedAmpSmooth = snapBulge;
      s.edgeGlitch._bleedCursorSmooth.set(edgeUv.u, edgeUv.v);
      s.edgeGlitch._lastBleedTime = 5;
      const hue =
        s.neon?.stopLights?.[0]?.light?.color ??
        s.neon?.entries?.[0]?.dominant ??
        null;
      s.edgeGlitch.setNeonHue?.(hue);
      window.__p = { x: s._lastPointer.x, y: s._lastPointer.y };
    },
    { edgeUv, snapBulge }
  );
  const p = await page.evaluate(() => window.__p);
  await page.mouse.move(p.x, p.y);
  await page.evaluate(
    ({ frames }) =>
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
          if (++n >= frames) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { frames }
  );
}

await aim(shoulderUv, 32, 14);
const png = `${OUT}/edge-glitch-liquid-shoulder.png`;
await page.locator("#scene-canvas").screenshot({ path: png });

const uniforms = await page.evaluate(() => {
  const eg = window.__stage.edgeGlitch;
  const u = eg?.glitchPass?.uniforms;
  const src = eg?.glitchPass?.material?.fragmentShader || "";
  return {
    bulgeAmp: u?.uBulgeAmpPx?.value ?? null,
    liquidReveal: u?.uLiquidReveal?.value ?? null,
    edgeLight: u?.uEdgeLightAmount?.value ?? null,
    liquidArm: u?.uLiquidArmOuter?.value ?? null,
    glitchArm: u?.uGlitchArmOuter?.value ?? null,
    neonHue: u?.uNeonHue?.value
      ? {
          r: +u.uNeonHue.value.r.toFixed(3),
          g: +u.uNeonHue.value.g.toFixed(3),
          b: +u.uNeonHue.value.b.toFixed(3)
        }
      : null,
    hasNormalBulge: src.includes("edgeGlitchLiquidDelta") && src.includes("toward"),
    hasRim: src.includes("uEdgeLightAmount") && src.includes("rimAmt"),
    hasLiquidReveal: src.includes("uLiquidReveal"),
    hasDualArm: src.includes("uLiquidArmOuter") && src.includes("uGlitchArmOuter"),
    noCurlPsi: !src.includes("dPsiDr"),
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
        const now = performance.now();
        samples.push(now - last);
        last = now;
        s.edgeGlitch?.update?.({
          activeIndex: 0,
          bustReady: true,
          time: 8 + n * 0.016
        });
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
# Shoulder / right-mid band — look for neon-ish bright fringe
n = 0; s = 0.0; neonish = 0
for y in range(int(h*0.28), int(h*0.72)):
  for x in range(int(w*0.42), int(w*0.78)):
    r,g,b = px[x,y]
    L = 0.2126*r + 0.7152*g + 0.0722*b
    if L > 50:
      n += 1; s += L
      # Bust tube is lime/cyan — high G or cyan-ish
      if g > r + 8 or (g > 80 and b > 60):
        neonish += 1
print(json.dumps({
  "brightPx": n,
  "meanLuma": round(s/n,1) if n else 0,
  "neonishPx": neonish
}))
`
  ],
  { encoding: "utf8" }
);
const vision = JSON.parse(py.stdout.trim());

const report = {
  ok:
    Boolean(shoulderUv) &&
    uniforms.hasNormalBulge &&
    uniforms.hasRim &&
    uniforms.hasLiquidReveal &&
    uniforms.hasDualArm &&
    uniforms.noCurlPsi &&
    (uniforms.debug?.liquidGate ?? 0) > 0.05 &&
    vision.brightPx > 800,
  shoulderUv,
  uniforms,
  vision,
  frameMs,
  png,
  locked: true,
  note: "LOCKED liquid: neon rim whisper + liquidReveal bulge along SDF normal; dual arms; no more liquid knobs."
};
writeFileSync(`${OUT}/edge-glitch-liquid.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
process.exit(report.ok ? 0 : 1);
