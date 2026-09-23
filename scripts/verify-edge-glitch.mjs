/**
 * Edge glitch verify — restored 9/15–9/16 beauty tears + RGB on Bust + Desktop.
 *
 * Cursor on a shoulder edge: horizontal beauty tears + RGB split on L1 diamond.
 *
 * Run: node scripts/verify-edge-glitch.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5312;
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

async function settleStop(page, stopIndex) {
  await page.evaluate((stopIndex) => {
    const s = window.__stage;
    const rig = s.cameraRig;
    rig.goToIndex?.(stopIndex);
    for (let i = 0; i < 100; i++) rig.update?.(1 / 60);
    s.neon?.armArriveForActiveStop?.(stopIndex);
    const root = s._edgeGlitchRootForStop?.(stopIndex);
    if (root) s.edgeGlitch?.setActiveRoot?.(root);
  }, stopIndex);
  await page.waitForTimeout(500);
}

async function setPointerNdc(page, ndcX, ndcY, stopIndex) {
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
    (stopIndex) =>
      new Promise((resolve) => {
        let n = 0;
        const tick = () => {
          window.__stage.edgeGlitch?.update?.({
            activeIndex: stopIndex,
            bustReady: true,
            time: 2.2 + n * 0.05
          });
          if (++n >= 20) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    stopIndex
  );
}

async function findOutsideEdgeUv(page, preferV = 0.55) {
  return page.evaluate((preferV) => {
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
        if (!(d > 0.0) || d > 0.05) continue;
        const u = (x + 0.5) / s;
        const v = (y + 0.5) / s;
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
      }
    }
    const prefer = 0.018;
    const targetV = minV + (maxV - minV) * preferV;
    let best = null;
    let bestErr = 1e9;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const d = buf[(y * s + x) * 4];
        if (!(d > 0.0) || d > 0.05) continue;
        const u = (x + 0.5) / s;
        const v = (y + 0.5) / s;
        if (u > minU + (maxU - minU) * 0.55) continue;
        if (v < minV + (maxV - minV) * 0.3) continue;
        if (v > minV + (maxV - minV) * 0.8) continue;
        const err = Math.abs(d - prefer) + Math.abs(v - targetV) * 0.25;
        if (err < bestErr) {
          bestErr = err;
          best = { u, v, d, bbox: { minU, maxU, minV, maxV } };
        }
      }
    }
    return best;
  }, preferV);
}

async function measureFrameMs(page, stopIndex) {
  return page.evaluate(
    (stopIndex) =>
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
            activeIndex: stopIndex,
            bustReady: true,
            time: 4 + n * 0.016
          });
          if (++n >= 50) {
            samples.sort((a, b) => a - b);
            resolve({
              medianMs: +samples[Math.floor(samples.length / 2)].toFixed(2),
              p90Ms: +samples[Math.floor(samples.length * 0.9)].toFixed(2),
              meanMs: +(
                samples.reduce((a, b) => a + b, 0) / samples.length
              ).toFixed(2)
            });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    stopIndex
  );
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-edge-glitch",
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

await page.evaluate(() => {
  window.__stage.setEdgeGlitchParams?.({
    glitchArmOuter: 0.1,
    spanAlong: 0.04,
    spanOut: 0.022,
    spanIn: 0.022,
    intensity: 0.28,
    rgbSplit: 0.06,
    tearBands: 96
  });
});

// —— Bust shoulder ——
await settleStop(page, 0);
await page.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        window.__stage.edgeGlitch?.update?.({ activeIndex: 0, bustReady: true });
        if (++n >= 10) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })
);

const shoulderUv = await findOutsideEdgeUv(page, 0.55);
if (!shoulderUv) {
  console.error("Failed to find bust shoulder-edge UV");
  await browser.close();
  await server.close();
  process.exit(1);
}
await setPointerNdc(page, shoulderUv.u * 2 - 1, shoulderUv.v * 2 - 1, 0);

const bustDebug = await page.evaluate(() => window.__stage.debugEdgeGlitch());
const shaderCheck = await page.evaluate(() => {
  const fs = window.__stage.edgeGlitch?.glitchPass?.material?.fragmentShader || "";
  const name = window.__stage.edgeGlitch?.glitchPass?.name || "";
  return {
    passName: name,
    hasBeautyTear:
      fs.includes("uGlitchIntensity") &&
      (fs.includes("tear") || fs.includes("bandY") || fs.includes("shift")),
    hasRgbSplit: fs.includes("uRgbSplit"),
    hasDiamond:
      fs.includes("uSpanAlong") &&
      fs.includes("uSpanOut") &&
      fs.includes("uSpanIn"),
    noShear: !fs.includes("uShearPx"),
    noFadeToBlack: !fs.includes("uFadeGain"),
    noDissolveLine: !fs.includes("uDissolveLine"),
    params: window.__stage.getEdgeGlitchParams?.()
  };
});

const bustPng = `${OUT}/edge-glitch-bust.png`;
await page.locator("#scene-canvas").screenshot({ path: bustPng });
const bustFrame = await measureFrameMs(page, 0);

// —— Desktop PC (second subject) ——
await settleStop(page, 1);
await page.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        window.__stage.edgeGlitch?.update?.({ activeIndex: 1, bustReady: true });
        if (++n >= 12) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })
);

const desktopUv = await findOutsideEdgeUv(page, 0.5);
if (!desktopUv) {
  console.error("Failed to find Desktop edge UV");
  await browser.close();
  await server.close();
  process.exit(1);
}
await setPointerNdc(page, desktopUv.u * 2 - 1, desktopUv.v * 2 - 1, 1);
const desktopDebug = await page.evaluate(() => window.__stage.debugEdgeGlitch());
const desktopPng = `${OUT}/edge-glitch-desktop.png`;
await page.locator("#scene-canvas").screenshot({ path: desktopPng });
const desktopFrame = await measureFrameMs(page, 1);

const report = {
  ok:
    Boolean(shoulderUv) &&
    Boolean(desktopUv) &&
    shaderCheck.passName === "EdgeGlitchPass" &&
    shaderCheck.hasBeautyTear &&
    shaderCheck.hasRgbSplit &&
    shaderCheck.hasDiamond &&
    shaderCheck.noShear &&
    shaderCheck.noFadeToBlack &&
    shaderCheck.noDissolveLine &&
    (bustDebug.glitchGate ?? bustDebug.cursorGate ?? 0) > 0.05 &&
    (bustDebug.intensity ?? 0) >= 0.1 &&
    (bustDebug.rgbSplit ?? 0) >= 0.02,
  approach: bustDebug.approach,
  shoulderUv,
  desktopUv,
  shaderCheck,
  bust: {
    gate: bustDebug.glitchGate ?? bustDebug.cursorGate,
    dCursor: bustDebug.dCursor,
    intensity: bustDebug.intensity,
    rgbSplit: bustDebug.rgbSplit,
    tearBands: bustDebug.tearBands,
    tubeEnabled: bustDebug.tubeEnabled,
    png: bustPng,
    frameMs: bustFrame
  },
  desktop: {
    gate: desktopDebug.glitchGate ?? desktopDebug.cursorGate,
    dCursor: desktopDebug.dCursor,
    activeRoots: desktopDebug.activeRoots,
    png: desktopPng,
    frameMs: desktopFrame
  },
  note: "Restored 9/15–9/16: beauty tears + RGB split on L1 diamond. No dissolve / no revealBoost."
};

writeFileSync(`${OUT}/edge-glitch.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
process.exit(report.ok ? 0 : 1);
