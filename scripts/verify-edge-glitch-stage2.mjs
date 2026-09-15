/**
 * Stage-2 edge glitch: cursor gate — band only when pointer is near outside edge.
 * Run: node scripts/verify-edge-glitch-stage2.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { execFileSync } from "child_process";

const PORT = 5283;
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

/** Drive pointer via NDC, wait for real composer frames. */
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
          if (++n >= 10) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
  );
}

function countBandPixels(pngPath) {
  const script = `
from PIL import Image
im = Image.open(${JSON.stringify(pngPath)}).convert("RGB")
w, h = im.size
band = 0
for y in range(h):
  for x in range(w):
    r, g, b = im.getpixel((x, y))
    cyanish = g > 50 and b > 40 and (g + b) > r * 1.2
    yellowish = r > 80 and g > 70 and b < 90 and (r + g) > b * 2
    mag = r > 90 and b > 60 and g < r * 0.75
    if cyanish or yellowish or mag:
      band += 1
print(band)
`;
  return Number(execFileSync("python3", ["-c", script], { encoding: "utf-8" }).trim());
}

async function sample(page) {
  return page.evaluate(() => window.__stage?.debugEdgeGlitch?.() ?? null);
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-edge-glitch-s2",
  logLevel: "error"
});
await server.listen();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));

await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`, {
  waitUntil: "domcontentloaded"
});
await skipIntro(page);
await page.waitForFunction(() => (window.__stage?._volFogFade ?? 0) >= 0.999, {
  timeout: 12000
});
await settleBust(page);

await page.evaluate(() => {
  const eg = window.__stage.edgeGlitch;
  for (let i = 0; i < 8; i++) eg.update({ activeIndex: 0, bustReady: true });
});

const edgeUv = await page.evaluate(() => {
  const eg = window.__stage.edgeGlitch;
  eg.update({ activeIndex: 0, bustReady: true });
  return eg.sdf.findOutsideEdgeUv({ preferD: 0.02 });
});
if (!edgeUv) {
  console.error("No outside-edge UV found in SDF");
  process.exit(1);
}

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
      if (d < bestD) {
        bestD = d;
        best = { u: (x + 0.5) / s, v: (y + 0.5) / s, d };
      }
    }
  }
  return best;
});

const shots = {
  far: `${OUT}/verify-edge-glitch-stage2-far.png`,
  inside: `${OUT}/verify-edge-glitch-stage2-inside.png`,
  edge: `${OUT}/verify-edge-glitch-stage2-edge.png`
};

await setPointerNdc(page, -0.92, 0.88);
const farDebug = await sample(page);
await page.locator("#scene-canvas").screenshot({ path: shots.far });
const farBand = countBandPixels(shots.far);

await setPointerNdc(page, insideUv.u * 2 - 1, insideUv.v * 2 - 1);
const midDebug = await sample(page);
await page.locator("#scene-canvas").screenshot({ path: shots.inside });
const midBand = countBandPixels(shots.inside);

await setPointerNdc(page, edgeUv.u * 2 - 1, edgeUv.v * 2 - 1);
const nearDebug = await sample(page);
await page.locator("#scene-canvas").screenshot({ path: shots.edge });
const nearBand = countBandPixels(shots.edge);

const report = {
  edgeUv,
  insideUv,
  far: { bandPixels: farBand, debug: farDebug },
  mid: { bandPixels: midBand, debug: midDebug },
  near: { bandPixels: nearBand, debug: nearDebug },
  shots,
  gates: {
    farGateOff: (farDebug?.cursorGate ?? 1) < 0.05,
    insideGateOff: (midDebug?.cursorGate ?? 1) < 0.05,
    edgeGateOn: (nearDebug?.cursorGate ?? 0) > 0.45,
    farQuiet: farBand < Math.max(40, nearBand * 0.2),
    insideQuieterThanEdge: midBand <= nearBand,
    edgeActive: nearBand > 200
  }
};
writeFileSync(`${OUT}/verify-edge-glitch-stage2.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();

const fail = Object.entries(report.gates).filter(([, v]) => !v);
if (fail.length) {
  console.error("GATES FAILED:", fail.map(([k]) => k).join(", "));
  process.exit(1);
}
console.log("Stage 2 gates passed.");
