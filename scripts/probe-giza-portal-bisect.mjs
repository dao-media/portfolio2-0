/**
 * Bisect Giza portal visibility.
 * Run: node scripts/probe-giza-portal-bisect.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync } from "fs";

const PORT = 5294;
mkdirSync("public/debug", { recursive: true });

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-giza-bisect",
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

async function shot(name, setup) {
  await page.evaluate((mode) => {
    const s = window.__stage;
    const p = s.vignettes[3].instance.portal;
    p._contentOn = true;
    p._syncClipPlanes();
    // modes
    if (mode === "wide-clip") {
      // Keep near only essentially — push L/R far away
      const mw = p.portalWorld.matrixWorld;
      const n = new (p._clipPlanes[0].normal.constructor)();
      const pt = new (p.portalWorld.position.constructor)();
      // rebuild: left/right at ±50
      const setPlane = (plane, nx, ny, nz, px, py, pz) => {
        n.set(nx, ny, nz).transformDirection(mw).normalize();
        pt.set(px, py, pz).applyMatrix4(mw);
        plane.setFromNormalAndCoplanarPoint(n, pt);
      };
      p.portalWorld.updateMatrixWorld(true);
      setPlane(p._clipPlanes[0], 1, 0, 0, -50, 2, 8);
      setPlane(p._clipPlanes[1], -1, 0, 0, 50, 2, 8);
      setPlane(p._clipPlanes[2], 0, 0, 1, 0, 2, -0.22);
      p._syncClipPlanes = () => {};
    }
    if (mode === "no-clip") {
      p._syncClipPlanes = () => {};
      for (const pl of p._clipPlanes) pl.setComponents(0, 1, 0, 1e6);
      p.portalWorld.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m) {
            m.clippingPlanes = [];
            m.needsUpdate = true;
          }
        }
      });
    }
    if (mode === "solid-sky") {
      p._sky.material.map = null;
      p._sky.material.color.setHex(0xff00ff); // magenta
      p._sky.material.needsUpdate = true;
    }
    if (mode === "hide-ground") {
      p._ground.visible = false;
      p._desert.visible = false;
    }
    if (mode === "pool-only") {
      if (p.spot) p.spot.intensity = 0;
      p.floorPool.material.opacity = 1;
      // Show pool map as opaque for shape check
      p.floorPool.material.blending = 1; // NormalBlending
      p.floorPool.material.opacity = 1;
      p.floorPool.material.needsUpdate = true;
    }
    p.update(s.renderer, s.camera, 1);
  }, setup);
  await page.waitForTimeout(300);
  const path = `public/debug/giza-bisect-${name}.png`;
  await page.locator("#scene-canvas").screenshot({ path });
  console.log("wrote", path);
}

await shot("01-default", "default");
await shot("02-wide-clip", "wide-clip");
await shot("03-no-clip-magenta", "no-clip");
await page.evaluate(() => {
  const p = window.__stage.vignettes[3].instance.portal;
  p._sky.material.map = null;
  p._sky.material.color.setHex(0xff00ff);
  p._sky.material.clippingPlanes = [];
  p._sky.material.needsUpdate = true;
  p._ground.visible = false;
  p._desert.visible = false;
});
await page.waitForTimeout(300);
await page.locator("#scene-canvas").screenshot({
  path: "public/debug/giza-bisect-04-magenta-sky-only.png"
});
console.log("wrote 04");

await page.evaluate(() => {
  const p = window.__stage.vignettes[3].instance.portal;
  p._ground.visible = true;
  p._desert.visible = true;
  if (p.spot) p.spot.intensity = 0;
  p.floorPool.material.blending = 0; // NoBlending? use Normal
  p.floorPool.material.blending = 1;
  p.floorPool.material.opacity = 1;
  p.floorPool.material.transparent = true;
  p.floorPool.material.needsUpdate = true;
});
await page.waitForTimeout(300);
await page.locator("#scene-canvas").screenshot({
  path: "public/debug/giza-bisect-05-pool-normal.png"
});
console.log("wrote 05");

await browser.close();
await server.close();
