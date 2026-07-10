import * as THREE from "three";
import gsap from "gsap";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SCROLL_CAPTURE_MESH_IDS } from "../stage/scrollCaptureTargets.js";
import {
  buildPcSceneBlockout,
  findBlockoutPart,
  measureSceneBounds
} from "./pcSceneBlockout.js";
import { LOOK } from "../stage/constants.js";
import {
  applySidekickScreenTexture,
  configureSidekickScreenMaterial,
  ensureSidekickScreenMapLocked
} from "./sidekickScreenTexture.js";
import { SidekickScrollballLed } from "./SidekickScrollballLed.js";
import { hideGroupForReveal } from "../stage/stageModelReveal.js";
import "./sidekickMotionEasing.js";

const MODEL_URL = "/assets/models/sidekick/Sidekick3.glb";
const SCREEN_NODE_NAME = "Screen";
const SCREEN_FRAME_NAME = "ScreenFrame";
const SCREEN_MATERIAL_NAME = "SCREENIMAGE";
const PHONE_ROOT_NAME = "TMobleSideKick3";
const SWIVEL_NODE_NAME = "swivelOpenRotateY";
const SLIDE_NODE_NAME = "offsetRotateX";
const RIVET_NODE_NAME = "rivet";
const SWIVEL_PART_NAME = "swivelPart";

const CLOSED_LCD_FORWARD_Z = 0.0025;
const SCREEN_FRAME_REVEAL = 0.22;
const SWIVEL_DURATION = 0.88 * 0.7;
const SWIVEL_CLOSED_SLIDE_Z = -Math.PI;
const CLOSED_HINGE_TILT_X = -0.048;
const _HINGE_AXIS = new THREE.Vector3(0, 0, 1);
const _TILT_AXIS = new THREE.Vector3(1, 0, 0);

/** Group +Z nudge toward the fixed POV — keep modest so the phone stays on the stop. */
const SIDEKICK_POV_FORWARD = 2.4;
/** Closed phone target width as a fraction of the viewport. */
const REST_SCREEN_WIDTH = 0.22;

const SIDEKICK_DISPLAY_CENTER_Y = LOOK.y;
const STAGE_EULER = new THREE.Euler(Math.PI / 2, Math.PI, Math.PI, "YXZ");

const _BOX = new THREE.Box3();
const _VEC = new THREE.Vector3();
const _VEC2 = new THREE.Vector3();
const _VEC3 = new THREE.Vector3();
const _RIGHT = new THREE.Vector3();
const _UP = new THREE.Vector3();
const _OPEN_SLIDE_EULER = new THREE.Euler(0, 0, 0);
const _CLOSED_Q_FOLD = new THREE.Quaternion();
const _CLOSED_Q_TILT = new THREE.Quaternion();
const _BOX_CORNERS = [
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3()
];

function mapSidekickSwivelProgress(t) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);

  const frictionEnd = 0.14;
  if (clamped <= frictionEnd) {
    const u = clamped / frictionEnd;
    return 0.02 * (1 - Math.pow(1 - u, 2));
  }

  const snapEnd = 0.76;
  if (clamped <= snapEnd) {
    const u = (clamped - frictionEnd) / (snapEnd - frictionEnd);
    const start = 0.02;
    return start + (0.97 - start) * (1 - Math.pow(1 - u, 2.1));
  }

  const u = (clamped - snapEnd) / (1 - snapEnd);
  const start = 0.97;
  return start + (1 - start) * (1 - Math.pow(1 - u, 2));
}

function isSidekickDisplayClosed(progress) {
  return THREE.MathUtils.clamp(progress, 0, 1) < 1 - 1e-6;
}

export const sidekickVignetteMeta = {
  name: "Sidekick",
  tint: 0xc9a0ff,
  desc: "Tap the Sidekick — the screen swivels up and around into place."
};

