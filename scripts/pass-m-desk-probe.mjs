/**
 * Pass M — Desktop entry spike probe: hop Bust<->Desktop with different dwell
 * times away, report each un-cull's next 4 frame times. Optional page JS per
 * --off <name,...>: debugAbToggle names switched off after land.
 * --stop N: probe stop N (default 1, Desktop); the hop goes 0 -> N -> 0 by
 * the shortest direction. Also reports each entry's worst frame in the
 * 3 s after un-cull (offset in frames).
 * Usage: node scripts/pass-m-desk-probe.mjs <label> [--port 5179] [--stop 3] [--off desk-pc]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args[0] || "probe";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const stop = args.includes("--stop") ? Number(args[args.indexOf("--stop") + 1]) : 1;
const dir = stop === 3 ? -1 : 1;
const off = args.includes("--off") ? args[args.indexOf("--off") + 1].split(",") : [];
const { browser, dbg, sleep, waitSettled } = await bootStage({ port, holdMs: 8000, profileDir: resolve("tmp/pass-k/chrome-profile") });
await sleep(9000);
for (const name of off) console.log("off:", JSON.stringify(await dbg("debugAbToggle", name, false)));
const hop = async (d) => { await dbg("advance", d); await sleep(200); await waitSettled(); await sleep(400); };
for (const away of [8000, 1000, 1000, 4000]) {
  await hop(dir);
  await sleep(1500);
  await hop(-dir);
  await sleep(away);
}
const f = await dbg("flightDump");
await browser.close();
mkdirSync(`tmp/pass-m/${label}`, { recursive: true });
writeFileSync(`tmp/pass-m/${label}/flight.json`, JSON.stringify(f));
const log = new Map(f.frameLog.map((r) => { const o = Object.fromEntries(f.frameLogColumns.map((c, i) => [c, r[i]])); return [o.frame, o]; }));
const land = f.milestones.find((m) => m.kind === "land");
const rows = f.milestones.filter((m) => m.kind === "stop-cull" && !m.data.culled && m.t > land.t && m.data.stop === stop);
const worst = (m) => {
  let best = [0, -1];
  for (const [fr, r] of log) if (fr >= m.frame && r.t <= m.t + 3000 && r.frameMs > best[0]) best = [Math.round(r.frameMs), fr - m.frame];
  return `${best[0]}@+${best[1]}`;
};
console.log(label, rows.map((m) => [0, 1, 2, 3].map((d) => Math.round(log.get(m.frame + d)?.frameMs ?? -1)).join("/") + " w" + worst(m)).join("  "));
