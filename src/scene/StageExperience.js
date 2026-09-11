import * as THREE from "three";
import gsap from "gsap";
import { HUDController } from "../ui/HUDController.js";
import { DesktopVignette, desktopVignetteMeta } from "./vignettes/DesktopVignette.js";
import { monolithVignette, addDegreeLabels } from "./stage/placeholderVignettes.js";
import { SidekickVignette, sidekickVignetteMeta } from "./vignettes/SidekickVignette.js";
import { TravelVignette, travelVignetteMeta } from "./vignettes/TravelVignette.js";
import { PostPass } from "./stage/PostPass.js";
import { createStageLoadGate } from "./stage/StageLoadGate.js";
import { StageBootSequence } from "../ui/xpBoot/StageBootSequence.js";
import { bakeFogAtlas } from "./neon/bakeFogAtlas.js";
import { createFogMaterial } from "./neon/createFogMaterial.js";
import { NeonSystem } from "./neon/NeonSystem.js";
import { VolumetricFogPass } from "./neon/VolumetricFogPass.js";
import {
  FOG_DEFAULTS,
  createFogParams,
  FOG_HEAVY_FADE_IN_MS
} from "../fog/fogConfig.js";
import { configureSpotShadow } from "./stage/configureSpotShadow.js";
import { LiveStageEnvironment } from "./stage/LiveStageEnvironment.js";
import { buildStageStudioRoom } from "./stage/StageStudioRoom.js";
import { buildStageFloor } from "./stage/StageFloor.js";
import { StageScrollCapture } from "./stage/StageScrollCapture.js";
import { SCROLL_CAPTURE_MESH_IDS } from "./stage/scrollCaptureTargets.js";
import {
  CAM_Y,
  CAM_Z,
  CAM_FOV,
  CAM_NEAR,
  CAM_FAR,
  CAM_REST_BACK,
  LOOK,
  AMBIENT_INTENSITY,
  HEMI_INTENSITY,
  STAGE_ENV_INTENSITY,
  SPOT_HEIGHT_M,
  SPOT_INTENSITY,
  SPOT_ANGLE,
  SPOT_PENUMBRA,
  SPOT_DISTANCE,
  SPOT_DECAY,
  SPOT_SHADOW,
  WORK_RENDER_SCALE,
  SCROLL_CAPTURE_BLEND_IN,
  SCROLL_CAPTURE_BLEND_OUT,
  SCROLL_CAPTURE_WHEEL_ON,
  SCROLL_CAPTURE_WHEEL_OFF,
  INTRO_SETTLE_GRACE_MS,
  INTRO_HANDOFF_MS,
  INTRO_HEAVY_EFFECTS_DELAY_MS,
  INTRO_INTEGRATION_DELAY_MS,
  INTRO_MATERIAL_BATCH_SIZE,
  INTRO_MATERIAL_YIELD_FRAMES,
  INTRO_SIDEKICK_BAKE_DELAY_MS,
  INTRO_DEFERRED_IDLE_TIMEOUT_MS,
  INTRO_SPRING_HOLD_MS,
  INTRO_POST_LAND_WARM_MS,
  INTRO_POST_LAND_CURSOR_MS,
  vignetteStageDegrees,
  placeOnStage,
  STAGE_RADIUS,
  STAGE_BG,
  EXPOSURE,
  BOOT_MIN_MS
} from "./stage/constants.js";
import {
  normalizeWheelDelta,
  smoothstep,
  pointerNdcFromClient
} from "./stage/stageScrollUtils.js";
import {
  STAGE_FOCUS_PHASE,
  canStartDesktopBoot,
  shouldBlockScrollCaptureBlend
} from "./stage/stageAnimationPolicy.js";
import { INTRO_TRACK_DESCENT } from "./stage/stageCameraTrack.js";
import {
  GPU_HOLD_LAYER,
  compileHeldRoot,
  hideSceneExcept,
  releaseRootToCamera,
  setGroupRenderOpacity,
  warmMeshesChunked
} from "./stage/stageModelReveal.js";
import { createFrameBudget, setActiveFrameBudget, spanFrame, tagFrame } from "./stage/frameBudget.js";
import { STAGE_FLOOR_Y, measureBlockoutReferenceBounds, measureSceneBounds, snapAllGroupsToFloor, snapGroupToFloor } from "./vignettes/pcSceneBlockout.js";
import { preloadPcTextures, setPcTextureLoadingManager } from "./vignettes/pcProductionMaterials.js";
import { WaterCursor } from "../cursor/WaterCursor.js";
import { CameraRig } from "./camera/CameraRig.js";
import { buildVignetteRing } from "./camera/ringLayout.js";
import { createScrollAdvance } from "./camera/scrollAdvance.js";
import { createVignetteClick } from "./camera/vignetteClick.js";
import {
  createParallaxDampZones,
  PARALLAX_DAMP_INSIDE_SCALE
} from "./camera/parallaxDampZones.js";
import { PARALLAX_DAMP_ZONE_IDS } from "./stage/scrollCaptureTargets.js";

/** Spring orbit — camera travels the ring; vignettes stay fixed. */
const LOOK_AT_HEIGHT = LOOK.y;
const CAMERA_REST_HEIGHT = CAM_Y;
const CAMERA_PAGELOAD_HEIGHT = CAM_Y + INTRO_TRACK_DESCENT;
/** Pull-in distance from rest radius — 5% less than prior so the PC zoom isn't too tight. */
const CAMERA_ZOOM_DISTANCE = 4.2 * 0.95;
const CAMERA_ZOOM_HEIGHT = 2.15;

const _SPOT_AIM_LOCAL = new THREE.Vector3();

/**
 * `?work` or `?work=1` → 60% object raster. `?quality=0.6` sets the scale.
 * `?work=0` forces full. Screen canvases are not read from this.
 */
function readWorkRenderScale() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("quality")) {
    const n = Number(params.get("quality"));
    if (Number.isFinite(n) && n > 0) return Math.min(1, n);
  }
  if (params.has("work")) {
    const v = params.get("work");
    if (v === "0" || v === "false" || v === "off") return 1;
    return WORK_RENDER_SCALE;
  }
  return 1;
}

/**
 * Live atmosphere: volumetric by default. `?fog=haze` restores sheet+haze (paths kept).
 * @returns {"haze" | "volumetric"}
 */
function readFogMode() {
  const params = new URLSearchParams(window.location.search);
  const v = (params.get("fog") || "").toLowerCase();
  if (v === "haze" || v === "ring" || v === "0" || v === "off") return "haze";
  return "volumetric";
}

export class StageExperience {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.isCoarse = window.matchMedia("(pointer: coarse)").matches;
    this._fullPixelRatio = Math.min(window.devicePixelRatio || 1, this.isCoarse ? 1.5 : 1.75);
    this._renderScale = readWorkRenderScale();
    this.pixelRatio = this._fullPixelRatio * this._renderScale;

    this.hud = new HUDController();
    this.loadingManager = new THREE.LoadingManager();
    this.bootSequence = new StageBootSequence({
      fader: document.getElementById("fader"),
      hud: this.hud
    });
    setPcTextureLoadingManager(this.loadingManager);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.animFns = [];
    this.current = 0;
    this.locked = true;
    this._interactionReady = false;
    this.introComplete = false;
    this.introRig = { descent: INTRO_TRACK_DESCENT };
    this._introTrackT = 0;
    this._introTrackLinear = 0;
    this._introMotionComplete = false;
    this._introContentReady = false;
    this._introIntegrateScheduled = false;
    this._postGrainStrength = 0;
    this._modelRevealOpacity = 0;
    this._pendingFloorSnap = false;
    this._touchCapture = false;
    this._screenFrustum = new THREE.Frustum();
    this._projScreenMatrix = new THREE.Matrix4();
    this._screenHover = false;
    this._pcScreenHovered = false;

