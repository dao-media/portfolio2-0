import * as THREE from "three";
import { createGltfLoader } from "../loaders/createGltfLoader.js";
import { hideGroupForReveal, holdRootOffCamera } from "../stage/stageModelReveal.js";
import { spanFrame } from "../stage/frameBudget.js";
import { tagFrame } from "../stage/frameBudget.js";
import { SCROLL_CAPTURE_MESH_IDS } from "../stage/scrollCaptureTargets.js";
import { buildPcSceneBlockout, sceneMonitorHeightM } from "./pcSceneBlockout.js";

const SHELF_URL = "/assets/models/shelving-unit/runtime/shelving-unit.glb";
const VENUS_URL = "/assets/models/venus-willendorf/runtime/venus-willendorf.glb";
/** @deprecated Antikythera parked — not loaded. Runtime kept on disk for restore. */
// eslint-disable-next-line no-unused-vars
const ANTIKYTHERA_URL = "/assets/models/antikythera/runtime/antikythera.glb";
const TROJAN_HORSE_URL = "/assets/models/trojan-horse/runtime/trojan-horse.glb";
const OLMEC_HEAD_URL = "/assets/models/olmec-head/runtime/olmec-head.glb";
const OLIVE_BOAT_URL = "/assets/models/olive-wood-boat/runtime/olive-wood-boat.glb";
const CUNEIFORM_URL = "/assets/models/cuneiform-tablet/runtime/cuneiform-tablet.glb";
const ISHTAR_GATE_URL = "/assets/models/ishtar-gate/runtime/ishtar-gate.glb";
const LUCY_URL = "/assets/models/lucy/runtime/lucy.glb";
const PTOLEMY_URL = "/assets/models/ptolemy/runtime/ptolemy.glb";
const DIVJE_BABE_FLUTE_URL =
  "/assets/models/divje-babe-flute/runtime/divje-babe-flute.glb";
const NEANDERTHAL_URL = "/assets/models/neanderthal/runtime/neanderthal.glb";

/**
 * Real-world Iona shelf height (m). Live seat multiplies by the same CRT
 * prop scale as Sidekick so the unit reads with the Retro PC / phone.
 */
const SHELF_REAL_HEIGHT_M = 1.842;
/** Extra ×0.75 on the ladder (user −25%). Finds share this so they still fit. */
const SHELF_EXTRA_SCALE = 0.75;
/**
 * Archaeology look is world +X; group yaw is 270° so:
 *   local +X → world +Z,  local +Z → world −X.
 * Seat kept from the arch-era layout (**+4 ft** toward former arch).
 */
const SHELF_SIDE = -0.9;
const SHELF_FORWARD = 0.305;
/**
 * Front toward camera (was −3π/4, flipped +π).
 */
const SHELF_YAW = Math.PI / 4;

/** Venus of Willendorf — historical height ≈ 11.1 cm (pre-prop-scale). */
const VENUS_REAL_HEIGHT_M = 0.111;
/** Extra size on Venus after CRT×0.5 (user tune). */
const VENUS_EXTRA_SCALE = 1.33;
/** Antikythera Mechanism main fragment — ≈ 33 cm high (pre-prop-scale). */
const ANTIKYTHERA_REAL_HEIGHT_M = 0.33;
/** Wooden-block Trojan horse toy — ≈ 22 cm high (pre-prop-scale). */
const TROJAN_HORSE_REAL_HEIGHT_M = 0.22;
/** Extra size after CRT×0.5 — was 2/5, then ×2. */
const TROJAN_HORSE_EXTRA_SCALE = (2 / 5) * 2;
/** Olmec colossal-head souvenir — ≈ 24 cm high (pre-prop-scale). */
const OLMEC_HEAD_REAL_HEIGHT_M = 0.24;
/** Extra size after CRT×0.5 so it reads next to the Trojan Horse. */
const OLMEC_HEAD_EXTRA_SCALE = 1.1 * 0.85;
/** Olive-wood boat souvenir — ≈ 18 cm high (pre-prop-scale). */
const OLIVE_BOAT_REAL_HEIGHT_M = 0.18;
/** Extra size after CRT×0.5 so it reads next to Venus. */
const OLIVE_BOAT_EXTRA_SCALE = 1.15;
/** Cuneiform tablet — standing face height ≈ 16 cm (pre-prop-scale). */
const CUNEIFORM_REAL_HEIGHT_M = 0.16;
const CUNEIFORM_EXTRA_SCALE = 1.15;
/**
 * Tip flat tablet onto its bottom edge (−X π/2), then lean back into the easel
 * so the engraved face reads toward camera.
 */
const CUNEIFORM_TIP_X = -Math.PI / 2;
const CUNEIFORM_LEAN = THREE.MathUtils.degToRad(14);
/** Face toward camera (shelf-relative). Flip π if engraving faces the wall. */
const CUNEIFORM_YAW = 0;
/** Easel plinth height (real m) — groove holds the tablet bottom edge. */
const CUNEIFORM_EASEL_HEIGHT_M = 0.036;
/** Ishtar Gate miniature — standing facade ≈ 22 cm high (pre-prop-scale). */
const ISHTAR_GATE_REAL_HEIGHT_M = 0.22;
const ISHTAR_GATE_EXTRA_SCALE = 1.1 * 0.85;
/** Face toward camera, then 70° CCW (was +50°, user +20° CCW). */
const ISHTAR_GATE_YAW = THREE.MathUtils.degToRad(70);
/** Lucy (A. afarensis cranium + mandible) — ≈ 17 cm high (pre-prop-scale). */
const LUCY_REAL_HEIGHT_M = 0.17;
/** Extra size after CRT×0.5 so the skull reads on the bottom board. */
const LUCY_EXTRA_SCALE = 1.2;
/** Facing yaw relative to shelf — 75° CW (right-hand −Y). */
const LUCY_YAW = THREE.MathUtils.degToRad(-75);
/**
 * Museum spine-mount under Lucy (real meters, pre-prop-scale).
 * Tall rod rises into the foramen / spinal connection; skull sits on the tip.
 * `LUCY_STAND_ENGAGE_FRAC` = fraction of stand height under the AABB bottom
 * (rest of the stem enters the skull base — not a floating cradle).
 */
const LUCY_STAND_HEIGHT_M = 0.1;
const LUCY_STAND_ENGAGE_FRAC = 0.52;
/** Ptolemy bust (pedestal stripped at export) — ≈ 22 cm high (pre-prop-scale). */
const PTOLEMY_REAL_HEIGHT_M = 0.22;
const PTOLEMY_EXTRA_SCALE = 1.05;
/**
 * Divje Babe flute — lies on the board; height = diameter ≈ 3.5 cm (pre-prop-scale).
 * Native mesh is long in Z; yaw π/2 puts the bore along the shelf lateral.
 */
const DIVJE_BABE_FLUTE_REAL_HEIGHT_M = 0.035;
const DIVJE_BABE_FLUTE_EXTRA_SCALE = 1.15;
/** Long axis along shelf lateral (π/2), then 30° CW (right-hand −Y). */
const DIVJE_BABE_FLUTE_YAW = Math.PI / 2 + THREE.MathUtils.degToRad(-75);
/** Homo neanderthalensis (La Chapelle) skull — ≈ 20 cm high (pre-prop-scale). */
const NEANDERTHAL_REAL_HEIGHT_M = 0.2;
/** Was 1.15×0.75×0.85×1.15 — user +15% again. */
const NEANDERTHAL_EXTRA_SCALE = 1.15 * 0.75 * 0.85 * 1.15 * 1.15;
/**
 * Face straight ahead toward camera (shelf-relative).
 * +180° from shelf forward — matches prior face-out once Sketchfab Rx−90 is applied.
 */
