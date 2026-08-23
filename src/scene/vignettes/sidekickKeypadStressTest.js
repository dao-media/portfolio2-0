import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import {
  SIDEKICK_KEYPAD_MATERIAL_NAME,
  debugSidekickKeypad,
  ensureSidekickKeypadMaterials,
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

function makePhoneRoot() {
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
  return { root, buttons, cover, shared, face };
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

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { passed, failed, results };
}
