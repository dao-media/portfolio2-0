/**
 * Offline Step-0 bezel opening probe — loads pc-from-source.glb directly (no Vite).
 * Run: node scripts/crt-bezel-opening-offline.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// GLTFLoader texture path expects a browser `self.URL`.
if (typeof globalThis.self === "undefined") globalThis.self = globalThis;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GLB = join(ROOT, "public/assets/models/pc-source/pc-from-source.glb");

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const buf = readFileSync(GLB);
const gltf = await new Promise((resolve, reject) => {
  loader.parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    pathToFileURL(join(ROOT, "public/assets/models/pc-source/")).href,
    resolve,
    reject
  );
});

const root = gltf.scene;
root.updateMatrixWorld(true);

const bezel = root.getObjectByName("pc-Mesh_1");
const screen = root.getObjectByName("pc-Mesh_2");
if (!bezel?.isMesh || !screen?.isMesh) {
  console.error("missing meshes", { bezel: bezel?.name, screen: screen?.name });
  process.exit(2);
}

// Flatten phosphor like runtime (rim plane) so opening is measured against the
// same face the glass shell sits on — import the same helper if possible.
// For offline we approximate: use authored screen as-is (pre-flatten). Opening
 // is relative to bezel; we'll also report vs screen AABB.

const sPos = screen.geometry.attributes.position;
const sNrm = screen.geometry.attributes.normal;
const bPos = bezel.geometry.attributes.position;

let cx = 0;
let cy = 0;
let cz = 0;
let nx = 0;
let ny = 0;
let nz = 0;
for (let i = 0; i < sPos.count; i += 1) {
  cx += sPos.getX(i);
  cy += sPos.getY(i);
  cz += sPos.getZ(i);
  if (sNrm) {
    nx += sNrm.getX(i);
    ny += sNrm.getY(i);
    nz += sNrm.getZ(i);
  }
}
const invS = 1 / sPos.count;
cx *= invS;
cy *= invS;
cz *= invS;
let nLen = Math.hypot(nx, ny, nz) || 1;
nx /= nLen;
ny /= nLen;
nz /= nLen;
if (nz < 0) {
  nx = -nx;
  ny = -ny;
  nz = -nz;
}

let rX = 0;
let rY = 1;
let rZ = 0;
let rx = rY * nz - rZ * ny;
let ry = rZ * nx - rX * nz;
let rz = rX * ny - rY * nx;
let rLen = Math.hypot(rx, ry, rz);
if (rLen < 1e-6) {
  rx = 1;
  ry = 0;
  rz = 0;
  rLen = 1;
}
rx /= rLen;
ry /= rLen;
rz /= rLen;
let uX = ny * rz - nz * ry;
let uY = nz * rx - nx * rz;
let uZ = nx * ry - ny * rx;
const uLen = Math.hypot(uX, uY, uZ) || 1;
uX /= uLen;
uY /= uLen;
uZ /= uLen;

const sInv = new THREE.Matrix4().copy(screen.matrixWorld).invert();
const bToS = new THREE.Matrix4().multiplyMatrices(sInv, bezel.matrixWorld);

function toScreenLocal(x, y, z) {
  const e = bToS.elements;
  return {
    x: e[0] * x + e[4] * y + e[8] * z + e[12],
    y: e[1] * x + e[5] * y + e[9] * z + e[13],
    z: e[2] * x + e[6] * y + e[10] * z + e[14]
  };
}
function project(p) {
  const dx = p.x - cx;
  const dy = p.y - cy;
  const dz = p.z - cz;
  return {
    u: dx * rx + dy * ry + dz * rz,
    v: dx * uX + dy * uY + dz * uZ,
    d: dx * nx + dy * ny + dz * nz
  };
}

let sUMin = Infinity;
let sUMax = -Infinity;
let sVMin = Infinity;
let sVMax = -Infinity;
let sDMin = Infinity;
let sDMax = -Infinity;
for (let i = 0; i < sPos.count; i += 1) {
  const pr = project({ x: sPos.getX(i), y: sPos.getY(i), z: sPos.getZ(i) });
  sUMin = Math.min(sUMin, pr.u);
  sUMax = Math.max(sUMax, pr.u);
  sVMin = Math.min(sVMin, pr.v);
  sVMax = Math.max(sVMax, pr.v);
  sDMin = Math.min(sDMin, pr.d);
  sDMax = Math.max(sDMax, pr.d);
}

// Use SCREEN RIM (UV edge) as the phosphor silhouette for opening comparison —
// AABB of rounded face understates corner reach; rim is the flat lip after flatten.
const uv = screen.geometry.attributes.uv;
const rimUv = 0.08;
let rimUMin = Infinity;
let rimUMax = -Infinity;
let rimVMin = Infinity;
let rimVMax = -Infinity;
let rimDSum = 0;
let rimN = 0;
if (uv) {
  for (let i = 0; i < sPos.count; i += 1) {
    const uu = uv.getX(i);
    const vv = uv.getY(i);
    if (!(uu < rimUv || uu > 1 - rimUv || vv < rimUv || vv > 1 - rimUv)) continue;
    const pr = project({ x: sPos.getX(i), y: sPos.getY(i), z: sPos.getZ(i) });
    rimUMin = Math.min(rimUMin, pr.u);
    rimUMax = Math.max(rimUMax, pr.u);
    rimVMin = Math.min(rimVMin, pr.v);
    rimVMax = Math.max(rimVMax, pr.v);
    rimDSum += pr.d;
    rimN += 1;
  }
}

let bUMin = Infinity;
let bUMax = -Infinity;
let bVMin = Infinity;
let bVMax = -Infinity;
let nAbove = 0;
let nFrontAbove = 0;
const dHist = {};
const allPts = [];
for (let i = 0; i < bPos.count; i += 1) {
  const p = toScreenLocal(bPos.getX(i), bPos.getY(i), bPos.getZ(i));
  const pr = project(p);
  allPts.push(pr);
  bUMin = Math.min(bUMin, pr.u);
  bUMax = Math.max(bUMax, pr.u);
  bVMin = Math.min(bVMin, pr.v);
  bVMax = Math.max(bVMax, pr.v);
  if (pr.v > sVMax) nAbove += 1;
  const b = (Math.round(pr.d * 50) / 50).toFixed(2);
  dHist[b] = (dHist[b] || 0) + 1;
  if (pr.d >= 0.05 && pr.d <= 0.25 && pr.v > sVMax) nFrontAbove += 1;
}

function percentile(arr, q) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
}

/** Innermost bezel lip outside a given AABB, searching all depths then refining. */
function measureLips(uMin, uMax, vMin, vMax, label) {
  const band = Math.max(uMax - uMin, vMax - vMin) * 0.7;
  const vSlack = (vMax - vMin) * 0.45;
  const uSlack = (uMax - uMin) * 0.45;

  // Prefer verts in front of the phosphor bulge (d > sDMax - epsilon)
  const frontish = allPts.filter((p) => p.d > sDMax - 0.02);
  const pool = frontish.length > 100 ? frontish : allPts;

  const right = pool.filter(
    (p) => p.u > uMax && p.u < uMax + band && p.v > vMin - vSlack && p.v < vMax + vSlack
  );
  const left = pool.filter(
    (p) => p.u < uMin && p.u > uMin - band && p.v > vMin - vSlack && p.v < vMax + vSlack
  );
  const top = pool.filter(
    (p) => p.v > vMax && p.v < vMax + band && p.u > uMin - uSlack && p.u < uMax + uSlack
  );
  const bot = pool.filter(
    (p) => p.v < vMin && p.v > vMin - band && p.u > uMin - uSlack && p.u < uMax + uSlack
  );

  const rightU = right.length ? percentile(right.map((p) => p.u), 0.08) : null;
  const leftU = left.length ? percentile(left.map((p) => p.u), 0.92) : null;
  const topV = top.length ? percentile(top.map((p) => p.v), 0.08) : null;
  const botV = bot.length ? percentile(bot.map((p) => p.v), 0.92) : null;

  if (rightU == null || leftU == null || topV == null || botV == null) {
    return {
      label,
      ok: false,
      counts: { right: right.length, left: left.length, top: top.length, bot: bot.length },
      rightU,
      leftU,
      topV,
      botV,
      pool: pool.length
    };
  }

  const width = rightU - leftU;
  const height = topV - botV;
  const lips = [...right, ...left, ...top, ...bot];
  return {
    label,
    ok: true,
    counts: { right: right.length, left: left.length, top: top.length, bot: bot.length },
    width,
    height,
    aspect: width / Math.max(height, 1e-8),
    uMin: leftU,
    uMax: rightU,
    vMin: botV,
    vMax: topV,
    centerU: (leftU + rightU) * 0.5,
    centerV: (botV + topV) * 0.5,
    meanD: lips.reduce((s, p) => s + p.d, 0) / lips.length,
    inset: {
      left: uMin - leftU,
      right: rightU - uMax,
      bot: vMin - botV,
      top: topV - vMax
    },
    pool: pool.length
  };
}