    this.scrollCapture = new StageScrollCapture();
    /** Soften cursor parallax over registered meshes (e.g. PC monitor → 20%). */
    this.parallaxDampZones = createParallaxDampZones({
      insideScale: PARALLAX_DAMP_INSIDE_SCALE
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(STAGE_BG);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = EXPOSURE;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(
      CAM_FOV,
      window.innerWidth / window.innerHeight,
      CAM_NEAR,
      CAM_FAR
    );
    this.scene.add(this.camera);

    this.focusBlend = 0;
    this._focusPhase = STAGE_FOCUS_PHASE.IDLE;
    this._focusTween = null;
    /** Swallow the click that follows a Sidekick pointerdown toggle. */
    this._ignoreNextVignetteClick = false;
    /** True while desktop focus / CameraRig zoom is active. */
    this._focusDollyIn = false;
    this._bootQueuePending = false;
    this.captureBlend = 0;
    this._captureBlendTarget = false;
    this._captureBlendTween = null;
    this._lastPointer = {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.5
    };
    this._introHandoffUntil = 0;
    this._introSettleUntil = 0;
    this._introHeavyEffectsAfter = 0;
    this._introIntegrationActive = false;
    this._introDeferredRunning = false;
    this._introAssetsWarmed = false;
    this._introSpringArmed = this.reducedMotion;
    this._introHoldStartedAt = 0;
    this._deferredModelsFetchStarted = false;
    this.frameBudget = createFrameBudget();
    setActiveFrameBudget(this.frameBudget);

    this.environment = new THREE.Group();
    this.scene.add(this.environment);

    this.world = new THREE.Group();
    this.environment.add(this.world);
    addDegreeLabels(this.world);
    this.environment.position.y = 0;

    this._buildEnvironment();
    this._buildLighting();
    this.liveEnv = new LiveStageEnvironment(this.renderer);
    this.scene.environment = this.liveEnv.getStudioEnvironment();
    this.scene.environmentIntensity = STAGE_ENV_INTENSITY;
    this.vignettes = this._buildVignettes();
    this._mountNeonSystem();
    this._initCameraRig();
    this._updatePlaceholderVisibility(0);

    if (import.meta.env.DEV) {
      window.__stage = this;
    }

    // Shared Tier-B pass + fogConfig. In composer always (gate warm compiles it).
    // Default atmosphere: volumetric on; haze + ring hidden (paths kept for ?fog=haze).
    this._fogMode = readFogMode();
    this._volFogFade = 0;
    this.volumetricFog = new VolumetricFogPass(this.camera, {
      useComposerDepth: false,
      depthPacked: true,
      halfRes: FOG_DEFAULTS.halfRes,
      params: createFogParams()
    });
    this.volumetricFog.setEnabled(false);
    this.volumetricFog.setDensityScale(0);
    this.volumetricFog.setNoiseFrozen(this.reducedMotion);

    this.post = new PostPass(
      this.renderer,
      this.pixelRatio,
      0, // grain off — sensor-noise look crushed fog; bloom stays
      this.camera,
      {
        scene: this.scene,
        bloom: !this.reducedMotion,
        volumetricPass: this.volumetricFog
      }
    );

    this._initLoadGate();

    // Cursor waits until the pageload drop is done — init cost hitching the open beat.
    this.waterCursor = null;

    this._bindUi();
    this._bindInput();
    this._mountPovSpotlight();
    this._setActiveVignette(0);
    this._runIntro();
    // Apply after neon exists (mounted above) — sticky haze isolate for volumetric preview.
    this._applyFogMode(this._fogMode, { resetFade: true });

    window.addEventListener("resize", this._onResize);
    this._onResize();
    this.clock = new THREE.Clock();
    // Discard constructor-time delta so the first spring step isn't a spike.
    this.clock.getDelta();
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  /**
   * Orbital spring camera — vignettes stay fixed on STAGE_RADIUS; the camera
   * travels a larger circular path around them (pageload = height only;
   * scroll = theta; click = radial pull toward the active stop).
   */
  _initCameraRig() {
    const vignetteInputs = this.vignettes.map((vig) => {
      const p = vig.group.position;
      return {
        position: [p.x, p.y, p.z],
        focusPoint: [p.x, LOOK_AT_HEIGHT, p.z]
      };
    });

    this.ring = buildVignetteRing(vignetteInputs, {
      center: [0, 0, 0],
      lookAtHeight: LOOK_AT_HEIGHT
    });

    const cameraRestRadius = CAM_Z + CAM_REST_BACK;

    this.cameraRig = new CameraRig(this.camera, this.ring, {
      center: [0, 0, 0],
      restRadius: cameraRestRadius,
      restHeight: CAMERA_REST_HEIGHT,
      pageloadHeight: this.reducedMotion ? CAMERA_REST_HEIGHT : CAMERA_PAGELOAD_HEIGHT,
      zoomRadius: cameraRestRadius - CAMERA_ZOOM_DISTANCE,
      zoomHeight: CAMERA_ZOOM_HEIGHT,
      lookAtHeight: LOOK_AT_HEIGHT,
      vignetteRadius: STAGE_RADIUS,
      startIndex: 0,
      // ~30% less than prior 0.35 — global parallax was overpowering.
      parallax: this.reducedMotion ? { maxOffset: 0, omega: 7 } : { maxOffset: 0.245, omega: 7 }
    });

    if (this.reducedMotion) {
      this.cameraRig.armIntroDescent();
    }

    // Sole scroll path: CameraRig springs + leave hooks. Block until intro lands
    // so aerial-hold "settled" can't steal the first wheel into a ring hop.
    this.cameraRig.scrollAdvance = createScrollAdvance({
      onAdvance: (dir) => this.advance(dir),
      isSettled: () =>
        Boolean(this.introComplete && this.cameraRig?.state?.isSettled),
      threshold: 28,
      quietMs: 110
    });

    this.vignettes.forEach((vig, index) => {
      vig.group.userData.vignetteIndex = index;
      vig.group.traverse((obj) => {
        if (obj.isMesh) obj.userData.vignetteIndex = index;
      });
    });

    this.vignetteClick = createVignetteClick({
      camera: this.camera,
      meshes: this.vignettes.map((vig) => vig.group),
      cameraRig: this.cameraRig
    });

    this._lastCameraIndex = 0;
    this._lastCameraZoomed = false;
  }

  _buildEnvironment() {
    this.studioRoom = buildStageStudioRoom();
    this.environment.add(this.studioRoom);

    this.stageFloor = buildStageFloor();
    this.world.add(this.stageFloor);
  }

  _buildLighting() {
    // POV SpotLight is the key; tiny ambient/hemi keep shadow areas from going pure black.
    this.environment.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));
    const hemi = new THREE.HemisphereLight(0xd8dce8, STAGE_BG, HEMI_INTENSITY);
    hemi.position.set(0, 12, 0);
    this.environment.add(hemi);

  }

  /**
   * POV spotlight — parented to camera; aim refreshed each frame toward the
   * active vignette look target (or LOOK as a fallback before the rig exists).
   */
  _mountPovSpotlight() {
    this.camera.updateMatrixWorld(true);
    const aim =
      this.cameraRig?.state?.lookAt?.clone?.() ??
      new THREE.Vector3(0, LOOK_AT_HEIGHT, STAGE_RADIUS);
    _SPOT_AIM_LOCAL.copy(aim);
    this.camera.worldToLocal(_SPOT_AIM_LOCAL);

    this.spotTarget = new THREE.Object3D();
    this.spotTarget.position.copy(_SPOT_AIM_LOCAL);
    this.camera.add(this.spotTarget);

    this.spotLight = new THREE.SpotLight(
      0xfff2e0,
      SPOT_INTENSITY,
      SPOT_DISTANCE,
      SPOT_ANGLE,
      SPOT_PENUMBRA,
      SPOT_DECAY
    );
    this.spotLight.position.set(0, SPOT_HEIGHT_M, 0);
    this.spotLight.layers.set(0);
    this.camera.add(this.spotLight);
    this.spotLight.target = this.spotTarget;
    configureSpotShadow(this.spotLight);
    this._applyRenderScale();
  }

  _aimPovSpotlight() {
    if (!this.spotTarget) return;
    this.camera.updateMatrixWorld(true);
    _SPOT_AIM_LOCAL.copy(this.cameraRig?.state?.lookAt ?? LOOK);
    this.camera.worldToLocal(_SPOT_AIM_LOCAL);
    this.spotTarget.position.copy(_SPOT_AIM_LOCAL);
  }

  /**
   * Per-stop neon tubes + one shared fog ring. Four static PointLights
   * (layers 0+2) scale by camera proximity; haze Y-billboards sit on layer 2.
   */
  _mountNeonSystem() {
    this.fogMaterial = createFogMaterial({ reducedMotion: this.reducedMotion });
    this.neon = new NeonSystem({
      scene: this.scene,
      camera: this.camera,
      fogMaterial: this.fogMaterial,
      reducedMotion: this.reducedMotion,
      isCoarse: this.isCoarse
    });
    this.vignettes.forEach((vig) => this.neon.attach(vig));
    this.neon.finishMount();
    this.neon.setStageFloor?.(this.stageFloor);
  }

