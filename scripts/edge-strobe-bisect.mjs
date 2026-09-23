/**
 * Edge-vignette strobe DIAGNOSIS (read-only — no production fix).
 *
 * Instruments per-frame EDGE + center luminance, then bisects the composer
 * (RenderPass → fog → bloom → grain) and within-pass bloom/fog knobs.
 *
 * Run: node scripts/edge-strobe-bisect.mjs
 * Out:  public/debug/edge-strobe-bisect.json
 *       public/debug/edge-strobe-diagnosis.md
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5280;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });

const BAND = 14; // px border band at downsampled size
const SAMPLE_W = 320;
const SAMPLE_H = 200;

function summarizeSeries(series) {
  if (!series?.length) return null;
  const keys = Object.keys(series[0]).filter((k) => k !== "i" && k !== "meta");
  const out = {};
  for (const k of keys) {
    const vals = series.map((r) => r[k]).filter((v) => typeof v === "number");
    if (!vals.length) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    let maxFf = 0;
    let hf = 0;
    for (let i = 1; i < vals.length; i++) {
      maxFf = Math.max(maxFf, Math.abs(vals[i] - vals[i - 1]));
    }
    for (let i = 2; i < vals.length; i++) {
      hf += Math.abs(vals[i] - 2 * vals[i - 1] + vals[i - 2]);
    }
    // Peak-to-peak and residual after removing linear trend (fade envelope)
    let sX = 0;
    let sY = 0;
    let sXX = 0;
    let sXY = 0;
    const n = vals.length;
    for (let i = 0; i < n; i++) {
      sX += i;
      sY += vals[i];
      sXX += i * i;
      sXY += i * vals[i];
    }
    const den = n * sXX - sX * sX;
    const slope = Math.abs(den) < 1e-9 ? 0 : (n * sXY - sX * sY) / den;
    const intercept = (sY - slope * sX) / n;
    const resid = vals.map((v, i) => v - (intercept + slope * i));
    const rAvg = resid.reduce((a, b) => a + b, 0) / n;
    const residMaxDev = Math.max(...resid.map((v) => Math.abs(v - rAvg)));
    out[k] = {
      avg: round2(avg),
      min: round2(min),
      max: round2(max),
      peakToPeak: round2(max - min),
      maxFrameDelta: round2(maxFf),
      residMaxDev: round2(residMaxDev),
      hfEnergy: round2(hf),
      n
    };
  }
  return out;
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

function edgePulseScore(stats) {
  if (!stats) return 0;
  const edges = ["top", "bottom", "left", "right"];
  let score = 0;
  for (const e of edges) {
    if (!stats[e]) continue;
    score += stats[e].residMaxDev + stats[e].maxFrameDelta * 0.5;
  }
  return round2(score);
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

/** Freeze motion sources that pollute edge residuals (not the strobe under test). */
async function freezeMotion(page) {
  await page.evaluate(() => {
    const s = window.__stage;
    s.parallaxDampZones && (s.parallaxDampZones.scale = 0);
    s.cameraRig?.parallax?.setStrength?.(0);
    if (s.neon) {
      s.neon._flickering = false;
      s.neon._freezeGradient = true;
    }
    s.volumetricFog?.setNoiseFrozen?.(true);
    const st = s.cameraRig?.state;
    if (st) {
      st.thetaTarget = st.theta;
      st.heightTarget = st.height;
      st.lookAtTarget?.copy?.(st.lookAt);
      st.isZoomed = false;
      st.focusBlend = 0;
      st.focusBlendTarget = 0;
    }
  });
}

/** Stub fog/bloom tick so bisect configs are not overwritten each frame. */
async function freezeComposerGates(page) {
  await page.evaluate(() => {
    const s = window.__stage;
    s.__edgeBisect = true;
    s._syncBloomForFogFade = () => {};
    s._tickVolumetricFog = () => {
      const pass = s.volumetricFog;
      if (!pass || !s.introComplete) return;
      pass.setEnabled(true);
      if (s.__bisectFogOpacity != null) {
        pass.setDensityScale(1);
        pass.setCompositeOpacity(s.__bisectFogOpacity);
        s._volFogFade = s.__bisectFogOpacity;
      }
    };
  });
}

async function freezeDeadStill(page) {
  await freezeMotion(page);
  await freezeComposerGates(page);
}

