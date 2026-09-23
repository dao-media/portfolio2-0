/**
 * Follow-up: edge strobe with fog noise UNFROZEN (prior bisect froze noise and
 * measured flat settle — likely masked the bug).
 *
 * Run: node scripts/edge-strobe-noise-bisect.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5281;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });
const BAND = 14;
const SW = 320;
const SH = 200;

function round2(x) {
  return Math.round(x * 100) / 100;
}

function summarize(series) {
  const keys = ["top", "bottom", "left", "right", "center"];
  const out = {};
  for (const k of keys) {
    const vals = series.map((r) => r[k]);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    let maxFf = 0;
    let hf = 0;
    for (let i = 1; i < vals.length; i++) maxFf = Math.max(maxFf, Math.abs(vals[i] - vals[i - 1]));
    for (let i = 2; i < vals.length; i++) hf += Math.abs(vals[i] - 2 * vals[i - 1] + vals[i - 2]);
    out[k] = {
      avg: round2(avg),
      peakToPeak: round2(max - min),
      maxFrameDelta: round2(maxFf),
      hfEnergy: round2(hf),
      n: vals.length
    };
  }
  const edgeScore =
    (out.top.maxFrameDelta +
      out.bottom.maxFrameDelta +
      out.left.maxFrameDelta +
      out.right.maxFrameDelta) /
    4;
  return { regions: out, edgeMaxFfAvg: round2(edgeScore), centerMaxFf: out.center.maxFrameDelta };
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

async function prep(page, { noiseFrozen, parallax, fog, bloom }) {
  await page.evaluate((o) => {
    const s = window.__stage;
    const proto = Object.getPrototypeOf(s);
    // Restore real fog tick once, then optionally stub bloom rewrite
    if (proto?._tickVolumetricFog) s._tickVolumetricFog = proto._tickVolumetricFog.bind(s);
    if (proto?._syncBloomForFogFade) s._syncBloomForFogFade = () => {};

    s.cameraRig?.parallax?.setStrength?.(o.parallax ? 1 : 0);
    if (s.parallaxDampZones) s.parallaxDampZones.scale = o.parallax ? 1 : 0;
    if (s.neon) {
      s.neon._flickering = false;
      s.neon._freezeGradient = true;
    }
    s.volumetricFog?.setNoiseFrozen?.(o.noiseFrozen);
    const st = s.cameraRig?.state;
    if (st) {
      st.thetaTarget = st.theta;
      st.heightTarget = st.height;
      st.lookAtTarget?.copy?.(st.lookAt);
      st.isZoomed = false;
    }
    // Hold fog settled
    s._volFogFade = 1;
    s._bloomReturnT = 1;
    s.volumetricFog?.setEnabled?.(o.fog);
    s.volumetricFog?.setDensityScale?.(o.fog ? 1 : 0);
    s.volumetricFog?.setCompositeOpacity?.(o.fog ? 1 : 0);
    if (s.post?.bloomPass) s.post.bloomPass.enabled = o.bloom;
    s.post?.setBloomIntensity?.(o.bloom ? 1.2 : 0);
    if (s.post?.grainPass) s.post.grainPass.enabled = false;

    // Stub tick so it doesn't fight — but keep uTime advancing for noise when unfrozen
    s._tickVolumetricFog = (dt) => {
      const pass = s.volumetricFog;
      if (!pass) return;
      pass.setEnabled(o.fog);
      if (o.fog) {
        pass.setDensityScale(1);
        pass.setCompositeOpacity(1);
      } else {
        pass.setDensityScale(0);
        pass.setCompositeOpacity(0);
      }
      // time still set in post.render from clock
    };
  }, { noiseFrozen, parallax, fog, bloom });
  await page.waitForTimeout(100);
}

async function sample(page, frames) {
  return page.evaluate(
    async ({ n, band, sw, sh }) => {
      const canvas = document.querySelector("#scene-canvas");
      const tmp = document.createElement("canvas");
      tmp.width = sw;
      tmp.height = sh;
      const ctx = tmp.getContext("2d", { willReadFrequently: true });
      const series = [];
      const mean = (data, w, h, mode) => {
        let s = 0;
        let c = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            let hit = false;
            if (mode === "top") hit = y < band;
            else if (mode === "bottom") hit = y >= h - band;
            else if (mode === "left") hit = x < band;
            else if (mode === "right") hit = x >= w - band;
            else
              hit =
                x > w * 0.35 && x < w * 0.65 && y > h * 0.35 && y < h * 0.65;
            if (!hit) continue;
            const i = (y * w + x) * 4;
            s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            c++;
          }
        }
        return s / Math.max(c, 1);
      };
      for (let i = 0; i < n; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const s = window.__stage;
        // Drive fog time explicitly so noise animates when unfrozen
        s.volumetricFog?.setTime?.(s.clock?.elapsedTime ?? i / 60);
        ctx.drawImage(canvas, 0, 0, sw, sh);
        const data = ctx.getImageData(0, 0, sw, sh).data;
        series.push({
          i,
          top: mean(data, sw, sh, "top"),
          bottom: mean(data, sw, sh, "bottom"),
          left: mean(data, sw, sh, "left"),
          right: mean(data, sw, sh, "right"),
          center: mean(data, sw, sh, "center"),
          fogTime: s.volumetricFog?.marchMaterial?.uniforms?.uTime?.value ?? null,
          noiseFrozen: Boolean(s.volumetricFog?._noiseFrozen)
        });
      }
      return series;
    },
    { n: frames, band: BAND, sw: SW, sh: SH }
  );
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-edge-noise"
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
await page.waitForFunction(() => (window.__stage?._volFogFade ?? 0) >= 0.999, {
  timeout: 20000
});
await page.waitForTimeout(500);

const cases = [
  { id: "noiseFrozen_fogBloom", noiseFrozen: true, parallax: false, fog: true, bloom: true },
  { id: "noiseLive_fogBloom", noiseFrozen: false, parallax: false, fog: true, bloom: true },
  { id: "noiseLive_fogOnly", noiseFrozen: false, parallax: false, fog: true, bloom: false },
  { id: "noiseLive_bloomOnly", noiseFrozen: false, parallax: false, fog: false, bloom: true },
  { id: "noiseLive_renderOnly", noiseFrozen: false, parallax: false, fog: false, bloom: false },
  { id: "noiseLive_fogBloom_parallax", noiseFrozen: false, parallax: true, fog: true, bloom: true },
  { id: "noiseFrozen_fogOnly", noiseFrozen: true, parallax: false, fog: true, bloom: false }
];

const results = {};
for (const c of cases) {
  await prep(page, c);
  const series = await sample(page, 180);
  results[c.id] = { ...c, ...summarize(series), sample: series.slice(0, 5) };
}

// Rank by edge frame-delta
const ranked = Object.entries(results)
  .map(([id, r]) => ({ id, edgeMaxFfAvg: r.edgeMaxFfAvg, centerMaxFf: r.centerMaxFf, regions: r.regions }))
  .sort((a, b) => b.edgeMaxFfAvg - a.edgeMaxFfAvg);

const live = results.noiseLive_fogBloom;
const frozen = results.noiseFrozen_fogBloom;
const fogOnly = results.noiseLive_fogOnly;
const bloomOnly = results.noiseLive_bloomOnly;
const renderOnly = results.noiseLive_renderOnly;

let namedPass = "INCONCLUSIVE";
let term = "unknown";
let fix = "";

if (
  live.edgeMaxFfAvg > frozen.edgeMaxFfAvg * 3 &&
  live.edgeMaxFfAvg > 0.05
) {
  // Noise unfreeze causes edge oscillation
  if (fogOnly.edgeMaxFfAvg >= live.edgeMaxFfAvg * 0.7 && bloomOnly.edgeMaxFfAvg < live.edgeMaxFfAvg * 0.4) {
    namedPass = "VolumetricFogPass";
    term =
      "fog noise / uTime-driven density (setNoiseFrozen false) evaluated on screen-edge far-depth rays (halfRes march)";
    fix =
      "Stabilize far-depth rays (clamp ray length when depth≈far), or freeze/slow edge-pixel noise, or full-res fog at borders — awaiting approval";
  } else if (bloomOnly.edgeMaxFfAvg >= live.edgeMaxFfAvg * 0.7) {
    namedPass = "BloomEffect";
    term = "bloom extracting time-varying fog/noise luminance at half-res borders";
    fix = "Keep edge fog under threshold, or full-res bloom, or composite fog after bloom — awaiting approval";
  } else if (
    live.edgeMaxFfAvg > Math.max(fogOnly.edgeMaxFfAvg, bloomOnly.edgeMaxFfAvg) * 1.3
  ) {
    namedPass = "VolumetricFogPass × BloomEffect interaction";
    term = "fog noise luminance → BloomEffect half-res extract at frame borders";
    fix =
      "Break the coupling: fog after bloom, or suppress bloom on fog-only luminance, or stabilize fog noise at far depth — awaiting approval";
  } else {
    namedPass = ranked[0].id;
    term = "see ranked scores — noise-live is required to reproduce";
    fix = "Re-check ranked table";
  }
} else if (results.noiseLive_fogBloom_parallax.edgeMaxFfAvg > live.edgeMaxFfAvg * 2) {
  namedPass = "parallax → screen-space term";
  term = "camera micro-offset feeding edge sampling (parallax)";
  fix = "Gate parallax during settle / damp radial screen terms — awaiting approval";
} else if (live.edgeMaxFfAvg < 0.05 && frozen.edgeMaxFfAvg < 0.05) {
  namedPass = "NOT REPRODUCED under dead-still lab conditions";
  term =
    "With frozen neon+gradient and settled fog/bloom, edge maxFrameDelta ≈ 0 even with live fog noise in this run — strobe may require live neon flicker, cursor motion, or a different timing window (during bloom soft-return / heavy-effects arm)";
  fix =
    "Next probe: (1) during bloom soft-return only, noise live; (2) neon flicker enabled; (3) sample at native canvas resolution without downsample. Do not claim fixed.";
}

const diagnosis = {
  a_exactPass: namedPass,
  b_exactTerm: term,
  c_evidence: {
    ranked,
    liveVsFrozen: {
      liveEdgeFf: live.edgeMaxFfAvg,
      frozenEdgeFf: frozen.edgeMaxFfAvg,
      liveRegions: live.regions,
      frozenRegions: frozen.regions
    },
    fogOnlyEdgeFf: fogOnly.edgeMaxFfAvg,
    bloomOnlyEdgeFf: bloomOnly.edgeMaxFfAvg,
    renderOnlyEdgeFf: renderOnly.edgeMaxFfAvg
  },
  d_proposedFix: fix,
  noFixShipped: true,
  priorBisectNote:
    "edge-strobe-bisect.mjs froze fog noise and measured settle edgePulseScore=0 — that masked noise-driven edge flicker"
};

const md = `# Edge strobe — noise-unfrozen follow-up

## (a) Pass
**${namedPass}**

## (b) Term
**${term}**

## (c) Evidence (180 frames each, dead-still camera)

| Case | edge maxFf avg | center maxFf |
| --- | ---: | ---: |
${ranked.map((r) => `| ${r.id} | ${r.edgeMaxFfAvg} | ${r.centerMaxFf} |`).join("\n")}

Live fog+bloom regions:
\`\`\`
${JSON.stringify(live.regions, null, 2)}
\`\`\`

Frozen fog+bloom regions:
\`\`\`
${JSON.stringify(frozen.regions, null, 2)}
\`\`\`

## (d) Proposed fix (NOT applied)
${fix}

## Proof bar
Future fix must drive **noiseLive_fogBloom** edge maxFf → ~0 under this same script.
`;

writeFileSync(`${OUT}/edge-strobe-noise-bisect.json`, JSON.stringify({ results, diagnosis }, null, 2));
writeFileSync(`${OUT}/edge-strobe-noise-diagnosis.md`, md);
console.log(md);

await browser.close();
await server.close();
