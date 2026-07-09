import * as THREE from "three";

export const PC_SETUP_TARGET_HEIGHT = 5.2;
export const PC_MODEL_FRAME_INSET = 0.92;
export const STAGE_FLOOR_Y = 0;

const REF_HEIGHT = 2.05;
const DESK_MAT = "pc_1";

const BOX_CORNERS = [
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3()
];

/** Blockout layout — no desk slab; props keep their authored height. */
const PARTS = [
  { name: "tower", size: [0.58, 1.62, 0.72], pos: [1.02, 1.02, -0.28], color: 0xd0ccc0, roughness: 0.58 },
  { name: "monitor", size: [1.35, 1.02, 0.14], pos: [-0.35, 1.35, -0.15], color: 0xd8d2c4, roughness: 0.55 },
  { name: "keyboard", size: [1.22, 0.08, 0.48], pos: [-0.18, 0.72, 0.52], color: 0xc8c4ba, roughness: 0.68 },
  { name: "mouse", size: [0.2, 0.06, 0.3], pos: [0.62, 0.72, 0.48], color: 0xb8b4aa, roughness: 0.62 },
  { name: "cd", size: [0.42, 0.05, 0.42], pos: [-0.92, 0.72, 0.34], color: 0xe8e8f0, roughness: 0.35, metalness: 0.25 },
  { name: "furby", size: [0.42, 0.58, 0.36], pos: [0.72, 0.9, 0.12], color: 0x3d7fc9, roughness: 0.72 },
  { name: "speaker", size: [0.28, 0.42, 0.24], pos: [-1.18, 0.86, -0.05], color: 0x1a1a1a, roughness: 0.8 }
];

function blockoutScale() {
  return PC_SETUP_TARGET_HEIGHT / REF_HEIGHT;
}

function isFloorExcludedMesh(obj) {
  if (!obj.isMesh || !obj.visible) return true;
  if (!obj.geometry?.attributes?.position) return true;
  if (obj.name.includes("glow")) return true;
  const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
  return materials.some((mat) => mat?.name?.includes("cable"));
}

function withVisibleBlockoutRef(blockoutSetup, fn) {
  const hidden = [];
  blockoutSetup.traverse((obj) => {
    if (obj.isMesh && obj.name.startsWith("blockout-ref")) {
      if (!obj.visible) hidden.push(obj);
      obj.visible = true;
    }
  });
  const result = fn();
  hidden.forEach((obj) => {
    obj.visible = false;
  });
  return result;
}

export function measureBlockoutReferenceBounds(blockoutSetup, space) {
  return withVisibleBlockoutRef(blockoutSetup, () => measureSceneBounds(blockoutSetup, space));
}

function getFloorSpace(group) {
  return group.parent?.parent ?? group.parent ?? group;
}

function expandBoxCorners(meshBox, target, space) {
  BOX_CORNERS[0].set(meshBox.min.x, meshBox.min.y, meshBox.min.z);
  BOX_CORNERS[1].set(meshBox.min.x, meshBox.min.y, meshBox.max.z);
  BOX_CORNERS[2].set(meshBox.min.x, meshBox.max.y, meshBox.min.z);
  BOX_CORNERS[3].set(meshBox.min.x, meshBox.max.y, meshBox.max.z);
  BOX_CORNERS[4].set(meshBox.max.x, meshBox.min.y, meshBox.min.z);
  BOX_CORNERS[5].set(meshBox.max.x, meshBox.min.y, meshBox.max.z);
  BOX_CORNERS[6].set(meshBox.max.x, meshBox.max.y, meshBox.min.z);
  BOX_CORNERS[7].set(meshBox.max.x, meshBox.max.y, meshBox.max.z);

  for (let i = 0; i < BOX_CORNERS.length; i += 1) {
    space.worldToLocal(BOX_CORNERS[i]);
    target.expandByPoint(BOX_CORNERS[i]);
  }
}

/** Bounds of visible props in the coordinate space of the stage floor. */
export function measureSceneBounds(root, space = root) {
  const box = new THREE.Box3();
  let found = false;

  root.updateMatrixWorld(true);
  space.updateMatrixWorld(true);

  root.traverse((obj) => {
    if (isFloorExcludedMesh(obj)) return;
    const meshBox = new THREE.Box3().setFromObject(obj);
    if (meshBox.isEmpty()) return;
    if (!found) {
      box.makeEmpty();
      expandBoxCorners(meshBox, box, space);
      found = true;
    } else {
      expandBoxCorners(meshBox, box, space);
    }
  });

  return found ? box : new THREE.Box3();
}

function buildBlockoutMeshes() {
  const s = blockoutScale();
  const setup = new THREE.Group();
  setup.rotation.y = Math.PI * 0.12;

  PARTS.forEach((part) => {
    const [w, h, d] = part.size;
    const [x, y, z] = part.pos;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * s, h * s, d * s));
    mesh.position.set(x * s, y * s, z * s);
    setup.add(mesh);
  });

  return setup;
}