async function applyComposerConfig(page, cfg) {
  await page.evaluate((c) => {
    const s = window.__stage;
    const post = s.post;
    const vol = s.volumetricFog ?? post.volumetricPass;

    s.__bisectFogOpacity = c.fog === false ? 0 : (c.fogOpacity ?? 1);

    // Pass enables
    if (vol) {
      vol.enabled = c.fog !== false;
      if (c.fog === false) {
        vol.setCompositeOpacity?.(0);
        vol.setDensityScale?.(0);
        s.__bisectFogOpacity = 0;
      } else {
        vol.setDensityScale?.(c.fogDensity ?? 1);
        vol.setCompositeOpacity?.(c.fogOpacity ?? 1);
      }
    }
    if (post.bloomPass) post.bloomPass.enabled = c.bloom !== false;
    if (post.bloomEffect) {
      post.bloomEffect.intensity =
        c.bloom === false ? 0 : (c.bloomIntensity ?? 1.2);
      if (typeof c.bloomResolutionScale === "number") {
        // BloomEffect resolutionScale is constructor-time in many versions;
        // also try runtime if present.
        try {
          post.bloomEffect.resolutionScale = c.bloomResolutionScale;
        } catch {
          /* ignore */
        }
        // Force resize path
        post.setSize?.(window.innerWidth, window.innerHeight);
      }
      if (typeof c.mipmapBlur === "boolean") {
        try {
          post.bloomEffect.mipmapBlur = c.mipmapBlur;
        } catch {
          /* ignore */
        }
      }
      if (typeof c.luminanceThreshold === "number") {
        post.bloomEffect.luminanceThreshold = c.luminanceThreshold;
      }
    }
    if (post.grainPass) post.grainPass.enabled = c.grain !== false;
    if (post.grainEffect?.uniforms) {
      const g = c.grainAmount ?? 0;
      post.grainEffect.uniforms.get("uGrain").value = g;
      post.grain = g;
    }

    // Fog half-res toggle
    if (vol && typeof c.fogHalfRes === "boolean" && vol.halfRes !== c.fogHalfRes) {
      vol.halfRes = c.fogHalfRes;
      vol.setSize?.(post._drawW || 1280, post._drawH || 800);
    }

    // Bloom soft-return simulation (optional)
    if (typeof c.forceBloomReturnT === "number") {
      s._bloomReturnT = c.forceBloomReturnT;
      post.setBloomIntensity?.(1.2 * c.forceBloomReturnT);
    }

    s._volFogFade = c.fogOpacity ?? s._volFogFade;
  }, cfg);
  await page.waitForTimeout(80);
}

/**
 * Sample edge bands + center for `frames` animation frames.
 * Returns series + optional meta (fog opacity, bloom intensity) each frame.
 */
async function sampleEdges(page, frames, label) {
  return page.evaluate(
    async ({ frames: n, band, sw, sh, label: lab }) => {
      const canvas = document.querySelector("#scene-canvas");
      const tmp = document.createElement("canvas");
      tmp.width = sw;
      tmp.height = sh;
      const ctx = tmp.getContext("2d", { willReadFrequently: true });
      const series = [];

      const meanBand = (data, w, h, mode) => {
        let s = 0;
        let c = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            let hit = false;
            if (mode === "top") hit = y < band;
            else if (mode === "bottom") hit = y >= h - band;
            else if (mode === "left") hit = x < band;
            else if (mode === "right") hit = x >= w - band;
            else if (mode === "center") {
              hit =
                x > w * 0.35 &&
                x < w * 0.65 &&
                y > h * 0.35 &&
                y < h * 0.65;
            }
            if (!hit) continue;
            const i = (y * w + x) * 4;
            s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            c += 1;
          }
        }
        return s / Math.max(c, 1);
      };

      for (let i = 0; i < n; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const s = window.__stage;
        ctx.drawImage(canvas, 0, 0, sw, sh);
        const data = ctx.getImageData(0, 0, sw, sh).data;
        const row = {
          i,
          top: meanBand(data, sw, sh, "top"),
          bottom: meanBand(data, sw, sh, "bottom"),
          left: meanBand(data, sw, sh, "left"),
          right: meanBand(data, sw, sh, "right"),
          center: meanBand(data, sw, sh, "center"),
          fogOpacity:
            s.volumetricFog?.compositeMaterial?.uniforms?.uCompositeOpacity
              ?.value ?? null,
          fogDensity:
            s.volumetricFog?.marchMaterial?.uniforms?.uDensityScale?.value ??
            null,
          bloomIntensity: s.post?.bloomEffect?.intensity ?? null,
          bloomReturnT: s._bloomReturnT ?? null,
          volFade: s._volFogFade ?? null
        };
        series.push(row);
      }
      return { label: lab, series };
    },
    { frames, band: BAND, sw: SAMPLE_W, sh: SAMPLE_H, label }
  );
}