const NEANDERTHAL_YAW = Math.PI;
/**
 * Jaw-down nod on `Sketchfab_model` after Rx−90 (model-space local −X).
 * Do NOT pass as root `seatPropOnShelf` pitch — that banks the eye line.
 */
const NEANDERTHAL_PITCH = THREE.MathUtils.degToRad(-20);
/** Same museum spine-mount as Lucy (real meters, pre-prop-scale). */
const NEANDERTHAL_STAND_HEIGHT_M = LUCY_STAND_HEIGHT_M;
const NEANDERTHAL_STAND_ENGAGE_FRAC = LUCY_STAND_ENGAGE_FRAC;
/**
 * Native glTF AABB is short in Y (~31) and tall in Z (~62) — horse lies on
 * its side until tipped. −X π/2 maps +Z → +Y (wheels down, head up).
 * Then +Z 85° CCW (model-space) spins facing once tipped onto world Y.
 */
const TROJAN_HORSE_STAND_X = -Math.PI / 2;
const TROJAN_HORSE_STAND_Z = THREE.MathUtils.degToRad(85);

/** Typical 17″ CRT chassis — Desktop blockout monitor key (same as Sidekick). */
const CRT_17_CHASSIS_HEIGHT_M = 0.416;

/**
 * Base CRT×0.5 for Archaeology props. Shelf / finds use `archaeologyShelfScale()`.
 * @returns {number}
 */
function archaeologyPropScale() {
  return (sceneMonitorHeightM() / CRT_17_CHASSIS_HEIGHT_M) * 0.5;
}

/** CRT×0.5 then ×`SHELF_EXTRA_SCALE` (ladder −25%). */
function archaeologyShelfScale() {
  return archaeologyPropScale() * SHELF_EXTRA_SCALE;
}

/**
 * Shelf-board tops as fractions of shelf height (from GREY/PINE upward faces at
 * real scale — apply after height fit). Boards ≈ 0.163 / 0.553 / 0.935 / 1.312 / 1.697 m.
 */
const SHELF_DECK_BOTTOM_M = 0.163; // lowest board (Neander / flute / Lucy)
/** @deprecated alias — use SHELF_DECK_BOTTOM_M */
const SHELF_DECK_ANTIKYTHERA_M = SHELF_DECK_BOTTOM_M;
/** Bottom board — Neanderthal, Divje Babe flute, Lucy (L→R). */
const SHELF_DECK_LUCY_M = SHELF_DECK_BOTTOM_M;
const SHELF_DECK_FLUTE_M = SHELF_DECK_BOTTOM_M;
const SHELF_DECK_NEANDERTHAL_M = SHELF_DECK_BOTTOM_M;
/** Second board — under olive boat / Venus deck. */
const SHELF_DECK_CUNEIFORM_M = 0.553;
const SHELF_DECK_ISHTAR_M = SHELF_DECK_CUNEIFORM_M;
const SHELF_DECK_VENUS_M = 0.924; // third shelf (near prior mid-upper)
/** Fourth board — Trojan Horse + Olmec Head (above Venus). */
const SHELF_DECK_TROJAN_M = 1.312;
const SHELF_DECK_OLMEC_M = SHELF_DECK_TROJAN_M;
/** Top board — Ptolemy directly above the Trojan Horse. */
const SHELF_DECK_PTOLEMY_M = 1.697;
const SHELF_DECK_LUCY_FRAC = SHELF_DECK_LUCY_M / SHELF_REAL_HEIGHT_M;
const SHELF_DECK_FLUTE_FRAC = SHELF_DECK_FLUTE_M / SHELF_REAL_HEIGHT_M;
const SHELF_DECK_NEANDERTHAL_FRAC = SHELF_DECK_NEANDERTHAL_M / SHELF_REAL_HEIGHT_M;
const SHELF_DECK_CUNEIFORM_FRAC = SHELF_DECK_CUNEIFORM_M / SHELF_REAL_HEIGHT_M;
const SHELF_DECK_ISHTAR_FRAC = SHELF_DECK_ISHTAR_M / SHELF_REAL_HEIGHT_M;
const SHELF_DECK_VENUS_FRAC = SHELF_DECK_VENUS_M / SHELF_REAL_HEIGHT_M;
const SHELF_DECK_TROJAN_FRAC = SHELF_DECK_TROJAN_M / SHELF_REAL_HEIGHT_M;
const SHELF_DECK_OLMEC_FRAC = SHELF_DECK_OLMEC_M / SHELF_REAL_HEIGHT_M;
const SHELF_DECK_PTOLEMY_FRAC = SHELF_DECK_PTOLEMY_M / SHELF_REAL_HEIGHT_M;
/** Inset from shelf center along local depth (toward back), real meters. */
const PROP_BACK_INSET_M = 0.06;
const PROP_SIDE_VENUS_M = 0.18;
/** Olive boat — same deck as Venus, opposite side. */
const PROP_SIDE_OLIVE_BOAT_M = -0.2;
/**
 * Olive boat depth: **+back** = camera-near / front of shelf.
 * Was −0.06 with Venus; nudged forward.
 */
const PROP_BACK_OLIVE_BOAT_M = 0.04;
/** Cuneiform — board under olive boat, same lateral as the boat. */
const PROP_SIDE_CUNEIFORM_M = PROP_SIDE_OLIVE_BOAT_M;
const PROP_BACK_CUNEIFORM_M = 0.06;
/** Ishtar Gate — same board as cuneiform, opposite side (under Venus lateral). */
const PROP_SIDE_ISHTAR_M = 0.16;
const PROP_BACK_ISHTAR_M = 0.06;
/** Trojan horse — same deck as Olmec; lateral swapped (was −0.12). */
const PROP_SIDE_TROJAN_M = 0.14;
/** Ptolemy — top shelf above Trojan; inset from front edge. */
const PROP_SIDE_PTOLEMY_M = 0.08;
const PROP_BACK_PTOLEMY_M = -PROP_BACK_INSET_M;
/** Facing yaw relative to shelf — 35° CCW (right-hand +Y). */
const TROJAN_YAW = THREE.MathUtils.degToRad(35);
/** Ptolemy faces toward camera (shelf-relative). */
const PTOLEMY_YAW = 0;
/** Olmec head — same deck as Trojan; lateral swapped (was 0.14). */
const PROP_SIDE_OLMEC_M = -0.12;
const PROP_BACK_OLMEC_M = -PROP_BACK_INSET_M;
/** Olmec facing yaw relative to shelf — 20° CW (right-hand −Y). */
const OLMEC_YAW = THREE.MathUtils.degToRad(-20);
/**
 * @deprecated Antikythera parked — kept for restore.
 */
const PROP_SIDE_ANTIKYTHERA_M = 0;
const PROP_BACK_ANTIKYTHERA_M = 0.12;
/**
 * Bottom board L→R: Neanderthal (−), flute (mid), Lucy (+ under Venus).
 */
const PROP_SIDE_NEANDERTHAL_M = -0.16;
const PROP_BACK_NEANDERTHAL_M = 0.1;
const PROP_SIDE_FLUTE_M = 0.02;
const PROP_BACK_FLUTE_M = 0.1;
const PROP_SIDE_LUCY_M = 0.18;
const PROP_BACK_LUCY_M = 0.12;

