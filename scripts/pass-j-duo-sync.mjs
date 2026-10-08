/**
 * Pass J item 6 — open Mail from the Duo, scroll the list, select 3
 * messages; after each action, wait for the worker to apply a mirror bitmap
 * whose signature equals the overlay's current one and report
 * action -> texture-applied latency (budget 150 ms). Screenshots each step.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { bootStage } from "./passj-lib.mjs";
const port = Number(process.argv[2] || 5192);
const OUT = process.argv.includes("--full-style") ? "tmp/pass-j/duo-sync-full" : "tmp/pass-j/duo-sync";
mkdirSync(OUT, { recursive: true });
const { browser, page, dbg, sleep, shot } = await bootStage({ port });
await sleep(4000);
const duo = await dbg("debugDuo");
const r = duo?.clientRect ?? duo?.rect ?? null;
console.log("duo rect", JSON.stringify(r));
const cx = r ? r.left + r.width / 2 : 1676;
const cy = r ? r.top + r.height / 2 : 1084;
await page.mouse.click(cx, cy);
await page.waitForSelector(".duo-mail.is-visible", { timeout: 15000 });
await sleep(2500);
const now = () => page.evaluate(() => performance.timeOrigin + performance.now());
async function measure(label) {
  const t0 = await now();
  for (let i = 0; i < 40; i += 1) {
    const v = await page.evaluate(() => window.__duoMirrorVersion?.());
    const log = (await dbg("debugDuoSyncLog")) || [];
    const hit = log.filter((e) => e.version === v && e.appliedAt >= t0 - 1000).pop();
    if (hit) return { label, version: v, latencyMs: Math.round(hit.appliedAt - t0), captureMs: hit.captureMs };
    await sleep(25);
  }
  return { label, version: await page.evaluate(() => window.__duoMirrorVersion?.()), latencyMs: null };
}
await page.evaluate(([full, noKeep]) => {
  window.__duoKeepCapture = !noKeep;
  window.__duoFullStyle = full;
}, [process.argv.includes("--full-style"), process.argv.includes("--no-keep")]);
// Page-side timestamp of the user's input (click / wheel), not a poll.
await page.evaluate(() => {
  window.__duoActionAt = 0;
  const mark = () => (window.__duoActionAt = performance.timeOrigin + performance.now());
  document.addEventListener("click", mark, true);
  document.addEventListener("wheel", mark, { capture: true, passive: true });
});
const panes = await page.evaluate(() =>
  [".duo-mail__list", ".duo-mail__preview"].map((sel) => {
    const el = document.querySelector(sel);
    return { sel, scrollH: el?.scrollHeight, clientH: el?.clientHeight };
  })
);
console.log("panes", JSON.stringify(panes));
const results = [];
async function settleOn(label) {
  // Wait for the mirror to apply the overlay's final state for this action.
  await sleep(450);
  const v = await page.evaluate(() => window.__duoMirrorVersion?.());
  const actionAt = await page.evaluate(() => window.__duoActionAt);
  const log = (await dbg("debugDuoSyncLog")) || [];
  const hit = log.find((e) => e.version === v && e.appliedAt >= actionAt);
  results.push({ label, matches: Boolean(hit), latencyMs: hit ? Math.round(hit.appliedAt - actionAt) : null, captureMs: hit?.captureMs ?? null, queueMs: hit ? Math.round(hit.startAt - actionAt) : null, postToApplyMs: hit ? Math.round(hit.appliedAt - hit.postAt) : null, bitmapMs: hit ? Math.round(hit.postAt - hit.startAt - hit.captureMs) : null, version: v.split("|").slice(2).join("|") });
  await shot(`${OUT}/${label}.png`);
  const url = await page.evaluate(() => window.__duoLastCapture || null);
  if (url) writeFileSync(`${OUT}/${label}-capture.png`, Buffer.from(url.split(",")[1], "base64"));
}
let scrollPane = panes.find((p) => p.scrollH > p.clientH + 4)?.sel ?? null;
let synthetic = false;
if (!scrollPane) {
  // Nothing overflows at this window size — cap the preview so the scroll
  // mirroring path can still be exercised (reported as synthetic).
  synthetic = true;
  scrollPane = ".duo-mail__preview";
  await page.evaluate(() => {
    const el = document.querySelector(".duo-mail__preview");
    el.style.maxHeight = "320px";
    el.style.overflowY = "auto";
  });
  await sleep(600);
}
const pb = await page.locator(scrollPane).boundingBox();
await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
await sleep(500);
for (let i = 0; i < 3; i += 1) {
  await page.mouse.wheel(0, 120);
  await sleep(60);
}
await settleOn(synthetic ? "scroll-synthetic" : "scroll");
await page.evaluate(() => {
  const el = document.querySelector(".duo-mail__preview");
  el.style.maxHeight = "";
  el.style.overflowY = "";
});
await sleep(600);
const rows = page.locator(".duo-mail__row");
for (const i of [1, 2, 3]) {
  await rows.nth(i).hover();
  await sleep(400);
  await rows.nth(i).click();
  await settleOn(`select-${i}`);
}
writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, log: await dbg("debugDuoSyncLog") }, null, 1));
console.log(JSON.stringify(results, null, 1));
await browser.close();
