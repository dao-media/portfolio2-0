/**
 * Verify CRT clip fix, glass neon, floor glow, grass@tube. Captures + metrics.
 * Run: node scripts/crt-desktop-bust-verify.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";

const PORT = 5276;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });

async function skipIntro(page) {
  for (let i = 0; i < 140; i++) {
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
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => Boolean(window.__stage?.introComplete), {
    timeout: 120000
  });
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-crt-verify"
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
  timeout: 10000
});
await page.waitForTimeout(400);

// Bust still — floor glow + grass at tube
await page.evaluate(() => {
  const s = window.__stage;
  const rig = s.cameraRig;
  rig.goToIndex?.(0);
  for (let i = 0; i < 60; i++) rig.update?.(1 / 60);
});
await page.waitForTimeout(500);
const bustPath = `${OUT}/verify-bust-tube-grass.png`;
await page.locator("#scene-canvas").screenshot({ path: bustPath });

const bustMetrics = await page.evaluate(() => {
  const s = window.__stage;
  const glow = s.neon?.entries?.[0]?.floorGlow;
  const pool = glow?.userData?.pool;
  return {
    poolOpacity: pool?.material?.uniforms?.uOpacity?.value ?? null,
    poolMax: pool?.userData?.maxOpacity ?? null,
    neonIntensity: s.neon?.stopLights?.[0]?.light?.intensity ?? null,
    contentInset: null
  };
});

// Desktop — CRT + tower
await page.evaluate(async () => {
  const s = window.__stage;
  const rig = s.cameraRig;
  rig.goToIndex?.(1);
  for (let i = 0; i < 90; i++) rig.update?.(1 / 60);
  const desk = s.vignettes?.[1]?.instance;
  // Trigger power-on if available
  try {
    await desk?.playPowerOn?.();
  } catch {
    desk?.mySpace?.setPoweredOn?.(true);
  }
  for (let i = 0; i < 30; i++) {
    desk?.update?.(performance.now() / 1000);
    await new Promise((r) => requestAnimationFrame(r));
  }
});
await page.waitForTimeout(1200);
const deskRest = `${OUT}/verify-desktop-rest.png`;
await page.locator("#scene-canvas").screenshot({ path: deskRest });

// Zoom CRT for edge check
await page.evaluate(() => {
  const s = window.__stage;
  const rig = s.cameraRig;
  rig.state.isZoomed = true;
  rig.state.focusBlend = 1;
  rig.state.focusBlendTarget = 1;
  for (let i = 0; i < 100; i++) {
    rig.update?.(1 / 60);
    s.vignettes?.[1]?.instance?.updateFocus?.(s.camera, 1);
  }
  // Steady glow (post warm-up)
  const mat = s.vignettes?.[1]?.instance?.screenMesh?.material;
  if (mat) mat.emissiveIntensity = 0.72;
});
await page.waitForTimeout(400);
const crtPath = `${OUT}/verify-crt-edges.png`;
await page.locator("#scene-canvas").screenshot({ path: crtPath });

const deskState = await page.evaluate(() => {
  const s = window.__stage;
  const desk = s.vignettes?.[1]?.instance;
  const glass = desk?.glassMesh?.material;
  const glow = s.neon?.entries?.[1]?.floorGlow;
  const pool = glow?.userData?.pool;
  return {
    crtPlane: desk?.debugCrtScreen?.() ?? null,
    emissive: desk?.screenMesh?.material?.emissiveIntensity ?? null,
    neonGlare: glass?.uniforms?.uNeonGlare?.value ?? null,
    neonIntensityUniform: glass?.uniforms?.uNeonIntensity?.value ?? null,
    neonLightIntensity: s.neon?.stopLights?.[1]?.light?.intensity ?? null,
    poolScale: glow?.userData?.poolScale ?? pool?.scale?.x ?? null,
    poolOffsetX: glow?.userData?.poolOffsetX ?? pool?.position?.x ?? null,
    poolOpacity: pool?.material?.uniforms?.uOpacity?.value ?? null
  };
});

const clipCheck = spawnSync(
  "python3",
  [
    "-c",
    `
from PIL import Image
import json
im=Image.open("${crtPath}").convert("RGB")
w,h=im.size; px=im.load()
scores=[]
for y in range(int(h*0.12), int(h*0.88)):
  for x in range(int(w*0.18), int(w*0.82)):
    r,g,b=px[x,y]; L=0.2126*r+0.7152*g+0.0722*b
    if L>40 and max(r,g,b)<250: scores.append((x,y,L))
if len(scores)<100:
  print(json.dumps({"err":"no-screen","n":len(scores)})); raise SystemExit
xs=[p[0] for p in scores]; ys=[p[1] for p in scores]
x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys)
def first(x,y,dx,dy,steps=60):
  for i in range(steps):
    xx,yy=x+dx*i,y+dy*i
    if not (0<=xx<w and 0<=yy<h): return None
    r,g,b=px[xx,yy]; L=0.2126*r+0.7152*g+0.0722*b
    if L>30: return i
  return None
c=[first(x0,y0,1,1), first(x1,y0,-1,1), first(x0,y1,1,-1), first(x1,y1,-1,-1)]
c=[v for v in c if v is not None]
m=[first((x0+x1)//2,y0,0,1), first(x0,(y0+y1)//2,1,0)]
m=[v for v in m if v is not None]
ca=sum(c)/max(len(c),1); ma=sum(m)/max(len(m),1)
ratio=ca/max(ma,0.5)
# Edge readability: mean L along mid of each side inset 8px into content
def edge_L(side):
  s=0;n=0
  if side=='t':
    y=y0+8
    for x in range(x0+20,x1-20):
      r,g,b=px[x,y]; s+=0.2126*r+0.7152*g+0.0722*b; n+=1
  elif side=='b':
    y=y1-8
    for x in range(x0+20,x1-20):
      r,g,b=px[x,y]; s+=0.2126*r+0.7152*g+0.0722*b; n+=1
  elif side=='l':
    x=x0+8
    for y in range(y0+20,y1-20):
      r,g,b=px[x,y]; s+=0.2126*r+0.7152*g+0.0722*b; n+=1
  else:
    x=x1-8
    for y in range(y0+20,y1-20):
      r,g,b=px[x,y]; s+=0.2126*r+0.7152*g+0.0722*b; n+=1
  return round(s/max(n,1),1)
print(json.dumps({
  "corner_over_mid": round(ratio,2),
  "edges": {k: edge_L(k) for k in 'tblr'},
  "less_curved_than_before": ratio < 8
}))
`
  ],
  { encoding: "utf8" }
);

const report = {
  confirmWas: "CURVED_UV_MASK (corner/mid 13.2) — fixed by widening plane / cutting corner R",
  bust: { path: bustPath, ...bustMetrics },
  desktop: deskState,
  crtClip: clipCheck.stdout ? JSON.parse(clipCheck.stdout.trim()) : { err: clipCheck.stderr },
  captures: { bustPath, deskRest, crtPath }
};
writeFileSync(`${OUT}/crt-desktop-bust-verify.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