export class SidekickVignette {
  /**
   * @param {THREE.Group} group
   * @param {{ vignetteIndex?: number, scrollCapture?: import("../stage/StageScrollCapture.js").StageScrollCapture, onAligned?: () => void, reducedMotion?: boolean, introGate?: () => boolean }} deps
   */
  constructor(group, deps) {
    this.group = group;
    this.deps = deps;
    this.vignetteIndex = deps.vignetteIndex ?? 2;
    this.scrollCapture = deps.scrollCapture ?? null;
    this.onAligned = deps.onAligned ?? null;
    this.introGate = deps.introGate ?? null;
    this.reducedMotion = deps.reducedMotion ?? false;

    this.sidekickRoot = null;
    this.phoneRoot = null;
    this.swivel = null;
    this.slideNode = null;
    this.screenMesh = null;
    this._screenFrame = null;
    this._displayCover = null;
    this._coverAuthoredX = 0;
    this._screenBasePosition = new THREE.Vector3();
    this.hitMeshes = [];

    this._openSwivelZ = 0;
    this._hingePivotLocal = new THREE.Vector3();
    this._closedSlidePosition = new THREE.Vector3();
    this._openSlidePosition = new THREE.Vector3();
    this._closedSlideQuat = new THREE.Quaternion();
    this._openSlideQuat = new THREE.Quaternion();
    this._swivelScratchQuat = new THREE.Quaternion();
    this._mechanicalBaseline = { position: new THREE.Vector3(), scale: 1 };
    this._restHeroPose = { position: new THREE.Vector3(), scale: 1 };
    this._restPoseReady = false;

    this.isOpen = false;
    this._swivelTween = null;
    this._aligned = false;
    this._pendingOpen = false;
    this._swivelProgress = null;
    this._holdForIntro = false;
    this._pendingScene = null;
    this.scrollballLed = null;

    this.group.userData.skipFloorSnap = true;
    this.blockoutRef = buildPcSceneBlockout(this.group, { hidden: true });
    this._loadModel();
  }

  async integrateAfterIntro({ yieldFrame = async () => {}, revealHidden = false } = {}) {
    if (!this._holdForIntro) return;
    let spins = 0;
    while (this._holdForIntro && !this._pendingScene && spins < 180) {
      await yieldFrame();
      spins += 1;
    }
    if (!this._pendingScene) return;
    this._holdForIntro = false;
    await this._commitModel({ yieldFrame, revealHidden });
  }

