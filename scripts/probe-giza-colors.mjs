/**
 * Color-code portal parts to identify each mesh in the capture.
 * Run: node scripts/probe-giza-colors.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync } from "fs";

const PORT = 5297;
mkdirSync("public/debug", { recursive: true });
const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-giza-colors",
  logLevel: "error",
  clearScreen: false
});
await server.listen();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 160; i++) {
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
  s.cameraRig.goToIndex?.(3);
  for (let i = 0; i < 120; i++) s.cameraRig.update?.(1 / 60);
});
await page.waitForFunction(
  () => Boolean(window.__stage?.vignettes?.[3]?.instance?.portal?._ready),
  { timeout: 120000 }
);

const report = await page.evaluate(async () => {
  const THREE = await import("/node_modules/three/build/three.module.js");
  const s = window.__stage;
  const p = s.vignettes[3].instance.portal;
  p._contentOn = true;
  p.update(s.renderer, s.camera, 1);

  const paint = (obj, hex, clearMap = true) => {
    if (!obj) return;
    obj.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (clearMap) m.map = null;
        m.color?.setHex?.(hex);
        m.opacity = 1;
        m.transparent = false;
        m.blending = THREE.NormalBlending;
        m.needsUpdate = true;
      }
    });
  };

  paint(p._sky, 0xff00ff); // magenta sky
  paint(p._ground, 0xffff00); // yellow ground
  paint(p._pyramids, 0x00ff00); // lime pyramids
  paint(p._desert, 0xff8800);
  if (p.floorPool) {
    p.floorPool.material.map = null;
    p.floorPool.material.color.setHex(0x00ffff); // cyan pool
    p.floorPool.material.opacity = 1;
    p.floorPool.material.transparent = true;
    p.floorPool.material.blending = THREE.NormalBlending;
    p.floorPool.material.needsUpdate = true;
  }
  if (p.spot) p.spot.intensity = 0;

  const boxOf = (obj) => {
    if (!obj) return null;
    const b = new THREE.Box3().setFromObject(obj);
    return {
      min: b.min.toArray(),
      max: b.max.toArray(),
      size: b.getSize(new THREE.Vector3()).toArray()
    };
  };

  return {
    sky: boxOf(p._sky),
    ground: boxOf(p._ground),
    pyr: boxOf(p._pyramids),
    pool: boxOf(p.floorPool),
    poolRot: p.floorPool?.rotation?.toArray?.(),
    poolPos: p.floorPool?.position?.toArray?.()
  };
});
console.log(JSON.stringify(report, null, 2));
await page.waitForTimeout(400);
await page.locator("#scene-canvas").screenshot({
  path: "public/debug/giza-bisect-08-colors.png"
});
console.log("wrote 08");
await browser.close();
await server.close();
