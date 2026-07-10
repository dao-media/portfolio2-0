import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  alignModelToBlockout,
  buildPcSceneBlockout
} from "./pcSceneBlockout.js";
import { createCrtScreenMaterial } from "./CrtScreenMaterial.js";
import { applyScreenMapSettings, computeScreenUvBounds, deriveCrtScreenMap, SCREEN_MAP_CRT, SCREEN_MAP_PLANE } from "./screenTextureMap.js";
import { SCROLL_CAPTURE_MESH_IDS } from "../stage/scrollCaptureTargets.js";

import {
  preparePcModelMaterials,
  preparePcModelMaterialsChunked,
  preloadPcTextures,
  SCREEN_MATERIAL_NAME
} from "./pcProductionMaterials.js";
import { PcPowerLed } from "./PcPowerLed.js";
import { PcPowerButton } from "./PcPowerButton.js";
import { attachScreenLightRig } from "../stage/attachScreenLightRig.js";
import {
  attachCrtGlassShell,
  setCrtGlassEnvMap,
  setCrtGlassFocusScale,
  setCrtGlassSpotlight
} from "./CrtGlassMaterial.js";
import { hideGroupForReveal } from "../stage/stageModelReveal.js";
import { DESKTOP_REST_ANCHOR_CAM_PUSH } from "../stage/constants.js";

const _REST_ANCHOR_CAM = new THREE.Vector3();
const _REST_ANCHOR_ROOT = new THREE.Vector3();
const _REST_ANCHOR_TARGET = new THREE.Vector3();

const MODEL_URL = "/assets/models/pc-source/pc-from-source.glb";

export const desktopVignetteMeta = {
  name: "Retro Desktop",
  tint: 0x7ad0ff,
  desc: "MySpace profile on the CRT — click the monitor to zoom in and boot."
};

export class DesktopVignette {
  /**
   * @param {THREE.Group} group
   * @param {{ mySpace: import("../../ui/MySpaceScreen.js").MySpaceScreen, scrollCapture?: import("../stage/StageScrollCapture.js").StageScrollCapture, vignetteIndex?: number, onAligned?: () => void, renderer?: THREE.WebGLRenderer, liveEnv?: import("../stage/LiveStageEnvironment.js").LiveStageEnvironment, introGate?: () => boolean, getCamera?: () => THREE.PerspectiveCamera | null }} deps
   */
  constructor(group, deps) {
    this.group = group;
    this.deps = deps;
    this.mySpace = deps.mySpace;
    this.scrollCapture = deps.scrollCapture ?? null;
    this.vignetteIndex = deps.vignetteIndex ?? 1;
    this.onAligned = deps.onAligned ?? null;
    this.introGate = deps.introGate ?? null;
    this.getCamera = deps.getCamera ?? null;
    this.renderer = deps.renderer ?? null;
    this.reducedMotion = deps.reducedMotion ?? false;
    this.interactives = [];
    this.screenMesh = null;
    this.screenHitMesh = null;
    this.pcRoot = null;
    this._focusBlend = 0;
    this.powerLed = null;
    this.powerButton = null;
    this.screenLightRig = null;
    this.glassMesh = null;
    this.liveEnv = deps.liveEnv ?? null;
    this._lastEnvRotY = null;
    this._lastEnvPos = null;
    this._pendingCrtEnvRefresh = false;
    this._powerLedHandlerRegistered = false;
    this._holdForIntro = false;
    this._pendingScene = null;
    this._screenReadyWaiters = [];
    this._introAssetsWarmed = false;
    this._pcSceneReady = false;
    /** Pre-push model position — floor-snapped baseline. */
    this._alignedRestPosition = null;
    /** Baked group-local PC pose at the desktop resting stop. */
    this._restAnchorPosition = null;

    /** Invisible blockout — same footprint/height as Monolith & Orbit placeholders. */
    this.blockoutRef = buildPcSceneBlockout(this.group, { hidden: true });
    this._loadModel();
  }

  get screenReady() {
    return Boolean(this.pcRoot && this.screenMesh);
  }

  /** @param {() => void} callback */
  whenScreenReady(callback) {
    if (this.screenReady) {
      callback();
      return;
    }
    this._screenReadyWaiters.push(callback);
  }