const _BOX = new THREE.Box3();
const _SIZE = new THREE.Vector3();
const _CENTER = new THREE.Vector3();
const _AXIS_X = new THREE.Vector3(1, 0, 0);
const _AXIS_Y = new THREE.Vector3(0, 1, 0);
const _AXIS_Z = new THREE.Vector3(0, 0, 1);
/**
 * Antikythera CT fragment: native AABB is thin in local Z. Tip with +Z rot so
 * thickness lands on world Y (plate on the deck), then yaw around world up.
 * Euler XYZ `(-π/2, yaw, 0)` leaves it standing on edge.
 */
const _TIP_FLAT = new THREE.Quaternion().setFromAxisAngle(_AXIS_Z, Math.PI / 2);
const _TIP_STAND = new THREE.Quaternion()
  .setFromAxisAngle(_AXIS_X, TROJAN_HORSE_STAND_X)
  .multiply(
    new THREE.Quaternion().setFromAxisAngle(_AXIS_Z, TROJAN_HORSE_STAND_Z)
  );
/** Cuneiform: tip onto bottom edge, then lean back into the easel. */
const _TIP_TABLET = new THREE.Quaternion()
  .setFromAxisAngle(_AXIS_X, CUNEIFORM_TIP_X)
  .multiply(new THREE.Quaternion().setFromAxisAngle(_AXIS_X, CUNEIFORM_LEAN));
const _YAW_Q = new THREE.Quaternion();
const _PITCH_Q = new THREE.Quaternion();
const _ROLL_Q = new THREE.Quaternion();

export const archaeologyVignetteMeta = {
  name: "Archaeology",
  tint: 0xc4a574,
  neonColors: ["#ff3d1a", "#ffc14a"],
  desc: "Shelf finds under neon. Click to lean in."
};

/**
 * Uniform height fit + floor pivot so Sketchfab off-origin meshes (Antikythera
 * AABB center ~ hundreds of units from 0) still seat under `root.position`.
 * @param {THREE.Object3D} root
 * @param {number} height
 */
function fitHeightOnFloor(root, height) {
  root.updateMatrixWorld(true);
  _BOX.setFromObject(root);
  if (_BOX.isEmpty()) return;
  _BOX.getSize(_SIZE);
  if (_SIZE.y < 1e-4) return;
  root.scale.multiplyScalar(height / _SIZE.y);

  let pivot = root.userData._archaeologyFloorPivot;
  if (!pivot) {
    pivot = new THREE.Group();
    pivot.name = "archaeology-floor-pivot";
    while (root.children.length) pivot.add(root.children[0]);
    root.add(pivot);
    root.userData._archaeologyFloorPivot = pivot;
  }
  pivot.position.set(0, 0, 0);
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  _BOX.setFromObject(root);
  // Bottom-center of the AABB → root origin (survives later seat XZ writes).
  _CENTER.set(
    (_BOX.min.x + _BOX.max.x) * 0.5,
    _BOX.min.y,
    (_BOX.min.z + _BOX.max.z) * 0.5
  );
  root.worldToLocal(_CENTER);
  pivot.position.copy(_CENTER).multiplyScalar(-1);
  root.updateMatrixWorld(true);
}

/**
 * Sketchfab assets often ship a huge FLOOR plane — strip before AABB fits.
 * @param {THREE.Object3D} root
 */
function stripShelfFloor(root) {
  const drop = [];
  root.traverse((obj) => {
    const n = (obj.name || "").toLowerCase();
    if (n === "floor" || n === "plane001" || n.includes("environmentambient")) {
      drop.push(obj);
    }
  });
  drop.forEach((obj) => obj.parent?.remove(obj));
}

/** @param {THREE.Object3D} root */
function countMeshes(root) {
  let n = 0;
  root?.traverse((obj) => {
    if (obj.isMesh) n += 1;
  });
  return n;
}

function polishMesh(obj, { receiveShadow = true, forceLit = false, antikythera = false } = {}) {
  if (!obj.isMesh || obj.userData._archaeologyPolished) return;
  obj.userData._archaeologyPolished = true;
  tagFrame("polish-mesh");
  obj.castShadow = true;
  obj.receiveShadow = receiveShadow;

  const srcList = Array.isArray(obj.material) ? obj.material : [obj.material];
  const outList = srcList.map((mat) => {
    if (!mat) return mat;
    const lit = forceLit ? ensureSceneLitMaterial(mat) : mat;
    lit.side = THREE.DoubleSide;
    if ("envMapIntensity" in lit) {
      lit.envMapIntensity = forceLit ? 0.35 : 1;
    }
    if (typeof lit.metalness === "number") {
      lit.metalness = Math.min(lit.metalness, forceLit ? 0.08 : 0.22);
    }
    if (typeof lit.roughness === "number") {
      lit.roughness = Math.max(lit.roughness, forceLit ? 0.82 : 0.32);
    }
    if (lit.normalMap) lit.normalMap = null;
    if (forceLit) {
      if (lit.emissive) lit.emissive.setRGB(0, 0, 0);
      if ("emissiveIntensity" in lit) lit.emissiveIntensity = 0;
      if (lit.emissiveMap) lit.emissiveMap = null;
    }
    // Don't grey-multiply the bronze albedo (GLB baseColorFactor ~0.78).
    if (antikythera && lit.color) lit.color.setRGB(1, 1, 1);
    if (antikythera) {
      lit.transparent = false;
      lit.opacity = 1;
      lit.depthWrite = true;
      if (typeof lit.metalness === "number") lit.metalness = 0.06;
      if (typeof lit.roughness === "number") lit.roughness = 0.88;
    }
    return lit;
  });
  obj.material = Array.isArray(obj.material) ? outList : outList[0];
}

/**
 * Venus GLB ships `KHR_materials_unlit` → MeshBasic (full albedo, no lights).
 * Reuse one MeshStandard swap per source material (4 meshes share Willendorf).
 * @param {THREE.Material} mat
 * @returns {THREE.Material}
 */
function ensureSceneLitMaterial(mat) {
  if (mat.userData._archaeologyLitMat) return mat.userData._archaeologyLitMat;
  const unlit =
    mat.isMeshBasicMaterial ||
    Boolean(mat.userData?.gltfExtensions?.KHR_materials_unlit);
  if (!unlit) {
    mat.userData._archaeologyLitMat = mat;
    return mat;
  }
  const std = new THREE.MeshStandardMaterial({
    name: mat.name || "Willendorf",
    map: mat.map ?? null,
    color: mat.color?.clone?.() ?? new THREE.Color(0xffffff),
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: 0.35,
    side: THREE.DoubleSide,
    transparent: Boolean(mat.transparent),
    opacity: typeof mat.opacity === "number" ? mat.opacity : 1,
    alphaTest: typeof mat.alphaTest === "number" ? mat.alphaTest : 0
  });
  if (std.map && "colorSpace" in std.map && mat.map?.colorSpace != null) {
    std.map.colorSpace = mat.map.colorSpace;
  }
  mat.userData._archaeologyLitMat = std;
  return std;
}

/**
 * Neanderthal Sketchfab export: `Sketchfab_model` must be Rx −90° (Z-up→Y-up).
 * Optional jaw-down nod is multiplied in model space after that tip — never as root
 * pitch (root pitch banks the eye line while yaw still aims the face).
 * @param {THREE.Object3D} root
 */
