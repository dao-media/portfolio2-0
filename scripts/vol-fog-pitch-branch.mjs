/**
 * STEP 1 — pitch/height branch: screen-Y locked vs world-Y tracking.
 * Theta fixed. Varies height + lookAt pitch (isZoomed path so ring pin doesn't overwrite).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5199;
const OUT = "public/debug";
const BOOT_MS = 120_000;

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
await page.waitForTimeout(500);
mkdirSync(OUT, { recursive: true });

await page.evaluate(() => {
  window.__stage.setVolumetricEnabled(true);
  window.__stage.setVolumetricParams({
    outputDither: 0,
    falloffNoiseWarp: 0,
    noiseYSlice: 0,
    noiseYScroll: 0,
    baseRaymarchStepCount: 16,
    halfRes: true
  });
  window.__stage.volumetricFog?.setNoiseFrozen?.(true);
});

async function cameraSnapshot() {
  return page.evaluate(() => {
    const rig = window.__stage.cameraRig;
    const cam = window.__stage.camera;
    const s = rig?.state;
    const dx = (s?.lookAt?.x ?? 0) - cam.position.x;
    const dy = (s?.lookAt?.y ?? 0) - cam.position.y;
    const dz = (s?.lookAt?.z ?? 0) - cam.position.z;
    const pitchDeg = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    return {
      theta: s?.theta ?? null,
      height: s?.height ?? null,
      lookAt: s?.lookAt ? { x: s.lookAt.x, y: s.lookAt.y, z: s.lookAt.z } : null,
      camPos: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
      pitchDeg,
      isZoomed: s?.isZoomed ?? null
    };
  });
}

/**
 * Hold theta. Change height and/or lookAt.y via isZoomed so _lookOnRing pin is bypassed.
 * Also hard-sets camera after update so a single screenshot frame is correct.
 */
async function setPitchPose({ heightDelta = 0, lookAtYDelta = 0 }) {
  return page.evaluate(
    ({ heightDelta, lookAtYDelta }) => {
      const stage = window.__stage;
      const rig = stage.cameraRig;
      const s = rig.state;
      const cam = stage.camera;
      const baseH = rig.restHeight;
      const baseLook = { x: 0, y: rig.lookAtHeight, z: 0 };
      // Ring look-at XZ at current theta.
      if (typeof rig._lookOnRing === "function") {
        rig._lookOnRing(s.theta, s.lookAtTarget);
        baseLook.x = s.lookAtTarget.x;
        baseLook.z = s.lookAtTarget.z;
      }

      s.thetaTarget = s.theta;
      s.thetaVelocity = 0;
      s.height = baseH + heightDelta;
      s.heightTarget = s.height;
      s.heightVelocity = 0;

      // Bypass ring pin — use zoom look path.
      s.isZoomed = true;
      s.lookAtTarget.set(baseLook.x, rig.lookAtHeight + lookAtYDelta, baseLook.z);
      s.lookAt.copy(s.lookAtTarget);
      s.lookAtVelocity.set(0, 0, 0);

      for (let i = 0; i < 6; i++) rig.update?.(1 / 60);

      // Hard lock pose for capture (rAF may still run; re-assert look).
      const r = s.radius + s.radialOffset;
      cam.position.set(
        rig.center[0] + r * Math.sin(s.theta),
        s.height,
        rig.center[2] + r * Math.cos(s.theta)
      );
      cam.up.set(0, 1, 0);
      cam.lookAt(s.lookAt);
      cam.updateMatrixWorld(true);

      // Pitch from cam→lookAt (atan2 of vertical vs horizontal distance).
      const dx = s.lookAt.x - cam.position.x;
      const dy = s.lookAt.y - cam.position.y;
      const dz = s.lookAt.z - cam.position.z;
      const horiz = Math.hypot(dx, dz);
      const pitchDeg = (Math.atan2(dy, horiz) * 180) / Math.PI;
      return {
        height: s.height,
        lookAtY: s.lookAt.y,
        camY: cam.position.y,
        pitchDeg
      };
    },
    { heightDelta, lookAtYDelta }
  );
}

