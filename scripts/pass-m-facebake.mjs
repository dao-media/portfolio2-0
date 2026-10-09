/**
 * Pass M M3 — one-shot vs face-by-face cube shadow bake at each stop's live
 * pose, pixel diff (expect 0). Dane's window, real Chrome.
 * Usage: node scripts/pass-m-facebake.mjs [--port 5179]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage } from "./passj-lib.mjs";
const args = process.argv.slice(2);
const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 5179;
const { browser, dbg, sleep, errors } = await bootStage({ port, holdMs: 250, profileDir: resolve("tmp/pass-k/chrome-profile") });
await sleep(12_000);
const out = [];
for (const stop of [1, 2, 3]) out.push(await dbg("debugFaceBakeCompare", stop));
await browser.close();
mkdirSync("tmp/pass-m", { recursive: true });
writeFileSync("tmp/pass-m/facebake.json", JSON.stringify({ out, errors }, null, 1));
console.log(JSON.stringify(out, null, 1));
if (errors?.length) console.log("errors", errors.slice(0, 5));