  async _loadModel() {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync(MODEL_URL);
      this._pendingScene = gltf.scene;
      this._pendingScene.name = "sidekick-root";

      if (this.introGate?.()) {
        this._holdForIntro = true;
        return;
      }

      await this._commitModel();
    } catch (error) {
      console.warn("[SidekickVignette] Failed to load Sidekick model.", error);
    }
  }

  async _commitModel({ yieldFrame = async () => {}, revealHidden = false } = {}) {
    if (!this._pendingScene) return;

    this.sidekickRoot = this._pendingScene;
    this._pendingScene = null;
    this._pruneSidekickScene(this.sidekickRoot);
    this.group.add(this.sidekickRoot);

    this.sidekickRoot.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    this.phoneRoot = this.sidekickRoot.getObjectByName(PHONE_ROOT_NAME);
    this.swivel = this.phoneRoot?.getObjectByName(SWIVEL_NODE_NAME) ?? null;
    this.slideNode = this.swivel?.getObjectByName(SLIDE_NODE_NAME) ?? this.swivel;
    this.screenMesh = this._findScreenMesh(this.sidekickRoot);

    if (!this.phoneRoot || !this.swivel || !this.slideNode || !this.screenMesh) {
      console.warn("[SidekickVignette] Missing phone rig or screen mesh.");
      return;
    }

    await yieldFrame();

    this._hideChassisRigMeshes();
    this.scrollballLed = SidekickScrollballLed.attach(this.phoneRoot, {
      reducedMotion: this.reducedMotion
    });

    this._openSwivelZ = this.swivel.rotation.z;
    this._screenFrame = this.slideNode.getObjectByName(SCREEN_FRAME_NAME);
    this._displayCover = this.slideNode.getObjectByName("transparentCover");
    if (this._displayCover) {
      this._coverAuthoredX = this._displayCover.rotation.x;
      this._displayCover.material.depthWrite = false;
      this._displayCover.material.transparent = true;
    }

    this._screenBasePosition.copy(this.screenMesh.position);
    this._configureScreenMaterial();
    this._captureBarPivot();

    if (!this.screenMesh.userData.sidekickOriginalGeometry) {
      this.screenMesh.userData.sidekickOriginalGeometry = this.screenMesh.geometry.clone();
    }

    await yieldFrame();

    this._alignPhone();
    this._collectHitMeshes();
    this._registerScrollCapture();
    this._aligned = true;

    if (revealHidden) {
      hideGroupForReveal(this.sidekickRoot);
    }

    this.onAligned?.();
    void this._applyScreenTexture();

    if (this._pendingOpen) {
      this._pendingOpen = false;
      this.playSlideOpen();
    }
  }

  _pruneSidekickScene(root) {
    root.children.forEach((child) => {
      if (child.name !== PHONE_ROOT_NAME) {
        child.visible = false;
      }
    });
  }

  _hideChassisRigMeshes() {
    this.phoneRoot?.traverse((obj) => {
      if (!obj.isMesh) return;
      if (/^rivet/i.test(obj.name) || obj.name === SWIVEL_PART_NAME) {
        obj.visible = false;
        obj.castShadow = false;
        obj.receiveShadow = false;
      }
    });
    if (this._screenFrame) {
      this._screenFrame.castShadow = false;
      this._screenFrame.receiveShadow = false;
    }
  }

  _applyOpenSwivelBase() {
    this.swivel.rotation.set(0, 0, this._openSwivelZ);
  }

  _resetSlideNode() {
    this.slideNode.rotation.set(0, 0, 0);
    this.slideNode.position.set(0, 0, 0);
    this.slideNode.quaternion.identity();
  }

  _resetDisplayNode() {
    if (!this.screenMesh) return;
    this.screenMesh.rotation.set(0, 0, 0);
    this.screenMesh.position.copy(this._screenBasePosition);
  }

  _configureScreenMaterial() {
    if (!this.screenMesh?.material) return;
    const materials = Array.isArray(this.screenMesh.material)
      ? this.screenMesh.material
      : [this.screenMesh.material];
    for (const material of materials) {
      configureSidekickScreenMaterial(material);
    }
    this.screenMesh.renderOrder = 4;
  }

  _applyClosedDisplayVisibility(isClosed, progress = 0) {
    this._hideChassisRigMeshes();

    if (this._screenFrame) {
      this._screenFrame.visible = !isClosed && progress > SCREEN_FRAME_REVEAL;
    }

    if (!this.screenMesh?.material) return;

    const materials = Array.isArray(this.screenMesh.material)
      ? this.screenMesh.material
      : [this.screenMesh.material];

    for (const material of materials) {
      if (isClosed) {
        material.polygonOffsetFactor = -6;
        material.polygonOffsetUnits = -6;
      } else {
        material.polygonOffsetFactor = -2;
        material.polygonOffsetUnits = -2;
      }
    }

    this.screenMesh.renderOrder = isClosed ? 8 : 4;
  }

  _captureBarPivot() {
    this._applyOpenSwivelBase();
    this._resetSlideNode();
    this._resetDisplayNode();
    this.slideNode.updateMatrixWorld(true);

    const screenFrame = this.slideNode.getObjectByName(SCREEN_FRAME_NAME);
    if (screenFrame) {
      this._hingePivotLocal.copy(screenFrame.position);
    } else {
      const rivet = this.phoneRoot?.getObjectByName(RIVET_NODE_NAME);
      if (rivet) {
        rivet.getWorldPosition(_VEC);
        this.slideNode.worldToLocal(_VEC);
        this._hingePivotLocal.copy(_VEC);
      }
    }

    this._captureSlideKeyframes();
  }

  _closedSlideQuaternion(out = new THREE.Quaternion()) {
    const qFold = _CLOSED_Q_FOLD.setFromAxisAngle(_HINGE_AXIS, SWIVEL_CLOSED_SLIDE_Z);
    const qTilt = _CLOSED_Q_TILT.setFromAxisAngle(_TILT_AXIS, CLOSED_HINGE_TILT_X);
    return out.copy(qFold).multiply(qTilt);
  }

  _orbitSlideAboutPivot(pivot, quaternion, outPosition) {
    const rotated = _VEC.copy(pivot).applyQuaternion(quaternion);
    outPosition.copy(pivot).sub(rotated);
    outPosition.y += Math.abs(pivot.y);
    return outPosition;
  }

  _captureSlideKeyframes() {
    this._applyOpenSwivelBase();
    this._resetSlideNode();
    this._openSlidePosition.set(0, 0, 0);
    this._openSlideQuat.setFromEuler(_OPEN_SLIDE_EULER);
    this._closedSlideQuat.copy(this._closedSlideQuaternion());
    this._orbitSlideAboutPivot(this._hingePivotLocal, this._closedSlideQuat, this._closedSlidePosition);
  }

  /** Viewport scale + center while the stage faces this vignette — no camera dolly. */
  fitRestHeroPose(camera) {
    if (!camera || !this.phoneRoot || !this._aligned) return false;

    this._resetToMechanicalBaseline();
    this._applyClosedSettledPose();

    const frame = this._measureViewportFrame(camera, REST_SCREEN_WIDTH);
    if (!frame) return false;

    this.sidekickRoot.position.copy(frame.position);
    this.sidekickRoot.scale.setScalar(frame.scale);
    this._applyPlacementNudges();
    this.sidekickRoot.updateMatrixWorld(true);
    this._restHeroPose.position.copy(this.sidekickRoot.position);
    this._restHeroPose.scale = this.sidekickRoot.scale.x;
    this._restPoseReady = true;
    return true;
  }

  /** Re-apply the cached rest pose without remeasuring the viewport. */
  applyRestHeroPose() {
    if (!this._restPoseReady || !this.sidekickRoot) return false;
    this.sidekickRoot.position.copy(this._restHeroPose.position);
    this.sidekickRoot.scale.setScalar(this._restHeroPose.scale);
    this._applyClosedSettledPose();
    this.sidekickRoot.updateMatrixWorld(true);
    return true;
  }

  invalidateRestPose() {
    this._restPoseReady = false;
  }

  _saveMechanicalBaseline() {
    this._mechanicalBaseline.position.copy(this.sidekickRoot.position);
    this._mechanicalBaseline.scale = this.sidekickRoot.scale.x;
  }

  _resetToMechanicalBaseline() {
    this.sidekickRoot.position.copy(this._mechanicalBaseline.position);
    this.sidekickRoot.scale.setScalar(this._mechanicalBaseline.scale);
    this._applyClosedSettledPose();
  }

  _fillBoxCorners(box) {
    const { min, max } = box;
    const [c0, c1, c2, c3, c4, c5, c6, c7] = _BOX_CORNERS;
    c0.set(min.x, min.y, min.z);
    c1.set(max.x, min.y, min.z);
    c2.set(min.x, max.y, min.z);
    c3.set(max.x, max.y, min.z);
    c4.set(min.x, min.y, max.z);
    c5.set(max.x, min.y, max.z);
    c6.set(min.x, max.y, max.z);
    c7.set(max.x, max.y, max.z);
    return _BOX_CORNERS;
  }

  _measureNdcWidth(camera) {
    this.phoneRoot.updateMatrixWorld(true);
    _BOX.setFromObject(this.phoneRoot);
    if (_BOX.isEmpty()) return 0;

    let minX = Infinity;
    let maxX = -Infinity;
    for (const corner of this._fillBoxCorners(_BOX)) {
      _VEC.copy(corner).project(camera);
      minX = Math.min(minX, _VEC.x);
      maxX = Math.max(maxX, _VEC.x);
    }
    return Math.max(0, maxX - minX);
  }

  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} screenWidthFraction
   * @returns {{ scale: number, position: THREE.Vector3 } | null}
   */
  _measureViewportFrame(camera, screenWidthFraction) {
    if (!this.phoneRoot) return null;

    const scale = this._measureViewportScale(camera, screenWidthFraction);
    if (scale == null) return null;

    const base = this._mechanicalBaseline.position;
    this.sidekickRoot.position.copy(base);
    this.sidekickRoot.scale.setScalar(scale);
    this._applyClosedSettledPose();
    this.sidekickRoot.updateMatrixWorld(true);

    _BOX.setFromObject(this.phoneRoot);
    const worldCenter = _BOX.getCenter(_VEC);
    _VEC3.copy(worldCenter).project(camera);

    _VEC2.subVectors(worldCenter, camera.position);
    const depth = _VEC2.length();
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * depth;
    const halfW = halfH * camera.aspect;

    _RIGHT.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    _UP.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

    const errX = 0 - _VEC3.x;
    const errY = 0 - _VEC3.y;

    const position = new THREE.Vector3(base.x, base.y, base.z);
    position.x += _RIGHT.x * errX * halfW + _UP.x * errY * halfH;
    position.y += _RIGHT.y * errX * halfW + _UP.y * errY * halfH;
    position.z += _RIGHT.z * errX * halfW + _UP.z * errY * halfH;

    return { scale, position };
  }

  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} screenWidthFraction
   * @returns {number | null}
   */
  _measureViewportScale(camera, screenWidthFraction) {
    if (!this.phoneRoot) return null;

    this.sidekickRoot.position.copy(this._mechanicalBaseline.position);
    this.sidekickRoot.scale.setScalar(this._mechanicalBaseline.scale);
    this._applyClosedSettledPose();
    this.sidekickRoot.updateMatrixWorld(true);

    const ndcWidth = this._measureNdcWidth(camera);
    const targetNdcWidth = screenWidthFraction * 2;
    let scale = this._mechanicalBaseline.scale;
    if (ndcWidth > 1e-4) {
      scale = this._mechanicalBaseline.scale * (targetNdcWidth / ndcWidth);
    }
    return THREE.MathUtils.clamp(scale, 0.05, 8);
  }

  _applyPovForward() {
    this.sidekickRoot.position.z += SIDEKICK_POV_FORWARD_BASE;
    this.sidekickRoot.updateMatrixWorld(true);
  }

  _applyStageOrientation() {
    this.sidekickRoot.rotation.order = "YXZ";
    this.sidekickRoot.rotation.set(
      STAGE_EULER.x,
      STAGE_EULER.y + this.blockoutRef.rotation.y,
      STAGE_EULER.z
    );
  }

  _snapPhoneDisplayHeight() {
    this.sidekickRoot.updateMatrixWorld(true);
    const box = measureSceneBounds(this.sidekickRoot, this.group);
    if (box.isEmpty()) return;
    const center = box.getCenter(_VEC);
    this.sidekickRoot.position.y += SIDEKICK_DISPLAY_CENTER_Y - center.y;
    this.sidekickRoot.updateMatrixWorld(true);
  }

  _alignPhoneXZToMonitor() {
    const monitor = findBlockoutPart(this.blockoutRef, "blockout-ref-monitor");
    if (!monitor) return;

    monitor.updateMatrixWorld(true);
    this.sidekickRoot.updateMatrixWorld(true);

    _BOX.setFromObject(monitor);
    const monitorCenter = _BOX.getCenter(_VEC);
    this.group.worldToLocal(monitorCenter);

    const phoneBox = measureSceneBounds(this.sidekickRoot, this.group);
    if (phoneBox.isEmpty()) return;
    const phoneCenter = phoneBox.getCenter(_VEC2);

    this.sidekickRoot.position.x += monitorCenter.x - phoneCenter.x;
    this.sidekickRoot.position.z += monitorCenter.z - phoneCenter.z;
    this.sidekickRoot.updateMatrixWorld(true);
  }

  _alignPhone() {
    this.sidekickRoot.position.set(0, 0, 0);
    this.sidekickRoot.scale.setScalar(1);
    this.sidekickRoot.rotation.set(0, 0, 0);
    this._applyClosedSettledPose();
    this._applyStageOrientation();
    this.sidekickRoot.updateMatrixWorld(true);
    this._snapPhoneDisplayHeight();
    this._alignPhoneXZToMonitor();
    // Keep the phone on the vignette stop — no large lateral hero offsets.
    this.sidekickRoot.position.x = 0;
    this._applyPovForward();
    this._saveMechanicalBaseline();
    this._restPoseReady = false;
  }

  _collectHitMeshes() {
    this.hitMeshes = [];
    this.phoneRoot?.traverse((obj) => {
      if (obj.isMesh && obj.visible) {
        this.hitMeshes.push(obj);
      }
    });
  }

  _registerScrollCapture() {
    if (!this.scrollCapture || !this.hitMeshes.length) return;

    this.scrollCapture.registerMesh(SCROLL_CAPTURE_MESH_IDS.sidekick, {
      vignetteIndex: this.vignetteIndex,
      meshes: this.hitMeshes,
      onPointerDown: () => this.handlePointerDown(),
      onPointerMove: () => this.handlePointerMove()
    });
  }

  _applySwivelProgress(progress) {
    const t = THREE.MathUtils.clamp(progress, 0, 1);

    this._applyOpenSwivelBase();

    if (t <= 1e-6) {
      this.slideNode.quaternion.copy(this._closedSlideQuat);
      this.slideNode.position.copy(this._closedSlidePosition);
    } else if (t >= 1 - 1e-6) {
      this._resetSlideNode();
    } else {
      this._swivelScratchQuat.slerpQuaternions(this._closedSlideQuat, this._openSlideQuat, t);
      this.slideNode.quaternion.copy(this._swivelScratchQuat);
      this.slideNode.position.lerpVectors(this._closedSlidePosition, this._openSlidePosition, t);
    }

    this._applyDisplayState(t);
  }

  _applyDisplayState(progress = 0) {
    const isClosed = isSidekickDisplayClosed(progress);

    if (this.screenMesh) {
      this.screenMesh.visible = true;
      this._resetDisplayNode();

      if (isClosed) {
        this.screenMesh.position.z += CLOSED_LCD_FORWARD_Z;
      }

      const materials = Array.isArray(this.screenMesh.material)
        ? this.screenMesh.material
        : [this.screenMesh.material];
      for (const material of materials) {
        if (material) configureSidekickScreenMaterial(material);
      }

      ensureSidekickScreenMapLocked(this.screenMesh);
    }

    if (this.swivel) {
      this.swivel.visible = true;
    }

    if (this._displayCover) {
      this._displayCover.rotation.x = this._coverAuthoredX;
      this._displayCover.position.set(0, 0, 0);
      this._displayCover.visible = !isClosed;
    }

    this._applyClosedDisplayVisibility(isClosed, progress);
  }

  _applyOpenSettledPose() {
    this._applySwivelProgress(1);
    this.isOpen = true;
  }

  _applyClosedSettledPose() {
    this._applySwivelProgress(0);
    this.isOpen = false;
  }

  async _applyScreenTexture() {
    if (!this.screenMesh) return;
    await applySidekickScreenTexture(this.screenMesh);
  }

  _runSwivelTween(from, to) {
    const blend = { t: from };
    this._swivelTween?.kill();
    this._swivelTween = gsap.to(blend, {
      t: to,
      duration: SWIVEL_DURATION * Math.max(Math.abs(to - from), 0.12),
      ease: "sidekick.inOut",
      onUpdate: () => {
        const progress = mapSidekickSwivelProgress(blend.t);
        this._applySwivelProgress(progress);
        this._swivelProgress = progress;
      },
      onComplete: () => {
        this._swivelTween = null;
        this._swivelProgress = to >= 1 - 1e-6 ? 1 : null;
        this.isOpen = to >= 1 - 1e-6;
        if (this.isOpen) {
          this._applyOpenSettledPose();
        } else {
          this._applyClosedSettledPose();
        }
      }
    });
  }

  playSlideOpen() {
    if (!this._aligned) {
      this._pendingOpen = true;
      return;
    }
    if (this.isOpen || this._swivelTween) return;

    this._pendingOpen = false;
    this._swivelProgress = 0;

    if (this.reducedMotion) {
      this._applyOpenSettledPose();
      return;
    }

    this._runSwivelTween(0, 1);
  }

  playSlideClose() {
    if (!this._aligned) return;

    this._pendingOpen = false;

    const startProgress =
      this._swivelProgress != null
        ? THREE.MathUtils.clamp(this._swivelProgress, 0, 1)
        : this.isOpen
          ? 1
          : 0;

    if (startProgress <= 0.001 && !this.isOpen) {
      this._applyClosedSettledPose();
      return;
    }

    if (this.reducedMotion) {
      this._applyClosedSettledPose();
      return;
    }

    this._runSwivelTween(startProgress, 0);
  }

  handlePointerDown() {
    if (this.isOpen || this._swivelTween) return false;
    this.playSlideOpen();
    return true;
  }

  handlePointerMove() {
    return true;
  }

  setActive() {}

  setInactive() {
    this._pendingOpen = false;
    if (this._swivelTween || this.isOpen) {
      this.playSlideClose();
    }
  }

  updateFocus() {}

  update(time) {
    if (!this._aligned || !this.sidekickRoot) return;
    ensureSidekickScreenMapLocked(this.screenMesh);
    this.scrollballLed?.update(time);
  }

  _findScreenMesh(root) {
    let byNode = null;
    let byMaterial = null;

    root.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.name === SCREEN_NODE_NAME) byNode = obj;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (materials.some((mat) => mat?.name === SCREEN_MATERIAL_NAME)) {
        byMaterial = obj;
      }
    });

    return byNode ?? byMaterial;
  }
}