async function rearmFogFade(page) {
  await page.evaluate(() => {
    const s = window.__stage;
    const proto = Object.getPrototypeOf(s);
    s._volFogFade = 0;
    s._bloomReturnT = 0;
    s.__bisectFogOpacity = null;
    s.volumetricFog?.setEnabled?.(true);
    s.volumetricFog?.setDensityScale?.(1);
    s.volumetricFog?.setCompositeOpacity?.(0);
    s.post?.setBloomIntensity?.(0);
    if (proto?._syncBloomForFogFade) {
      s._syncBloomForFogFade = proto._syncBloomForFogFade.bind(s);
    }
    if (proto?._tickVolumetricFog) {
      s._tickVolumetricFog = proto._tickVolumetricFog.bind(s);
    }
    s.__edgeBisect = false;
  });
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-edge-bisect"
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
await freezeMotion(page);

const report = {
  meta: {
    symptom: "edge/vignette strobe — prior fixes (step-count, composite-opacity, bloom-hold) declared via smoke/pre-bloom probes",
    bandPx: BAND,
    sample: `${SAMPLE_W}x${SAMPLE_H}`,
    skills: ["threejs-postprocessing", "threejs-debug-profiler"]
  },
  baseline: {},
  bisect: {},
  within: {},
  correlations: {},
  diagnosis: {}
};

// ─── BASELINE: full stack through natural fade + 300 settle frames ───
await rearmFogFade(page);
await freezeMotion(page);

const fadeCapture = await sampleEdges(page, 90, "baseline-through-fade");
// Wait until fade + bloom return done
await page.waitForFunction(
  () =>
    (window.__stage?._volFogFade ?? 0) >= 0.999 &&
    (window.__stage?._bloomReturnT ?? 1) >= 0.999,
  { timeout: 20000 }
);
await page.waitForTimeout(100);
const settleCapture = await sampleEdges(page, 300, "baseline-settle-300");

report.baseline = {
  throughFade: {
    stats: summarizeSeries(fadeCapture.series),
    edgePulseScore: edgePulseScore(summarizeSeries(fadeCapture.series)),
    fogOpacityRange: [
      Math.min(...fadeCapture.series.map((r) => r.fogOpacity ?? 0)),
      Math.max(...fadeCapture.series.map((r) => r.fogOpacity ?? 0))
    ],
    bloomIntensityRange: [
      Math.min(...fadeCapture.series.map((r) => r.bloomIntensity ?? 0)),
      Math.max(...fadeCapture.series.map((r) => r.bloomIntensity ?? 0))
    ]
  },
  settle300: {
    stats: summarizeSeries(settleCapture.series),
    edgePulseScore: edgePulseScore(summarizeSeries(settleCapture.series)),
    // Which edges oscillate more than center?
    edgeVsCenter: null
  }
};

{
  const st = report.baseline.settle300.stats;
  if (st) {
    const edgeMax = Math.max(
      st.top?.residMaxDev ?? 0,
      st.bottom?.residMaxDev ?? 0,
      st.left?.residMaxDev ?? 0,
      st.right?.residMaxDev ?? 0
    );
    report.baseline.settle300.edgeVsCenter = {
      edgeResidMax: edgeMax,
      centerResidMax: st.center?.residMaxDev ?? 0,
      edgeDominant: edgeMax > (st.center?.residMaxDev ?? 0) * 1.4
    };
  }
}

// ─── COMPOSER BISECT (settled fog state, controlled) ───
await freezeDeadStill(page);

const configs = [
  {
    id: "A_renderOnly",
    desc: "RenderPass only (fog off, bloom off, grain off)",
    cfg: { fog: false, bloom: false, grain: false }
  },
  {
    id: "B_fogOnly",
    desc: "+ VolumetricFogPass only (bloom off, grain off)",
    cfg: { fog: true, fogOpacity: 1, fogDensity: 1, bloom: false, grain: false }
  },
  {
    id: "C_bloomOnly",
    desc: "+ BloomEffect only (fog off, grain off)",
    cfg: { fog: false, bloom: true, bloomIntensity: 1.2, grain: false }
  },
  {
    id: "D_fogBloom",
    desc: "fog + bloom (grain off) — production stack minus grain",
    cfg: {
      fog: true,
      fogOpacity: 1,
      fogDensity: 1,
      bloom: true,
      bloomIntensity: 1.2,
      grain: false
    }
  },
  {
    id: "E_full",
    desc: "full stack fog+bloom+grainPass (grain amount 0)",
    cfg: {
      fog: true,
      fogOpacity: 1,
      fogDensity: 1,
      bloom: true,
      bloomIntensity: 1.2,
      grain: true,
      grainAmount: 0
    }
  },
  {
    id: "F_grainForced",
    desc: "full + grain amount 0.08 (does grain pass introduce edge pulse?)",
    cfg: {
      fog: true,
      fogOpacity: 1,
      fogDensity: 1,
      bloom: true,
      bloomIntensity: 1.2,
      grain: true,
      grainAmount: 0.08
    }
  }
];

for (const step of configs) {
  await applyComposerConfig(page, step.cfg);
  const cap = await sampleEdges(page, 120, step.id);
  const stats = summarizeSeries(cap.series);
  report.bisect[step.id] = {
    desc: step.desc,
    cfg: step.cfg,
    stats,
    edgePulseScore: edgePulseScore(stats),
    seriesHead: cap.series.slice(0, 3),
    seriesTail: cap.series.slice(-3)
  };
}

// Find which addition first creates oscillation
{
  const score = (id) => report.bisect[id]?.edgePulseScore ?? 0;
  const a = score("A_renderOnly");
  const b = score("B_fogOnly");
  const c = score("C_bloomOnly");
  const d = score("D_fogBloom");
  const e = score("E_full");
  const f = score("F_grainForced");
  const threshold = Math.max(0.35, a * 2.5);

  let namedPass = "INCONCLUSIVE";
  let reason = "";
  if (a >= threshold) {
    namedPass = "scene / RenderPass (pre-post)";
    reason = `RenderPass-only already pulses (score ${a})`;
  } else if (b >= threshold && b > a * 1.8) {
    namedPass = "VolumetricFogPass";
    reason = `Fog-only score ${b} vs render-only ${a}`;
  } else if (c >= threshold && c > a * 1.8) {
    namedPass = "BloomEffect / bloomPass";
    reason = `Bloom-only score ${c} vs render-only ${a}`;
  } else if (d >= threshold && d > Math.max(b, c, a) * 1.3) {
    namedPass = "VolumetricFogPass × BloomEffect interaction";
    reason = `Fog+bloom score ${d} exceeds singles (fog ${b}, bloom ${c}, render ${a})`;
  } else if (e > d * 1.5 && e >= threshold) {
    namedPass = "FilmGrainEffect pass (even at amount 0?)";
    reason = `Full stack ${e} vs fog+bloom ${d}`;
  } else if (f > e * 1.5) {
    namedPass = "FilmGrainEffect (grain amount)";
    reason = `Forced grain ${f} vs full ${e}`;
  } else {
    // Pick highest among B/C/D
    const ranked = [
      ["B_fogOnly", b],
      ["C_bloomOnly", c],
      ["D_fogBloom", d],
      ["E_full", e]
    ].sort((x, y) => y[1] - x[1]);
    namedPass = ranked[0][0];
    reason = `Highest pulse score among settled configs: ${ranked
      .map(([id, sc]) => `${id}=${sc}`)
      .join(", ")}`;
  }
  report.bisect.verdict = { namedPass, reason, scores: { a, b, c, d, e, f }, threshold };
}

// ─── WITHIN-PASS BISECT ───
await applyComposerConfig(page, {
  fog: true,
  fogOpacity: 1,
  fogDensity: 1,
  bloom: true,
  bloomIntensity: 1.2,
  grain: false
});

const withinTests = [
  {
    id: "bloom_resScale_1",
    desc: "bloom resolutionScale → 1.0 (full-res extract)",
    cfg: {
      fog: true,
      fogOpacity: 1,
      bloom: true,
      bloomIntensity: 1.2,
      bloomResolutionScale: 1.0,
      grain: false
    }
  },
  {
    id: "bloom_resScale_0_5",
    desc: "bloom resolutionScale 0.5 (authored)",
    cfg: {
      fog: true,
      fogOpacity: 1,
      bloom: true,
      bloomIntensity: 1.2,
      bloomResolutionScale: 0.5,
      grain: false
    }
  },
  {
    id: "bloom_mipmap_true",
    desc: "bloom mipmapBlur true (§20.9e known intermittent)",
    cfg: {
      fog: true,
      fogOpacity: 1,
      bloom: true,
      bloomIntensity: 1.2,
      mipmapBlur: true,
      grain: false
    }
  },
  {
    id: "bloom_mipmap_false",
    desc: "bloom mipmapBlur false (authored)",
    cfg: {
      fog: true,
      fogOpacity: 1,
      bloom: true,
      bloomIntensity: 1.2,
      mipmapBlur: false,
      grain: false
    }
  },
  {
    id: "bloom_threshold_2",
    desc: "bloom luminanceThreshold 2.0 (nothing extracts)",
    cfg: {
      fog: true,
      fogOpacity: 1,
      bloom: true,
      bloomIntensity: 1.2,
      luminanceThreshold: 2.0,
      grain: false
    }
  },
  {
    id: "bloom_threshold_1",
    desc: "bloom luminanceThreshold 1.0 (authored)",
    cfg: {
      fog: true,
      fogOpacity: 1,
      bloom: true,
      bloomIntensity: 1.2,
      luminanceThreshold: 1.0,
      grain: false
    }
  },
  {
    id: "fog_halfRes_false",
    desc: "fog halfRes false (full-res march RT)",
    cfg: {
      fog: true,
      fogOpacity: 1,
      fogHalfRes: false,
      bloom: true,
      bloomIntensity: 1.2,
      grain: false
    }
  },
  {
    id: "fog_halfRes_true",
    desc: "fog halfRes true (authored)",
    cfg: {
      fog: true,
      fogOpacity: 1,
      fogHalfRes: true,
      bloom: true,
      bloomIntensity: 1.2,
      grain: false
    }
  },
  {
    id: "fog_opacity_0_bloom_on",
    desc: "fog opacity 0 + bloom on (is bloom alone enough at settle?)",
    cfg: {
      fog: true,
      fogOpacity: 0,
      fogDensity: 1,
      bloom: true,
      bloomIntensity: 1.2,
      grain: false
    }
  },
  {
    id: "bloom_softReturn_ramp",
    desc: "simulate bloom soft-return 0→1 over samples (does release pulse edges?)",
    special: "bloomReturn"
  }
];

for (const t of withinTests) {
  if (t.special === "bloomReturn") {
    await applyComposerConfig(page, {
      fog: true,
      fogOpacity: 1,
      bloom: true,
      bloomIntensity: 0,
      grain: false
    });
    const series = [];
    for (let i = 0; i < 48; i++) {
      const tRet = Math.min(1, i / 36);
      await page.evaluate((tr) => {
        window.__stage.post.setBloomIntensity(1.2 * tr);
        window.__stage._bloomReturnT = tr;
      }, tRet);
      const one = await sampleEdges(page, 1, `bloomRet-${i}`);
      series.push({ ...one.series[0], bloomReturnT: tRet });
    }
    const stats = summarizeSeries(series);
    report.within[t.id] = {
      desc: t.desc,
      stats,
      edgePulseScore: edgePulseScore(stats),
      note: "Monotonic bloom restore — residMaxDev after detrend is the pulse signal"
    };
    continue;
  }
  await applyComposerConfig(page, t.cfg);
  const cap = await sampleEdges(page, 100, t.id);
  const stats = summarizeSeries(cap.series);
  report.within[t.id] = {
    desc: t.desc,
    cfg: t.cfg,
    stats,
    edgePulseScore: edgePulseScore(stats)
  };
}

// ─── EDGE DEPTH / FOG CORRELATION ───
const depthProbe = await page.evaluate(async () => {
  const s = window.__stage;
  const vol = s.volumetricFog;
  const cam = s.camera;
  // Sample fog depth texture if available — packed depth at corners vs center
  const dc = s.neon?.depthCapture;
  if (!dc?.depthTexture || !s.renderer) {
    return { err: "no-depth-capture" };
  }
  // Read via a tiny probe: use fog uniforms near/far + report camera
  return {
    cameraNear: cam.near,
    cameraFar: cam.far,
    fogHalfRes: Boolean(vol?.halfRes),
    fogEnabled: Boolean(vol?.enabled),
    fogOpacity: vol?.compositeMaterial?.uniforms?.uCompositeOpacity?.value,
    bloomResScale: s.post?.bloomEffect?.resolutionScale ?? null,
    bloomMipmap: s.post?.bloomEffect?.mipmapBlur ?? null,
    bloomThreshold: s.post?.bloomEffect?.luminanceThreshold ?? null,
    bloomIntensity: s.post?.bloomEffect?.intensity ?? null,
    note: "Screen edges with no geometry → depth≈far → full ray length in fog march"
  };
});
report.correlations.depthProbe = depthProbe;

// Correlate settle series: does edge pulse track bloom intensity or fog opacity?
{
  const ser = settleCapture.series;
  const corr = (a, b) => {
    const n = Math.min(a.length, b.length);
    let sa = 0;
    let sb = 0;
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let i = 0; i < n; i++) {
      sa += a[i];
      sb += b[i];
    }
    sa /= n;
    sb /= n;
    for (let i = 0; i < n; i++) {
      const da = a[i] - sa;
      const db = b[i] - sb;
      sab += da * db;
      saa += da * da;
      sbb += db * db;
    }
    const d = Math.sqrt(saa * sbb);
    return d < 1e-9 ? 0 : sab / d;
  };
  const edgeMean = ser.map(
    (r) => (r.top + r.bottom + r.left + r.right) / 4
  );
  const blooms = ser.map((r) => r.bloomIntensity ?? 0);
  const fogs = ser.map((r) => r.fogOpacity ?? 0);
  report.correlations.settle = {
    edgeVsBloom: round2(corr(edgeMean, blooms)),
    edgeVsFogOpacity: round2(corr(edgeMean, fogs)),
    note: "After settle both bloom+fog should be flat — high corr only if still ramping"
  };
}

