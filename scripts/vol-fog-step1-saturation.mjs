/**
 * STEP 1 — path-length saturation check: density full vs 1/4 at live grazing rest.
 * Live rest: height 2.85, lookAtY 2.35 → pitch ≈ -2.8°. No shader edits.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5211;
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
  // Exact live rest pose
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

function edgeContrast(file) {
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
    d = abs(row[min(h-1,y+3)] - row[max(0,y-3)])
    if d>best[0]: best=(d,y)
y=best[1]
print(json.dumps({
  "maxEdgeMag": round(best[0],2),
  "edgeY": y,
  "above": round(row[max(0,y-8)],1),
  "at": round(row[y],1),
  "below": round(row[min(h-1,y+8)],1),
  "contrast": round(abs(row[min(h-1,y+8)]-row[max(0,y-8)]),1)
}))
`;
  return JSON.parse(spawnSync("python3", ["-c", py], { encoding: "utf8" }).stdout.trim().split("\n").pop());
}

const FULL = 0.16;
const QUARTER = FULL / 4;

await page.evaluate((d) => {
  window.__stage.setVolumetricParams({
    fogDensityMultiplier: d,
    heightFogExpK: 0,
    fogMaxY: 2.4,
    falloffCeilingJitter: 0,
    baseRaymarchStepCount: 16,
    halfRes: true
  });
}, FULL);
await assertRest();
await page.waitForTimeout(120);
await assertRest();
await page.locator("#scene-canvas").screenshot({ path: `${OUT}/vol-fog-step1-density-full.png` });
const fullEdge = edgeContrast("vol-fog-step1-density-full.png");

await page.evaluate((d) => {
  window.__stage.setVolumetricParams({ fogDensityMultiplier: d });
}, QUARTER);
await assertRest();
await page.waitForTimeout(120);
await assertRest();
await page.locator("#scene-canvas").screenshot({ path: `${OUT}/vol-fog-step1-density-quarter.png` });
const quarterEdge = edgeContrast("vol-fog-step1-density-quarter.png");

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
    pitchDeg: (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI,
    density: window.__stage.debugVolumetricFog()?.density ?? null
  };
});

const contrastRatio =
  fullEdge.contrast > 1e-3 ? quarterEdge.contrast / fullEdge.contrast : null;
const report = {
  gate: "GATE4-step1-path-length-saturation",
  pose,
  full: { density: FULL, file: "vol-fog-step1-density-full.png", ...fullEdge },
  quarter: { density: QUARTER, file: "vol-fog-step1-density-quarter.png", ...quarterEdge },
  contrastRatio,
  verdict:
    contrastRatio != null && contrastRatio < 0.55
      ? "CONFIRMED — band contrast collapses with thin density (path-length saturation)"
      : contrastRatio != null && contrastRatio > 0.85
        ? "REJECTED — band survives thin fog; hypothesis wrong"
        : "AMBIGUOUS — eyeball captures"
};

// Note current alpha formulation from live shader (read-only)
const alphaForm = await page.evaluate(() => {
  const frag = window.__stage.volumetricFog?.marchMaterial?.fragmentShader ?? "";
  return {
    hasBeerLambertAbsorb: /1\.0 - exp\(-sigma \* stepSize\)/.test(frag),
    hasTransmittanceProduct: /transmittance \*= \(1\.0 - absorb\)/.test(frag),
    hasAlphaOneMinusT: /alpha = 1\.0 - transmittance/.test(frag),
    hasLinearSumClamp: /min\s*\(\s*sum|clamp\s*\(\s*accum/.test(frag)
  };
});
report.alphaFormulation = alphaForm;
report.alphaVerdict = alphaForm.hasBeerLambertAbsorb && alphaForm.hasAlphaOneMinusT
  ? "Beer-Lambert (absorb=1-exp(-sigma*dt); T*=(1-absorb); alpha=1-T) — NOT linear-clamp"
  : "check manually";

writeFileSync(`${OUT}/vol-fog-step1-saturation.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