/**
 * Move a vignette group so the lowest visible mesh sits on STAGE_FLOOR_Y.
 * Uses stage-local coordinates so intro camera rise cannot corrupt the snap.
 */
export function snapGroupToFloor(group) {
  if (group.userData.skipFloorSnap) return;
  const floorSpace = getFloorSpace(group);
  const { x, z } = group.position;
  group.position.set(x, 0, z);
  group.updateMatrixWorld(true);

  const box = measureSceneBounds(group, floorSpace);
  if (box.isEmpty()) return;

  group.position.y += STAGE_FLOOR_Y - box.min.y;
  group.updateMatrixWorld(true);
}

export function snapAllGroupsToFloor(groups) {
  groups.forEach((group) => snapGroupToFloor(group));
}

export function getPcSceneBlockoutSize() {
  const setup = buildBlockoutMeshes();
  setup.updateMatrixWorld(true);
  const box = measureSceneBounds(setup, setup);
  const size = box.getSize(new THREE.Vector3());
  return {
    width: size.x,
    height: size.y,
    depth: size.z,
    maxDim: Math.max(size.x, size.y, size.z),
    minY: box.min.y,
    maxY: box.max.y
  };
}

export function blockoutMaterial(color, roughness = 0.55, metalness = 0.08) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    envMapIntensity: 0.85
  });
}

export function buildPcSceneBlockout(group, options = {}) {
  const s = blockoutScale();
  const tint = options.tint ?? null;
  const hidden = options.hidden ?? false;
  const setup = new THREE.Group();
  setup.name = hidden ? "pc-scene-blockout-ref" : "pc-scene-blockout";
  setup.rotation.y = Math.PI * 0.12;

  PARTS.forEach((part, index) => {
    const [w, h, d] = part.size;
    const [x, y, z] = part.pos;
    const mat = blockoutMaterial(
      tint ? applyTint(part.color, tint, index) : part.color,
      part.roughness ?? 0.55,
      part.metalness ?? 0.08
    );
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * s, h * s, d * s), mat);
    mesh.position.set(x * s, y * s, z * s);
    mesh.name = hidden ? `blockout-ref-${part.name}` : `blockout-${part.name}`;
    mesh.visible = !hidden;
    setup.add(mesh);
  });

  if (options.screenMaterial || hidden) {
    const monitor = PARTS.find((part) => part.name === "monitor");
    const [w, h, d] = monitor.size;
    const [x, y, z] = monitor.pos;
    const screenMat =
      options.screenMaterial ??
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(w * s * 0.78, h * s * 0.72),
      screenMat
    );
    screen.position.set(x * s, y * s + h * s * 0.02, z * s + d * s * 0.52);
    screen.name = hidden ? "blockout-ref-screen" : "blockout-screen";
    screen.visible = !hidden;
    setup.add(screen);
  }

  group.add(setup);
  return setup;
}

function applyTint(baseHex, tintHex, index) {
  const base = new THREE.Color(baseHex);
  const tint = new THREE.Color(tintHex);
  base.lerp(tint, 0.08 + (index % 3) * 0.04);
  return base.getHex();
}

/** Drop only the wooden desk slab from pc_1 — keep keyboard, mouse, speakers. */
export function hideDeskSlabFromGlb(root) {
  const v = new THREE.Vector3();

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.index || !obj.geometry.attributes.position) return;

    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (mat?.name !== DESK_MAT) return;

    const pos = obj.geometry.attributes.position;
    const index = obj.geometry.index;
    const bounds = new THREE.Box3();

    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      bounds.expandByPoint(v);
    }
    if (bounds.isEmpty()) return;

    const yCut = bounds.min.y + bounds.getSize(new THREE.Vector3()).y * 0.22;
    const keep = [];

    for (let j = 0; j < index.count; j += 3) {
      let cy = 0;
      for (let k = 0; k < 3; k += 1) {
        v.fromBufferAttribute(pos, index.getX(j + k));
        cy += v.y;
      }
      cy /= 3;
      if (cy > yCut) {
        keep.push(index.getX(j), index.getX(j + 1), index.getX(j + 2));
      }
    }

    if (!keep.length || keep.length === index.count) return;

    obj.geometry = obj.geometry.clone();
    obj.geometry.setIndex(keep);
    obj.geometry.clearGroups();
    obj.geometry.addGroup(0, keep.length, 0);
  });
}

/** @deprecated Desk slab is kept for now — full pc_1 geometry (keyboard, mouse, speakers). */
export function stripDeskFromGlb(_root) {}

/**
 * Scale + position the GLB to match a blockout reference in the same vignette group.
 * Both share rotation and floor snap on the parent group.
 */
