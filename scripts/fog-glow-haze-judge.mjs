/**
 * Capture rest grazing after ground-glow + haze rebalance. Judge only.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5178;
const OUT = "public/debug";
const BOOT_MS = 120_000;

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false }
});
await server.listen();

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () =>
    Boolean(
      window.__stage?.introComplete &&
        !window.__stage?.locked &&
        window.__stage?.cameraRig?.state?.isSettled
    ),
  { timeout: BOOT_MS }
);
await page.waitForTimeout(5000);

mkdirSync(OUT, { recursive: true });

const state = await page.evaluate(() => {
  const neon = window.__stage.neon?.debugState?.() ?? window.__stage.debugNeon?.();
  const u = window.__stage.neon?.fogMaterial?.uniforms;
  return {
    neon,
    uniforms: {
      opacity: u?.uOpacity?.value ?? null,
      feather: u?.uFeather?.value ?? null,
      featherInner: u?.uFeatherInner?.value ?? null,
      distFadeStart: u?.uDistFadeStart?.value ?? null,
      distFadeEnd: u?.uDistFadeEnd?.value ?? null,
      softFade: u?.uSoftFade?.value ?? null,
      cameraXZ: u?.uCameraXZ?.value
        ? { x: u.uCameraXZ.value.x, y: u.uCameraXZ.value.y }
        : null
    }
  };
});

await page.locator("#scene-canvas").screenshot({ path: `${OUT}/fog-glow-haze-rest.png` });
await page.evaluate(() => window.__stage.debugFogIsolate({ floor: false }));
await page.waitForTimeout(200);
await page.locator("#scene-canvas").screenshot({ path: `${OUT}/fog-glow-haze-nofloor.png` });
await page.evaluate(() => window.__stage.debugFogIsolate({ floor: true }));

writeFileSync(`${OUT}/fog-glow-haze-judge.json`, JSON.stringify(state, null, 2));
console.log(JSON.stringify(state.uniforms, null, 2));
console.log(`hazeTotal=${state.neon?.hazeTotal} hazeVisible=${state.neon?.hazeVisible}`);
console.log(`wrote ${OUT}/fog-glow-haze-*.png`);

await browser.close();
await server.close();