function alignNeanderthalUpright(root) {
  let sketch = null;
  root.traverse((obj) => {
    if (obj.name === "Sketchfab_model") sketch = obj;
  });
  if (!sketch) return;
  sketch.quaternion.setFromAxisAngle(_AXIS_X, -Math.PI / 2);
  if (NEANDERTHAL_PITCH !== 0) {
    _PITCH_Q.setFromAxisAngle(_AXIS_X, NEANDERTHAL_PITCH);
    sketch.quaternion.multiply(_PITCH_Q);
  }
  sketch.rotation.setFromQuaternion(sketch.quaternion);
  root.updateMatrixWorld(true);
}

/**
 * Seat a prop on a shelf board (sibling under vignette group — not shelf-scaled).
 * @param {THREE.Object3D} prop
 * @param {THREE.Object3D} shelf
 * @param {{ height: number, deckY: number, side: number, back: number, yaw?: number, pitch?: number, rollZ?: number, tipFlat?: boolean, tipStand?: boolean, tipTablet?: boolean }} opts
 */
function seatPropOnShelf(
  prop,
  shelf,
  {
    height,
    deckY,
    side,
    back,
    yaw = 0,
    pitch = 0,
    rollZ = 0,
    tipFlat = false,
    tipStand = false,
    tipTablet = false
  }
) {
  // tipStand / tipTablet: orient BEFORE height fit so AABB Y is the standing axis.
  if (tipStand) {
    prop.quaternion.copy(_TIP_STAND);
    prop.updateMatrixWorld(true);
  } else if (tipTablet) {
    prop.quaternion.copy(_TIP_TABLET);
    prop.updateMatrixWorld(true);
  }
  fitHeightOnFloor(prop, height);
  const yawY = shelf.rotation.y;
  const c = Math.cos(yawY);
  const s = Math.sin(yawY);
  prop.position.x = shelf.position.x + side * c + back * s;
  prop.position.z = shelf.position.z - side * s + back * c;
  // tipFlat: tip onto the deck, THEN yaw around world up.
  // Antikythera native thin is local Z — +Z tip (not −X) lays it like a plate.
  // Euler XYZ `(-π/2, yaw, 0)` stands it on edge.
  // tipStand: keep −X π/2 tip, THEN yaw around world up.
  // tipTablet: upright + lean, THEN yaw so engraving faces camera.
  // pitch: local +X nod after yaw (e.g. Neanderthal chin-down toward facing).
  _YAW_Q.setFromAxisAngle(_AXIS_Y, yawY + yaw);
  if (tipFlat) {
    prop.quaternion.copy(_YAW_Q).multiply(_TIP_FLAT);
  } else if (tipStand) {
    prop.quaternion.copy(_YAW_Q).multiply(_TIP_STAND);
  } else if (tipTablet) {
    prop.quaternion.copy(_YAW_Q).multiply(_TIP_TABLET);
  } else if (pitch !== 0 || rollZ !== 0) {
    prop.quaternion.copy(_YAW_Q);
    if (pitch !== 0) {
      _PITCH_Q.setFromAxisAngle(_AXIS_X, pitch);
      prop.quaternion.multiply(_PITCH_Q);
    }
    if (rollZ !== 0) {
      _ROLL_Q.setFromAxisAngle(_AXIS_Z, rollZ);
      prop.quaternion.multiply(_ROLL_Q);
    }
  } else {
    prop.rotation.set(0, yawY + yaw, 0);
  }
  prop.updateMatrixWorld(true);
  _BOX.setFromObject(prop);
  prop.position.y += shelf.position.y + deckY - _BOX.min.y;
  prop.updateMatrixWorld(true);
}

/**
 * Hide thin scan-probe / “toothpick” outliers on the Antikythera CT fragment.
 * @param {THREE.Object3D} root
 */
function hideAntikytheraProbes(root) {
  const items = [];
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    _BOX.setFromObject(obj);
    _BOX.getSize(_SIZE);
    const vol =
      Math.max(_SIZE.x, 1e-6) * Math.max(_SIZE.y, 1e-6) * Math.max(_SIZE.z, 1e-6);
    const minD = Math.min(_SIZE.x, _SIZE.y, _SIZE.z);
    const maxD = Math.max(_SIZE.x, _SIZE.y, _SIZE.z);
    items.push({ obj, vol, aspect: maxD / Math.max(minD, 1e-6) });
  });
  const maxVol = items.reduce((m, it) => Math.max(m, it.vol), 0);
  for (const it of items) {
    if (it.vol < maxVol * 0.14 && it.aspect >= 5.2) {
      it.obj.visible = false;
      it.obj.userData.archaeologyHiddenProbe = true;
    }
  }
}

/**
 * Spine-mount stand — pawn base, tall thin stem (like a vertebral column),
 * small pin tip that seats in the foramen magnum / spinal connection.
 * Lathe profile in meters; origin at base center, +Y up to `height`.
 * @param {number} height
 * @returns {THREE.Group}
 */
function createLucyPawnStand(height) {
  const h = Math.max(height, 1e-3);
  const pts = [
    // Foot
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.38 * h, 0),
    new THREE.Vector2(0.36 * h, 0.02 * h),
    new THREE.Vector2(0.22 * h, 0.05 * h),
    new THREE.Vector2(0.14 * h, 0.09 * h),
    // Collar → long thin spine
    new THREE.Vector2(0.1 * h, 0.12 * h),
    new THREE.Vector2(0.07 * h, 0.18 * h),
    new THREE.Vector2(0.055 * h, 0.35 * h),
    new THREE.Vector2(0.05 * h, 0.55 * h),
    new THREE.Vector2(0.048 * h, 0.75 * h),
    new THREE.Vector2(0.05 * h, 0.88 * h),
    // Pin tip — balances the skull at the spinal connection
    new THREE.Vector2(0.065 * h, 0.93 * h),
    new THREE.Vector2(0.055 * h, 0.97 * h),
    new THREE.Vector2(0.02 * h, 0.995 * h),
    new THREE.Vector2(0, h)
  ];
  const geo = new THREE.LatheGeometry(pts, 40);
  const mat = new THREE.MeshStandardMaterial({
    name: "lucy-spine-stand",
    color: 0x1c1c22,
    roughness: 0.62,
    metalness: 0.22,
    envMapIntensity: 0.35
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "lucy-spine-stand-mesh";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const root = new THREE.Group();
  root.name = "lucy-stand-root";
  root.add(mesh);
  return root;
}

/**
 * Seat the pawn stand on a shelf board (same XZ as Lucy). Geo already sized.
 * @param {THREE.Object3D} stand
 * @param {THREE.Object3D} shelf
 * @param {{ deckY: number, side: number, back: number }} opts
 */
function seatLucyStandOnShelf(stand, shelf, { deckY, side, back }) {
  const yawY = shelf.rotation.y;
  const c = Math.cos(yawY);
  const s = Math.sin(yawY);
  stand.position.x = shelf.position.x + side * c + back * s;
  stand.position.z = shelf.position.z - side * s + back * c;
  stand.position.y = shelf.position.y + deckY;
  stand.rotation.set(0, yawY, 0);
  stand.updateMatrixWorld(true);
}

/**
 * Small museum easel — plinth + angled back rest with a groove for the tablet.
 * Origin at base center; +Y up. Lean matches `CUNEIFORM_LEAN`.
 * @param {number} height
 * @param {number} width
 * @returns {THREE.Group}
 */
function createCuneiformEaselStand(height, width) {
  const h = Math.max(height, 1e-3);
  const w = Math.max(width, h * 1.2);
  const mat = new THREE.MeshStandardMaterial({
    name: "cuneiform-easel",
    color: 0x2a241c,
    roughness: 0.72,
    metalness: 0.08,
    envMapIntensity: 0.3
  });
  const root = new THREE.Group();
  root.name = "cuneiform-easel-root";

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(w, h * 0.28, w * 0.55),
    mat
  );
  plinth.position.y = h * 0.14;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  plinth.name = "cuneiform-easel-plinth";
  root.add(plinth);

  // Angled back rest — tablet leans into this face (engraving toward camera).
  const backH = h * 0.85;
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.92, backH, h * 0.08),
    mat.clone()
  );
  back.position.set(0, h * 0.28 + backH * 0.42, -w * 0.12);
  back.rotation.x = -CUNEIFORM_LEAN;
  back.castShadow = true;
  back.receiveShadow = true;
  back.name = "cuneiform-easel-back";
  root.add(back);

  // Lip / groove at the plinth front so the tablet bottom doesn't slide.
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.88, h * 0.06, h * 0.07),
    mat.clone()
  );
  lip.position.set(0, h * 0.3, w * 0.12);
  lip.castShadow = true;
  lip.receiveShadow = true;
  lip.name = "cuneiform-easel-lip";
  root.add(lip);

  return root;
}