  /** Shared LoadingManager → XP fader. Fog bake + min duration before input. */
  _initLoadGate() {
    this.loadGate = createStageLoadGate({
      manager: this.loadingManager,
      bootSequence: this.bootSequence,
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      post: this.post,
      fogMaterial: this.fogMaterial,
      bakeFogAtlas,
      bootMinMs: this.reducedMotion ? 400 : BOOT_MIN_MS,
      onReady: () => this._enableInteraction()
    });

    void preloadPcTextures();
    this._startGatingModelFetches();
    // Same moment as the desktop fetch, but NOT the boot manager. Parse then
    // overlaps the fader instead of blocking post-land frames. The gate does
    // not wait for these.
    this._startDeferredModelFetches();
    this.loadGate.finishSeeding();
  }

  _enableInteraction() {
    this.locked = false;
    this._interactionReady = true;
    this._ensureWaterCursor();
  }

  /** Sync HUD / active vignette when the spring camera changes target index. */
  _syncCameraRigIndex() {
    if (!this.cameraRig) return;
    const index = this.cameraRig.state.index;
    if (index === this._lastCameraIndex) return;
    this._lastCameraIndex = index;
    this._setActiveVignette(index);
    this._setCaption(index);
    if (this.ui.caption) this.ui.caption.style.opacity = "1";
    if (index === 2) {
      // Fit once the orbital camera faces this stop (safe now — on-stop only).
      this._fitSidekickRestPose(false);
    }
  }

  /**
   * CameraRig zoom is the focus path — desktop boots MySpace; Sidekick opens/closes
   * the slide so zoom and phone state stay in lockstep.
   */
  _syncCameraRigZoom() {
    if (!this.cameraRig) return;
    const zoomed = Boolean(this.cameraRig.state.isZoomed);
    const index = this.cameraRig.state.index;

    // Sidekick slide follows zoom continuously (not only on the edge) so any
    // zoom-out path — click, Escape, scroll away — always returns to closed.
    const sidekick = this.vignettes[2]?.instance;
    if (sidekick) {
      sidekick.syncToCameraZoom?.(zoomed && index === 2);
    }
    const travel = this.vignettes[3]?.instance;
    if (travel) {
      travel.syncToCameraZoom?.(zoomed && index === 3);
    }

    if (zoomed === this._lastCameraZoomed) return;
    this._lastCameraZoomed = zoomed;

    if (zoomed && index === 1) {
      this.focusBlend = 1;
      this._focusPhase = STAGE_FOCUS_PHASE.FOCUSED;
      this._focusDollyIn = true;
      this.vignettes[1]?.instance?.updateFocus?.(this.camera, 1, {
        isActive: true,
        transitioning: false
      });
      requestAnimationFrame(() => this._tryStartDesktopBoot());
      return;
    }

    if (!zoomed && this._focusPhase !== STAGE_FOCUS_PHASE.IDLE) {
      this._focusTween?.kill();
      this._focusTween = null;
      this.focusBlend = 0;
      this._focusPhase = STAGE_FOCUS_PHASE.IDLE;
      this._focusDollyIn = false;
      this._bootQueuePending = false;
      this.vignettes[1]?.instance?.updateFocus?.(this.camera, 0, {
        isActive: this.current === 1,
        transitioning: false
      });
    }
  }

  /** Dev helper — full alignment report for every vignette. */
  debugFloorHeights() {
    const floorSpace = this.environment;
    return this.vignettes.map((vig) => {
      const box = measureSceneBounds(vig.group, floorSpace);
      const blockout = vig.group.getObjectByName("pc-scene-blockout");
      const blockoutRef = vig.group.getObjectByName("pc-scene-blockout-ref");
      const pc = vig.group.getObjectByName("pc") ?? vig.group.children.find((c) => c.type === "Group" && c !== blockout && c !== blockoutRef);

      const refBox = blockoutRef ? measureBlockoutReferenceBounds(blockoutRef, floorSpace) : null;
      const visibleBox = blockout ? measureSceneBounds(blockout, floorSpace) : null;

      return {
        name: vig.def.name,
        floorMinY: box.min.y,
        floorMaxY: box.max.y,
        height: box.max.y - box.min.y,
        centerY: (box.min.y + box.max.y) * 0.5,
        groupY: vig.group.position.y,
        delta: box.min.y - STAGE_FLOOR_Y,
        blockoutHeight: visibleBox ? visibleBox.max.y - visibleBox.min.y : null,
        refHeight: refBox ? refBox.max.y - refBox.min.y : null
      };
    });
  }

  debugResnapAll() {
    snapAllGroupsToFloor(this.vignettes.map((vig) => vig.group));
    this.neon?.seatTubesOnFloor?.();
    return this.debugFloorHeights();
  }

  /**
   * DEV — draw meshes at a fraction of the DPR cap. Effects stay on.
   * XP / MySpace / Sidekick SMS canvases stay at authored size.
   * `1` or `false` restores full. `?work` boots at 0.6.
   * @param {number | false} [scale]
   */
  setWorkQuality(scale = WORK_RENDER_SCALE) {
    if (scale === false || scale === 1) {
      this._renderScale = 1;
    } else {
      const n = Number(scale);
      this._renderScale = Math.min(1, Math.max(0.35, Number.isFinite(n) && n > 0 ? n : WORK_RENDER_SCALE));
    }
    this._applyRenderScale();
    this._onResize();
    return this.debugWorkQuality();
  }

  debugFrameBudget() {
    return this.frameBudget?.dump() ?? null;
  }

  debugWorkQuality() {
    const draw = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(draw);
    return {
      scale: this._renderScale,
      pixelRatio: this.pixelRatio,
      fullPixelRatio: this._fullPixelRatio,
      drawingBuffer: { width: draw.x, height: draw.y },
      shadowMap: this.spotLight?.shadow?.mapSize?.x ?? null,
      screensUnscaled: true
    };
  }

