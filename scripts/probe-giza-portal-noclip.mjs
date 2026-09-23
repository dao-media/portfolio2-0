/**
 * Debug: portal with clipping disabled + solid colors.
 * Run: node scripts/probe-giza-portal-noclip.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync } from "fs";

const PORT = 5292;
mkdirSync("public/debug", { recursive: true });

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-giza-probe",
  logLevel: "error",
  clearScreen: false
});
await server.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.error("PAGE", e.message));
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

const report = await page.evaluate(() => {
  const s = window.__stage;
  const vig = s.vignettes[3].instance;
  const p = vig.portal;
  p._contentOn = true;
  p._syncClipPlanes = () => {};
  for (const plane of p._clipPlanes) plane.setComponents(0, 1, 0, 1e6);

  p.portalWorld.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      m.clippingPlanes = [];
      if (o.name === "arch-portal-day-sky") {
        m.map = null;
        m.color.setHex(0x4db8ff);
      }
      if (o.name === "arch-portal-sand-ground") {
        m.color.setHex(0xe8c070);
      }
      m.needsUpdate = true;
    }
  });
  if (p.spot) p.spot.intensity = 0;
  p.update(s.renderer, s.camera, 1);
  for (const plane of p._clipPlanes) plane.setComponents(0, 1, 0, 1e6);
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

  const arch = vig.archRoot;
  arch.updateMatrixWorld(true);
  p.portalWorld.updateMatrixWorld(true);

  const openW = { x: 0, y: 2.05, z: -0.22 };
  const a = s.camera.position.clone().set(openW.x, openW.y, openW.z);
  arch.localToWorld(a);
  const g = s.camera.position.clone();
  p._ground.getWorldPosition(g);
  const sky = s.camera.position.clone();
  p._sky.getWorldPosition(sky);
  const pyr = s.camera.position.clone();
  p._pyramids.getWorldPosition(pyr);

  return {
    portalVisible: p.portalWorld.visible,
    archScale: arch.scale.toArray(),
    archRotY: arch.rotation.y,
    archPos: arch.position.toArray(),
    portalScale: p.portalWorld.scale.toArray(),
    groundLocal: p._ground.position.toArray(),
    groundWorld: g.toArray(),
    skyWorld: sky.toArray(),
    pyrWorld: pyr.toArray(),
    openWorld: a.toArray(),
    camPos: s.camera.position.toArray(),
    children: p.portalWorld.children.map((c) => c.name),
    localClipping: s.renderer.localClippingEnabled,
    groundVisible: p._ground.visible,
    skyVisible: p._sky.visible
  };
});
console.log(JSON.stringify(report, null, 2));

await page.waitForTimeout(500);
await page.locator("#scene-canvas").screenshot({
  path: "public/debug/archaeology-giza-portal-noclip.png"
});
console.log("wrote noclip");

await browser.close();
await server.close();
