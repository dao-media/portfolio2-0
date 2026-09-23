/**
 * Edge-glitch Part 1+2 verify:
 *   - Probe hasSceneDepth on Bust + Archaeology (fog off)
 *   - Capture Archaeology: glitch bounded to subject silhouette (no unilateral bleed)
 *   - Capture with bonusCount 2–3 roaming mirrors at 0.75×
 *   - Frame-ms cost per bonus point
 *
 * Run: node scripts/verify-edge-glitch-bonus.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5289;
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

async function goToStop(page, index) {
  await page.evaluate((index) => {
    const s = window.__stage;
    const rig = s.cameraRig;
    rig.goToIndex?.(index);
    for (let i = 0; i < 100; i++) rig.update?.(1 / 60);
    s.cameraRig.state.isZoomed = false;
  }, index);
  await page.waitForTimeout(400);
  if (index === 3) {
    await page.waitForFunction(
      () => {
        const v = window.__stage?.vignettes?.[3]?.instance;
        return Boolean(v?.shelfRoot);
      },
      { timeout: 120000 }
    );
    await page.evaluate(() => {
      const s = window.__stage;
      s.neon?.armArriveForActiveStop?.(3);
      const vig = s.vignettes?.[3];
      vig?.group?.traverse?.((o) => {
        if (o.name === "neon-lit-content") o.visible = true;
      });
      if (vig?.instance?.shelfRoot) {
        vig.instance.shelfRoot.visible = true;
        vig.instance.shelfRoot.traverse((o) => {
          if (o.isMesh) o.visible = true;
        });
      }
    });
    await page.waitForTimeout(400);
  }
}

async function findOutsideEdgeUv(page) {
  return page.evaluate(() => {
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
    const prefer = 0.012;
    const targetV = minV + (maxV - minV) * 0.5;
    let best = null;
    let bestErr = 1e9;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const d = buf[(y * s + x) * 4];
        if (!(d > 0.0) || d > 0.04) continue;
        const u = (x + 0.5) / s;
        const v = (y + 0.5) / s;
        if (v < minV + (maxV - minV) * 0.2) continue;
        if (v > minV + (maxV - minV) * 0.85) continue;
        const err = Math.abs(d - prefer) + Math.abs(v - targetV) * 0.15;
        if (err < bestErr) {
          bestErr = err;
          best = { u, v, d, bbox: { minU, maxU, minV, maxV } };
        }
      }
    }
    return best;
  });
}

async function setPointerNdc(page, ndcX, ndcY, activeIndex) {
  await page.evaluate(
    ({ ndcX, ndcY, activeIndex }) => {
      const canvas = document.querySelector("#scene-canvas");
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.left + ((ndcX + 1) * 0.5) * rect.width;
      const clientY = rect.top + ((1 - ndcY) * 0.5) * rect.height;
      const s = window.__stage;
      s.pointer.set(ndcX, ndcY);
      s._lastPointer.x = clientX;
      s._lastPointer.y = clientY;
      s.edgeGlitch.setPointerNdc(s.pointer, { live: true });
      window.__egPointer = { clientX, clientY, activeIndex };
    },
    { ndcX, ndcY, activeIndex }
  );
  const client = await page.evaluate(() => window.__egPointer);
  await page.mouse.move(client.clientX, client.clientY);
  await page.evaluate(
    ({ activeIndex }) =>
      new Promise((resolve) => {
        let n = 0;
        const tick = () => {
          const root = window.__stage._edgeGlitchRootForStop?.(activeIndex);
          window.__stage.edgeGlitch?.update?.({
            activeIndex,
            activeRoot: root,
            bustReady: true,
            time: 2.4 + n * 0.05
          });
          if (++n >= 16) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { activeIndex }
  );
}

async function measureFrameMs(page, activeIndex, bonusCount) {
  return page.evaluate(
    ({ activeIndex, bonusCount }) =>
      new Promise((resolve) => {
        const s = window.__stage;
        s.setEdgeGlitchParams?.({ bonusCount });
        const samples = [];
        let n = 0;
        let last = performance.now();
        const tick = () => {
          const now = performance.now();
          samples.push(now - last);
          last = now;
          const root = s._edgeGlitchRootForStop?.(activeIndex);
          s.edgeGlitch?.update?.({
            activeIndex,
            activeRoot: root,
            bustReady: true,
            time: 4 + n * 0.016
          });
          if (++n >= 50) {
            samples.sort((a, b) => a - b);
            const mid = samples[Math.floor(samples.length / 2)];
            resolve({
              bonusCount,
              medianMs: +mid.toFixed(2),
              meanMs: +(
                samples.reduce((a, b) => a + b, 0) / samples.length
              ).toFixed(2)
            });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { activeIndex, bonusCount }
  );
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-edge-glitch-bonus",
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
await page.waitForTimeout(600);

const fogMode = await page.evaluate(() => ({
  stageFogMode: window.__stage?.debugFog?.()?.stageFogMode ?? window.__stage?._fogMode,
  fogMode: window.__stage?._fogMode
}));

// --- Bust probe ---
await goToStop(page, 0);
await page.evaluate(() => {
  const bust = window.__stage._edgeGlitchRootForStop?.(0);
  if (bust) window.__stage.edgeGlitch?.setActiveRoot?.(bust);
});
await page.waitForTimeout(300);
await page.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        window.__stage.neon?.captureFogDepth?.(
          window.__stage.renderer,
          window.__stage.scene,
          window.__stage.camera
        );
        const depthTex = window.__stage.neon?.depthCapture?.depthTexture ?? null;
        window.__stage.edgeGlitch?.setSceneDepth?.(depthTex);
        window.__stage.edgeGlitch?.update?.({
          activeIndex: 0,
          activeRoot: window.__stage._edgeGlitchRootForStop?.(0),
          bustReady: true,
          time: 1.5
        });
        if (++n >= 10) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })
);
const bustProbe = await page.evaluate(() => window.__stage.debugEdgeGlitch());

// --- Archaeology probe + captures ---
await goToStop(page, 3);
await page.evaluate(() => {
  const roots = window.__stage._edgeGlitchRootForStop?.(3);
  window.__stage.edgeGlitch?.setActiveRoot?.(roots);
});
await page.waitForTimeout(500);
await page.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        window.__stage.neon?.captureFogDepth?.(
          window.__stage.renderer,
          window.__stage.scene,
          window.__stage.camera
        );
        const depthTex = window.__stage.neon?.depthCapture?.depthTexture ?? null;
        window.__stage.edgeGlitch?.setSceneDepth?.(depthTex);
        const roots = window.__stage._edgeGlitchRootForStop?.(3);
        window.__stage.edgeGlitch?.update?.({
          activeIndex: 3,
          activeRoot: roots,
          bustReady: true,
          time: 1.8
        });
        if (++n >= 12) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })
);

const archProbe = await page.evaluate(() => window.__stage.debugEdgeGlitch());
const edgeUv = await findOutsideEdgeUv(page);
if (!edgeUv) {
  console.error("No Archaeology edge UV found");
  await browser.close();
  await server.close();
  process.exit(1);
}

// Part 1: bonus off — silhouette-bounded diamond
await page.evaluate(() =>
  window.__stage.setEdgeGlitchParams?.({
    bonusCount: 0,
    bonusIntensity: 0.75,
    bonusRhythm: 16
  })
);
await setPointerNdc(page, edgeUv.u * 2 - 1, edgeUv.v * 2 - 1, 3);
const part1Png = `${OUT}/edge-glitch-arch-no-bleed.png`;
await page.locator("#scene-canvas").screenshot({ path: part1Png });
const part1Debug = await page.evaluate(() => window.__stage.debugEdgeGlitch());

// Part 2: bonus mirrors
await page.evaluate(() =>
  window.__stage.setEdgeGlitchParams?.({
    bonusCount: 3,
    bonusIntensity: 0.75,
    bonusRhythm: 16
  })
);
await setPointerNdc(page, edgeUv.u * 2 - 1, edgeUv.v * 2 - 1, 3);
const part2Png = `${OUT}/edge-glitch-arch-bonus.png`;
await page.locator("#scene-canvas").screenshot({ path: part2Png });
const part2Debug = await page.evaluate(() => window.__stage.debugEdgeGlitch());

const cost0 = await measureFrameMs(page, 3, 0);
const cost2 = await measureFrameMs(page, 3, 2);
const cost3 = await measureFrameMs(page, 3, 3);

const shaderCheck = await page.evaluate(() => {
  const fs = window.__stage.edgeGlitch?.glitchPass?.material?.fragmentShader || "";
  const occ = fs.includes("scenePack") || fs.includes("mismatch");
  const hardGate = fs.includes("strength < 1e-3");
  const bonus = fs.includes("uBonusCount") && fs.includes("hash22");
  return {
    hasOccMatch: occ,
    hasHardGate: hardGate,
    hasBonus: bonus,
    params: window.__stage.getEdgeGlitchParams?.()
  };
});

const report = {
  ok:
    Boolean(bustProbe?.hasSceneDepth) &&
    Boolean(archProbe?.hasSceneDepth) &&
    Boolean(part1Debug?.hasSceneDepthUniform) &&
    shaderCheck.hasOccMatch &&
    shaderCheck.hasHardGate &&
    shaderCheck.hasBonus &&
    (part1Debug?.cursorGate ?? 0) > 0.05,
  fogMode,
  bustProbe: {
    hasSceneDepth: bustProbe?.hasSceneDepth,
    hasSceneDepthUniform: bustProbe?.hasSceneDepthUniform,
    activeRoots: bustProbe?.activeRoots
  },
  archProbe: {
    hasSceneDepth: archProbe?.hasSceneDepth,
    hasSceneDepthUniform: archProbe?.hasSceneDepthUniform,
    activeRoots: archProbe?.activeRoots,
    dCursor: part1Debug?.dCursor,
    cursorGate: part1Debug?.cursorGate
  },
  edgeUv,
  part1: { png: part1Png, bonusCount: 0 },
  part2: {
    png: part2Png,
    bonusCount: part2Debug?.bonusCount,
    bonusIntensity: part2Debug?.bonusIntensity
  },
  frameMs: {
    bonus0: cost0,
    bonus2: cost2,
    bonus3: cost3,
    costPerBonusMs: +(
      ((cost3.medianMs - cost0.medianMs) / 3)
    ).toFixed(3)
  },
  shaderCheck
};

writeFileSync(`${OUT}/edge-glitch-bonus.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
process.exit(report.ok ? 0 : 1);