  _applyRenderScale() {
    this.pixelRatio = this._fullPixelRatio * this._renderScale;
    this.renderer.setPixelRatio(this.pixelRatio);
    if (this.post) this.post.pixelRatio = this.pixelRatio;
    if (!this.spotLight?.shadow) return;
    const size = Math.max(256, Math.round(SPOT_SHADOW.mapSize * this._renderScale));
    this.spotLight.shadow.mapSize.set(size, size);
    this.spotLight.shadow.map?.dispose();
    this.spotLight.shadow.map = null;
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Dev helper — Sidekick motion state + keypad/side-button mesh graph. */
  debugSidekick() {
    const sidekick = this.vignettes[2]?.instance;
    return {
      current: this.current,
      aligned: sidekick?._aligned ?? false,
      isOpen: sidekick?.isOpen ?? false,
      swiveling: Boolean(sidekick?._swivelTween),
      sidekickRootPosition: sidekick?.sidekickRoot?.position?.toArray?.() ?? null,
      restPoseReady: sidekick?._restPoseReady ?? false,
      sidekickScale: sidekick?.sidekickRoot?.scale?.x ?? null,
      keypad: sidekick?.debugKeypad?.() ?? null
    };
  }

  /** DEV — FogDepthCapture RT vs drawing buffer, live near/far, packed samples. */
  debugFogCapture() {
    return this.neon?.debugFogCapture?.(this.renderer, this.scene, this.camera) ?? null;
  }

  /**
   * DEV — enable/disable volumetric fog pass (composer skips when off).
   * Prefer `debugFog('volumetric'|'haze')` for the paired haze toggle.
   * @param {boolean} on
   */
  setVolumetricEnabled(on) {
    if (on) return this.debugFog("volumetric");
    return this.debugFog("haze");
  }

  /**
   * Live fog atmosphere.
   * `volumetric` (default): raymarch on, haze + ring off.
   * `haze`: raymarch off, haze + ring on (legacy compare / `?fog=haze`).
   * @param {"haze" | "volumetric"} [mode]
   */
  debugFog(mode = "volumetric") {
    const next = mode === "haze" || mode === "ring" ? "haze" : "volumetric";
    this._applyFogMode(next, { resetFade: true });
    return this.debugVolumetricFog();
  }

  /**
   * @param {"haze" | "volumetric"} mode
   * @param {{ resetFade?: boolean }} [opts]
   */
  _applyFogMode(mode, opts = {}) {
    this._fogMode = mode === "haze" ? "haze" : "volumetric";
    if (opts.resetFade) this._volFogFade = 0;

    if (this._fogMode === "volumetric") {
      // Sticky haze off; hide ring (do not delete paths).
      this.neon?.debugFogIsolate?.({ haze: false, fog: false });
      this.volumetricFog?.setDensityScale(0);
      this.volumetricFog?.setEnabled(false);
    } else {
      this.neon?.debugFogIsolate?.({ haze: true, fog: true });
      if (this.neon) this.neon._hazeIsolateOff = false;
      this.volumetricFog?.setEnabled(false);
      this.volumetricFog?.setDensityScale(0);
      this._volFogFade = 0;
    }
  }

  /**
   * Gate volumetric march behind heavy-effects; fade density ~FOG_HEAVY_FADE_IN_MS.
   * @param {number} dt
   */
  _tickVolumetricFog(dt) {
    const pass = this.volumetricFog;
    if (!pass) return;

    const wantVol = this._fogMode === "volumetric";
    const heavy = this._shouldRunIntroHeavyEffects();

    if (!wantVol || !heavy) {
      pass.setEnabled(false);
      pass.setDensityScale(0);
      if (!wantVol) this._volFogFade = 0;
      return;
    }

    pass.setEnabled(true);
    const fadeSec = FOG_HEAVY_FADE_IN_MS / 1000;
    const step = fadeSec > 0 ? Math.min(Math.max(dt, 0), 1 / 20) / fadeSec : 1;
    this._volFogFade = Math.min(1, this._volFogFade + step);
    pass.setDensityScale(this._volFogFade);
  }

  /**
   * DEV — hot-update fogConfig params on the live pass.
   * @param {Record<string, number|boolean>} [partial]
   */
  setVolumetricParams(partial = {}) {
    if (!this.volumetricFog) return null;
    const next = { ...createFogParams(), ...partial };
    this.volumetricFog.setParams(next);
    if (this.reducedMotion) this.volumetricFog.setNoiseFrozen(true);
    return this.debugVolumetricFog();
  }

  /** DEV — volumetric pass state for cost / soft-contact / toggle gates. */
  debugVolumetricFog() {
    const pass = this.volumetricFog;
    if (!pass) return null;
    const u = pass.marchMaterial?.uniforms;
    return {
      mode: this._fogMode ?? "volumetric",
      enabled: Boolean(pass.enabled),
      densityScale: u?.uDensityScale?.value ?? null,
      fade: this._volFogFade ?? 0,
      depthPacked: Boolean(pass.depthPacked),
      halfRes: Boolean(pass.halfRes),
      hasDepth: Boolean(pass._depthTexture),
      hasValidSize: Boolean(pass._hasValidSize),
      fogTarget: pass.fogTarget
        ? { w: pass.fogTarget.width, h: pass.fogTarget.height }
        : null,
      near: u?.uCameraNear?.value ?? null,
      far: u?.uCameraFar?.value ?? null,
      steps: u?.uBaseRaymarchStepCount?.value ?? null,
      density: u?.uFogDensityMultiplier?.value ?? null,
      fillCap: u?.uInScatterFillCap?.value ?? null,
      lightIntensities: u?.uLightIntensity?.value?.slice?.() ?? null,
      noiseFrozen: Boolean(pass._noiseFrozen)
    };
  }

  /** DEV — camera-parented depth RT + soft-term ramp. Not a second composer. */
  debugFogVis(mode = "both") {
    return this.neon?.debugFogVis?.(mode) ?? "off";
  }

  /**
   * Isolate stacked fog look: floor neon stain vs radial feather.
   * @param {{ floor?: boolean, feather?: number, fog?: boolean }} opts
   */
  debugFogIsolate(opts = {}) {
    return this.neon?.debugFogIsolate?.(opts) ?? null;
  }

  _snapAllVignettesToFloor(force = false) {
    if (!force && !this.introComplete) {
      this._pendingFloorSnap = true;
      return;
    }
    snapAllGroupsToFloor(this.vignettes.map((vig) => vig.group));
    // Floor snap moves group.y — re-seat tubes so bottoms stay on Y=0.
    this.neon?.seatTubesOnFloor?.();
    this._pendingFloorSnap = false;
  }

  _onIntroContentReady() {
    if (this._introContentReady) return;
    this._introContentReady = true;
  }

  _completeIntroMotion() {
    if (this._introMotionComplete) return;
    this._introTrackT = 1;
    this._introMotionComplete = true;
    this.introComplete = true;
    this.introRig.descent = 0;
    this._introSettleUntil = performance.now() + INTRO_SETTLE_GRACE_MS;
    this._introHandoffUntil = performance.now() + INTRO_HANDOFF_MS;
    // Lean settle frame — no WaterCursor / GLB parse / texture upload here.
    // Those used to hitch exactly as the height spring ease-out kissed rest.
    this.cameraRig?.scrollAdvance?.notifySettled?.();
    this._schedulePostIntroAssetWork();
    if (!this._introIntegrateScheduled) {
      this._introIntegrateScheduled = true;
      this._scheduleIntroDeferredWork();
    }
  }

  /**
   * Stagger post-land work so the ring handoff stays on a light frame budget.
   * Fetch → warm → cursor, each after the height spring has visually settled.
   */
  _schedulePostIntroAssetWork() {
    window.setTimeout(() => this._warmIntroAssetsDeferred(), INTRO_POST_LAND_WARM_MS);
    window.setTimeout(() => this._ensureWaterCursor(), INTRO_POST_LAND_CURSOR_MS);
  }

  _ensureWaterCursor() {
    if (this.waterCursor || this.reducedMotion || !this._interactionReady) return;
    this.waterCursor = WaterCursor.tryCreate({
      renderer: this.renderer,
      ticker: gsap.ticker
    });
    if (this.waterCursor) {
      this.waterCursor.resize(window.innerWidth, window.innerHeight);
    }
  }

  /** Mark intro done once the spring pageload descent settles. */
  _tickIntroFromCameraRig() {
    if (this._introMotionComplete || !this.cameraRig) return;

    // Aerial hold — absorb first-frame GPU compile before the drop starts.
    if (!this._introSpringArmed) {
      if (!this._introHoldStartedAt) this._introHoldStartedAt = performance.now();
      if (performance.now() - this._introHoldStartedAt >= INTRO_SPRING_HOLD_MS) {
        this._introSpringArmed = true;
        this.cameraRig.armIntroDescent();
      }
      return;
    }

    const s = this.cameraRig.state;
    const heightSpan = Math.max(CAMERA_PAGELOAD_HEIGHT - CAMERA_REST_HEIGHT, 1e-3);
    const progress = 1 - THREE.MathUtils.clamp(
      (s.height - CAMERA_REST_HEIGHT) / heightSpan,
      0,
      1
    );
    this._introTrackT = progress;
    this._introTrackLinear = progress;
    this.introRig.descent = Math.max(0, s.height - CAMERA_REST_HEIGHT);

    if (this._introTrackLinear >= 0.84 && !this._introContentReady) {
      this._onIntroContentReady();
    }

    if (!this.cameraRig._introActive && s.isSettled) {
      this._completeIntroMotion();
    }
  }

  /** Desktop GLB only — Sidekick / Travel must not count toward the boot gate. */
  _startGatingModelFetches() {
    this.vignettes[1]?.instance?.startModelLoad?.();
  }

  /** Sidekick + Travel/T-rex bytes — with the desktop fetch, not the boot manager. */
  _startDeferredModelFetches() {
    if (this._deferredModelsFetchStarted) return;
    this._deferredModelsFetchStarted = true;
    const sidekick = this.vignettes[2]?.instance;
    const travel = this.vignettes[3]?.instance;
    sidekick?.startModelLoad?.();
    // One meshopt decode at a time — parallel parse dropped both scenes.
    void this._startTravelAfterSidekick(sidekick, travel);
  }

  async _startTravelAfterSidekick(sidekick, travel) {
    const deadline = performance.now() + 20000;
    while (sidekick && !sidekick._modelLoadSettled && performance.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    travel?.startModelLoad?.();
  }

  /**
   * Upload maps, compile once while the root is on GPU_HOLD_LAYER, then show.
   * Not one compile per mesh inside the live fog-depth + beauty frame.
   */
  async _compileThenShow(root) {
    if (!root || !this.renderer) return;
    let held = false;
    root.traverse((obj) => {
      if (obj.isMesh && obj.layers.isEnabled(GPU_HOLD_LAYER)) held = true;
    });
    if (!held) return;
    await warmMeshesChunked(root, this.renderer);
    try {
      await spanFrame("shader-compile", async () => {
        compileHeldRoot(this.renderer, this.scene, this.camera, root);
      });
      await spanFrame("fog-depth-compile", async () => {
        const restore = hideSceneExcept(this.scene, root);
        try {
          this.neon?.compileHeldFogDepth?.(this.renderer, this.scene, this.camera);
        } finally {
          restore();
        }
      });
    } catch (error) {
      console.warn("[StageExperience] Held compile failed:", error);
    }
    releaseRootToCamera(root);
    await this._yieldFrame();
  }

  /** Texture decode during descent — must not wait for hold flags or motion complete. */
  _warmIntroAssetsDeferred() {
    if (this._introAssetsWarmed) return;
    this._introAssetsWarmed = true;
    const desktop = this.vignettes[1]?.instance;
    const idle = window.requestIdleCallback;
    const warm = () =>
      void desktop?.warmIntroAssets?.(this.renderer, () => this._yieldFrame());
    if (idle) {
      idle(warm, { timeout: INTRO_DEFERRED_IDLE_TIMEOUT_MS });
    } else {
      window.setTimeout(warm, 0);
    }
  }

  /** Wait until the spring has landed and the settle + integration delay have elapsed. */
  async _waitForIntegrateWindow() {
    while (!this._introMotionComplete) {
      await this._yieldFrame();
    }
    const readyAt =
      (this._introSettleUntil || performance.now()) + INTRO_INTEGRATION_DELAY_MS;
    while (performance.now() < readyAt) {
      await this._yieldFrame();
    }
  }

  _scheduleIntroDeferredWork() {
    void this._releaseIntroDeferredWork();
  }

  /**
   * Yield one or more display frames between heavy intro steps.
   * @param {number} [frames=1]
   */
  _yieldFrame(frames = 1) {
    const count = Math.max(1, frames | 0);
    return new Promise((resolve) => {
      let left = count;
      const step = () => {
        left -= 1;
        if (left <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /** Heavy vignette integration — only after the resting POV is stable. */
  async _releaseIntroDeferredWork() {
    if (this._introDeferredRunning) return;
    this._introDeferredRunning = true;
    this._introIntegrationActive = true;

    const desktop = this.vignettes[1]?.instance;
    const sidekick = this.vignettes[2]?.instance;
    const travel = this.vignettes[3]?.instance;
    const yieldFrame = (frames) => this._yieldFrame(frames);
    let stillHolding = false;

    try {
      await this._waitForIntegrateWindow();
      await yieldFrame(INTRO_MATERIAL_YIELD_FRAMES);

      await spanFrame("desktop-integrate", () =>
        desktop?.integrateAfterIntro?.({
          yieldFrame,
          revealHidden: true,
          batchSize: INTRO_MATERIAL_BATCH_SIZE,
          yieldFrames: INTRO_MATERIAL_YIELD_FRAMES
        })
      );
      // CubeUV + PMREM once while the PC is still on GPU_HOLD_LAYER.
      // The heavy-effects flush used to recapture this and hitch the first
      // live frame (~600ms). Do not force a second capture later.
      if (desktop?.glassMesh) {
        await spanFrame("crt-cube", async () => {
          try {
            desktop.updateCrtGlassReflection?.(
              this.liveEnv,
              this.scene,
              this.spotLight,
              this.spotTarget,
              { force: true }
            );
          } catch (error) {
            console.warn("[StageExperience] CRT cube warm failed:", error);
          }
        });
      }
      await this._compileThenShow(desktop?.pcRoot);

      await spanFrame("sidekick-integrate", () =>
        sidekick?.integrateAfterIntro?.({
          yieldFrame,
          revealHidden: true,
          deferScreenTextureMs: INTRO_SIDEKICK_BAKE_DELAY_MS
        })
      );
      await this._compileThenShow(sidekick?.sidekickRoot);

      await spanFrame("travel-integrate", () =>
        travel?.integrateAfterIntro?.({
          yieldFrame,
          revealHidden: true
        })
      );
      await this._compileThenShow(travel?.packRoot);
      await this._compileThenShow(travel?.rexRoot);

      stillHolding = Boolean(
        desktop?._holdForIntro ||
          sidekick?._holdForIntro ||
          travel?._holdForIntro ||
          (sidekick?._modelLoadStarted && !sidekick?._modelLoadSettled) ||
          (travel?._modelLoadStarted && !travel?._modelLoadSettled)
      );

      if (this._pendingFloorSnap) {
        this._snapAllVignettesToFloor(true);
        await yieldFrame();
      }
    } finally {
      this._introIntegrationActive = false;
      this._introDeferredRunning = false;
      this._introHeavyEffectsAfter = performance.now() + INTRO_HEAVY_EFFECTS_DELAY_MS;
    }

    if (stillHolding) {
      // Models hadn't finished loading — try again shortly.
      window.setTimeout(() => this._scheduleIntroDeferredWork(), 400);
      return;
    }

    window.setTimeout(() => {
      this._flushIntroDeferredWork();
    }, INTRO_HEAVY_EFFECTS_DELAY_MS);
  }

  _tickNeon(time) {
    if (!this.neon || !this.cameraRig) return;
    this.neon.update(this.cameraRig.state.theta, this.vignettes.length, time);
  }

  debugNeon() {
    return {
      interactionReady: this._interactionReady,
      locked: this.locked,
      ...(this.neon?.debugState?.() ?? {}),
      tubes: this.vignettes.map((vig) => ({
        name: vig.def.name,
        colors: vig.def.neonColors ?? null,
        emissive: vig.tube?.material?.emissiveIntensity ?? 0
      }))
    };
  }

  /**
   * TEMP — hot-tune neon PointLight height / peak intensity (no rebuild).
   * Prefer `setNeon({ height: 1.8 })` before lowering `maxLight`.
   * Remove after baking the chosen pair into `constants.js`.
   * @param {{ height?: number, maxLight?: number }} opts
   */
  setNeon(opts = {}) {
    if (!this.neon?.setNeon) {
      return { ok: false, reason: "neon not mounted" };
    }
    const state = this.neon.setNeon(opts);
    // Re-derive proximity intensities for the current camera pose immediately.
    this._tickNeon(this.clock?.getElapsedTime?.() ?? 0);
    return { ok: true, ...state };
  }

  /**
   * Overlay a square + crosshair on the CRT canvas. Green square must read square
   * on the bezel content quad at rest and zoomed. `window.__stage.debugCrtAlign()`.
   */
  debugCrtAlign(show = true) {
    this.hud?.getMySpaceScreen?.()?.setAlignGrid(show);
    const desktop = this.vignettes[1]?.instance;
    return desktop?.debugCrtScreen?.() ?? null;
  }

  /** CRT env capture — skipped if the held-window warm already ran. */
  _flushIntroDeferredWork() {
    const desktop = this.vignettes[1]?.instance;
    if (!desktop?.updateCrtGlassReflection) return;
    if (desktop._lastEnvRotY != null) return;
    desktop._pendingCrtEnvRefresh = true;
    desktop.updateCrtGlassReflection(
      this.liveEnv,
      this.scene,
      this.spotLight,
      this.spotTarget,
      { force: true }
    );
    desktop._pendingCrtEnvRefresh = false;
  }

  /** Grain stays off (PostPass amount 0). Kept so a future re-enable can ramp again. */
  _tickPostGrainStrength(_dt) {
    this._postGrainStrength = 0;
  }

  /** Fade GLB vignettes in after post-settle integration mounts them hidden. */
  _tickModelReveal(dt) {
    const roots = [
      this.vignettes[1]?.instance?.pcRoot,
      this.vignettes[2]?.instance?.sidekickRoot,
      this.vignettes[3]?.instance?.packRoot,
      this.vignettes[3]?.instance?.rexRoot
    ].filter(Boolean);
    if (!roots.length) return;

    // Only reveal once intro motion is done and at least one model is mounted.
    if (!this._introMotionComplete) return;
    // Don't start the fade while materials are still being prepared off-screen.
    if (this._introIntegrationActive && this._modelRevealOpacity <= 0) return;

    if (this._modelRevealOpacity < 1) {
      const cappedDt = Math.min(Math.max(dt, 0), 1 / 24);
      this._modelRevealOpacity = Math.min(1, this._modelRevealOpacity + cappedDt / 1.35);
    }

    const opacity = this._modelRevealOpacity;
    for (const root of roots) {
      // Deferred travel GLBs can mount after the fade already hit 1; stamp them.
      if (opacity >= 1 && root.userData._revealStamped) continue;
      setGroupRenderOpacity(root, opacity);
      if (opacity >= 1) root.userData._revealStamped = true;
    }
  }

  _buildVignettes() {
    const defs = [monolithVignette, desktopVignetteMeta, sidekickVignetteMeta, travelVignetteMeta];
    const instances = [];

    defs.forEach((def, index) => {
      const group = new THREE.Group();
      const total = defs.length;
      const angle = placeOnStage(group, index, total);
      const stageDeg = vignetteStageDegrees(index, total);

      if (index === 1) {
        // Pull the PC stop 5% toward arena center (keep angle, shorten radius).
        group.position.x *= 0.95;
        group.position.z *= 0.95;
        const desktop = new DesktopVignette(group, {
          mySpace: this.hud.getMySpaceScreen(),
          scrollCapture: this.scrollCapture,
          parallaxDampZones: this.parallaxDampZones,
          vignetteIndex: index,
          renderer: this.renderer,
          liveEnv: this.liveEnv,
          introGate: () => !this.introComplete,
          deferModelLoad: !this.reducedMotion,
          loadingManager: this.loadingManager,
          getCamera: () => this.camera,
          reducedMotion: this.reducedMotion,
          onAligned: () => this._snapAllVignettesToFloor()
        });
        instances.push({ def, group, angle, stageDeg, instance: desktop });
      } else if (index === 2) {
        const sidekick = new SidekickVignette(group, {
          vignetteIndex: index,
          scrollCapture: this.scrollCapture,
          reducedMotion: this.reducedMotion,
          introGate: () => !this.introComplete,
          deferModelLoad: true,
          onRequestClose: () => {
            if (this.cameraRig?.state?.index !== 2) return;
            if (!this.cameraRig.state.isZoomed) return;
            this.cameraRig.zoomOut();
            this._syncCameraRigZoom();
          },
          onAligned: () => {
            this._snapAllVignettesToFloor();
            // Only fit once the camera is on the Sidekick stop — otherwise
            // viewport scaling samples from the wrong facing angle.
            if (this.introComplete && this.cameraRig?.state?.index === 2) {
              this._fitSidekickRestPose(false);
            }
          }
        });
        instances.push({ def, group, angle, stageDeg, instance: sidekick });
      } else if (index === 3) {
        const travel = new TravelVignette(group, {
          vignetteIndex: index,
          scrollCapture: this.scrollCapture,
          reducedMotion: this.reducedMotion,
          introGate: () => !this.introComplete,
          deferModelLoad: true,
          onAligned: () => this._snapAllVignettesToFloor()
        });
        instances.push({ def, group, angle, stageDeg, instance: travel });
      } else {
        def.build(group, this.animFns);
        snapGroupToFloor(group);
        instances.push({ def, group, angle, stageDeg, instance: null });
      }

      group.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material && !Array.isArray(obj.material)) {
          obj.material.envMapIntensity = obj.material.envMapIntensity ?? 0.85;
        }
      });

      this.world.add(group);
    });

    return instances;
  }

  /** Placeholder blockouts on Monolith are only visible on the active vignette. */
  _updatePlaceholderVisibility(activeIndex = this.current) {
    this.vignettes.forEach((vig, index) => {
      const show = index === activeIndex;
      vig.group.traverse((obj) => {
        if (!obj.isMesh || !obj.name.startsWith("blockout-")) return;
        if (obj.name.startsWith("blockout-ref")) return;
        obj.visible = show;
      });
    });
  }

  _bindUi() {
    this.ui = {
      readout: document.getElementById("readout"),
      capIndex: document.getElementById("capIndex"),
      capName: document.getElementById("capName"),
      capDesc: document.getElementById("capDesc"),
      caption: document.getElementById("caption"),
      dots: document.getElementById("dots"),
      fader: document.getElementById("fader")
    };

    this.vignettes.forEach((vig, index) => {
      const button = document.createElement("button");
      button.className = `dot${index === 0 ? " active" : ""}`;
      button.setAttribute("aria-label", vig.def.name);
      button.addEventListener("click", () => this.goTo(index));
      this.ui.dots?.appendChild(button);
    });

    this._setCaption(0);
  }

  _setCaption(index) {
    const def = this.vignettes[index].def;
    if (this.ui.capIndex) {
      this.ui.capIndex.textContent = `${String(index + 1).padStart(2, "0")} / ${String(this.vignettes.length).padStart(2, "0")}`;
    }
    if (this.ui.capName) this.ui.capName.textContent = def.name;
    if (this.ui.capDesc) this.ui.capDesc.textContent = def.desc;
    if (this.ui.dots) {
      [...this.ui.dots.children].forEach((dot, i) => {
        dot.classList.toggle("active", i === index);
      });
    }
  }

  _setActiveVignette(index) {
    this.vignettes[this.current]?.instance?.setInactive?.();
    this.current = index;
    this.vignettes[this.current]?.instance?.setActive?.();
    if (index === 2 && !this.vignettes[2]?.instance?._restPoseReady) {
      this._fitSidekickRestPose(false);
    }
    this._updatePlaceholderVisibility(index);
    this.hud.updateMySpacePanelForVignette(index);
  }

  /** Fit Sidekick rest scale + center in model space (camera already faces the stop). */
  _fitSidekickRestPose(force = false) {
    const sidekick = this.vignettes[2]?.instance;
    if (!sidekick?.fitRestHeroPose || !sidekick._aligned) return false;
    if (!force && sidekick._restPoseReady) return true;

    if (force) {
      sidekick.invalidateRestPose?.();
    }

    this.world.updateMatrixWorld(true);
    const fitted = sidekick.fitRestHeroPose(this.camera);
    if (fitted) {
      sidekick.update?.(0);
    }
    return fitted;
  }

  /** Ease out of interactive/focused state when travel starts. */
  _prepareForVignetteTransition(fromIndex) {
    this._resetVignetteFocus();

    if (fromIndex === 2) {
      const sidekick = this.vignettes[2]?.instance;
      if (sidekick?.isOpen || sidekick?._swivelTween) {
        sidekick.playSlideClose();
      }
    }

    this._setScrollCaptureBlendTarget(false);
  }

  _resetVignetteFocus() {
    this._focusTween?.kill();
    this._focusTween = null;
    this._focusDollyIn = false;
    this._focusPhase = STAGE_FOCUS_PHASE.IDLE;
    this._bootQueuePending = false;
    this.focusBlend = 0;
  }

  /** Start XP boot once the desktop monitor is zoomed — idempotent, screen-ready gated. */
  _tryStartDesktopBoot() {
    if (this.current !== 1 || !canStartDesktopBoot(this)) return;

    const desktop = this._getDesktopInstance();
    if (!desktop?.screenReady) {
      if (!this._bootQueuePending) {
        this._bootQueuePending = true;
        desktop?.whenScreenReady?.(() => {
          this._bootQueuePending = false;
          this._tryStartDesktopBoot();
        });
      }
      return;
    }

    const mySpace = this.hud.getMySpaceScreen();
    if (!mySpace) return;

    if (mySpace.xpBoot?.canStartBoot) {
      void desktop.playPowerOn?.();
      return;
    }

    if (mySpace.isPoweredOn) {
      mySpace.draw();
    }
  }

  /** Clear legacy focus flags when CameraRig zooms out (Escape / background click). */
  _unfocusVignette() {
    this._resetVignetteFocus();
  }

  goTo(target, _dirHint, _options = {}) {
    if (!this.cameraRig || !this.introComplete || this.locked) return;
    const n = this.vignettes.length;
    const index = ((target % n) + n) % n;
    if (index === this.cameraRig.state.index && !this.cameraRig.state.isZoomed) return;

    this._prepareForVignetteTransition(this.current);
    if (this.ui.caption) this.ui.caption.style.opacity = "0";
    this.cameraRig.goToIndex(index);
  }

  /**
   * @param {number} steps Signed step count (+1 next, -1 prev).
   * @param {{ vigorous?: boolean }} [options]
   */
  advance(steps, _options = {}) {
    if (!steps || !this.cameraRig) return;
    if (!this.introComplete || this.locked) return;
    if (!this.cameraRig.state.isSettled) return;
    this._prepareForVignetteTransition(this.current);
    this.cameraRig.advance(Math.sign(steps));
  }

  next = (options) => this.advance(1, options);
  prev = (options) => this.advance(-1, options);

  _bindInput() {
    this._onWheel = (event) => {
      if (this.locked) {
        event.preventDefault();
        return;
      }
      if (event._stageWheelHandled) return;
      event._stageWheelHandled = true;

      // Trackpads fire dozens of wheel events. Full mesh raycasts (Sidekick GLB)
      // on every tick stutter ring travel — only refresh mesh hover while capture
      // is already engaged (zoomed CRT). Pointermove keeps hover fresh otherwise.
      if (this.captureBlend > SCROLL_CAPTURE_WHEEL_ON) {
        this._updateHoverFromClient(event.clientX, event.clientY);
      } else {
        this.scrollCapture.updateDomHover(event.clientX, event.clientY);
      }

      const blend = this.captureBlend;

      if (this.scrollCapture.isActive) {
        if (this.scrollCapture.activeMeshId) {
          // Only hard-block when capture blend is engaged (zoomed CRT).
          // Hover alone must not eat ring scroll — Sidekick used to trap the stop.
          if (blend > SCROLL_CAPTURE_WHEEL_ON) {
            event.preventDefault();
            this.scrollCapture.handleWheel(event, 1);
            return;
          }
        } else if (this.scrollCapture.activeDomKey) {
          event.preventDefault();
          const target = document.elementFromPoint(event.clientX, event.clientY);
          const viewport = target?.closest(".ms-viewport");
          if (viewport) {
            viewport.scrollTop += normalizeWheelDelta(event);
          }
          return;
        }
      }

      const stageWeight = 1 - smoothstep(0, SCROLL_CAPTURE_WHEEL_OFF, blend);
      if (stageWeight <= 0.02) {
        if (blend > 0.02) event.preventDefault();
        return;
      }

      if (!this.cameraRig) return;
      this.cameraRig.scrollAdvance.handleWheel(event);
    };

    window.addEventListener("wheel", this._onWheel, { passive: false });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (this.cameraRig?.state?.isZoomed) {
          this.cameraRig.zoomOut();
          this._unfocusVignette();
          this._syncCameraRigZoom();
          return;
        }
        if (this.focusBlend > 0.02) {
          this._unfocusVignette();
        }
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") this.next();
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") this.prev();
    });

    this._touch = { x: null, y: null };
    window.addEventListener(
      "touchstart",
      (event) => {
        this._touch.x = event.touches[0].clientX;
        this._touch.y = event.touches[0].clientY;
        this._updateHoverFromClient(this._touch.x, this._touch.y);
        this._touchCapture =
          this.scrollCapture.isActive && this.captureBlend > SCROLL_CAPTURE_WHEEL_ON;
      },
      { passive: true }
    );
    window.addEventListener(
      "touchend",
      (event) => {
        if (this._touch.x === null) return;
        if (this._touchCapture) {
          this._touch.x = null;
          this._touchCapture = false;
          return;
        }
        const dx = event.changedTouches[0].clientX - this._touch.x;
        const dy = event.changedTouches[0].clientY - this._touch.y;
        if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) this.next();
          else this.prev();
        } else if (Math.abs(dy) > 55) {
          if (dy < 0) this.next();
          else this.prev();
        }
        this._touch.x = null;
      },
      { passive: true }
    );

    window.addEventListener(
      "pointermove",
      (event) => {
        this._updateHoverFromClient(event.clientX, event.clientY);
        if (this.cameraRig && !this.reducedMotion) {
          const rect = this._getCanvasRect();
          const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
          const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1;
          this.cameraRig.parallax.setPointerNdc(x, y);
        }
      },
      { passive: true }
    );

    this.canvas.addEventListener("pointerdown", this._onPointerDown, { capture: true });
    this.canvas.addEventListener("pointerup", this._onPointerUp, { capture: true });
    this.canvas.addEventListener("pointerleave", this._onPointerLeave, { capture: true });
    // Wrap vignetteClick so Sidekick's pointerdown toggle can swallow the follow-up click
    // (pointerdown zoomOut + click zoomIn was fighting itself).
    this.canvas.addEventListener("click", this._onVignetteClick, { capture: true });
  }