export class ArchaeologyVignette {
  /**
   * @param {THREE.Group} group
   * @param {{
   *   vignetteIndex?: number,
   *   scrollCapture?: import("../stage/StageScrollCapture.js").StageScrollCapture,
   *   introGate?: () => boolean,
   *   deferModelLoad?: boolean,
   *   reducedMotion?: boolean,
   *   onAligned?: () => void,
   *   onPropMounted?: (root: THREE.Object3D) => void
   * }} deps
   */
  constructor(group, deps) {
    this.group = group;
    this.vignetteIndex = deps.vignetteIndex ?? 3;
    this.scrollCapture = deps.scrollCapture ?? null;
    this.introGate = deps.introGate ?? null;
    this.loadingManager = deps.loadingManager ?? null;
    this.reducedMotion = Boolean(deps.reducedMotion);
    this.onAligned = deps.onAligned ?? null;
    this.onPropMounted = deps.onPropMounted ?? null;

    /** @deprecated Pack / T-rex / stele / arch portal removed — kept null so old probes don’t throw. */
    this.packRoot = null;
    this.rexRoot = null;
    this.steleRoot = null;
    this.archRoot = null;
    this.portal = null;
    this.shelfRoot = null;
    this.venusRoot = null;
    this.antikytheraRoot = null;
    this.trojanHorseRoot = null;
    this.olmecHeadRoot = null;
    this.oliveBoatRoot = null;
    this.cuneiformRoot = null;
    this.cuneiformEaselRoot = null;
    this.ishtarGateRoot = null;
    this.lucyRoot = null;
    this.lucyStandRoot = null;
    this.ptolemyRoot = null;
    this.divjeBabeFluteRoot = null;
    this.neanderthalRoot = null;
    this.neanderthalStandRoot = null;
    /** Mounted prop roots. Consumers filter this; they do not keep their own lists. */
    this._mountedRoots = [];
    this.isOpen = false;
    this._aligned = false;
    this._modelLoadStarted = false;
    this._modelLoadSettled = false;
    this._holdForIntro = false;
    this._pendingShelf = null;
    this._pendingVenus = null;
    this._pendingAntikythera = null;
    this._pendingTrojanHorse = null;
    this._pendingOlmecHead = null;
    this._pendingOliveBoat = null;
    this._pendingCuneiform = null;
    this._pendingIshtarGate = null;
    this._pendingLucy = null;
    this._pendingPtolemy = null;
    this._pendingDivjeBabeFlute = null;
    this._pendingNeanderthal = null;

    this.group.userData.skipFloorSnap = true;
    this.blockoutRef = buildPcSceneBlockout(this.group, { hidden: true });
    if (!deps.deferModelLoad) {
      this.startModelLoad();
    }
  }

  startModelLoad({ retry = false } = {}) {
    if (
      this.shelfRoot ||
      this._pendingShelf ||
      this._pendingVenus ||
      this._pendingTrojanHorse ||
      this._pendingOlmecHead ||
      this._pendingOliveBoat ||
      this._pendingCuneiform ||
      this._pendingIshtarGate ||
      this._pendingLucy ||
      this._pendingPtolemy ||
      this._pendingDivjeBabeFlute ||
      this._pendingNeanderthal
    ) {
      return;
    }
    if (this._modelLoadStarted && !retry) return;
    this._modelLoadStarted = true;
    this._modelLoadSettled = false;
    this._modelLoadError = null;
    void this._loadModels();
  }

  async integrateAfterIntro({
    yieldFrame = async () => {},
    revealHidden = false
  } = {}) {
    this.startModelLoad();
    let spins = 0;
    while (
      !this.shelfRoot &&
      !this._pendingShelf &&
      this._modelLoadStarted &&
      spins < 180
    ) {
      await yieldFrame();
      spins += 1;
    }
    let loadSpins = 0;
    while (!this._modelLoadSettled && this._modelLoadStarted && loadSpins < 360) {
      await yieldFrame();
      loadSpins += 1;
    }
    if (this.shelfRoot) {
      await this._commitModels({ yieldFrame, revealHidden });
      return;
    }
    if (!this._pendingShelf && this._modelLoadSettled) {
      this.startModelLoad({ retry: true });
      spins = 0;
      while (
        !this.shelfRoot &&
        !this._pendingShelf &&
        this._modelLoadStarted &&
        spins < 180
      ) {
        await yieldFrame();
        spins += 1;
      }
    }
    if (!this._pendingShelf) return;
    this._holdForIntro = false;
    await this._commitModels({ yieldFrame, revealHidden });
  }

