/**
 * TEMP neon spill tune sweep — screenshots for height / maxLight pairs.
 * Does not bake constants. Run: node scripts/neon-spill-tune-sweep.mjs
 *
 * Writes public/debug/neon-spill-*.png
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5175;
const BOOT_MS = 90_000;
const HOP_MS = 20_000;
const OUT = join(process.cwd(), "public/debug");

const SWEEPS = [
  { tag: "h10-m10", height: 1.0, maxLight: 10, label: "baseline" },
  { tag: "h18-m10", height: 1.8, maxLight: 10, label: "lift only" },
  { tag: "h18-m07", height: 1.8, maxLight: 7, label: "lift + lower peak" }
];

mkdirSync(OUT, { recursive: true });

async function waitReady(page) {
  await page.waitForFunction(
    () => {
      const stage = window.__stage;
      return Boolean(
        stage &&
          stage.introComplete &&
          !stage.locked &&
          stage.cameraRig?.state?.isSettled &&
          stage.vignettes?.[1]?.instance?.pcRoot &&
          stage.neon?.stopLights?.length >= 4
      );
    },
    { timeout: BOOT_MS }
  );
}

async function goSettled(page, index) {
  await page.evaluate((i) => window.__stage.goTo(i), index);
  await page.waitForFunction(
    (i) =>
      Boolean(
        window.__stage?.cameraRig?.state?.isSettled &&
          window.__stage?.cameraRig?.state?.index === i
      ),
    index,
    { timeout: HOP_MS }
  );
  await page.waitForTimeout(400);
}

/** Freeze camera mid-arc between current stop and next (+1). */
async function freezeMidHop(page) {
  await page.evaluate(() => {
    window.__stage.advance(1);
  });
  await page.waitForFunction(() => {
    const s = window.__stage?.cameraRig?.state;
    if (!s || s.isSettled) return false;
    const d = Math.abs(Math.atan2(Math.sin(s.thetaTarget - s.theta), Math.cos(s.thetaTarget - s.theta)));
    return d > 0.35 && d < 1.1;
  }, { timeout: HOP_MS });

  await page.evaluate(() => {
    const s = window.__stage.cameraRig.state;
    s.thetaTarget = s.theta;
    s.thetaVelocity = 0;
    s.lookAtTarget.copy(s.lookAt);
    s.lookAtVelocity.set(0, 0, 0);
    s.radiusTarget = s.radius;
    s.radiusVelocity = 0;
    s.heightTarget = s.height;
    s.heightVelocity = 0;
    s.isSettled = true;
  });
  await page.waitForTimeout(250);
}

async function shot(page, name) {
  const png = await page.locator("#scene-canvas").screenshot({ type: "png" });
  const path = join(OUT, name);
  writeFileSync(path, png);
  console.log("wrote", path, `(${png.length} bytes)`);
  return path;
}

async function applyNeon(page, height, maxLight) {
  const state = await page.evaluate(
    ({ height: h, maxLight: m }) => window.__stage.setNeon({ height: h, maxLight: m }),
    { height, maxLight }
  );
  await page.waitForTimeout(200);
  return state;
}

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false }
});
await server.listen();
const origin = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 50; i += 1) {
  try {
    const res = await fetch(origin);
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
    if (i === 49) throw new Error(`Vite did not accept connections on ${origin}`);
  }
}

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
await waitReady(page);

const summary = [];

for (const sweep of SWEEPS) {
  const state = await applyNeon(page, sweep.height, sweep.maxLight);
  console.log("\n===", sweep.label, sweep.tag, "===", {
    height: state.height,
    maxLight: state.maxLight
  });

  // Prop face — Desktop CRT / PC tower.
  await goSettled(page, 1);
  await shot(page, `neon-spill-${sweep.tag}-rest-prop.png`);

  // Open-ring fog — Bust rest (more empty floor / fog pool in frame).
  await goSettled(page, 0);
  await shot(page, `neon-spill-${sweep.tag}-rest-fog.png`);

  // Pack prop (second flat-box spill target).
  await goSettled(page, 3);
  await shot(page, `neon-spill-${sweep.tag}-rest-pack.png`);

  // Mid-hop: Archaeology → Bust (fog + shelf silhouette in motion).
  await freezeMidHop(page);
  await shot(page, `neon-spill-${sweep.tag}-midhop.png`);

  // Resume settle so next sweep starts clean.
  await goSettled(page, 0);

  summary.push({
    tag: sweep.tag,
    label: sweep.label,
    height: sweep.height,
    maxLight: sweep.maxLight,
    live: { height: state.height, maxLight: state.maxLight }
  });
}

writeFileSync(join(OUT, "neon-spill-sweep.json"), JSON.stringify(summary, null, 2));
console.log("\nDone. Review public/debug/neon-spill-*.png — do not bake until confirmed.");

await browser.close();
await server.close();