  _getCanvasRect() {
    return this.canvas.getBoundingClientRect();
  }

  /** Ease wheel authority when entering/leaving scroll-capture zones (parallax stays live). */
  _setScrollCaptureBlendTarget(active) {
    if (active && shouldBlockScrollCaptureBlend(this)) return;
    if (active === this._captureBlendTarget) return;
    this._captureBlendTarget = active;

    if (this.reducedMotion) {
      this.captureBlend = active ? 1 : 0;
      return;
    }

    this._captureBlendTween?.kill();
    this._captureBlendTween = gsap.to(this, {
      captureBlend: active ? 1 : 0,
      duration: active ? SCROLL_CAPTURE_BLEND_IN : SCROLL_CAPTURE_BLEND_OUT,
      ease: active ? "power4.out" : "power3.inOut",
      overwrite: true,
      onComplete: () => {
        this._captureBlendTween = null;
      }
    });
  }

  _updatePointerFromClient(clientX, clientY) {
    const rect = this._getCanvasRect();
    const ndc = pointerNdcFromClient(clientX, clientY, rect);
    this.pointer.x = ndc.x;
    this.pointer.y = ndc.y;
  }

  _updatePointer(event) {
    this._updatePointerFromClient(event.clientX, event.clientY);
  }

  _updateHoverFromClient(clientX, clientY) {
    this._lastPointer.x = clientX;
    this._lastPointer.y = clientY;

    this.scrollCapture.updateDomHover(clientX, clientY);
    this._updatePointerFromClient(clientX, clientY);
    const meshTarget = this.scrollCapture.updateMeshHover(
      this.raycaster,
      this.pointer,
      this.camera,
      this.current
    );

    if (meshTarget) {
      const hovering = this.scrollCapture.handlePointerMove();
      this._screenHover = Boolean(hovering);
      this._pcScreenHovered =
        this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.finalPcScreen;
      const onSidekick = this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.sidekick;
      const onTravel = this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.travelPack;
      if (!this.waterCursor) {
        const cursorMode = hovering
          ? "pointer"
          : this._pcScreenHovered
            ? this.focusBlend > 0.02
              ? "pointer"
              : "zoom-in"
            : onSidekick || onTravel
              ? "pointer"
              : "default";
        this.canvas.style.cursor = cursorMode === "default" ? "default" : cursorMode;
      }
    } else {
      this._screenHover = false;
      this._pcScreenHovered = false;
      if (!this.waterCursor) {
        this.canvas.style.cursor = "default";
      }
    }

    this._setScrollCaptureBlendTarget(this._shouldEngageScrollCapture());
    this._syncParallaxDampZone(clientX, clientY);

    return meshTarget ?? null;
  }