export function alignModelToBlockout(model, blockoutSetup) {
  model.position.set(0, 0, 0);
  model.scale.setScalar(1);
  model.rotation.y = blockoutSetup.rotation.y;
  model.updateMatrixWorld(true);
  blockoutSetup.updateMatrixWorld(true);

  const parent = model.parent;
  const space = parent ?? model;
  space.updateMatrixWorld(true);

  const targetBox = measureBlockoutReferenceBounds(blockoutSetup, space);
  if (targetBox.isEmpty()) return;

  const targetSize = targetBox.getSize(new THREE.Vector3());
  const targetCenter = targetBox.getCenter(new THREE.Vector3());

  let modelBox = measureSceneBounds(model, space);
  if (modelBox.isEmpty()) return;

  let modelSize = modelBox.getSize(new THREE.Vector3());
  // Match placeholder height — uniform min-scale was leaving the GLB too short.
  const scale = (targetSize.y / modelSize.y) * PC_MODEL_FRAME_INSET;

  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  modelBox = measureSceneBounds(model, space);
  const modelCenter = modelBox.getCenter(new THREE.Vector3());

  model.position.x += targetCenter.x - modelCenter.x;
  model.position.z += targetCenter.z - modelCenter.z;
  model.position.y += targetBox.min.y - modelBox.min.y;
  model.updateMatrixWorld(true);
}

/** @deprecated Use alignModelToBlockout + snapGroupToFloor on the vignette group. */
export function placeModelOnFloor(root, blockoutSetup) {
  alignModelToBlockout(root, blockoutSetup);
}

const _ALIGN_BOX = new THREE.Box3();
const _ALIGN_VEC = new THREE.Vector3();
const _ALIGN_VEC2 = new THREE.Vector3();
const _ALIGN_QUAT = new THREE.Quaternion();
const _ALIGN_QUAT2 = new THREE.Quaternion();
const _ALIGN_MAT = new THREE.Matrix4();
const _ALIGN_MAT2 = new THREE.Matrix4();

/** Hidden monitor face used by Desktop + Sidekick vignettes. */
export function findBlockoutReferenceScreen(blockoutSetup) {
  let screen = null;
  blockoutSetup?.traverse((obj) => {
    if (obj.name === "blockout-ref-screen") screen = obj;
  });
  return screen;
}

/** Named blockout mesh, e.g. `blockout-ref-monitor`. */
export function findBlockoutPart(blockoutSetup, partName) {
  let part = null;
  blockoutSetup?.traverse((obj) => {
    if (obj.name === partName) part = obj;
  });
  return part;
}

/** Move `modelRoot` so its visible bounds center matches `targetObject` in `space`. */
export function alignModelCenterToObject(modelRoot, targetObject, space) {
  if (!modelRoot || !targetObject || !space) return;

  modelRoot.updateMatrixWorld(true);
  targetObject.updateMatrixWorld(true);
  space.updateMatrixWorld(true);

  _ALIGN_BOX.setFromObject(targetObject);
  const targetCenter = _ALIGN_BOX.getCenter(_ALIGN_VEC);
  space.worldToLocal(targetCenter);

  _ALIGN_BOX.copy(measureSceneBounds(modelRoot, space));
  if (_ALIGN_BOX.isEmpty()) return;

  const modelCenter = _ALIGN_BOX.getCenter(_ALIGN_VEC2);
  modelRoot.position.add(_ALIGN_VEC.sub(modelCenter));
  modelRoot.updateMatrixWorld(true);
}

/**
 * Rotate and translate `modelRoot` so `mesh` matches the CRT reference screen transform.
 * Does not change scale — call after the model is sized for the scene.
 */
export function alignMeshTransformToReference(modelRoot, mesh, referenceScreen, space) {
  if (!modelRoot || !mesh || !referenceScreen || !space) return;

  const scale = modelRoot.scale.x;
  mesh.updateMatrixWorld(true);
  referenceScreen.updateMatrixWorld(true);
  space.updateMatrixWorld(true);

  _ALIGN_MAT.copy(referenceScreen.matrixWorld);
  _ALIGN_MAT2.copy(mesh.matrixWorld).invert();
  _ALIGN_MAT.multiply(_ALIGN_MAT2);

  const parent = modelRoot.parent ?? space;
  parent.updateMatrixWorld(true);
  _ALIGN_MAT2.copy(parent.matrixWorld).invert();
  _ALIGN_MAT2.multiply(_ALIGN_MAT);
  _ALIGN_MAT2.multiply(modelRoot.matrixWorld);
  _ALIGN_MAT2.decompose(modelRoot.position, modelRoot.quaternion, _ALIGN_VEC);
  modelRoot.scale.setScalar(scale);
  modelRoot.updateMatrixWorld(true);
}

/** Uniform scale on `modelRoot` so visible bounds reach `targetHeight` in `space`. */
export function scaleModelToTargetHeight(modelRoot, space, targetHeight) {
  if (!modelRoot || !space || !targetHeight) return 1;

  modelRoot.updateMatrixWorld(true);
  space.updateMatrixWorld(true);
  _ALIGN_BOX.copy(measureSceneBounds(modelRoot, space));
  if (_ALIGN_BOX.isEmpty()) return 1;

  const height = _ALIGN_BOX.getSize(_ALIGN_VEC).y;
  const scale = targetHeight / Math.max(height, 1e-8);
  modelRoot.scale.setScalar(scale);
  modelRoot.updateMatrixWorld(true);
  return scale;
}
