import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import {
  SIDEKICK_KEYPAD_MATERIAL_NAME,
  applySidekickFusedButtonAtlas,
  debugSidekickKeypad,
  ensureSidekickKeypadMaterials,
  isInvisibleCoverMaterial,
  isSidekickKeypadMeshHealthy,
  repairSidekickKeypadMaterials
} from "./gltfMaterialOwnership.js";
import { setGroupRenderOpacity } from "../stage/stageModelReveal.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const GLB_PATH = resolve(ROOT, "public/assets/models/sidekick/Sidekick3.glb");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseGlbJson(path) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
}

function makeSharedPhong3() {
  return new THREE.MeshStandardMaterial({
    name: "phong3",
    color: 0x000000,
    opacity: 0,
    transparent: false,
    alphaTest: 0.5,
    depthWrite: true,
    side: THREE.DoubleSide
  });
}

function makeLabelMap() {
  const data = new Uint8Array([255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.needsUpdate = true;
  tex.name = "test-label-atlas";
  return tex;
}

function makeLabelMaterial(name) {
  const mat = new THREE.MeshBasicMaterial({
    name,
    map: makeLabelMap(),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    alphaTest: 0.08,
    side: THREE.DoubleSide
  });
  mat.userData.sidekickLabelProtected = true;
  return mat;
}

function makePhoneRoot({ withLabels = false } = {}) {
  const root = new THREE.Group();
  root.name = "TMobleSideKick3";

  const shared = makeSharedPhong3();
  const buttons = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
  buttons.name = "Buttons";
  const cover = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
  cover.name = "transparentCover";
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ name: "blinn1", color: 0x191919, roughness: 0.75 })
  );
  face.name = "buttonsFace";

  root.add(buttons, cover, face);

  let keyboard = null;
  let sideButtons = null;
  if (withLabels) {
    keyboard = new THREE.Mesh(new THREE.BoxGeometry(1, 0.01, 1), makeLabelMaterial("lambert3"));
    keyboard.name = "KeyboardText";
    keyboard.userData.sidekickLabelProtected = true;
    sideButtons = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.02), makeLabelMaterial("phong4"));
    sideButtons.name = "sideButtons";
    sideButtons.userData.sidekickLabelProtected = true;
    root.add(keyboard, sideButtons);
  }

  return { root, buttons, cover, shared, face, keyboard, sideButtons };
}

function assertFusedBodyOpaque(mesh, label) {
  assert(mesh?.isMesh, `${label} missing`);
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  assert(mat, `${label} has no material`);
  assert(mat.name !== SIDEKICK_KEYPAD_MATERIAL_NAME, `${label} paved with keypad plastic`);
  assert(!mat.userData?.sidekickKeypadProtected, `${label} marked keypad-protected`);
  assert(Boolean(mat.map), `${label} lost atlas map`);
  assert(mat.userData?.sidekickFusedButtonProtected, `${label} lost fused pin`);
  assert(mat.transparent === false, `${label} transparent`);
  assert(mat.alphaTest === 0, `${label} alphaTest=${mat.alphaTest}`);
  assert(mat.opacity === 1, `${label} opacity=${mat.opacity}`);
}

function assertLabelIntact(mesh, label) {
  assert(mesh?.isMesh, `${label} missing`);
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  assert(mat, `${label} has no material`);
  assert(mat.name !== SIDEKICK_KEYPAD_MATERIAL_NAME, `${label} paved with keypad plastic`);
  assert(!mat.userData?.sidekickKeypadProtected, `${label} marked keypad-protected`);
  assert(Boolean(mat.map), `${label} lost atlas map`);
  assert(mat.alphaTest > 0, `${label} alphaTest cleared`);
}

