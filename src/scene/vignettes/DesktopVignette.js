import * as THREE from "three";
import { createGltfLoader } from "../loaders/createGltfLoader.js";
import {
  alignModelToBlockout,
  buildPcSceneBlockout
} from "./pcSceneBlockout.js";
import { createCrtScreenMaterial, setCrtScreenGlow, CRT_SCREEN_GLOW_MAX } from "./CrtScreenMaterial.js";
import {
  applyScreenMapSettings,
  createCrtContentQuadFromSpec,
  flattenCrtPhosphorToRimPlane,
  measureCrtScreenGeometry,
  SCREEN_MAP_CRT,
  SCREEN_MAP_CRT_QUAD,
  SCREEN_MAP_PLANE
} from "./screenTextureMap.js";
import { CRT_CONTENT_PLANE } from "./crtBezelOpening.js";
import {
  PARALLAX_DAMP_ZONE_IDS,
  SCROLL_CAPTURE_MESH_IDS
} from "../stage/scrollCaptureTargets.js";
import { PARALLAX_DAMP_INSIDE_SCALE } from "../camera/parallaxDampZones.js";

import {
  preparePcModelMaterials,
  preparePcModelMaterialsChunked,
  preloadPcTextures,
  warmPcTexturesOnGpu,
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
import { hideGroupForReveal, holdRootOffCamera } from "../stage/stageModelReveal.js";
import { spanFrame } from "../stage/frameBudget.js";

const MODEL_URL = "/assets/models/pc-source/pc-from-source.glb";

export const desktopVignetteMeta = {
  name: "Retro Desktop",
  tint: 0x7ad0ff,
  neonColors: ["#00e5ff", "#9dff1a"],
  desc: "MySpace profile on the CRT — click the monitor to zoom in and boot."
};

export class DesktopVignette {
  /**
   * @param {THREE.Group} group
   * @param {{ mySpace: import("../../ui/MySpaceScreen.js").MySpaceScreen, scrollCapture?: import("../stage/StageScrollCapture.js").StageScrollCapture, parallaxDampZones?: ReturnType<import("../camera/parallaxDampZones.js").createParallaxDampZones>, vignetteIndex?: number, onAligned?: () => void, renderer?: THREE.WebGLRenderer, liveEnv?: import("../stage/LiveStageEnvironment.js").LiveStageEnvironment, introGate?: () => boolean, getCamera?: () => THREE.PerspectiveCamera | null }} deps
   */
  constructor(group, deps) {
    this.group = group;
    this.deps = deps;
    this.mySpace = deps.mySpace;
    this.scrollCapture = deps.scrollCapture ?? null;
    this.parallaxDampZones = deps.parallaxDampZones ?? null;
    this.vignetteIndex = deps.vignetteIndex ?? 1;
    this.onAligned = deps.onAligned ?? null;
    this.introGate = deps.introGate ?? null;
    this.getCamera = deps.getCamera ?? null;
    this.renderer = deps.renderer ?? null;
    this.loadingManager = deps.loadingManager ?? null;
    this.reducedMotion = deps.reducedMotion ?? false;
    this._modelLoadStarted = false;
    this.interactives = [];
    /** Flattened phosphor / glass host (`pc-Mesh_2`) — no live content. */
    this.phosphorMesh = null;
    /** Bezel-sized flat content quad — live CanvasTexture emissiveMap. */
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

    /** Invisible blockout — same footprint/height as the Monolith placeholder. */
    this.blockoutRef = buildPcSceneBlockout(this.group, { hidden: true });
    if (!deps.deferModelLoad) {
      this.startModelLoad();
    }
  }

  /** Begin GLB fetch — deferred during pageload so parse doesn't hitch the open beat. */
  startModelLoad() {
    if (this._modelLoadStarted) return;
    this._modelLoadStarted = true;
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
    // Keep most of the content-matched spill when zoomed — only ease off ~35%.
    this.screenLightRig?.setIntensityScale(THREE.MathUtils.lerp(1, 0.65, eased));
    if (focus <= 0.02) {
      this.mySpace.setHover(null);
    }
    this._syncPowerLedState();
    this._syncScreenGlow();
  }

  playPowerOn() {
    return this.mySpace.playPowerOn()?.then?.((result) => {
      this._ensurePowerLed();
      this._syncPowerLedState();
      this._syncScreenGlow();
      return result;
    });
  }

  async integrateAfterIntro({
    yieldFrame = async () => {},
    revealHidden = false,
    batchSize = 1,
    yieldFrames = 2
  } = {}) {
    // Ensure the fetch was kicked even if the intro tick skipped the fetch gate.
    this.startModelLoad();

    // Wait for an in-flight GLB whether or not `_holdForIntro` was set yet —
    // integrate can race ahead of the load callback and previously bailed out
    // forever, leaving the desktop stop empty.
    let spins = 0;
    while (!this.pcRoot && !this._pendingScene && this._modelLoadStarted && spins < 180) {
      await yieldFrame();
      spins += 1;
    }
    if (!this._pendingScene || this.pcRoot) return;

    this._holdForIntro = false;
    await this._commitModel({ yieldFrame, revealHidden, batchSize, yieldFrames });
  }

  /** Decode PC textures during the intro descent — keeps the settle hitch smaller. */
  async warmIntroAssets(renderer, yieldFrame) {
    if (this._introAssetsWarmed) return;
    this._introAssetsWarmed = true;
    await warmPcTexturesOnGpu(renderer, yieldFrame);
  }

  async _loadModel() {
    const loader = createGltfLoader(this.loadingManager ?? undefined);
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

  async _commitModel({
    yieldFrame = async () => {},
    revealHidden = false,
    batchSize = 1,
    yieldFrames = 2
  } = {}) {
    if (!this._pendingScene) return;

    this.pcRoot = this._pendingScene;
    this._pendingScene = null;
    this._pcSceneReady = false;

    // Parent BEFORE align — alignModelToBlockout measures in parent space; if the
    // GLB is still detached it uses the model itself as space and the PC lands
    // meters away from the desktop stop (invisible at the camera).
    this.group.add(this.pcRoot);
    // Off-camera until programs are compiled — do not compile inside live frames.
    holdRootOffCamera(this.pcRoot);
    alignModelToBlockout(this.pcRoot, this.blockoutRef);

    if (this.renderer) {
      // Yield while held — meshes are on GPU_HOLD_LAYER, so a present does not
      // compile new programs. Do not drop this back to a live 1-mesh warmer.
      await preparePcModelMaterialsChunked(this.pcRoot, this.renderer, yieldFrame, batchSize);
    }
    await yieldFrame();

    await spanFrame("pc-mount", async () => {
      const sourceMesh = this._findScreenMesh(this.pcRoot);
      if (sourceMesh) {
        this.screenMesh = this._mountScreenOnMesh(sourceMesh);
        this.interactives.push(this.screenMesh);
      }
      holdRootOffCamera(this.pcRoot);
    });

    this._ensurePowerLed();
    this._ensurePowerButton();
    if (revealHidden) {
      hideGroupForReveal(this.pcRoot);
    }

    this._pcSceneReady = true;
    this._notifyScreenReady();
    this.onAligned?.();
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
        this._syncScreenGlow();
      });
      this._powerLedHandlerRegistered = true;
    }

    this._syncPowerLedState();
    this._syncScreenGlow();
  }

  _syncPowerLedState() {
    if (!this.powerLed) return;

    const zoomedIn =
      this._focusBlend > 0.02 || this.mySpace.isMonitorBooting;

    // Monitor + speaker solids follow CRT power; HDD orange blink only while on.
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

  /**
   * CRT content quad + room spill — off while black, ramps with boot/power,
   * color always sampled from the live screen texture.
   */
  _syncScreenGlow() {
    const powered =
      this.mySpace.isPoweredOn ||
      this.mySpace.monitorLedOn ||
      this.mySpace.isMonitorBooting;

    const bootProgress = THREE.MathUtils.clamp(this.mySpace.powerOnProgress ?? 0, 0, 1);
    const power = powered ? Math.max(bootProgress, this.mySpace.monitorLedOn ? 1 : 0) : 0;

    const mats = this.screenMesh?.material
      ? Array.isArray(this.screenMesh.material)
        ? this.screenMesh.material
        : [this.screenMesh.material]
      : [];
    for (const mat of mats) {
      setCrtScreenGlow(mat, power * CRT_SCREEN_GLOW_MAX);
    }

    this.screenLightRig?.setPower(power);
  }

  /** Dark cavity behind the content quad — no live CanvasTexture on `pc-Mesh_2`. */
  _retirePhosphorContent(sourceMesh) {
    const idx = this._findScreenMaterialIndex(sourceMesh);
    if (idx === null) return;

    const dark = new THREE.MeshStandardMaterial({
      color: 0x050505,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0,
      side: THREE.FrontSide,
      toneMapped: true
    });
    dark.name = SCREEN_MATERIAL_NAME;

    if (Array.isArray(sourceMesh.material)) {
      sourceMesh.material[idx] = dark;
    } else {
      sourceMesh.material = dark;
    }
  }

  _mountScreenOnMesh(sourceMesh) {
    sourceMesh.visible = true;
    sourceMesh.renderOrder = 1;
    this.phosphorMesh = sourceMesh;

    // Clone curved glass BEFORE flattening — shell keeps authored bulge.
    this._mountGlassShell(sourceMesh);
    flattenCrtPhosphorToRimPlane(sourceMesh);
    this._retirePhosphorContent(sourceMesh);

    // Blender-authored opening: phosphor AABB + 1.5 cm pad, content inset 1 cm
    // with slight rounded corners (`scripts/crt-bezel-blender-measure2.py`).
    const { material: screenMat, map } = this._createScreenMaterial(SCREEN_MAP_CRT_QUAD);
    const contentQuad = createCrtContentQuadFromSpec(sourceMesh, screenMat, CRT_CONTENT_PLANE);
    if (!contentQuad) {
      console.warn(
        "[DesktopVignette] Failed to place Blender content plane — falling back to phosphor."
      );
      return this._mountScreenOnPhosphorFallback(sourceMesh);
    }
    sourceMesh.add(contentQuad);

    this.screenMesh = contentQuad;
    this.screenHitMesh = this._createScreenHitMesh(contentQuad);
    this.mySpace.setScreenMap(map);
    this.mySpace.setScreenUvBounds(null);
    this.mySpace.setWarpSourceMesh(null);
    this.mySpace.setCaptureSize(CRT_CONTENT_PLANE.canvasWidth, CRT_CONTENT_PLANE.canvasHeight);

    this._crtMetrics = {
      mode: "blender-bezel-content-quad",
      spec: CRT_CONTENT_PLANE,
      name: contentQuad.name,
      aspect: CRT_CONTENT_PLANE.aspect,
      canvasWidth: CRT_CONTENT_PLANE.canvasWidth,
      canvasHeight: CRT_CONTENT_PLANE.canvasHeight,
      width: CRT_CONTENT_PLANE.width,
      height: CRT_CONTENT_PLANE.height,
      usable: true,
      phosphor: measureCrtScreenGeometry(sourceMesh)
    };

    if (import.meta.env.DEV) {
      console.info("[DesktopVignette] CRT Blender content plane", {
        content: `${CRT_CONTENT_PLANE.width.toFixed(4)}×${CRT_CONTENT_PLANE.height.toFixed(4)} m`,
        aspect: Number(CRT_CONTENT_PLANE.aspect.toFixed(4)),
        canvas: `${CRT_CONTENT_PLANE.canvasWidth}×${CRT_CONTENT_PLANE.canvasHeight}`,
        cornerR: CRT_CONTENT_PLANE.cornerRadius,
        insetM: 0.01
      });
    }

    this._registerScrollCapture();
    this._ensurePowerLed();
    this._attachScreenLightRig(contentQuad);
    this._finishScreenMount();
    return contentQuad;
  }

  /** Legacy Path 1 — content on flattened phosphor if bezel measure fails. */
  _mountScreenOnPhosphorFallback(sourceMesh) {
    const { material: screenMat, map } = this._createScreenMaterial(SCREEN_MAP_CRT);
    const idx = this._findScreenMaterialIndex(sourceMesh);
    if (idx === null) return sourceMesh;

    if (Array.isArray(sourceMesh.material)) {
      sourceMesh.material[idx] = screenMat;
    } else {
      sourceMesh.material = screenMat;
    }

    this.screenMesh = sourceMesh;
    this.screenHitMesh = this._createScreenHitMesh(sourceMesh);
    this.mySpace.setScreenMap(map);
    this.mySpace.setScreenUvBounds(null);
    this.mySpace.setWarpSourceMesh(sourceMesh);

    const metrics = measureCrtScreenGeometry(sourceMesh);
    this._crtMetrics = { ...metrics, mode: "phosphor-fallback" };
    if (metrics.usable) {
      this.mySpace.setCaptureSize(metrics.canvasWidth, metrics.canvasHeight);
    }

    this._registerScrollCapture();
    this._ensurePowerLed();
    this._attachScreenLightRig(sourceMesh);
    this._finishScreenMount();
    return sourceMesh;
  }

  _finishScreenMount() {
    if (this.mySpace.isPoweredOn) {
      this.mySpace.draw();
    } else if (this.mySpace.isMonitorBooting || this.mySpace.monitorLedOn) {
      this.mySpace.texture.needsUpdate = true;
    } else {
      this.mySpace.drawOff();
    }
    this._syncScreenGlow();
    this._notifyScreenReady();
    if (this._focusBlend > 0.85 && this.mySpace.xpBoot?.canStartBoot) {
      void this.mySpace.playPowerOn();
    }
  }

  debugCrtScreen() {
    return this._crtMetrics ?? null;
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
    const captureMesh = this.phosphorMesh ?? this.screenMesh;
    if (!captureMesh || !this.glassMesh?.material) return;

    setCrtGlassSpotlight(this.glassMesh.material, spotLight, spotTarget);

    if (!liveEnv || !scene) return;

    const rotY = this.pcRoot?.rotation.y ?? this.group.rotation.y;
    const capturePos = new THREE.Vector3();
    captureMesh.getWorldPosition(capturePos);

    const rotDelta =
      this._lastEnvRotY === null ? Infinity : Math.abs(rotY - this._lastEnvRotY);
    const posDelta =
      this._lastEnvPos === null ? Infinity : capturePos.distanceTo(this._lastEnvPos);

    if (!force && rotDelta < 0.0003 && posDelta < 0.001) return;

    liveEnv.syncMonitorReflections(captureMesh);
    // CRT glass only — never write into scene.environment (that recolors the whole stage).
    const envTex =
      liveEnv.update(scene, capturePos, { applyToScene: false }) ?? liveEnv.getTexture();
    setCrtGlassEnvMap(this.glassMesh.material, envTex);

    this._lastEnvRotY = rotY;
    if (!this._lastEnvPos) this._lastEnvPos = new THREE.Vector3();
    this._lastEnvPos.copy(capturePos);
  }

  _createScreenHitMesh(screenMesh) {
    // Must stay 1:1 with the visible CRT — any scale skews raycast UVs vs. the
    // painted MySpace texture (hover/click feel shifted down-and-in).
    const hitMesh = new THREE.Mesh(
      screenMesh.geometry,
      new THREE.MeshBasicMaterial({
        visible: false,
        side: THREE.DoubleSide
      })
    );
    hitMesh.name = "pc-screen-scroll-capture";
    hitMesh.scale.setScalar(1);
    hitMesh.renderOrder = screenMesh.renderOrder + 1;
    screenMesh.add(hitMesh);
    return hitMesh;
  }

  /** CRT UI (click / scroll / hover) only while zoomed in — zoom-out is stage-only. */
  _contentInteractive() {
    return this._focusBlend > 0.02;
  }

  _registerScrollCapture() {
    if (!this.screenMesh || !this.scrollCapture) return;

    // Prefer the visible screen mesh so UV hit-tests match the painted texture.
    // Hit mesh is a DoubleSide fallback for grazing angles only.
    const meshes = [this.screenMesh, this.screenHitMesh].filter(Boolean);

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

    this._registerParallaxDampZone(meshes);
  }

  /** Soften cursor parallax 80% while hovering the CRT face. */
  _registerParallaxDampZone(meshes) {
    if (!this.parallaxDampZones || !meshes?.length) return;

    this.parallaxDampZones.register(PARALLAX_DAMP_ZONE_IDS.pcMonitor, {
      vignetteIndex: this.vignetteIndex,
      meshes,
      scale: PARALLAX_DAMP_INSIDE_SCALE
    });
  }

  _createScreenMaterial(map = SCREEN_MAP_CRT_QUAD) {
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

    // Zoomed out: don't consume — stage click zooms in.
    if (!this._contentInteractive()) return false;

    const pressedPowerButton =
      this.powerButton?.isHit(hit.point) === true;

    if (pressedPowerButton) {
      this.powerButton?.playPress();
    }

    if (!hit.uv && !pressedPowerButton) return false;

    if (this.mySpace.xpBoot?.isBooting) {
      return this.mySpace.handlePointer(hit.uv);
    }

    if (this.mySpace.isPoweredOn) {
      return this.mySpace.handlePointer(hit.uv);
    }

    if (pressedPowerButton && this.mySpace.xpBoot?.canStartBoot) {
      void this.playPowerOn();
      return true;
    }

    return false;
  }

  handlePointerMove(hit) {
    if (!this._contentInteractive()) {
      this.mySpace.setHover(null);
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
    if (!this._contentInteractive() || !this.mySpace.isPoweredOn) return false;
    return this.mySpace.handleWheel(deltaY);
  }

  update(time) {
    if (!this.pcRoot) return;

    const focus = THREE.MathUtils.clamp(this._focusBlend, 0, 1);
    const wobble = Math.sin(time * 0.15) * 0.01 * (1 - focus);
    this.pcRoot.rotation.y = this.blockoutRef.rotation.y + wobble;
    this._syncScreenGlow();
  }
}
