/**
 * Verify Desktop floor pool is centered under tube (no floating offset blob).
 * Run: node scripts/verify-desktop-pool-foot.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5278;
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
  cacheDir: "node_modules/.vite-pool-foot",
  logLevel: "error"
});
await server.listen();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
  rig.goToIndex?.(1);
  for (let i = 0; i < 100; i++) rig.update?.(1 / 60);
});
await page.waitForTimeout(800);

const deskPath = `${OUT}/verify-desktop-pool-foot.png`;
await page.locator("#scene-canvas").screenshot({ path: deskPath });

const metrics = await page.evaluate(() => {
  const s = window.__stage;
  const desk = s.neon?.entries?.[1];
  const bust = s.neon?.entries?.[0];
  const meas = (entry) => {
    if (!entry) return null;
    const glow = entry.floorGlow;
    const pool = glow?.userData?.pool;
    const cone = glow?.userData?.cone;
    const tube = entry.tube;
    const tubeW = { x: tube?.position?.x ?? null, z: tube?.position?.z ?? null };
    const glowLocal = { x: glow?.position?.x ?? null, z: glow?.position?.z ?? null };
    const poolLocal = {
      x: pool?.position?.x ?? null,
      z: pool?.position?.z ?? null
    };
    return {
      name: entry.vignette?.def?.name ?? null,
      tubeLocalXZ: tubeW,
      glowLocalXZ: glowLocal,
      poolLocalOffset: poolLocal,
      poolScale: glow?.userData?.poolScale ?? pool?.scale?.x ?? null,
      poolOffsetX: glow?.userData?.poolOffsetX ?? null,
      coneVisible: cone?.visible ?? null,
      coneMaxOpacity: cone?.userData?.maxOpacity ?? null,
      poolMaxOpacity: pool?.userData?.maxOpacity ?? null,
      dxGlowTube: Math.abs((glowLocal.x ?? 0) - (tubeW.x ?? 0)),
      dzGlowTube: Math.abs((glowLocal.z ?? 0) - (tubeW.z ?? 0)),
      poolOffsetAbs: Math.abs(poolLocal.x ?? 0) + Math.abs(poolLocal.z ?? 0)
    };
  };
  return { desktop: meas(desk), bust: meas(bust) };
});

const gates = {
  desktopCentered:
    (metrics.desktop?.poolOffsetAbs ?? 9) < 0.01 &&
    (metrics.desktop?.dxGlowTube ?? 9) < 0.01 &&
    (metrics.desktop?.dzGlowTube ?? 9) < 0.01,
  desktopTight: (metrics.desktop?.poolScale ?? 9) <= 0.4,
  desktopConeOff:
    metrics.desktop?.coneVisible === false ||
    (metrics.desktop?.coneMaxOpacity ?? 1) < 1e-4,
  bustUnderTube:
    (metrics.bust?.poolOffsetAbs ?? 9) < 0.01 &&
    (metrics.bust?.dxGlowTube ?? 9) < 0.01
};

const report = { metrics, gates, capture: deskPath };
writeFileSync(`${OUT}/verify-desktop-pool-foot.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();

const fail = Object.entries(gates).filter(([, v]) => !v);
if (fail.length) {
  console.error("GATES FAILED:", fail.map(([k]) => k).join(", "));
  process.exit(1);
}
console.log("All gates passed.");