const vsScreen = measureLips(sUMin, sUMax, sVMin, sVMax, "vs-screen-AABB");
const vsRim =
  rimN > 8 ? measureLips(rimUMin, rimUMax, rimVMin, rimVMax, "vs-screen-UV-rim") : null;

// Corner probe: from each phosphor AABB corner, find nearest bezel vert in the
// outward quadrant (proves rectangular corners exist in the plastic).
function cornerProbe(cu, cv, ou, ov) {
  let best = Infinity;
  let bestP = null;
  for (const p of allPts) {
    if (p.d < sDMax - 0.02) continue;
    const du = (p.u - cu) * ou;
    const dv = (p.v - cv) * ov;
    if (du < -0.002 || dv < -0.002) continue;
    if (du > 0.1 || dv > 0.1) continue;
    const dist = Math.hypot(Math.max(du, 0), Math.max(dv, 0));
    if (dist < best) {
      best = dist;
      bestP = p;
    }
  }
  return { dist: best === Infinity ? null : best, hit: bestP };
}

const corners = {
  TR: cornerProbe(sUMax, sVMax, +1, +1),
  TL: cornerProbe(sUMin, sVMax, -1, +1),
  BR: cornerProbe(sUMax, sVMin, +1, -1),
  BL: cornerProbe(sUMin, sVMin, -1, -1)
};

