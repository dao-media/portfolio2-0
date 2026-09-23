/**
 * Confirm bloom-vs-opacity edge flash, fog pop-in trigger, cast-light hue drift,
 * and STAGE_BG seam. Also verifies post-fix dead-still edges.
 *
 * Run: node scripts/fog-bloom-land-verify.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5273;
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
}

function analyze(edgeMeans, opacities) {
  const n = edgeMeans.length;
  let sO = 0;
  let sE = 0;
  let sOO = 0;
  let sOE = 0;
  for (let i = 0; i < n; i++) {
    sO += opacities[i];
    sE += edgeMeans[i];
    sOO += opacities[i] * opacities[i];
    sOE += opacities[i] * edgeMeans[i];
  }
  const den = n * sOO - sO * sO;
  const slope = Math.abs(den) < 1e-9 ? 0 : (n * sOE - sO * sE) / den;
  const intercept = (sE - slope * sO) / n;
  const resid = edgeMeans.map((e, i) => e - (intercept + slope * opacities[i]));
  const avg = resid.reduce((a, b) => a + b, 0) / n;
  const maxDev = Math.max(...resid.map((v) => Math.abs(v - avg)));
  let maxFf = 0;
  let hf = 0;
  for (let i = 1; i < n; i++) maxFf = Math.max(maxFf, Math.abs(resid[i] - resid[i - 1]));
  for (let i = 2; i < n; i++) hf += Math.abs(resid[i] - 2 * resid[i - 1] + resid[i - 2]);
  return {
    residMaxDev: Math.round(maxDev * 100) / 100,
    residMaxFrameDelta: Math.round(maxFf * 100) / 100,
    residHfEnergy: Math.round(hf * 100) / 100,
    n
  };
}

async function sampleEdges(page, frames) {
  return page.evaluate(async (n) => {
    const canvas = document.querySelector("#scene-canvas");
    const w = 320;
    const h = 200;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext("2d");
    const ring = 12;
    const edgeMeans = [];
    const opacities = [];
    const blooms = [];
    for (let i = 0; i < n; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      opacities.push(
        window.__stage?.volumetricFog?.compositeMaterial?.uniforms?.uCompositeOpacity
          ?.value ?? 0
      );
      blooms.push(window.__stage?.post?.bloomEffect?.intensity ?? 0);
      ctx.drawImage(canvas, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let eSum = 0;
      let eN = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!(x < ring || x >= w - ring || y < ring || y >= h - ring)) continue;
          const i4 = (y * w + x) * 4;
          eSum += 0.2126 * data[i4] + 0.7152 * data[i4 + 1] + 0.0722 * data[i4 + 2];
          eN += 1;
        }
      }
      edgeMeans.push(eSum / Math.max(eN, 1));
    }
    return { edgeMeans, opacities, blooms };
  }, frames);
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-fog-bloom"
});
await server.listen();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`, {
  waitUntil: "domcontentloaded"
});
await skipIntro(page);
await page.waitForFunction(() => Boolean(window.__stage?.introComplete), {
  timeout: 120000
});

// --- Item 2: natural pop-in trigger (do NOT reset fade if already mid/done) ---
const popIn = await page.evaluate(() => {
  const s = window.__stage;
  const now = performance.now();
  const land = s._introLandAt || 0;
  const fadeDone = s._fogFadeDoneAt || 0;
  const heavyAfter = s._introHeavyEffectsAfter || 0;
  return {
    trigger: "introComplete / _completeIntroMotion (land)",
    notTrigger: "_shouldRunIntroHeavyEffects (2000ms)",
    introComplete: Boolean(s.introComplete),
    volFogFade: s._volFogFade,
    fogOpacity:
      s.volumetricFog?.compositeMaterial?.uniforms?.uCompositeOpacity?.value ?? null,
    msLandToNow: land ? Math.round(now - land) : null,
    msLandToFadeDone: land && fadeDone ? Math.round(fadeDone - land) : null,
    heavyEffectsAfterSet: heavyAfter > 0,
    msUntilHeavy:
      heavyAfter > 0 ? Math.round(heavyAfter - now) : "not-armed-yet-or-past",
    heavyGateNow:
      typeof s._shouldRunIntroHeavyEffects === "function"
        ? s._shouldRunIntroHeavyEffects()
        : null,
    // Fade arms on the same flag as land — must not wait for heavy gate
    fadeArmedWithLand: Boolean(s.introComplete) && s._volFogFade > 0
  };
});

await page.waitForFunction(() => (window.__stage?._volFogFade ?? 0) >= 0.999, {
  timeout: 8000
});
await page.waitForTimeout(300);

// --- Item 1 confirm: force bloom ON during a re-fade (bypass land gate) vs OFF ---
async function abPass(wantBloom) {
  await page.evaluate((bloom) => {
    const s = window.__stage;
    s.volumetricFog?.setNoiseFrozen?.(true);
    if (s.neon) {
      s.neon._flickering = false;
      s.neon._freezeGradient = true;
    }
    // Bypass the land bloom gate so we can A/B extract behavior
    s._syncBloomForFogFade = () => {};
    s._volFogFade = 0;
    s.volumetricFog.setCompositeOpacity(0);
    s.volumetricFog.setDensityScale(1);
    s.volumetricFog.setEnabled(true);
    s.post.bloomEffect.intensity = bloom ? 1.2 : 0;
    // Drive opacity manually over ~400ms without the gate reasserting bloom
    s._abManualFog = true;
    s._abFogT = 0;
  }, wantBloom);

  // Manually advance opacity while sampling (don't use _tickVolumetricFog bloom path)
  const driven = await page.evaluate(async () => {
    const s = window.__stage;
    const edgeMeans = [];
    const opacities = [];
    const canvas = document.querySelector("#scene-canvas");
    const w = 320;
    const h = 200;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext("2d");
    const ring = 12;
    const frames = 40;
    for (let i = 0; i < frames; i++) {
      s._volFogFade = Math.min(1, (i + 1) / (frames * 0.85));
      s.volumetricFog.setCompositeOpacity(s._volFogFade);
      await new Promise((r) => requestAnimationFrame(r));
      opacities.push(s._volFogFade);
      ctx.drawImage(canvas, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let eSum = 0;
      let eN = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!(x < ring || x >= w - ring || y < ring || y >= h - ring)) continue;
          const i4 = (y * w + x) * 4;
          eSum += 0.2126 * data[i4] + 0.7152 * data[i4 + 1] + 0.0722 * data[i4 + 2];
          eN += 1;
        }
      }
      edgeMeans.push(eSum / Math.max(eN, 1));
    }
    return { edgeMeans, opacities, bloom: s.post.bloomEffect.intensity };
  });
  return { bloomOn: wantBloom, ...analyze(driven.edgeMeans, driven.opacities), bloom: driven.bloom };
}

const withBloom = await abPass(true);
const withoutBloom = await abPass(false);

const bloomPulse = withBloom.residMaxFrameDelta;
const noBloomPulse = withoutBloom.residMaxFrameDelta;
let confirmVerdict;
if (bloomPulse > noBloomPulse * 1.5 && noBloomPulse < 1.5) {
  confirmVerdict = "BLOOM — residual edge pulse collapses with bloom off";
} else if (withBloom.residHfEnergy > withoutBloom.residHfEnergy * 1.4) {
  confirmVerdict = "BLOOM — high-freq edge energy higher with bloom on";
} else if (noBloomPulse >= 1.5 && bloomPulse <= noBloomPulse * 1.2) {
  confirmVerdict = "OPACITY — residual remains with bloom off";
} else {
  confirmVerdict = `COMPARE bloom ffΔ=${bloomPulse} hf=${withBloom.residHfEnergy} vs off ffΔ=${noBloomPulse} hf=${withoutBloom.residHfEnergy}`;
}

// Restore normal fog+bloom gate behavior and verify dead-still after fix path
await page.evaluate(() => {
  const s = window.__stage;
  // Restore prototype method
  s._syncBloomForFogFade = Object.getPrototypeOf(s)._syncBloomForFogFade.bind(s);
  s._volFogFade = 1;
  s.volumetricFog.setCompositeOpacity(1);
  s.volumetricFog.setDensityScale(1);
  s._syncBloomForFogFade(true);
  s.neon._freezeGradient = false;
  s.volumetricFog.setNoiseFrozen(false);
});
await page.waitForTimeout(200);
const settled = await sampleEdges(page, 28);
const settledStats = analyze(
  settled.edgeMeans,
  settled.opacities.map(() => 1)
);

// --- Item 3: cast light hue drift ---
const lightAb = await page.evaluate(async () => {
  const s = window.__stage;
  const light = s.neon?.stopLights?.[0]?.light;
  if (!light) return { err: "no light" };
  const samples = [];
  s.neon._freezeGradient = false;
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    if (i % 15 === 0) {
      samples.push({
        r: Math.round(light.color.r * 1000) / 1000,
        g: Math.round(light.color.g * 1000) / 1000,
        b: Math.round(light.color.b * 1000) / 1000,
        phase: Math.round((s.neon._lightColorPhase ?? 0) * 1000) / 1000
      });
    }
  }
  const dr = Math.max(...samples.map((s) => s.r)) - Math.min(...samples.map((s) => s.r));
  const dg = Math.max(...samples.map((s) => s.g)) - Math.min(...samples.map((s) => s.g));
  const db = Math.max(~samples.map((s) => s.b)) - Math.min(...samples.map((s) => s.b));
  // canopy shimmer proxy: leaf-ish green pixels variance in a crop — skip heavy; report hue span
  return {
    samples,
    channelSpan: {
      r: Math.round(dr * 1000) / 1000,
      g: Math.round(dg * 1000) / 1000,
      b: Math.round(
        Math.max(...samples.map((x) => x.b)) - Math.min(...samples.map((x) => x.b)),
        3
      )
    },
    lightColorScroll: 0.028,
    maxRate: 0.12
  };
});

// Fix the buggy Math.max(~samples...) - re-do channel span in node from samples
if (lightAb.samples) {
  const bs = lightAb.samples.map((s) => s.b);
  lightAb.channelSpan.b =
    Math.round((Math.max(...bs) - Math.min(...bs)) * 1000) / 1000;
}

// --- Item 4: STAGE_BG seam ---
await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/inky-bg-still.png`
});
const bg = await page.evaluate(() => {
  const s = window.__stage;
  const bgCol = s.scene.background;
  const clear = new (window.THREE?.Color || Object)();
  // read clear via renderer
  const gl = s.renderer.getContext();
  const clearColor = {
    hex: bgCol?.getHex?.() ?? null,
    css: bgCol?.getStyle?.() ?? null
  };
  const floor = s.scene.getObjectByName?.("stage-floor") || null;
  let floorHex = null;
  s.scene.traverse((o) => {
    if (floorHex != null) return;
    if (o.isMesh && o.material?.isMeshBasicMaterial && o.name?.includes?.("floor")) {
      floorHex = o.material.color?.getHex?.() ?? null;
    }
  });
  // shell
  let shellHex = null;
  s.scene.traverse((o) => {
    if (shellHex != null) return;
    if (o.isMesh && o.material?.side === 1 && o.material?.isMeshBasicMaterial) {
      shellHex = o.material.color?.getHex?.() ?? null;
    }
  });
  return {
    expected: 0x070709,
    sceneBackground: clearColor.hex,
    floorHex,
    shellHex,
    match:
      clearColor.hex === 0x070709 &&
      (floorHex == null || floorHex === 0x070709) &&
      (shellHex == null || shellHex === 0x070709),
    gl: Boolean(gl)
  };
});

const report = {
  confirm: {
    verdict: confirmVerdict,
    withBloom,
    withoutBloom,
    note: "Manual opacity ramp with bloom gate bypassed — isolates extract"
  },
  fixVerify: {
    settledEdge: settledStats,
    bloomDuringSettled: settled.blooms.slice(-1)[0],
    deadStillOk: settledStats.residMaxFrameDelta < 1.2
  },
  popIn,
  lightAb: {
    channelSpan: lightAb.channelSpan,
    sampleCount: lightAb.samples?.length,
    drifts: (lightAb.channelSpan?.r ?? 0) + (lightAb.channelSpan?.b ?? 0) > 0.02
  },
  background: bg
};

writeFileSync(`${OUT}/fog-bloom-land-verify.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