  async _loadModels() {
    const loader = createGltfLoader(this.loadingManager ?? undefined);
    // Antikythera parked — do not load (runtime GLB kept on disk for restore).
    const [
      shelfResult,
      venusResult,
      horseResult,
      olmecResult,
      boatResult,
      cuneiformResult,
      ishtarResult,
      lucyResult,
      ptolemyResult,
      fluteResult,
      neanderthalResult
    ] = await spanFrame("archaeology-parse", () =>
      Promise.allSettled([
        loader.loadAsync(SHELF_URL),
        loader.loadAsync(VENUS_URL),
        loader.loadAsync(TROJAN_HORSE_URL),
        loader.loadAsync(OLMEC_HEAD_URL),
        loader.loadAsync(OLIVE_BOAT_URL),
        loader.loadAsync(CUNEIFORM_URL),
        loader.loadAsync(ISHTAR_GATE_URL),
        loader.loadAsync(LUCY_URL),
        loader.loadAsync(PTOLEMY_URL),
        loader.loadAsync(DIVJE_BABE_FLUTE_URL),
        loader.loadAsync(NEANDERTHAL_URL)
      ])
    );

    if (shelfResult.status === "fulfilled") {
      this._pendingShelf = shelfResult.value.scene;
    } else {
      this._modelLoadError = String(shelfResult.reason?.message || shelfResult.reason);
      console.warn("[ArchaeologyVignette] Failed to load shelving unit.", shelfResult.reason);
    }
    if (venusResult.status === "fulfilled") {
      this._pendingVenus = venusResult.value.scene;
    } else {
      console.warn("[ArchaeologyVignette] Failed to load Venus.", venusResult.reason);
    }
    if (horseResult.status === "fulfilled") {
      this._pendingTrojanHorse = horseResult.value.scene;
    } else {
      console.warn("[ArchaeologyVignette] Failed to load Trojan Horse.", horseResult.reason);
    }
    if (olmecResult.status === "fulfilled") {
      this._pendingOlmecHead = olmecResult.value.scene;
    } else {
      console.warn("[ArchaeologyVignette] Failed to load Olmec Head.", olmecResult.reason);
    }
    if (boatResult.status === "fulfilled") {
      this._pendingOliveBoat = boatResult.value.scene;
    } else {
      console.warn("[ArchaeologyVignette] Failed to load Olive Wood Boat.", boatResult.reason);
    }
    if (cuneiformResult.status === "fulfilled") {
      this._pendingCuneiform = cuneiformResult.value.scene;
    } else {
      console.warn("[ArchaeologyVignette] Failed to load Cuneiform Tablet.", cuneiformResult.reason);
    }
    if (ishtarResult.status === "fulfilled") {
      this._pendingIshtarGate = ishtarResult.value.scene;
    } else {
      console.warn("[ArchaeologyVignette] Failed to load Ishtar Gate.", ishtarResult.reason);
    }
    if (lucyResult.status === "fulfilled") {
      this._pendingLucy = lucyResult.value.scene;
    } else {
      console.warn("[ArchaeologyVignette] Failed to load Lucy.", lucyResult.reason);
    }
    if (ptolemyResult.status === "fulfilled") {
      this._pendingPtolemy = ptolemyResult.value.scene;
    } else {
      console.warn("[ArchaeologyVignette] Failed to load Ptolemy.", ptolemyResult.reason);
    }
    if (fluteResult.status === "fulfilled") {
      this._pendingDivjeBabeFlute = fluteResult.value.scene;
    } else {
      console.warn(
        "[ArchaeologyVignette] Failed to load Divje Babe Flute.",
        fluteResult.reason
      );
    }
    if (neanderthalResult.status === "fulfilled") {
      this._pendingNeanderthal = neanderthalResult.value.scene;
    } else {
      console.warn(
        "[ArchaeologyVignette] Failed to load Neanderthal.",
        neanderthalResult.reason
      );
    }

    if (this._pendingShelf) {
      this._holdForIntro = true;
    }
    this._modelLoadSettled = true;
  }

  /**
   * The only way a prop root enters hide, fade, scroll capture, compile, or edge glitch.
   * @param {THREE.Object3D} root
   * @param {string} name
   * @param {{ edgeGlitchZoom?: boolean, edgeGlitchRest?: boolean }} [flags]
   */
  _mountRoot(root, name, flags = {}) {
    if (!root) return;
    const prior = root.userData.archaeologyMount;
    if (prior && this._mountedRoots.includes(root)) return;
    root.userData.archaeologyMount = {
      name,
      fades: true,
      scroll: true,
      compile: true,
      edgeGlitchZoom: flags.edgeGlitchZoom !== false,
      edgeGlitchRest: Boolean(flags.edgeGlitchRest)
    };
    this._mountedRoots.push(root);
  }

  /**
   * @param {{ fades?: boolean, scroll?: boolean, compile?: boolean, edgeGlitchZoom?: boolean, edgeGlitchRest?: boolean }} [filter]
   * @returns {THREE.Object3D[]}
   */
  getMountedRoots(filter) {
    if (!filter) return this._mountedRoots.slice();
    return this._mountedRoots.filter((root) => {
      const tag = root.userData.archaeologyMount;
      if (!tag) return false;
      for (const key of Object.keys(filter)) {
        if (tag[key] !== filter[key]) return false;
      }
      return true;
    });
  }

