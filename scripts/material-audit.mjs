import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const URL = process.argv[2] || "http://127.0.0.1:5180/";

const browser = await chromium.launch({ args: ["--use-gl=angle", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1700, height: 900 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#fader.gone", { timeout: 120_000 });
await page.waitForSelector("#bh-enter:not([hidden])", { timeout: 120_000 });
await page.click("#bh-enter");
await page.waitForSelector("body:not(.is-black-hole)", { timeout: 60_000 });
await page.waitForTimeout(4000);

const dots = await page.$$("#dots button");
const results = {};
const names = ["bust", "desktop", "sidekick", "archaeology"];
for (let i = 0; i < dots.length; i += 1) {
  await dots[i].click();
  await page.waitForTimeout(3000);
  const audit = await page.evaluate(() => window.__stageDebug("debugMaterialAudit"));
  results[names[i] || `stop-${i}`] = audit;
}

writeFileSync("public/debug/material-audit.json", JSON.stringify(results, null, 2));
console.log("wrote public/debug/material-audit.json");
for (const [stop, audit] of Object.entries(results)) {
  console.log(`\n=== ${stop} === env=${audit.sceneEnvironmentIntensity} ambient=${audit.ambient} hemi=${audit.hemi}`);
  for (const row of audit.rows) {
    console.log(
      `${row.vignette} | ${row.mesh} | ${row.material} | ${row.type} | metalness=${row.metalness} roughness=${row.roughness} metalMap=${row.hasMetalnessMap} roughMap=${row.hasRoughnessMap} envMapIntensity=${row.envMapIntensity} ownEnvMap=${row.hasOwnEnvMap}`
    );
  }
}

await browser.close();
