/**
 * TEMP Sidekick material diagnosis — NO committed pipeline fixes.
 * Run: node scripts/sidekick-material-diagnose.mjs
 * Writes public/debug/sidekick-*.png + sidekick-material-report.json
 * Does not leave permanent code changes in src/.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

if (typeof globalThis.self === "undefined") globalThis.self = globalThis;

const ROOT = process.cwd();
const OUT = join(ROOT, "public/debug");
const GLB = join(ROOT, "public/assets/models/sidekick/Sidekick3.glb");
const PORT = 5176;
const BOOT_MS = 90_000;
const HOP_MS = 25_000;

mkdirSync(OUT, { recursive: true });

function matInfo(mat) {
  if (!mat) return null;
  const tex = (t) =>
    t
      ? {
          uuid: t.uuid,
          name: t.name || null,
          image:
            t.image?.width && t.image?.height
              ? `${t.image.width}x${t.image.height}`
              : t.image
                ? "pending"
                : null
        }
      : null;
  return {
    uuid: mat.uuid,
    name: mat.name || null,
    type: mat.type,
    transparent: Boolean(mat.transparent),
    opacity: mat.opacity,
    alphaTest: mat.alphaTest,
    side: mat.side,
    metalness: mat.metalness,
    roughness: mat.roughness,
    depthTest: mat.depthTest,
    depthWrite: mat.depthWrite,
    map: tex(mat.map),
    emissiveMap: tex(mat.emissiveMap),
    normalMap: tex(mat.normalMap),
    bumpMap: tex(mat.bumpMap),
    alphaMap: tex(mat.alphaMap),
    userData: {
      sidekickKeypadProtected: Boolean(mat.userData?.sidekickKeypadProtected),
      sidekickKeypadMaterial: Boolean(mat.userData?.sidekickKeypadMaterial)
    }
  };
}

function meshReport(obj) {
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  const geo = obj.geometry;
  const attrs = geo?.attributes ? Object.keys(geo.attributes) : [];
  const hasTangent = Boolean(geo?.attributes?.tangent);
  const hasNormal = Boolean(geo?.attributes?.normal);
  return {
    name: obj.name,
    visible: obj.visible,
    renderOrder: obj.renderOrder,
    vertCount: geo?.attributes?.position?.count ?? 0,
    attributes: attrs,
    hasTangent,
    hasNormal,
    materials: mats.map(matInfo),
    materialUuids: mats.map((m) => m?.uuid ?? null),
    normalMapWithoutTangent: mats.some((m) => m?.normalMap && !hasTangent)
  };
}

// --- Offline GLB graph ---
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const buf = readFileSync(GLB);
const gltf = await new Promise((resolve, reject) => {
  loader.parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    pathToFileURL(join(ROOT, "public/assets/models/sidekick/")).href,
    resolve,
    reject
  );
});

const interest =
  /button|key|cover|screen|keyboard|call|end|phong|label|text|dial|soft/i;
const meshes = [];
const matOwners = new Map(); // uuid -> mesh names

gltf.scene.traverse((obj) => {
  if (!obj.isMesh) return;
  const report = meshReport(obj);
  meshes.push(report);
  for (const uuid of report.materialUuids) {
    if (!uuid) continue;
    if (!matOwners.has(uuid)) matOwners.set(uuid, []);
    matOwners.get(uuid).push(obj.name);
  }
});

const interesting = meshes.filter(
  (m) =>
    interest.test(m.name) ||
    m.normalMapWithoutTangent ||
    m.materials.some((mat) => mat && (mat.name === "phong3" || mat.opacity < 0.05 || mat.alphaTest > 0))
);

const shared = [...matOwners.entries()]
  .filter(([, names]) => names.length > 1)
  .map(([uuid, names]) => {
    const sample = meshes.find((m) => m.materialUuids.includes(uuid));
    return {
      uuid,
      materialName: sample?.materials.find((m) => m?.uuid === uuid)?.name ?? null,
      meshes: names
    };
  });

const offlineReport = {
  meshCount: meshes.length,
  interesting,
  sharedMaterialInstances: shared,
  allMeshNames: meshes.map((m) => m.name).sort()
};

writeFileSync(join(OUT, "sidekick-material-offline.json"), JSON.stringify(offlineReport, null, 2));
console.log("Offline: meshes", meshes.length, "shared mats", shared.length);
console.log(
  "Interesting:",
  interesting.map((m) => `${m.name} mat=${m.materials.map((x) => x?.name).join(",")}`).join("\n")
);

// --- Live stage probes ---
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
    if (i === 49) throw new Error("vite failed");
  }
}

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleLogs = [];
page.on("console", (msg) => {
  const t = msg.text();
  if (t.includes("[SidekickDiag]")) consoleLogs.push(t);
});

await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => {
    const s = window.__stage;
    return Boolean(
      s?.introComplete &&
        !s.locked &&
        s.cameraRig?.state?.isSettled &&
        s.vignettes?.[2]?.instance?._aligned
    );
  },
  { timeout: BOOT_MS }
);

await page.evaluate(() => window.__stage.goTo(2));
await page.waitForFunction(
  () =>
    window.__stage?.cameraRig?.state?.isSettled &&
    window.__stage?.cameraRig?.state?.index === 2,
  { timeout: HOP_MS }
);
await page.waitForTimeout(600);

const liveGraph = await page.evaluate(() => {
  const sk = window.__stage.vignettes[2].instance;
  const root = sk.phoneRoot || sk.sidekickRoot;
  const rows = [];
  const owners = new Map();

  const tex = (t) =>
    t
      ? {
          uuid: t.uuid,
          name: t.name || null,
          w: t.image?.width ?? t.image?.naturalWidth ?? null,
          h: t.image?.height ?? t.image?.naturalHeight ?? null,
          generateMipmaps: t.generateMipmaps,
          minFilter: t.minFilter,
          magFilter: t.magFilter
        }
      : null;

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const hasTangent = Boolean(obj.geometry?.attributes?.tangent);
    const info = {
      name: obj.name,
      visible: obj.visible,
      renderOrder: obj.renderOrder,
      verts: obj.geometry?.attributes?.position?.count ?? 0,
      attrs: obj.geometry?.attributes ? Object.keys(obj.geometry.attributes) : [],
      hasTangent,
      mats: mats.map((m) =>
        m
          ? {
              uuid: m.uuid,
              name: m.name,
              type: m.type,
              transparent: m.transparent,
              opacity: m.opacity,
              alphaTest: m.alphaTest,
              side: m.side,
              metalness: m.metalness,
              roughness: m.roughness,
              depthTest: m.depthTest,
              depthWrite: m.depthWrite,
              map: tex(m.map),
              normalMap: tex(m.normalMap),
              bumpMap: tex(m.bumpMap),
              alphaMap: tex(m.alphaMap),
              protected: Boolean(m.userData?.sidekickKeypadProtected)
            }
          : null
      ),
      normalMapWithoutTangent: mats.some((m) => m?.normalMap && !hasTangent)
    };
    rows.push(info);
    for (const m of mats) {
      if (!m) continue;
      if (!owners.has(m.uuid)) owners.set(m.uuid, { name: m.name, meshes: [] });
      owners.get(m.uuid).meshes.push(obj.name);
    }
  });

  const shared = [...owners.entries()]
    .filter(([, v]) => v.meshes.length > 1)
    .map(([uuid, v]) => ({ uuid, materialName: v.name, meshes: v.meshes }));

  const keypad = sk.debugKeypad?.() ?? null;
  const labels = (sk._keyboardLabelMeshes || []).map((m) => ({
    name: m.name,
    visible: m.visible,
    mat: m.material?.name,
    type: m.material?.type,
    transparent: m.material?.transparent,
    alphaTest: m.material?.alphaTest,
    depthTest: m.material?.depthTest,
    hasMap: Boolean(m.material?.map),
    mapSize: m.material?.map?.image
      ? `${m.material.map.image.width}x${m.material.map.image.height}`
      : null
  }));

  return {
    aligned: sk._aligned,
    isOpen: sk.isOpen,
    swivelProgress: sk._swivelProgress ?? null,
    keypad,
    labels,
    shared,
    interesting: rows.filter(
      (r) =>
        /button|key|cover|keyboard|call|end|text|screen|soft|dial/i.test(r.name) ||
        r.normalMapWithoutTangent ||
        r.mats.some((m) => m && (m.name === "phong3" || m.opacity < 0.05))
    ),
    allNames: rows.map((r) => r.name).sort()
  };
});

writeFileSync(join(OUT, "sidekick-material-live.json"), JSON.stringify(liveGraph, null, 2));
console.log("\nLive shared:", JSON.stringify(liveGraph.shared, null, 2));
console.log("Live interesting count", liveGraph.interesting.length);
console.log(
  "normalMapWithoutTangent:",
  liveGraph.interesting.filter((r) => r.normalMapWithoutTangent).map((r) => r.name)
);

// Failure A probe: strip normalMaps on Buttons (+ related) temporarily, screenshot, restore
const failureA = await page.evaluate(() => {
  const sk = window.__stage.vignettes[2].instance;
  const root = sk.phoneRoot;
  const stripped = [];
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (!/button|Buttons|call|end|soft/i.test(obj.name) && obj.name !== "Buttons") return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m, i) => {
      if (!m?.normalMap) return;
      const key = `${obj.name}#${i}`;
      if (!obj.userData.__diagNormalBackup) obj.userData.__diagNormalBackup = {};
      obj.userData.__diagNormalBackup[i] = m.normalMap;
      m.normalMap = null;
      m.needsUpdate = true;
      stripped.push({
        mesh: obj.name,
        mat: m.name,
        hadTangent: Boolean(obj.geometry?.attributes?.tangent)
      });
    });
  });
  return stripped;
});

await page.waitForTimeout(200);
const shotA = await page.locator("#scene-canvas").screenshot({ type: "png" });
writeFileSync(join(OUT, "sidekick-buttons-nonormal.png"), shotA);
console.log("Wrote sidekick-buttons-nonormal.png; stripped", failureA);

// Restore normals
await page.evaluate(() => {
  const sk = window.__stage.vignettes[2].instance;
  sk.phoneRoot.traverse((obj) => {
    const backup = obj.userData?.__diagNormalBackup;
    if (!backup) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const [i, tex] of Object.entries(backup)) {
      const mat = mats[Number(i)];
      if (mat) {
        mat.normalMap = tex;
        mat.needsUpdate = true;
      }
    }
    delete obj.userData.__diagNormalBackup;
  });
});

// Failure B: open phone, instrument ensure/repair, far vs near shots
await page.evaluate(() => {
  const sk = window.__stage.vignettes[2].instance;
  // TEMP instrumentation — reverted before exit via page close / restore wraps
  if (!sk.__diagWrapped) {
    sk.__diagWrapped = true;
    sk.__diagLog = [];
    const wrap = (name, fn) => {
      sk[name] = function (...args) {
        const before = {
          t: performance.now(),
          event: name,
          isOpen: this.isOpen,
          labels: (this._keyboardLabelMeshes || []).map((m) => ({
            n: m.name,
            v: m.visible,
            mat: m.material?.name,
            type: m.material?.type,
            depthTest: m.material?.depthTest,
            alphaTest: m.material?.alphaTest
          })),
          buttons: this.debugKeypad?.()
        };
        const result = fn.apply(this, args);
        const afterButtons = this.phoneRoot?.getObjectByName?.("Buttons");
        const afterMat = afterButtons
          ? Array.isArray(afterButtons.material)
            ? afterButtons.material[0]
            : afterButtons.material
          : null;
        sk.__diagLog.push({
          ...before,
          afterMat: afterMat?.name,
          afterProtected: Boolean(afterMat?.userData?.sidekickKeypadProtected),
          afterSameAsPinned: afterButtons?.userData?.sidekickKeypadMaterial === afterMat
        });
        if (sk.__diagLog.length > 80) sk.__diagLog.shift();
        return result;
      };
    };
    // Can't easily wrap imported ensure — wrap update which calls it
    const origUpdate = sk.update.bind(sk);
    let updateN = 0;
    sk.update = function (time) {
      updateN += 1;
      const pinned = this.phoneRoot?.getObjectByName?.("Buttons")?.userData?.sidekickKeypadMaterial;
      const cur = this.phoneRoot?.getObjectByName?.("Buttons")?.material;
      const healthy =
        pinned && cur === pinned && pinned.name === "sidekick_keypad_opaque";
      if (!healthy || updateN % 30 === 0) {
        this.__diagLog.push({
          t: performance.now(),
          event: "update",
          updateN,
          healthy,
          curMat: cur?.name,
          pinnedMat: pinned?.name,
          focus: window.__stage.focusBlend,
          isOpen: this.isOpen,
          labels: (this._keyboardLabelMeshes || []).map((m) => ({
            n: m.name,
            v: m.visible,
            depthTest: m.material?.depthTest
          }))
        });
        if (this.__diagLog.length > 120) this.__diagLog.shift();
      }
      return origUpdate(time);
    };

    const origSync = sk._syncKeyboardLabelVisibility?.bind(sk);
    if (origSync) {
      sk._syncKeyboardLabelVisibility = function (progress) {
        const r = origSync(progress);
        this.__diagLog.push({
          t: performance.now(),
          event: "_syncKeyboardLabelVisibility",
          progress,
          labels: (this._keyboardLabelMeshes || []).map((m) => ({
            n: m.name,
            v: m.visible,
            depthTest: m.material?.depthTest,
            alphaTest: m.material?.alphaTest
          }))
        });
        return r;
      };
    }

    const origApply = sk._applyDisplayState?.bind(sk);
    if (origApply) {
      sk._applyDisplayState = function (progress) {
        const before = this.phoneRoot?.getObjectByName?.("Buttons")?.material?.name;
        const r = origApply(progress);
        const after = this.phoneRoot?.getObjectByName?.("Buttons")?.material?.name;
        if (before !== after) {
          this.__diagLog.push({
            t: performance.now(),
            event: "_applyDisplayState_matChange",
            progress,
            before,
            after
          });
        }
        return r;
      };
    }
  }
  sk.playSlideOpen?.();
});

await page.waitForTimeout(1500);
await page.waitForFunction(() => window.__stage.vignettes[2].instance.isOpen === true, {
  timeout: HOP_MS
});
await page.waitForTimeout(400);

const openState = await page.evaluate(() => {
  const sk = window.__stage.vignettes[2].instance;
  const kt = sk.phoneRoot?.getObjectByName?.("KeyboardText");
  const mat = kt?.material;
  let mipAlpha = null;
  if (mat?.map?.image) {
    const img = mat.map.image;
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const full = ctx.getImageData(0, 0, c.width, c.height).data;
    let a0 = 0;
    let aNon = 0;
    for (let i = 3; i < full.length; i += 4) {
      if (full[i] === 0) a0 += 1;
      else aNon += 1;
    }
    // Coarse mip proxy: draw scaled down then back — sample alpha coverage
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.floor(img.width / 16));
    small.height = Math.max(1, Math.floor(img.height / 16));
    const sctx = small.getContext("2d");
    sctx.drawImage(img, 0, 0, small.width, small.height);
    const sd = sctx.getImageData(0, 0, small.width, small.height).data;
    let s0 = 0;
    let sNon = 0;
    for (let i = 3; i < sd.length; i += 4) {
      if (sd[i] === 0) s0 += 1;
      else sNon += 1;
    }
    mipAlpha = {
      fullZeroFrac: a0 / (a0 + aNon),
      fullNonZero: aNon,
      mip16ZeroFrac: s0 / (s0 + sNon),
      mip16NonZero: sNon,
      size: `${img.width}x${img.height}`,
      generateMipmaps: mat.map.generateMipmaps,
      minFilter: mat.map.minFilter,
      alphaTest: mat.alphaTest
    };
  }
  return {
    isOpen: sk.isOpen,
    focus: window.__stage.focusBlend,
    keyboardText: kt
      ? {
          visible: kt.visible,
          mat: mat?.name,
          type: mat?.type,
          transparent: mat?.transparent,
          alphaTest: mat?.alphaTest,
          depthTest: mat?.depthTest,
          hasMap: Boolean(mat?.map)
        }
      : null,
    mipAlpha,
    keypad: sk.debugKeypad?.(),
    recentLog: (sk.__diagLog || []).slice(-25)
  };
});

writeFileSync(join(OUT, "sidekick-failure-b-open.json"), JSON.stringify(openState, null, 2));

// Far shot (rest zoom out on open phone) — already at rest focus ~0
const shotFar = await page.locator("#scene-canvas").screenshot({ type: "png" });
writeFileSync(join(OUT, "sidekick-keys-far.png"), shotFar);

// Near: zoom in
await page.evaluate(() => {
  const sk = window.__stage;
  // Click-zoom path
  sk.cameraRig?.zoomIn?.(2);
});
await page.waitForFunction(() => window.__stage.focusBlend > 0.85, { timeout: HOP_MS });
await page.waitForTimeout(500);

const nearState = await page.evaluate(() => {
  const sk = window.__stage.vignettes[2].instance;
  const kt = sk.phoneRoot?.getObjectByName?.("KeyboardText");
  return {
    focus: window.__stage.focusBlend,
    isZoomed: window.__stage.cameraRig?.state?.isZoomed,
    keyboardText: kt
      ? {
          visible: kt.visible,
          mat: kt.material?.name,
          type: kt.material?.type,
          transparent: kt.material?.transparent,
          alphaTest: kt.material?.alphaTest,
          depthTest: kt.material?.depthTest,
          opacity: kt.material?.opacity,
          renderOrder: kt.renderOrder
        }
      : null,
    keypad: sk.debugKeypad?.(),
    recentLog: (sk.__diagLog || []).slice(-40),
    unhealthyUpdates: (sk.__diagLog || []).filter((e) => e.event === "update" && e.healthy === false)
      .length,
    matChangeEvents: (sk.__diagLog || []).filter((e) => e.event === "_applyDisplayState_matChange")
  };
});

const shotNear = await page.locator("#scene-canvas").screenshot({ type: "png" });
writeFileSync(join(OUT, "sidekick-keys-near.png"), shotNear);
writeFileSync(join(OUT, "sidekick-failure-b-near.json"), JSON.stringify(nearState, null, 2));

// Failure C ordering risk — static code path report assembled below from source knowledge
const failureC = await page.evaluate(() => {
  const sk = window.__stage.vignettes[2].instance;
  return {
    hasSmsScreen: Boolean(sk.smsScreen),
    screenMeshMat: sk.screenMesh?.material?.name ?? null,
    updateCallsEnsure: true,
    notes:
      "Screen texture bake (_applyScreenTexture) does not call repair; close playSlideClose → _applyDisplayState → _syncKeyboardLabelVisibility. Reveal setGroupRenderOpacity stamps opacity on ALL materials including keypad."
  };
});

const report = {
  offline: {
    sharedMaterialInstances: offlineReport.sharedMaterialInstances,
    interestingSummary: offlineReport.interesting.map((m) => ({
      name: m.name,
      mats: m.materials.map((x) => x?.name),
      normalMapWithoutTangent: m.normalMapWithoutTangent,
      hasTangent: m.hasTangent,
      maps: m.materials.map((x) => ({
        name: x?.name,
        map: x?.map,
        normalMap: x?.normalMap,
        bumpMap: x?.bumpMap,
        opacity: x?.opacity,
        alphaTest: x?.alphaTest,
        transparent: x?.transparent,
        metalness: x?.metalness,
        roughness: x?.roughness,
        side: x?.side,
        type: x?.type
      }))
    }))
  },
  live: liveGraph,
  failureA: {
    stripped: failureA,
    screenshot: "public/debug/sidekick-buttons-nonormal.png",
    theory:
      "§20.11: normalMap without tangents → black/speckle. Confirmed if buttons look lit in nonormal shot."
  },
  failureB: {
    open: openState,
    near: nearState,
    screenshots: {
      far: "public/debug/sidekick-keys-far.png",
      near: "public/debug/sidekick-keys-near.png"
    }
  },
  failureC,
  consoleLogs
};

writeFileSync(join(OUT, "sidekick-material-report.json"), JSON.stringify(report, null, 2));
console.log("\n=== REPORT WRITTEN ===", join(OUT, "sidekick-material-report.json"));
console.log("Failure A stripped:", failureA);
console.log("Failure B keyboard far:", openState.keyboardText);
console.log("Failure B keyboard near:", nearState.keyboardText);
console.log("Unhealthy update frames:", nearState.unhealthyUpdates);
console.log("Mat change during display:", nearState.matChangeEvents);

await browser.close();
await server.close();
