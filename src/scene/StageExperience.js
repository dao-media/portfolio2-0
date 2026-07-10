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
  CAM_TRANSITION_PULLBACK,
  CAM_REST_BACK,
  CAM_REST_OFFSET_X,
  PARALLAX_CAM_X,
  PARALLAX_CAM_Y,
  LOOK,
  AMBIENT_INTENSITY,
  HEMI_INTENSITY,
  SPOT_HEIGHT_M,
  SPOT_INTENSITY,
  SPOT_ANGLE,
  SPOT_PENUMBRA,
  SPOT_DISTANCE,
  SPOT_DECAY,
  WHEEL_MIN_DELTA,
  WHEEL_GESTURE_IDLE_MS,
  SCROLL_CAPTURE_BLEND_IN,
  SCROLL_CAPTURE_BLEND_OUT,
  SCROLL_CAPTURE_WHEEL_ON,
  SCROLL_CAPTURE_WHEEL_OFF,
  PARALLAX_CAPTURE_OUT,
  PARALLAX_FOLLOW,
  PARALLAX_POST_TRANSITION_FOLLOW,
  PARALLAX_POST_TRANSITION_MS,
  INTRO_SETTLE_GRACE_MS,
  INTRO_HANDOFF_MS,
  INTRO_HEAVY_EFFECTS_DELAY_MS,
  FOCUS_BLEND_THRESHOLD,
  FOCUS_ENTER_DURATION,
  FOCUS_EXIT_DURATION,
  DESKTOP_FOCUS_CAM_PULL,
  DESKTOP_REST_EXTRA_BACK,
  VIGOROUS_SCROLL_MS,
  WHEEL_REVERSE_INTERRUPT_DELTA,
  TRANSITION_COMMIT_MS,
  TRANSITION_COMMIT_PROGRESS,
  TRANSITION_DURATION,
  TRANSITION_VIGOROUS_SPEED,
  vignetteAnchorRotation,
  vignetteStageDegrees,
  rotationDeltaToAnchor,
  placeOnStage,
  STAGE_RADIUS,
  STAGE_BG,
  EXPOSURE
} from "./stage/constants.js";
import {
  normalizeWheelDelta,
  smoothstep,
  parallaxTargetFromClient,
  pointerNdcFromClient,
  resolveInterruptedVignetteIndex,
  sanitizeParallax,
  sanitizeWorldRotation,
  sanitizeCameraPose,
  finite
} from "./stage/stageScrollUtils.js";
import {
  STAGE_FOCUS_PHASE,
  canEnterDesktopFocus,
  canStartDesktopBoot,
  shouldBlockScrollCaptureBlend
} from "./stage/stageAnimationPolicy.js";
import {
  INTRO_MODEL_INTEGRATE_TRACK,
  INTRO_MODEL_REVEAL_TRACK,
  INTRO_TRACK_DESCENT,
  INTRO_TRACK_SETTLE_MS
} from "./stage/stageCameraTrack.js";
import { setGroupRenderOpacity } from "./stage/stageModelReveal.js";
import {
  resolveParallaxFollowMode,
  resolveTransitionParallaxDesired,
  tickParallaxState,
  stepIntroDescent,
  introDescentHandoffOffset
} from "./stage/stageParallaxMotion.js";
import { STAGE_FLOOR_Y, measureBlockoutReferenceBounds, measureSceneBounds, snapAllGroupsToFloor, snapGroupToFloor } from "./vignettes/pcSceneBlockout.js";
import { WaterCursor } from "../cursor/WaterCursor.js";
import { CameraRig } from "./camera/CameraRig.js";
import { buildVignetteRing } from "./camera/ringLayout.js";
import { createScrollAdvance } from "./camera/scrollAdvance.js";
import { createVignetteClick } from "./camera/vignetteClick.js";

/** Spring turntable — fixed POV; world rotates vignettes around the ring. */
const LOOK_AT_HEIGHT = LOOK.y;
const CAMERA_REST_HEIGHT = CAM_Y;
const CAMERA_PAGELOAD_HEIGHT = CAM_Y + INTRO_TRACK_DESCENT;
const CAMERA_ZOOM_DISTANCE = 4.2;
const CAMERA_ZOOM_HEIGHT = 2.15;

/** @deprecated — use INTRO_TRACK_DESCENT; kept for debug readouts. */
const INTRO_DESCENT = INTRO_TRACK_DESCENT;