// ─── DIAGNOSIS ───
const v = report.bisect.verdict;
const baseSettle = report.baseline.settle300;
const within = report.within;

let exactTerm = "unknown";
let proposedFix = "TBD after approval";

const w = (id) => within[id]?.edgePulseScore ?? null;
if (String(v.namedPass).includes("Bloom") || v.namedPass === "C_bloomOnly") {
  const res05 = w("bloom_resScale_0_5");
  const res10 = w("bloom_resScale_1");
  const thr1 = w("bloom_threshold_1");
  const thr2 = w("bloom_threshold_2");
  const mipT = w("bloom_mipmap_true");
  const mipF = w("bloom_mipmap_false");
  if (thr2 != null && thr1 != null && thr2 < thr1 * 0.5) {
    exactTerm =
      "BloomEffect luminance extract (luminanceThreshold crossing / soft knee at borders)";
    proposedFix =
      "Keep fog/emissive under threshold at edges, or raise threshold carefully, or mask bloom at frame border; do not declare fixed without flat edge residMaxDev";
  } else if (res10 != null && res05 != null && res10 < res05 * 0.65) {
    exactTerm =
      "BloomEffect.resolutionScale 0.5 (half-res luminance/blur → coarse edge sampling)";
    proposedFix =
      "Try NEON_BLOOM.resolutionScale 1.0 (or 0.66) and re-measure edge residMaxDev → ~0";
  } else if (mipT != null && mipF != null && mipT > mipF * 1.5) {
    exactTerm =
      "BloomEffect.mipmapBlur (Kawase) intermittent edge/black frames (§20.9e)";
    proposedFix =
      "Keep mipmapBlur: false; if already false, look at kernel border handling";
  } else {
    exactTerm =
      "BloomEffect (intensity/kernel contribution at frame border) — see within scores";
    proposedFix =
      "Bisect further: intensity 0 vs radius; compare KernelSize; edge-safe bloom";
  }
} else if (String(v.namedPass).includes("Fog") || v.namedPass === "B_fogOnly") {
  const hT = w("fog_halfRes_true");
  const hF = w("fog_halfRes_false");
  if (hF != null && hT != null && hF < hT * 0.65) {
    exactTerm =
      "VolumetricFogPass halfRes march/composite (edge pixels → far depth → full ray)";
    proposedFix =
      "Full-res fog RT, or clamp max ray length when depth≈far at screen edges, or stabilize step count at far depth";
  } else {
    exactTerm =
      "VolumetricFogPass composite/in-scatter at screen-edge far-depth rays";
    proposedFix =
      "Instrument per-pixel ray length at borders; stabilize far-depth path; do not only fade opacity";
  }
} else if (String(v.namedPass).includes("interaction")) {
  exactTerm =
    "Fog luminance fed into BloomEffect extract at half-res borders (fog×bloom)";
  proposedFix =
    "Either keep fog fill under bloom threshold at edges, full-res bloom, or composite fog after bloom (pipeline change — needs approval)";
} else if (String(v.namedPass).includes("Grain")) {
  exactTerm = "FilmGrainEffect (uTime-driven rand even if unexpected)";
  proposedFix = "Disable grainPass entirely when amount is 0, or freeze uTime";
} else if (String(v.namedPass).includes("RenderPass")) {
  exactTerm = "Scene-side (neon flicker / parallax / material) — pre-composer";
  proposedFix = "Freeze neon+parallax already in probe; dig mesh/emissive animation";
}

