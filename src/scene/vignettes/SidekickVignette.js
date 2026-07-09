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
import { applySidekickScreenTexture, ensureSidekickScreenMapLocked } from "./sidekickScreenTexture.js";

const MODEL_URL = "/assets/models/sidekick/Sidekick3.glb";
const SCREEN_NODE_NAME = "Screen";
const SCREEN_FRAME_NAME = "ScreenFrame";
const SCREEN_MATERIAL_NAME = "SCREENIMAGE";
const PHONE_ROOT_NAME = "TMobleSideKick3";
const SWIVEL_NODE_NAME = "swivelOpenRotateY";
const SLIDE_NODE_NAME = "offsetRotateX";

/** Swivel open/close — 30% faster than the prior 0.88s slide. */
const SWIVEL_DURATION = 0.88 * 0.7;
/** Closed — 180° Z arc on the bar hinge (screen folded over keyboard). Negative = flip from left rivet. */
const SWIVEL_CLOSED_SLIDE_Z = -Math.PI;
/** Bar rivet pivot — ScreenFrame origin in offsetRotateX space. */
const _HINGE_AXIS = new THREE.Vector3(0, 0, 1);
/** Subtle hero bob when settled (world Y / +Z toward camera). */
const FLOAT_AMP_Y = 0.02;
const FLOAT_AMP_Z = 0.013;
const FLOAT_SPEED = 0.92;
/**
 * Nudge in group +Z toward the fixed camera at POV (~10× nearer than the old 3.5 m offset).
 * Stay below ~7.5 — larger values push the phone past the camera (behind the viewer).
 */
const SIDEKICK_POV_FORWARD = 7.25;
/** True-scale phone center — matches the spotlight / look-at height on the stage. */
const SIDEKICK_DISPLAY_CENTER_Y = LOOK.y;
/** Resting hero width — closed phone at the vignette stop (fraction of viewport). */
const REST_SCREEN_WIDTH = 0.17;
/** Click-to-focus hero framing — fraction of viewport width (open phone). */
const FOCUS_SCREEN_WIDTH = 0.38;
/** NDC vertical target (0 = optical center). */
const FOCUS_SCREEN_Y = 0;

/** Cancel Maya Z-up export; +π X upright; +π Y face POV; +π Z wall-hung. */
const STAGE_EULER = new THREE.Euler(Math.PI / 2, Math.PI, Math.PI, "YXZ");

const _BOX = new THREE.Box3();
const _VEC = new THREE.Vector3();
const _VEC2 = new THREE.Vector3();
const _VEC3 = new THREE.Vector3();
const _RIGHT = new THREE.Vector3();
const _UP = new THREE.Vector3();
const _ANCHOR_LERP = new THREE.Vector3();

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

/**
 * Bistable swivel easing — static friction at detents, gravity snap through mid-travel.
 * @param {number} t Linear time progress 0→1
 * @returns {number} Swivel progress 0 (closed) → 1 (open)
 */
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

