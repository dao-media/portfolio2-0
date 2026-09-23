/**
 * Capture Archaeology stop-3 Giza portal for visual verify.
 * Run: node scripts/capture-giza-portal.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync } from "fs";

const PORT = 5291;
const OUT = "public/debug";
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-giza-portal",
  logLevel: "error",
  clearScreen: false
});
await server.listen();
const url = `http://127.0.0.1:${PORT}/`;
console.log("vite", url);

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (err) => console.error("[pageerror]", err.message));
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });

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
  const rig = s.cameraRig;
  rig.goToIndex?.(3);
  for (let i = 0; i < 120; i++) rig.update?.(1 / 60);
  s.cameraRig.state.isZoomed = false;
});
await page.waitForFunction(
  () => {
    const v = window.__stage?.vignettes?.[3]?.instance;
    return Boolean(v?.shelfRoot && v?.archRoot && v?.portal?._ready);
  },
  { timeout: 120000 }
);
await page.evaluate(() => {
  const s = window.__stage;
  s.neon?.armArriveForActiveStop?.(3);
  const vig = s.vignettes?.[3];
  vig?.group?.traverse?.((o) => {
    if (o.name === "neon-lit-content") o.visible = true;
  });
  if (vig?.instance?.portal) {
    vig.instance.portal._contentOn = true;
    vig.instance.portal.update(s.renderer, s.camera, 1);
  }
});
await page.waitForTimeout(800);
await page.evaluate(() => {
  const s = window.__stage;
  for (let i = 0; i < 30; i++) {
    s.neon?.captureFogDepth?.(s.renderer, s.scene, s.camera);
    s.vignettes?.[3]?.instance?.portal?.update?.(s.renderer, s.camera, 1);
  }
});

const probe = await page.evaluate(() => {
  const p = window.__stage?.vignettes?.[3]?.instance?.portal;
  if (!p) return null;
  const THREE = window.THREE;
  const d = p._desert;
  const box =
    d && THREE
      ? (() => {
          const b = new THREE.Box3().setFromObject(d);
          return {
            min: b.min.toArray(),
            max: b.max.toArray(),
            size: b.getSize(new THREE.Vector3()).toArray()
          };
        })()
      : null;
  return {
    visible: p.portalWorld?.visible,
    contentOn: p._contentOn,
    level: p._level,
    desertPos: d?.position?.toArray?.(),
    desertScale: d?.scale?.toArray?.(),
    desertBox: box,
    pyrPos: p._pyramids?.position?.toArray?.(),
    skyPos: p._sky?.position?.toArray?.(),
    poolOpacity: p.floorPool?.material?.opacity,
    poolPos: p.floorPool?.position?.toArray?.()
  };
});
console.log(JSON.stringify(probe, null, 2));

const png = `${OUT}/archaeology-giza-portal.png`;
await page.locator("#scene-canvas").screenshot({ path: png });
console.log("wrote", png);

await browser.close();
await server.close();
