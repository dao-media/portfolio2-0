import * as THREE from "three";
import gsap from "gsap";
import { HUDController } from "../ui/HUDController.js";
import { DesktopVignette, desktopVignetteMeta } from "./vignettes/DesktopVignette.js";
import { monolithVignette, addDegreeLabels } from "./stage/placeholderVignettes.js";
import { SidekickVignette, sidekickVignetteMeta } from "./vignettes/SidekickVignette.js";
import { PostPass } from "./stage/PostPass.js";
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
  CAM_REST_BACK,
  LOOK,
  AMBIENT_INTENSITY,
  HEMI_INTENSITY,
  SPOT_HEIGHT_M,
  SPOT_INTENSITY,
  SPOT_ANGLE,
  SPOT_PENUMBRA,
  SPOT_DISTANCE,
  SPOT_DECAY,
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
  INTRO_POST_LAND_FETCH_MS,
  INTRO_POST_LAND_WARM_MS,
  INTRO_POST_LAND_CURSOR_MS,
  vignetteStageDegrees,
  placeOnStage,
  STAGE_RADIUS,
  STAGE_BG,
  EXPOSURE
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
import { setGroupRenderOpacity } from "./stage/stageModelReveal.js";
import { STAGE_FLOOR_Y, measureBlockoutReferenceBounds, measureSceneBounds, snapAllGroupsToFloor, snapGroupToFloor } from "./vignettes/pcSceneBlockout.js";
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

