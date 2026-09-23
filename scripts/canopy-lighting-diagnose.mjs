/**
 * TEMP canopy lighting diagnostic — near-tube vs far/inner leaf luminance.
 * Run: node scripts/canopy-lighting-diagnose.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { writeFileSync, mkdirSync } from "fs";
import { spawnSync } from "child_process";

const PORT = 5261;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-canopy-diag"
});
await server.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`, {
  waitUntil: "domcontentloaded"
});

for (let i = 0; i < 80; i++) {
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
  await page.waitForTimeout(100);
}
await page.waitForFunction(() => Boolean(window.__stage?.introComplete), {
  timeout: 120000
});
await page.waitForTimeout(1500);

function getDistanceAttenuation(lightDistance, cutoffDistance, decayExponent) {
  let distanceFalloff = 1.0 / Math.max(Math.pow(lightDistance, decayExponent), 0.0001);
  if (cutoffDistance > 0) {
    distanceFalloff *= Math.pow(
      Math.max(0.0, 1.0 - Math.pow(lightDistance / cutoffDistance, 4.0)),
      2.0
    );
  }
  return distanceFalloff;
}

const geo = await page.evaluate(() => {
  const stage = window.__stage;
  const vig = stage.vignettes[0]?.instance ?? stage.vignettes[0];
  const light = stage.neon?.stopLights?.[0]?.light;
  const lp = light?.position;
  const root = vig?.appleRoot ?? vig?.mapleRoot;
  if (!root || !lp) {
    return { error: "missing root/light", lp: light?.position?.toArray?.() };
  }

  stage.volumetricFog?.setEnabled?.(false);
  stage.volumetricFog?.setDensityScale?.(0);

  const samples = [];
  const _v = lp.clone();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const name = `${o.name} ${o.material?.name ?? ""}`.toLowerCase();
    if (!name.includes("leaf") && !name.includes("lea")) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    const n = pos.count;
    const step = Math.max(1, (n / 2000) | 0);
    for (let i = 0; i < n; i += step) {
      _v.fromBufferAttribute(pos, i);
      o.localToWorld(_v);
      samples.push({ d: _v.distanceTo(lp), y: _v.y });
    }
  });
  samples.sort((a, b) => a.d - b.d);
  const take = Math.max(40, (samples.length * 0.1) | 0);
  const near = samples.slice(0, take);
  const far = samples.slice(-take);
  const mean = (arr, k) => arr.reduce((s, x) => s + x[k], 0) / Math.max(arr.length, 1);
  const percentile = (p) => samples[Math.min(samples.length - 1, (samples.length * p) | 0)]?.d;

  return {
    light: {
      pos: lp.toArray(),
      intensity: light.intensity,
      distance: light.distance,
      decay: light.decay
    },
    sampleCount: samples.length,
    dNearMean: mean(near, "d"),
    dFarMean: mean(far, "d"),
    dMin: samples[0]?.d,
    dMax: samples[samples.length - 1]?.d,
    dP10: percentile(0.1),
    dP50: percentile(0.5),
    dP90: percentile(0.9),
    yNear: mean(near, "y"),
    yFar: mean(far, "y")
  };
});

geo.attenNear = getDistanceAttenuation(
  geo.dNearMean,
  geo.light.distance,
  geo.light.decay
);
geo.attenFar = getDistanceAttenuation(geo.dFarMean, geo.light.distance, geo.light.decay);
geo.attenRatio = geo.attenFar > 1e-12 ? geo.attenNear / geo.attenFar : null;

console.log("GEO", JSON.stringify(geo, null, 2));

await page.evaluate(() => {
  const rig = window.__stage.cameraRig;
  const s = rig.state;
  const cam = window.__stage.camera;
  s.isZoomed = false;
  s.height = rig.restHeight;
  s.heightTarget = s.height;
  if (typeof rig._lookOnRing === "function") {
    rig._lookOnRing(s.theta, s.lookAtTarget);
    s.lookAt.copy(s.lookAtTarget);
  }
  for (let i = 0; i < 8; i++) rig.update?.(1 / 60);
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
await page.waitForTimeout(400);

const shot = `${OUT}/canopy-after.png`;
await page.locator("#scene-canvas").screenshot({ path: shot });

const screenMetric = await page.evaluate(() => {
  const stage = window.__stage;
  const vig = stage.vignettes[0]?.instance ?? stage.vignettes[0];
  const light = stage.neon.stopLights[0].light;
  const root = vig.appleRoot ?? vig.mapleRoot;
  const cam = stage.camera;
  const _v = light.position.clone();
  const all = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const name = `${o.name}`.toLowerCase();
    if (!name.includes("leaf") && !name.includes("lea")) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    const step = Math.max(1, (pos.count / 40) | 0);
    for (let i = 0; i < pos.count; i += step) {
      _v.fromBufferAttribute(pos, i);
      o.localToWorld(_v);
      all.push({ d: _v.distanceTo(light.position), x: _v.x, y: _v.y, z: _v.z });
    }
  });
  all.sort((a, b) => a.d - b.d);
  const nTake = Math.max(20, (all.length * 0.1) | 0);
  const near = all.slice(0, nTake);
  const far = all.slice(-nTake);
  function project(p) {
    _v.set(p.x, p.y, p.z);
    _v.project(cam);
    return {
      nx: _v.x * 0.5 + 0.5,
      ny: -_v.y * 0.5 + 0.5,
      visible: _v.z > -1 && _v.z < 1
    };
  }
  const inFrame = (p) =>
    p.visible && p.nx > 0.05 && p.nx < 0.95 && p.ny > 0.05 && p.ny < 0.95;
  return {
    nearUv: near.map(project).filter(inFrame),
    farUv: far.map(project).filter(inFrame),
    dNear: near.reduce((s, p) => s + p.d, 0) / near.length,
    dFar: far.reduce((s, p) => s + p.d, 0) / far.length
  };
});

const py = spawnSync(
  "python3",
  [
    "-c",
    `
from PIL import Image
import json, sys
im=Image.open("${shot}").convert("RGB")
w,h=im.size
px=im.load()
def sample(uvs, r=5):
  vals=[]
  for u in uvs:
    x=int(u['nx']*w); y=int(u['ny']*h)
    for dy in range(-r,r+1):
      for dx in range(-r,r+1):
        xx=min(w-1,max(0,x+dx)); yy=min(h-1,max(0,y+dy))
        R,G,B=px[xx,yy]
        vals.append(0.2126*R+0.7152*G+0.0722*B)
  if not vals: return None
  return sum(vals)/len(vals)
near=json.loads('''${JSON.stringify(screenMetric.nearUv)}''')
far=json.loads('''${JSON.stringify(screenMetric.farUv)}''')
Ln=sample(near); Lf=sample(far)
print(json.dumps({
  "nearL": None if Ln is None else round(Ln,2),
  "farL": None if Lf is None else round(Lf,2),
  "ratio": None if (Ln is None or Lf is None or Lf<1e-3) else round(Ln/max(Lf,1e-3), 3),
  "nearUvN": len(near), "farUvN": len(far),
  "dNear": ${screenMetric.dNear}, "dFar": ${screenMetric.dFar}
}))
`
  ],
  { encoding: "utf8" }
);
if (py.status !== 0) {
  console.error("python failed", py.stderr);
  process.exit(1);
}

const luminance = JSON.parse(py.stdout.trim());
console.log("SCREEN", JSON.stringify(luminance, null, 2));
writeFileSync(
  `${OUT}/canopy-after.json`,
  JSON.stringify({ geo, luminance }, null, 2)
);

await browser.close();
await server.close();
console.log(`wrote ${shot} and ${OUT}/canopy-after.json`);
