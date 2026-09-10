/**
 * Density-invariant edge probes at live grazing rest (2.85 / lookAtY 2.35 / -2.82°).
 * P1 height clip | P2 in-scatter cap | P3 bloom — one at a time, restore between.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5213;
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
  window.__stage.setVolumetricParams({
    fogDensityMultiplier: 0.16,
    heightFogExpK: 0,
    heightFogEndY: 2.0,
    fogMaxY: 2.4,
    falloffCeilingJitter: 0,
    baseRaymarchStepCount: 16,
    halfRes: true
  });
  window.__stage.volumetricFog?.setNoiseFrozen?.(true);
  window.__stage.volumetricFog?.setInScatterCap?.({ fillCap: 0.88, coreKeep: 0.22 });

  const rig = window.__stage.cameraRig;
  const s = rig.state;
  const cam = window.__stage.camera;
  s.isZoomed = false;
  s.height = rig.restHeight;
  s.heightTarget = s.height;
  s.heightVelocity = 0;
  if (typeof rig._lookOnRing === "function") {
    rig._lookOnRing(s.theta, s.lookAtTarget);
    s.lookAt.copy(s.lookAtTarget);
  }
  for (let i = 0; i < 6; i++) rig.update?.(1 / 60);
});

async function assertRest() {
  await page.evaluate(() => {
    const rig = window.__stage.cameraRig;
    const s = rig.state;
    const cam = window.__stage.camera;
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

async function restoreBaseline() {
  await page.evaluate(() => {
    // Prefer uniforms for clip values outside schema max (endY max 8 / fogMaxY max 16).
    const u = window.__stage.volumetricFog.marchMaterial.uniforms;
    u.uHeightFogEndY.value = 2.0;
    u.uFogMaxY.value = 2.4;
    u.uHeightFogExpK.value = 0;
    window.__stage.volumetricFog.setInScatterCap({ fillCap: 0.88, coreKeep: 0.22 });
    const bloom = window.__stage.post?.bloomEffect;
    if (bloom) {
      bloom.intensity = 1.2;
      if (bloom.luminanceMaterial?.uniforms?.threshold) {
        bloom.luminanceMaterial.uniforms.threshold.value = 1.0;
      } else if ("luminanceThreshold" in bloom) {
        bloom.luminanceThreshold = 1.0;
      }
    }
  });
}

async function snap(name) {
  await assertRest();
  await page.waitForTimeout(100);
  await assertRest();
  await page.locator("#scene-canvas").screenshot({ path: `${OUT}/${name}` });
}

function edgeStats(file) {
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
best=(0,0)
for y in range(int(h*0.12), int(h*0.88)):
    d = abs(row[min(h-1,y+8)] - row[max(0,y-8)])
    if d>best[0]: best=(d,y)
y=best[1]
y315 = 315
c315 = abs(row[min(h-1,y315+8)] - row[max(0,y315-8)])
print(json.dumps({
  "maxContrast": round(best[0],1),
  "maxContrastY": y,
  "contrast": round(best[0],1),
  "edgeY": y,
  "maxEdgeMag": round(best[0],2),
  "row315contrast": round(c315,1),
  "above315": round(row[max(0,y315-8)],1),
  "below315": round(row[min(h-1,y315+8)],1),
  "above": round(row[max(0,y-8)],1),
  "below": round(row[min(h-1,y+8)],1)
}))
`;
  return JSON.parse(
    spawnSync("python3", ["-c", py], { encoding: "utf8" }).stdout.trim().split("\n").pop()
  );
}

const pose = await page.evaluate(() => {
  const rig = window.__stage.cameraRig;
  const cam = window.__stage.camera;
  const s = rig.state;
  const dx = s.lookAt.x - cam.position.x;
  const dy = s.lookAt.y - cam.position.y;
  const dz = s.lookAt.z - cam.position.z;
  return {
    height: s.height,
    lookAtY: s.lookAt.y,
    pitchDeg: (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI
  };
});

await restoreBaseline();
await snap("vol-fog-probe-baseline.png");
const baseline = edgeStats("vol-fog-probe-baseline.png");

// --- PROBE 1: height clip ---
await restoreBaseline();
await page.evaluate(() => {
  const u = window.__stage.volumetricFog.marchMaterial.uniforms;
  u.uHeightFogEndY.value = 20;
  u.uFogMaxY.value = 20;
  // Push fade range so fadeTop doesn't still knee near old fogMaxY
  u.uFogFadeOutRangeY.value = 1.2;
});
const p1uniforms = await page.evaluate(() => {
  const u = window.__stage.volumetricFog.marchMaterial.uniforms;
  return { endY: u.uHeightFogEndY.value, maxY: u.uFogMaxY.value };
});
await snap("vol-fog-probe1-height-clip.png");
const probe1 = edgeStats("vol-fog-probe1-height-clip.png");

// --- PROBE 2: in-scatter cap ---
await restoreBaseline();
await page.evaluate(() => {
  window.__stage.volumetricFog.setInScatterCap({ fillCap: 10, coreKeep: 0.22 });
});
const p2uniforms = await page.evaluate(
  () => window.__stage.volumetricFog.marchMaterial.uniforms.uInScatterFillCap.value
);
await snap("vol-fog-probe2-inscatter-cap.png");
const probe2 = edgeStats("vol-fog-probe2-inscatter-cap.png");

// --- PROBE 3: bloom bypass ---
await restoreBaseline();
const p3bloom = await page.evaluate(() => {
  const bloom = window.__stage.post?.bloomEffect;
  if (!bloom) return { ok: false };
  const prev = {
    intensity: bloom.intensity,
    threshold:
      bloom.luminanceMaterial?.uniforms?.threshold?.value ??
      bloom.luminanceThreshold ??
      null
  };
  bloom.intensity = 0;
  if (bloom.luminanceMaterial?.uniforms?.threshold) {
    bloom.luminanceMaterial.uniforms.threshold.value = 100;
  } else if ("luminanceThreshold" in bloom) {
    bloom.luminanceThreshold = 100;
  }
  // Also disable bloom pass if possible
  if (window.__stage.post?.bloomPass) {
    window.__stage.post.bloomPass.enabled = false;
  }
  return {
    ok: true,
    prev,
    intensity: bloom.intensity,
    bloomPassEnabled: window.__stage.post?.bloomPass?.enabled ?? null
  };
});
await snap("vol-fog-probe3-bloom-off.png");
const probe3 = edgeStats("vol-fog-probe3-bloom-off.png");

await restoreBaseline();
await page.evaluate(() => {
  if (window.__stage.post?.bloomPass) window.__stage.post.bloomPass.enabled = true;
  window.__stage.volumetricFog?.setNoiseFrozen?.(false);
});

function killed(base, probe) {
  const baseC = base.row315contrast;
  const probeC = probe.row315contrast;
  const ratio = baseC > 1e-3 ? probeC / baseC : null;
  const moved = Math.abs(probe.edgeY - base.edgeY) > 40;
  const collapsed = ratio != null && ratio < 0.45;
  return {
    ratio,
    moved,
    collapsed,
    kills: Boolean(collapsed || (moved && probe.maxEdgeMag < base.maxEdgeMag * 0.55))
  };
}

const results = {
  baseline: { file: "vol-fog-probe-baseline.png", ...baseline },
  probe1_heightClip: {
    file: "vol-fog-probe1-height-clip.png",
    uniforms: p1uniforms,
    ...probe1,
    ...killed(baseline, probe1)
  },
  probe2_inscatterCap: {
    file: "vol-fog-probe2-inscatter-cap.png",
    fillCap: p2uniforms,
    ...probe2,
    ...killed(baseline, probe2)
  },
  probe3_bloomOff: {
    file: "vol-fog-probe3-bloom-off.png",
    bloom: p3bloom,
    ...probe3,
    ...killed(baseline, probe3)
  }
};

const killers = [];
if (results.probe1_heightClip.kills) killers.push(1);
if (results.probe2_inscatterCap.kills) killers.push(2);
if (results.probe3_bloomOff.kills) killers.push(3);

const report = {
  gate: "GATE4-density-invariant-edge-probes",
  pose,
  baselineRow315: baseline.row315contrast,
  results,
  killers,
  verdict:
    killers.length === 1
      ? `PROBE ${killers[0]} kills the edge`
      : killers.length > 1
        ? `Multiple probes affect edge: ${killers.join(", ")} — strongest by ratio`
        : "No probe clearly killed row-315 edge — eyeball captures"
};

writeFileSync(`${OUT}/vol-fog-edge-probes.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
