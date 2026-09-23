/**
 * Capture single-source lighting + grass clearance after the committed-neon pass.
 * Run: node scripts/single-source-capture.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";

const PORT = 5271;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-single-source"
});
await server.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on("console", (m) => {
  if (m.type() === "error") errs.push(m.text().slice(0, 220));
});

await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`, {
  waitUntil: "domcontentloaded"
});
for (let i = 0; i < 100; i++) {
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
  await page.waitForTimeout(80);
}
await page.waitForFunction(() => Boolean(window.__stage?.introComplete), {
  timeout: 120000
});
// Wait for composite opacity fade to finish (400ms) + settle
await page.waitForFunction(
  () => (window.__stage?._volFogFade ?? 0) >= 0.999,
  { timeout: 15000 }
);
await page.waitForTimeout(400);

const knobs = await page.evaluate(() => {
  const s = window.__stage;
  const light = s.neon?.stopLights?.[0]?.light;
  return {
    ambient: s.environment?.children?.find?.((c) => c.isAmbientLight)?.intensity,
    hemi: s.environment?.children?.find?.((c) => c.isHemisphereLight)?.intensity,
    envIntensity: s.scene?.environmentIntensity,
    spot: s.spotLight?.intensity,
    neonIntensity: light?.intensity,
    neonDistance: light?.distance,
    neonDecay: light?.decay,
    fogDensityScale: s.volumetricFog?.marchMaterial?.uniforms?.uDensityScale?.value,
    fogOpacity: s.volumetricFog?.compositeMaterial?.uniforms?.uCompositeOpacity?.value,
    fogNearBoost:
      s.volumetricFog?.marchMaterial?.uniforms?.uNearTubeDensityBoost?.value,
    volFade: s._volFogFade
  };
});

async function restCam() {
  await page.evaluate(() => {
    const rig = window.__stage.cameraRig;
    const st = rig.state;
    const cam = window.__stage.camera;
    st.isZoomed = false;
    st.height = rig.restHeight;
    st.heightTarget = st.height;
    if (typeof rig._lookOnRing === "function") {
      rig._lookOnRing(st.theta, st.lookAtTarget);
      st.lookAt.copy(st.lookAtTarget);
    }
    for (let i = 0; i < 8; i++) rig.update?.(1 / 60);
    const r = st.radius + st.radialOffset;
    cam.position.set(
      rig.center[0] + r * Math.sin(st.theta),
      st.height,
      rig.center[2] + r * Math.cos(st.theta)
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(st.lookAt);
    cam.updateMatrixWorld(true);
  });
  await page.waitForTimeout(200);
}

await restCam();
const stillPath = `${OUT}/single-source-still.png`;
await page.locator("#scene-canvas").screenshot({ path: stillPath });

// Dead-still flash probe: sample mean luminance over 24 frames
const flash = await page.evaluate(async () => {
  const canvas = document.querySelector("#scene-canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  const w = 160;
  const h = 90;
  const means = [];
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const pixels = new Uint8Array(w * h * 4);
    // read center crop via temporary — use stage post buffer approx from canvas
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    tmp.getContext("2d").drawImage(canvas, 0, 0, w, h);
    const data = tmp.getContext("2d").getImageData(0, 0, w, h).data;
    let s = 0;
    for (let p = 0; p < data.length; p += 4) {
      s += 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
    }
    means.push(s / (w * h));
  }
  const avg = means.reduce((a, b) => a + b, 0) / means.length;
  const maxDev = Math.max(...means.map((m) => Math.abs(m - avg)));
  return { avg: Math.round(avg * 100) / 100, maxDev: Math.round(maxDev * 100) / 100, n: means.length };
});

const metrics = spawnSync(
  "python3",
  [
    "-c",
    `
from PIL import Image
import json
im=Image.open("${stillPath}").convert("RGB")
w,h=im.size; px=im.load()
# Black surround: corners
def mean_box(x0,y0,x1,y1):
  s=0;n=0
  for y in range(y0,y1):
    for x in range(x0,x1):
      r,g,b=px[x,y]; s+=0.2126*r+0.7152*g+0.0722*b; n+=1
  return s/max(n,1)
corners=mean_box(0,0,80,60)+mean_box(w-80,0,w,60)+mean_box(0,h-60,80,h)+mean_box(w-80,h-60,w,h)
corners/=4
# Neon core region (right-center tube)
core=mean_box(int(w*0.52), int(h*0.28), int(w*0.62), int(h*0.72))
# Grass under bust (left-center) — look for blades in pedestal
bust=mean_box(int(w*0.30), int(h*0.48), int(w*0.42), int(h*0.62))
# Green leaf L/R
leaf=[]
for y in range(int(h*0.08), int(h*0.55)):
  for x in range(int(w*0.30), int(w*0.75)):
    r,g,b=px[x,y]
    if g>r+8 and g>b+5 and g>30 and r<130:
      leaf.append((x,0.2126*r+0.7152*g+0.0722*b))
leaf.sort(key=lambda t:t[0])
n=max(20,len(leaf)//10) if leaf else 0
left=sum(t[1] for t in leaf[:n])/max(n,1) if n else None
right=sum(t[1] for t in leaf[-n:])/max(n,1) if n else None
print(json.dumps({
  "cornerBlack": round(corners,2),
  "neonCore": round(core,2),
  "coreOverCorner": None if corners<1e-3 else round(core/max(corners,1e-3),2),
  "bustZoneL": round(bust,2),
  "leafLeft": None if left is None else round(left,2),
  "leafRight": None if right is None else round(right,2),
  "leafRatioRL": None if not left else round(right/max(left,1e-3),3),
  "leafN": len(leaf)
}))
`
  ],
  { encoding: "utf8" }
);

const report = {
  knobs,
  flash,
  screen: JSON.parse(metrics.stdout.trim()),
  errs: errs.slice(0, 8)
};
writeFileSync(`${OUT}/single-source-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