export function runSidekickKeypadStressTest() {
  const results = [];

  const run = (name, fn) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  };

  run("GLB authors Buttons + transparentCover on phong3 alpha-0 MASK", () => {
    const json = parseGlbJson(GLB_PATH);
    const phong3Index = json.materials.findIndex((m) => m.name === "phong3");
    assert(phong3Index >= 0, "phong3 missing");
    const phong3 = json.materials[phong3Index];
    assert(phong3.alphaMode === "MASK", `phong3 alphaMode=${phong3.alphaMode}`);
    assert(
      (phong3.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1) === 0,
      "phong3 baseColor alpha is not 0"
    );

    const nodeByName = new Map(json.nodes.map((n) => [n.name, n]));
    const buttons = nodeByName.get("Buttons");
    const cover = nodeByName.get("transparentCover");
    assert(buttons?.mesh != null, "Buttons node missing mesh");
    assert(cover?.mesh != null, "transparentCover node missing mesh");

    const buttonsMat = json.meshes[buttons.mesh].primitives[0].material;
    const coverMat = json.meshes[cover.mesh].primitives[0].material;
    assert(buttonsMat === phong3Index, "Buttons not on phong3");
    assert(coverMat === phong3Index, "transparentCover not on phong3");
    assert(buttonsMat === coverMat, "Buttons/cover no longer share a material index");
  });

  run("repair splits keypad onto opaque plastic", () => {
    const { root, buttons, cover, shared } = makePhoneRoot();
    repairSidekickKeypadMaterials(root);

    assert(buttons.material !== shared, "Buttons still on authored phong3");
    assert(buttons.material !== cover.material, "Buttons still shares cover material");
    assert(buttons.material.name === SIDEKICK_KEYPAD_MATERIAL_NAME, buttons.material.name);
    assert(buttons.material.opacity === 1, `opacity=${buttons.material.opacity}`);
    assert(buttons.material.transparent === false, "keypad left transparent");
    assert(buttons.material.alphaTest === 0, `alphaTest=${buttons.material.alphaTest}`);
    assert(buttons.material.side === THREE.DoubleSide, "keypad must be DoubleSide");
    assert(buttons.visible === true, "Buttons hidden");
    assert(isSidekickKeypadMeshHealthy(buttons), "health check failed after repair");
    assert(debugSidekickKeypad(root).healthy === true, "debugKeypad.healthy false");
  });

  run("ensure restores keypad after phong3 is reassigned", () => {
    const { root, buttons, shared } = makePhoneRoot();
    repairSidekickKeypadMaterials(root);
    buttons.material = shared;
    assert(!isSidekickKeypadMeshHealthy(buttons), "expected unhealthy after clobber");
    const ok = ensureSidekickKeypadMaterials(root);
    assert(ok, "ensure returned false");
    assert(buttons.material !== shared, "watchdog did not restore");
    assert(isSidekickKeypadMeshHealthy(buttons), "still unhealthy after ensure");
  });

  run("intro reveal fade does not restore alpha-0 onto keypad", () => {
    const { root, buttons } = makePhoneRoot();
    repairSidekickKeypadMaterials(root);
    setGroupRenderOpacity(root, 0);
    assert(buttons.material.name === SIDEKICK_KEYPAD_MATERIAL_NAME, "fade replaced keypad mat");
    setGroupRenderOpacity(root, 1);
    assert(buttons.material.opacity === 1, `restored opacity=${buttons.material.opacity}`);
    assert(buttons.material.transparent === false, "fade restored transparent");
    assert(buttons.material.alphaTest === 0, `restored alphaTest=${buttons.material.alphaTest}`);
    assert(isSidekickKeypadMeshHealthy(buttons), "unhealthy after fade restore");
  });

  run("cover heuristic is identity-only — not opacity+alphaTest", () => {
    const cutout = new THREE.MeshBasicMaterial({
      name: "lambert3",
      opacity: 0,
      alphaTest: 0.08,
      transparent: true
    });
    assert(
      isInvisibleCoverMaterial(cutout) === false,
      "label cutout at opacity 0 must not classify as cover"
    );
    const phong3 = makeSharedPhong3();
    assert(isInvisibleCoverMaterial(phong3) === true, "phong3 must still classify as cover");
  });

  run("label atlases survive setGroupRenderOpacity 0→1 + ensure", () => {
    const { root, buttons, keyboard, sideButtons } = makePhoneRoot({ withLabels: true });
    applySidekickFusedButtonAtlas(sideButtons);
    repairSidekickKeypadMaterials(root);
    assertLabelIntact(keyboard, "KeyboardText");
    assertFusedBodyOpaque(sideButtons, "sideButtons");

    // Mount-order bug: hide (opacity 0) then ensure — must not pave labels or bodies.
    setGroupRenderOpacity(root, 0);
    ensureSidekickKeypadMaterials(root);
    assertLabelIntact(keyboard, "KeyboardText after hide+ensure");
    assert(sideButtons.material.map, "sideButtons lost atlas mid-hide");
    assert(
      sideButtons.material.name !== SIDEKICK_KEYPAD_MATERIAL_NAME,
      "sideButtons paved mid-hide"
    );
    assert(isSidekickKeypadMeshHealthy(buttons), "Buttons unhealthy mid-reveal");

    setGroupRenderOpacity(root, 1);
    ensureSidekickKeypadMaterials(root);
    assertLabelIntact(keyboard, "KeyboardText after reveal restore");
    assertFusedBodyOpaque(sideButtons, "sideButtons after reveal restore");
    assert(buttons.material.name === SIDEKICK_KEYPAD_MATERIAL_NAME, "Buttons left phong3");
    assert(isSidekickKeypadMeshHealthy(buttons), "Buttons unhealthy after reveal");
  });

  run("CALL/END/D-pad fused atlas stays opaque after opacity 0→1 + ensure", () => {
    const { root, sideButtons } = makePhoneRoot({ withLabels: true });
    const atlas = sideButtons.material.map;
    const prior = new THREE.MeshPhysicalMaterial({
      name: "phong4",
      map: atlas,
      metalness: 0,
      roughness: 0.17,
      transparent: true,
      alphaTest: 0.08
    });
    sideButtons.material = prior;
    sideButtons.userData.sidekickLabelProtected = false;

    const body = applySidekickFusedButtonAtlas(sideButtons);
    assert(body, "fused atlas apply returned null");
    assert(body.map, "CALL/END body lost TmobileButtons");
    assert(body.name !== SIDEKICK_KEYPAD_MATERIAL_NAME, "body paved with keypad plastic");
    assert(body.transparent === false, "body left transparent");
    assert(body.alphaTest === 0, `body alphaTest=${body.alphaTest}`);
    assert(body.opacity === 1, `body opacity=${body.opacity}`);
    assert(body.side === THREE.DoubleSide, "body must be DoubleSide");

    repairSidekickKeypadMaterials(root);
    setGroupRenderOpacity(root, 0);
    ensureSidekickKeypadMaterials(root);
    setGroupRenderOpacity(root, 1);
    ensureSidekickKeypadMaterials(root);

    const mat = sideButtons.material;
    assert(mat.map, "body lost atlas after opacity cycle");
    assert(mat.name !== SIDEKICK_KEYPAD_MATERIAL_NAME, "body paved after opacity cycle");
    assert(!mat.userData?.sidekickKeypadProtected, "body marked keypad-protected");
    assert(mat.userData?.sidekickFusedButtonProtected, "body lost fused pin");
    assert(mat.transparent === false, "body transparent after restore");
    assert(mat.alphaTest === 0, `body alphaTest after restore=${mat.alphaTest}`);
    assert(mat.opacity === 1, `body opacity after restore=${mat.opacity}`);
    assert(mat.side === THREE.DoubleSide, "body side changed");
  });

  run("labels keep maps after ensure cycles (open/close proxy)", () => {
    const { root, buttons, keyboard, sideButtons } = makePhoneRoot({ withLabels: true });
    applySidekickFusedButtonAtlas(sideButtons);
    repairSidekickKeypadMaterials(root);

    // Proxy for _applyDisplayState open→close: ensure every frame while labels stay cutouts.
    for (let i = 0; i < 8; i += 1) {
      ensureSidekickKeypadMaterials(root);
    }
    assertLabelIntact(keyboard, "KeyboardText after ensure loop");
    assertFusedBodyOpaque(sideButtons, "sideButtons after ensure loop");
    assert(isSidekickKeypadMeshHealthy(buttons), "Buttons unhealthy after ensure loop");
  });

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { passed, failed, results };
}