export class StageExperience {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.isCoarse = window.matchMedia("(pointer: coarse)").matches;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.isCoarse ? 1.5 : 1.75);

    this.hud = new HUDController();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.animFns = [];
    this.current = 0;
    this.locked = false;
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
      0.1,
      120
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
    this._introModelsFetchStarted = false;

    this.environment = new THREE.Group();
    this.scene.add(this.environment);

    this.world = new THREE.Group();
    this.environment.add(this.world);
    addDegreeLabels(this.world);
    this.environment.position.y = 0;

    this._buildEnvironment();
    this._buildLighting();
    this.liveEnv = new LiveStageEnvironment(this.renderer);
    this.vignettes = this._buildVignettes();
    this._initCameraRig();
    this._updatePlaceholderVisibility(0);

    if (import.meta.env.DEV) {
      window.__stage = this;
    }

    this.post = new PostPass(
      this.renderer,
      this.pixelRatio,
      this.reducedMotion ? 0.03 : 0.05
    );

    // Cursor waits until the pageload drop is done — init cost hitching the open beat.
    this.waterCursor = null;

    this._bindUi();
    this._bindInput();
    this._mountPovSpotlight();
    this._setActiveVignette(0);
    this._runIntro();

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
    // Lock the turntable: ring travel is the camera orbiting, not the world spinning.
    this.world.rotation.y = 0;

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
    this.camera.add(this.spotLight);
    this.spotLight.target = this.spotTarget;
    configureSpotShadow(this.spotLight);
  }

  _aimPovSpotlight() {
    if (!this.spotTarget) return;
    this.camera.updateMatrixWorld(true);
    _SPOT_AIM_LOCAL.copy(this.cameraRig?.state?.lookAt ?? LOOK);
    this.camera.worldToLocal(_SPOT_AIM_LOCAL);
    this.spotTarget.position.copy(_SPOT_AIM_LOCAL);
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
    return this.debugFloorHeights();
  }

  /** Dev helper — Sidekick motion state. */
  debugSidekick() {
    const sidekick = this.vignettes[2]?.instance;
    return {
      current: this.current,
      aligned: sidekick?._aligned ?? false,
      isOpen: sidekick?.isOpen ?? false,
      swiveling: Boolean(sidekick?._swivelTween),
      sidekickRootPosition: sidekick?.sidekickRoot?.position?.toArray?.() ?? null,
      restPoseReady: sidekick?._restPoseReady ?? false,
      sidekickScale: sidekick?.sidekickRoot?.scale?.x ?? null
    };
  }

  _snapAllVignettesToFloor(force = false) {
    if (!force && !this.introComplete) {
      this._pendingFloorSnap = true;
      return;
    }
    snapAllGroupsToFloor(this.vignettes.map((vig) => vig.group));
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
    window.setTimeout(() => this._startIntroModelFetches(), INTRO_POST_LAND_FETCH_MS);
    window.setTimeout(() => this._warmIntroAssetsDeferred(), INTRO_POST_LAND_WARM_MS);
    window.setTimeout(() => this._ensureWaterCursor(), INTRO_POST_LAND_CURSOR_MS);
  }

  _ensureWaterCursor() {
    if (this.waterCursor || this.reducedMotion) return;
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

  /** Kick PC + Sidekick GLB downloads after the aerial hold / early drop. */
  _startIntroModelFetches() {
    if (this._introModelsFetchStarted) return;
    this._introModelsFetchStarted = true;
    this.vignettes[1]?.instance?.startModelLoad?.();
    this.vignettes[2]?.instance?.startModelLoad?.();
  }

  /** Texture decode during descent — must not wait for hold flags or motion complete. */
  _warmIntroAssetsDeferred() {
    if (this._introAssetsWarmed) return;
    this._introAssetsWarmed = true;
    const desktop = this.vignettes[1]?.instance;
    const idle = window.requestIdleCallback;
    const warm = () => void desktop?.warmIntroAssets?.(this.renderer);
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
    const yieldFrame = (frames) => this._yieldFrame(frames);
    let stillHolding = false;

    try {
      await this._waitForIntegrateWindow();
      await yieldFrame(INTRO_MATERIAL_YIELD_FRAMES);

      await desktop?.integrateAfterIntro?.({
        yieldFrame,
        revealHidden: true,
        batchSize: INTRO_MATERIAL_BATCH_SIZE,
        yieldFrames: INTRO_MATERIAL_YIELD_FRAMES
      });
      await yieldFrame(INTRO_MATERIAL_YIELD_FRAMES);

      await sidekick?.integrateAfterIntro?.({
        yieldFrame,
        revealHidden: true,
        deferScreenTextureMs: INTRO_SIDEKICK_BAKE_DELAY_MS
      });
      await yieldFrame();

      stillHolding = Boolean(desktop?._holdForIntro || sidekick?._holdForIntro);

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

  /** CRT env capture — runs well after models are visible; never on the settle frame. */
  _flushIntroDeferredWork() {
    const desktop = this.vignettes[1]?.instance;
    if (!desktop?.updateCrtGlassReflection) return;
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

  /** Grain ramps in after land — never mid ease-out (avoids a composite hitch on settle). */
  _tickPostGrainStrength(dt) {
    const cappedDt = Math.min(Math.max(dt, 0), 1 / 24);
    let target = 0;
    if (this._introMotionComplete) {
      target = 1;
    }
    const rate = 1 / 2.4;
    if (this._postGrainStrength < target) {
      this._postGrainStrength = Math.min(target, this._postGrainStrength + cappedDt * rate);
    } else if (this._postGrainStrength > target) {
      this._postGrainStrength = Math.max(target, this._postGrainStrength - cappedDt * rate * 2);
    }
  }

  /** Fade PC + Sidekick in after post-settle integration mounts them hidden. */
  _tickModelReveal(dt) {
    const desktopRoot = this.vignettes[1]?.instance?.pcRoot;
    const sidekickRoot = this.vignettes[2]?.instance?.sidekickRoot;
    if (!desktopRoot && !sidekickRoot) return;

    // Only reveal once intro motion is done and at least one model is mounted.
    if (!this._introMotionComplete) return;
    // Don't start the fade while materials are still being prepared off-screen.
    if (this._introIntegrationActive && this._modelRevealOpacity <= 0) return;

    const cappedDt = Math.min(Math.max(dt, 0), 1 / 24);
    const duration = 1.35;
    const prev = this._modelRevealOpacity;
    this._modelRevealOpacity = Math.min(1, this._modelRevealOpacity + cappedDt / duration);
    if (this._modelRevealOpacity === prev && prev >= 1) return;

    const opacity = this._modelRevealOpacity;
    if (desktopRoot) setGroupRenderOpacity(desktopRoot, opacity);
    if (sidekickRoot) setGroupRenderOpacity(sidekickRoot, opacity);
  }

  _tickDesktopRestAnchor() {
    const desktop = this.vignettes[1]?.instance;
    if (!desktop?.pcRoot) return;

    // Orbital camera: keep the PC on its ring stop. The old rest-anchor bake
    // pushed the model toward a fixed +Z POV and flings it off-frame now.
    desktop.applyRestAnchorBlend(0);
  }

  _buildVignettes() {
    const defs = [monolithVignette, desktopVignetteMeta, sidekickVignetteMeta];
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
          deferModelLoad: !this.reducedMotion,
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
    if (!this.cameraRig || !this.introComplete) return;
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
    if (!this.introComplete) return;
    if (!this.cameraRig.state.isSettled) return;
    this._prepareForVignetteTransition(this.current);
    this.cameraRig.advance(Math.sign(steps));
  }

  next = (options) => this.advance(1, options);
  prev = (options) => this.advance(-1, options);

  _bindInput() {
    this._onWheel = (event) => {
      if (event._stageWheelHandled) return;
      event._stageWheelHandled = true;

      this._updateHoverFromClient(event.clientX, event.clientY);

      const blend = this.captureBlend;

      if (this.scrollCapture.isActive) {
        if (this.scrollCapture.activeMeshId) {
          event.preventDefault();
          this.scrollCapture.handleWheel(event, 1);
          return;
        }

        if (this.scrollCapture.activeDomKey) {
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
      if (!this.waterCursor) {
        const cursorMode = hovering
          ? "pointer"
          : this._pcScreenHovered
            ? this.focusBlend > 0.02
              ? "pointer"
              : "zoom-in"
            : onSidekick
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

  /** Scroll-capture wheel block — PC only while zoomed in; Sidekick blocks turntable only. */
  _shouldEngageScrollCapture() {
    if (!this.scrollCapture.isActive) return false;
    if (
      this._pcScreenHovered &&
      this.current === 1 &&
      (this.focusBlend ?? 0) <= 0.02
    ) {
      return false;
    }
    return true;
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
    if (this._ignoreNextVignetteClick) {
      this._ignoreNextVignetteClick = false;
      event.stopImmediatePropagation();
      return;
    }
    this.vignetteClick?.handleClick?.(event);
  };

  /** Sidekick open/close + camera zoom as one toggle — never split across pointerdown/click. */
  _toggleSidekickZoom() {
    const rig = this.cameraRig;
    if (!rig || rig.state.index !== 2) return;

    // Slide open/close is driven solely by _syncCameraRigZoom when isZoomed flips.
    if (rig.state.isZoomed) {
      rig.zoomOut();
    } else {
      rig.zoomIn(2);
    }
    this._syncCameraRigZoom();
  }

  _onPointerDown = (event) => {
    this._updateHoverFromClient(event.clientX, event.clientY);

    const onSidekick =
      this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.sidekick;
    const onDesktop =
      this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.finalPcScreen;
    const rigZoomed = Boolean(this.cameraRig?.state?.isZoomed);

    // Sidekick owns its full zoom ↔ slide toggle here. Letting pointerdown zoom out
    // and the later click zoom back in made open/close feel random.
    if (onSidekick && this.cameraRig?.state?.index === 2) {
      this.waterCursor?.setPressed(true);
      this._toggleSidekickZoom();
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.ui.fader?.classList.add("gone");
      });
    });
  }

  _onResize = () => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
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
    const active = this._getActiveInstance();

    if (active !== sidekick) {
      active?.update?.(t);
    }

    if (sidekick?._aligned) {
      sidekick.update(t);
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

    // Vignettes never move — only the camera rig writes travel transforms.
    this.world.rotation.y = 0;
    this.parallaxDampZones?.update(dt);
    this.cameraRig?.parallax?.setStrength?.(this.parallaxDampZones?.scale ?? 1);
    this.cameraRig?.update(dt);
    this._tickIntroFromCameraRig();
    this._syncCameraRigIndex();
    this._syncCameraRigZoom();
    this._aimPovSpotlight();

    if (this.introComplete) {
      this._tickDesktopRestAnchor();
      this._applyVignetteMotion(t);
    }
    this._tickModelReveal(dt);
    this._tickPostGrainStrength(dt);

    if (this.ui.readout) {
      const deg = this._getDisplayStageDegrees();
      this.ui.readout.textContent = `STAGE ${deg.toFixed(1).padStart(5, "0")}°`;
    }

    this.post.render(this.scene, this.camera, t, {
      grainStrength: this._postGrainStrength
    });
    this.waterCursor?.render();
    requestAnimationFrame(this._animate);
  }
}
