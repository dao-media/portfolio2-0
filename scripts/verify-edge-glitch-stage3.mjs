/**
 * Stage-3 edge glitch: full-frame EdgeGlitchPass, SDF-masked (no CSM / no tube leash).
 * Run: node scripts/verify-edge-glitch-stage3.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";

const PORT = 5284;
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

async function settleBust(page) {
  await page.evaluate(() => {
    const s = window.__stage;
    const rig = s.cameraRig;
    rig.goToIndex?.(0);
    for (let i = 0; i < 90; i++) rig.update?.(1 / 60);
    const bust = s.vignettes?.[0]?.instance?.bustRoot;
    if (bust) s.edgeGlitch?.attachBust?.(bust);
  });
  await page.waitForTimeout(400);
}

async function setPointerNdc(page, ndcX, ndcY) {
  await page.evaluate(
    ({ ndcX, ndcY }) => {
      const canvas = document.querySelector("#scene-canvas");
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.left + ((ndcX + 1) * 0.5) * rect.width;
      const clientY = rect.top + ((1 - ndcY) * 0.5) * rect.height;
      const s = window.__stage;
      s.pointer.set(ndcX, ndcY);
      s._lastPointer.x = clientX;
      s._lastPointer.y = clientY;
      s.edgeGlitch.setPointerNdc(s.pointer, { live: true });
    },
    { ndcX, ndcY }
  );
  const client = await page.evaluate(() => ({
    x: window.__stage._lastPointer.x,
    y: window.__stage._lastPointer.y
  }));
  await page.mouse.move(client.x, client.y);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const tick = () => {
          window.__stage.edgeGlitch?.update?.({ activeIndex: 0, bustReady: true });
          if (++n >= 12) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
  );
}

function rgbSplitScore(pngPath, cursorUv = null) {
  const script = `
from PIL import Image
im = Image.open(${JSON.stringify(pngPath)}).convert("RGB")
w, h = im.size
cx, cy, rw, rh = 0, 0, w, h
uv = ${JSON.stringify(cursorUv)}
if uv:
  cx = int(uv["u"] * w)
  cy = int((1.0 - uv["v"]) * h)
  rw = max(48, int(w * 0.22))
  rh = max(48, int(h * 0.22))
  x0 = max(0, cx - rw // 2); y0 = max(0, cy - rh // 2)
  x1 = min(w, x0 + rw); y1 = min(h, y0 + rh)
else:
  x0, y0, x1, y1 = 0, 0, w, h
score = 0
n = 0
fringe = 0
for y in range(y0, y1):
  for x in range(x0, x1):
    r, g, b = im.getpixel((x, y))
    n += 1
    split = abs(r - b) + abs(r - g) * 0.5
    score += split
    if split > 40 and (r > 40 or b > 40):
      fringe += 1
print(f'{{"meanSplit":{score / max(1, n):.3f},"fringePixels":{fringe},"fringeScore":{fringe / max(1, n):.6f}}}')
`;
  const out = execFileSync("python3", ["-c", script], { encoding: "utf8" }).trim();
  return JSON.parse(out);
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-edge-glitch-s3",
  logLevel: "error",
  clearScreen: false
});
await server.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`, {
  waitUntil: "domcontentloaded"
});
await skipIntro(page);
await page.waitForFunction(() => (window.__stage?._volFogFade ?? 0) >= 0.999, {
  timeout: 12000
}).catch(() => {});
await settleBust(page);

const shots = {
  far: `${OUT}/edge-glitch-s3-far.png`,
  inside: `${OUT}/edge-glitch-s3-inside.png`,
  edge: `${OUT}/edge-glitch-s3-edge.png`,
  edge2: `${OUT}/edge-glitch-s3-edge2.png`
};

const edgeUv = await page.evaluate(() => {
  const eg = window.__stage.edgeGlitch;
  const s = eg.sdf.size;
  const buf = new Float32Array(s * s * 4);
  eg.renderer.readRenderTargetPixels(eg.sdf.sdfRT, 0, 0, s, s, buf);
  const prefer = 0.01;
  let best = null;
  let bestErr = 1e9;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = buf[(y * s + x) * 4];
      if (!(d > 0.0) || d > 0.04) continue;
      const u = (x + 0.5) / s;
      const v = (y + 0.5) / s;
      if (v < 0.32 || v > 0.72) continue;
      if (u > 0.62) continue;
      const err = Math.abs(d - prefer);
      if (err < bestErr) {
        bestErr = err;
        best = { u, v, d };
      }
    }
  }
  return best;
});

const insideUv = await page.evaluate(() => {
  const eg = window.__stage.edgeGlitch;
  const s = eg.sdf.size;
  const buf = new Float32Array(s * s * 4);
  eg.renderer.readRenderTargetPixels(eg.sdf.sdfRT, 0, 0, s, s, buf);
  let best = null;
  let bestD = 0;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = buf[(y * s + x) * 4];
      if (!(d < -0.02)) continue;
      const u = (x + 0.5) / s;
      const v = (y + 0.5) / s;
      if (v < 0.35 || v > 0.7) continue;
      if (d < bestD) {
        bestD = d;
        best = { u, v, d };
      }
    }
  }
  return best;
});

if (!edgeUv || !insideUv) {
  console.error("Failed to find edge/inside UV samples", { edgeUv, insideUv });
  await browser.close();
  await server.close();
  process.exit(1);
}

await setPointerNdc(page, -0.92, 0.88);
const farDebug = await page.evaluate(() => window.__stage.debugEdgeGlitch());
await page.locator("#scene-canvas").screenshot({ path: shots.far });
const farScore = rgbSplitScore(shots.far, edgeUv);

await setPointerNdc(page, insideUv.u * 2 - 1, insideUv.v * 2 - 1);
const midDebug = await page.evaluate(() => window.__stage.debugEdgeGlitch());
await page.locator("#scene-canvas").screenshot({ path: shots.inside });
const midScore = rgbSplitScore(shots.inside, edgeUv);

await setPointerNdc(page, edgeUv.u * 2 - 1, edgeUv.v * 2 - 1);
await page.evaluate(
  () =>
    new Promise((r) => {
      let n = 0;
      const t = () => {
        const s = window.__stage;
        s.edgeGlitch?.update?.({
          activeIndex: 0,
          bustReady: true,
          time: 2.5 + n * 0.07
        });
        if (++n >= 10) r();
        else requestAnimationFrame(t);
      };
      requestAnimationFrame(t);
    })
);
const nearDebug = await page.evaluate(() => window.__stage.debugEdgeGlitch());
const frameMs = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const samples = [];
      let n = 0;
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        samples.push(now - last);
        last = now;
        window.__stage.edgeGlitch?.update?.({
          activeIndex: 0,
          bustReady: true,
          time: 3 + n * 0.016
        });
        if (++n >= 60) {
          samples.sort((a, b) => a - b);
          resolve({
            medianMs: samples[Math.floor(samples.length / 2)],
            p95Ms: samples[Math.floor(samples.length * 0.95)],
            meanMs: samples.reduce((a, b) => a + b, 0) / samples.length
          });
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })
);
await page.locator("#scene-canvas").screenshot({ path: shots.edge });
const nearScore = rgbSplitScore(shots.edge, edgeUv);

const bustMaterial = await page.evaluate(() => {
  const root = window.__stage.vignettes?.[0]?.instance?.bustRoot;
  let name = null;
  let csm = false;
  root?.traverse?.((o) => {
    if (!o.isMesh || name) return;
    const m = o.material;
    name = m?.type || m?.constructor?.name || null;
    csm = Boolean(m?.userData?.__edgeGlitchCsm);
  });
  return { type: name, csmWrapped: csm, csmCount: window.__stage.edgeGlitch?._csms?.length ?? 0 };
});

const edgeUv2 = await page.evaluate((first) => {
  const eg = window.__stage.edgeGlitch;
  const s = eg.sdf.size;
  const buf = new Float32Array(s * s * 4);
  eg.renderer.readRenderTargetPixels(eg.sdf.sdfRT, 0, 0, s, s, buf);
  const prefer = 0.01;
  let best = null;
  let bestErr = 1e9;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = buf[(y * s + x) * 4];
      if (!(d > 0.0) || d > 0.04) continue;
      const u = (x + 0.5) / s;
      const v = (y + 0.5) / s;
      if (v < 0.32 || v > 0.72) continue;
      if (u > 0.58) continue;
      if (first && Math.abs(u - first.u) < 0.08) continue;
      const err = Math.abs(d - prefer);
      if (err < bestErr) {
        bestErr = err;
        best = { u, v, d };
      }
    }
  }
  return best;
}, edgeUv);

let traceDebug = null;
let edge2Score = { fringePixels: 0, fringeScore: 0 };
if (edgeUv2) {
  await setPointerNdc(page, edgeUv2.u * 2 - 1, edgeUv2.v * 2 - 1);
  traceDebug = await page.evaluate(() => window.__stage.debugEdgeGlitch());
  await page.locator("#scene-canvas").screenshot({ path: shots.edge2 });
  edge2Score = rgbSplitScore(shots.edge2, edgeUv2);
}

const report = {
  edgeUv,
  edgeUv2,
  insideUv,
  bustMaterial,
  frameMs,
  far: { ...farScore, debug: farDebug },
  mid: { ...midScore, debug: midDebug },
  near: { ...nearScore, debug: nearDebug },
  trace: { ...edge2Score, debug: traceDebug },
  shots,
  gates: {
    stage3: farDebug?.stage === 3,
    glitchOn: Boolean(nearDebug?.tubeEnabled),
    csmRemoved:
      bustMaterial.csmCount === 0 &&
      bustMaterial.csmWrapped === false &&
      (farDebug?.csmRemoved === true || farDebug?.csmCount === 0),
    sharedPass: await page.evaluate(
      () =>
        window.__stage._edgeGlitchPass ===
          window.__stage.edgeGlitch.glitchPass ||
        window.__stage._edgeTubeGlitchPass ===
          window.__stage.edgeGlitch.tubePass
    ),
    composerBeforeBloom: await page.evaluate(() => {
      const passes = window.__stage.post?.composer?.passes ?? [];
      const names = passes.map((p) => p.name || p.constructor?.name || "");
      const gi = names.findIndex((n) => /EdgeGlitch/i.test(n));
      const bi = names.findIndex((n) => /EffectPass|Bloom/i.test(n) && !/Edge/i.test(n));
      // fog → EdgeGlitch → bloom → grain
      return gi >= 0 && bi > gi;
    }),
    farProxOff: (farDebug?.cursorGate ?? 1) < 0.15 || (farDebug?.dCursor ?? 0) > 0.06,
    insideHardCut:
      (midDebug?.dCursor ?? 0) < 0 && (midDebug?.cursorGate ?? 1) < 0.05,
    edgeProxOn: (nearDebug?.cursorGate ?? 0) > 0.5 && (nearDebug?.dCursor ?? -1) > 0,
    edgeMoreFringeThanFar: nearScore.fringeScore > farScore.fringeScore * 1.05,
    noLocalRadius: farDebug?.localRadius == null,
    localBase: Math.abs((farDebug?.localBase ?? 0) - 0.032) < 1e-6,
    localGrowth: Math.abs((farDebug?.localGrowth ?? 0) - 0.042) < 1e-6,
    tearBands: (farDebug?.tearBands ?? 0) >= 64,
    intensityHero: (farDebug?.intensity ?? 0) >= 0.14
  }
};
writeFileSync(`${OUT}/verify-edge-glitch-stage3.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();

const fail = Object.entries(report.gates).filter(([, v]) => !v);
if (fail.length) {
  console.error("GATES FAILED:", fail.map(([k]) => k).join(", "));
  process.exit(1);
}
console.log("Stage 3 gates passed.");