report.diagnosis = {
  a_exactPass: v.namedPass,
  b_exactTerm: exactTerm,
  c_evidence: {
    baselineSettleEdgePulseScore: baseSettle.edgePulseScore,
    baselineSettleStats: baseSettle.stats,
    baselineEdgeVsCenter: baseSettle.edgeVsCenter,
    throughFadeEdgePulseScore: report.baseline.throughFade.edgePulseScore,
    bisectScores: v.scores,
    withinScores: Object.fromEntries(
      Object.entries(within).map(([k, val]) => [k, val.edgePulseScore])
    )
  },
  d_proposedFix: proposedFix,
  proofRequirement:
    "A fix is ONLY proven when settle300 edge residMaxDev / edgePulseScore goes flat (±~0) under THIS same instrument. test:smoke is NOT proof.",
  noFixShipped: true
};

// Human-readable diagnosis markdown
const md = `# Edge-vignette strobe — diagnosis (no fix shipped)

**Date:** ${new Date().toISOString()}
**Skills:** threejs-postprocessing, threejs-debug-profiler

## Symptom
Screen-edge / vignette strobe. Survived step-count, composite-opacity, and bloom-hold fixes — those were validated with smoke or pre-bloom probes that cannot see this.

## (a) Exact pass
**${report.diagnosis.a_exactPass}**

Reason: ${v.reason}

## (b) Exact term / uniform
**${report.diagnosis.b_exactTerm}**

## (c) Edge-luminance evidence

### Baseline through fade (90 frames)
- edgePulseScore: **${report.baseline.throughFade.edgePulseScore}**
- fog opacity range: ${JSON.stringify(report.baseline.throughFade.fogOpacityRange)}
- bloom intensity range: ${JSON.stringify(report.baseline.throughFade.bloomIntensityRange)}
- stats: \`\`\`${JSON.stringify(report.baseline.throughFade.stats)}\`\`\`

### Baseline settle 300 frames (dead-still) — THE NUMBER
- edgePulseScore: **${baseSettle.edgePulseScore}**
- edge vs center: ${JSON.stringify(baseSettle.edgeVsCenter)}
- per-region residMaxDev / maxFrameDelta:
\`\`\`
${JSON.stringify(baseSettle.stats, null, 2)}
\`\`\`

### Composer bisect edgePulseScores
| Config | Score |
| --- | ---: |
${configs.map((c) => `| ${c.id} | ${report.bisect[c.id]?.edgePulseScore} |`).join("\n")}

### Within-pass edgePulseScores
| Test | Score |
| --- | ---: |
${Object.entries(within)
  .map(([k, val]) => `| ${k} | ${val.edgePulseScore} |`)
  .join("\n")}

## (d) Proposed fix (NOT applied — awaiting approval)
${report.diagnosis.d_proposedFix}

## Proof bar for any future fix
Re-run this script. Settle-300 **edgePulseScore / residMaxDev must go flat (±~0)**. Paste before+after. Smoke alone is insufficient.

## Raw JSON
\`public/debug/edge-strobe-bisect.json\`
`;

writeFileSync(`${OUT}/edge-strobe-bisect.json`, JSON.stringify(report, null, 2));
writeFileSync(`${OUT}/edge-strobe-diagnosis.md`, md);
console.log(md);
console.log("\n--- JSON written to public/debug/edge-strobe-bisect.json ---");

await browser.close();
await server.close();
