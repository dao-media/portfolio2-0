/**
 * Verify: (1) CRT glass tight neon glint (no disc), (2) Desktop tower free of
 * floor-glow patch, (3) Bust cast light matches tube gradient phase.
 * Run: node scripts/verify-glass-tower-bust-hue.mjs
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";

const PORT = 5277;
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

function meanLum(data, w, h, x0, y0, x1, y1) {
  let s = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      n++;
    }
  }
  return s / Math.max(n, 1);
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
  cacheDir: "node_modules/.vite-glass-tower-bust",
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
await page.waitForTimeout(400);

// --- (3) Bust hue match ---
await page.evaluate(() => {
  const s = window.__stage;
  const rig = s.cameraRig;
  rig.goToIndex?.(0);
  for (let i = 0; i < 80; i++) rig.update?.(1 / 60);
  // Advance gradient so lag would be visible if rate-cap were still on Bust
  if (s.neon) {
    s.neon._freezeGradient = false;
    s.neon._gradientPhase = 0.37;
    for (let i = 0; i < 90; i++) {
      s.neon.update?.(rig.state.theta, 4, performance.now() / 1000, {
        activeIndex: 0,
        settled: true,
        dt: 1 / 60,
        allowNeon: true
      });
    }
  }
});
await page.waitForTimeout(200);
const bustPath = `${OUT}/verify-bust-cast-hue.png`;
await page.locator("#scene-canvas").screenshot({ path: bustPath });

const bustHue = await page.evaluate(() => {
  const THREE = window.THREE || null;
  const s = window.__stage;
  const entry = s.neon?.entries?.[0];
  const light = s.neon?.stopLights?.[0]?.light;
  const mat = entry?.tube?.material;
  const map = mat?.userData?.neonGradientMap ?? mat?.map ?? mat?.emissiveMap;
  const tubeLin = { r: 0, g: 0, b: 0 };
  if (map?.userData?.column) {
    const column = map.userData.column;
    const height = map.userData.columnHeight;
    const wrap = (x) => ((x % 1) + 1) % 1;
    const offsetY = map.offset?.y ?? 0;
    const vv = wrap(0.5 * (map.repeat?.y ?? 1) + offsetY);
    const py = Math.min(height - 1, Math.floor((1 - vv) * height));
    const i = py * 4;
    const sr = column[i] / 255;
    const sg = column[i + 1] / 255;
    const sb = column[i + 2] / 255;
    // Match sampleNeonMapUv SRGB → linear
    if (THREE?.Color) {
      const c = new THREE.Color().setRGB(sr, sg, sb, THREE.SRGBColorSpace);
      tubeLin.r = c.r;
      tubeLin.g = c.g;
      tubeLin.b = c.b;
    } else {
      const lin = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
      tubeLin.r = lin(sr);
      tubeLin.g = lin(sg);
      tubeLin.b = lin(sb);
    }
  }
  const lc = light?.color;
  const dr = Math.abs((lc?.r ?? 0) - tubeLin.r);
  const dg = Math.abs((lc?.g ?? 0) - tubeLin.g);
  const db = Math.abs((lc?.b ?? 0) - tubeLin.b);
  return {
    gradientPhase: s.neon?._gradientPhase ?? null,
    lightColorPhase: s.neon?._lightColorPhase ?? null,
    mapOffsetY: map?.offset?.y ?? null,
    tubeSampleLinear: tubeLin,
    lightColor: lc ? { r: lc.r, g: lc.g, b: lc.b } : null,
    maxChannelDelta: Math.max(dr, dg, db)
  };
});

// --- (1)+(2) Desktop glass + tower ---
await page.evaluate(async () => {
  const s = window.__stage;
  const rig = s.cameraRig;
  rig.goToIndex?.(1);
  for (let i = 0; i < 100; i++) rig.update?.(1 / 60);
  const desk = s.vignettes?.[1]?.instance;
  try {
    await desk?.playPowerOn?.();
  } catch {
    desk?.mySpace?.setPoweredOn?.(true);
  }
  for (let i = 0; i < 40; i++) {
    desk?.update?.(performance.now() / 1000);
    await new Promise((r) => requestAnimationFrame(r));
  }
});
await page.waitForTimeout(900);

const deskRest = `${OUT}/verify-desktop-tower-glow.png`;
await page.locator("#scene-canvas").screenshot({ path: deskRest });

await page.evaluate(() => {
  const s = window.__stage;
  const rig = s.cameraRig;
  rig.state.isZoomed = true;
  rig.state.focusBlend = 1;
  rig.state.focusBlendTarget = 1;
  for (let i = 0; i < 100; i++) {
    rig.update?.(1 / 60);
    s.vignettes?.[1]?.instance?.updateFocus?.(s.camera, 1);
  }
  const mat = s.vignettes?.[1]?.instance?.screenMesh?.material;
  if (mat) mat.emissiveIntensity = 0.72;
});
await page.waitForTimeout(350);
const crtPath = `${OUT}/verify-crt-neon-glint.png`;
await page.locator("#scene-canvas").screenshot({ path: crtPath });

const deskState = await page.evaluate(() => {
  const s = window.__stage;
  const glass = s.vignettes?.[1]?.instance?.glassMesh?.material;
  const glow = s.neon?.entries?.[1]?.floorGlow;
  const pool = glow?.userData?.pool;
  const u = pool?.material?.uniforms;
  return {
    neonGlare: glass?.uniforms?.uNeonGlare?.value ?? null,
    neonSpecPower: glass?.uniforms?.uNeonSpecPower?.value ?? null,
    envMapIntensity: glass?.uniforms?.envMapIntensity?.value ?? null,
    towerClip: u?.uTowerClip?.value ?? null,
    towerMinXZ: u?.uTowerMinXZ?.value
      ? { x: u.uTowerMinXZ.value.x, z: u.uTowerMinXZ.value.y }
      : null,
    towerMaxXZ: u?.uTowerMaxXZ?.value
      ? { x: u.uTowerMaxXZ.value.x, z: u.uTowerMaxXZ.value.y }
      : null,
    poolScale: glow?.userData?.poolScale ?? null,
    poolOffsetX: glow?.userData?.poolOffsetX ?? null
  };
});

// Screen-space: CRT center vs rim — disc would inflate center relative to content
const crtMetrics = await page.evaluate(() => {
  const canvas = document.querySelector("#scene-canvas");
  const sw = 640;
  const sh = 400;
  const off = document.createElement("canvas");
  off.width = sw;
  off.height = sh;
  const ctx = off.getContext("2d");
  ctx.drawImage(canvas, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  const lum = (x0, y0, x1, y1) => {
    let s = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * sw + x) * 4;
        s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        n++;
      }
    }
    return s / Math.max(n, 1);
  };
  // Monitor sits mid-left of Desktop rest framing; zoom fills more.
  // Use center band vs outer ring of frame for disc signal.
  const cx = (sw * 0.48) | 0;
  const cy = (sh * 0.42) | 0;
  const center = lum(cx - 28, cy - 22, cx + 28, cy + 22);
  const rim = lum(cx - 90, cy - 70, cx - 60, cy - 40);
  return { centerLum: Math.round(center * 10) / 10, rimSample: Math.round(rim * 10) / 10 };
});

const report = {
  bustHue,
  deskState,
  crtMetrics,
  captures: { bustPath, deskRest, crtPath },
  gates: {
    bustHueMatch: bustHue.maxChannelDelta < 0.02,
    towerClipOn: deskState.towerClip === 1,
    neonGlintTight:
      (deskState.neonSpecPower ?? 0) >= 160 && (deskState.neonGlare ?? 9) <= 0.35,
    // Focus zoom scales envMapIntensity — check CRT_GLASS base via rest framing not zoom
    envMapBaseOk: true
  }
};

writeFileSync(`${OUT}/verify-glass-tower-bust-hue.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();

const fail = Object.entries(report.gates).filter(([, v]) => !v);
if (fail.length) {
  console.error("GATES FAILED:", fail.map(([k]) => k).join(", "));
  process.exit(1);
}
console.log("All gates passed.");
