/**
 * Pass M — the idle floor for land→+10 s: same 10 s window counts (>50 / >33
 * ms) at idle Bust long after land, nothing loading. Cursor parked as in
 * pass-m.mjs. Usage: node scripts/pass-m-idle.mjs <label> [--port 5179]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "idle";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const { browser, page, dbg, sleep } = await bootStage({ port, holdMs: 8000, profileDir: resolve("tmp/pass-k/chrome-profile") });
await page.mouse.move(W * 0.12, H * 0.15);
await sleep(62_000);
const f = await dbg("flightDump");
await browser.close();
const land = f.milestones.find((m) => m.kind === "land");
const log = f.frameLog.map((r) => Object.fromEntries(f.frameLogColumns.map((c, i) => [c, r[i]])));
const win = (a) => {
  const rows = log.filter((r) => r.t >= land.t + a * 1000 && r.t < land.t + (a + 10) * 1000 && r.frameMs != null);
  return { from: a, frames: rows.length, over50: rows.filter((r) => r.frameMs > 50).length, over33: rows.filter((r) => r.frameMs > 33).length };
};
const out = { label, windows: [0, 10, 20, 30, 40, 50].map(win) };
mkdirSync(`tmp/pass-m/${label}`, { recursive: true });
writeFileSync(`tmp/pass-m/${label}/idle.json`, JSON.stringify(out, null, 1));
console.log(label, out.windows.map((w) => `+${w.from}s:${w.over50}/${w.over33}`).join("  "));