  /** Soften parallax while the pointer is over a registered damp zone (smooth spring taper). */
  _syncParallaxDampZone(clientX, clientY) {
    if (!this.parallaxDampZones) return;

    const domId = this.parallaxDampZones.hitTestDom(clientX, clientY);
    if (domId) {
      this.parallaxDampZones.setActive(domId);
      return;
    }

    // Prefer the already-resolved scroll-capture hit when it maps to a damp zone.
    if (this._pcScreenHovered) {
      this.parallaxDampZones.setActive(PARALLAX_DAMP_ZONE_IDS.pcMonitor);
      return;
    }

    const meshId = this.parallaxDampZones.hitTest(
      this.raycaster,
      this.pointer,
      this.camera,
      this.current
    );
    this.parallaxDampZones.setActive(meshId);
  }

  _shouldEngageScrollCapture() {
    if (!this.scrollCapture.isActive) return false;

    const meshId = this.scrollCapture.activeMeshId;

    // CRT: capture wheel only while zoomed so MySpace can scroll.
    if (meshId === SCROLL_CAPTURE_MESH_IDS.finalPcScreen) {
      return (
        this.current === 1 &&
        ((this.focusBlend ?? 0) > 0.02 || Boolean(this.cameraRig?.state?.isZoomed))
      );
    }

    // Sidekick must NEVER steal turntable wheel. The phone is a huge hit target;
    // hard-blocking here trapped the camera on/near the stop and made ring
    // travel feel broken. Click still opens/closes via pointerdown.
    if (meshId === SCROLL_CAPTURE_MESH_IDS.sidekick) {
      return false;
    }
    if (meshId === SCROLL_CAPTURE_MESH_IDS.travelPack) {
      return false;
    }

    return Boolean(this.scrollCapture.activeDomKey);
  }

