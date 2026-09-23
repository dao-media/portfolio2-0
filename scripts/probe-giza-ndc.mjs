/**
 * Force a magenta box just past the doorway; report NDC.
 * Run: node scripts/probe-giza-ndc.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync } from "fs";

const PORT = 5295;
mkdirSync("public/debug", { recursive: true });
const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-giza-ndc",
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
  const cam = s.camera;
  p._contentOn = true;
  p._syncClipPlanes = () => {};
  for (const pl of p._clipPlanes) pl.setComponents(0, 1, 0, 1e6);

  p._ground.visible = false;
  p._desert.visible = false;
  p._pyramids.visible = false;

  p._sky.geometry.dispose();
  p._sky.geometry = new THREE.BoxGeometry(5, 4.5, 1);
  p._sky.position.set(0, 2.05, 3);
  p._sky.rotation.set(0, 0, 0);
  p._sky.material.map = null;
  p._sky.material.color.setHex(0xff00ff);
  p._sky.material.depthWrite = true;
  p._sky.material.depthTest = true;
  p._sky.material.side = THREE.DoubleSide;
  p._sky.material.clippingPlanes = [];
  p._sky.material.needsUpdate = true;
  p._sky.renderOrder = 10;
  p._sky.visible = true;
  p.portalWorld.visible = true;
  if (p.backplate) p.backplate.visible = false;
  p.update(s.renderer, s.camera, 1);

  const wp = new THREE.Vector3();
  const ndcOf = (obj) => {
    obj.getWorldPosition(wp);
    const n = wp.clone().project(cam);
    return { world: wp.toArray(), ndc: [n.x, n.y, n.z] };
  };

  const openLocal = new THREE.Vector3(0, 2.05, -0.22);
  s.vignettes[3].instance.archRoot.localToWorld(openLocal);
  const openNdc = openLocal.clone().project(cam);

  const egyptLocal = new THREE.Vector3(0, 2.05, 3);
  p.portalWorld.localToWorld(egyptLocal);
  const egyptNdc = egyptLocal.clone().project(cam);

  return {
    sky: ndcOf(p._sky),
    openWorld: openLocal.toArray(),
    openNdc: [openNdc.x, openNdc.y, openNdc.z],
    egyptWorld: egyptLocal.toArray(),
    egyptNdc: [egyptNdc.x, egyptNdc.y, egyptNdc.z],
    camPos: cam.position.toArray(),
    portalVisible: p.portalWorld.visible,
    skyVisible: p._sky.visible,
    layers: {
      sky: p._sky.layers.mask,
      cam: cam.layers.mask
    }
  };
});
console.log(JSON.stringify(report, null, 2));
await page.waitForTimeout(400);
await page.locator("#scene-canvas").screenshot({
  path: "public/debug/giza-bisect-06-magenta-box-in-door.png"
});
console.log("wrote 06");
await browser.close();
await server.close();
