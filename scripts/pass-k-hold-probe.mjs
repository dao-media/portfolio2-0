/** Pass K — poll the Enter gate inputs every second during the hold. */
import { chromium } from "playwright";
import { resolve } from "node:path";
const port = Number(process.argv[2] || 5179);
const profile = resolve(process.argv[3] || "tmp/pass-k/chrome-profile");
const ctx = await chromium.launchPersistentContext(profile, { channel: "chrome", headless: false, args: ["--window-size=1837,1309"], viewport: { width: 1837, height: 1222 }, deviceScaleFactor: 2 });
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console", m.type(), m.text().slice(0, 200)); });
page.on("worker", (w) => w.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("worker", m.type(), m.text().slice(0, 200)); }));
const t0 = Date.now();
const reqs = [];
page.on("requestfinished", async (r) => { const t = r.timing(); reqs.push([Date.now() - t0, r.url().replace(/^https?:\/\/[^/]+/, ""), Math.round(t.responseEnd)]); });
await page.goto(`http://127.0.0.1:${port}/?flight=1`);
for (let i = 0; i < 90; i += 1) {
  const g = await page.evaluate(() => window.__stageDebug?.("debugHoldGate")).catch(() => null);
  console.log(((Date.now() - t0) / 1000).toFixed(1), JSON.stringify(g));
  if (g?.enterShown) break;
  await page.waitForTimeout(1000);
}
const slow = reqs.filter((r) => r[2] > 500 || /\.(glb|ktx2|png|jpg|webp|hdr|exr|mp4)/.test(r[1])).sort((a, b) => a[0] - b[0]);
for (const r of slow.slice(0, 80)) console.log("req", r[0], r[2], r[1]);
await ctx.close();
