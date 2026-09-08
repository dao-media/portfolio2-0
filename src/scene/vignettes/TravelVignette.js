import gsap from "gsap";
import * as THREE from "three";
import { createGltfLoader } from "../loaders/createGltfLoader.js";
import { hideGroupForReveal, holdRootOffCamera } from "../stage/stageModelReveal.js";
import { spanFrame } from "../stage/frameBudget.js";
import { tagFrame } from "../stage/frameBudget.js";
import { SCROLL_CAPTURE_MESH_IDS } from "../stage/scrollCaptureTargets.js";
import { buildPcSceneBlockout } from "./pcSceneBlockout.js";
import { RexBoneTwitch } from "./rexBoneTwitch.js";

const PACK_URL = "/assets/models/travel-pack/runtime/travel-pack.glb";
const REX_URL = "/assets/models/t-rex/runtime/t-rex.glb";

const PACK_HEIGHT = 1.68;
const REX_HEIGHT = 3.35;
const PACK_FORWARD = 0.92;
const PACK_SIDE = -0.42;
const REX_BACK = -0.28;
const REX_SIDE = 0.18;
const PACK_OPEN_DURATION = 0.82;
const PACK_YAW = Math.PI;
const REX_YAW = Math.PI / 2 + THREE.MathUtils.degToRad(160);

const _BOX = new THREE.Box3();
const _SIZE = new THREE.Vector3();

export const travelVignetteMeta = {
  name: "Travel Pack",
  tint: 0xc4a574,
  neonColors: ["#ff3d1a", "#ffc14a"],
  desc: "Click the pack to open it. The bones don’t always stay still."
};

function findNamed(root, name) {
  if (root.name === name) return root;
  return root.getObjectByName(name);
}

function morphedWorldY(root) {
  root.updateMatrixWorld(true);
  let minY = Infinity;
  let maxY = -Infinity;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
    const pos = obj.geometry.attributes.position;
    const morphs = obj.morphTargetInfluences;
    const attrs = obj.geometry.morphAttributes?.position;
    const e = obj.matrixWorld.elements;
    const step = Math.max(1, (pos.count / 1200) | 0);
    for (let i = 0; i < pos.count; i += step) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      if (morphs && attrs) {
        for (let m = 0; m < morphs.length; m += 1) {
          const w = morphs[m];
          if (!w) continue;
          const a = attrs[m];
          x += a.getX(i) * w;
          y += a.getY(i) * w;
          z += a.getZ(i) * w;
        }
      }
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
    }
  });
  return { minY, height: maxY - minY };
}

function fitMorphedHeightOnFloor(root, height) {
  const before = morphedWorldY(root);
  if (!(before.height > 1e-4)) {
    fitHeightOnFloor(root, height);
    return;
  }
  root.scale.multiplyScalar(height / before.height);
  root.updateMatrixWorld(true);
  const after = morphedWorldY(root);
  if (Number.isFinite(after.minY)) root.position.y -= after.minY;
  root.updateMatrixWorld(true);
}

function fitHeightOnFloor(root, height) {
  root.updateMatrixWorld(true);
  _BOX.setFromObject(root);
  if (_BOX.isEmpty()) return;
  _BOX.getSize(_SIZE);
  if (_SIZE.y < 1e-4) return;
  root.scale.multiplyScalar(height / _SIZE.y);
  root.updateMatrixWorld(true);
  _BOX.setFromObject(root);
  root.position.y -= _BOX.min.y;
  root.updateMatrixWorld(true);
}

function polishMesh(obj, { receiveShadow = true } = {}) {
  if (!obj.isMesh || obj.userData._travelPolished) return;
  obj.userData._travelPolished = true;
  tagFrame("polish-mesh");
  obj.castShadow = true;
  obj.receiveShadow = receiveShadow;
  const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
  materials.forEach((mat) => {
    if (!mat) return;
    // GLBs author doubleSided; FrontSide hid inverted bone shells as a black void.
    mat.side = THREE.DoubleSide;
    mat.envMapIntensity = 1;
    if (typeof mat.metalness === "number") mat.metalness = Math.min(mat.metalness, 0.22);
    if (typeof mat.roughness === "number") mat.roughness = Math.max(mat.roughness, 0.32);
    // Runtime pack/rex GLBs point normalMap at bump/height atlases and ship no
    // TANGENT. Even computed tangents leave MeshStandard lighting at zero.
    if (mat.normalMap) mat.normalMap = null;
  });
}

