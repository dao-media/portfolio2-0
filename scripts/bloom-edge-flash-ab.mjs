/**
 * A/B (v2): edge vignette flash during fog opacity fade — bloom ON vs OFF.
 * Detrends the opacity ramp so residual edge pulse is the signal (not the fade itself).
 * Freezes fog noise + neon flicker/gradient for a clean read.
 *
 * Run: node scripts/bloom-edge-flash-ab.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5272;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });

async function skipIntro(page) {
  for (let i = 0; i < 120; i++) {
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
    await page.waitForTimeout(60);
  }
}

function analyzeSeries(edgeMeans, opacities) {
  const n = edgeMeans.length;
  if (n < 4) return null;
  // Detrend against measured opacity (fade envelope)
  let sO = 0;
  let sE = 0;
  let sOO = 0;
  let sOE = 0;
  for (let i = 0; i < n; i++) {
    const o = opacities[i];
    const e = edgeMeans[i];
    sO += o;
    sE += e;
    sOO += o * o;
    sOE += o * e;
  }
  const den = n * sOO - sO * sO;
  const slope = Math.abs(den) < 1e-9 ? 0 : (n * sOE - sO * sE) / den;
  const intercept = (sE - slope * sO) / n;
  const resid = edgeMeans.map((e, i) => e - (intercept + slope * opacities[i]));
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const m = avg(resid);
  const maxDev = Math.max(...resid.map((v) => Math.abs(v - m)));
  let maxFf = 0;
  for (let i = 1; i < resid.length; i++) {
    maxFf = Math.max(maxFf, Math.abs(resid[i] - resid[i - 1]));
  }
  // High-freq energy: sum of |second differences|
  let hf = 0;
  for (let i = 2; i < resid.length; i++) {
    hf += Math.abs(resid[i] - 2 * resid[i - 1] + resid[i - 2]);
  }
  return {
    edgeStart: Math.round(edgeMeans[0] * 100) / 100,
    edgeEnd: Math.round(edgeMeans[n - 1] * 100) / 100,
    residMaxDev: Math.round(maxDev * 100) / 100,
    residMaxFrameDelta: Math.round(maxFf * 100) / 100,
    residHfEnergy: Math.round(hf * 100) / 100,
    n
  };
}

async function sampleRamp(page, frames = 40) {
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
    for (let i = 0; i < n; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const op =
        window.__stage?.volumetricFog?.compositeMaterial?.uniforms?.uCompositeOpacity
          ?.value ?? window.__stage?._volFogFade ?? 0;
      opacities.push(op);
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
    return { edgeMeans, opacities };
  }, frames);
}

async function armFade(page, bloomOn) {
  return page.evaluate((wantBloom) => {
    const s = window.__stage;
    const tLand = s._introLandAt ?? null;
    const tNow = performance.now();
    // Freeze noise sources that pollute edge residuals
    s.volumetricFog?.setNoiseFrozen?.(true);
    if (s.neon) {
      s.neon._flickering = false;
      s.neon._gradientPhase = s.neon._gradientPhase || 0;
      s.neon._freezeGradient = true;
    }
    s._volFogFade = 0;
    s.volumetricFog?.setCompositeOpacity?.(0);
    s.volumetricFog?.setDensityScale?.(1);
    s.volumetricFog?.setEnabled?.(true);
    const authored = 1.2;
    s._bloomAuthored = s.post?.bloomEffect?.intensity > 0 ? s.post.bloomEffect.intensity : authored;
    s.post.bloomEffect.intensity = wantBloom ? s._bloomAuthored : 0;
    return {
      tNow,
      introComplete: Boolean(s.introComplete),
      introLandAt: tLand,
      msSinceLand: tLand != null ? Math.round(tNow - tLand) : null,
      heavyEffectsAfter: s._introHeavyEffectsAfter || 0,
      heavyGateNow:
        typeof s._shouldRunIntroHeavyEffects === "function"
          ? s._shouldRunIntroHeavyEffects()
          : null,
      bloomIntensity: s.post.bloomEffect.intensity,
      fogFade: s._volFogFade
    };
  }, bloomOn);
}

async function runPass(browser, bloomOn) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`, {
    waitUntil: "domcontentloaded"
  });
  await skipIntro(page);
  await page.waitForFunction(() => Boolean(window.__stage?.introComplete), {
    timeout: 120000
  });
  // Let natural land fade finish once, record when land happened
  await page.evaluate(() => {
    if (!window.__stage._introLandAt) {
      window.__stage._introLandAt = performance.now();
    }
  });
  await page.waitForFunction(() => (window.__stage?._volFogFade ?? 0) >= 0.999, {
    timeout: 8000
  });

  const timing = await armFade(page, bloomOn);
  const series = await sampleRamp(page, 42);
  // analyze in node
  const during = analyzeSeries(series.edgeMeans, series.opacities);

  await page.waitForFunction(() => (window.__stage?._volFogFade ?? 0) >= 0.999, {
    timeout: 8000
  });
  await page.waitForTimeout(250);
  // Settled residual (opacity flat at 1)
  const settledSeries = await sampleRamp(page, 24);
  const after = analyzeSeries(
    settledSeries.edgeMeans,
    settledSeries.opacities.map(() => 1)
  );

  await page.close();
  return { bloomOn, timing, during, after, opacityRange: {
    min: Math.min(...series.opacities),
    max: Math.max(...series.opacities)
  }};
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-bloom-ab"
});
await server.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});

const withBloom = await runPass(browser, true);
const withoutBloom = await runPass(browser, false);

const bloomPulse = withBloom.during?.residMaxFrameDelta ?? 0;
const noBloomPulse = withoutBloom.during?.residMaxFrameDelta ?? 0;
const bloomHf = withBloom.during?.residHfEnergy ?? 0;
const noBloomHf = withoutBloom.during?.residHfEnergy ?? 0;

let verdict;
if (bloomPulse > noBloomPulse * 1.6 && noBloomPulse < 1.2) {
  verdict = "BLOOM — residual edge pulse collapses with bloom off";
} else if (noBloomPulse >= 1.2 && bloomPulse <= noBloomPulse * 1.25) {
  verdict = "OPACITY — residual edge pulse remains with bloom off";
} else if (bloomHf > noBloomHf * 1.5 && noBloomHf < 4) {
  verdict = "BLOOM — high-freq edge energy collapses with bloom off";
} else {
  verdict = `COMPARE — bloom ffΔ=${bloomPulse} hf=${bloomHf} vs off ffΔ=${noBloomPulse} hf=${noBloomHf}`;
}

const report = { verdict, withBloom, withoutBloom };
writeFileSync(`${OUT}/bloom-edge-flash-ab.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
