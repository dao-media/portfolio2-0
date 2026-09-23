/**
 * Clean off/on pixel-diff for Archaeology edge glitch (fog frozen off).
 * Run: node scripts/verify-edge-glitch-bleed-diff.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5295;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-eg-bleed-diff",
  logLevel: "error",
  clearScreen: false
});
await server.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
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

await page.evaluate(() => {
  const s = window.__stage;
  s.debugFog?.("off");
  s._fogMode = "off";
  if (s.volumetricFog) s.volumetricFog.enabled = false;
  const rig = s.cameraRig;
  rig.goToIndex?.(3);
  for (let i = 0; i < 120; i++) rig.update?.(1 / 60);
});

await page.waitForFunction(
  () =>
    Boolean(window.__stage?.vignettes?.[3]?.instance?.shelfRoot),
  { timeout: 120000 }
);

await page.evaluate(() => {
  const s = window.__stage;
  s.neon?.armArriveForActiveStop?.(3);
  const vig = s.vignettes?.[3];
  vig?.group?.traverse?.((o) => {
    if (o.name === "neon-lit-content") o.visible = true;
  });
  for (const r of [vig?.instance?.shelfRoot]) {
    if (!r) continue;
    r.visible = true;
    r.traverse((o) => {
      if (o.isMesh) o.visible = true;
    });
  }
});
await page.waitForTimeout(500);

const edgeUv = await page.evaluate(() => {
  const eg = window.__stage.edgeGlitch;
  const roots = window.__stage._edgeGlitchRootForStop?.(3);
  eg.setActiveRoot?.(roots);
  for (let i = 0; i < 10; i++) {
    window.__stage.neon?.captureFogDepth?.(
      window.__stage.renderer,
      window.__stage.scene,
      window.__stage.camera
    );
    eg.setSceneDepth?.(window.__stage.neon?.depthCapture?.depthTexture);
    eg.update?.({ activeIndex: 3, activeRoot: roots, bustReady: true, time: 2 });
  }
  const s = eg.sdf.size;
  const buf = new Float32Array(s * s * 4);
  eg.renderer.readRenderTargetPixels(eg.sdf.sdfRT, 0, 0, s, s, buf);
  let minU = 1;
  let maxU = 0;
  let minV = 1;
  let maxV = 0;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = buf[(y * s + x) * 4];
      if (!(d > 0) || d > 0.05) continue;
      const u = (x + 0.5) / s;
      const v = (y + 0.5) / s;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  }
  let best = null;
  let bestErr = 1e9;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = buf[(y * s + x) * 4];
      if (!(d > 0) || d > 0.035) continue;
      const u = (x + 0.5) / s;
      const v = (y + 0.5) / s;
      if (u > minU + (maxU - minU) * 0.4) continue;
      if (v < 0.35 || v > 0.7) continue;
      const err = Math.abs(d - 0.012) + Math.abs(v - 0.5) * 0.2;
      if (err < bestErr) {
        bestErr = err;
        best = {
          u,
          v,
          d,
          bbox: { minU, maxU, minV, maxV },
          roots: window.__stage.debugEdgeGlitch().activeRoots,
          meshN: window.__stage.edgeGlitch.sdf._meshes.length
        };
      }
    }
  }
  return best;
});

async function shot(path, enabled, bonus = 0) {
  await page.evaluate(
    ({ edgeUv, enabled, bonus }) => {
      const s = window.__stage;
      s.setEdgeGlitchParams?.({
        bonusCount: bonus,
        intensity: 0.2,
        bonusIntensity: 0.75
      });
      window.__egForce = enabled ? 1 : 0;
      const ndcX = edgeUv.u * 2 - 1;
      const ndcY = edgeUv.v * 2 - 1;
      const rect = document.querySelector("#scene-canvas").getBoundingClientRect();
      s.pointer.set(ndcX, ndcY);
      s._lastPointer.x = rect.left + ((ndcX + 1) * 0.5) * rect.width;
      s._lastPointer.y = rect.top + ((1 - ndcY) * 0.5) * rect.height;
      s.edgeGlitch.setPointerNdc(s.pointer, { live: true });
      window.__p = { x: s._lastPointer.x, y: s._lastPointer.y };
    },
    { edgeUv, enabled, bonus }
  );
  const p = await page.evaluate(() => window.__p);
  await page.mouse.move(p.x, p.y);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const tick = () => {
          const s = window.__stage;
          const roots = s._edgeGlitchRootForStop?.(3);
          s.neon?.captureFogDepth?.(s.renderer, s.scene, s.camera);
          s.edgeGlitch?.setSceneDepth?.(s.neon?.depthCapture?.depthTexture);
          s.edgeGlitch?.update?.({
            activeIndex: 3,
            activeRoot: roots,
            bustReady: true,
            time: 5
          });
          if (s.edgeGlitch?.glitchPass?.uniforms?.uEnabled) {
            s.edgeGlitch.glitchPass.uniforms.uEnabled.value = window.__egForce;
          }
          if (++n >= 20) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
  );
  await page.locator("#scene-canvas").screenshot({ path });
}

await shot(`${OUT}/eg-diff-off.png`, false, 0);
await shot(`${OUT}/edge-glitch-arch-no-bleed.png`, true, 0);
await shot(`${OUT}/edge-glitch-arch-bonus.png`, true, 3);

const py = spawnSync(
  "python3",
  [
    "-c",
    `
from PIL import Image
import json

def diff(a, b):
  A = Image.open(a).convert("RGB")
  B = Image.open(b).convert("RGB")
  w, h = A.size
  pa, pb = A.load(), B.load()
  xs, ys, rows = [], [], {}
  for y in range(h):
    for x in range(w):
      ra, ga, ba = pa[x, y]
      rb, gb, bb = pb[x, y]
      if abs(ra - rb) + abs(ga - gb) + abs(ba - bb) > 35:
        xs.append(x); ys.append(y)
        rows.setdefault(y, []).append(x)
  if not xs:
    return {"changed": 0}
  spans = sorted(max(v) - min(v) for v in rows.values() if len(v) >= 2)
  return {
    "changed": len(xs),
    "bbox": [min(xs), min(ys), max(xs), max(ys)],
    "spanX": max(xs) - min(xs),
    "medianRowSpan": spans[len(spans) // 2],
    "maxRowSpan": spans[-1],
    "p90RowSpan": spans[int(len(spans) * 0.9)],
  }

print(json.dumps({
  "off_vs_on": diff("${OUT}/eg-diff-off.png", "${OUT}/edge-glitch-arch-no-bleed.png"),
  "off_vs_bonus": diff("${OUT}/eg-diff-off.png", "${OUT}/edge-glitch-arch-bonus.png"),
}))
`
  ],
  { encoding: "utf8" }
);

const parsed = JSON.parse(py.stdout.trim());
const report = {
  edgeUv,
  ...parsed,
  ok:
    Boolean(edgeUv?.roots?.length >= 3) &&
    (parsed.off_vs_on?.changed ?? 99999) < 8000
};
writeFileSync(`${OUT}/edge-glitch-bleed-diff.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
process.exit(report.ok ? 0 : 1);
