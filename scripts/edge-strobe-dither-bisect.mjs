/**
 * Edge-strobe within-pass bisect: animated Bayer outputDither.
 *
 * Prior instruments used regional MEAN luminance. Time-shifted Bayer cancels in
 * a spatial average (mean stable while pixels flash). This script measures
 * fixed-pixel frameΔ + edge-strip temporal MAE, A/B dither on/off/time-pinned.
 *
 * Run: node scripts/edge-strobe-dither-bisect.mjs
 * Diagnosis only — no production fix.
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5282;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });
const FRAMES = 90;
const SW = 640;
const SH = 360;

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

function summarizePixelSeries(seriesByKey) {
  const out = {};
  for (const [k, vals] of Object.entries(seriesByKey)) {
    if (!vals?.length) {
      out[k] = { avg: 0, peakToPeak: 0, maxFrameDelta: 0, meanFrameDelta: 0, n: 0 };
      continue;
    }
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    let maxFf = 0;
    let sumFf = 0;
    for (let i = 1; i < vals.length; i++) {
      const d = Math.abs(vals[i] - vals[i - 1]);
      maxFf = Math.max(maxFf, d);
      sumFf += d;
    }
    out[k] = {
      avg: round3(avg),
      peakToPeak: round3(max - min),
      maxFrameDelta: round3(maxFf),
      meanFrameDelta: round3(sumFf / Math.max(1, vals.length - 1)),
      n: vals.length
    };
  }
  return out;
}

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
    await page.waitForTimeout(40);
  }
  await page.waitForFunction(() => Boolean(window.__stage?.introComplete), {
    timeout: 120000
  });
}

async function runCase(page, name) {
  // Settle + case setup
  await page.evaluate((caseName) => {
    const s = window.__stage;
    const fog = s.volumetricFog;
    const proto = Object.getPrototypeOf(s);
    if (proto?._syncBloomForFogFade) s._syncBloomForFogFade = () => {};
    s.cameraRig?.parallax?.setStrength?.(0);
    if (s.parallaxDampZones) s.parallaxDampZones.scale = 0;
    if (s.neon) {
      s.neon._flickering = false;
      s.neon._freezeGradient = true;
    }
    const st = s.cameraRig?.state;
    if (st) {
      st.thetaTarget = st.theta;
      st.heightTarget = st.height;
      st.lookAtTarget?.copy?.(st.lookAt);
      st.isZoomed = false;
    }
    s._volFogFade = 1;
    s._bloomReturnT = 1;
    fog?.setEnabled?.(true);
    fog?.setDensityScale?.(1);
    fog?.setCompositeOpacity?.(1);
    if (s.bloomEffect) s.bloomEffect.intensity = s._bloomBaseIntensity ?? 0.55;
    if (s.grainEffect) s.grainEffect.intensity = 0;

    if (fog?.__origSetTime) {
      fog.setTime = fog.__origSetTime;
      fog.__origSetTime = null;
    }

    // Default: FBM frozen via speed=0, but composite uTime live (_noiseFrozen false)
    fog._noiseFrozen = false;
    fog.marchMaterial.uniforms.uNoiseSpeed.value = 0;
    fog.marchMaterial.uniforms.uNoiseMovement.value.set(0, 0);

    if (caseName === "ditherON_timeLive") {
      fog?.setParams?.({ outputDither: 0.02 });
    } else if (caseName === "ditherOFF_timeLive") {
      fog?.setParams?.({ outputDither: 0 });
    } else if (caseName === "ditherON_timePinned") {
      fog?.setParams?.({ outputDither: 0.02 });
      const pinned = fog.compositeMaterial.uniforms.uTime.value || 1;
      fog.__origSetTime = fog.setTime.bind(fog);
      fog.setTime = (elapsed) => {
        fog.__origSetTime(elapsed);
        fog.compositeMaterial.uniforms.uTime.value = pinned;
        fog.marchMaterial.uniforms.uTime.value = pinned;
      };
    } else if (caseName === "ditherON_fogDisabled") {
      fog?.setParams?.({ outputDither: 0.02 });
      fog?.setEnabled?.(false);
      fog?.setCompositeOpacity?.(0);
    } else if (caseName === "ditherON_bloomOnly_fogOff") {
      fog?.setEnabled?.(false);
      fog?.setCompositeOpacity?.(0);
      if (s.bloomEffect) s.bloomEffect.intensity = s._bloomBaseIntensity ?? 0.55;
    }
  }, name);

  await page.waitForTimeout(300);

  // In-page rAF sampling (avoids per-frame Playwright IPC)
  const raw = await page.evaluate(
    async ({ frames, sw, sh }) => {
      const canvas = document.querySelector("canvas");
      const off = document.createElement("canvas");
      off.width = sw;
      off.height = sh;
      const ctx = off.getContext("2d", { willReadFrequently: true });
      const series = {
        edgeTop: [],
        edgeBottom: [],
        edgeLeft: [],
        edgeRight: [],
        vigTop: [],
        vigBottom: [],
        vigLeft: [],
        vigRight: [],
        center: [],
        stripMae: [],
        uTime: [],
        uOutputDither: []
      };
      let prevStrip = null;

      const sampleOnce = () => {
        ctx.drawImage(canvas, 0, 0, sw, sh);
        const data = ctx.getImageData(0, 0, sw, sh).data;
        const lumAt = (x, y) => {
          const xi = Math.max(0, Math.min(sw - 1, x | 0));
          const yi = Math.max(0, Math.min(sh - 1, y | 0));
          const i = (yi * sw + xi) * 4;
          return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        };
        const midX = (sw / 2) | 0;
        const midY = (sh / 2) | 0;
        const insetX = Math.max(2, (sw * 0.08) | 0);
        const insetY = Math.max(2, (sh * 0.08) | 0);
        series.edgeTop.push(lumAt(midX, 2));
        series.edgeBottom.push(lumAt(midX, sh - 3));
        series.edgeLeft.push(lumAt(2, midY));
        series.edgeRight.push(lumAt(sw - 3, midY));
        series.vigTop.push(lumAt(midX, insetY));
        series.vigBottom.push(lumAt(midX, sh - 1 - insetY));
        series.vigLeft.push(lumAt(insetX, midY));
        series.vigRight.push(lumAt(sw - 1 - insetX, midY));
        series.center.push(lumAt(midX, midY));

        const band = 4;
        const strip = [];
        for (let x = 0; x < sw; x += 8) {
          for (let y = 0; y < band; y++) strip.push(lumAt(x, y));
          for (let y = sh - band; y < sh; y++) strip.push(lumAt(x, y));
        }
        for (let y = band; y < sh - band; y += 8) {
          for (let x = 0; x < band; x++) strip.push(lumAt(x, y));
          for (let x = sw - band; x < sw; x++) strip.push(lumAt(x, y));
        }
        if (prevStrip && prevStrip.length === strip.length) {
          let s = 0;
          for (let i = 0; i < strip.length; i++) s += Math.abs(strip[i] - prevStrip[i]);
          series.stripMae.push(s / strip.length);
        }
        prevStrip = strip;

        const fog = window.__stage?.volumetricFog;
        series.uTime.push(fog?.compositeMaterial?.uniforms?.uTime?.value ?? null);
        series.uOutputDither.push(
          fog?.compositeMaterial?.uniforms?.uOutputDither?.value ?? null
        );
      };

      for (let i = 0; i < frames; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        sampleOnce();
      }
      return series;
    },
    { frames: FRAMES, sw: SW, sh: SH }
  );

  const pixelStats = summarizePixelSeries({
    edgeTop: raw.edgeTop,
    edgeBottom: raw.edgeBottom,
    edgeLeft: raw.edgeLeft,
    edgeRight: raw.edgeRight,
    vigTop: raw.vigTop,
    vigBottom: raw.vigBottom,
    vigLeft: raw.vigLeft,
    vigRight: raw.vigRight,
    center: raw.center
  });
  const stripMaeVals = raw.stripMae || [];
  const stripMaeAvg =
    stripMaeVals.length > 0
      ? stripMaeVals.reduce((a, b) => a + b, 0) / stripMaeVals.length
      : 0;
  const stripMaeMax = stripMaeVals.length > 0 ? Math.max(...stripMaeVals) : 0;
  const edgePixelMaxFf = Math.max(
    pixelStats.edgeTop.maxFrameDelta,
    pixelStats.edgeBottom.maxFrameDelta,
    pixelStats.edgeLeft.maxFrameDelta,
    pixelStats.edgeRight.maxFrameDelta,
    pixelStats.vigTop.maxFrameDelta,
    pixelStats.vigBottom.maxFrameDelta,
    pixelStats.vigLeft.maxFrameDelta,
    pixelStats.vigRight.maxFrameDelta
  );

  return {
    name,
    pixelStats,
    edgePixelMaxFf: round3(edgePixelMaxFf),
    stripMaeAvg: round3(stripMaeAvg),
    stripMaeMax: round3(stripMaeMax),
    uTimeDelta: round3((raw.uTime.at(-1) ?? 0) - (raw.uTime[0] ?? 0)),
    uOutputDither: raw.uOutputDither[0] ?? null,
    sample: { sw: SW, sh: SH, frames: FRAMES }
  };
}

const CASES = [
  "ditherON_timeLive",
  "ditherOFF_timeLive",
  "ditherON_timePinned",
  "ditherON_fogDisabled",
  "ditherON_bloomOnly_fogOff"
];

async function main() {
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
    logLevel: "error"
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));

  const results = [];
  for (const name of CASES) {
    console.log("CASE", name);
    await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`, {
      waitUntil: "networkidle",
      timeout: 120000
    });
    await skipIntro(page);
    await page.waitForFunction(() => Boolean(window.__stage?.volumetricFog), {
      timeout: 60000
    });
    const r = await runCase(page, name);
    console.log(
      " ",
      name,
      "edgeFf=",
      r.edgePixelMaxFf,
      "stripMae=",
      r.stripMaeAvg,
      "uTimeΔ=",
      r.uTimeDelta,
      "dither=",
      r.uOutputDither
    );
    results.push(r);
  }

  const on = results.find((r) => r.name === "ditherON_timeLive");
  const off = results.find((r) => r.name === "ditherOFF_timeLive");
  const pinned = results.find((r) => r.name === "ditherON_timePinned");
  const fogOff = results.find((r) => r.name === "ditherON_fogDisabled");

  let a_pass = "unconfirmed";
  let b_term = "see results";
  let d_fix =
    "Re-check with live neon flicker / mid-fade window if numbers stay flat.";

  if (
    on &&
    off &&
    on.edgePixelMaxFf > 0.4 &&
    off.edgePixelMaxFf < on.edgePixelMaxFf * 0.3
  ) {
    a_pass = "VolumetricFogPass (composite)";
    b_term =
      "uOutputDither × bayer4(gl_FragCoord.xy + uTime*(47,31)) — added to fog alpha and outRgb";
    d_fix =
      "Remove uTime from Bayer (spatial-only dither), or outputDither=0. Re-prove: ditherON edgePixelMaxFf → ~0 (match ditherOFF).";
  } else if (
    on &&
    pinned &&
    on.edgePixelMaxFf > 0.4 &&
    pinned.edgePixelMaxFf < on.edgePixelMaxFf * 0.3
  ) {
    a_pass = "VolumetricFogPass (composite)";
    b_term = "composite uTime phase of Bayer output dither (amp may stay on)";
    d_fix = "Pin/remove uTime from Bayer sample. Re-prove with this script.";
  } else if (
    on &&
    fogOff &&
    on.stripMaeAvg > fogOff.stripMaeAvg * 2 &&
    on.stripMaeAvg > 0.05
  ) {
    a_pass = "VolumetricFogPass (composite path present)";
    b_term = "fog composite active — stripMae drops when fog disabled; check dither vs FBM";
    d_fix = "Isolate dither with timePinned vs ditherOFF numbers above.";
  }

  const diagnosis = {
    meta: {
      symptom: "edge/vignette strobe",
      instrument: "fixed-pixel + strip temporal MAE (not regional mean)",
      whyPriorMissed:
        "Regional mean cancels Bayer crawl; setNoiseFrozen zeros composite uTime"
    },
    results,
    verdict: {
      a_pass,
      b_term,
      c_evidence: {
        ditherON_edgePixelMaxFf: on?.edgePixelMaxFf,
        ditherOFF_edgePixelMaxFf: off?.edgePixelMaxFf,
        ditherON_stripMaeAvg: on?.stripMaeAvg,
        ditherOFF_stripMaeAvg: off?.stripMaeAvg,
        ditherON_timePinned_edgePixelMaxFf: pinned?.edgePixelMaxFf,
        ditherON_fogDisabled_edgePixelMaxFf: fogOff?.edgePixelMaxFf
      },
      d_proposedFix_NOT_APPLIED: d_fix
    }
  };

  writeFileSync(`${OUT}/edge-strobe-dither-bisect.json`, JSON.stringify(diagnosis, null, 2));

  const md = `# Edge strobe — dither within-pass bisect

## (a) Pass
**${a_pass}**

## (b) Term
**${b_term}**

## (c) Evidence (fixed-pixel @ ${SW}×${SH}, ${FRAMES} frames, dead-still)

| Case | edgePixelMaxFf | stripMaeAvg | stripMaeMax | uTimeΔ | dither |
| --- | ---: | ---: | ---: | ---: | ---: |
${results
  .map(
    (r) =>
      `| ${r.name} | ${r.edgePixelMaxFf} | ${r.stripMaeAvg} | ${r.stripMaeMax} | ${r.uTimeDelta} | ${r.uOutputDither} |`
  )
  .join("\n")}

### ditherON_timeLive pixels
\`\`\`
${JSON.stringify(on?.pixelStats ?? {}, null, 2)}
\`\`\`

### ditherOFF_timeLive pixels
\`\`\`
${JSON.stringify(off?.pixelStats ?? {}, null, 2)}
\`\`\`

## (d) Proposed fix (NOT applied)
${d_fix}

## Why earlier bisects said flat
1. \`setNoiseFrozen(true)\` → \`setTime\` zeros **composite** \`uTime\` → Bayer phase frozen.
2. Regional **mean** over an edge band cancels a shifting 4×4 Bayer.
3. Edge band avg≈0 at heavy downsample hid residual.

## Proof bar
NOT fixed until \`ditherON_timeLive\`-equivalent \`edgePixelMaxFf\` / \`stripMaeAvg\` match \`ditherOFF_timeLive\` (~0). test:smoke is not proof.
`;
  writeFileSync(`${OUT}/edge-strobe-dither-diagnosis.md`, md);
  console.log(JSON.stringify(diagnosis.verdict, null, 2));
  console.log("Wrote", `${OUT}/edge-strobe-dither-diagnosis.md`);

  await browser.close();
  await server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