async function snap(name) {
  // Re-assert pose immediately before capture (defeat mid-wait rAF pin).
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
  await page.waitForTimeout(80);
  await page.locator("#scene-canvas").screenshot({ path: `${OUT}/${name}` });
}

/** Strongest horizontal luminance edge from saved PNG via Python (no extra npm deps). */
async function bandScreenY(file) {
  const { spawnSync } = await import("node:child_process");
  const py = `
from pathlib import Path
try:
    from PIL import Image
except ImportError:
    import struct, zlib
    # fallback: only if pillow missing — use screenshot dims via struct IHDR + average via raw inflate if needed
    print('{"error":"no-pillow"}')
    raise SystemExit(0)
im = Image.open(${JSON.stringify(`${OUT}/`)} + ${JSON.stringify(file)}).convert("RGB")
w, h = im.size
x0, x1 = int(w*0.2), int(w*0.8)
y0, y1 = int(h*0.15), int(h*0.85)
px = im.load()
row = []
for y in range(y0, y1):
    s = 0.0; n = 0
    for x in range(x0, x1):
        r,g,b = px[x,y]
        s += 0.2126*r + 0.7152*g + 0.0722*b
        n += 1
    row.append(s/n)
best_y, best_mag = y0, 0.0
for i in range(2, len(row)-2):
    d = abs(row[i+1] - row[i-1])
    if d > best_mag:
        best_mag = d
        best_y = y0 + i
import json
print(json.dumps({"bandScreenY": best_y, "edgeMag": round(best_mag,2), "height": h, "width": w}))
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (r.status !== 0) return { error: r.stderr || r.stdout };
  try {
    return JSON.parse(r.stdout.trim().split("\n").pop());
  } catch {
    return { error: r.stdout };
  }
}

const poses = [
  { id: "rest", heightDelta: 0, lookAtYDelta: 0, file: "vol-fog-pitch-rest.png" },
  { id: "pitch-down", heightDelta: 0, lookAtYDelta: -1.2, file: "vol-fog-pitch-down.png" },
  { id: "pitch-up", heightDelta: 0, lookAtYDelta: 1.2, file: "vol-fog-pitch-up.png" },
  { id: "raise-cam", heightDelta: 1.4, lookAtYDelta: 0, file: "vol-fog-pitch-raise-cam.png" },
  { id: "lower-cam", heightDelta: -0.7, lookAtYDelta: 0.3, file: "vol-fog-pitch-lower-cam.png" }
];

const captures = [];
for (const pose of poses) {
  const applied = await setPitchPose(pose);
  const cam = await cameraSnapshot();
  await snap(pose.file);
  const band = await bandScreenY(pose.file);
  captures.push({ ...pose, applied, cam, band });
}

await setPitchPose({ heightDelta: 0, lookAtYDelta: 0 });
await page.evaluate(() => {
  const s = window.__stage.cameraRig.state;
  s.isZoomed = false;
  window.__stage.volumetricFog?.setNoiseFrozen?.(false);
});

const ys = captures.map((c) => c.band.bandScreenY);
const ySpread = Math.max(...ys) - Math.min(...ys);
const pitchSpread = Math.max(...captures.map((c) => c.applied.pitchDeg)) -
  Math.min(...captures.map((c) => c.applied.pitchDeg));

const report = {
  gate: "GATE4-pitch-branch-step1",
  question:
    "If band stays locked to same SCREEN-Y while floor/horizon move → screen-space. If bandScreenY moves with pitch → world-Y / density.",
  pitchSpreadDeg: Number(pitchSpread.toFixed(2)),
  bandScreenYSpreadPx: ySpread,
  heuristic:
    ySpread < 25 && pitchSpread > 8
      ? "SCREEN-Y-LOCKED (band barely moves while pitch changes)"
      : ySpread > 40
        ? "WORLD-Y-TRACKING (band screen-Y moves with pitch)"
        : "AMBIGUOUS — eyeball captures",
  captures,
  judgeFiles: poses.map((p) => p.file)
};

writeFileSync(`${OUT}/vol-fog-pitch-branch.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