/** Half-strength ease-out — linear blended with power2.out for vigorous scroll. */
function easeOutHalf(t) {
  const eased = 1 - (1 - t) * (1 - t);
  return t + (eased - t) * 0.5;
}

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
    this._introStartedAt = 0;
    this._postGrainStrength = 0;
    this._modelRevealOpacity = 0;
    this._introDuration = this.reducedMotion ? 600 : 2600;
    this._introMotionDuration = this._introDuration + INTRO_TRACK_SETTLE_MS;
    this._pendingFloorSnap = false;
    this._lastImpulseAt = 0;
    this._lastImpulseDir = 0;
    this._wheelGestureOpen = true;
    this._wheelIdleTimer = 0;
    this._transitionScrollDir = 0;
    this._transitionStartedAt = 0;
    this._transitionReversing = false;
    this._opposingScrollAccum = 0;
    this._animTarget = null;
    this._transitionFromIndex = null;
    this._transition = { progress: 0 };
    this._transitionTl = null;
    this._transitionRotFrom = null;
    this._transitionRotTo = null;
    this._touchCapture = false;
    this._screenFrustum = new THREE.Frustum();
    this._projScreenMatrix = new THREE.Matrix4();
    this._screenHover = false;
    this._pcScreenHovered = false;

    this.scrollCapture = new StageScrollCapture();

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
    this._introRestQuat = new THREE.Quaternion();
    this.scene.add(this.camera);

    this.parallax = { x: 0, y: 0, tx: 0, ty: 0 };
    this.focusBlend = 0;
    this._focusPhase = STAGE_FOCUS_PHASE.IDLE;
    this._focusTween = null;
    /** Legacy flag — true while desktop focus dolly is active. */
    this._focusDollyIn = false;
    this._bootQueuePending = false;
    this.captureBlend = 0;
    this._captureBlendTarget = false;
    this._captureBlendTween = null;
    /** Parallax offset frozen when the pointer enters a no-scroll zone. */
    this._parallaxLock = { x: 0, y: 0 };
    /** 0 = follow cursor; 1 = locked at _parallaxLock (realtime eased). */
    this.parallaxInfluence = 0;
    this._lastParallaxDt = 1 / 60;
    this._parallaxInfluenceTarget = 0;
    this._lastPointer = {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.5
    };
    this._transitionParallaxFrom = null;
    this._transitionFocusFrom = 0;
    this._parallaxSettleUntil = 0;
    this._introHandoffUntil = 0;
    this._introSettleUntil = 0;
    this._introHeavyEffectsAfter = 0;
    this._introIntegrationActive = false;
    this._introDeferredRunning = false;
    this._introAssetsWarmed = false;
    this._introDescentCurrent = INTRO_TRACK_DESCENT;
    this._descentAtHandoff = 0;
    this._introHandoffStart = 0;

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

    this.waterCursor = WaterCursor.tryCreate({
      renderer: this.renderer,
      ticker: gsap.ticker
    });

    this._bindUi();
    this._bindInput();
    this._mountPovSpotlight();
    this._setActiveVignette(0);
    this._runIntro();

    window.addEventListener("resize", this._onResize);
    this._onResize();
    this.clock = new THREE.Clock();
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  /**
   * Spring turntable camera — same ring path as before:
   * vignettes stay on STAGE_RADIUS; world.rotation.y springs so each stop
   * lands at the fixed +Z POV (LOOK). Camera only moves for pageload height
   * and click-to-zoom pull.
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

    this.cameraRig = new CameraRig(this.camera, this.ring, {
      world: this.world,
      lookAt: LOOK.clone(),
      // Centered on the vignette stop (no legacy left offset).
      restPosition: new THREE.Vector3(0, CAM_Y, CAM_Z + CAM_REST_BACK),
      pageloadHeight: this.reducedMotion ? CAMERA_REST_HEIGHT : CAMERA_PAGELOAD_HEIGHT,
      zoomDistance: CAMERA_ZOOM_DISTANCE,
      zoomHeight: CAMERA_ZOOM_HEIGHT,
      startIndex: 0,
      parallax: this.reducedMotion ? { maxOffset: 0, omega: 7 } : { maxOffset: 0.35, omega: 7 }
    });

    // Route scroll through StageExperience so vignette leave hooks still run.
    this.cameraRig.scrollAdvance = createScrollAdvance({
      onAdvance: (dir) => this.advance(dir)
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
      // Re-fit after turntable lands — old orbit-era rest pose is invalid.
      this.vignettes[2]?.instance?.invalidateRestPose?.();
      this._fitSidekickRestPose(true);
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
    this._refreshParallaxTarget();
  }

  _completeIntroMotion() {
    if (this._introMotionComplete) return;
    this._introTrackT = 1;
    this._introMotionComplete = true;
    this.introComplete = true;
    this.introRig.descent = 0;
    this._descentAtHandoff = 0;
    this._introSettleUntil = performance.now() + INTRO_SETTLE_GRACE_MS;
    this._introHandoffUntil = performance.now() + INTRO_HANDOFF_MS;
    this._warmIntroAssetsDeferred();
    // Models may have finished loading after the first integrate pass — retry.
    this._scheduleIntroDeferredWork();
  }

  /** Mark intro done once the spring pageload descent settles. */
  _tickIntroFromCameraRig() {
    if (this._introMotionComplete || !this.cameraRig) return;
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

    if (this._introTrackT >= INTRO_MODEL_INTEGRATE_TRACK && !this._introIntegrateScheduled) {
      this._introIntegrateScheduled = true;
      this._scheduleIntroDeferredWork();
    }

    if (this._introTrackLinear >= 0.84 && !this._introContentReady) {
      this._onIntroContentReady();
    }

    if (!this.cameraRig._introActive && s.isSettled) {
      this._completeIntroMotion();
    }
  }

  /** Texture decode + GPU warm — after the POV lands, not during ground settle. */
  _warmIntroAssetsDeferred() {
    if (this._introAssetsWarmed) return;
    this._introAssetsWarmed = true;
    const desktop = this.vignettes[1]?.instance;
    const idle = window.requestIdleCallback;
    const warm = () => void desktop?.warmIntroAssets?.(this.renderer);
    if (idle) {
      idle(warm, { timeout: 1200 });
    } else {
      window.setTimeout(warm, 0);
    }
  }

  /** Wait until the intro track reaches the silent-integration window. */
  async _waitForIntegrateWindow() {
    while (!this._introMotionComplete && this._introTrackT < INTRO_MODEL_INTEGRATE_TRACK) {
      await this._yieldFrame();
    }
  }

  _scheduleIntroDeferredWork() {
    void this._releaseIntroDeferredWork();
  }

  /** Yield the main thread for one display frame between heavy intro integration steps. */
  _yieldFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  /** Heavy vignette integration — chunked across frames after the resting POV is stable. */
  async _releaseIntroDeferredWork() {
    if (this._introDeferredRunning) return;
    this._introDeferredRunning = true;
    this._introIntegrationActive = true;

    const desktop = this.vignettes[1]?.instance;
    const sidekick = this.vignettes[2]?.instance;
    const yieldFrame = () => this._yieldFrame();
    let stillHolding = false;

    try {
      await this._waitForIntegrateWindow();
      await yieldFrame();

      await desktop?.integrateAfterIntro?.({ yieldFrame, revealHidden: true });
      await yieldFrame();

      await sidekick?.integrateAfterIntro?.({ yieldFrame, revealHidden: true });
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

  /** Grain ramps in during the descent — always via RT composite, never a path switch. */
  _tickPostGrainStrength(dt) {
    const cappedDt = Math.min(Math.max(dt, 0), 1 / 24);
    let target = 0;
    if (this._introTrackT >= 0.78 || this._introMotionComplete) {
      target = 1;
    }
    const rate = 1 / 2.4;
    if (this._postGrainStrength < target) {
      this._postGrainStrength = Math.min(target, this._postGrainStrength + cappedDt * rate);
    } else if (this._postGrainStrength > target) {
      this._postGrainStrength = Math.max(target, this._postGrainStrength - cappedDt * rate * 2);
    }
  }

  /** Fade PC + Sidekick in during the second half of the intro track. */
  _tickModelReveal(dt) {
    const desktopRoot = this.vignettes[1]?.instance?.pcRoot;
    const sidekickRoot = this.vignettes[2]?.instance?.sidekickRoot;
    if (!desktopRoot && !sidekickRoot) return;

    const ready =
      this._introTrackT >= INTRO_MODEL_REVEAL_TRACK || this._introMotionComplete;
    if (!ready) return;

    const cappedDt = Math.min(Math.max(dt, 0), 1 / 24);
    const duration = 1.75;
    this._modelRevealOpacity = Math.min(
      1,
      this._modelRevealOpacity + cappedDt / duration
    );
    const opacity = this._modelRevealOpacity;
    if (desktopRoot) setGroupRenderOpacity(desktopRoot, opacity);
    if (sidekickRoot) setGroupRenderOpacity(sidekickRoot, opacity);
  }

  /** Advance pageload → ground-rest track; content loads before motion finishes. */
  _tickIntro(dt) {
    if (this._introMotionComplete) return;

    if (this._introStartedAt === 0) {
      this._introStartedAt = performance.now();
      this._introTrackLinear = 0;
    }

    const cappedDt = Math.min(Math.max(dt, 0), 1 / 20);
    const durationSec = this._introMotionDuration / 1000;
    this._introTrackLinear = Math.min(1, this._introTrackLinear + cappedDt / durationSec);
    this._introTrackT = this._introTrackLinear;

    this._introDescentCurrent = stepIntroDescent(
      this._introDescentCurrent,
      this._introTrackLinear,
      INTRO_TRACK_DESCENT,
      cappedDt
    );
    this.introRig.descent = this._introDescentCurrent;

    if (this._introTrackT >= INTRO_MODEL_INTEGRATE_TRACK && !this._introIntegrateScheduled) {
      this._introIntegrateScheduled = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this._scheduleIntroDeferredWork();
        });
      });
    }

    if (this._introTrackLinear >= 0.84 && !this._introContentReady) {
      this._onIntroContentReady();
    }

    if (this._introTrackLinear >= 1) {
      this._completeIntroMotion();
    }
  }

  /**
   * Sample the implied ground track — single path from aerial pageload to resting POV.
   * Cursor parallax is full strength for the entire descent.
   */
  _applyCameraFromTrack() {
    const y = CAM_Y + this._introDescentCurrent;
    this.camera.position.set(CAM_REST_OFFSET_X, y, CAM_Z + CAM_REST_BACK);
    this.camera.quaternion.copy(this._introRestQuat);

    const travelScale = this._parallaxTravelScale();
    if (travelScale > 0.001) {
      this.camera.translateX(this.parallax.x * travelScale * PARALLAX_CAM_X);
      this.camera.translateY(this.parallax.y * travelScale * PARALLAX_CAM_Y);
    }

    this._aimPovSpotlight();
  }

  /** Lock the resting look direction so the track lands with the same aim as parallax rest. */
  _cacheIntroRestRotation() {
    this.camera.position.set(CAM_REST_OFFSET_X, CAM_Y, CAM_Z + CAM_REST_BACK);
    this.camera.lookAt(LOOK);
    this._introRestQuat.copy(this.camera.quaternion);
    if (!this.spotLight) {
      this._mountPovSpotlight();
    }
    this._applyCameraFromTrack();
  }

  _introDescentHandoffY() {
    if (this._descentAtHandoff <= 1e-6 || this._introHandoffStart <= 0) return 0;
    const offset = introDescentHandoffOffset(
      performance.now(),
      this._introHandoffStart,
      this._descentAtHandoff
    );
    if (offset <= 1e-6) {
      this._descentAtHandoff = 0;
      this.introRig.descent = 0;
    }
    return offset;
  }

  /**
   * Post-intro camera matches the locked intro settle pose when parallax/focus are idle.
   */
  _restingCameraMatchesIntro() {
    return (
      this.focusBlend < 0.001 &&
      Math.abs(this.parallax.x) < 0.0005 &&
      Math.abs(this.parallax.y) < 0.0005
    );
  }

  /** Per-vignette resting pullback on the travel circle (desktop only). */
  _vignetteRestExtraBack(index, focusBlend = 0) {
    if (index !== 1) return 0;
    const focus = THREE.MathUtils.clamp(focusBlend, 0, 1);
    return DESKTOP_REST_EXTRA_BACK * (1 - focus);
  }

  /** 0 = aligned baseline, 1 = baked desktop rest — tracks vignette travel. */
  _getDesktopRestAnchorBlend() {
    if (this._transitionTl) {
      const from = this._transitionFromIndex ?? this.current;
      const to = this._animTarget ?? this.current;
      const t = THREE.MathUtils.clamp(this._transition.progress, 0, 1);
      if (from !== 1 && to === 1) return t;
      if (from === 1 && to !== 1) return 1 - t;
      if (from === 1 && to === 1) return 1;
      return 0;
    }
    return this.current === 1 ? 1 : 0;
  }

  _tickDesktopRestAnchor() {
    const desktop = this.vignettes[1]?.instance;
    if (!desktop?.pcRoot) return;

    const blend = this._getDesktopRestAnchorBlend();
    if (blend > 0 && !desktop._restAnchorPosition) {
      desktop.ensureRestAnchorBaked(this.camera, this.world, this._anchorY(1));
    }
    desktop.applyRestAnchorBlend(blend);
  }

  /**
   * Blend vignette rest/zoom camera offsets during travel so landings do not snap.
   * @returns {{ restExtra: number, focusPull: number }}
   */
  _resolveTravelCameraOffsets() {
    if (this._transitionTl) {
      const from = this._transitionFromIndex ?? this.current;
      const to = this._animTarget ?? this.current;
      const t = THREE.MathUtils.clamp(this._transition.progress, 0, 1);
      const focusT = THREE.MathUtils.lerp(this._transitionFocusFrom ?? 0, 0, t);
      const restExtra = THREE.MathUtils.lerp(
        this._vignetteRestExtraBack(from, focusT),
        this._vignetteRestExtraBack(to, 0),
        t
      );
      const fromPull = from === 1 ? focusT * DESKTOP_FOCUS_CAM_PULL : 0;
      const toPull = to === 1 ? 0 : 0;
      const focusPull = THREE.MathUtils.lerp(fromPull, toPull, t);
      return { restExtra, focusPull };
    }

    const focus = THREE.MathUtils.clamp(this.focusBlend ?? 0, 0, 1);
    return {
      restExtra: this._vignetteRestExtraBack(this.current, focus),
      focusPull: this.current === 1 ? focus * DESKTOP_FOCUS_CAM_PULL : 0
    };
  }

  /**
   * Parallax travel multiplier — live when settled; frozen during vignette travel.
   * @returns {number}
   */
  _parallaxTravelScale() {
    if (this.reducedMotion) return 0;
    return 1;
  }

  /**
   * Resting POV — camera stays on the fixed rig; the turntable (world) rotates for travel.
   * Parallax is camera-local translation only — never a lookAt / yaw change.
   */
  _applyCameraPose() {
    this._sanitizeMotionState();

    const focus = THREE.MathUtils.clamp(this.focusBlend, 0, 1);
    const restX = CAM_REST_OFFSET_X * (1 - focus);
    let restZ = CAM_REST_BACK * (1 - focus);
    const pullback = this._getTransitionPullback();

    const { restExtra, focusPull } = this._resolveTravelCameraOffsets();
    restZ += focusPull - restExtra;

    const handoffY = this._introDescentHandoffY();
    const restY = CAM_Y + handoffY;

    if (
      !this._focusDollyIn &&
      handoffY < 1e-6 &&
      this._restingCameraMatchesIntro() &&
      pullback < 1e-6 &&
      focus < 0.001 &&
      restExtra < 1e-6 &&
      focusPull < 1e-6
    ) {
      this.camera.position.set(CAM_REST_OFFSET_X, CAM_Y, CAM_Z + CAM_REST_BACK);
      this.camera.quaternion.copy(this._introRestQuat);
      this._aimPovSpotlight();
      return;
    }

    this.camera.position.set(restX, restY, CAM_Z + restZ + pullback);

    if (this._focusDollyIn) {
      this.camera.lookAt(LOOK);
    } else {
      this.camera.quaternion.copy(this._introRestQuat);
      const travelScale = this._parallaxTravelScale();
      if (travelScale > 0.001) {
        this.camera.translateX(this.parallax.x * travelScale * PARALLAX_CAM_X);
        this.camera.translateY(this.parallax.y * travelScale * PARALLAX_CAM_Y);
      }
    }

    this._aimPovSpotlight();
    sanitizeCameraPose(this.camera, LOOK);
  }

  /**
   * Cursor parallax — live during intro, travel, and rest.
   */
  _tickLiveParallax(dt) {
    const travelScale = this._parallaxTravelScale();
    const { tx, ty } = this._parallaxTargetFromClient(this._lastPointer.x, this._lastPointer.y);
    this.parallax.tx = tx;
    this.parallax.ty = ty;

    if (this._introMotionComplete && travelScale <= 0.001) return;

    let desiredX = tx * travelScale;
    let desiredY = ty * travelScale;

    if (this._focusDollyIn) {
      desiredX = 0;
      desiredY = 0;
    }

    const transitioning = Boolean(this._transitionTl && this._transitionParallaxFrom);
    let mode = resolveParallaxFollowMode({
      now: performance.now(),
      introHandoffUntil: this._introHandoffUntil,
      parallaxSettleUntil: this._parallaxSettleUntil,
      frozen: false
    });

    if (transitioning) {
      const blended = resolveTransitionParallaxDesired(
        this._transitionParallaxFrom,
        tx,
        ty,
        this._transition.progress,
        travelScale
      );
      desiredX = blended.desiredX;
      desiredY = blended.desiredY;
      mode = "travel";
    }

    if (this._focusDollyIn) {
      this.parallax.x = 0;
      this.parallax.y = 0;
    } else {
      tickParallaxState(this.parallax, {
        dt,
        desiredX,
        desiredY,
        mode
      });
    }

    this._parallaxInfluenceTarget = 0;
    if (this.parallaxInfluence > 0.001) {
      this.parallaxInfluence += (0 - this.parallaxInfluence) * PARALLAX_CAPTURE_OUT;
    }
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
        const desktop = new DesktopVignette(group, {
          mySpace: this.hud.getMySpaceScreen(),
          scrollCapture: this.scrollCapture,
          vignetteIndex: index,
          renderer: this.renderer,
          liveEnv: this.liveEnv,
          introGate: () => !this.introComplete,
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
          onAligned: () => {
            this._snapAllVignettesToFloor();
            if (this.introComplete) {
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
    this._focusTween?.kill();
    this._focusTween = null;
    this._focusDollyIn = false;
    this._focusPhase = STAGE_FOCUS_PHASE.IDLE;
    this._bootQueuePending = false;

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

  _focusVignette() {
    if (!canEnterDesktopFocus(this)) return;

    this._focusPhase = STAGE_FOCUS_PHASE.ENTERING;
    this._focusDollyIn = true;

    if (!this.reducedMotion) {
      this._captureBlendTween?.kill();
      this._captureBlendTween = gsap.to(this, {
        captureBlend: 0,
        duration: FOCUS_ENTER_DURATION,
        ease: "power2.inOut",
        overwrite: true,
        onComplete: () => {
          this._captureBlendTween = null;
        }
      });
    } else {
      this.captureBlend = 0;
    }

    if (this.reducedMotion) {
      this.focusBlend = 1;
      this._onVignetteFocusComplete();
      return;
    }

    this._focusTween?.kill();
    this._focusTween = gsap.to(this, {
      focusBlend: 1,
      duration: FOCUS_ENTER_DURATION,
      ease: "power2.inOut",
      overwrite: true,
      onComplete: () => {
        this._focusTween = null;
        this._onVignetteFocusComplete();
      }
    });
  }

  _onVignetteFocusComplete() {
    if (this.focusBlend >= FOCUS_BLEND_THRESHOLD) {
      this._focusPhase = STAGE_FOCUS_PHASE.FOCUSED;
    }
    this._focusDollyIn = true;
    requestAnimationFrame(() => {
      this._tryStartDesktopBoot();
    });
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

  _unfocusVignette() {
    if (this._focusPhase === STAGE_FOCUS_PHASE.IDLE) return;

    this._focusPhase = STAGE_FOCUS_PHASE.EXITING;
    this._bootQueuePending = false;

    if (this.reducedMotion) {
      this.focusBlend = 0;
      this._focusDollyIn = false;
      this._focusPhase = STAGE_FOCUS_PHASE.IDLE;
      return;
    }

    this._focusTween?.kill();
    this._focusTween = gsap.to(this, {
      focusBlend: 0,
      duration: FOCUS_EXIT_DURATION,
      ease: "power2.inOut",
      overwrite: true,
      onComplete: () => {
        this._focusTween = null;
        this._focusDollyIn = false;
        this._focusPhase = STAGE_FOCUS_PHASE.IDLE;
      }
    });
  }

  get transitionDuration() {
    return this.reducedMotion ? 0.45 : TRANSITION_DURATION;
  }

  _transitionProfile(vigorous) {
    const base = this.transitionDuration;
    if (vigorous) {
      return {
        duration: base / TRANSITION_VIGOROUS_SPEED,
        ease: this.reducedMotion ? "power1.inOut" : easeOutHalf
      };
    }
    return {
      duration: base,
      ease: this.reducedMotion ? "power1.inOut" : "power2.inOut"
    };
  }

  _inferTransitionDir(fromIndex, target, dirHint) {
    if (dirHint != null && dirHint !== 0) return Math.sign(dirHint);
    const n = this.vignettes.length;
    const forward = (target - fromIndex + n) % n;
    const backward = (fromIndex - target + n) % n;
    if (forward === 0) return 0;
    return forward <= backward ? 1 : -1;
  }

  _canInterruptTransition() {
    if (!this._transitionTl) return false;
    const elapsed = performance.now() - (this._transitionStartedAt || 0);
    const progress = THREE.MathUtils.clamp(finite(this._transition.progress, 0), 0, 1);
    return elapsed >= TRANSITION_COMMIT_MS || progress >= TRANSITION_COMMIT_PROGRESS;
  }

  _clearTransitionMotionState() {
    this._transitionTl = null;
    this._animTarget = null;
    this._transitionFromIndex = null;
    this._transitionRotFrom = null;
    this._transitionRotTo = null;
    this._transitionParallaxFrom = null;
    this._transitionFocusFrom = 0;
    this._transitionScrollDir = 0;
    this._transitionReversing = false;
    this._opposingScrollAccum = 0;
    this.locked = false;
  }

  /** Smoothly undo an in-flight move back to the vignette it came from. */
  _reverseActiveTransition(vigorous = false) {
    if (!this._transitionTl || this._transitionReversing) return;

    const fromIndex = this._transitionFromIndex ?? this.current;
    const fromY = this._transitionRotFrom;
    const toY = this._transitionRotTo;
    if (fromY == null || toY == null) return;

    const startProgress = THREE.MathUtils.clamp(finite(this._transition.progress, 0), 0, 1);
    if (startProgress <= 1e-4) {
      this._transitionTl.kill();
      this._clearTransitionMotionState();
      return;
    }

    this._transitionTl.kill();
    this._transitionReversing = true;
    this._opposingScrollAccum = 0;
    this._transitionScrollDir = -this._transitionScrollDir;
    this._transitionStartedAt = performance.now();

    const profile = this._transitionProfile(vigorous);
    const blend = { t: startProgress };

    const tl = gsap.timeline({
      onComplete: () => {
        this._onTransitionReverseComplete(fromIndex);
      }
    });

    this._transitionTl = tl;
    this._animTarget = fromIndex;

    tl.to(blend, {
      t: 0,
      duration: Math.max(profile.duration * startProgress, 0.12),
      ease: profile.ease,
      onUpdate: () => {
        this._transition.progress = blend.t;
        this.world.rotation.y = fromY + (toY - fromY) * blend.t;
      }
    });
  }

  _onTransitionReverseComplete(fromIndex) {
    this._flushTravelParallaxHandoff();
    this._snapToVignette(fromIndex);
    this._setCaption(fromIndex);
    this.vignettes.forEach((vig, index) => {
      vig.instance?.setInactive?.();
    });
    this.current = fromIndex;
    this.vignettes[fromIndex]?.instance?.setActive?.();
    this._updatePlaceholderVisibility(fromIndex);
    this.hud.updateMySpacePanelForVignette(fromIndex);
    this._updateHoverFromClient(this._lastPointer.x, this._lastPointer.y);

    this._parallaxLock.x = this.parallax.x;
    this._parallaxLock.y = this.parallax.y;
    this._parallaxSettleUntil = performance.now() + PARALLAX_POST_TRANSITION_MS;
    this._refreshParallaxTarget();

    if (this.ui.caption) this.ui.caption.style.opacity = "1";
    this.focusBlend = 0;
    this._clearTransitionMotionState();
  }

  /**
   * Wheel / swipe / keyboard travel — during an active move, opposing input reverses
   * instead of jumping to a third vignette.
   */
  _handleTravelImpulse(dir, options = {}) {
    const travelDir = Math.sign(dir);
    if (!travelDir) return;

    if (this._transitionTl && this._animTarget != null && this._transitionScrollDir !== 0) {
      if (travelDir === this._transitionScrollDir) return;
      if (!this._canInterruptTransition()) return;
      this._reverseActiveTransition(options.vigorous ?? true);
      return;
    }

    this._registerScrollImpulse(travelDir, options);
  }

  _handleTransitionWheel(delta) {
    if (!this._transitionTl || this._animTarget == null) return false;

    const scrollDir = delta > 0 ? 1 : -1;
    const travelDir = this._transitionScrollDir;
    if (travelDir !== 0 && scrollDir === travelDir) {
      this._opposingScrollAccum = 0;
      return true;
    }

    if (!this._canInterruptTransition()) {
      return true;
    }

    this._opposingScrollAccum += Math.abs(delta);
    if (this._opposingScrollAccum < WHEEL_REVERSE_INTERRUPT_DELTA) {
      return true;
    }

    this._opposingScrollAccum = 0;
    this._consumeWheelGesture();
    this._reverseActiveTransition(this._isVigorousScroll(performance.now()));
    return true;
  }

  _anchorY(index) {
    return vignetteAnchorRotation(index, this.vignettes.length);
  }

  _snapToVignette(index) {
    this.world.rotation.y = sanitizeWorldRotation(this._anchorY(index));
    this._transition.progress = 0;
  }

  /**
   * Reconcile rotation + logical vignette when a transition is interrupted.
   * Uses the 50% rule for both normal and vigorous interrupts.
   */
  _resolveInterruptedTransition(_vigorous) {
    const pending = this._animTarget;
    const fromIndex = this._transitionFromIndex ?? this.current;
    const progress = this._transition?.progress ?? 0;
    const snapIndex = resolveInterruptedVignetteIndex(progress, pending, fromIndex);
    this.current = snapIndex;
    this._snapToVignette(snapIndex);
    return { snapIndex, fromIndex };
  }

  _reconcileInterruptedVignette(fromIndex, snapIndex) {
    if (fromIndex !== snapIndex) {
      this.vignettes[fromIndex]?.instance?.setInactive?.();
    }
    this.current = snapIndex;
    this.vignettes[snapIndex]?.instance?.setActive?.();
    this._updatePlaceholderVisibility(snapIndex);
    this._setCaption(snapIndex);
    if (this.ui.caption) this.ui.caption.style.opacity = "1";
  }

  _killActiveTransition(vigorous) {
    if (!this._transitionTl) return;
    const { snapIndex, fromIndex } = this._resolveInterruptedTransition(vigorous);
    this._transitionTl.kill();
    this._transitionTl = null;
    this._animTarget = null;
    this._transitionFromIndex = null;
    this._transitionRotFrom = null;
    this._transitionRotTo = null;
    this._transitionParallaxFrom = null;
    this._transitionFocusFrom = 0;
    this.focusBlend = 0;
    this._reconcileInterruptedVignette(fromIndex, snapIndex);
    this._parallaxLock.x = this.parallax.x;
    this._parallaxLock.y = this.parallax.y;
    this._parallaxSettleUntil = performance.now() + PARALLAX_POST_TRANSITION_MS * 0.5;
    this._refreshParallaxTarget();
    this._updateHoverFromClient(this._lastPointer.x, this._lastPointer.y);
    this.locked = false;
  }

  /** Update parallax targets only — never snap x/y (avoids a one-frame lighting jump). */
  _refreshParallaxTarget() {
    const { tx, ty } = this._parallaxTargetFromClient(this._lastPointer.x, this._lastPointer.y);
    this.parallax.tx = tx;
    this.parallax.ty = ty;
  }

  _syncParallaxToPointer(force = false) {
    if (!force && this.reducedMotion) return;
    this._refreshParallaxTarget();
    if (force) {
      this.parallax.x = this.parallax.tx;
      this.parallax.y = this.parallax.ty;
    }
  }

  /** One damp step at travel end so landing POV matches live cursor before handoff clears. */
  _flushTravelParallaxHandoff() {
    const from = this._transitionParallaxFrom;
    if (!from || this.reducedMotion) return;

    const travelScale = this._parallaxTravelScale();
    if (travelScale <= 0.001) return;

    const { tx, ty } = this._parallaxTargetFromClient(this._lastPointer.x, this._lastPointer.y);
    const { desiredX, desiredY } = resolveTransitionParallaxDesired(from, tx, ty, 1, travelScale);
    tickParallaxState(this.parallax, {
      dt: finite(this._lastParallaxDt, 1 / 60),
      desiredX,
      desiredY,
      mode: "travel"
    });
  }

  _onVignetteTransitionComplete(target) {
    this._flushTravelParallaxHandoff();
    this._snapToVignette(target);
    this._setCaption(target);
    this._setActiveVignette(target);
    this._updateHoverFromClient(this._lastPointer.x, this._lastPointer.y);

    // Travel blend targets live cursor at progress=1 — lock from here, no snap.
    this._parallaxLock.x = this.parallax.x;
    this._parallaxLock.y = this.parallax.y;
    this._parallaxSettleUntil = performance.now() + PARALLAX_POST_TRANSITION_MS;
    this._refreshParallaxTarget();

    if (this.ui.caption) this.ui.caption.style.opacity = "1";
    this.locked = false;
    this._animTarget = null;
    this._transitionFromIndex = null;
    this._transitionTl = null;
    this._transitionRotFrom = null;
    this._transitionRotTo = null;
    this._transitionParallaxFrom = null;
    this._transitionFocusFrom = 0;
    this.focusBlend = 0;
    this._transitionScrollDir = 0;
    this._transitionReversing = false;
    this._opposingScrollAccum = 0;
  }

  goTo(target, _dirHint, _options = {}) {
    if (!this.cameraRig) return;
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
    this._prepareForVignetteTransition(this.current);
    this.cameraRig.advance(Math.sign(steps));
  }

  next = (options) => this.advance(1, options);
  prev = (options) => this.advance(-1, options);

  _isVigorousScroll(now) {
    if (this._transitionTl) return true;
    if (this._lastImpulseAt <= 0) return false;
    return now - this._lastImpulseAt < VIGOROUS_SCROLL_MS;
  }

  _extendWheelGestureIdle() {
    window.clearTimeout(this._wheelIdleTimer);
    this._wheelIdleTimer = window.setTimeout(() => {
      this._wheelGestureOpen = true;
      this._wheelIdleTimer = 0;
    }, WHEEL_GESTURE_IDLE_MS);
  }

  _consumeWheelGesture() {
    this._wheelGestureOpen = false;
    this._extendWheelGestureIdle();
  }

  _registerScrollImpulse(dir, { vigorous = false } = {}) {
    const now = performance.now();
    this._lastImpulseAt = now;
    this._lastImpulseDir = dir;
    this.advance(dir, { vigorous });
  }

  _resetScrollIntent() {
    window.clearTimeout(this._wheelIdleTimer);
    this._wheelIdleTimer = 0;
    this._wheelGestureOpen = true;
    this._lastImpulseAt = 0;
    this._lastImpulseDir = 0;
  }

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
          this.vignettes[2]?.instance?.playSlideClose?.();
          return;
        }
        if (this.focusBlend > 0.02) {
          this._unfocusVignette();
          this.vignettes[2]?.instance?.playSlideClose?.();
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
    this.vignetteClick?.attach(this.canvas);
  }

  _getCanvasRect() {
    return this.canvas.getBoundingClientRect();
  }

  _parallaxTargetFromClient(clientX, clientY) {
    const rect = this._getCanvasRect();
    return parallaxTargetFromClient(clientX, clientY, rect);
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

    return meshTarget ?? null;
  }

  /** Scroll-capture wheel block — PC monitor defers until zoom/boot; Sidekick blocks turntable only. */
  _shouldEngageScrollCapture() {
    if (!this.scrollCapture.isActive) return false;
    if (
      this._pcScreenHovered &&
      this.current === 1 &&
      (this.focusBlend ?? 0) <= 0.02
    ) {
      const mySpace = this.hud.getMySpaceScreen();
      if (!mySpace?.isPoweredOn && !mySpace?.xpBoot?.isBooting) {
        return false;
      }
    }
    return true;
  }

  _getDesktopInstance() {
    return this.vignettes[1]?.instance ?? null;
  }

  _getActiveInstance() {
    return this.vignettes[this.current]?.instance ?? null;
  }

  /** Closest at each vignette stop; max +Z drift at 50% through the turntable move. */
  _getTransitionPullback() {
    if (!this._transitionTl) return 0;
    const t = this._transition.progress;
    let pullback = CAM_TRANSITION_PULLBACK * Math.sin(t * Math.PI);
    if (this._animTarget === 2 && t > 0.82) {
      pullback *= 1 - (t - 0.82) / 0.18;
    }
    return pullback;
  }

  _getDisplayStageDegrees() {
    // Match the old readout: stage degrees from world turntable rotation.
    return THREE.MathUtils.euclideanModulo(
      THREE.MathUtils.radToDeg(-this.world.rotation.y),
      360
    );
  }

  /** Recover from NaN parallax / rotation before applying camera pose. */
  _sanitizeMotionState() {
    sanitizeParallax(this.parallax);
    sanitizeParallax(this._parallaxLock);
    this.focusBlend = THREE.MathUtils.clamp(finite(this.focusBlend, 0), 0, 1);
    this.captureBlend = THREE.MathUtils.clamp(finite(this.captureBlend, 0), 0, 1);
    this.parallaxInfluence = THREE.MathUtils.clamp(finite(this.parallaxInfluence, 0), 0, 1);
    this.world.rotation.y = sanitizeWorldRotation(this.world.rotation.y);

    if (this._transitionParallaxFrom) {
      this._transitionParallaxFrom.x = finite(this._transitionParallaxFrom.x, 0);
      this._transitionParallaxFrom.y = finite(this._transitionParallaxFrom.y, 0);
    }
  }

  _onPointerDown = (event) => {
    this._updateHoverFromClient(event.clientX, event.clientY);

    const onSidekick =
      this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.sidekick;
    const onDesktop =
      this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.finalPcScreen;
    const rigZoomed = Boolean(this.cameraRig?.state?.isZoomed);

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
      if (onSidekick) {
        // Sidekick swivel is handled by scroll-capture; zoom stays with vignetteClick.
        event.stopImmediatePropagation();
        return;
      }
      if (onDesktop && this.cameraRig?.state?.index === 1 && this.cameraRig.state.isZoomed) {
        if (this.focusBlend < 0.98) {
          this._focusVignette();
        } else {
          this._tryStartDesktopBoot();
        }
        event.stopImmediatePropagation();
        return;
      }
      // First click on desktop/monolith: let the click handler run CameraRig.zoomIn.
      return;
    }

    if (this.focusBlend > 0.02 || rigZoomed) {
      this.cameraRig?.zoomOut?.();
      this._unfocusVignette();
    }
  };

  _onPointerUp = () => {
    this.waterCursor?.setPressed(false);
  };

  _onPointerLeave = (event) => {
    this.scrollCapture.clearPointer();
    this._screenHover = false;
    this._pcScreenHovered = false;
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
      parallaxInfluence: this.parallaxInfluence,
      parallaxInfluenceTarget: this._parallaxInfluenceTarget,
      focusBlend: this.focusBlend,
      focusPhase: this._focusPhase,
      locked: this.locked,
      current: this.current,
      transitionProgress: this._transition?.progress ?? 0,
      wheelGestureOpen: this._wheelGestureOpen
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
    if (this.current === 2) {
      this.vignettes[2]?.instance?.invalidateRestPose?.();
      this._fitSidekickRestPose(true);
    }
  };

  _applyVignetteMotion(t) {
    const focus = this.focusBlend;
    const transitioning = Boolean(this._transitionTl);

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
    }

    if (this._shouldRunIntroHeavyEffects()) {
      desktop?.screenLightRig?.update();
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

    this.cameraRig?.update(dt);
    this._tickIntroFromCameraRig();
    this._syncCameraRigIndex();
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
