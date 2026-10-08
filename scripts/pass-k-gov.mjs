/**
 * Pass K item 9 — the governor is not blinded by explained frames: idle at
 * Bust (no downshift expected from background work), then force a genuinely
 * heavy steady scene (debugForceHeavy: unexplained busy work in-frame) and
 * show it downshifts; release and show recovery. Usage: node scripts/pass-k-gov.mjs <label> [--port 5179]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "gov";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const OUT = resolve("tmp/pass-k", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep } = await bootStage({ port, holdMs: 250, profileDir: resolve("tmp/pass-k/chrome-profile") });
await page.mouse.move(W * 0.12, H * 0.15);
await sleep(10_000);
await dbg("flightMark", "idle-start");
const g0 = await dbg("debugPerf");
await sleep(8000);
await dbg("flightMark", "idle-end");
await dbg("debugForceHeavy", 28);
await sleep(8000);
await dbg("debugForceHeavy", 0);
await sleep(12_000);
await dbg("flightMark", "recover-end");
const flight = await dbg("flightDump");
await browser.close();
const ms = flight.milestones.filter((m) => ["governor", "floor-notch", "mark", "pace"].includes(m.kind)).map((m) => [m.frame, m.t, m.kind, m.data]);
const at = (label) => flight.milestones.find((m) => m.kind === "mark" && String(m.data.label).startsWith(label))?.frame;
const a = at("idle-start"), b = at("idle-end"), c = at("force-heavy:28"), d = at("force-heavy:0"), e = at("recover-end");
const log = flight.frameLog;
const explained = (from, to) => { const rows = log.filter((r) => r[0] >= from && r[0] <= to); return { frames: rows.length, explained: rows.filter((r) => r[7]).length }; };
const between = (from, to) => ms.filter((m) => m[0] >= from && m[0] <= to && (m[2] === "governor" || m[2] === "floor-notch"));
const out = { governorAtIdleStart: g0?.governor ?? g0, idle: { ...explained(a, b), shifts: between(a, b) }, forced: { ...explained(c, d), shifts: between(c, d) }, recover: { ...explained(d, e), shifts: between(d, e) }, milestones: ms };
writeFileSync(`${OUT}/gov.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ idle: out.idle, forced: out.forced, recover: out.recover }));
