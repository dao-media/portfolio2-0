/**
 * STEP 0 — Measure CRT bezel opening (diagnosis).
 * Boots the live stage, inspects pc-Mesh_1 (bezel) + pc-Mesh_2 (phosphor)
 * for a clean rectangular inner opening. Prints JSON; exits 2 if unclean.
 *
 * Run: node scripts/crt-bezel-opening-measure.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5182;
const BOOT_MS = 90_000;

const server = await createServer({
  root: ROOT,
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false }
});
await server.listen();
const origin = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 50; i += 1) {
  try {
    const res = await fetch(origin);
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
    if (i === 49) throw new Error(`Vite did not accept connections on ${origin}`);
  }
}

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => {
    const stage = window.__stage;
    const desktop = stage?.vignettes?.[1]?.instance;
    return Boolean(
      stage &&
        stage.introComplete &&
        !stage.locked &&
        desktop?.pcRoot &&
        desktop?.screenMesh
    );
  },
  { timeout: BOOT_MS }
);

const report = await page.evaluate(() => {
  const THREE = window.__THREE ?? null;
  // Pull THREE from a mesh constructor chain
  const desktop = window.__stage.vignettes[1].instance;
  const pcRoot = desktop.pcRoot;
  const screen = desktop.screenMesh;
  const bezel =
    pcRoot.getObjectByName("pc-Mesh_1") ||
    pcRoot.getObjectByName("pc_Mesh_1");

  const meshNames = [];
  pcRoot.traverse((o) => {
    if (o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      meshNames.push({
        name: o.name,
        verts: o.geometry?.attributes?.position?.count ?? 0,
        mats: mats.map((m) => m?.name ?? "?")
      });
    }
  });

  if (!bezel?.isMesh || !screen?.isMesh) {
    return {
      ok: false,
      reason: "missing bezel or screen mesh",
      meshNames,
      bezelName: bezel?.name ?? null,
      screenName: screen?.name ?? null
    };
  }

  // --- helpers (no THREE import; use mesh math) ---
  const sPos = screen.geometry.attributes.position;
  const sNrm = screen.geometry.attributes.normal;
  const bPos = bezel.geometry.attributes.position;
  const bIdx = bezel.geometry.index;

  // Screen plane in SCREEN local space: avg normal + centroid
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
  // Prefer +Z facing if normals are ambiguous
  if (nz < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }

  // Orthonormal basis on the plane (right = up_world × n, up = n × right)
  let rx = 0;
  let ry = 1;
  let rz = 0;
  // cross(up, n)
  let rX = ry * nz - rz * ny;
  let rY = rz * nx - rx * nz;
  let rZ = rx * ny - ry * nx;
  let rLen = Math.hypot(rX, rY, rZ);
  if (rLen < 1e-6) {
    // n parallel to Y — use X
    rX = 1;
    rY = 0;
    rZ = 0;
    rLen = 1;
  }
  rX /= rLen;
  rY /= rLen;
  rZ /= rLen;
  // up = n × right
  let uX = ny * rZ - nz * rY;
  let uY = nz * rX - nx * rZ;
  let uZ = nx * rY - ny * rX;
  const uLen = Math.hypot(uX, uY, uZ) || 1;
  uX /= uLen;
  uY /= uLen;
  uZ /= uLen;

  // Transform bezel verts into screen local (bezel and screen share parent usually)
  screen.updateWorldMatrix(true, false);
  bezel.updateWorldMatrix(true, false);
  // THREE is the module used by the app — grab Matrix4 from any mesh
  const Matrix4 = screen.matrixWorld.constructor;
  const sInv = new Matrix4().copy(screen.matrixWorld).invert();
  const bToS = new Matrix4().multiplyMatrices(sInv, bezel.matrixWorld);

  const toScreenLocal = (x, y, z) => {
    const e = bToS.elements;
    return {
      x: e[0] * x + e[4] * y + e[8] * z + e[12],
      y: e[1] * x + e[5] * y + e[9] * z + e[13],
      z: e[2] * x + e[6] * y + e[10] * z + e[14]
    };
  };

  // Project point onto plane coords (u along right, v along up, d along normal from center)
  const project = (p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dz = p.z - cz;
    return {
      u: dx * rX + dy * rY + dz * rZ,
      v: dx * uX + dy * uY + dz * uZ,
      d: dx * nx + dy * ny + dz * nz
    };
  };

  // Screen AABB in plane coords (for reference)
  let sUMin = Infinity;
  let sUMax = -Infinity;
  let sVMin = Infinity;
  let sVMax = -Infinity;
  for (let i = 0; i < sPos.count; i += 1) {
    const pr = project({ x: sPos.getX(i), y: sPos.getY(i), z: sPos.getZ(i) });
    sUMin = Math.min(sUMin, pr.u);
    sUMax = Math.max(sUMax, pr.u);
    sVMin = Math.min(sVMin, pr.v);
    sVMax = Math.max(sVMax, pr.v);
  }

  // --- Cavity method on the BEZEL FRONT FACE ---
  // Depth histogram peaks near d≈0.02 (recess) and d≈0.16 (plastic front).
  // The visible square opening is the inner lip of that front face.
  const frontD0 = 0.12;
  const frontD1 = 0.22;
  const lipBand = Math.max(sUMax - sUMin, sVMax - sVMin) * 0.65;
  const vSlack = (sVMax - sVMin) * 0.35;
  const uSlack = (sUMax - sUMin) * 0.35;

  const frontPts = [];
  const recessPts = [];
  for (let i = 0; i < bPos.count; i += 1) {
    const p = toScreenLocal(bPos.getX(i), bPos.getY(i), bPos.getZ(i));
    const pr = project(p);
    if (pr.d >= frontD0 && pr.d <= frontD1) frontPts.push(pr);
    if (Math.abs(pr.d) <= 0.05) recessPts.push(pr);
  }

  const sideFilter = (pts) => ({
    right: pts.filter(
      (p) => p.u > sUMax && p.u < sUMax + lipBand && p.v > sVMin - vSlack && p.v < sVMax + vSlack
    ),
    left: pts.filter(
      (p) => p.u < sUMin && p.u > sUMin - lipBand && p.v > sVMin - vSlack && p.v < sVMax + vSlack
    ),
    top: pts.filter(
      (p) => p.v > sVMax && p.v < sVMax + lipBand && p.u > sUMin - uSlack && p.u < sUMax + uSlack
    ),
    bot: pts.filter(
      (p) => p.v < sVMin && p.v > sVMin - lipBand && p.u > sUMin - uSlack && p.u < sUMax + uSlack
    )
  });

  // Prefer front-face lips; fall back to recess for any missing side.
  const frontLips = sideFilter(frontPts);
  const recessLips = sideFilter(recessPts);
  const rightCands = frontLips.right.length >= 4 ? frontLips.right : recessLips.right;
  const leftCands = frontLips.left.length >= 4 ? frontLips.left : recessLips.left;
  const topCands = frontLips.top.length >= 4 ? frontLips.top : recessLips.top;
  const botCands = frontLips.bot.length >= 4 ? frontLips.bot : recessLips.bot;

  const percentile = (arr, q) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const i = Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))));
    return s[i];
  };

  const rightU = rightCands.length ? percentile(rightCands.map((p) => p.u), 0.1) : null;
  const leftU = leftCands.length ? percentile(leftCands.map((p) => p.u), 0.9) : null;
  const topV = topCands.length ? percentile(topCands.map((p) => p.v), 0.1) : null;
  const botV = botCands.length ? percentile(botCands.map((p) => p.v), 0.9) : null;

  // Also: among ALL front-face verts that lie in a ring outside the phosphor AABB,
  // take the AABB of the INNERMOST shell — verts with r just above screen half-diag.
  const screenHalfW = 0.5 * (sUMax - sUMin);
  const screenHalfH = 0.5 * (sVMax - sVMin);
  const ringPts = frontPts.filter((p) => {
    const au = Math.abs(p.u);
    const av = Math.abs(p.v);
    const outside = au > screenHalfW * 0.92 || av > screenHalfH * 0.92;
    const notFar = au < screenHalfW * 1.55 && av < screenHalfH * 1.55;
    return outside && notFar;
  });
  let ringAABB = null;
  if (ringPts.length >= 24) {
    // Innermost rectangle: for each side, take closest-to-center extent
    const rU = percentile(
      ringPts.filter((p) => p.u > screenHalfW * 0.5).map((p) => p.u),
      0.05
    );
    const lU = percentile(
      ringPts.filter((p) => p.u < -screenHalfW * 0.5).map((p) => p.u),
      0.95
    );
    const tV = percentile(
      ringPts.filter((p) => p.v > screenHalfH * 0.5).map((p) => p.v),
      0.05
    );
    const bV = percentile(
      ringPts.filter((p) => p.v < -screenHalfH * 0.5).map((p) => p.v),
      0.95
    );
    if (rU !== null && lU !== null && tV !== null && bV !== null) {
      ringAABB = {
        uMin: lU,
        uMax: rU,
        vMin: bV,
        vMax: tV,
        width: rU - lU,
        height: tV - bV,
        aspect: (rU - lU) / Math.max(tV - bV, 1e-8),
        count: ringPts.length,
        meanD: ringPts.reduce((s, p) => s + p.d, 0) / ringPts.length
      };
    }
  }

  const planePts = frontPts;
  const lipSource = {
    right: frontLips.right.length >= 4 ? "front" : "recess",
    left: frontLips.left.length >= 4 ? "front" : "recess",
    top: frontLips.top.length >= 4 ? "front" : "recess",
    bot: frontLips.bot.length >= 4 ? "front" : "recess"
  };

  const cavityFromLips =
    rightU !== null && leftU !== null && topV !== null && botV !== null
      ? {
          method: "bezel-front-face-lips-outside-phosphor-AABB",
          bezelMesh: bezel.name,
          screenMesh: screen.name,
          uMin: leftU,
          uMax: rightU,
          vMin: botV,
          vMax: topV,
          width: rightU - leftU,
          height: topV - botV,
          aspect: (rightU - leftU) / Math.max(topV - botV, 1e-8),
          centerU: (leftU + rightU) * 0.5,
          centerV: (botV + topV) * 0.5,
          meanD:
            [...rightCands, ...leftCands, ...topCands, ...botCands].reduce((s, p) => s + p.d, 0) /
            Math.max(rightCands.length + leftCands.length + topCands.length + botCands.length, 1),
          lipCounts: {
            right: rightCands.length,
            left: leftCands.length,
            top: topCands.length,
            bot: botCands.length
          },
          lipSource,
          insetVsScreen: {
            left: sUMin - leftU,
            right: rightU - sUMax,
            bot: sVMin - botV,
            top: topV - sVMax
          }
        }
      : null;

  const cavity =
    cavityFromLips ??
    (ringAABB
      ? {
          method: "bezel-front-face-inner-ring-AABB",
          bezelMesh: bezel.name,
          screenMesh: screen.name,
          uMin: ringAABB.uMin,
          uMax: ringAABB.uMax,
          vMin: ringAABB.vMin,
          vMax: ringAABB.vMax,
          width: ringAABB.width,
          height: ringAABB.height,
          aspect: ringAABB.aspect,
          centerU: (ringAABB.uMin + ringAABB.uMax) * 0.5,
          centerV: (ringAABB.vMin + ringAABB.vMax) * 0.5,
          meanD: ringAABB.meanD,
          lipCounts: { ring: ringAABB.count },
          lipSource: { all: "front-ring" },
          insetVsScreen: {
            left: sUMin - ringAABB.uMin,
            right: ringAABB.uMax - sUMax,
            bot: sVMin - ringAABB.vMin,
            top: ringAABB.vMax - sVMax
          }
        }
      : null);

  // Rectangularity check: cavity should be modestly larger than screen on all sides,
  // aspect near 4:3 / 1.3, and have enough lip samples.
  const lipOk =
    cavity &&
    ((cavity.lipCounts.right >= 4 &&
      cavity.lipCounts.left >= 4 &&
      cavity.lipCounts.top >= 4 &&
      cavity.lipCounts.bot >= 4) ||
      (cavity.lipCounts.ring ?? 0) >= 24);

  const cavityClean =
    cavity &&
    lipOk &&
    cavity.width > 0.1 &&
    cavity.height > 0.08 &&
    cavity.aspect > 1.15 &&
    cavity.aspect < 1.5 &&
    cavity.insetVsScreen.left > -0.005 &&
    cavity.insetVsScreen.right > -0.005 &&
    cavity.insetVsScreen.top > -0.005 &&
    cavity.insetVsScreen.bot > -0.005 &&
    cavity.width < (sUMax - sUMin) * 1.55 &&
    cavity.height < (sVMax - sVMin) * 1.55;

  const opening = cavityClean
    ? {
        method: cavity.method,
        bezelMesh: bezel.name,
        screenMesh: screen.name,
        centerLocal: {
          x: cx + cavity.centerU * rX + cavity.centerV * uX + cavity.meanD * nx,
          y: cy + cavity.centerU * rY + cavity.centerV * uY + cavity.meanD * ny,
          z: cz + cavity.centerU * rZ + cavity.centerV * uZ + cavity.meanD * nz
        },
        planeOffsetAlongNormal: cavity.meanD,
        width: cavity.width,
        height: cavity.height,
        aspect: cavity.aspect,
        normal: { x: nx, y: ny, z: nz },
        right: { x: rX, y: rY, z: rZ },
        up: { x: uX, y: uY, z: uZ },
        uvAABB: {
          uMin: cavity.uMin,
          uMax: cavity.uMax,
          vMin: cavity.vMin,
          vMax: cavity.vMax
        },
        lipCounts: cavity.lipCounts,
        insetVsScreen: cavity.insetVsScreen,
        derivation:
          "pc-Mesh_1 verts near the phosphor plane; innermost lip outside pc-Mesh_2 AABB on each side (10th/90th percentile)"
      }
    : null;

  // Debug: d histogram of all bezel verts in screen-local
  let dMin = Infinity;
  let dMax = -Infinity;
  const dBuckets = {};
  for (let i = 0; i < bPos.count; i += 1) {
    const p = toScreenLocal(bPos.getX(i), bPos.getY(i), bPos.getZ(i));
    const pr = project(p);
    dMin = Math.min(dMin, pr.d);
    dMax = Math.max(dMax, pr.d);
    const b = Math.round(pr.d * 100) / 100;
    dBuckets[b] = (dBuckets[b] || 0) + 1;
  }

  return {
    ok: Boolean(cavityClean),
    reason: cavityClean
      ? opening.derivation
      : "bezel cavity lips did not form a clean rectangle around the phosphor",
    meshNames,
    screenPlane: {
      center: { x: cx, y: cy, z: cz },
      normal: { x: nx, y: ny, z: nz },
      right: { x: rX, y: rY, z: rZ },
      up: { x: uX, y: uY, z: uZ },
      aabbUV: { sUMin, sUMax, sVMin, sVMax },
      screenWidth: sUMax - sUMin,
      screenHeight: sVMax - sVMin,
      screenAspect: (sUMax - sUMin) / Math.max(sVMax - sVMin, 1e-8)
    },
    bezelDepthRange: { dMin, dMax },
    bezelDepthBucketsTop: Object.entries(dBuckets)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12),
    planePtsNearScreen: planePts.length,
    frontPts: frontPts.length,
    recessPts: recessPts.length,
    ringAABB,
    lipProbe: {
      right: rightCands.length,
      left: leftCands.length,
      top: topCands.length,
      bot: botCands.length,
      rightU,
      leftU,
      topV,
      botV,
      lipSource
    },
    cavity,
    opening,
    canvasAspect130: 1024 / 788
  };
});

console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
process.exit(report.ok ? 0 : 2);