const report = {
  screenLocal: {
    center: { x: cx, y: cy, z: cz },
    normal: { x: nx, y: ny, z: nz },
    right: { x: rx, y: ry, z: rz },
    up: { x: uX, y: uY, z: uZ },
    aabb: { sUMin, sUMax, sVMin, sVMax, sDMin, sDMax },
    size: { w: sUMax - sUMin, h: sVMax - sVMin, aspect: (sUMax - sUMin) / (sVMax - sVMin) },
    rimAABB:
      rimN > 8
        ? {
            rimUMin,
            rimUMax,
            rimVMin,
            rimVMax,
            w: rimUMax - rimUMin,
            h: rimVMax - rimVMin,
            aspect: (rimUMax - rimUMin) / (rimVMax - rimVMin),
            meanD: rimDSum / rimN,
            n: rimN
          }
        : null
  },
  bezelExtents: { bUMin, bUMax, bVMin, bVMax, nAboveScreenTop: nAbove, nFrontAbove },
  dHistTop: Object.entries(dHist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15),
  vsScreen,
  vsRim,
  corners,
  canvasAspect130: 1024 / 788
};

console.log(JSON.stringify(report, null, 2));

const candidate = vsRim?.ok ? vsRim : vsScreen?.ok ? vsScreen : null;
const clean =
  candidate &&
  candidate.aspect > 1.15 &&
  candidate.aspect < 1.5 &&
  candidate.inset.left > -0.002 &&
  candidate.inset.right > -0.002 &&
  candidate.inset.top > -0.002 &&
  candidate.inset.bot > -0.002 &&
  candidate.counts.top >= 4 &&
  corners.TR.dist != null &&
  corners.TL.dist != null &&
  corners.BR.dist != null &&
  corners.BL.dist != null;

