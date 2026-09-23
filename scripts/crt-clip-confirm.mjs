/**
 * Confirm CRT edge clip: curved (UV rounded-rect mask) vs straight (DOM capture pad).
 * Zooms Desktop CRT and samples corner edge shape.
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";

const PORT = 5275;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-crt-clip"
});
await server.listen();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`, {
  waitUntil: "domcontentloaded"
});

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
await page.waitForTimeout(800);

// Hop to Desktop (index 1) and zoom/focus CRT
await page.evaluate(async () => {
  const s = window.__stage;
  const rig = s.cameraRig;
  // Jump to desktop stop
  if (typeof rig.goToIndex === "function") rig.goToIndex(1);
  else if (typeof rig.setIndex === "function") rig.setIndex(1);
  else {
    rig.state.index = 1;
    rig.state.theta = (Math.PI * 2 * 1) / 4;
    rig.state.thetaTarget = rig.state.theta;
  }
  for (let i = 0; i < 90; i++) rig.update?.(1 / 60);
  // Power on CRT if possible
  const desk = s.vignettes?.[1]?.instance;
  desk?.mySpace?.setPoweredOn?.(true);
  desk?.mySpace?.powerOn?.();
  // Force glow up
  if (desk?.screenMesh?.material) {
    desk.screenMesh.material.emissiveIntensity = 0.72;
  }
  // Zoom focus
  if (typeof rig.zoomToScreen === "function") rig.zoomToScreen();
  else {
    rig.state.isZoomed = true;
    rig.state.focusBlend = 1;
    rig.state.focusBlendTarget = 1;
  }
  for (let i = 0; i < 120; i++) {
    rig.update?.(1 / 60);
    s._aimPovSpotlight?.();
  }
});
await page.waitForTimeout(1500);

const still = `${OUT}/crt-clip-confirm.png`;
await page.locator("#scene-canvas").screenshot({ path: still });

const analysis = spawnSync(
  "python3",
  [
    "-c",
    `
from PIL import Image
import json, math
im = Image.open("${still}").convert("RGB")
w,h = im.size
px = im.load()
# Find bright screen region (MySpace/XP UI tends to be mid-bright, not pure black)
scores=[]
for y in range(int(h*0.15), int(h*0.85)):
  for x in range(int(w*0.2), int(w*0.8)):
    r,g,b = px[x,y]
    L = 0.2126*r+0.7152*g+0.0722*b
    if L > 35 and max(r,g,b) < 250:
      scores.append((L,x,y))
if len(scores) < 200:
  print(json.dumps({"err":"no-screen","n":len(scores)}))
  raise SystemExit
# bbox of bright pixels
xs=[p[1] for p in scores]; ys=[p[2] for p in scores]
x0,x1,y0,y1 = min(xs),max(xs),min(ys),max(ys)
# Sample each corner: walk inward along 45° from bbox corner; find first content pixel
# Then measure how far from the axis-aligned edge the content starts at mid-side vs near corner

def first_content(x,y,dx,dy,steps=80):
  for i in range(steps):
    xx,yy=x+dx*i, y+dy*i
    if not (0<=xx<w and 0<=yy<h): return None
    r,g,b=px[xx,yy]
    L=0.2126*r+0.7152*g+0.0722*b
    if L>28: return (xx,yy,i)
  return None

corners = {
  "tl": first_content(x0, y0, 1, 1),
  "tr": first_content(x1, y0, -1, 1),
  "bl": first_content(x0, y1, 1, -1),
  "br": first_content(x1, y1, -1, -1),
}
# Mid-edge inset (top edge center walking down)
mid_top = first_content((x0+x1)//2, y0, 0, 1)
mid_left = first_content(x0, (y0+y1)//2, 1, 0)
# Curved mask: corner diagonal steps >> mid-edge steps (content delayed at corners)
# Straight pad: corner and mid insets similar (rectangular crop)
corner_steps = [c[2] for c in corners.values() if c]
mid_steps = [m[2] for m in (mid_top, mid_left) if m]
corner_avg = sum(corner_steps)/max(len(corner_steps),1)
mid_avg = sum(mid_steps)/max(len(mid_steps),1)
ratio = corner_avg / max(mid_avg, 0.5)
verdict = "CURVED_UV_MASK" if ratio > 1.6 else ("STRAIGHT_CAPTURE_PAD" if ratio < 1.25 else "MIXED_OR_UNCLEAR")
# Crop corners for vision
im.crop((x0, y0, x0+min(160,x1-x0), y0+min(120,y1-y0))).save("${OUT}/crt-clip-corner-tl.png")
im.crop((max(0,x1-160), y0, x1, y0+min(120,y1-y0))).save("${OUT}/crt-clip-corner-tr.png")
print(json.dumps({
  "bbox":[x0,y0,x1,y1],
  "corner_avg_steps": round(corner_avg,2),
  "mid_avg_steps": round(mid_avg,2),
  "corner_over_mid": round(ratio,2),
  "verdict": verdict,
  "corners": {k:(v[2] if v else None) for k,v in corners.items()}
}))
`
  ],
  { encoding: "utf8" }
);

const report = {
  analysis: analysis.stdout ? JSON.parse(analysis.stdout.trim()) : { err: analysis.stderr },
  note: "CURVED_UV_MASK = (b) CRT_CONTENT_PLANE rounded rect; STRAIGHT_CAPTURE_PAD = (a) DOM pad"
};
writeFileSync(`${OUT}/crt-clip-confirm.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