function cloneAnchor(position, scale) {
  return { position: position.clone(), scale };
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
    this.hitMeshes = [];

    /** GLB authored bar Z (swivelOpenRotateY) — held while the screen arcs on offsetRotateX. */
    this._openSwivelZ = 0;
    /** Hinge on the bar under the screen — fixed while the screen swings over the keyboard. */
    this._hingePivotLocal = new THREE.Vector3();
    /** Mechanical pose after blockout alignment — used until viewport anchors bake. */
    this._alignBaseline = cloneAnchor(new THREE.Vector3(), 1);
    /** Baked once while the vignette faces the POV — closed / resting hero. */
    this._restAnchor = cloneAnchor(new THREE.Vector3(), 1);
    /** Baked once while the vignette faces the POV — open / zoom hero. */
    this._focusAnchor = cloneAnchor(new THREE.Vector3(), 1);
    this._anchorsReady = false;
    this._focusBlend = 0;
    this.isOpen = false;
    this._swivelTween = null;
    this._aligned = false;
    this._pendingOpen = false;
    this._swivelProgress = null;
    this._holdForIntro = false;
    this._pendingScene = null;

    this.group.userData.skipFloorSnap = true;
    this.blockoutRef = buildPcSceneBlockout(this.group, { hidden: true });
    this._loadModel();
  }

  async integrateAfterIntro() {
    if (!this._holdForIntro) return;
    this._holdForIntro = false;
    await this._commitModel();
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

  async _commitModel() {
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

    this._openSwivelZ = this.swivel.rotation.z;
    const screenFrame = this.slideNode.getObjectByName(SCREEN_FRAME_NAME);
    if (screenFrame) {
      this._hingePivotLocal.copy(screenFrame.position);
    }

    if (!this.screenMesh.userData.sidekickOriginalGeometry) {
      this.screenMesh.userData.sidekickOriginalGeometry = this.screenMesh.geometry.clone();
    }

    await this._applyScreenTexture();
    this._alignClosedPhone();
    this._collectHitMeshes();
    this._registerScrollCapture();
    this._aligned = true;
    this.onAligned?.();
    this._applyAnchors(0);

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

  /** Open rest — bar mount stays at GLB export; screen hinge is on offsetRotateX. */
  _applyOpenSwivelBase() {
    this.swivel.rotation.set(0, 0, this._openSwivelZ);
  }

  _resetSlideNode() {
    this.slideNode.rotation.set(0, 0, 0);
    this.slideNode.position.set(0, 0, 0);
  }

  invalidateAnchors() {
    this._anchorsReady = false;
  }

  /**
   * One-shot viewport anchors — call while the stage world rotation faces this vignette.
   * @param {THREE.PerspectiveCamera} camera
   * @returns {boolean}
   */
  bakeAnchors(camera) {
    if (!camera || !this.phoneRoot || !this._aligned) return false;

    this._applyClosedPose();
    this._resetRootToBaseline();

    const rest = this._measureViewportFrame(camera, REST_SCREEN_WIDTH, false);
    if (!rest) return false;

    this._restAnchor.position.copy(rest.position);
    this._restAnchor.scale = rest.scale;

    const focusScale = this._measureViewportScale(camera, FOCUS_SCREEN_WIDTH, true);
    this._focusAnchor.position.copy(this._restAnchor.position);
    this._focusAnchor.scale = focusScale ?? this._restAnchor.scale;

    this._applyClosedPose();
    this._resetRootToBaseline();

    this._anchorsReady = true;
    this._applyAnchors(this._focusBlend);
    return true;
  }

  /** Dev helper — anchor state for console inspection. */
  debugAnchors() {
    return {
      aligned: this._aligned,
      anchorsReady: this._anchorsReady,
      focusBlend: this._focusBlend,
      isOpen: this.isOpen,
      swivelProgress: this._swivelProgress,
      slideRotation: this.slideNode
        ? [this.slideNode.rotation.x, this.slideNode.rotation.y, this.slideNode.rotation.z]
        : null,
      swivelZ: this.swivel?.rotation.z ?? null,
      alignBaseline: {
        x: this._alignBaseline.position.x,
        y: this._alignBaseline.position.y,
        z: this._alignBaseline.position.z,
        scale: this._alignBaseline.scale
      },
      rest: {
        x: this._restAnchor.position.x,
        y: this._restAnchor.position.y,
        z: this._restAnchor.position.z,
        scale: this._restAnchor.scale
      },
      focus: {
        x: this._focusAnchor.position.x,
        y: this._focusAnchor.position.y,
        z: this._focusAnchor.position.z,
        scale: this._focusAnchor.scale
      },
      live: this.sidekickRoot
        ? {
            x: this.sidekickRoot.position.x,
            y: this.sidekickRoot.position.y,
            z: this.sidekickRoot.position.z,
            scale: this.sidekickRoot.scale.x
          }
        : null
    };
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

  _applyStageOrientation() {
    this.sidekickRoot.rotation.order = "YXZ";
    this.sidekickRoot.rotation.set(
      STAGE_EULER.x,
      STAGE_EULER.y + this.blockoutRef.rotation.y,
      STAGE_EULER.z
    );
  }

  _applyTrueScale() {
    this.sidekickRoot.scale.setScalar(1);
    this._applyStageOrientation();
    this.sidekickRoot.updateMatrixWorld(true);
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

  /** @param {THREE.PerspectiveCamera} _camera
   *  @param {number} focusBlend
   *  @param {{ isActive?: boolean, transitioning?: boolean }} [opts] */
  updateFocus(_camera, focusBlend, opts = {}) {
    const isActive = opts.isActive !== false;
    const transitioning = Boolean(opts.transitioning);

    if (!isActive) {
      this._focusBlend = 0;
      return;
    }

    if (transitioning || this._swivelTween) {
      return;
    }

    if (this.isOpen) {
      this._focusBlend = 1;
      return;
    }

    this._focusBlend = THREE.MathUtils.clamp(focusBlend, 0, 1);
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

  _resetRootToBaseline() {
    this.sidekickRoot.position.copy(this._alignBaseline.position);
    this.sidekickRoot.scale.setScalar(this._alignBaseline.scale);
  }

  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} screenWidthFraction
   * @param {boolean} measureOpen
   * @returns {{ scale: number, position: THREE.Vector3 } | null}
   */
  _measureViewportFrame(camera, screenWidthFraction, measureOpen) {
    if (!this.phoneRoot) return null;

    const scale = this._measureViewportScale(camera, screenWidthFraction, measureOpen);
    if (scale == null) return null;

    const base = this._alignBaseline.position;
    this.sidekickRoot.position.copy(base);
    this.sidekickRoot.scale.setScalar(scale);

    if (measureOpen) {
      this._applyOpenPoseForMeasurement();
    } else {
      this._applyClosedPose();
    }
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
    const errY = FOCUS_SCREEN_Y - _VEC3.y;

    const position = new THREE.Vector3(base.x, base.y, base.z);
    position.x += _RIGHT.x * errX * halfW + _UP.x * errY * halfH;
    position.y += _RIGHT.y * errX * halfW + _UP.y * errY * halfH;
    position.z += _RIGHT.z * errX * halfW + _UP.z * errY * halfH;

    return { scale, position };
  }

  /**
   * Viewport width scale only — used for the open / focus anchor (position stays at rest).
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} screenWidthFraction
   * @param {boolean} measureOpen
   * @returns {number | null}
   */
  _measureViewportScale(camera, screenWidthFraction, measureOpen) {
    if (!this.phoneRoot) return null;

    this.sidekickRoot.position.copy(this._alignBaseline.position);
    this.sidekickRoot.scale.setScalar(this._alignBaseline.scale);

    if (measureOpen) {
      this._applyOpenPoseForMeasurement();
    } else {
      this._applyClosedPose();
    }
    this.sidekickRoot.updateMatrixWorld(true);

    const ndcWidth = this._measureNdcWidth(camera);
    const targetNdcWidth = screenWidthFraction * 2;
    let scale = this._alignBaseline.scale;
    if (ndcWidth > 1e-4) {
      scale = this._alignBaseline.scale * (targetNdcWidth / ndcWidth);
    }
    return THREE.MathUtils.clamp(scale, 0.05, 8);
  }

  _applyOpenPoseForMeasurement() {
    this._applySwivelProgress(1);
  }

  _restoreSwivelPoseAfterMeasurement() {
    if (this._swivelTween && this._swivelProgress != null) {
      this._applySwivelProgress(this._swivelProgress);
    } else if (this.isOpen) {
      this._applySwivelProgress(1);
    } else {
      this._applyClosedPose();
    }
  }

  /** Pin the phone body to baked anchors — swivel + float when idle. */
  _applyAnchors(focusT = 0, time = 0) {
    if (!this.sidekickRoot) return;

    const t = THREE.MathUtils.clamp(focusT, 0, 1);

    if (!this._anchorsReady) {
      this.sidekickRoot.position.copy(this._alignBaseline.position);
      this.sidekickRoot.scale.setScalar(this._alignBaseline.scale);
      return;
    }

    _ANCHOR_LERP.lerpVectors(this._restAnchor.position, this._focusAnchor.position, t);
    this.sidekickRoot.position.copy(_ANCHOR_LERP);
    this.sidekickRoot.scale.setScalar(
      THREE.MathUtils.lerp(this._restAnchor.scale, this._focusAnchor.scale, t)
    );

    if (time > 0 && !this._swivelTween && !this.reducedMotion) {
      const strength = THREE.MathUtils.lerp(0.45, 1, t);
      this.sidekickRoot.position.y +=
        (Math.sin(time * FLOAT_SPEED) * 0.65 + Math.sin(time * FLOAT_SPEED * 0.43 + 1.15) * 0.35) *
        FLOAT_AMP_Y *
        strength;
      this.sidekickRoot.position.z +=
        Math.sin(time * FLOAT_SPEED * 0.68 + 0.55) * FLOAT_AMP_Z * strength;
    }
  }

  /**
   * Real Sidekick arc — 180° Z on the bar rivet; screen travels over the keyboard.
   * @param {number} progress 0 = closed (over keyboard), 1 = open (authored rest)
   */
  _applySwivelProgress(progress) {
    const t = THREE.MathUtils.clamp(progress, 0, 1);
    const angle = (1 - t) * SWIVEL_CLOSED_SLIDE_Z;

    this._applyOpenSwivelBase();

    if (Math.abs(angle) <= 1e-6) {
      this._resetSlideNode();
      return;
    }

    this.slideNode.rotation.set(0, 0, angle);
    const pivot = this._hingePivotLocal;
    const rotated = _VEC.copy(pivot).applyAxisAngle(_HINGE_AXIS, angle);
    this.slideNode.position.copy(pivot).sub(rotated);
    // Closed-only Y — cancels double pivot travel; open rest unchanged.
    this.slideNode.position.y += (1 - t) * Math.abs(pivot.y);
  }

  _applyOpenPose() {
    this._applySwivelProgress(1);
    this.isOpen = true;
  }

  async _applyScreenTexture() {
    if (!this.screenMesh) return;
    await applySidekickScreenTexture(this.screenMesh);
  }

  _applyClosedPose() {
    this._applySwivelProgress(0);
    this.isOpen = false;
  }

  _alignClosedPhone() {
    this.sidekickRoot.position.set(0, 0, 0);
    this.sidekickRoot.scale.setScalar(1);
    this.sidekickRoot.rotation.set(0, 0, 0);
    this._applyClosedPose();

    this._applyTrueScale();
    this._snapPhoneDisplayHeight();
    this._alignPhoneXZToMonitor();
    this._applyPovForward();

    this._alignBaseline.position.copy(this.sidekickRoot.position);
    this._alignBaseline.scale = 1;
  }

  _applyPovForward() {
    this.sidekickRoot.position.z += SIDEKICK_POV_FORWARD;
    this.sidekickRoot.updateMatrixWorld(true);
  }

  playSlideOpen() {
    if (!this._aligned) {
      this._pendingOpen = true;
      return;
    }
    if (this.isOpen && this._swivelTween) return;
    if (this.isOpen) return;

    this._pendingOpen = false;
    this._swivelProgress = 0;

    if (this.reducedMotion) {
      this._applyOpenPose();
      this._focusBlend = 1;
      this._applyAnchors(1);
      return;
    }

    const blend = { t: 0 };
    this._swivelTween?.kill();
    this._swivelTween = gsap.to(blend, {
      t: 1,
      duration: SWIVEL_DURATION,
      ease: "none",
      onUpdate: () => {
        const progress = mapSidekickSwivelProgress(blend.t);
        this._applySwivelProgress(progress);
        this._swivelProgress = progress;
        this._focusBlend = progress;
        this._applyAnchors(progress);
      },
      onComplete: () => {
        this._applyOpenPose();
        this._swivelTween = null;
        this._swivelProgress = 1;
        this._focusBlend = 1;
        this._applyAnchors(1);
      }
    });
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
      this._snapClosed();
      return;
    }

    this._swivelProgress = startProgress;

    if (this.reducedMotion) {
      this._snapClosed();
      return;
    }

    const blend = { t: startProgress };
    this._swivelTween?.kill();
    this._swivelTween = gsap.to(blend, {
      t: 0,
      duration: SWIVEL_DURATION * Math.max(startProgress, 0.12),
      ease: "none",
      onUpdate: () => {
        const progress = mapSidekickSwivelProgress(blend.t);
        this._applySwivelProgress(progress);
        this._swivelProgress = progress;
        this._focusBlend = progress;
        this._applyAnchors(progress);
      },
      onComplete: () => {
        this._applyClosedPose();
        this._swivelTween = null;
        this._swivelProgress = null;
        this._focusBlend = 0;
        this._applyAnchors(0);
      }
    });
  }

  _snapClosed() {
    this._swivelTween?.kill();
    this._swivelTween = null;
    this._swivelProgress = null;
    this._applyClosedPose();
    this._focusBlend = 0;
    this._applyAnchors(0);
  }

  handlePointerDown() {
    if (this._focusBlend > 0.02) {
      return false;
    }
    this.playSlideOpen();
    return true;
  }

  handlePointerMove() {
    return true;
  }

  setActive() {
    this._applyAnchors(this._focusBlend);
  }

  setInactive() {
    this._pendingOpen = false;
    this._focusBlend = 0;
    if (this._swivelTween || this.isOpen) {
      this.playSlideClose();
    }
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

  update(time) {
    if (!this._aligned || !this.sidekickRoot) return;

    ensureSidekickScreenMapLocked(this.screenMesh);
    this._applyAnchors(this._focusBlend, time);
  }
}
