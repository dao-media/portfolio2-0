/**
 * Pass O O2 — loop the Sidekick 2-hop (Bust → Desktop → Sidekick → back) in
 * one session with a Chrome trace around each; keep the first trace whose
 * 2-hop has a frame over --ms (100). Also logs every loop's worst frame.
 * Usage: node scripts/pass-o-trace.mjs <label> [--port 5179] [--loops 25] [--ms 100] [--query k=v]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "trace";
const num = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const port = num("--port", 5179);
const loops = num("--loops", 25);
const limit = num("--ms", 100);
const extra = args.includes("--query") ? `&${args[args.indexOf("--query") + 1]}` : "";
const OUT = resolve("tmp/pass-o", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, waitSettled } = await bootStage({ port, query: `flight=1${extra}`, holdMs: 8000, profileDir: resolve("tmp/pass-k/chrome-profile") });
await page.mouse.move(W * 0.12, H * 0.15);
await sleep(6000);
const cdp = await page.context().newCDPSession(page);
const idx = async () => (await dbg("debugScrollCapture"))?.current;
const settle = async () => {
  for (let i = 0; i < 100; i += 1) {
    if ((await dbg("debugScrollCapture"))?.cameraSettled) return;
    await sleep(40);
  }
};
const rows = [];
let kept = null;
for (let n = 1; n <= loops; n += 1) {
  await cdp.send("Tracing.start", {
    traceConfig: { includedCategories: ["gpu", "viz", "gpu.service", "disabled-by-default-gpu.service", "disabled-by-default-devtools.timeline", "devtools.timeline", "toplevel", "cc"] },
    transferMode: "ReturnAsStream"
  });
  await dbg("flightMark", `loop${n}-start`);
  await dbg("advance", 1);
  for (let i = 0; i < 100 && (await idx()) !== 1; i += 1) await sleep(50);
  await settle();
  await dbg("advance", 1);
  await sleep(200);
  await waitSettled();
  await sleep(600);
  await dbg("flightMark", `loop${n}-end`);
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.end");
  const { stream } = await done;
  const f = await dbg("flightDump");
  const ms = f.milestones;
  const a = ms.find((m) => m.kind === "mark" && m.data.label === `loop${n}-start`)?.frame;
  const b = ms.find((m) => m.kind === "mark" && m.data.label === `loop${n}-end`)?.frame;
  const log = f.frameLog.map((r) => Object.fromEntries(f.frameLogColumns.map((c, i) => [c, r[i]]))).filter((r) => r.frame >= a && r.frame <= b);
  const worst = log.reduce((w, r) => (r.frameMs > (w?.frameMs ?? 0) ? r : w), null);
  const vram = await dbg("debugVram", 1);
  const row = { n, worstMs: worst?.frameMs ?? 0, frame: worst?.frame, cpu: worst?.cpuWorkMs, cause: worst?.cause, over50: log.filter((r) => r.frameMs > 50).length, vramMb: vram?.totalMb ?? null };
  rows.push(row);
  console.log(JSON.stringify(row));
  if (!kept && row.worstMs > limit) {
    let data = "";
    for (;;) {
      const chunk = await cdp.send("IO.read", { handle: stream, size: 1 << 20 });
      data += chunk.base64Encoded ? Buffer.from(chunk.data, "base64").toString() : chunk.data;
      if (chunk.eof) break;
    }
    writeFileSync(`${OUT}/stall-loop${n}.trace.json`, data);
    writeFileSync(`${OUT}/stall-loop${n}.flight.json`, JSON.stringify(f));
    kept = n;
    console.log(`kept trace for loop ${n} (${(data.length / 1e6).toFixed(1)} MB)`);
  }
  await cdp.send("IO.close", { handle: stream }).catch(() => {});
  // back to Bust
  await dbg("advance", -1);
  await sleep(200);
  await waitSettled();
  await dbg("advance", -1);
  await sleep(200);
  await waitSettled();
  await sleep(800);
}
await browser.close();
writeFileSync(`${OUT}/loops.json`, JSON.stringify({ rows, kept }, null, 1));
console.log(`loops ${rows.length}, >${limit}ms: ${rows.filter((r) => r.worstMs > limit).length}, kept ${kept}`);
