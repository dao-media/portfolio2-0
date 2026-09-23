/**
 * Instrument FogDepthCapture + Sidekick keypad graph. Screenshots + JSON only.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5175;
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
          stage.vignettes?.[2]?.instance?.phoneRoot
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

const restCapture = await page.evaluate(() => window.__stage.debugFogCapture());
const sidekickRest = await page.evaluate(() => window.__stage.debugSidekick());
writeFileSync(`${OUT}/fog-soft-capture.json`, JSON.stringify({ restCapture, errors }, null, 2));
writeFileSync(`${OUT}/sidekick-hardware.json`, JSON.stringify(sidekickRest, null, 2));

await page.evaluate(() => window.__stage.debugFogVis("both"));
await page.waitForTimeout(250);
await page.locator("#scene-canvas").screenshot({ path: `${OUT}/fog-debug-both-rest.png` });

await page.evaluate(() => window.__stage.debugFogIsolate({ floor: false }));
await page.waitForTimeout(200);
await page.locator("#scene-canvas").screenshot({ path: `${OUT}/fog-isolate-nofloor.png` });

await page.evaluate(() => window.__stage.debugFogIsolate({ floor: true, feather: 0 }));
await page.waitForTimeout(200);
await page.locator("#scene-canvas").screenshot({ path: `${OUT}/fog-isolate-feather0.png` });

await page.evaluate(() => window.__stage.debugFogIsolate({ feather: 2.5, fog: true }));
await page.evaluate(() => window.__stage.debugFogVis("off"));

await hopTo(page, 2);
await page.evaluate(() => window.__stage.vignettes[2].instance.playSlideOpen());
await page.waitForTimeout(2200);
const sidekickOpen = await page.evaluate(() => window.__stage.debugSidekick());
writeFileSync(`${OUT}/sidekick-hardware-open.json`, JSON.stringify(sidekickOpen, null, 2));
await page.locator("#scene-canvas").screenshot({ path: `${OUT}/sidekick-bodies-open.png` });

await browser.close();
await server.close();

console.log(JSON.stringify({
  sizeMatch: restCapture?.sizeMatch,
  nearest: restCapture?.nearest,
  nearFarMatch: restCapture?.nearFarMatch,
  camera: restCapture?.camera,
  uniforms: restCapture?.uniforms,
  depthMatToneMapped: restCapture?.depthMatToneMapped,
  rendererToneMapping: restCapture?.rendererToneMapping,
  samples: restCapture?.samples,
  hardware: sidekickOpen?.keypad?.hardware,
  errors: errors.slice(0, 8)
}, null, 2));