export class TravelVignette {
  /**
   * @param {THREE.Group} group
   * @param {{
   *   vignetteIndex?: number,
   *   scrollCapture?: import("../stage/StageScrollCapture.js").StageScrollCapture,
   *   introGate?: () => boolean,
   *   deferModelLoad?: boolean,
   *   reducedMotion?: boolean,
   *   onAligned?: () => void
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

    this.packRoot = null;
    this.rexRoot = null;
    this.packMorphs = [];
    this.twitch = null;
    this.isOpen = false;
    this._aligned = false;
    this._modelLoadStarted = false;
    this._modelLoadSettled = false;
    this._holdForIntro = false;
    this._pendingPack = null;
    this._pendingRex = null;
    this._openTween = null;
    this._openBlend = { t: 0 };

    // Own floor fit (morphed pack + rex). Group snap uses rest-pose AABBs
    // (ignores morphs) and was lifting the whole stop ~2.7 m — rex floated.
    this.group.userData.skipFloorSnap = true;
    this.blockoutRef = buildPcSceneBlockout(this.group, { hidden: true });
    if (!deps.deferModelLoad) {
      this.startModelLoad();
    }
  }

  startModelLoad({ retry = false } = {}) {
    if (this.packRoot || this.rexRoot || this._pendingPack || this._pendingRex) return;
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
      !this.packRoot &&
      !this.rexRoot &&
      !this._pendingPack &&
      !this._pendingRex &&
      this._modelLoadStarted &&
      spins < 180
    ) {
      await yieldFrame();
      spins += 1;
    }
    if (this.packRoot || this.rexRoot) return;
    if (!this._pendingPack && !this._pendingRex && this._modelLoadSettled) {
      this.startModelLoad({ retry: true });
      spins = 0;
      while (
        !this.packRoot &&
        !this.rexRoot &&
        !this._pendingPack &&
        !this._pendingRex &&
        this._modelLoadStarted &&
        spins < 180
      ) {
        await yieldFrame();
        spins += 1;
      }
    }
    if (!this._pendingPack && !this._pendingRex) return;
    this._holdForIntro = false;
    await this._commitModels({ yieldFrame, revealHidden });
  }

  async _loadModels() {
    const loader = createGltfLoader(this.loadingManager ?? undefined);
    const [packResult, rexResult] = await spanFrame("travel-parse", () =>
      Promise.allSettled([loader.loadAsync(PACK_URL), loader.loadAsync(REX_URL)])
    );

    if (packResult.status === "fulfilled") {
      this._pendingPack = packResult.value.scene;
    } else {
      this._modelLoadError = String(packResult.reason?.message || packResult.reason);
      console.warn("[TravelVignette] Failed to load travel pack.", packResult.reason);
    }
    if (rexResult.status === "fulfilled") {
      this._pendingRex = rexResult.value.scene;
    } else {
      this._modelLoadError = String(rexResult.reason?.message || rexResult.reason);
      console.warn("[TravelVignette] Failed to load T-rex.", rexResult.reason);
    }

    if (this._pendingPack || this._pendingRex) {
      this._holdForIntro = true;
    }
    this._modelLoadSettled = true;
  }

  async _commitModels({ yieldFrame = async () => {}, revealHidden = false } = {}) {
    if (this.packRoot || this.rexRoot) return;

    // Keep group on the stage floor — local fits assume parent Y = 0.
    this.group.position.y = 0;

    if (this._pendingRex) {
      this.rexRoot = findNamed(this._pendingRex, "rex-root") ?? this._pendingRex;
      this._pendingRex = null;
      this.rexRoot.name = "rex-root";
      this.rexRoot.rotation.y = REX_YAW;
      this.group.add(this.rexRoot);
      holdRootOffCamera(this.rexRoot);
      fitHeightOnFloor(this.rexRoot, REX_HEIGHT);
      this.rexRoot.position.x += REX_SIDE;
      this.rexRoot.position.z += REX_BACK;
      this.rexRoot.traverse((obj) => polishMesh(obj, { receiveShadow: false }));
    }

    await yieldFrame();

    if (this._pendingPack) {
      this.packRoot = findNamed(this._pendingPack, "travel-pack-root") ?? this._pendingPack;
      this._pendingPack = null;
      this.packRoot.name = "travel-pack-root";
      this.group.add(this.packRoot);
      holdRootOffCamera(this.packRoot);
      this.packRoot.rotation.y += PACK_YAW;
      this.packMorphs = [];
      this.packRoot.traverse((obj) => {
        polishMesh(obj);
        if (obj.isMesh && obj.morphTargetInfluences?.length) {
          this.packMorphs.push(obj);
        }
      });
      // Closed morph is much shorter than the rest pose; fit after applying it.
      this._applyLid(this._openBlend.t);
      fitMorphedHeightOnFloor(this.packRoot, PACK_HEIGHT);
      this.packRoot.position.x += PACK_SIDE;
      this.packRoot.position.z += PACK_FORWARD;
    }

    // Do NOT snapGroupToFloor here — rest-pose Box3 ignores lid morphs and
    // lifts the group, leaving the already-fitted rex mid-air.
    this.group.traverse((obj) => {
      if (obj.isMesh) obj.userData.vignetteIndex = this.vignetteIndex;
    });
    this._registerScrollCapture();

    if (this.rexRoot && !this.reducedMotion) {
      this.twitch = new RexBoneTwitch(this.rexRoot, { reducedMotion: this.reducedMotion });
    }

    if (revealHidden) {
      if (this.packRoot) hideGroupForReveal(this.packRoot);
      if (this.rexRoot) hideGroupForReveal(this.rexRoot);
    }

    this._aligned = true;
    this.onAligned?.();
  }

  _applyLid(t) {
    const open = THREE.MathUtils.clamp(t, 0, 1);
    const closed = 1 - open;
    this.packMorphs.forEach((mesh) => {
      mesh.morphTargetInfluences[0] = closed;
    });
  }

  _registerScrollCapture() {
    if (!this.scrollCapture) return;
    const meshes = [this.packRoot, this.rexRoot].filter(Boolean);
    if (!meshes.length) return;
    this.scrollCapture.registerMesh(SCROLL_CAPTURE_MESH_IDS.travelPack, {
      vignetteIndex: this.vignetteIndex,
      meshes,
      onPointerDown: () => false,
      onPointerMove: () => false
    });
  }

  /**
   * @param {boolean} zoomed
   */
  syncToCameraZoom(zoomed) {
    this.setPackOpen(zoomed);
  }

  /**
   * @param {boolean} open
   */
  setPackOpen(open) {
    const target = open ? 1 : 0;
    if (this.reducedMotion) {
      this._openTween?.kill();
      this._openTween = null;
      this._openBlend.t = target;
      this._applyLid(target);
      this.isOpen = open;
      return;
    }
    if (Math.abs(this._openBlend.t - target) < 1e-3 && !this._openTween) {
      this.isOpen = open;
      return;
    }
    this._openTween?.kill();
    this._openTween = gsap.to(this._openBlend, {
      t: target,
      duration: PACK_OPEN_DURATION * Math.max(Math.abs(target - this._openBlend.t), 0.18),
      ease: "power3.inOut",
      overwrite: true,
      onUpdate: () => this._applyLid(this._openBlend.t),
      onComplete: () => {
        this._openTween = null;
        this.isOpen = open;
        this._applyLid(target);
      }
    });
  }

  /**
   * @param {number} time
   */
  update(time) {
    if (!this._aligned) return;
    this.twitch?.update(time);
  }

  setActive() {}

  setInactive() {}
}
