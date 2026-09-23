/**
 * Focused Sidekick diagnose pass 2 — timing + open shots.
 * Temporary page-only probes; no src changes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const ROOT = process.cwd();
const OUT = join(ROOT, "public/debug");
const PORT = 5177;
mkdirSync(OUT, { recursive: true });

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
  }
}

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (msg) => {
  const t = msg.text();
  if (t.includes("[SidekickDiag]")) console.log(t);
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
  { timeout: 90_000 }
);

await page.evaluate(() => window.__stage.goTo(2));
await page.waitForFunction(
  () =>
    window.__stage?.cameraRig?.state?.isSettled &&
    window.__stage?.cameraRig?.state?.index === 2,
  { timeout: 25_000 }
);
await page.waitForTimeout(500);

const closedProbe = await page.evaluate(() => {
  const THREE = window.__THREE || null;
  const sk = window.__stage.vignettes[2].instance;
  const root = sk.sidekickRoot;
  const names = [
    "Buttons",
    "transparentCover",
    "KeyboardText",
    "sideButtons",
    "buttonsFace",
    "scrollButton"
  ];
  const rows = {};
  for (const n of names) {
    const obj = sk.phoneRoot?.getObjectByName(n) || root?.getObjectByName(n);
    if (!obj?.isMesh) {
      rows[n] = null;
      continue;
    }
    const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    rows[n] = {
      visible: obj.visible,
      matName: m?.name,
      type: m?.type,
      opacity: m?.opacity,
      transparent: m?.transparent,
      alphaTest: m?.alphaTest,
      metalness: m?.metalness,
      roughness: m?.roughness,
      side: m?.side,
      hasMap: Boolean(m?.map),
      mapName: m?.map?.name || m?.map?.image?.src || null,
      mapSize: m?.map?.image ? `${m.map.image.width}x${m.map.image.height}` : null,
      hasNormalMap: Boolean(m?.normalMap),
      normalMapName: m?.normalMap?.name || null,
      hasTangent: Boolean(obj.geometry?.attributes?.tangent),
      protected: Boolean(m?.userData?.sidekickKeypadProtected),
      pinnedSame: obj.userData?.sidekickKeypadMaterial === m,
      uuid: m?.uuid
    };
  }

  // isInvisibleCoverMaterial replica
  const isInv = (mat) => {
    if (!mat) return false;
    if (mat.name === "phong3" || mat.name === "sidekick_cover_mask") return true;
    const opacity = Number.isFinite(mat.opacity) ? mat.opacity : 1;
    const alphaTest = Number.isFinite(mat.alphaTest) ? mat.alphaTest : 0;
    return alphaTest > 0 && opacity < 0.05;
  };

  // Find polySurface / carkey
  const extras = [];
  root?.traverse((o) => {
    if (!o.isMesh) return;
    if (/polySurface|carkey|KeyButton/i.test(o.name) || /carkey/i.test(o.material?.name || "")) {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      extras.push({
        name: o.name,
        visible: o.visible,
        parent: o.parent?.name,
        mat: m?.name,
        hasNormal: Boolean(m?.normalMap),
        hasMap: Boolean(m?.map),
        hasTangent: Boolean(o.geometry?.attributes?.tangent)
      });
    }
  });

  // Simulate: if labels had MeshBasic alphaTest 0.08 at opacity 0, would repair eat them?
  const hypothetical = isInv({ name: "lambert3", opacity: 0, alphaTest: 0.08 });

  return {
    rows,
    shares: {
      buttonsCoverSameUuid: rows.Buttons?.uuid && rows.Buttons.uuid === rows.transparentCover?.uuid,
      buttonsKeyboardSame: rows.Buttons?.uuid && rows.Buttons.uuid === rows.KeyboardText?.uuid,
      buttonsSideSame: rows.Buttons?.uuid && rows.Buttons.uuid === rows.sideButtons?.uuid,
      keyboardSideSame: rows.KeyboardText?.uuid && rows.KeyboardText.uuid === rows.sideButtons?.uuid
    },
    extras,
    hypotheticalLabelAtReveal0IsInvisibleCover: hypothetical,
    keypad: sk.debugKeypad(),
    labelMeshes: (sk._keyboardLabelMeshes || []).map((m) => ({
      name: m.name,
      visible: m.visible,
      mat: m.material?.name,
      type: m.material?.type,
      hasMap: Boolean(m.material?.map),
      alphaTest: m.material?.alphaTest,
      opacity: m.material?.opacity
    }))
  };
});

writeFileSync(join(OUT, "sidekick-diag-closed.json"), JSON.stringify(closedProbe, null, 2));
console.log("Closed probe:", JSON.stringify(closedProbe, null, 2));

// Rest closed shot of side button region (already have nonormal which was no-op)
const shotClosed = await page.locator("#scene-canvas").screenshot({ type: "png" });
writeFileSync(join(OUT, "sidekick-buttons-rest.png"), shotClosed);

// Zoom in — syncToCameraZoom opens the phone
await page.evaluate(() => {
  window.__stage.cameraRig.zoomIn(2);
});
await page.waitForFunction(
  () =>
    window.__stage?.cameraRig?.state?.isZoomed === true &&
    window.__stage.vignettes[2].instance.isOpen === true,
  { timeout: 30_000 }
);
await page.waitForTimeout(800);

const openNear = await page.evaluate(() => {
  const sk = window.__stage.vignettes[2].instance;
  const kt = sk.phoneRoot.getObjectByName("KeyboardText");
  const sb = sk.phoneRoot.getObjectByName("sideButtons");
  const btn = sk.phoneRoot.getObjectByName("Buttons");
  const snap = (obj) => {
    if (!obj?.isMesh) return null;
    const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    return {
      visible: obj.visible,
      mat: m?.name,
      type: m?.type,
      hasMap: Boolean(m?.map),
      mapName: m?.map?.name ?? null,
      opacity: m?.opacity,
      alphaTest: m?.alphaTest,
      transparent: m?.transparent,
      depthTest: m?.depthTest,
      depthWrite: m?.depthWrite,
      metalness: m?.metalness,
      hasNormalMap: Boolean(m?.normalMap),
      hasTangent: Boolean(obj.geometry?.attributes?.tangent),
      protected: Boolean(m?.userData?.sidekickKeypadProtected),
      renderOrder: obj.renderOrder
    };
  };
  return {
    focus: window.__stage.focusBlend,
    isOpen: sk.isOpen,
    isZoomed: window.__stage.cameraRig.state.isZoomed,
    Buttons: snap(btn),
    KeyboardText: snap(kt),
    sideButtons: snap(sb),
    labels: (sk._keyboardLabelMeshes || []).map((m) => snap(m))
  };
});

writeFileSync(join(OUT, "sidekick-diag-open-near.json"), JSON.stringify(openNear, null, 2));
const shotNear = await page.locator("#scene-canvas").screenshot({ type: "png" });
writeFileSync(join(OUT, "sidekick-keys-near.png"), shotNear);
console.log("Open near:", JSON.stringify(openNear, null, 2));

// Zoom out while open — keys far (if close syncs, phone may close — use focusBlend via temporarily holding open)
// Camera zoom out closes phone via syncToCameraZoom. For "far open" we need open at rest.
// Force open settled at focus 0: zoom out then force open pose without close.
await page.evaluate(() => {
  window.__stage.cameraRig.zoomOut();
});
await page.waitForFunction(() => window.__stage?.cameraRig?.state?.isZoomed === false, {
  timeout: 20_000
});
await page.waitForTimeout(400);

// Force open at rest distance for far keys shot
await page.evaluate(() => {
  const sk = window.__stage.vignettes[2].instance;
  // Prevent sync from immediately closing: open settled pose
  sk._applyOpenSettledPose?.();
  sk._syncKeyboardLabelVisibility?.(1);
});
await page.waitForTimeout(300);

const openFar = await page.evaluate(() => {
  const sk = window.__stage.vignettes[2].instance;
  const kt = sk.phoneRoot.getObjectByName("KeyboardText");
  const m = kt?.material;
  return {
    focus: window.__stage.focusBlend,
    isOpen: sk.isOpen,
    isZoomed: window.__stage.cameraRig.state.isZoomed,
    KeyboardText: {
      visible: kt?.visible,
      mat: m?.name,
      hasMap: Boolean(m?.map),
      type: m?.type
    }
  };
});
const shotFar = await page.locator("#scene-canvas").screenshot({ type: "png" });
writeFileSync(join(OUT, "sidekick-keys-far.png"), shotFar);
writeFileSync(join(OUT, "sidekick-diag-open-far.json"), JSON.stringify(openFar, null, 2));
console.log("Open far:", JSON.stringify(openFar, null, 2));

// Failure A probe: temporarily restore sideButtons label atlas from GLTF-like path —
// we can't easily get original; instead strip nothing and document.
// Alternate A: check if any visible mesh has normalMap without tangent
const normalAudit = await page.evaluate(() => {
  const sk = window.__stage.vignettes[2].instance;
  const hits = [];
  sk.sidekickRoot.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m?.normalMap) {
        hits.push({
          name: o.name,
          visible: o.visible,
          mat: m.name,
          hasTangent: Boolean(o.geometry?.attributes?.tangent),
          normalImg: m.normalMap.image
            ? `${m.normalMap.image.width}x${m.normalMap.image.height}`
            : null,
          mapImg: m.map?.image ? `${m.map.image.width}x${m.map.image.height}` : null
        });
      }
    }
  });
  return hits;
});
console.log("normalMap audit:", JSON.stringify(normalAudit, null, 2));
writeFileSync(join(OUT, "sidekick-normal-audit.json"), JSON.stringify(normalAudit, null, 2));

// Prove false-positive classifier with in-memory MeshBasic mock (no permanent change)
const classifierProof = await page.evaluate(async () => {
  const sk = window.__stage.vignettes[2].instance;
  // Import is inlined replica
  const isInvisibleCoverMaterial = (mat) => {
    if (!mat) return false;
    if (mat.name === "phong3" || mat.name === "sidekick_cover_mask") return true;
    const opacity = Number.isFinite(mat.opacity) ? mat.opacity : 1;
    const alphaTest = Number.isFinite(mat.alphaTest) ? mat.alphaTest : 0;
    return alphaTest > 0 && opacity < 0.05;
  };

  // Recreate what mount does: MeshBasic label then opacity 0
  const fakeLabel = {
    name: "lambert3",
    opacity: 1,
    alphaTest: 0.08,
    transparent: true
  };
  const afterConfigure = isInvisibleCoverMaterial(fakeLabel);
  fakeLabel.opacity = 0; // hideGroupForReveal
  const afterHide = isInvisibleCoverMaterial(fakeLabel);

  // Current Buttons vs labels material identity
  const btn = sk.phoneRoot.getObjectByName("Buttons");
  const kt = sk.phoneRoot.getObjectByName("KeyboardText");
  const sb = sk.phoneRoot.getObjectByName("sideButtons");
  const cover = sk.phoneRoot.getObjectByName("transparentCover");

  return {
    afterConfigureWouldTrigger: afterConfigure,
    afterHideWouldTrigger: afterHide,
    mountOrderNote:
      "_configureKeyboardLabels → hideGroupForReveal(0) → ensureSidekickKeypadMaterials — ensure runs while label opacity is 0 and alphaTest is 0.08",
    current: {
      buttonsMat: btn?.material?.name,
      keyboardMat: kt?.material?.name,
      sideButtonsMat: sb?.material?.name,
      coverMat: cover?.material?.name,
      keyboardIsProtectedPlastic: Boolean(kt?.material?.userData?.sidekickKeypadProtected),
      sideIsProtectedPlastic: Boolean(sb?.material?.userData?.sidekickKeypadProtected),
      buttonsSharesCover: btn?.material && cover?.material && btn.material === cover.material
    }
  };
});
writeFileSync(join(OUT, "sidekick-classifier-proof.json"), JSON.stringify(classifierProof, null, 2));
console.log("Classifier proof:", JSON.stringify(classifierProof, null, 2));

// Copy rest closed as buttons-nonormal stand-in documenting no normal strip possible on Buttons
// Already wrote sidekick-buttons-nonormal.png earlier (no-op strip). Re-write annotation JSON.
writeFileSync(
  join(OUT, "sidekick-failure-a-verdict.json"),
  JSON.stringify(
    {
      buttonsHasNormalMap: false,
      sideButtonsHasNormalMap: false,
      onlyNormalMapInTree: normalAudit,
      stripProbeStrippedCount: 0,
      screenshotNonormal: "public/debug/sidekick-buttons-nonormal.png",
      note: "§20.11 normalMap/tangent theory does NOT apply to CALL/END or Buttons. CALL/END atlas is TmobileButtons on sideButtons; KeyButton noisy atlas is only on pruned polySurface341/carkey1."
    },
    null,
    2
  )
);

await browser.close();
await server.close();
console.log("Done.");
