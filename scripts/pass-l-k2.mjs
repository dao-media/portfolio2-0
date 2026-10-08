/** Pass L L5 — shipped per-stop dark env: one full-page capture per stop at Dane's window. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) || "l5";
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const OUT = resolve("tmp/pass-l", label);
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, hopTo, errors } = await bootStage({ port, holdMs: 250, profileDir: resolve("tmp/pass-k/chrome-profile") });
for (let i = 0; i < 90; i += 1) {
  const w = await dbg("debugWarmState");
  const e = await dbg("debugStopEnv");
  if (w?.done && (e?.built ?? []).filter(Boolean).length >= 4) break;
  await sleep(1000);
}
const env = {};
for (const stop of [0, 1, 2, 3]) {
  await hopTo(stop);
  await page.mouse.move(W * 0.04, H * 0.06);
  await sleep(3500);
  env[stop] = await dbg("debugStopEnv");
  await page.screenshot({ path: `${OUT}/stop${stop}.png` });
}
const census = await dbg("debugEnvMapCensus");
writeFileSync(`${OUT}/l5.json`, JSON.stringify({ env, census, errors }, null, 1));
console.log(JSON.stringify({ env, errors: errors.slice(0, 5) }));
await browser.close();
