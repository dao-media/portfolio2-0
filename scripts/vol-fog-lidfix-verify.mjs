/**
 * Fog slab edge verify: live grazing rest + pitch, full vs quarter density.
 * Metric = ALL-ROWS max contrast (not hardcoded row 315) — catches top OR bottom lid.
 * Pass = max-row contrast low and not density-locked to a fixed row.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5214;
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

async function setPose({ heightDelta = 0, lookAtYDelta = 0 }) {
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
      s.isZoomed = lookAtYDelta !== 0 || heightDelta !== 0;
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
      const dx = s.lookAt.x - cam.position.x;
      const dy = s.lookAt.y - cam.position.y;
      const dz = s.lookAt.z - cam.position.z;
      return {
        height: s.height,
        lookAtY: s.lookAt.y,
        pitchDeg: (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI
      };
    },
    { heightDelta, lookAtYDelta }
  );
}

async function assertPose() {
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

async function applyDensity(d) {
  return page.evaluate((d) => {
    window.__stage.setVolumetricParams({ fogDensityMultiplier: d });
    window.__stage._volFogFade = 1;
    window.__stage.volumetricFog?.setDensityScale?.(1);
    const u = window.__stage.volumetricFog.marchMaterial.uniforms;
    const fs = window.__stage.volumetricFog.marchMaterial.fragmentShader;
    return {
      density: u.uFogDensityMultiplier.value,
      expK: u.uHeightFogExpK.value,
      fogMaxY: u.uFogMaxY.value,
      fogMinY: u.uFogMinY.value,
      floorFade: u.uFogFloorFadeRangeY?.value,
      startY: u.uHeightFogStartY.value,
      endY: u.uHeightFogEndY.value,
      densSoftFloor: /uFogFloorFadeRangeY/.test(fs) && /smoothstep\(uFogMinY/.test(fs),
      clipSkipsAllWhenExp: /bool softSlab = uHeightFogExpK/.test(fs) && /if \(softSlab\) return;/.test(fs)
    };
  }, d);
}

async function snap(name) {
  await assertPose();
  await page.waitForTimeout(100);
  await assertPose();
  await page.locator("#scene-canvas").screenshot({ path: `${OUT}/${name}` });
}

/** All-rows max ±8 contrast in open side columns (primary instrument). Interior 12–88%. */
function maxEdge(file) {
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
y = best[1]
upper = sum(row[120:240]) / 120
lower = sum(row[480:600]) / 120
print(json.dumps({
  "maxContrast": round(best[0],1),
  "maxContrastY": y,
  "above": round(row[max(0,y-8)],1),
  "below": round(row[min(h-1,y+8)],1),
  "upperMean": round(upper,1),
  "lowerMean": round(lower,1)
}))
`;
  return JSON.parse(
    spawnSync("python3", ["-c", py], { encoding: "utf8" }).stdout.trim().split("\n").pop()
  );
}

const captures = [];
const poses = [
  { id: "rest", heightDelta: 0, lookAtYDelta: 0 },
  { id: "pitch-down", heightDelta: 0, lookAtYDelta: -1.2 },
  { id: "pitch-up", heightDelta: 0, lookAtYDelta: 1.2 }
];

for (const dens of [
  { tag: "full", d: 0.16 },
  { tag: "quarter", d: 0.04 }
]) {
  const uniforms = await applyDensity(dens.d);
  for (const pose of poses) {
    const applied = await setPose(pose);
    const file = `vol-fog-lidfix-${dens.tag}-${pose.id}.png`;
    await snap(file);
    captures.push({
      density: dens.d,
      tag: dens.tag,
      pose: pose.id,
      applied,
      uniforms,
      file,
      edge: maxEdge(file)
    });
  }
}

await setPose({ heightDelta: 0, lookAtYDelta: 0 });
await applyDensity(0.16);
await page.evaluate(() => {
  window.__stage.cameraRig.state.isZoomed = false;
  window.__stage.volumetricFog?.setNoiseFrozen?.(false);
});

const restFull = captures.find((c) => c.tag === "full" && c.pose === "rest");
const restQ = captures.find((c) => c.tag === "quarter" && c.pose === "rest");
const ratio =
  restFull.edge.maxContrast > 1e-3
    ? restQ.edge.maxContrast / restFull.edge.maxContrast
    : null;
const yPinned =
  Math.abs(restFull.edge.maxContrastY - restQ.edge.maxContrastY) <= 12;
// Hard edge: high contrast AND density-locked (ratio≈1) AND same row under density change.
const hardEdgeSurvives =
  restFull.edge.maxContrast > 8 &&
  ratio != null &&
  ratio >= 0.85 &&
  ratio <= 1.15 &&
  yPinned;
const pass =
  restFull.edge.maxContrast <= 6 &&
  !hardEdgeSurvives &&
  restFull.uniforms.densSoftFloor &&
  restFull.uniforms.clipSkipsAllWhenExp;

const report = {
  gate: "GATE4-slab-edge-verify",
  metric: "all-rows max ±8 contrast (open side cols)",
  noteStudioHorizon:
    "Quarter-density studio horizon (shell/floor seam) is a separate issue — do not chase here.",
  restFull: restFull.edge,
  restQuarter: restQ.edge,
  contrastRatio: ratio,
  maxContrastYPinned: yPinned,
  hardEdgeSurvives,
  pitch: captures
    .filter((c) => c.tag === "full")
    .map((c) => ({
      pose: c.pose,
      maxContrast: c.edge.maxContrast,
      maxContrastY: c.edge.maxContrastY
    })),
  fogConfigFromUniforms: restFull.uniforms,
  pass,
  note: pass
    ? "PASS — no density-locked hard slab edge on all-rows metric"
    : "FAIL — residual hard edge (likely bottom lid)"
};

writeFileSync(`${OUT}/vol-fog-lidfix-verify.json`, JSON.stringify({ ...report, captures }, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
process.exit(pass ? 0 : 1);
