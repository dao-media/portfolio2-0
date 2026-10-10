/**
 * Pass Q Q2 — regression guard for the "no depth / missing textures" class.
 * Boots (own Vite server unless --port), Enter, settle Bust, hop to Desktop.
 * FAILS if:
 *  (0) a composer buffer has no depth attachment (the root cause: §20 11p);
 *  (a) any stop's large albedo / normal / roughness / metalness map reads
 *      back uniform or black, or any map is unreadable / not resident;
 *  (b) a settled stop's fade < 1, or a material with an authored record is
 *      off its authored opacity / transparency (contact pads are driven);
 *  (c) Bust's lantern GLB or grass InstancedMesh is not drawn;
 *  (d) a star pixel survives inside the apple tree's own coverage mask at
 *      rest (screenshot with stars on vs off, compared only under the mask).
 * Usage: node scripts/pass-q-check.mjs [--port 5179]  (exit 1 on failure)
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { bootStage, W, H } from "./passj-lib.mjs";
const args = process.argv.slice(2);
let port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : null;
let server = null;
if (!port) {
  const { createServer } = await import("vite");
  server = await createServer({ server: { port: 5188, strictPort: true }, logLevel: "error" });
  await server.listen();
  port = 5188;
}
const OUT = resolve("tmp/pass-q/check");
mkdirSync(OUT, { recursive: true });
const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`✗ ${m}`);
};
const ok = (m) => console.log(`✓ ${m}`);
const { browser, page, dbg, sleep, hopTo } = await bootStage({ port, holdMs: 1500, profileDir: resolve("tmp/pass-q/chrome-profile-check"), log: () => {} });
for (let i = 0; i < 90; i += 1) {
  if ((await dbg("debugWarmState"))?.done) break;
  await sleep(1000);
}
await page.mouse.move(W * 0.06, H * 0.08);
await sleep(3000);

async function checkStop(stop) {
  // (0) depth attachment
  const fbo = await dbg("debugComposerFbo");
  for (const [k, fb] of [["input", fbo?.resolve], ["output", fbo?.output]]) {
    const d = fb?.depthStencil !== "none" ? fb?.depthStencil : fb?.depth;
    if (!d || d === "none" || !(d.depthBits > 0)) fail(`stop ${stop}: composer ${k} buffer has no depth attachment`);
  }
  if (fbo?.depthGl === false) fail(`stop ${stop}: composer depth texture is a deleted GL object`);
  // (b) fade / authored state
  const fade = await dbg("debugStopFade");
  if (!(fade.fades[stop] >= 0.999)) fail(`stop ${stop}: settled fade ${fade.fades[stop]} < 1`);
  const mats = await dbg("debugStopMaterials", stop);
  const off = (mats.off ?? []).filter((r) => r.auth && !/^contact-shadow/.test(r.mesh));
  if (off.length) fail(`stop ${stop}: ${off.length} material(s) off authored: ${off.map((r) => `${r.mesh}(${r.opacity}/${r.transparent})`).join(", ")}`);
  // (a) textures of every stop (read from wherever we are)
  return { fbo, fade };
}

async function checkTextures() {
  for (let i = 0; i < 4; i += 1) {
    const r = await dbg("debugStopTextureReport", i);
    const bad = [];
    for (const row of r.rows ?? []) {
      for (const [slot, t] of Object.entries(row.slots ?? {})) {
        const [tw] = String(t.size).split("x").map(Number);
        if (!t.glResident) bad.push(`${row.mesh}.${slot} not resident`);
        else if (t.gpu?.error || t.gpu?.fbComplete === false) bad.push(`${row.mesh}.${slot} unreadable`);
        else if (["map", "normalMap", "roughnessMap", "metalnessMap"].includes(slot) && tw >= 512 && t.gpu?.uniform) bad.push(`${row.mesh}.${slot} ${t.size} uniform ${JSON.stringify(t.gpu.samples?.[0])}`);
      }
    }
    const uniq = [...new Set(bad)];
    if (uniq.length) fail(`stop ${i} textures: ${uniq.slice(0, 6).join("; ")}${uniq.length > 6 ? ` (+${uniq.length - 6})` : ""}`);
    else ok(`stop ${i}: ${r.textures} textures resident, maps non-uniform`);
  }
}

await checkStop(0);
await checkTextures();
// (c) lantern + grass drawn
const bust = await dbg("debugBustDraw");
const lantern = (bust.lantern ?? []).find((m) => m.name === "lantern1_lantern_0");
if (!lantern?.visible || !lantern?.onCamera) fail(`Bust lantern GLB not drawn (${JSON.stringify(lantern)})`);
else ok("Bust lantern GLB drawn");
const blades = (bust.grass ?? []).find((m) => /blades/.test(m.name));
const count = Number(/\((\d+)\)/.exec(blades?.type ?? "")?.[1] ?? 0);
if (!blades?.visible || !blades?.onCamera || !(count > 0)) fail(`Bust grass not drawn (${JSON.stringify(blades)})`);
else ok(`Bust grass drawn (${count} blades)`);
// (d) stars under the tree (deterministic, in-page: scene depth, then stars only)
const st = await dbg("debugStarsOverMesh", "tripo_node*", 2);
if (!(st?.starPx > 0)) fail(`star test drew no stars at all (${JSON.stringify(st)})`);
else if (st.underMesh > 0) fail(`stars draw over the tree: ${st.underMesh} star pixels inside its mask (${st.starPx} star px total)`);
else ok(`no stars over the tree (${st.starPx} star px, 0 inside ${st.maskPx} mask px)`);
// Desktop
await hopTo(1);
await page.mouse.move(W * 0.06, H * 0.08);
await sleep(2500);
await checkStop(1);
await browser.close();
await server?.close();
if (failures.length) {
  console.log(`pass-q-check: FAILED (${failures.length})`);
  process.exit(1);
}
console.log("pass-q-check: passed");