  async _commitModels({ yieldFrame = async () => {}, revealHidden = false } = {}) {
    if (!this.shelfRoot && !this._pendingShelf) return;

    this.group.position.y = 0;

    await yieldFrame();

    if (this._pendingShelf) {
      this.shelfRoot = this._pendingShelf;
      this._pendingShelf = null;
      this.shelfRoot.name = "shelving-unit-root";
      stripShelfFloor(this.shelfRoot);
      this.group.add(this.shelfRoot);
      this._mountRoot(this.shelfRoot, "shelf", {
        edgeGlitchZoom: false,
        edgeGlitchRest: true
      });
      holdRootOffCamera(this.shelfRoot);
      this.shelfRoot.rotation.y = SHELF_YAW;
      const shelfScale = archaeologyShelfScale();
      const shelfH = SHELF_REAL_HEIGHT_M * shelfScale;
      fitHeightOnFloor(this.shelfRoot, shelfH);
      this.shelfRoot.position.x += SHELF_SIDE;
      this.shelfRoot.position.z += SHELF_FORWARD;
      this.shelfRoot.userData.archaeologyPropScale = shelfScale;
      this.shelfRoot.userData.shelfHeightM = shelfH;
      this.shelfRoot.traverse((obj) => polishMesh(obj));
    }

    await yieldFrame();

    const propScale =
      this.shelfRoot?.userData?.archaeologyPropScale ?? archaeologyShelfScale();
    const shelfH =
      this.shelfRoot?.userData?.shelfHeightM ?? SHELF_REAL_HEIGHT_M * propScale;

    if (this._pendingVenus && this.shelfRoot) {
      this.venusRoot = this._pendingVenus;
      this._pendingVenus = null;
      this.venusRoot.name = "venus-willendorf-root";
      this.group.add(this.venusRoot);
      this._mountRoot(this.venusRoot, "venus");
      holdRootOffCamera(this.venusRoot);
      this.venusRoot.traverse((obj) => polishMesh(obj, { forceLit: true }));
      seatPropOnShelf(this.venusRoot, this.shelfRoot, {
        height: VENUS_REAL_HEIGHT_M * propScale * VENUS_EXTRA_SCALE,
        deckY: SHELF_DECK_VENUS_FRAC * shelfH,
        side: PROP_SIDE_VENUS_M * propScale,
        back: -PROP_BACK_INSET_M * propScale,
        yaw: THREE.MathUtils.degToRad(18)
      });
      this.onPropMounted?.(this.venusRoot);
    } else {
      this._pendingVenus = null;
    }

    if (this._pendingOliveBoat && this.shelfRoot) {
      this.oliveBoatRoot = this._pendingOliveBoat;
      this._pendingOliveBoat = null;
      this.oliveBoatRoot.name = "olive-wood-boat-root";
      this.group.add(this.oliveBoatRoot);
      this._mountRoot(this.oliveBoatRoot, "olive-boat");
      holdRootOffCamera(this.oliveBoatRoot);
      this.oliveBoatRoot.traverse((obj) => polishMesh(obj, { forceLit: true }));
      seatPropOnShelf(this.oliveBoatRoot, this.shelfRoot, {
        height: OLIVE_BOAT_REAL_HEIGHT_M * propScale * OLIVE_BOAT_EXTRA_SCALE,
        deckY: SHELF_DECK_VENUS_FRAC * shelfH,
        side: PROP_SIDE_OLIVE_BOAT_M * propScale,
        back: PROP_BACK_OLIVE_BOAT_M * propScale,
        // Length along the shelf board (native long axis is local Z).
        yaw: THREE.MathUtils.degToRad(78)
      });
      this.onPropMounted?.(this.oliveBoatRoot);
    } else {
      this._pendingOliveBoat = null;
    }

    if (this._pendingCuneiform && this.shelfRoot) {
      this.cuneiformRoot = this._pendingCuneiform;
      this._pendingCuneiform = null;
      this.cuneiformRoot.name = "cuneiform-tablet-root";
      stripShelfFloor(this.cuneiformRoot);
      this.group.add(this.cuneiformRoot);
      this._mountRoot(this.cuneiformRoot, "cuneiform");
      holdRootOffCamera(this.cuneiformRoot);
      this.cuneiformRoot.traverse((obj) => polishMesh(obj, { forceLit: true }));

      const easelH = CUNEIFORM_EASEL_HEIGHT_M * propScale;
      const tabletH = CUNEIFORM_REAL_HEIGHT_M * propScale * CUNEIFORM_EXTRA_SCALE;
      const deckY = SHELF_DECK_CUNEIFORM_FRAC * shelfH;
      const side = PROP_SIDE_CUNEIFORM_M * propScale;
      const back = PROP_BACK_CUNEIFORM_M * propScale;

      this.cuneiformEaselRoot = createCuneiformEaselStand(easelH, tabletH * 0.7);
      this.group.add(this.cuneiformEaselRoot);
      this._mountRoot(this.cuneiformEaselRoot, "cuneiform-easel");
      holdRootOffCamera(this.cuneiformEaselRoot);
      // Face easel toward camera (same yaw stack as tablet).
      seatLucyStandOnShelf(this.cuneiformEaselRoot, this.shelfRoot, {
        deckY,
        side,
        back
      });
      this.cuneiformEaselRoot.rotation.y += CUNEIFORM_YAW;

      // Standing tablet leans into the easel; face toward camera.
      seatPropOnShelf(this.cuneiformRoot, this.shelfRoot, {
        height: tabletH,
        deckY: deckY + easelH * 0.28,
        side,
        back: back + 0.01 * propScale,
        yaw: CUNEIFORM_YAW,
        tipTablet: true
      });
      this.onPropMounted?.(this.cuneiformRoot);
      this.onPropMounted?.(this.cuneiformEaselRoot);
    } else {
      this._pendingCuneiform = null;
    }

    // Same board as cuneiform — opposite lateral (under Venus).
    if (!this.ishtarGateRoot && this._pendingIshtarGate && this.shelfRoot) {
      this.ishtarGateRoot = this._pendingIshtarGate;
      this._pendingIshtarGate = null;
      this.ishtarGateRoot.name = "ishtar-gate-root";
      stripShelfFloor(this.ishtarGateRoot);
      this.group.add(this.ishtarGateRoot);
      this._mountRoot(this.ishtarGateRoot, "ishtar");
      holdRootOffCamera(this.ishtarGateRoot);
      this.ishtarGateRoot.traverse((obj) => polishMesh(obj, { forceLit: true }));
      seatPropOnShelf(this.ishtarGateRoot, this.shelfRoot, {
        height: ISHTAR_GATE_REAL_HEIGHT_M * propScale * ISHTAR_GATE_EXTRA_SCALE,
        deckY: SHELF_DECK_ISHTAR_FRAC * shelfH,
        side: PROP_SIDE_ISHTAR_M * propScale,
        back: PROP_BACK_ISHTAR_M * propScale,
        yaw: ISHTAR_GATE_YAW
      });
      this.onPropMounted?.(this.ishtarGateRoot);
    }

    if (this._pendingTrojanHorse && this.shelfRoot) {
      this.trojanHorseRoot = this._pendingTrojanHorse;
      this._pendingTrojanHorse = null;
      this.trojanHorseRoot.name = "trojan-horse-root";
      this.group.add(this.trojanHorseRoot);
      this._mountRoot(this.trojanHorseRoot, "trojan-horse");
      holdRootOffCamera(this.trojanHorseRoot);
      this.trojanHorseRoot.traverse((obj) => polishMesh(obj, { forceLit: true }));
      seatPropOnShelf(this.trojanHorseRoot, this.shelfRoot, {
        height: TROJAN_HORSE_REAL_HEIGHT_M * propScale * TROJAN_HORSE_EXTRA_SCALE,
        deckY: SHELF_DECK_TROJAN_FRAC * shelfH,
        side: PROP_SIDE_TROJAN_M * propScale,
        back: -PROP_BACK_INSET_M * propScale,
        yaw: TROJAN_YAW,
        tipStand: true
      });
      this.onPropMounted?.(this.trojanHorseRoot);
    } else {
      this._pendingTrojanHorse = null;
    }

    if (this._pendingOlmecHead && this.shelfRoot) {
      this.olmecHeadRoot = this._pendingOlmecHead;
      this._pendingOlmecHead = null;
      this.olmecHeadRoot.name = "olmec-head-root";
      stripShelfFloor(this.olmecHeadRoot);
      this.group.add(this.olmecHeadRoot);
      this._mountRoot(this.olmecHeadRoot, "olmec");
      holdRootOffCamera(this.olmecHeadRoot);
      this.olmecHeadRoot.traverse((obj) => polishMesh(obj, { forceLit: true }));
      seatPropOnShelf(this.olmecHeadRoot, this.shelfRoot, {
        height: OLMEC_HEAD_REAL_HEIGHT_M * propScale * OLMEC_HEAD_EXTRA_SCALE,
        deckY: SHELF_DECK_OLMEC_FRAC * shelfH,
        side: PROP_SIDE_OLMEC_M * propScale,
        back: PROP_BACK_OLMEC_M * propScale,
        yaw: OLMEC_YAW
      });
      this.onPropMounted?.(this.olmecHeadRoot);
    } else {
      this._pendingOlmecHead = null;
    }

    // Antikythera parked — skip seat. Drop any stale pending from older builds.
    this._pendingAntikythera = null;

    // Bottom board L→R: Neanderthal (spine stand), Divje Babe flute, Lucy (spine stand).
    if (!this.neanderthalRoot && this._pendingNeanderthal && this.shelfRoot) {
      this.neanderthalRoot = this._pendingNeanderthal;
      this._pendingNeanderthal = null;
      this.neanderthalRoot.name = "neanderthal-root";
      stripShelfFloor(this.neanderthalRoot);
      this.group.add(this.neanderthalRoot);
      this._mountRoot(this.neanderthalRoot, "neanderthal");
      holdRootOffCamera(this.neanderthalRoot);
      this.neanderthalRoot.traverse((obj) => polishMesh(obj, { forceLit: true }));

      // Sketchfab Rx−90 + model-space jaw nod; face aim = root yaw only.
      alignNeanderthalUpright(this.neanderthalRoot);

      const standH = NEANDERTHAL_STAND_HEIGHT_M * propScale;
      const deckY = SHELF_DECK_NEANDERTHAL_FRAC * shelfH;
      const side = PROP_SIDE_NEANDERTHAL_M * propScale;
      const back = PROP_BACK_NEANDERTHAL_M * propScale;

      this.neanderthalStandRoot = createLucyPawnStand(standH);
      this.neanderthalStandRoot.name = "neanderthal-stand-root";
      this.group.add(this.neanderthalStandRoot);
      this._mountRoot(this.neanderthalStandRoot, "neanderthal-stand");
      holdRootOffCamera(this.neanderthalStandRoot);
      seatLucyStandOnShelf(this.neanderthalStandRoot, this.shelfRoot, {
        deckY,
        side,
        back
      });

      seatPropOnShelf(this.neanderthalRoot, this.shelfRoot, {
        height: NEANDERTHAL_REAL_HEIGHT_M * propScale * NEANDERTHAL_EXTRA_SCALE,
        deckY: deckY + standH * NEANDERTHAL_STAND_ENGAGE_FRAC,
        side,
        back,
        yaw: NEANDERTHAL_YAW
      });
      this.onPropMounted?.(this.neanderthalRoot);
      this.onPropMounted?.(this.neanderthalStandRoot);
    }

    if (!this.divjeBabeFluteRoot && this._pendingDivjeBabeFlute && this.shelfRoot) {
      this.divjeBabeFluteRoot = this._pendingDivjeBabeFlute;
      this._pendingDivjeBabeFlute = null;
      this.divjeBabeFluteRoot.name = "divje-babe-flute-root";
      stripShelfFloor(this.divjeBabeFluteRoot);
      this.group.add(this.divjeBabeFluteRoot);
      this._mountRoot(this.divjeBabeFluteRoot, "flute");
      holdRootOffCamera(this.divjeBabeFluteRoot);
      this.divjeBabeFluteRoot.traverse((obj) => polishMesh(obj, { forceLit: true }));
      seatPropOnShelf(this.divjeBabeFluteRoot, this.shelfRoot, {
        height:
          DIVJE_BABE_FLUTE_REAL_HEIGHT_M * propScale * DIVJE_BABE_FLUTE_EXTRA_SCALE,
        deckY: SHELF_DECK_FLUTE_FRAC * shelfH,
        side: PROP_SIDE_FLUTE_M * propScale,
        back: PROP_BACK_FLUTE_M * propScale,
        yaw: DIVJE_BABE_FLUTE_YAW
      });
      this.onPropMounted?.(this.divjeBabeFluteRoot);
    }

    if (!this.lucyRoot && this._pendingLucy && this.shelfRoot) {
      this.lucyRoot = this._pendingLucy;
      this._pendingLucy = null;
      this.lucyRoot.name = "lucy-root";
      stripShelfFloor(this.lucyRoot);
      this.group.add(this.lucyRoot);
      this._mountRoot(this.lucyRoot, "lucy");
      holdRootOffCamera(this.lucyRoot);
      this.lucyRoot.traverse((obj) => polishMesh(obj, { forceLit: true }));

      const standH = LUCY_STAND_HEIGHT_M * propScale;
      const deckY = SHELF_DECK_LUCY_FRAC * shelfH;
      const side = PROP_SIDE_LUCY_M * propScale;
      const back = PROP_BACK_LUCY_M * propScale;

      this.lucyStandRoot = createLucyPawnStand(standH);
      this.group.add(this.lucyStandRoot);
      this._mountRoot(this.lucyStandRoot, "lucy-stand");
      holdRootOffCamera(this.lucyStandRoot);
      seatLucyStandOnShelf(this.lucyStandRoot, this.shelfRoot, {
        deckY,
        side,
        back
      });

      // Tip rises into the foramen — AABB bottom sits mid-stem, not on a floating cup.
      seatPropOnShelf(this.lucyRoot, this.shelfRoot, {
        height: LUCY_REAL_HEIGHT_M * propScale * LUCY_EXTRA_SCALE,
        deckY: deckY + standH * LUCY_STAND_ENGAGE_FRAC,
        side,
        back,
        yaw: LUCY_YAW
      });
      this.onPropMounted?.(this.lucyRoot);
      this.onPropMounted?.(this.lucyStandRoot);
    }

    if (!this.ptolemyRoot && this._pendingPtolemy && this.shelfRoot) {
      this.ptolemyRoot = this._pendingPtolemy;
      this._pendingPtolemy = null;
      this.ptolemyRoot.name = "ptolemy-root";
      if (countMeshes(this.ptolemyRoot) === 0) {
        console.warn(
          "[ArchaeologyVignette] Ptolemy GLB has no meshes — run node scripts/rebuild-ptolemy-runtime.mjs"
        );
        this.group.remove(this.ptolemyRoot);
        this.ptolemyRoot = null;
      } else {
        stripShelfFloor(this.ptolemyRoot);
        this.group.add(this.ptolemyRoot);
        this._mountRoot(this.ptolemyRoot, "ptolemy");
        holdRootOffCamera(this.ptolemyRoot);
        this.ptolemyRoot.traverse((obj) => polishMesh(obj, { forceLit: true }));
        seatPropOnShelf(this.ptolemyRoot, this.shelfRoot, {
          height: PTOLEMY_REAL_HEIGHT_M * propScale * PTOLEMY_EXTRA_SCALE,
          deckY: SHELF_DECK_PTOLEMY_FRAC * shelfH,
          side: PROP_SIDE_PTOLEMY_M * propScale,
          back: PROP_BACK_PTOLEMY_M * propScale,
          yaw: PTOLEMY_YAW
        });
        this.onPropMounted?.(this.ptolemyRoot);
      }
    }

    this.group.traverse((obj) => {
      if (obj.isMesh) obj.userData.vignetteIndex = this.vignetteIndex;
    });
    this._registerScrollCapture();

    if (revealHidden) {
      for (const root of this.getMountedRoots({ fades: true })) {
        hideGroupForReveal(root);
      }
    }

    const nameOf = (root) => root.userData.archaeologyMount?.name || root.name;
    const mounted = this.getMountedRoots();
    const zoom = this.getMountedRoots({ edgeGlitchZoom: true }).map(nameOf).join(",");
    const rest = this.getMountedRoots({ edgeGlitchRest: true }).map(nameOf).join(",");
    const scrollCount = this.scrollCapture?.meshTargets?.get?.("archaeology")?.meshes?.length ?? 0;
    console.log(
      `[Archaeology] reveal registry ${mounted.length} ${mounted.map(nameOf).join(",")} zoom=${zoom} rest=${rest} scroll=${scrollCount}`
    );

    this._aligned = true;
    this.onAligned?.();
  }

