/**
 * Capture fog-lab presets + step-cost curve → public/debug/fog-lab-*.
 * Usage: node scripts/fog-lab-capture.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "public/debug");
const url = process.env.FOG_LAB_URL || "http://127.0.0.1:5173/fog-lab.html";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => window.__fogLab?.fogPass, { timeout: 15000 });
await page.waitForTimeout(500);

const presets = ["grazing", "overhead", "ring"];
for (const name of presets) {
  await page.evaluate((p) => window.__fogLab.applyPreset(p), name);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `fog-lab-tierb-${name}.png`),
    type: "png"
  });
}

await page.evaluate(() => window.__fogLab.applyPreset("grazing"));
const curve = await page.evaluate(async () => window.__fogLab.measureStepCurve([8, 12, 16, 20, 24, 32, 48]));
const hud = await page.evaluate(() => ({
  stats: window.__fogLab.getStats(),
  fogParams: { ...window.__fogLab.fogParams }
}));

const report = {
  capturedAt: new Date().toISOString(),
  url,
  recommendedSteps: 16,
  halfRes: true,
  hud,
  stepCurve: curve
};
await writeFile(resolve(outDir, "fog-lab-tierb-cost.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
