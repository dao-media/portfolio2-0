/**
 * Stage-1 edge glitch: capture outside-band debug ramp on Bust.
 * Run: node scripts/verify-edge-glitch-stage1.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5279;
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

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-edge-glitch-s1",
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

await page.evaluate(() => {
  const s = window.__stage;
  const rig = s.cameraRig;
  rig.goToIndex?.(0);
  for (let i = 0; i < 90; i++) rig.update?.(1 / 60);
});
await page.waitForTimeout(1200);

const state = await page.evaluate(() => {
  const s = window.__stage;
  s._attachEdgeGlitchBust?.();
  const eg = s.edgeGlitch;
  if (eg && s.vignettes?.[0]?.instance?.bustRoot) {
    eg.attachBust(s.vignettes[0].instance.bustRoot);
  }
  // Force a few SDF updates
  for (let i = 0; i < 10; i++) {
    eg?.update?.({ activeIndex: 0, bustReady: true });
  }
  return {
    debug: s.debugEdgeGlitch?.() ?? eg?.debugState?.() ?? null,
    csmCount: eg?._csms?.length ?? 0,
    overlay: Boolean(eg?._overlay),
    applied: Boolean(eg?._applied)
  };
});

const shot = `${OUT}/verify-edge-glitch-stage1-bust.png`;
await page.locator("#scene-canvas").screenshot({ path: shot });

const report = { state, shot };
writeFileSync(`${OUT}/verify-edge-glitch-stage1.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();

if (!state.applied || state.csmCount < 1) {
  console.error("Stage 1 incomplete: CSM not applied to bust");
  process.exit(1);
}
console.log("Stage 1 capture ok.");