  _notifyScreenReady() {
    if (!this.screenReady) return;
    const waiters = this._screenReadyWaiters.splice(0);
    waiters.forEach((fn) => fn());
  }

  /** @param {THREE.PerspectiveCamera} _camera
   *  @param {number} focusBlend
   *  @param {{ isActive?: boolean, transitioning?: boolean }} [_opts] */
  updateFocus(_camera, focusBlend, _opts = {}) {
    this._focusBlend = focusBlend;
    const focus = THREE.MathUtils.clamp(focusBlend, 0, 1);
    const eased = focus * focus;

    setCrtGlassFocusScale(this.glassMesh?.material, focus);
    this.screenLightRig?.setIntensityScale(THREE.MathUtils.lerp(1, 0.42, eased));
    this._syncPowerLedState();
  }

  playPowerOn() {
    return this.mySpace.playPowerOn()?.then?.((result) => {
      this._ensurePowerLed();
      this._syncPowerLedState();
      return result;
    });
  }

  async integrateAfterIntro({ yieldFrame = async () => {}, revealHidden = false } = {}) {
    if (!this._holdForIntro) return;
    // GLB may still be in flight — wait until pending scene exists (or load failed).
    let spins = 0;
    while (this._holdForIntro && !this._pendingScene && spins < 180) {
      await yieldFrame();
      spins += 1;
    }
    if (!this._pendingScene) return;
    this._holdForIntro = false;
    await this._commitModel({ yieldFrame, revealHidden });
  }

  /** Decode PC textures during the intro descent — keeps the settle hitch smaller. */
  async warmIntroAssets(renderer) {
    if (!this._holdForIntro || !this._pendingScene || this._introAssetsWarmed) return;
    this._introAssetsWarmed = true;
    if (renderer) {
      await preloadPcTextures();
    }
  }

