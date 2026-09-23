/**
 * Bust capture: edge-glitch L1 diamond at CROSS POINT (cursor near shoulder).
 * Expect tight rough diamond straddling silhouette (half out / half in).
 * Tear/RGB recipe unchanged — only the strength FIELD is the diamond.
 *
 * Run: node scripts/verify-edge-glitch-diamond.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5287;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });

async function skipIntro(page) {
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
}

async function settleBust(page) {
  await page.evaluate(() => {
    const s = window.__stage;
    const rig = s.cameraRig;
    rig.goToIndex?.(0);
    for (let i = 0; i < 90; i++) rig.update?.(1 / 60);
    const bust = s.vignettes?.[0]?.instance?.bustRoot;
    if (bust) s.edgeGlitch?.attachBust?.(bust);
  });
  await page.waitForTimeout(500);
}

async function setPointerNdc(page, ndcX, ndcY) {
  await page.evaluate(
    ({ ndcX, ndcY }) => {
      const canvas = document.querySelector("#scene-canvas");
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.left + ((ndcX + 1) * 0.5) * rect.width;
      const clientY = rect.top + ((1 - ndcY) * 0.5) * rect.height;
      const s = window.__stage;
      s.pointer.set(ndcX, ndcY);
      s._lastPointer.x = clientX;
      s._lastPointer.y = clientY;
      s.edgeGlitch.setPointerNdc(s.pointer, { live: true });
    },
    { ndcX, ndcY }
  );
  const client = await page.evaluate(() => ({
    x: window.__stage._lastPointer.x,
    y: window.__stage._lastPointer.y
  }));
  await page.mouse.move(client.x, client.y);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const tick = () => {
          window.__stage.edgeGlitch?.update?.({
            activeIndex: 0,
            bustReady: true,
            time: 2.2 + n * 0.05
          });
          if (++n >= 14) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
  );
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-edge-glitch-diamond",
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
await skipIntro(page);
await page
  .waitForFunction(() => (window.__stage?._volFogFade ?? 0) >= 0.999, {
    timeout: 12000
  })
  .catch(() => {});
await settleBust(page);

// Ensure SDF is current before sampling the rim
await page.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        window.__stage.edgeGlitch?.update?.({ activeIndex: 0, bustReady: true });
        if (++n >= 8) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })
);

// Prefer a near-edge sample on the left silhouette (shoulder region).
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
      if (!(d > 0.0) || d > 0.04) continue;
      const u = (x + 0.5) / s;
      const v = (y + 0.5) / s;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  }
  const prefer = 0.012;
  const targetV = minV + (maxV - minV) * 0.55;
  let best = null;
  let bestErr = 1e9;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = buf[(y * s + x) * 4];
      if (!(d > 0.0) || d > 0.045) continue;
      const u = (x + 0.5) / s;
      const v = (y + 0.5) / s;
      // Left half of silhouette bbox — shoulder / collar approach
      if (u > minU + (maxU - minU) * 0.52) continue;
      if (v < minV + (maxV - minV) * 0.35) continue;
      if (v > minV + (maxV - minV) * 0.78) continue;
      const err = Math.abs(d - prefer) + Math.abs(v - targetV) * 0.2;
      if (err < bestErr) {
        bestErr = err;
        best = { u, v, d, bbox: { minU, maxU, minV, maxV } };
      }
    }
  }
  return best;
});

if (!shoulderUv) {
  console.error("Failed to find shoulder-edge UV sample");
  await browser.close();
  await server.close();
  process.exit(1);
}

await setPointerNdc(page, shoulderUv.u * 2 - 1, shoulderUv.v * 2 - 1);

const debug = await page.evaluate(() => window.__stage.debugEdgeGlitch());
const shaderCheck = await page.evaluate(() => {
  const fs = window.__stage.edgeGlitch?.glitchPass?.material?.fragmentShader || "";
  return {
    hasDiamond: fs.includes("uSpanAlong") && fs.includes("edgeTangent"),
    hasManhattan: fs.includes("abs(tAlong)") || fs.includes("spanAlong"),
    noLocalBase: !fs.includes("uLocalBase"),
    noLocalGrowth: !fs.includes("uLocalGrowth"),
    hasTear: fs.includes("uGlitchIntensity") && fs.includes("uRgbSplit"),
    params: window.__stage.getEdgeGlitchParams?.()
  };
});

const frameMs = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const samples = [];
      let n = 0;
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        samples.push(now - last);
        last = now;
        window.__stage.edgeGlitch?.update?.({
          activeIndex: 0,
          bustReady: true,
          time: 3 + n * 0.016
        });
        if (++n >= 45) {
          samples.sort((a, b) => a - b);
          resolve({
            medianMs: +samples[Math.floor(samples.length / 2)].toFixed(2),
            meanMs: +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2),
            n: samples.length
          });
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })
);

const png = `${OUT}/edge-glitch-diamond-shoulder.png`;
await page.locator("#scene-canvas").screenshot({ path: png });

const report = {
  ok:
    Boolean(shoulderUv) &&
    shaderCheck.hasDiamond &&
    shaderCheck.noLocalBase &&
    (debug.cursorGate ?? 0) > 0.05,
  shoulderUv,
  frameMs,
  debug: {
    spanAlong: debug.spanAlong,
    spanOut: debug.spanOut,
    spanIn: debug.spanIn,
    armOuter: debug.armOuter,
    dCursor: debug.dCursor,
    cursorGate: debug.cursorGate,
    approach: debug.approach
  },
  shaderCheck,
  png,
  note: "Expect tight rough L1 diamond straddling silhouette at shoulder cross point."
};

writeFileSync(`${OUT}/edge-glitch-diamond.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
process.exit(report.ok ? 0 : 1);
