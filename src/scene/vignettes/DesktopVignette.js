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
  preloadPcTextures,
  SCREEN_MATERIAL_NAME
} from "./pcProductionMaterials.js";
import { PcPowerLed } from "./PcPowerLed.js";
import { attachScreenLightRig } from "../stage/attachScreenLightRig.js";
import { attachCrtGlassShell, setCrtGlassEnvMap, setCrtGlassSpotlight } from "./CrtGlassMaterial.js";

const MODEL_URL = "/assets/models/pc-source/pc-from-source.glb";

export const desktopVignetteMeta = {
  name: "Retro Desktop",
  tint: 0x7ad0ff,
  desc: "MySpace profile on the CRT — click the monitor to zoom in and boot."
};

export class DesktopVignette {
  /**
   * @param {THREE.Group} group
   * @param {{ mySpace: import("../../ui/MySpaceScreen.js").MySpaceScreen, scrollCapture?: import("../stage/StageScrollCapture.js").StageScrollCapture, vignetteIndex?: number, onAligned?: () => void, renderer?: THREE.WebGLRenderer, liveEnv?: import("../stage/LiveStageEnvironment.js").LiveStageEnvironment, introGate?: () => boolean }} deps
   */
  constructor(group, deps) {
    this.group = group;
    this.deps = deps;
    this.mySpace = deps.mySpace;
    this.scrollCapture = deps.scrollCapture ?? null;
    this.vignetteIndex = deps.vignetteIndex ?? 1;
    this.onAligned = deps.onAligned ?? null;
    this.introGate = deps.introGate ?? null;
    this.renderer = deps.renderer ?? null;
    this.interactives = [];
    this.screenMesh = null;
    this.screenHitMesh = null;
    this.pcRoot = null;
    this._focusBlend = 0;
    this.powerLed = null;
    this.screenLightRig = null;
    this.glassMesh = null;
    this.liveEnv = deps.liveEnv ?? null;
    this._lastEnvRotY = null;
    this._lastEnvPos = null;
    this._pendingCrtEnvRefresh = false;
    this._powerLedHandlerRegistered = false;
    this._holdForIntro = false;
    this._pendingScene = null;

    /** Invisible blockout — same footprint/height as Monolith & Orbit placeholders. */
    this.blockoutRef = buildPcSceneBlockout(this.group, { hidden: true });
    this._loadModel();
  }

  /** @param {THREE.PerspectiveCamera} _camera
   *  @param {number} focusBlend
   *  @param {{ isActive?: boolean, transitioning?: boolean }} [_opts] */
  updateFocus(_camera, focusBlend, _opts = {}) {
    this._focusBlend = focusBlend;
  }

  playPowerOn() {
    return this.mySpace.playPowerOn();
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

  async _commitModel() {
    if (!this._pendingScene) return;

    this.pcRoot = this._pendingScene;
    this._pendingScene = null;

    if (this.renderer) {
      await preloadPcTextures();
      await preparePcModelMaterials(this.pcRoot, this.renderer);
    }

    this.group.add(this.pcRoot);
    alignModelToBlockout(this.pcRoot, this.blockoutRef);

    const sourceMesh = this._findScreenMesh(this.pcRoot);
    if (sourceMesh) {
      this.screenMesh = this._mountScreenOnMesh(sourceMesh);
      this.interactives.push(this.screenMesh);
    }

    this._ensurePowerLed();
    this.onAligned?.();
  }

  _ensurePowerLed() {
    if (!this.pcRoot) return;

    if (!this.powerLed) {
      this.powerLed = PcPowerLed.attach(this.pcRoot);
      if (!this.powerLed) {
        console.warn(
          "[DesktopVignette] Power LED not found — expected pc_1/pc_2 emissive materials on the PC model."
        );
        return;
      }

      if (!this._powerLedHandlerRegistered) {
        this.mySpace.setMonitorPowerLedHandler((state) => {
          if (state === "on") this.powerLed?.setMonitorOn();
          else this.powerLed?.setOff();
        });
        this._powerLedHandlerRegistered = true;
      }

      this._syncPowerLedState();
    }
  }

  _syncPowerLedState() {
    if (!this.powerLed) return;
    if (this.mySpace.monitorLedOn) {
      this.powerLed.setMonitorOn();
    } else {
      this.powerLed.setOff();
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

  _registerScrollCapture() {
    if (!this.screenMesh || !this.scrollCapture) return;

    const meshes = [this.screenHitMesh, this.screenMesh].filter(Boolean);

    this.scrollCapture.registerMesh(SCROLL_CAPTURE_MESH_IDS.finalPcScreen, {
      vignetteIndex: this.vignetteIndex,
      meshes,
      onWheel: (deltaY, hit) => {
        if (this.mySpace.isPoweredOn) {
          this.handleWheel(deltaY);
          return;
        }
        if (hit?.uv) {
          this.mySpace.setHover(hit.uv);
        }
      },
      onPointerDown: (hit) => this.handlePointerDown(hit ? { uv: hit.uv } : null),
      onPointerMove: (hit) => this.handlePointerMove(hit ? { uv: hit.uv } : null),
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

  handlePointerDown(intersection) {
    if (!intersection?.uv) return false;

    if (this.mySpace.xpBoot?.isBooting) {
      return this.mySpace.handlePointer(intersection.uv);
    }

    if (this._focusBlend > 0.02) {
      if (this.mySpace.isPoweredOn) {
        return this.mySpace.handlePointer(intersection.uv);
      }
      return false;
    }

    return true;
  }

  handlePointerMove(intersection) {
    this.mySpace.setHover(intersection?.uv ?? null);
    if (this.mySpace.isPoweredOn) {
      return Boolean(this.mySpace.hoverId);
    }
    if (this.mySpace.xpBoot?.isBooting) {
      return Boolean(intersection?.uv);
    }
    return Boolean(intersection?.uv);
  }

  handlePointerLeave() {
    this.mySpace.setHover(null);
  }

  handleWheel(deltaY) {
    if (!this.mySpace.isPoweredOn) return false;
    return this.mySpace.handleWheel(deltaY);
  }

  update(time) {
    this._ensurePowerLed();
    this.powerLed?.update(time);

    if (this.pcRoot && this._focusBlend < 0.98) {
      this.pcRoot.rotation.y = this.blockoutRef.rotation.y + Math.sin(time * 0.15) * 0.01;
    } else if (this.pcRoot) {
      this.pcRoot.rotation.y = this.blockoutRef.rotation.y;
    }
  }
}
