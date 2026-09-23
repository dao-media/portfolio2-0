/**
 * GATE 4 step 3 — soft-contact correctness at grazing prop contact.
 * Isolates volumetric (ring+haze off), samples FogDepthCapture vs live near/far,
 * screenshots rest + Sidekick near contact.
 *
 * ANGLE path is for visual/correctness captures only — not a cost verdict.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5177;
const OUT = "public/debug";
const BOOT_MS = 120_000;
const HOP_MS = 25_000;

async function waitReady(page) {
  await page.waitForFunction(
    () => {
      const stage = window.__stage;
      return Boolean(
        stage &&
          stage.introComplete &&
          !stage.locked &&
          stage.cameraRig?.state?.isSettled &&
          stage.volumetricFog
      );
    },
    { timeout: BOOT_MS }
  );
}

async function hopTo(page, index) {
  const current = await page.evaluate(() => window.__stage.current);
  const steps = ((index - current) % 4 + 4) % 4;
  for (let i = 0; i < steps; i += 1) {
    await page.evaluate(() => window.__stage.advance(1));
    await page.waitForFunction(() => Boolean(window.__stage?.cameraRig?.state?.isSettled), {
      timeout: HOP_MS
    });
    await page.waitForTimeout(400);
  }
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false }
});
await server.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await waitReady(page);
mkdirSync(OUT, { recursive: true });

const prep = await page.evaluate(() => {
  const stage = window.__stage;
  stage.setVolumetricEnabled(true);
  // Isolate volumetric soft-contact — sheet/haze would mask the gate.
  stage.debugFogIsolate({ fog: false, haze: false, floor: true });
  return {
    volumetric: stage.debugVolumetricFog(),
    capture: stage.debugFogCapture(),
    isolate: stage.debugFogIsolate({})
  };
});

await page.waitForTimeout(500);
await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/vol-fog-soft-contact-rest.png`
});

await hopTo(page, 2);
await page.waitForTimeout(600);
const sidekick = await page.evaluate(() => ({
  volumetric: window.__stage.debugVolumetricFog(),
  capture: window.__stage.debugFogCapture(),
  sidekick: window.__stage.debugSidekick()
}));
await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/vol-fog-soft-contact-sidekick.png`
});

// Zoom in for near prop contact silhouette.
await page.evaluate(() => window.__stage.cameraRig?.zoomIn?.(2));
await page.waitForFunction(() => Boolean(window.__stage?.cameraRig?.state?.isSettled), {
  timeout: HOP_MS
});
await page.waitForTimeout(400);
const zoomed = await page.evaluate(() => ({
  volumetric: window.__stage.debugVolumetricFog(),
  capture: window.__stage.debugFogCapture()
}));
await page.locator("#scene-canvas").screenshot({
  path: `${OUT}/vol-fog-soft-contact-sidekick-near.png`
});

const near = prep.capture?.camera?.near;
const far = prep.capture?.camera?.far;
const volNear = prep.volumetric?.near;
const volFar = prep.volumetric?.far;
const nearFarMatch =
  near != null &&
  far != null &&
  volNear != null &&
  volFar != null &&
  Math.abs(near - volNear) < 1e-4 &&
  Math.abs(far - volFar) < 1e-4;

const packedOk = Boolean(prep.volumetric?.depthPacked && prep.volumetric?.hasDepth);
const sizeOk = Boolean(prep.capture?.sizeMatch);

const verdict = {
  gate: "GATE4-step3-soft-contact",
  nearFarMatch,
  packedOk,
  sizeOk,
  sheetNearFarMatch: Boolean(prep.capture?.nearFarMatch),
  hasErrors: errors.length > 0,
  errors,
  prep,
  sidekick,
  zoomed,
  note:
    "Visual: check vol-fog-soft-contact-*.png for hard cuts / dark halos at prop silhouettes. Depth clamp should end march at opaque surface (no sheet soft-fade needed)."
};

writeFileSync(`${OUT}/vol-fog-soft-contact.json`, JSON.stringify(verdict, null, 2));
console.log(JSON.stringify({ nearFarMatch, packedOk, sizeOk, errors: errors.length }, null, 2));
console.log("wrote", `${OUT}/vol-fog-soft-contact.json`);

await browser.close();
await server.close();

if (!nearFarMatch || !packedOk || errors.length) {
  process.exitCode = 1;
}
