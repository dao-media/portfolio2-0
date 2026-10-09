/**
 * Pass P — contact sheets from pass-p-study output: per stop, rest + zoom,
 * every variant (full frame) with its uncapped ms, plus a 100% detail sheet.
 * Usage: node scripts/pass-p-sheet.mjs [--stops 0,1]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
const args = process.argv.slice(2);
const stops = (args.includes("--stops") ? args[args.indexOf("--stops") + 1] : "0,1").split(",").map(Number);
const NAMES = { 0: "Bust", 1: "Desktop" };
const browser = await chromium.launch();
for (const stop of stops) {
  const dir = resolve("tmp/pass-p", `stop${stop}`);
  const s = JSON.parse(readFileSync(`${dir}/study.json`, "utf8"));
  for (const kind of ["full", "detail"]) {
    let html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#111;color:#eee;font:14px/1.3 -apple-system,Helvetica,sans-serif;padding:16px}
      h1{font-size:20px;margin:0 0 6px} h2{font-size:16px;margin:18px 0 8px;color:#ccc}
      .g{display:grid;grid-template-columns:repeat(${kind === "full" ? 4 : 4},1fr);gap:10px}
      figure{margin:0} img{width:100%;display:block;border:1px solid #333}
      figcaption{padding:4px 2px;font-size:13px} b{color:#fff} span{color:#9ab}
    </style><h1>Pass P — ${NAMES[stop]} — ${kind === "full" ? "full frame" : "100% detail"} (A/B only)</h1>`;
    for (const view of ["rest", "zoom"]) {
      const v = s.views[view];
      const base = v.rows.find((r) => r.name === "current")?.ms;
      html += `<h2>${view}</h2><div class="g">`;
      const rows = [...v.rows, { name: "P6-aniso16", ms: v.aniso16Ms }];
      if (view === "zoom") rows.push({ name: "P6-half", ms: null });
      for (const r of rows) {
        const file = `${dir}/${view}-${r.name}${kind === "detail" ? "-detail" : ""}.png`;
        const delta = r.ms != null && base != null && r.name !== "current" ? ` (${r.ms - base >= 0 ? "+" : ""}${(r.ms - base).toFixed(2)})` : "";
        html += `<figure><img src="file://${file}"><figcaption><b>${r.name}</b> <span>${r.ms != null ? r.ms.toFixed(2) + " ms" + delta : ""}${r.exposure ? ` · exposure ${r.exposure}` : ""}</span></figcaption></figure>`;
      }
      html += `</div>`;
    }
    const out = `${dir}/sheet-${kind}.html`;
    writeFileSync(out, html);
    const page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
    await page.goto(`file://${out}`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/contact-${NAMES[stop].toLowerCase()}-${kind}.png`, fullPage: true });
    await page.close();
  }
}
await browser.close();
console.log("ok");
