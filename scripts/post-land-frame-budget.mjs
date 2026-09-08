/**
 * After land, sample frameBudget for the deferred-integration hitch.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5176;
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
  () => Boolean(window.__stage?.introComplete && !window.__stage?.locked),
  { timeout: BOOT_MS }
);

const samples = [];
for (let i = 0; i < 8; i += 1) {
  await page.waitForTimeout(4000);
  const snap = await page.evaluate(() => {
    const stage = window.__stage;
    return {
      t: performance.now(),
      integration: Boolean(stage?._introIntegrationActive),
      heavyAfter: stage?._introHeavyEffectsAfter ?? 0,
      budget: stage?.debugFrameBudget?.() ?? null
    };
  });
  samples.push(snap);
  const worst = snap.budget?.worst?.[0]?.dtMs ?? 0;
  console.log(`sample ${i} worst=${worst} integration=${snap.integration} slow=${snap.budget?.slowCount}`);
}

writeFileSync("public/debug/post-land-frame-budget.json", JSON.stringify(samples, null, 2));
await browser.close();
await server.close();
console.log("wrote public/debug/post-land-frame-budget.json");
