/**
 * GATE 4 step 4 — post-land frame-budget cost matrix A/B/C/D.
 *
 * ANGLE / software Playwright (`--use-gl=angle --ignore-gpu-blocklist`) is a
 * RELATIVE regression gate only (fog-on vs fog-off delta; catch sub-1fps reopen).
 * It is NOT a mid-GPU absolute verdict. Absolute mid-hardware check is MANUAL
 * on real integrated GPU / low-power emulation — report separately.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5176;
const BOOT_MS = 120_000;
const SETTLE_MS = 3500;
const SAMPLE_MS = 4000;
const SAMPLES_PER_CASE = 4;

const CASES = [
  { id: "A", label: "fog off, full quality" },
  { id: "B", label: "fog on, 16 steps, halfRes, full quality" },
  { id: "C", label: "fog on, setWorkQuality(0.6), steps ~12" },
  { id: "D", label: "fog on, coarse (8 steps, halfRes) @ work 0.6" }
];

function summarizeBudget(budget) {
  if (!budget) return null;
  return {
    worst: budget.worst?.[0]?.dtMs ?? null,
    slowCount: budget.slowCount ?? 0
  };
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false }
});
await server.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () =>
    Boolean(
      window.__stage?.introComplete &&
        !window.__stage?.locked &&
        window.__stage?.volumetricFog &&
        window.__stage?.setVolumetricEnabled
    ),
  { timeout: BOOT_MS }
);

await page.waitForTimeout(SETTLE_MS + 2500);

const results = [];
for (const c of CASES) {
  const setup = await page.evaluate((id) => {
    const stage = window.__stage;
    const map = {
      A: () => {
        stage.setWorkQuality(false);
        stage.setVolumetricEnabled(false);
        return stage.debugVolumetricFog();
      },
      B: () => {
        stage.setWorkQuality(false);
        stage.setVolumetricEnabled(true);
        stage.setVolumetricParams({ halfRes: true, baseRaymarchStepCount: 16 });
        return stage.debugVolumetricFog();
      },
      C: () => {
        stage.setWorkQuality(0.6);
        stage.setVolumetricEnabled(true);
        stage.setVolumetricParams({ halfRes: true, baseRaymarchStepCount: 12 });
        return stage.debugVolumetricFog();
      },
      D: () => {
        stage.setWorkQuality(0.6);
        stage.setVolumetricEnabled(true);
        stage.setVolumetricParams({ halfRes: true, baseRaymarchStepCount: 8 });
        return stage.debugVolumetricFog();
      }
    };
    return map[id]();
  }, c.id);

  await page.evaluate(() => {
    const stage = window.__stage;
    stage.frameBudget?.reset?.();
    if (stage._costSample?.raf) cancelAnimationFrame(stage._costSample.raf);
    stage._costSample = { n: 0, sumMs: 0, maxMs: 0, lastT: performance.now() };
    const tick = (t) => {
      const s = stage._costSample;
      if (!s) return;
      const dt = t - s.lastT;
      s.lastT = t;
      if (dt > 0 && dt < 250) {
        s.n += 1;
        s.sumMs += dt;
        if (dt > s.maxMs) s.maxMs = dt;
      }
      s.raf = requestAnimationFrame(tick);
    };
    stage._costSample.raf = requestAnimationFrame(tick);
  });
  await page.waitForTimeout(800);

  const samples = [];
  for (let i = 0; i < SAMPLES_PER_CASE; i += 1) {
    await page.waitForTimeout(SAMPLE_MS);
    const snap = await page.evaluate(() => {
      const stage = window.__stage;
      const s = stage._costSample;
      return {
        t: performance.now(),
        work: stage.debugWorkQuality?.() ?? null,
        volumetric: stage.debugVolumetricFog?.() ?? null,
        budget: stage.debugFrameBudget?.() ?? null,
        meanFrameMs: s && s.n ? s.sumMs / s.n : null,
        maxFrameMs: s?.maxMs ?? null,
        frameSamples: s?.n ?? 0
      };
    });
    samples.push(snap);
    console.log(
      `case ${c.id} sample ${i} mean=${snap.meanFrameMs?.toFixed?.(1)} maxF=${snap.maxFrameMs?.toFixed?.(1)} worstSlow=${snap.budget?.worst?.[0]?.dtMs ?? 0} fog=${snap.volumetric?.enabled}`
    );
  }

  await page.evaluate(() => {
    const stage = window.__stage;
    if (stage._costSample?.raf) cancelAnimationFrame(stage._costSample.raf);
    stage._costSample = null;
  });

  const lasts = samples.map((s) => summarizeBudget(s.budget)).filter(Boolean);
  const worstMs = Math.max(...lasts.map((s) => s.worst ?? 0), 0);
  const slowMax = Math.max(...lasts.map((s) => s.slowCount ?? 0), 0);
  const last = samples[samples.length - 1];
  results.push({
    id: c.id,
    label: c.label,
    setup,
    worstMs,
    slowMax,
    meanFrameMs: last?.meanFrameMs ?? null,
    maxFrameMs: last?.maxFrameMs ?? null,
    samples
  });
}

const byId = Object.fromEntries(results.map((r) => [r.id, r]));
const meanDelta = (id) =>
  byId[id]?.meanFrameMs != null && byId.A?.meanFrameMs != null
    ? byId[id].meanFrameMs - byId.A.meanFrameMs
    : null;

const report = {
  gate: "GATE4-step4-cost-matrix",
  path: "ANGLE/software Playwright — RELATIVE regression only",
  notAbsolute:
    "Do not treat these ms/fps as mid-GPU absolute. Manual integrated-GPU / low-power check required before merge.",
  cases: results.map(({ id, label, setup, worstMs, slowMax, meanFrameMs, maxFrameMs }) => ({
    id,
    label,
    setup,
    meanFrameMs,
    maxFrameMs,
    worstSlowMs: worstMs,
    slowMax
  })),
  deltasVsA: {
    B_minus_A_meanMs: meanDelta("B"),
    C_minus_A_meanMs: meanDelta("C"),
    D_minus_A_meanMs: meanDelta("D"),
    B_minus_A_worstSlowMs: (byId.B?.worstMs ?? 0) - (byId.A?.worstMs ?? 0),
    note: "Prefer meanFrameMs deltas. worstSlowMs only counts frames ≥48 ms (frameBudget)."
  },
  regressionHints: {
    sub1fpsReopen: results.some((r) => (r.maxFrameMs ?? 0) >= 1000 || (r.worstMs ?? 0) >= 1000),
    note: "Compare B−A mean to prior baselines; ANGLE understates fill/ALU vs real silicon."
  },
  manualHardwareCheck: {
    status: "PENDING_USER",
    instruction:
      "On real integrated GPU (or Chrome low-power / battery emulation), load / with fog B settings and record steady rest fps + worst frame ms. Report that absolute number separately from ANGLE deltas."
  }
};

writeFileSync("public/debug/post-land-frame-budget.json", JSON.stringify(report, null, 2));
console.log("\n=== ANGLE relative deltas (vs A) ===");
console.log(JSON.stringify(report.deltasVsA, null, 2));
console.log(
  "cases:",
  JSON.stringify(
    report.cases.map(({ id, meanFrameMs, maxFrameMs, worstSlowMs, slowMax }) => ({
      id,
      meanFrameMs,
      maxFrameMs,
      worstSlowMs,
      slowMax
    })),
    null,
    2
  )
);
console.log("wrote public/debug/post-land-frame-budget.json");
console.log("\n*** HARD STOP — await go/no-go. Manual mid-GPU absolute still required. ***");

await browser.close();
await server.close();