  _registerScrollCapture() {
    if (!this.scrollCapture) return;
    const meshes = this.getMountedRoots({ scroll: true });
    if (!meshes.length) return;
    this.scrollCapture.registerMesh(SCROLL_CAPTURE_MESH_IDS.archaeology, {
      vignetteIndex: this.vignetteIndex,
      meshes,
      onPointerDown: () => false,
      onPointerMove: () => false
    });
  }

  /**
   * Edge-glitch silhouette roots for Archaeology.
   * Rest: neon tube + shelf. Zoom: finds.
   * @param {{ zoomed?: boolean, neonTube?: THREE.Object3D | null }} [opts]
   * @returns {THREE.Object3D[]}
   */
  getEdgeGlitchRoots({ zoomed = false, neonTube = null } = {}) {
    if (zoomed) {
      return this.getMountedRoots({ edgeGlitchZoom: true });
    }
    return [neonTube, ...this.getMountedRoots({ edgeGlitchRest: true })].filter(Boolean);
  }

  /**
   * @param {boolean} zoomed
   */
  syncToCameraZoom(zoomed) {
    this.setPackOpen(zoomed);
  }

  /**
   * Pack open morph removed — zoom still toggles via StageExperience.
   * @param {boolean} open
   */
  setPackOpen(open) {
    this.isOpen = open;
  }

  update(_time) {
    if (!this._aligned) return;
  }

  setActive() {}

  setInactive() {}
}