console.log("\n--- ASYMMETRIC OPENING (CRT chin; top flush with phosphor) ---");
{
  const band = Math.max(sUMax - sUMin, sVMax - sVMin) * 0.7;
  const vSlack = (sVMax - sVMin) * 0.45;
  const uSlack = (sUMax - sUMin) * 0.45;
  const pool = allPts.filter((p) => p.d > sDMax - 0.02);
  const right = pool.filter(
    (p) => p.u > sUMax && p.u < sUMax + band && p.v > sVMin - vSlack && p.v < sVMax + vSlack
  );
  const left = pool.filter(
    (p) => p.u < sUMin && p.u > sUMin - band && p.v > sVMin - vSlack && p.v < sVMax + vSlack
  );
  const bot = pool.filter(
    (p) => p.v < sVMin && p.v > sVMin - band && p.u > sUMin - uSlack && p.u < sUMax + uSlack
  );
  const rightU = percentile(right.map((p) => p.u), 0.08);
  const leftU = percentile(left.map((p) => p.u), 0.92);
  const botV = percentile(bot.map((p) => p.v), 0.92);
  // Top brow: max v among bezel verts spanning the screen u-range (may be ≤ sVMax)
  const browSpan = allPts.filter(
    (p) => p.u >= leftU && p.u <= rightU && p.v > sVMax - 0.04 && p.d > sDMin - 0.05
  );
  const topV = browSpan.length
    ? percentile(
        browSpan.map((p) => p.v),
        0.95
      )
    : sVMax;

  const width = rightU - leftU;
  const height = topV - botV;
  const aspect = width / Math.max(height, 1e-8);
  const opening = {
    method: "asymmetric-cavity-L/R/B-lips + top-brow-or-phosphor",
    bezelMesh: "pc-Mesh_1",
    screenMesh: "pc-Mesh_2",
    width,
    height,
    aspect,
    uMin: leftU,
    uMax: rightU,
    vMin: botV,
    vMax: topV,
    centerU: (leftU + rightU) * 0.5,
    centerV: (botV + topV) * 0.5,
    meanD: [...right, ...left, ...bot, ...browSpan].reduce((s, p) => s + p.d, 0) /
      Math.max(right.length + left.length + bot.length + browSpan.length, 1),
    counts: { right: right.length, left: left.length, bot: bot.length, brow: browSpan.length },
    insetVsScreen: {
      left: sUMin - leftU,
      right: rightU - sUMax,
      bot: sVMin - botV,
      top: topV - sVMax
    },
    normal: { x: nx, y: ny, z: nz },
    right: { x: rx, y: ry, z: rz },
    up: { x: uX, y: uY, z: uZ },
    screenCenter: { x: cx, y: cy, z: cz },
    note:
      "No bezel verts above the phosphor in the screen u-span; top of opening = brow/phosphor top. L/R/B lips from pc-Mesh_1 outside phosphor AABB."
  };

  // Clean enough? Rectangle with aspect ~1.3, positive L/R/B insets, top inset >= -2mm
  const ok =
    width > 0.2 &&
    height > 0.15 &&
    aspect > 1.15 &&
    aspect < 1.45 &&
    opening.insetVsScreen.left > 0.01 &&
    opening.insetVsScreen.right > 0.01 &&
    opening.insetVsScreen.bot > 0.01 &&
    opening.insetVsScreen.top > -0.005 &&
    right.length >= 8 &&
    left.length >= 8 &&
    bot.length >= 8;

  console.log(JSON.stringify({ ok, opening, canvasAspect130: 1024 / 788 }, null, 2));
  console.log("\n--- VERDICT ---");
  if (ok) {
    console.log(
      `CLEAN (asymmetric CRT) opening: ${width.toFixed(4)} × ${height.toFixed(4)} m, aspect ${aspect.toFixed(4)}`
    );
    process.exit(0);
  }
  console.log("NO CLEAN RECTANGULAR OPENING — stop per Step 0");
  process.exit(2);
}