  _getDesktopInstance() {
    return this.vignettes[1]?.instance ?? null;
  }

  _getActiveInstance() {
    return this.vignettes[this.current]?.instance ?? null;
  }

  _getDisplayStageDegrees() {
    // Stage degrees follow the camera's orbital angle around the ring.
    const theta = this.cameraRig?.state?.theta ?? 0;
    return THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(theta), 360);
  }

  _onVignetteClick = (event) => {
    if (this.locked) return;
    if (this._ignoreNextVignetteClick) {
      this._ignoreNextVignetteClick = false;
      event.stopImmediatePropagation();
      return;
    }
    this.vignetteClick?.handleClick?.(event);
  };

  /** Sidekick / travel pack open-close + camera zoom as one toggle. */
  _toggleIndexedZoom(index) {
    const rig = this.cameraRig;
    if (!rig || rig.state.index !== index) return;
    if (rig.state.isZoomed) {
      rig.zoomOut();
    } else {
      rig.zoomIn(index);
    }
    this._syncCameraRigZoom();
  }

  _toggleSidekickZoom() {
    this._toggleIndexedZoom(2);
  }

  _toggleTravelZoom() {
    this._toggleIndexedZoom(3);
  }

  _onPointerDown = (event) => {
    if (this.locked) return;
    this._updateHoverFromClient(event.clientX, event.clientY);

    const onSidekick =
      this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.sidekick;
    const onTravel =
      this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.travelPack;
    const onDesktop =
      this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.finalPcScreen;
    const rigZoomed = Boolean(this.cameraRig?.state?.isZoomed);

    // Sidekick owns its full zoom ↔ slide toggle here. Letting pointerdown zoom out
    // and the later click zoom back in made open/close feel random.
    // When the SMS compose face is up, LCD hits go to the form instead of closing.
    if (onSidekick && this.cameraRig?.state?.index === 2) {
      this.waterCursor?.setPressed(true);
      const sidekick = this.vignettes[2]?.instance;
      if (
        rigZoomed &&
        sidekick?.handlePointerDown?.(this.scrollCapture.lastHit)
      ) {
        this._ignoreNextVignetteClick = true;
        event.stopImmediatePropagation();
        return;
      }
      this._toggleSidekickZoom();
      this._ignoreNextVignetteClick = true;
      event.stopImmediatePropagation();
      return;
    }

    if (onTravel && this.cameraRig?.state?.index === 3) {
      this.waterCursor?.setPressed(true);
      this._toggleTravelZoom();
      this._ignoreNextVignetteClick = true;
      event.stopImmediatePropagation();
      return;
    }

    if (onDesktop && (this.focusBlend > 0.02 || rigZoomed)) {
      const mySpace = this.hud.getMySpaceScreen();
      const handled = this.scrollCapture.handlePointerDown();
      if (handled) {
        event.stopImmediatePropagation();
        return;
      }
      if (mySpace?.xpBoot?.isBooting) {
        event.stopImmediatePropagation();
        return;
      }
      if (mySpace?.xpBoot?.canStartBoot) {
        this._tryStartDesktopBoot();
        event.stopImmediatePropagation();
        return;
      }
      event.stopImmediatePropagation();
      return;
    }

    if (this.scrollCapture.handlePointerDown()) {
      this.waterCursor?.setPressed(true);
      if (onDesktop && this.cameraRig?.state?.index === 1) {
        if (this.cameraRig.state.isZoomed) {
          // Already zoomed — start boot / MySpace (don't wait for a second click).
          this._tryStartDesktopBoot();
          event.stopImmediatePropagation();
          return;
        }
        // First click: vignetteClick zooms in; _syncCameraRigZoom starts boot when settled.
        return;
      }
      return;
    }

    if (this.focusBlend > 0.02 || rigZoomed) {
      this.cameraRig?.zoomOut?.();
      this._unfocusVignette();
      this._syncCameraRigZoom();
      this._ignoreNextVignetteClick = true;
    }
  };

  _onPointerUp = () => {
    this.waterCursor?.setPressed(false);
  };

  _onPointerLeave = (event) => {
    this.scrollCapture.clearPointer();
    this._screenHover = false;
    this._pcScreenHovered = false;
    this.parallaxDampZones?.setActive(null);
    if (!this.waterCursor) {
      this.canvas.style.cursor = "default";
    }
    this._setScrollCaptureBlendTarget(false);
  };


  /** Dev helper — scroll-capture hover state + registered targets. */
  debugScrollCapture() {
    return {
      ...this.scrollCapture.debugState(),
      captureBlend: this.captureBlend,
      captureBlendTarget: this._captureBlendTarget,
      parallaxDamp: this.parallaxDampZones?.debugState?.() ?? null,
      focusBlend: this.focusBlend,
      focusPhase: this._focusPhase,
      locked: this.locked,
      current: this.current,
      introComplete: this.introComplete,
      cameraSettled: Boolean(this.cameraRig?.state?.isSettled),
      cameraZoomed: Boolean(this.cameraRig?.state?.isZoomed)
    };
  }

  _runIntro() {
    // Fader stays until StageLoadGate dismisses it (assets + fog bake + min duration).
  }

  _onResize = () => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
    this.neon?.setSize?.(this.renderer);
    this.hud.updateMySpacePanelForVignette(this.current);
    this.waterCursor?.resize(w, h);
    if (this.cameraRig?.state?.index === 2) {
      this.vignettes[2]?.instance?.invalidateRestPose?.();
      this._fitSidekickRestPose(true);
    }
  };

  _applyVignetteMotion(t) {
    const focus = this.focusBlend;
    const transitioning = Boolean(this.cameraRig && !this.cameraRig.state.isSettled);

    this.vignettes.forEach((vignette, index) => {
      vignette.instance?.updateFocus?.(this.camera, index === this.current ? focus : 0, {
        isActive: index === this.current,
        transitioning
      });
    });

    const sidekick = this.vignettes[2]?.instance;
    const travel = this.vignettes[3]?.instance;
    const active = this._getActiveInstance();

    if (active !== sidekick && active !== travel) {
      active?.update?.(t);
    }

    if (sidekick?._aligned) {
      sidekick.update(t);
    }
    if (travel?._aligned) {
      travel.update(t);
    }
  }

  /** Post-intro desktop effects — deferred until integration + settle grace complete. */
  _shouldRunIntroHeavyEffects() {
    return (
      this.introComplete &&
      !this._introIntegrationActive &&
      this._introHeavyEffectsAfter > 0 &&
      performance.now() >= this._introHeavyEffectsAfter
    );
  }

  _animate() {
    this.frameBudget?.begin();
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;

    const desktop = this.vignettes[1]?.instance;
    if (desktop?.pcRoot && desktop._pcSceneReady) {
      desktop._ensurePowerLed?.();
      desktop.powerLed?.update(t);
    }

    // Content-matched CRT spill — skip while the boot canvas is still black /
    // mid warm-up (no useful color yet; sampling every frame costs smoothness).
    const crtLit =
      desktop?.mySpace?.isPoweredOn ||
      desktop?.mySpace?.monitorLedOn;
    if (crtLit || this._shouldRunIntroHeavyEffects()) {
      desktop?.screenLightRig?.update();
    }

    if (this._shouldRunIntroHeavyEffects()) {
      desktop?.updateCrtGlassReflection?.(
        this.liveEnv,
        this.scene,
        this.spotLight,
        this.spotTarget,
        { force: Boolean(desktop?._pendingCrtEnvRefresh) }
      );
      if (desktop?._pendingCrtEnvRefresh) {
        desktop._pendingCrtEnvRefresh = false;
      }
    }

    this.animFns.forEach((fn) => fn(t));

    this.parallaxDampZones?.update(dt);
    this.cameraRig?.parallax?.setStrength?.(this.parallaxDampZones?.scale ?? 1);
    this.cameraRig?.update(dt);
    this._tickIntroFromCameraRig();
    this._syncCameraRigIndex();
    this._syncCameraRigZoom();
    this._aimPovSpotlight();

    if (this.introComplete) {
      this._applyVignetteMotion(t);
    }
    this._tickModelReveal(dt);
    this._tickPostGrainStrength(dt);
    this._tickNeon(t);
    this._tickVolumetricFog(dt);

    if (this.ui.readout) {
      const deg = this._getDisplayStageDegrees();
      this.ui.readout.textContent = `STAGE ${deg.toFixed(1).padStart(5, "0")}°`;
    }

    // Opaque depth → volumetric (FogDepthCapture) + legacy soft-fade sheet.
    const fogT = performance.now();
    tagFrame("fog-depth");
    this.neon?.captureFogDepth?.(this.renderer, this.scene, this.camera);
    if (this.volumetricFog && this.neon?.depthCapture?.depthTexture) {
      this.volumetricFog.setSceneDepth(this.neon.depthCapture.depthTexture, {
        packed: true
      });
      // Four live neon PointLights — intensity already tracks neonProximity in NeonSystem.update.
      if (this.volumetricFog.enabled) {
        const lights = this.neon.stopLights?.map((s) => s.light) ?? [];
        this.volumetricFog.setLights(lights);
      }
    }
    tagFrame(`fog-depth:${Math.round(performance.now() - fogT)}ms`);

    const beautyT = performance.now();
    tagFrame("beauty");
    this.post.render(this.scene, this.camera, t, {
      grainStrength: this._postGrainStrength
    });
    tagFrame(`beauty:${Math.round(performance.now() - beautyT)}ms`);
    this.waterCursor?.render();
    this.frameBudget?.end(dt);
    requestAnimationFrame(this._animate);
  }
}
