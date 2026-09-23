/**
 * Place a magenta slab in the arch opening (archRoot child, not portalWorld).
 * Run: node scripts/probe-giza-in-opening.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync } from "fs";

const PORT = 5296;
mkdirSync("public/debug", { recursive: true });
const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-giza-open",
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
  () => Boolean(window.__stage?.vignettes?.[3]?.instance?.archRoot),
  { timeout: 120000 }
);

const report = await page.evaluate(async () => {
  const THREE = await import("/node_modules/three/build/three.module.js");
  const s = window.__stage;
  const vig = s.vignettes[3].instance;
  const arch = vig.archRoot;
  const p = vig.portal;

  // Hide portal world — only the test slab
  if (p) {
    p.portalWorld.visible = false;
    if (p.backplate) p.backplate.visible = false;
    if (p.floorPool) p.floorPool.visible = false;
    if (p.spot) p.spot.intensity = 0;
  }

  // Remove prior probe
  const old = arch.getObjectByName("probe-opening-slab");
  old?.removeFromParent?.();

  const mat = new THREE.MeshBasicMaterial({
    color: 0xff00ff,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true
  });
  // Fill the opening: sit just on the Egypt side of the doorway
  const slab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 4.0, 0.4), mat);
  slab.name = "probe-opening-slab";
  slab.position.set(0, 2.05, 0.5); // arch-local meters (arch already scaled)
  arch.add(slab);

  // Also add a long corridor box going +Z
  const corridor = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.15, 20),
    new THREE.MeshBasicMaterial({ color: 0xe8b060, side: THREE.DoubleSide })
  );
  corridor.name = "probe-corridor-floor";
  corridor.position.set(0, 0.1, 10);
  arch.add(corridor);

  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 12),
    new THREE.MeshBasicMaterial({
      color: 0x44aaff,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  sky.name = "probe-sky";
  sky.position.set(0, 3, 18);
  sky.rotation.y = Math.PI;
  arch.add(sky);

  arch.updateMatrixWorld(true);
  const wp = new THREE.Vector3();
  slab.getWorldPosition(wp);
  const ndc = wp.clone().project(s.camera);

  return {
    slabWorld: wp.toArray(),
    slabNdc: [ndc.x, ndc.y, ndc.z],
    archScale: arch.scale.toArray(),
    cam: s.camera.position.toArray()
  };
});
console.log(JSON.stringify(report, null, 2));
await page.waitForTimeout(500);
await page.locator("#scene-canvas").screenshot({
  path: "public/debug/giza-bisect-07-opening-slab.png"
});
console.log("wrote 07");
await browser.close();
await server.close();
