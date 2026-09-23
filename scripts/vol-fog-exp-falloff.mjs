/**
 * Option 1 — exponential height falloff A/B (horizon lid fix).
 * Captures rest + pitch-down + pitch-up before (legacy lid) / after (exp).
 * Relative cost vs fog-off (ANGLE — compare to prior B ≈ +1.3 ms).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5202;
const OUT = "public/debug";
const BOOT_MS = 120_000;
mkdirSync(OUT, { recursive: true });

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
        window.__stage?._shouldRunIntroHeavyEffects?.() &&
        (window.__stage?.debugVolumetricFog?.()?.densityScale ?? 0) >= 1
    ),
  { timeout: BOOT_MS }
);
await page.waitForTimeout(400);

await page.evaluate(() => {
  window.__stage.setVolumetricEnabled(true);
  window.__stage.volumetricFog?.setNoiseFrozen?.(true);
});

async function setFalloffMode(mode) {
  // before = legacy smoothstep lid at heightFogEndY≈2; after = exp + high fogMaxY
  return page.evaluate((mode) => {
    if (mode === "before") {
      return window.__stage.setVolumetricParams({
        heightFogExpK: 0,
        fogMaxY: 2.4,
        heightFogEndY: 2.0,
        heightFogStartY: 0,
        heightFogFactor: 0.85,
        fogFadeOutRangeY: 1.2,
        fogFadeOutPow: 2.0,
        outputDither: 0,
        falloffNoiseWarp: 0,
        noiseYSlice: 0,
        noiseYScroll: 0,
        baseRaymarchStepCount: 16,
        halfRes: true
      });
    }
    return window.__stage.setVolumetricParams({
      heightFogExpK: 0.35,
      fogMaxY: 8.0,
      heightFogEndY: 2.0,
      heightFogStartY: 0,
      heightFogFactor: 0.85,
      outputDither: 0,
      falloffNoiseWarp: 0,
      noiseYSlice: 0,
      noiseYScroll: 0,
      baseRaymarchStepCount: 16,
      halfRes: true
    });
  }, mode);
}

async function setPitchPose({ heightDelta = 0, lookAtYDelta = 0 }) {
  return page.evaluate(
    ({ heightDelta, lookAtYDelta }) => {
      const stage = window.__stage;
      const rig = stage.cameraRig;
      const s = rig.state;
      const cam = stage.camera;
      if (typeof rig._lookOnRing === "function") rig._lookOnRing(s.theta, s.lookAtTarget);
      const lx = s.lookAtTarget.x;
      const lz = s.lookAtTarget.z;
      s.thetaTarget = s.theta;
      s.thetaVelocity = 0;
      s.height = rig.restHeight + heightDelta;
      s.heightTarget = s.height;
      s.heightVelocity = 0;
      s.isZoomed = true;
      s.lookAtTarget.set(lx, rig.lookAtHeight + lookAtYDelta, lz);
      s.lookAt.copy(s.lookAtTarget);
      s.lookAtVelocity.set(0, 0, 0);
      for (let i = 0; i < 6; i++) rig.update?.(1 / 60);
      const r = s.radius + s.radialOffset;
      cam.position.set(
        rig.center[0] + r * Math.sin(s.theta),
        s.height,
        rig.center[2] + r * Math.cos(s.theta)
      );
      cam.up.set(0, 1, 0);
      cam.lookAt(s.lookAt);
      cam.updateMatrixWorld(true);
      return { height: s.height, lookAtY: s.lookAt.y };
    },
    { heightDelta, lookAtYDelta }
  );
}

async function assertPose() {
  await page.evaluate(() => {
    const stage = window.__stage;
    const rig = stage.cameraRig;
    const s = rig.state;
    const cam = stage.camera;
    const r = s.radius + s.radialOffset;
    cam.position.set(
      rig.center[0] + r * Math.sin(s.theta),
      s.height,
      rig.center[2] + r * Math.cos(s.theta)
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(s.lookAt);
    cam.updateMatrixWorld(true);
  });
}

async function snap(name) {
  await assertPose();
  await page.waitForTimeout(80);
  await assertPose();
  await page.locator("#scene-canvas").screenshot({ path: `${OUT}/${name}` });
}

function edgeY(file) {
  const py = `
from PIL import Image
import json
im = Image.open("public/debug/${file}").convert("RGB")
w,h = im.size
px = im.load()
cols = list(range(60, 200)) + list(range(1080, 1220))
row = []
for y in range(h):
    s=0.0; n=0
    for x in cols:
        r,g,b = px[x,y]
        s += 0.2126*r + 0.7152*g + 0.0722*b
        n += 1
    row.append(s/n)
cands=[]
for y in range(int(h*0.12), int(h*0.88)):
    d = abs(row[min(h-1,y+2)] - row[max(0,y-2)])
    cands.append((d,y))
cands.sort(reverse=True)
print(json.dumps({"topY": cands[0][1], "mag": round(cands[0][0],2), "top3":[{"y":y,"mag":round(m,2)} for m,y in cands[:3]]}))
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  try {
    return JSON.parse(r.stdout.trim().split("\n").pop());
  } catch {
    return { error: r.stderr || r.stdout };
  }
}

const poses = [
  { id: "rest", heightDelta: 0, lookAtYDelta: 0 },
  { id: "pitch-down", heightDelta: 0, lookAtYDelta: -1.2 },
  { id: "pitch-up", heightDelta: 0, lookAtYDelta: 1.2 }
];

const captures = [];
for (const mode of ["before", "after"]) {
  await setFalloffMode(mode);
  for (const pose of poses) {
    await setPitchPose(pose);
    const file = `vol-fog-exp-${mode}-${pose.id}.png`;
    await snap(file);
    captures.push({ mode, pose: pose.id, file, edge: edgeY(file) });
  }
}

// Leave live defaults (after / option 1)
await setFalloffMode("after");
await setPitchPose({ heightDelta: 0, lookAtYDelta: 0 });
await page.evaluate(() => {
  window.__stage.cameraRig.state.isZoomed = false;
  window.__stage.volumetricFog?.setNoiseFrozen?.(false);
});

async function sampleCost(ms = 2500) {
  return page.evaluate(async (ms) => {
    const stage = window.__stage;
    if (stage._costSample?.raf) cancelAnimationFrame(stage._costSample.raf);
    stage._costSample = { n: 0, sumMs: 0, maxMs: 0, lastT: performance.now() };
    const tick = (t) => {
      const s = stage._costSample;
      if (!s) return;
      const dt = t - s.lastT;
      s.lastT = t;
      if (dt > 0 && dt < 100) {
        s.n += 1;
        s.sumMs += dt;
        if (dt > s.maxMs) s.maxMs = dt;
      }
      s.raf = requestAnimationFrame(tick);
    };
    stage._costSample.raf = requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, ms));
    const s = stage._costSample;
    if (s?.raf) cancelAnimationFrame(s.raf);
    stage._costSample = null;
    const avg = s.n ? s.sumMs / s.n : null;
    return { n: s.n, avgMs: avg, maxMs: s.maxMs };
  }, ms);
}

await page.evaluate(() => window.__stage.setVolumetricEnabled(false));
await page.waitForTimeout(300);
const costOff = await sampleCost(2000);
await page.evaluate(() => {
  window.__stage.setVolumetricEnabled(true);
  window.__stage.setVolumetricParams({
    heightFogExpK: 0.35,
    fogMaxY: 8.0,
    baseRaymarchStepCount: 16,
    halfRes: true
  });
});
await page.waitForTimeout(300);
const costOn = await sampleCost(2000);

const live = await page.evaluate(() => window.__stage.debugVolumetricFog());
const uniforms = await page.evaluate(() => {
  const u = window.__stage.volumetricFog?.marchMaterial?.uniforms;
  return {
    heightFogExpK: u?.uHeightFogExpK?.value ?? null,
    fogMaxY: u?.uFogMaxY?.value ?? null,
    heightFogEndY: u?.uHeightFogEndY?.value ?? null,
    heightFogStartY: u?.uHeightFogStartY?.value ?? null,
    hasExpBranch: /uHeightFogExpK/.test(
      window.__stage.volumetricFog?.marchMaterial?.fragmentShader ?? ""
    )
  };
});

const report = {
  gate: "GATE4-exp-height-falloff-option1",
  diagnosis: "Horizon band = heightFogEndY≈2 lid; option 1 = exp falloff + fogMaxY 8",
  captures,
  cost: {
    fogOffAvgMs: costOff.avgMs,
    fogOnExpAvgMs: costOn.avgMs,
    deltaMs: costOn.avgMs != null && costOff.avgMs != null ? costOn.avgMs - costOff.avgMs : null,
    priorB_deltaMs: 1.3,
    note: "ANGLE relative only"
  },
  liveDebug: live,
  uniforms,
  fogConfigDefaults: {
    heightFogExpK: 0.35,
    fogMaxY: 8.0,
    heightFogStartY: 0,
    heightFogEndY: 2.0,
    heightFogFactor: 0.85
  }
};

writeFileSync(`${OUT}/vol-fog-exp-falloff.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