  async _loadModel() {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync(MODEL_URL);
      this._pendingScene = gltf.scene;
      this._pendingScene.rotation.y = Math.PI * 0.12;

      if (this.introGate?.()) {
        this._holdForIntro = true;
        return;
      }

      await this._commitModel();
    } catch (error) {
      console.warn("[DesktopVignette] Failed to load PC model, using fallback desk.", error);
      this._buildFallbackDesk();
    }
  }

  async _commitModel({ yieldFrame = async () => {}, revealHidden = false } = {}) {
    if (!this._pendingScene) return;

    this.pcRoot = this._pendingScene;
    this._pendingScene = null;
    this._pcSceneReady = false;

    this.group.add(this.pcRoot);
    alignModelToBlockout(this.pcRoot, this.blockoutRef);
    this._captureAlignedRestPosition();
    await yieldFrame();

    if (this.renderer) {
      await preparePcModelMaterialsChunked(this.pcRoot, this.renderer, yieldFrame, 2);
    }
    await yieldFrame();

    const sourceMesh = this._findScreenMesh(this.pcRoot);
    if (sourceMesh) {
      this.screenMesh = this._mountScreenOnMesh(sourceMesh);
      this.interactives.push(this.screenMesh);
    }
    await yieldFrame();

    this._ensurePowerLed();
    this._ensurePowerButton();
    if (revealHidden) {
      hideGroupForReveal(this.pcRoot);
    }
    this._pcSceneReady = true;
    this.onAligned?.();
  }

  _captureAlignedRestPosition() {
    const root = this._getSceneRoot();
    this._alignedRestPosition = root ? root.position.clone() : null;
  }

  /** Visible scene root — GLB model or fallback blockout. */
  _getSceneRoot() {
    return this.pcRoot ?? this.blockoutRef ?? null;
  }

  /**
   * One-shot bake while the turntable faces the desktop stop — stores group-local rest pose.
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Object3D} world
   * @param {number} anchorY
   * @returns {boolean}
   */
  ensureRestAnchorBaked(camera, world, anchorY) {
    if (this._restAnchorPosition || !camera || !world) return false;

    const root = this._getSceneRoot();
    if (!root || !this._alignedRestPosition) return false;

    const savedY = world.rotation.y;
    world.rotation.y = anchorY;
    world.updateMatrixWorld(true);

    root.position.copy(this._alignedRestPosition);
    this.group.updateMatrixWorld(true);
    root.getWorldPosition(_REST_ANCHOR_ROOT);
    _REST_ANCHOR_CAM.copy(_REST_ANCHOR_ROOT).sub(camera.position);
    _REST_ANCHOR_CAM.y = 0;

    if (_REST_ANCHOR_CAM.lengthSq() <= 1e-8) {
      this._restAnchorPosition = this._alignedRestPosition.clone();
    } else {
      _REST_ANCHOR_TARGET.copy(_REST_ANCHOR_ROOT).addScaledVector(
        _REST_ANCHOR_CAM,
        DESKTOP_REST_ANCHOR_CAM_PUSH
      );
      this.group.worldToLocal(_REST_ANCHOR_TARGET);
      this._restAnchorPosition = _REST_ANCHOR_TARGET.clone();
    }

    world.rotation.y = savedY;
    world.updateMatrixWorld(true);
    return true;
  }

  /**
   * Blend the PC between aligned and baked rest anchors — keep in sync with camera travel.
   * @param {number} blend 0 = aligned, 1 = resting hero
   */
  applyRestAnchorBlend(blend) {
    const root = this._getSceneRoot();
    if (!root || !this._alignedRestPosition) return;

    const t = THREE.MathUtils.clamp(blend, 0, 1);
    if (t <= 1e-6) {
      root.position.copy(this._alignedRestPosition);
      return;
    }
    if (!this._restAnchorPosition) return;

    root.position.lerpVectors(this._alignedRestPosition, this._restAnchorPosition, t);
  }

  _ensurePowerButton() {
    if (!this.pcRoot) return;
    if (!this.powerButton) {
      this.powerButton = PcPowerButton.attach(this.pcRoot);
      if (this.powerButton && this.screenMesh) {
        this._registerScrollCapture();
      }
    }
  }

  _ensurePowerLed() {
    if (!this.pcRoot || !this._pcSceneReady) return;

    if (!this.powerLed || !this.powerLed.isLiveOnRoot(this.pcRoot)) {
      this.powerLed = PcPowerLed.attach(this.pcRoot, { reducedMotion: this.reducedMotion });
      if (!this.powerLed) {
        console.warn(
          "[DesktopVignette] Power LED not found — expected pc_1/pc_2 emissive materials on the PC model."
        );
      }
    }

    if (!this._powerLedHandlerRegistered) {
      this.mySpace.setMonitorPowerLedHandler(() => {
        this._ensurePowerLed();
        this._syncPowerLedState();
      });
      this._powerLedHandlerRegistered = true;
    }

    this._syncPowerLedState();
  }

  _syncPowerLedState() {
    if (!this.powerLed) return;

    const zoomedIn =
      this._focusBlend > 0.02 || this.mySpace.isMonitorBooting;

    if (!zoomedIn) {
      this.powerLed.setIdle();
      return;
    }

    if (this.mySpace.monitorLedOn) {
      this.powerLed.setMonitorOn();
    } else {
      this.powerLed.setIdle();
    }
  }

  _mountScreenOnMesh(sourceMesh) {
    const screenMap = deriveCrtScreenMap(sourceMesh);
    const { material: screenMat, map } = this._createScreenMaterial(screenMap);
    const idx = this._findScreenMaterialIndex(sourceMesh);
    if (idx === null) return sourceMesh;

    if (Array.isArray(sourceMesh.material)) {
      sourceMesh.material[idx] = screenMat;
    } else {
      sourceMesh.material = screenMat;
    }

    sourceMesh.visible = true;
    sourceMesh.renderOrder = 10;
    this.screenMesh = sourceMesh;
    this.screenHitMesh = this._createScreenHitMesh(sourceMesh);
    const bounds = computeScreenUvBounds(sourceMesh);
    this.mySpace.setScreenMap(screenMap);
    this.mySpace.setScreenUvBounds(bounds);
    this.mySpace.setWarpSourceMesh(sourceMesh);
    if (this.mySpace.isPoweredOn) {
      this.mySpace.draw();
    } else if (this.mySpace.isMonitorBooting || this.mySpace.monitorLedOn) {
      // Boot in progress — keep the live CRT texture; don't reset to black.
      this.mySpace.texture.needsUpdate = true;
    } else {
      this.mySpace.drawOff();
    }
    this._registerScrollCapture();
    this._ensurePowerLed();
    this._attachScreenLightRig(sourceMesh);
    this._mountGlassShell(sourceMesh);
    this._notifyScreenReady();
    if (this._focusBlend > 0.85 && this.mySpace.xpBoot?.canStartBoot) {
      void this.mySpace.playPowerOn();
    }
    return sourceMesh;
  }

  _attachScreenLightRig(screenMesh) {
    if (!this.renderer || !screenMesh) return;

    this.screenLightRig?.dispose();
    this.screenLightRig = attachScreenLightRig(
      this.renderer,
      screenMesh,
      this.mySpace.getTexture(),
      "pc"
    );
  }

  _mountGlassShell(screenMesh) {
    if (!screenMesh) return;

    if (this.glassMesh) {
      this.glassMesh.geometry?.dispose();
      this.glassMesh.material?.dispose();
      this.glassMesh.removeFromParent();
    }
    this.glassMesh = null;

    const envMap = this.liveEnv?.getTexture?.() ?? null;
    this.glassMesh = attachCrtGlassShell(screenMesh, envMap);
    setCrtGlassFocusScale(this.glassMesh.material, this._focusBlend);
    this._lastEnvRotY = null;
    this._lastEnvPos = null;
    this._pendingCrtEnvRefresh = Boolean(this.liveEnv);
  }

  /**
   * Capture monitor softbox env and gate glare with the POV spotlight cone.
   * @param {import("../stage/LiveStageEnvironment.js").LiveStageEnvironment} liveEnv
   * @param {THREE.Scene} scene
   * @param {THREE.SpotLight} spotLight
   * @param {THREE.Object3D} spotTarget
   */
  updateCrtGlassReflection(liveEnv, scene, spotLight, spotTarget, { force = false } = {}) {
    if (!this.screenMesh || !this.glassMesh?.material) return;

    setCrtGlassSpotlight(this.glassMesh.material, spotLight, spotTarget);

    if (!liveEnv || !scene) return;

    const rotY = this.pcRoot?.rotation.y ?? this.group.rotation.y;
    const capturePos = new THREE.Vector3();
    this.screenMesh.getWorldPosition(capturePos);

    const rotDelta =
      this._lastEnvRotY === null ? Infinity : Math.abs(rotY - this._lastEnvRotY);
    const posDelta =
      this._lastEnvPos === null ? Infinity : capturePos.distanceTo(this._lastEnvPos);

    if (!force && rotDelta < 0.0003 && posDelta < 0.001) return;

    liveEnv.syncMonitorReflections(this.screenMesh);
    // CRT glass only — never write into scene.environment (that recolors the whole stage).
    const envTex =
      liveEnv.update(scene, capturePos, { applyToScene: false }) ?? liveEnv.getTexture();
    setCrtGlassEnvMap(this.glassMesh.material, envTex);

    this._lastEnvRotY = rotY;
    if (!this._lastEnvPos) this._lastEnvPos = new THREE.Vector3();
    this._lastEnvPos.copy(capturePos);
  }

  _createScreenHitMesh(screenMesh) {
    const hitMesh = new THREE.Mesh(
      screenMesh.geometry,
      new THREE.MeshBasicMaterial({
        visible: false,
        side: THREE.DoubleSide
      })
    );
    hitMesh.name = "pc-screen-scroll-capture";
    hitMesh.scale.setScalar(1.04);
    hitMesh.renderOrder = screenMesh.renderOrder + 1;
    screenMesh.add(hitMesh);
    return hitMesh;
  }

  /** Monitor content is live only after zoom-in or once boot/power-on has started. */
  _contentInteractive() {
    return (
      this._focusBlend > 0.02 ||
      this.mySpace.isPoweredOn ||
      Boolean(this.mySpace.xpBoot?.isBooting)
    );
  }

  _registerScrollCapture() {
    if (!this.screenMesh || !this.scrollCapture) return;

    const meshes = [this.screenHitMesh, this.screenMesh].filter(Boolean);

    this.scrollCapture.registerMesh(SCROLL_CAPTURE_MESH_IDS.finalPcScreen, {
      vignetteIndex: this.vignetteIndex,
      meshes,
      onWheel: (deltaY, hit) => {
        if (!this._contentInteractive()) return;
        if (this.mySpace.isPoweredOn) {
          this.handleWheel(deltaY);
          return;
        }
        if (hit?.uv) {
          this.mySpace.setHover(hit.uv);
        }
      },
      onPointerDown: (hit) => this.handlePointerDown(hit),
      onPointerMove: (hit) => this.handlePointerMove(hit),
      onPointerLeave: () => this.handlePointerLeave()
    });
  }

  _createScreenMaterial(map = SCREEN_MAP_CRT) {
    const texture = this.mySpace.getTexture();
    applyScreenMapSettings(texture, map);

    return {
      material: createCrtScreenMaterial(texture),
      map
    };
  }

  _buildFallbackDesk() {
    if (this.pcRoot) {
      this.pcRoot.removeFromParent();
      this.pcRoot = null;
    }
    this.blockoutRef?.removeFromParent();
    const { material: screenMat, map } = this._createScreenMaterial(SCREEN_MAP_PLANE);
    this.mySpace.setScreenMap(SCREEN_MAP_PLANE);
    this.mySpace.setScreenUvBounds(null);
    this.mySpace.setWarpSourceMesh(null);
    this.blockoutRef = buildPcSceneBlockout(this.group, { screenMaterial: screenMat });
    this._captureAlignedRestPosition();
    this.onAligned?.();
    this.group.traverse((obj) => {
      if (obj.name === "blockout-screen") {
        this.screenMesh = obj;
        this.screenHitMesh = this._createScreenHitMesh(obj);
        this.interactives.push(obj);
        this._registerScrollCapture();
        this._attachScreenLightRig(obj);
        this._mountGlassShell(obj);
      }
    });
  }

  _findScreenMaterialIndex(mesh) {
    if (!mesh.isMesh || !mesh.material) return null;
    if (Array.isArray(mesh.material)) {
      for (let i = 0; i < mesh.material.length; i += 1) {
        if (mesh.material[i].name === SCREEN_MATERIAL_NAME) return i;
      }
      return null;
    }
    return mesh.material.name === SCREEN_MATERIAL_NAME ? 0 : null;
  }

  _findScreenMesh(root) {
    let found = null;
    root.traverse((obj) => {
      if (obj.isMesh && this._findScreenMaterialIndex(obj) !== null) found = obj;
    });
    return found;
  }

  setActive() {
    if (this.mySpace.isPoweredOn) {
      this.mySpace.backToDashboard();
    }
  }

  setInactive() {
    this.mySpace.setHover(null);
  }

  handlePointerDown(hit) {
    if (!hit) return false;

    const pressedPowerButton =
      this.powerButton?.isHit(hit.point) === true;

    if (pressedPowerButton) {
      this.powerButton?.playPress();
    }

    if (!hit.uv && !pressedPowerButton) return false;

    if (this.mySpace.xpBoot?.isBooting) {
      return this.mySpace.handlePointer(hit.uv);
    }

    if (this._focusBlend > 0.02) {
      if (this.mySpace.isPoweredOn) {
        return this.mySpace.handlePointer(hit.uv);
      }
      if (pressedPowerButton && this.mySpace.xpBoot?.canStartBoot) {
        void this.playPowerOn();
        return true;
      }
      return false;
    }

    return true;
  }

  handlePointerMove(hit) {
    if (!this._contentInteractive()) {
      this.mySpace.setHover(null);
      if (this.powerButton?.isHit(hit?.point)) return true;
      return false;
    }

    this.mySpace.setHover(hit?.uv ?? null);
    if (this.mySpace.isPoweredOn) {
      return Boolean(this.mySpace.hoverId);
    }
    if (this.mySpace.xpBoot?.isBooting) {
      return Boolean(hit?.uv);
    }
    if (this.powerButton?.isHit(hit?.point)) {
      return true;
    }
    return Boolean(hit?.uv);
  }

  handlePointerLeave() {
    if (this._contentInteractive()) {
      this.mySpace.setHover(null);
    }
  }

  handleWheel(deltaY) {
    if (!this.mySpace.isPoweredOn) return false;
    return this.mySpace.handleWheel(deltaY);
  }

  update(time) {
    if (!this.pcRoot) return;

    const focus = THREE.MathUtils.clamp(this._focusBlend, 0, 1);
    const wobble = Math.sin(time * 0.15) * 0.01 * (1 - focus);
    this.pcRoot.rotation.y = this.blockoutRef.rotation.y + wobble;
  }
}
