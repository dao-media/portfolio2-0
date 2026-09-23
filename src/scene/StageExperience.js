import * as THREE from "three";
import gsap from "gsap";
import { HUDController } from "../ui/HUDController.js";
import { DesktopVignette, desktopVignetteMeta } from "./vignettes/DesktopVignette.js";
import { BustVignette, bustVignetteMeta } from "./vignettes/BustVignette.js";
import { addDegreeLabels } from "./stage/placeholderVignettes.js";
import { SidekickVignette, sidekickVignetteMeta } from "./vignettes/SidekickVignette.js";
import { ArchaeologyVignette, archaeologyVignetteMeta } from "./vignettes/ArchaeologyVignette.js";
import { PostPass } from "./stage/PostPass.js";
import { createStageLoadGate } from "./stage/StageLoadGate.js";
import { StageBootSequence } from "../ui/xpBoot/StageBootSequence.js";
import { NeonSystem } from "./neon/NeonSystem.js";
import { VolumetricFogPass } from "./neon/VolumetricFogPass.js";
import { EdgeGlitchSystem } from "./edgeGlitch/EdgeGlitchSystem.js";
import { EdgeGlitchPass } from "./edgeGlitch/EdgeGlitchPass.js";
import { EDGE_GLITCH_STAGE } from "./edgeGlitch/constants.js";
import { AccentLightSystem } from "./accent/AccentLightSystem.js";
import {
  FOG_DEFAULTS,
  createFogParams,
  FOG_HEAVY_FADE_IN_MS
} from "../fog/fogConfig.js";
import { VIDEO_FOG_FADE_IN_MS } from "./neon/videoFogConfig.js";
import { configureSpotShadow } from "./stage/configureSpotShadow.js";
import { VignetteContactShadows } from "./stage/VignetteContactShadows.js";
import { LiveStageEnvironment } from "./stage/LiveStageEnvironment.js";
import { buildStageStudioRoom } from "./stage/StageStudioRoom.js";
import { buildStageFloor } from "./stage/StageFloor.js";
import { createProceduralStarfield, updateStarfield } from "./blackhole/ProceduralStarfield.js";
import { createMilkyWayDome, updateMilkyWayDome } from "./blackhole/MilkyWayNebulaShader.js";
import { createNebulaCluster, updateNebulaCluster } from "./blackhole/NebulaCloudCluster.js";
import {
  loadWetFloorTextures,
  WetFloorSystem
} from "./floor/WetFloorSystem.js";
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
  BOOT_MIN_MS,
  NEON_BLOOM,
  WET_FLOOR_LAYER,
  VIGNETTE_FOG_RADIUS,
  VIGNETTE_FOG_FEATHER,
  STAGE_FOG_MODE,
  STAGE_FOG_ENABLED,
  INACTIVE_VIGNETTE_LAYER,
  NEON_FOG_LAYER,
  NEON_SHADOW
} from "./stage/constants.js";
import { VideoFogSystem } from "./neon/VideoFogSystem.js";
import { PINNED_VOLUMETRIC_FOG } from "../fog/volumetricFogPinned.js";
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
import {
  StagePerfGovernor,
  MOTION_DPR
} from "./stage/stagePerfGovernor.js";
import { STAGE_FLOOR_Y, measureBlockoutReferenceBounds, measureSceneBounds, snapAllGroupsToFloor, snapGroupToFloor } from "./vignettes/pcSceneBlockout.js";
import { preloadPcTextures, setPcTextureLoadingManager } from "./vignettes/pcProductionMaterials.js";
import { WaterCursor } from "../cursor/WaterCursor.js";
import { CameraRig } from "./camera/CameraRig.js";
import {
  BLACK_HOLE_CENTER,
  BLACK_HOLE_PHASE,
  BlackHoleCameraSequence
} from "./camera/BlackHoleCameraSequence.js";
import { createBlackHoleModel } from "./blackhole/BlackHoleModel.js";
import { buildVignetteRing } from "./camera/ringLayout.js";
import { createScrollAdvance } from "./camera/scrollAdvance.js";
import { createVignetteClick } from "./camera/vignetteClick.js";
import {
  createParallaxDampZones,
  PARALLAX_DAMP_INSIDE_SCALE
} from "./camera/parallaxDampZones.js";
import { PARALLAX_DAMP_ZONE_IDS } from "./stage/scrollCaptureTargets.js";
import { DuoFabSystem } from "./duo/DuoFabSystem.js";
import { DuoMailOverlay } from "../ui/DuoMailOverlay.js";
import { DuoCaseStudyOverlay } from "../ui/DuoCaseStudyOverlay.js";

/** Spring orbit — camera travels the ring; vignettes stay fixed. */
const LOOK_AT_HEIGHT = LOOK.y;
const CAMERA_REST_HEIGHT = CAM_Y;
const CAMERA_PAGELOAD_HEIGHT = CAM_Y + INTRO_TRACK_DESCENT;
/** Pull-in distance from rest radius — 5% less than prior so the PC zoom isn't too tight. */
const CAMERA_ZOOM_DISTANCE = 4.2 * 0.95;
const CAMERA_ZOOM_HEIGHT = 2.15;

const _BH_PARALLAX_OFFSET = new THREE.Vector3();
const _SPOT_AIM_LOCAL = new THREE.Vector3();
const _EDGE_NEAR_WORLD = new THREE.Vector3();
const _EDGE_NEAR_NDC = new THREE.Vector3();
const _EDGE_NEAR_BOX = new THREE.Box3();
/** NDC pad around subject AABB for "cursor near" cost gate (UV-ish, ~glitch arm). */
const EDGE_GLITCH_NEAR_NDC_PAD = 0.14;

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
    this._fpsEma = 60;
    this._fpsDomT = 0;
    /** Blocks stage hop / zoom while Duo Mail or case study is open. */
    this.duoMode = false;
    this.duoFab = null;
    this.duoMail = null;
    this.duoCaseStudy = null;

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
    {
      const { w, h } = this._viewportCssSize();
      this.renderer.setSize(w, h, false);
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = EXPOSURE;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(STAGE_BG, 1);

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
    /** Black-hole approach/spiral owns the camera until the aerial handoff. */
    this._blackHoleActive = false;
    this.blackHoleSeq = null;
    this.blackHole = null;
    this._introHoldStartedAt = 0;
    this._deferredModelsFetchStarted = false;
    this.frameBudget = createFrameBudget();
    setActiveFrameBudget(this.frameBudget);
    this.perfGovernor = new StagePerfGovernor();
    /** @type {number} last frame wall ms (for governor EMA). */
    this._lastFrameMs = 16.7;
    /** Previous settled stop — kept on layer 0 during hop to avoid pop-out. */
    this._layerCullFromIndex = 0;
    this._wasSettledForCull = false;
    /** Wet-floor probeEveryN override from governor (null = use config). */
    this._wetProbeEveryNOverride = null;
    /** Neon shadow mapSize override from governor. */
    this._neonShadowSizeOverride = null;
    /** Last governor effective DPR mul applied via _applyRenderScale. */
    this._lastGovDprMul = 1;
    /** Previous camera index while settled (hop from). */
    this._layerCullPrevIndex = 0;

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
    // Atmosphere mode must exist before _mountNeonSystem (video fog enable / userOff).
    // STAGE_FOG_ENABLED gates construction — mode alone is not enough when parked.
    this._fogMode =
      STAGE_FOG_MODE === "video" || STAGE_FOG_MODE === "volumetric" || STAGE_FOG_MODE === "off"
        ? STAGE_FOG_MODE
        : "video";
    this._volFogFade = 0;
    this._volFogUserOff = this._fogMode !== "volumetric";
    this._videoFogFade = 0;
    this._videoFogUserOff = this._fogMode !== "video";
    /** performance.now() when intro lands — fog opacity fade / bloom-return arm here. */
    this._introLandAt = 0;
    this._fogFadeDoneAt = 0;
    this._bloomReturnT = 1;
    /** @type {VideoFogSystem | null} */
    this.videoFog = null;
    /** @type {import("./neon/VolumetricFogPass.js").VolumetricFogPass | null} */
    this.volumetricFog = null;
    // Glitch pass must exist before _mountNeonSystem → EdgeGlitchSystem (same
    // instance is later added to PostPass). Creating it after neon left an orphan.
    this._edgeGlitchPass =
      !this.reducedMotion && EDGE_GLITCH_STAGE >= 3
        ? new EdgeGlitchPass()
        : null;
    this._edgeTubeGlitchPass = this._edgeGlitchPass;
    this._mountNeonSystem();
    this._mountContactShadows();
    this._initCameraRig();
    this._updatePlaceholderVisibility(0);

    if (import.meta.env.DEV) {
      window.__stage = this;
    }

    // Fog systems only when STAGE_FOG_ENABLED — files stay on disk for restore.
    if (STAGE_FOG_ENABLED) {
      this.volumetricFog = new VolumetricFogPass(this.camera, {
        useComposerDepth: false,
        depthPacked: true,
        halfRes: FOG_DEFAULTS.halfRes,
        params: createFogParams()
      });
      this.volumetricFog.setEnabled(false);
      this.volumetricFog.setDensityScale(0);
      this.volumetricFog.setCompositeOpacity?.(0);
      this.volumetricFog.setNoiseFrozen(this.reducedMotion);
    }

    this.post = new PostPass(
      this.renderer,
      this.pixelRatio,
      0, // grain off — sensor-noise look crushed fog; bloom stays
      this.camera,
      {
        scene: this.scene,
        bloom: !this.reducedMotion,
        volumetricPass: this.volumetricFog,
        edgeGlitchPass: this._edgeGlitchPass
      }
    );

    this._initLoadGate();

    // Cursor waits until the pageload drop is done — init cost hitching the open beat.
    this.waterCursor = null;
    /** Last known CSS-pixel pointer — filled from first move so the blob can pop in place. */
    this._clientPointer = null;
    this._onClientPointerSample = (event) => {
      if (!Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return;
      this._clientPointer = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", this._onClientPointerSample, {
      passive: true,
      capture: true
    });

    this._bindUi();
    this._bindInput();
    this._mountDuoFab();
    this._mountPovSpotlight();
    this._setActiveVignette(0);
    this._runIntro();

    window.addEventListener("resize", this._onResize);
    this._viewportResizeObserver = new ResizeObserver(() => this._onResize());
    this._viewportResizeObserver.observe(document.documentElement);
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

    const floor = buildStageFloor();
    this.stageFloor = floor.group;
    this._wetFloorMesh = floor.mesh;
    this._wetFloorMaterial = floor.material;
    this.world.add(this.stageFloor);
    // See neon tubes + wet apron (POV spot stays layer 0 only — no disc).
    this.camera.layers.enable(WET_FLOOR_LAYER);

    this.wetFloor = null;
    this.studioRoom.visible = false;
    this.milkyWayDome = createMilkyWayDome();
    this.scene.add(this.milkyWayDome);
    this.starfield = createProceduralStarfield();
    this.scene.add(this.starfield);
    this.nebulaClouds = createNebulaCluster();
    this.scene.add(this.nebulaClouds);
    loadWetFloorTextures()
      .then((maps) => {
        const mat = this._wetFloorMaterial;
        if (!mat) return;
        mat.map = maps.map;
        mat.roughnessMap = maps.roughnessMap;
        mat.normalMap = maps.normalMap;
        mat.metalnessMap = maps.metalnessMap;
        mat.needsUpdate = true;
        this.wetFloor = new WetFloorSystem({
          renderer: this.renderer,
          scene: this.scene,
          floorMesh: this._wetFloorMesh,
          material: mat
        });
        this.wetFloor.setWorkQuality?.(this._renderScale ?? 1);
      })
      .catch((err) => {
        console.warn("[StageExperience] wet floor textures failed", err);
      });

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
    if (SPOT_INTENSITY > 0) {
      configureSpotShadow(this.spotLight);
    } else {
      this.spotLight.castShadow = false;
    }
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
   * Per-stop neon tubes + PointLights. Atmosphere = STAGE_FOG_MODE (video or volumetric).
   */
  _mountNeonSystem() {
    this.neon = new NeonSystem({
      scene: this.scene,
      camera: this.camera,
      reducedMotion: this.reducedMotion,
      isCoarse: this.isCoarse,
      loadingManager: this.loadingManager
    });
    this.vignettes.forEach((vig) => this.neon.attach(vig));
    this.neon.finishMount();
    this.neon.setStageFloor?.(this.stageFloor);
    if (STAGE_FOG_ENABLED) {
      this.videoFog = new VideoFogSystem(this.scene, this.camera, {
        vignetteCount: this.vignettes.length
      });
      this.videoFog.seatOnVignettes(this.vignettes);
      this.videoFog.setUserOff(this._fogMode !== "video");
      this.videoFog.setEnabled(this._fogMode === "video");
      this.videoFog.setSizeFromRenderer(this.renderer);
    } else {
      this.videoFog = null;
    }
    this.edgeGlitch = new EdgeGlitchSystem({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      reducedMotion: this.reducedMotion,
      glitchPass: this._edgeGlitchPass
    });
    this.accentLights = new AccentLightSystem({
      scene: this.scene,
      camera: this.camera,
      reducedMotion: this.reducedMotion
    });
  }

  /** Soft contact pads under each stop (POV spot + neon) — MeshBasic floor cannot receive maps. */
  _mountContactShadows() {
    this.contactShadows = this.vignettes.map((vig) => new VignetteContactShadows(vig.group));
  }

  _refreshContactShadows() {
    this.contactShadows?.forEach((rig) => rig.refreshBounds());
  }

  _tickContactShadows() {
    if (!this.contactShadows?.length || !this.camera) return;
    const maxLight = this.neon?._maxLight || 1;
    for (let i = 0; i < this.contactShadows.length; i += 1) {
      const light = this.neon?.stopLights?.[i]?.light;
      const entry = this.neon?.entries?.[i];
      const level = light ? light.intensity / maxLight : 0;
      this.contactShadows[i].update({
        camera: this.camera,
        neonWorld: light?.position ?? null,
        neonColor: entry?.dominant ?? null,
        neonLevel: level
      });
    }
  }

  /** Shared LoadingManager → XP fader. Min duration before input. */
  _initLoadGate() {
    this.loadGate = createStageLoadGate({
      manager: this.loadingManager,
      bootSequence: this.bootSequence,
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      post: this.post,
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
    this._tryRevealDuo();
    this._showBlackHoleEnter();
    if (this._blackHoleActive && navigator.webdriver) {
      this._triggerBlackHoleSpiral();
    }
  }

  /**
   * Screen-space Duo FAB + Mail / case-study overlays.
   * Loads async; stays hidden until intro rests at stop 0, then grow/pop.
   * Does not block the XP load gate.
   */
  _mountDuoFab() {
    this.duoMail = new DuoMailOverlay({
      onOpenCaseStudy: (slug) => this._duoOpenCaseStudy(slug),
      onRequestClose: () => this._duoCloseToIdle(),
      onSelect: () => this.duoFab?.captureMailScreen?.(),
      onProjectionDirty: () => this.duoFab?.captureMailScreen?.()
    });
    this.duoCaseStudy = new DuoCaseStudyOverlay({
      onBack: () => this._duoBackToMail(),
      onClose: () => this._duoCloseAll()
    });

    this.duoFab = new DuoFabSystem({
      canvas: this.canvas,
      loadingManager: this.loadingManager,
      onStateChange: (state) => {
        this.duoMode = state === "mail" || state === "caseStudy";
      },
      onHoverChange: (hovered) => {
        if (!this.waterCursor) {
          this.canvas.style.cursor = hovered ? "pointer" : "default";
        }
      },
      getScreenRect: (rect) => {
        this.duoMail?.setScreenRect?.(rect);
      },
      getMailShell: () => this.duoMail?.shell ?? null
    });
    {
      const { w, h } = this._viewportCssSize();
      this.duoFab.setSize(w, h);
    }

    this.duoFab
      .load()
      .then(() => {
        this._tryRevealDuo();
      })
      .catch((err) => {
        console.warn("[DuoFab] Failed to load iPhone Duo.", err);
        this.duoFab = null;
      });
  }

  /**
   * Reveal Duo only after intro camera rests AND the GLB is ready.
   */
  _tryRevealDuo() {
    if (!this.introComplete || !this.duoFab?.ready) return;
    this.duoFab.reveal();
  }

  _duoOpenMail() {
    if (!this.duoFab?.ready || !this.duoFab.isLive || this.locked) return;
    this.duoFab.openMail();
    this.duoMode = true;
    this.duoCaseStudy?.close();
    this.duoMail?.open();
    this.duoFab?.captureMailScreen?.();
  }

  /** Click Duo while Mail is open → close (toggle). */
  _duoToggleMail() {
    if (this.duoMail?.isOpen || this.duoFab?.state === "mail") {
      this._duoCloseToIdle();
      return;
    }
    this._duoOpenMail();
  }

  /** @param {string} slug */
  _duoOpenCaseStudy(slug) {
    if (!this.duoFab) return;
    this.duoFab.openCaseStudy();
    this.duoMode = true;
    this.duoCaseStudy?.open(slug);
  }

  _duoBackToMail() {
    this.duoCaseStudy?.close();
    this.duoFab?.closeToMail();
    this.duoMode = true;
    this.duoMail?.open();
  }

  _duoCloseToIdle() {
    this.duoCaseStudy?.close();
    this.duoMail?.close();
    this.duoFab?.closeToIdle();
    this.duoMode = false;
  }

  _duoCloseAll() {
    this._duoCloseToIdle();
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
    const archaeology = this.vignettes[3]?.instance;
    if (archaeology) {
      archaeology.syncToCameraZoom?.(zoomed && index === 3);
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
    this.videoFog?.seatOnVignettes?.(this.vignettes);
    this._refreshContactShadows();
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
    this.edgeGlitch?.setWorkQuality?.(this._renderScale);
    this.accentLights?.setWorkQuality?.(this._renderScale);
    this.wetFloor?.setWorkQuality?.(this._renderScale);
    return this.debugWorkQuality();
  }

  /**
   * Silhouette root(s) for edge glitch on the given stop.
   * 0 bust · 1 PC · 2 Sidekick · 3 Archaeology (rest: neon+arch+shelf; zoom: finds).
   * @param {number} index
   * @returns {THREE.Object3D | THREE.Object3D[] | null}
   */
  _edgeGlitchRootForStop(index) {
    const vig = this.vignettes?.[index];
    const v = vig?.instance;
    if (!v) return null;
    if (index === 0) return v.bustRoot ?? null;
    if (index === 1) return v.pcRoot ?? null;
    if (index === 2) return v.sidekickRoot ?? v.phoneRoot ?? null;
    if (index === 3) {
      const zoomed = Boolean(this.cameraRig?.state?.isZoomed);
      const neonTube = vig?.tube ?? this.neon?.entries?.[3]?.tube ?? null;
      return v.getEdgeGlitchRoots({ zoomed, neonTube });
    }
    return null;
  }

  _attachEdgeGlitchBust() {
    const bust = this._edgeGlitchRootForStop(0);
    if (bust) this.edgeGlitch?.setActiveRoot?.(bust);
  }

  /** DEV — Stage-1 edge-glitch SDF / outside-band debug + cost-gate breakdown. */
  debugEdgeGlitch() {
    const gates = this._edgeGlitchGateDiag();
    const sys = this.edgeGlitch?.debugState?.() ?? null;
    const passU = this._edgeGlitchPass?.uniforms;
    return {
      ...(sys ?? {}),
      gates,
      costActive: Boolean(gates?.costActive),
      passEnabled: Number(passU?.uEnabled?.value ?? 0) > 0,
      hasSceneDepth: Boolean(this.edgeGlitch?._sceneDepth),
      fogDepthTexture: Boolean(this.neon?.depthCapture?.depthTexture),
      note: "gates.costActive must be true for SDF + FogDepthCapture + beauty tears"
    };
  }

  /**
   * DEV — hot-update edge-glitch knobs on the live pass (EdgeGlitchTuner).
   * @param {Record<string, number>} [partial]
   */
  setEdgeGlitchParams(partial = {}) {
    return this.edgeGlitch?.setParams?.(partial) ?? null;
  }

  /** DEV — current live edge-glitch knobs. */
  getEdgeGlitchParams() {
    return this.edgeGlitch?.getParams?.() ?? null;
  }

  /**
   * DEV — accent rim / sweep / shaft knobs (AccentTuner Shift+A).
   * @param {Record<string, number>} [partial]
   */
  setAccentParams(partial = {}) {
    return this.accentLights?.setParams?.(partial) ?? null;
  }

  getAccentParams() {
    return this.accentLights?.getParams?.() ?? null;
  }

  debugAccent() {
    return this.accentLights?.debugState?.() ?? null;
  }

  /**
   * DEV — wet-floor reflection / roughness knobs (WetFloorTuner Shift+W).
   * @param {Record<string, number>} [partial]
   */
  setWetFloorParams(partial = {}) {
    return this.wetFloor?.setParams?.(partial) ?? null;
  }

  /** DEV — current wet-floor knobs. */
  getWetFloorParams() {
    return this.wetFloor?.getParams?.() ?? null;
  }

  debugWetFloor() {
    return this.wetFloor?.debugState?.() ?? null;
  }

  /**
   * Subject root for accent lights (extend per stop later).
   * @param {number} index
   * @returns {THREE.Object3D | null}
   */
  _accentSubjectForStop(index) {
    const v = this.vignettes?.[index]?.instance;
    if (!v) return null;
    if (index === 0) return v.bustRoot ?? null;
    if (index === 1) return v.pcRoot ?? null;
    if (index === 2) return v.sidekickRoot ?? v.phoneRoot ?? null;
    if (index === 3) return v.shelfRoot ?? null;
    return null;
  }

  /**
   * DEV — water-cursor rim RESPONSE curves (WaterCursorRimTuner). Glitch untouched.
   * @param {Record<string, number>} [partial]
   */
  setWaterCursorRimParams(partial = {}) {
    return this.waterCursor?.setRimParams?.(partial) ?? null;
  }

  /** DEV — current water-cursor rim response knobs. */
  getWaterCursorRimParams() {
    return this.waterCursor?.getRimParams?.() ?? null;
  }

  /**
   * DEV — bust lawn edge noise coverage (LawnEdgeTuner). Fog/glitch/bust untouched.
   * @param {Record<string, number>} [partial]
   */
  setLawnEdgeParams(partial = {}) {
    return this.vignettes?.[0]?.instance?.setLawnEdgeParams?.(partial) ?? null;
  }

  /** DEV — current lawn-edge knobs. */
  getLawnEdgeParams() {
    return this.vignettes?.[0]?.instance?.getLawnEdgeParams?.() ?? null;
  }

  debugFrameBudget() {
    return this.frameBudget?.dump() ?? null;
  }

  debugWorkQuality() {
    const draw = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(draw);
    const { w, h } = this._viewportCssSize();
    const rect = this.canvas?.getBoundingClientRect?.();
    const gapRight = rect ? Math.max(0, w - rect.width - rect.left) : null;
    const gapBottom = rect ? Math.max(0, h - rect.height - rect.top) : null;
    return {
      scale: this._renderScale,
      pixelRatio: this.pixelRatio,
      fullPixelRatio: this._fullPixelRatio,
      drawingBuffer: { width: draw.x, height: draw.y },
      cssViewport: { width: w, height: h },
      canvasRect: rect
        ? { width: rect.width, height: rect.height, left: rect.left, top: rect.top }
        : null,
      gapRight,
      gapBottom,
      shadowMap: this.spotLight?.shadow?.mapSize?.x ?? null,
      screensUnscaled: true
    };
  }

  _applyRenderScale() {
    const govMul = this.perfGovernor?.effectiveDprMul ?? 1;
    this.pixelRatio = this._fullPixelRatio * this._renderScale * govMul;
    this.renderer.setPixelRatio(this.pixelRatio);
    if (this.post) this.post.pixelRatio = this.pixelRatio;
    if (!this.spotLight?.shadow) return;
    const shadowMul = this.perfGovernor?.profile?.shadowMul ?? 1;
    const size = Math.max(
      256,
      Math.round(SPOT_SHADOW.mapSize * this._renderScale * shadowMul)
    );
    if (this.spotLight.shadow.mapSize.x !== size) {
      this.spotLight.shadow.mapSize.set(size, size);
      this.spotLight.shadow.map?.dispose();
      this.spotLight.shadow.map = null;
      this.renderer.shadowMap.needsUpdate = true;
    }
    this._applyNeonShadowSize();
  }

  _applyNeonShadowSize() {
    if (!this.neon?.stopLights) return;
    const shadowMul = this.perfGovernor?.profile?.shadowMul ?? 1;
    const size = Math.max(
      256,
      Math.round(NEON_SHADOW.mapSize * shadowMul)
    );
    if (this._neonShadowSizeOverride === size) return;
    this._neonShadowSizeOverride = size;
    for (const slot of this.neon.stopLights) {
      const light = slot?.light;
      if (!light?.shadow) continue;
      if (light.shadow.mapSize.x === size) continue;
      light.shadow.mapSize.set(size, size);
      light.shadow.map?.dispose?.();
      light.shadow.map = null;
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  /**
   * DEV — Phase-1 perf readout for retina Mac diagnosis.
   * motionDprActive = motion factor is cutting DPR below settled full.
   */
  debugPerf() {
    const draw = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(draw);
    const s = this.cameraRig?.state;
    const settled = Boolean(s?.isSettled);
    const fullDpr = this._fullPixelRatio;
    const workScale = this._renderScale;
    const gov = this.perfGovernor;
    const motionFactor = gov?.motionDprFactor ?? 1;
    const govDprMul = gov?.profile?.dprMul ?? 1;
    const effectiveDpr = fullDpr * workScale * (gov?.effectiveDprMul ?? 1);
    const settledFullDpr = fullDpr * workScale * govDprMul;
    const motionDprActive = !settled && motionFactor < 0.999;
    return {
      fpsEma: +this._fpsEma.toFixed(1),
      frameMs: +this._lastFrameMs.toFixed(2),
      settled,
      index: s?.index ?? this.current,
      fullDpr,
      workScale,
      pixelRatio: +this.pixelRatio.toFixed(3),
      effectiveDpr: +effectiveDpr.toFixed(3),
      settledFullDpr: +settledFullDpr.toFixed(3),
      motionDpr: MOTION_DPR,
      motionDprFactor: +(motionFactor).toFixed(3),
      motionDprActive,
      dprVsFull: +((effectiveDpr / Math.max(1e-6, fullDpr)).toFixed(3)),
      drawingBuffer: { width: draw.x, height: draw.y },
      spotShadow: this.spotLight?.shadow?.mapSize?.x ?? null,
      neonShadow: this._neonShadowSizeOverride ?? NEON_SHADOW.mapSize,
      wetProbeEveryN: this._wetProbeEveryNOverride,
      fogEnabled: STAGE_FOG_ENABLED,
      fogMode: this._fogMode,
      bloomIntensity: this.post?.getBloomIntensity?.() ?? null,
      bloomReturnT: this._bloomReturnT ?? null,
      edgeGlitchCostActive: this._edgeGlitchCostActive(),
      edgeGlitchGates: this._edgeGlitchGateDiag(),
      governor: gov?.dump?.() ?? null,
      frameBudget: this.frameBudget?.dump?.() ?? null
    };
  }

  /**
   * Per-condition gate log for edge-glitch cost (SDF + FogDepthCapture + pass).
   * Edge glitch is never governor-disabled — only DPR / shadow / wet rate step down.
   */
  _edgeGlitchGateDiag() {
    const s = this.cameraRig?.state;
    const idx = s?.index ?? this.current ?? 0;
    const hasSystem = Boolean(this.edgeGlitch);
    const notReduced = !this.reducedMotion;
    const stageOk = EDGE_GLITCH_STAGE >= 3;
    const introOk = Boolean(this.introComplete);
    const settled = Boolean(s?.isSettled);
    const onGlitchStop = idx >= 0 && idx <= 3;
    const pointerFinite = Number.isFinite(this._lastPointer?.x);
    const workOk = (this._renderScale ?? 1) >= 0.55;
    const activeRoot = onGlitchStop ? this._edgeGlitchRootForStop(idx) : null;
    const hasRoot = Array.isArray(activeRoot)
      ? activeRoot.length > 0
      : Boolean(activeRoot);
    const near = this._cursorNearEdgeSubject(activeRoot);
    const costActive =
      hasSystem &&
      notReduced &&
      stageOk &&
      introOk &&
      settled &&
      onGlitchStop &&
      pointerFinite &&
      workOk &&
      hasRoot &&
      near.near;
    return {
      hasSystem,
      notReduced,
      stageOk,
      introOk,
      settled,
      onGlitchStop,
      pointerFinite,
      workOk,
      hasRoot,
      cursorNear: near.near,
      nearDetail: near,
      index: idx,
      costActive
    };
  }

  /**
   * Cursor near active subject via projected world AABB (+ NDC pad).
   * Uses subject root (bust/PC/…) — not vignette group origin (that missed the shoulder).
   * @param {THREE.Object3D | THREE.Object3D[] | null} root
   */
  _cursorNearEdgeSubject(root) {
    const empty = {
      near: false,
      reason: "no-root",
      ndcDist: null,
      pad: EDGE_GLITCH_NEAR_NDC_PAD
    };
    if (!root || !this.camera) return empty;
    const roots = Array.isArray(root) ? root : [root];
    _EDGE_NEAR_BOX.makeEmpty();
    let any = false;
    for (const r of roots) {
      if (!r) continue;
      _EDGE_NEAR_BOX.expandByObject(r);
      any = true;
    }
    if (!any || _EDGE_NEAR_BOX.isEmpty()) {
      return { ...empty, reason: "empty-bounds" };
    }
    _EDGE_NEAR_BOX.expandByScalar(0.4);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let behind = 0;
    const { min, max } = _EDGE_NEAR_BOX;
    for (let i = 0; i < 8; i += 1) {
      _EDGE_NEAR_WORLD.set(
        i & 1 ? max.x : min.x,
        i & 2 ? max.y : min.y,
        i & 4 ? max.z : min.z
      );
      _EDGE_NEAR_NDC.copy(_EDGE_NEAR_WORLD).project(this.camera);
      if (!Number.isFinite(_EDGE_NEAR_NDC.x) || _EDGE_NEAR_NDC.z > 1) {
        behind += 1;
        continue;
      }
      minX = Math.min(minX, _EDGE_NEAR_NDC.x);
      maxX = Math.max(maxX, _EDGE_NEAR_NDC.x);
      minY = Math.min(minY, _EDGE_NEAR_NDC.y);
      maxY = Math.max(maxY, _EDGE_NEAR_NDC.y);
    }
    if (behind === 8 || !Number.isFinite(minX)) {
      return { ...empty, reason: "behind-camera", behind };
    }
    const pad = EDGE_GLITCH_NEAR_NDC_PAD;
    const px = this.pointer.x;
    const py = this.pointer.y;
    const near =
      px >= minX - pad &&
      px <= maxX + pad &&
      py >= minY - pad &&
      py <= maxY + pad;
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const ndcDist = Math.hypot(px - cx, py - cy);
    return {
      near,
      reason: near ? "inside-aabb" : "outside-aabb",
      ndcDist: +ndcDist.toFixed(3),
      pad,
      aabbNdc: {
        minX: +minX.toFixed(3),
        maxX: +maxX.toFixed(3),
        minY: +minY.toFixed(3),
        maxY: +maxY.toFixed(3)
      },
      pointerNdc: { x: +px.toFixed(3), y: +py.toFixed(3) }
    };
  }

  /**
   * True when FogDepthCapture + edge SDF should pay — settled glitch stop +
   * cursor near subject. Glitch is never governor-gated.
   */
  _edgeGlitchCostActive() {
    return Boolean(this._edgeGlitchGateDiag().costActive);
  }

  /**
   * Park inactive vignette content on {@link INACTIVE_VIGNETTE_LAYER} so beauty
   * + neon shadow cameras (layer 0) skip traversal. Tubes / floor glow stay on 0.
   * From + destination stay on 0 during hops to avoid pop-in.
   */
  _syncInactiveVignetteLayers() {
    const s = this.cameraRig?.state;
    if (!s || !this.vignettes?.length) return;
    const to = s.index ?? 0;
    const settled = Boolean(s.isSettled);

    if (this._wasSettledForCull && !settled) {
      this._layerCullFromIndex = this._layerCullPrevIndex ?? to;
    }
    if (settled) {
      this._layerCullFromIndex = to;
    }
    this._wasSettledForCull = settled;
    this._layerCullPrevIndex = to;

    const keep = new Set([to]);
    if (!settled) keep.add(this._layerCullFromIndex);

    for (let i = 0; i < this.vignettes.length; i += 1) {
      const vig = this.vignettes[i];
      const entry = this.neon?.entries?.[i];
      const active = keep.has(i);
      /** @type {THREE.Object3D[]} */
      const roots = [];
      if (entry?.contentRoot) {
        roots.push(entry.contentRoot);
      } else if (vig?.group) {
        for (const child of vig.group.children) {
          if (
            child === entry?.tube ||
            child === entry?.floorGlow ||
            child.name === "neon-tube" ||
            child.name === "neon-floor-glow" ||
            child.name?.startsWith?.("arch-portal")
          ) {
            continue;
          }
          roots.push(child);
        }
      }
      for (const root of roots) {
        root.traverse((obj) => {
          if (obj.layers.isEnabled(GPU_HOLD_LAYER)) return;
          if (active) {
            obj.layers.disable(INACTIVE_VIGNETTE_LAYER);
            obj.layers.enable(0);
          } else {
            obj.layers.disable(0);
            obj.layers.enable(INACTIVE_VIGNETTE_LAYER);
          }
        });
      }
    }
  }

  /**
   * Apply governor wet / shadow / DPR side effects when the profile changes.
   */
  _syncPerfGovernorSideEffects() {
    const p = this.perfGovernor?.profile;
    if (!p) return;
    const wetN = p.wetProbeEveryN ?? null;
    if (wetN !== this._wetProbeEveryNOverride) {
      this._wetProbeEveryNOverride = wetN;
      this.wetFloor?.setProbeEveryN?.(wetN);
    }
    const mul = this.perfGovernor.effectiveDprMul;
    if (mul !== this._lastGovDprMul) {
      this._lastGovDprMul = mul;
      this._applyRenderScale();
    }
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
   * @param {boolean} on
   */
  setVolumetricEnabled(on) {
    if (!this.volumetricFog) return null;
    this._volFogUserOff = !on;
    if (on) {
      this._fogMode = "volumetric";
      this._videoFogUserOff = true;
      this.videoFog?.setUserOff?.(true);
      this.volumetricFog.setEnabled(true);
      this._volFogFade = 1;
      this.volumetricFog.setDensityScale(1);
      this.volumetricFog.setCompositeOpacity?.(1);
    } else {
      this.volumetricFog.setEnabled(false);
      this.volumetricFog.setDensityScale(0);
      this.volumetricFog.setCompositeOpacity?.(0);
      this._volFogFade = 0;
    }
    return this.debugVolumetricFog();
  }

  /**
   * DEV — atmosphere mode. Prefer `debugFog('video'|'volumetric'|'off')`.
   * @param {"volumetric" | "video" | "off" | boolean} [mode]
   */
  debugFog(mode = "volumetric") {
    if (!STAGE_FOG_ENABLED) {
      return {
        ok: false,
        reason: "STAGE_FOG_ENABLED=false — flip constants to restore fog systems",
        fogEnabled: false,
        mode: this._fogMode
      };
    }
    if (mode === true || mode === "volumetric" || mode === "on") {
      this._fogMode = "volumetric";
      this._videoFogUserOff = true;
      this.videoFog?.setUserOff?.(true);
      this.videoFog?.setEnabled?.(false);
      return this.setVolumetricEnabled(true);
    }
    if (mode === "video") {
      this._fogMode = "video";
      this._volFogUserOff = true;
      this.volumetricFog?.setEnabled(false);
      this.volumetricFog?.setDensityScale(0);
      this.volumetricFog?.setCompositeOpacity?.(0);
      this._volFogFade = 0;
      this._videoFogUserOff = false;
      this.videoFog?.setUserOff?.(false);
      this.videoFog?.setEnabled?.(true);
      this._videoFogFade = this.introComplete ? 1 : this._videoFogFade;
      this.videoFog?.setCompositeFade?.(this._videoFogFade);
      return this.debugVideoFog();
    }
    this._fogMode = "off";
    this._videoFogUserOff = true;
    this.videoFog?.setUserOff?.(true);
    this.videoFog?.setEnabled?.(false);
    return this.setVolumetricEnabled(false);
  }

  /** DEV — video fog plane state + pin reference. */
  debugVideoFog() {
    return {
      mode: this._fogMode,
      fade: this._videoFogFade ?? 0,
      userOff: this._videoFogUserOff,
      video: this.videoFog?.debug?.() ?? null,
      pinnedVolumetric: PINNED_VOLUMETRIC_FOG
    };
  }

  /**
   * Land fog with density FULL; cross-fade composite opacity (not density/in-scatter).
   * Hold bloom intensity at 0 across the opacity ramp so half-res extract does not
   * vignette-flash screen edges (C05 — one stage downstream of the density fix).
   * Bloom only ever sees fog at opacity 0 or 1, never the mid-ramp.
   * @param {number} dt
   */
  _tickVolumetricFog(dt) {
    if (!STAGE_FOG_ENABLED) return;
    const pass = this.volumetricFog;
    if (!pass) return;

    if (this._fogMode !== "volumetric" || !this.introComplete || this._volFogUserOff) {
      pass.setEnabled(false);
      pass.setDensityScale(0);
      pass.setCompositeOpacity?.(0);
      this._volFogFade = 0;
      return;
    }

    pass.setEnabled(true);
    // Density + in-scatter at authored strength — never ramp through bloom crossing.
    pass.setDensityScale(1);
    const fadeSec = FOG_HEAVY_FADE_IN_MS / 1000;
    const step = fadeSec > 0 ? Math.min(Math.max(dt, 0), 1 / 20) / fadeSec : 1;
    const wasComplete = this._volFogFade >= 1;
    this._volFogFade = Math.min(1, this._volFogFade + step);
    pass.setCompositeOpacity?.(this._volFogFade);
    if (!wasComplete && this._volFogFade >= 1 && this._introLandAt) {
      this._fogFadeDoneAt = performance.now();
      // Bloom return is owned by `_tickIntroBloomReturn` (shared with fog-off).
      this._bloomReturnT = 0;
    }
    // Hold bloom at 0 while opacity ramps (never extracts mid-fade).
    if (this._volFogFade < 1) {
      this._syncBloomForFogFade(false);
    }
  }

  /**
   * Video fog land fade (mirrors volumetric composite opacity timing).
   * @param {number} dt
   */
  _tickVideoFog(dt) {
    if (!STAGE_FOG_ENABLED) return;
    const fog = this.videoFog;
    if (!fog) return;

    if (this._fogMode !== "video" || !this.introComplete || this._videoFogUserOff) {
      fog.setEnabled(false);
      fog.setCompositeFade(0);
      this._videoFogFade = 0;
      return;
    }

    fog.setEnabled(true);
    const fadeSec = VIDEO_FOG_FADE_IN_MS / 1000;
    const step = fadeSec > 0 ? Math.min(Math.max(dt, 0), 1 / 20) / fadeSec : 1;
    const wasComplete = this._videoFogFade >= 1;
    this._videoFogFade = Math.min(1, this._videoFogFade + step);
    fog.setCompositeFade(this._videoFogFade);
    // Arrive + depth uniforms land later this frame; final update runs after setVignetteFog.

    if (!wasComplete && this._videoFogFade >= 1 && this._introLandAt) {
      this._fogFadeDoneAt = performance.now();
      this._bloomReturnT = 0;
    }
    if (this._videoFogFade < 1) {
      this._syncBloomForFogFade(false);
    }
  }

  /**
   * Soft-return neon bloom after intro land. Runs whether fog is parked or live —
   * fog ticks only *hold* bloom at 0 during opacity ramp; this path restores it.
   * @param {number} dt
   */
  _tickIntroBloomReturn(dt) {
    if (!this.post || this.reducedMotion || !this.introComplete) return;
    if (!this._introLandAt) return;

    // Fog still ramping opacity — do not restore yet (fog tick holds bloom at 0).
    if (STAGE_FOG_ENABLED) {
      if (this._fogMode === "volumetric" && !this._volFogUserOff && this._volFogFade < 1) {
        return;
      }
      if (this._fogMode === "video" && !this._videoFogUserOff && this._videoFogFade < 1) {
        return;
      }
    }

    const retSec = 0.18;
    const prev = this._bloomReturnT ?? 0;
    this._bloomReturnT = Math.min(
      1,
      prev + (retSec > 0 ? Math.min(Math.max(dt, 0), 1 / 20) / retSec : 1)
    );
    this.post.setBloomIntensity?.(NEON_BLOOM.intensity * this._bloomReturnT);
  }

  /**
   * Gate bloom around the land opacity fade. Does not touch reduced-motion (already 0).
   * @param {boolean} allowBloom
   */
  _syncBloomForFogFade(allowBloom) {
    if (!this.post || this.reducedMotion) return;
    const target = allowBloom ? NEON_BLOOM.intensity : 0;
    if (this.post.getBloomIntensity?.() === target) return;
    this.post.setBloomIntensity?.(target);
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

  /**
   * DEV — digital-noise fog (world hash cells). Scene stays sharp.
   * `amount` 0 = soft FBM, 1 = full digital. `cell` = voxel size in meters.
   * @param {number} [amount=1]
   * @param {number} [cell=0.14]
   */
  debugFogPixelate(amount = 1, cell = 0.14) {
    const a = Math.max(0, Math.min(1, Number(amount) || 0));
    const c = a <= 1e-6 ? 0 : Math.max(0.04, Math.min(0.8, Number(cell) || 0.14));
    return this.setVolumetricParams({
      outputPixelSize: 0,
      digitalNoiseAmount: a,
      digitalNoiseCell: c
    });
  }

  /** DEV — volumetric pass state for cost / soft-contact / toggle gates. */
  debugVolumetricFog() {
    const pass = this.volumetricFog;
    if (!pass) return null;
    const u = pass.marchMaterial?.uniforms;
    return {
      mode: this._fogMode,
      stageFogMode: STAGE_FOG_MODE,
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
      outputPixelSize: pass.compositeMaterial?.uniforms?.uOutputPixelSize?.value ?? null,
      digitalNoiseCell: u?.uDigitalNoiseCell?.value ?? null,
      digitalNoiseAmount: u?.uDigitalNoiseAmount?.value ?? null,
      lightIntensities: u?.uLightIntensity?.value?.slice?.() ?? null,
      noiseFrozen: Boolean(pass._noiseFrozen),
      vignetteFog: u?.uVignetteFog?.value ?? null,
      vignetteRadius: u?.uVignetteRadius?.value ?? null,
      ambient: u?.uAmbient?.value ?? null,
      pinned: PINNED_VOLUMETRIC_FOG.pinnedAt
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
    this.videoFog?.seatOnVignettes?.(this.vignettes);
    this._refreshContactShadows();
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
    this._introLandAt = performance.now();
    this._bloomReturnT = 0;
    this.post?.setBloomIntensity?.(0);
    this.introRig.descent = 0;
    this._introSettleUntil = performance.now() + INTRO_SETTLE_GRACE_MS;
    this._introHandoffUntil = performance.now() + INTRO_HANDOFF_MS;
    // Lean settle frame — no WaterCursor / GLB parse / texture upload here.
    // Those used to hitch exactly as the height spring ease-out kissed rest.
    this.cameraRig?.scrollAdvance?.notifySettled?.();
    // Stop 0 never travels into its arrive fade — latch arrive so neon/content
    // resolve to one stable lit state on the intro→first-settle handoff (C01).
    this.neon?.armArriveForActiveStop?.(this.cameraRig?.state?.index ?? 0);
    this._tickNeon(this.clock?.getElapsedTime?.() ?? 0, 1 / 60);
    this._schedulePostIntroAssetWork();
    if (!this._introIntegrateScheduled) {
      this._introIntegrateScheduled = true;
      this._scheduleIntroDeferredWork();
    }
    this._tryRevealDuo();
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
      const { w, h } = this._viewportCssSize();
      this.waterCursor.resize(w, h);
      // Pop at last known pointer if it was already in-frame during boot; else
      // stay hidden until the pointer enters (WaterCursor starts presence 0).
      const p = this._clientPointer;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        this.waterCursor.appearAt?.(p.x, p.y);
      }
    }
  }

  /**
   * Couple liquid cursor to the bust edge SDF on the GPU.
   * Gate: stop 0, camera settled, pointer live, workQuality ≥ 0.55, reduced-motion off.
   * No readPixels — the shader taps the SDF and applies blow / slurp / neck / push.
   */
  _tickWaterCursorRim() {
    const cursor = this.waterCursor;
    if (!cursor?.setRimGpu) return;

    const idx = this.cameraRig?.state?.index ?? this.current ?? 0;
    const settled = Boolean(this.cameraRig?.state?.isSettled);
    const live = Number.isFinite(this._lastPointer?.x);
    const src = this.edgeGlitch?.getRimGpuSource?.() ?? null;
    const gate =
      idx === 0 &&
      settled &&
      live &&
      !this.reducedMotion &&
      Boolean(src?.active);

    cursor.setRimGpu({
      gate,
      texture: src?.texture ?? null,
      size: src?.size,
      arm: src?.arm,
      ramp: src?.ramp,
      u: this.pointer.x * 0.5 + 0.5,
      v: this.pointer.y * 0.5 + 0.5
    });
  }

  /** Mark intro done once the spring pageload descent settles. */
  _tickIntroFromCameraRig() {
    if (this._introMotionComplete || !this.cameraRig) return;
    if (this._blackHoleActive) return;

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

  /** Desktop + Bust GLBs — Sidekick / Archaeology must not count toward the boot gate. */
  _startGatingModelFetches() {
    this.vignettes[0]?.instance?.startModelLoad?.();
    this.vignettes[1]?.instance?.startModelLoad?.();
  }

  /** Sidekick + Archaeology bytes — with the desktop fetch, not the boot manager. */
  _startDeferredModelFetches() {
    if (this._deferredModelsFetchStarted) return;
    this._deferredModelsFetchStarted = true;
    const sidekick = this.vignettes[2]?.instance;
    const archaeology = this.vignettes[3]?.instance;
    sidekick?.startModelLoad?.();
    // One meshopt decode at a time — parallel parse dropped both scenes.
    void this._startArchaeologyAfterSidekick(sidekick, archaeology);
  }

  async _startArchaeologyAfterSidekick(sidekick, archaeology) {
    const deadline = performance.now() + 20000;
    while (sidekick && !sidekick._modelLoadSettled && performance.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    archaeology?.startModelLoad?.();
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
    const archaeology = this.vignettes[3]?.instance;
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
              {
                force: true,
                neonLight: this.neon?.stopLights?.[1]?.light ?? null
              }
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

      await spanFrame("archaeology-integrate", () =>
        archaeology?.integrateAfterIntro?.({
          yieldFrame,
          revealHidden: true
        })
      );
      await this._compileThenShow(archaeology?.shelfRoot);
      await this._compileThenShow(archaeology?.venusRoot);
      await this._compileThenShow(archaeology?.antikytheraRoot);
      await this._compileThenShow(archaeology?.lucyRoot);
      await this._compileThenShow(archaeology?.lucyStandRoot);
      await this._compileThenShow(archaeology?.trojanHorseRoot);
      await this._compileThenShow(archaeology?.olmecHeadRoot);
      await this._compileThenShow(archaeology?.oliveBoatRoot);
      await this._compileThenShow(archaeology?.cuneiformRoot);
      await this._compileThenShow(archaeology?.cuneiformEaselRoot);
      await this._compileThenShow(archaeology?.ishtarGateRoot);
      await this._compileThenShow(archaeology?.ptolemyRoot);
      await this._compileThenShow(archaeology?.divjeBabeFluteRoot);
      await this._compileThenShow(archaeology?.neanderthalRoot);
      await this._compileThenShow(archaeology?.neanderthalStandRoot);

      stillHolding = Boolean(
        desktop?._holdForIntro ||
          sidekick?._holdForIntro ||
          archaeology?._holdForIntro ||
          (sidekick?._modelLoadStarted && !sidekick?._modelLoadSettled) ||
          (archaeology?._modelLoadStarted && !archaeology?._modelLoadSettled)
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

  _tickNeon(time, dt = 1 / 60) {
    if (!this.neon || !this.cameraRig) return;
    const s = this.cameraRig.state;
    // C01: do NOT OR with isSettled — aerial hold is also "settled" at pageload
    // height, which flashed stop 0 on → off (drop) → on (land). Neon/content
    // arm only after intro completes (land handoff).
    const allowNeon = Boolean(this.introComplete);
    this.neon.update(s.theta, this.vignettes.length, time, {
      activeIndex: s.index,
      settled: Boolean(s.isSettled),
      dt,
      allowNeon
    });
    this._tickAccentLights(time, dt, s.index);
    this._tickContactShadows();

    const neonPos =
      this.neon?.stopLights?.[s.index]?.light?.position ?? null;
    // Wet-floor CubeCamera only while settled — hops skip the 6-face probe.
    if (!s.isSettled) {
      this.wetFloor?.setBubbleCenter?.(neonPos);
      return;
    }
    const vig = this.vignettes?.[s.index]?.instance;
    const hideExtra = [];
    if (vig?.grassRoot) hideExtra.push(vig.grassRoot);
    if (vig?.grassEngine?.root) hideExtra.push(vig.grassEngine.root);
    const glow = this.neon?.entries?.[s.index]?.floorGlow;
    if (glow) hideExtra.push(glow);
    const al = this.accentLights;
    if (al) {
      for (const L of [al.rimA, al.rimB, al.sweep, al.shaft]) {
        if (L) hideExtra.push(L);
      }
    }
    this.wetFloor?.update?.(time, { probeWorld: neonPos, hideExtra });
  }

  /**
   * Rim + sweep + shaft shaft accents (stop 0 first). No ambient fill.
   * @param {number} time
   * @param {number} dt
   * @param {number} activeIndex
   */
  _tickAccentLights(time, dt, activeIndex) {
    if (!this.accentLights) return;
    const maxLight = this.neon?._maxLight || 1;
    const neonLight = this.neon?.stopLights?.[activeIndex]?.light;
    const arriveLevel = neonLight
      ? neonLight.intensity / Math.max(maxLight, 1e-6)
      : 0;
    this.accentLights.update(time, {
      activeIndex,
      arriveLevel,
      dt,
      subjectRoot: this._accentSubjectForStop(activeIndex),
      keyLight: neonLight ?? null
    });
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

  /** Duo FAB seat / fit / client rect — `window.__stage.debugDuo()`. */
  debugDuo() {
    const state = this.duoFab?.debugState?.() ?? { ready: false };
    console.info("[DuoFab]", state);
    return state;
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
      {
        force: true,
        neonLight: this.neon?.stopLights?.[1]?.light ?? null
      }
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
      this.vignettes[3]?.instance?.shelfRoot,
      this.vignettes[3]?.instance?.venusRoot,
      this.vignettes[3]?.instance?.antikytheraRoot,
      this.vignettes[3]?.instance?.lucyRoot,
      this.vignettes[3]?.instance?.lucyStandRoot,
      this.vignettes[3]?.instance?.trojanHorseRoot,
      this.vignettes[3]?.instance?.olmecHeadRoot,
      this.vignettes[3]?.instance?.oliveBoatRoot,
      this.vignettes[3]?.instance?.cuneiformRoot,
      this.vignettes[3]?.instance?.cuneiformEaselRoot,
      this.vignettes[3]?.instance?.ishtarGateRoot,
      this.vignettes[3]?.instance?.ptolemyRoot,
      this.vignettes[3]?.instance?.divjeBabeFluteRoot,
      this.vignettes[3]?.instance?.neanderthalRoot,
      this.vignettes[3]?.instance?.neanderthalStandRoot
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
      // Deferred Archaeology GLBs can mount after the fade already hit 1; stamp them.
      if (opacity >= 1 && root.userData._revealStamped) continue;
      setGroupRenderOpacity(root, opacity);
      if (opacity >= 1) root.userData._revealStamped = true;
    }
  }

  _buildVignettes() {
    const defs = [bustVignetteMeta, desktopVignetteMeta, sidekickVignetteMeta, archaeologyVignetteMeta];
    const instances = [];

    defs.forEach((def, index) => {
      const group = new THREE.Group();
      const total = defs.length;
      const angle = placeOnStage(group, index, total);
      const stageDeg = vignetteStageDegrees(index, total);

      if (index === 0) {
        const bust = new BustVignette(group, {
          vignetteIndex: index,
          loadingManager: this.loadingManager,
          renderer: this.renderer,
          reducedMotion: this.reducedMotion,
          // Gate with Desktop — arrival stop must be ready when the fader lifts.
          deferModelLoad: true,
          onAligned: () => {
            this._snapAllVignettesToFloor();
            this._attachEdgeGlitchBust();
          }
        });
        instances.push({ def, group, angle, stageDeg, instance: bust });
      } else if (index === 1) {
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
        const archaeology = new ArchaeologyVignette(group, {
          vignetteIndex: index,
          scrollCapture: this.scrollCapture,
          reducedMotion: this.reducedMotion,
          introGate: () => !this.introComplete,
          deferModelLoad: true,
          onAligned: () => this._snapAllVignettesToFloor(),
          onPropMounted: (root) => {
            void this._compileThenShow(root);
          }
        });
        instances.push({ def, group, angle, stageDeg, instance: archaeology });
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

  /** Placeholder blockouts on Bust are only visible on the active vignette. */
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
      fps: document.getElementById("fps"),
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
    if (!this.cameraRig || !this.introComplete || this.locked || this.duoMode) return;
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
    if (!this.introComplete || this.locked || this.duoMode) return;
    if (!this.cameraRig.state.isSettled) return;
    this._prepareForVignetteTransition(this.current);
    this.cameraRig.advance(Math.sign(steps));
  }

  next = (options) => this.advance(1, options);
  prev = (options) => this.advance(-1, options);

  _bindInput() {
    this._onWheel = (event) => {
      if (this.locked || this.duoMode) {
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
        if (this.duoCaseStudy?.isOpen) {
          this._duoCloseAll();
          return;
        }
        if (this.duoMail?.isOpen || this.duoFab?.state === "mail") {
          this._duoCloseToIdle();
          return;
        }
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
      if (this.duoMode) return;
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
        if (this._touchCapture || this.duoMode) {
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

  /**
   * Shrink/hide the water cursor while the pointer is over Mail or case-study UI.
   * @param {number} clientX
   * @param {number} clientY
   */
  _syncWaterCursorUiChrome(clientX, clientY) {
    if (!this.waterCursor?.setUiChromeSuppressed) return;
    const over = this._pointerOverDuoUiChrome(clientX, clientY);
    this.waterCursor.setUiChromeSuppressed(over);
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {boolean}
   */
  _pointerOverDuoUiChrome(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
    const mailOpen = Boolean(this.duoMail?.isOpen);
    const caseOpen = Boolean(this.duoCaseStudy?.isOpen);
    if (!mailOpen && !caseOpen) return false;
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return false;
    if (caseOpen && el.closest?.("#duo-case-study-overlay.is-open, .duo-cs")) {
      return true;
    }
    if (mailOpen && el.closest?.("#duo-mail-overlay .duo-mail, .duo-mail")) {
      return true;
    }
    return false;
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
    this._syncWaterCursorUiChrome(clientX, clientY);

    if (this.duoFab?.ready && this.duoFab.isLive && !this.duoMode && !this.locked) {
      const onDuo = this.duoFab.hitTest(clientX, clientY);
      this.duoFab.setHovered(onDuo);
      if (onDuo) {
        this.scrollCapture.clearPointer?.();
        this._screenHover = false;
        this._pcScreenHovered = false;
        if (!this.waterCursor) this.canvas.style.cursor = "pointer";
        this._setScrollCaptureBlendTarget(false);
        return null;
      }
    } else if (this.duoFab && this.duoMode) {
      this.duoFab.setHovered(false);
    }

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
      const onArchaeology = this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.archaeology;
      if (!this.waterCursor) {
        const cursorMode = hovering
          ? "pointer"
          : this._pcScreenHovered
            ? this.focusBlend > 0.02
              ? "pointer"
              : "zoom-in"
            : onSidekick || onArchaeology
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
    if (meshId === SCROLL_CAPTURE_MESH_IDS.archaeology) {
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
    if (this.locked || this.duoMode) return;
    if (this._ignoreNextVignetteClick) {
      this._ignoreNextVignetteClick = false;
      event.stopImmediatePropagation();
      return;
    }
    this.vignetteClick?.handleClick?.(event);
  };

  /** Sidekick / Archaeology zoom toggle. */
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

  _toggleArchaeologyZoom() {
    this._toggleIndexedZoom(3);
  }

  _onPointerDown = (event) => {
    if (this.locked) return;

    // Duo FAB = Mail overlay toggle (seat stays put; no enlarge).
    if (this.duoFab?.ready && this.duoFab.isLive) {
      if (this.duoCaseStudy?.isOpen) {
        // Clicks inside the modal are handled by DOM; ignore canvas.
        event.stopImmediatePropagation();
        return;
      }
      const onDuo = this.duoFab.hitTest(event.clientX, event.clientY);
      if (this.duoMail?.isOpen) {
        if (onDuo) {
          this._duoToggleMail();
        } else {
          // Click outside the Mail panel (canvas / stage) dismisses.
          this._duoCloseToIdle();
        }
        this._ignoreNextVignetteClick = true;
        event.stopImmediatePropagation();
        return;
      }
      if (onDuo) {
        this._duoToggleMail();
        this._ignoreNextVignetteClick = true;
        event.stopImmediatePropagation();
        return;
      }
    }

    this._updateHoverFromClient(event.clientX, event.clientY);

    const onSidekick =
      this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.sidekick;
    const onArchaeology =
      this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.archaeology;
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

    if (onArchaeology && this.cameraRig?.state?.index === 3) {
      this.waterCursor?.setPressed(true);
      this._toggleArchaeologyZoom();
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
    this._initBlackHoleIntro();
  }

  /**
   * Night-sky approach, then click → spiral, then the existing aerial drop.
   * `?blackhole=0` and reduced motion skip straight to that drop.
   */
  _initBlackHoleIntro() {
    const skip =
      this.reducedMotion ||
      new URLSearchParams(window.location.search).get("blackhole") === "0";
    if (skip) return;

    this.blackHoleSeq = new BlackHoleCameraSequence(this.camera);
    this.blackHole = createBlackHoleModel(BLACK_HOLE_CENTER);
    this.scene.add(this.blackHole.group);
    this.cameraRig.poseSuspended = true;
    this._blackHoleActive = true;
    this.world.visible = false;
    this._spotIntensitySaved = this.spotLight?.intensity ?? SPOT_INTENSITY;
    if (this.spotLight) {
      this.spotLight.intensity = 0;
      this.spotLight.castShadow = false;
    }
    document.body.classList.add("is-black-hole");

    this._onBlackHolePointerDown = (event) => {
      if (event.button != null && event.button !== 0) return;
      this._triggerBlackHoleSpiral();
    };
    this._onBlackHoleKeyDown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      event.preventDefault();
      this._triggerBlackHoleSpiral();
    };
    window.addEventListener("pointerdown", this._onBlackHolePointerDown);
    window.addEventListener("keydown", this._onBlackHoleKeyDown);
  }

  _showBlackHoleEnter() {
    if (!this._blackHoleActive) return;
    document.getElementById("bh-enter")?.removeAttribute("hidden");
  }

  _triggerBlackHoleSpiral() {
    if (!this._blackHoleActive || this.locked) return;
    if (this.blackHoleSeq?.phase !== BLACK_HOLE_PHASE.APPROACH) return;
    this.blackHoleSeq.triggerSpiral();
    document.getElementById("bh-enter")?.setAttribute("hidden", "");
    this._unbindBlackHoleInput();
  }

  _unbindBlackHoleInput() {
    if (this._onBlackHolePointerDown) {
      window.removeEventListener("pointerdown", this._onBlackHolePointerDown);
      this._onBlackHolePointerDown = null;
    }
    if (this._onBlackHoleKeyDown) {
      window.removeEventListener("keydown", this._onBlackHoleKeyDown);
      this._onBlackHoleKeyDown = null;
    }
  }

  /**
   * Spiral finished. Hide the hole, restore the stage, snap to the aerial
   * apex, and arm the existing height spring (13.85 m → 2.85 m).
   */
  _onBlackHoleSpiralComplete() {
    if (!this._blackHoleActive) return;
    this._blackHoleActive = false;
    this._unbindBlackHoleInput();
    this.blackHole?.hide();
    this.world.visible = true;
    if (this.spotLight) {
      this.spotLight.intensity = this._spotIntensitySaved ?? SPOT_INTENSITY;
      this.spotLight.castShadow = (this._spotIntensitySaved ?? SPOT_INTENSITY) > 0;
    }
    document.body.classList.remove("is-black-hole");
    document.getElementById("bh-enter")?.setAttribute("hidden", "");

    const rig = this.cameraRig;
    if (!rig) return;
    const s = rig.state;
    const apex = CAMERA_PAGELOAD_HEIGHT;
    s.theta = this.ring?.[0]?.angle ?? 0;
    s.thetaVelocity = 0;
    s.thetaTarget = s.theta;
    s.radius = rig.restRadius;
    s.radiusVelocity = 0;
    s.radiusTarget = rig.restRadius;
    s.radialOffset = 0;
    s.radialOffsetVelocity = 0;
    s.radialOffsetTarget = 0;
    s.height = apex;
    s.heightVelocity = 0;
    s.heightTarget = apex;
    s.isSettled = false;
    rig._introActive = true;
    rig.poseSuspended = false;
    this._introSpringArmed = true;
    rig.armIntroDescent();
  }

  _tickBlackHole(dt) {
    if (!this._blackHoleActive || !this.blackHoleSeq) return;
    this.blackHoleSeq.update(dt, () => this._onBlackHoleSpiralComplete());
    this._applyBlackHoleRestParallax(dt);
    this.blackHole?.update(dt);
  }

  /**
   * Hold pose only: the same cursor offset the vignettes use, faded in as the
   * approach settles. The sequence rewrites `camera.position` from its own
   * state each frame, so this add does not feed the ease or the spiral.
   */
  _applyBlackHoleRestParallax(dt) {
    const blend = this.blackHoleSeq?.restParallaxBlend?.() ?? 0;
    const parallax = this.cameraRig?.parallax;
    if (!parallax || blend <= 0) return;
    parallax.update(dt);
    this.camera.updateMatrixWorld();
    parallax.getOffset(this.camera, _BH_PARALLAX_OFFSET);
    this.camera.position.addScaledVector(_BH_PARALLAX_OFFSET, blend);
  }

  /**
   * Over the disk, the liquid cursor rides invisible spiral lanes and keeps
   * the flow heading when the pointer stops. Off the disk, and after handoff,
   * the guide drops so the pointer leads again.
   */
  _tickBlackHoleCursorShear(dt) {
    const cursor = this.waterCursor;
    if (!cursor?.setDiskShear) return;
    if (!this._blackHoleActive || !this.blackHole?.ready || !this.blackHole.group?.visible) {
      cursor.setDiskShear(null);
      return;
    }
    const p = this._lastPointer;
    if (!Number.isFinite(p?.x)) {
      cursor.setDiskShear(null);
      return;
    }
    const { w, h } = this._viewportCssSize();
    const blob = cursor._pos;
    cursor.setDiskShear(
      this.blackHole.samplePointerShear(this.camera, p.x, p.y, w, h, blob?.x, blob?.y, dt)
    );
  }

  /** CSS viewport size — prefer documentElement so panel chrome doesn’t desync canvas. */
  _viewportCssSize() {
    const el = document.documentElement;
    const w = Math.max(1, el?.clientWidth || window.innerWidth || 1);
    const h = Math.max(1, el?.clientHeight || window.innerHeight || 1);
    return { w, h };
  }

  _onResize = () => {
    const { w, h } = this._viewportCssSize();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // false → keep CSS full-bleed (inline px from setSize was the right-edge gutter).
    this.renderer.setSize(w, h, false);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissorTest(false);
    this.post.setSize(w, h);
    this.neon?.setSize?.(this.renderer);
    this.videoFog?.setSizeFromRenderer?.(this.renderer);
    const draw = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(draw);
    this.edgeGlitch?.setSize?.(draw.x, draw.y);
    this.duoFab?.setSize?.(w, h);
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
    const archaeology = this.vignettes[3]?.instance;
    const active = this._getActiveInstance();

    if (active !== sidekick && active !== archaeology) {
      active?.update?.(t);
    }

    if (sidekick?._aligned) {
      sidekick.update(t);
    }
    if (archaeology?._aligned) {
      archaeology.update(t);
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
        {
          force: Boolean(desktop?._pendingCrtEnvRefresh),
          neonLight: this.neon?.stopLights?.[1]?.light ?? null
        }
      );
      if (desktop?._pendingCrtEnvRefresh) {
        desktop._pendingCrtEnvRefresh = false;
      }
    } else if (this.introComplete && desktop?.glassMesh) {
      // Neon glass glint every frame — not gated on heavy-effects / env recapture.
      desktop.syncGlassNeon?.(
        this.cameraRig?.state?.index === 1
          ? this.neon?.stopLights?.[1]?.light ?? null
          : null
      );
    }

    this.animFns.forEach((fn) => fn(t));

    this.parallaxDampZones?.update(dt);
    this.cameraRig?.parallax?.setStrength?.(this.parallaxDampZones?.scale ?? 1);
    this._tickBlackHole(dt);
    this._tickBlackHoleCursorShear(dt);
    this.cameraRig?.update(dt);
    if (this.starfield) {
      updateStarfield(this.starfield, this.camera, t, {
        wrap: this._blackHoleActive,
        pixelRatio: this.renderer?.getPixelRatio?.() ?? this.pixelRatio ?? 1
      });
    }
    updateMilkyWayDome(
      this.milkyWayDome,
      this.camera,
      t,
      this._blackHoleActive ? this.blackHole?.group?.position : null,
      this._blackHoleActive
    );
    if (this.nebulaClouds) this.nebulaClouds.visible = this._blackHoleActive;
    updateNebulaCluster(this.nebulaClouds, this.camera, t);
    this._tickIntroFromCameraRig();
    this._syncCameraRigIndex();
    this._syncCameraRigZoom();
    this._aimPovSpotlight();
    this.duoFab?.tick?.(dt, t);
    this.duoMail?.tick?.(dt);
    if (this.duoMail?.isOpen && this._lastPointer) {
      this.duoMail.setPointerClient?.(this._lastPointer.x, this._lastPointer.y);
    }

    if (this.introComplete) {
      this._applyVignetteMotion(t);
    }
    this._tickModelReveal(dt);
    this._tickPostGrainStrength(dt);
    this._tickNeon(t, dt);
    this._tickVolumetricFog(dt);
    this._tickVideoFog(dt);
    this._tickIntroBloomReturn(dt);
    this._syncInactiveVignetteLayers();

    // Motion DPR + adaptive governor (EMA frame ms → step-down ladder).
    const frameMs = dt > 0 && dt < 1 ? dt * 1000 : this._lastFrameMs;
    this._lastFrameMs = frameMs;
    this.perfGovernor?.tick?.(dt, {
      settled: Boolean(this.cameraRig?.state?.isSettled),
      fullDpr: this._fullPixelRatio,
      frameMs
    });
    this._syncPerfGovernorSideEffects();

    if (this.ui.readout) {
      const deg = this._getDisplayStageDegrees();
      this.ui.readout.textContent = `STAGE ${deg.toFixed(1).padStart(5, "0")}°`;
    }

    if (dt > 0 && dt < 1) {
      const instant = 1 / dt;
      this._fpsEma += (instant - this._fpsEma) * Math.min(1, dt * 3);
    }
    this._fpsDomT += dt;
    if (this.ui.fps && this._fpsDomT >= 0.25) {
      this._fpsDomT = 0;
      this.ui.fps.textContent = `${Math.round(this._fpsEma)} FPS`;
    }

    // FogDepthCapture: full-scene depth only while edge-glitch occlusion needs it
    // (fog parked behind STAGE_FOG_ENABLED — no every-frame tax when glitch idle).
    const glitchCost = this._edgeGlitchCostActive();
    let depthTex = null;
    this.frameBudget?.start?.("fog-depth");
    if (glitchCost || (STAGE_FOG_ENABLED && (this.volumetricFog || this.videoFog))) {
      this.neon?.captureFogDepth?.(this.renderer, this.scene, this.camera);
      depthTex = this.neon?.depthCapture?.depthTexture ?? null;
    }
    if (STAGE_FOG_ENABLED && this.volumetricFog && depthTex) {
      this.volumetricFog.setSceneDepth(depthTex, {
        packed: true
      });
      if (this.volumetricFog.enabled) {
        const neonLights = this.neon.stopLights?.map((s) => s.light) ?? [];
        const accentFog = this.accentLights?.getFogLights?.() ?? [];
        this.volumetricFog.setLights([...neonLights, ...accentFog]);
        const densTune = this.accentLights?.getFogDensityTune?.() ?? null;
        this.volumetricFog.setNearTubeDensity?.(
          densTune
            ? {
                boost: densTune.nearTubeDensityBoost,
                radius: densTune.nearTubeDensityRadius
              }
            : null
        );
        const activeIndex = this.cameraRig?.state?.index ?? this.current ?? 0;
        const activeNeon = this.neon.stopLights?.[activeIndex]?.light ?? null;
        const arriveLevel = this.neon.getArriveLevel?.(activeIndex) ?? 0;
        const vigGroup = this.vignettes?.[activeIndex]?.group;
        const fogCenter = vigGroup?.position ?? activeNeon?.position ?? null;
        this.volumetricFog.setVignetteFog?.({
          center: fogCenter,
          level: this.introComplete ? arriveLevel : 0,
          radius: VIGNETTE_FOG_RADIUS,
          feather: VIGNETTE_FOG_FEATHER
        });
      }
    }
    if (STAGE_FOG_ENABLED && this.videoFog && depthTex && this._fogMode === "video") {
      this.videoFog.setSceneDepth(depthTex, { packed: true });
      this.videoFog.setSizeFromRenderer(this.renderer);
      const activeIndex = this.cameraRig?.state?.index ?? this.current ?? 0;
      const activeNeon = this.neon?.stopLights?.[activeIndex]?.light ?? null;
      const arriveLevel = this.neon?.getArriveLevel?.(activeIndex) ?? 0;
      const vigGroup = this.vignettes?.[activeIndex]?.group;
      const neonWorld =
        activeNeon?.position ?? vigGroup?.position ?? null;
      const neonColor =
        activeNeon?.color ?? this.neon?.entries?.[activeIndex]?.dominant ?? null;
      this.videoFog.setVignetteFog({
        activeIndex,
        level: this.introComplete ? arriveLevel : 0,
        neonWorld,
        neonColor
      });
      this.videoFog.update(dt, { camera: this.camera });
    }
    this.frameBudget?.endSpan?.("fog-depth");

    // Edge SDF + glitch — settled + glitch stop + cursor-near (never governor-cut).
    if (this.edgeGlitch) {
      const passU = this._edgeGlitchPass?.uniforms;
      if (glitchCost) {
        if (depthTex) this.edgeGlitch.setSceneDepth?.(depthTex);
        const activeIndex = this.cameraRig?.state?.index ?? this.current ?? 0;
        const activeRoot = this._edgeGlitchRootForStop(activeIndex);
        const hasRoot = Array.isArray(activeRoot)
          ? activeRoot.length > 0
          : Boolean(activeRoot);
        this.edgeGlitch.setPointerNdc(this.pointer, {
          live: Number.isFinite(this._lastPointer?.x)
        });
        const neonHue =
          this.neon?.stopLights?.[activeIndex]?.light?.color ??
          this.neon?.entries?.[activeIndex]?.dominant ??
          null;
        this.edgeGlitch.setNeonHue?.(neonHue);
        this.frameBudget?.start?.("edge-sdf");
        this.edgeGlitch.update({
          activeIndex,
          activeRoot,
          bustReady: hasRoot,
          time: t
        });
        this.frameBudget?.endSpan?.("edge-sdf");
      } else {
        if (passU) passU.uEnabled.value = 0;
        if (this.edgeGlitch._overlay) this.edgeGlitch._overlay.visible = false;
      }
    }
    this._tickWaterCursorRim();

    this.frameBudget?.start?.("beauty");
    this.post.render(this.scene, this.camera, t, {
      grainStrength: this._postGrainStrength
    });
    this.frameBudget?.endSpan?.("beauty");
    // Duo HUD sits above the stage (own lights / camera); cursor stays on top.
    this.duoFab?.render?.(this.renderer);
    this.waterCursor?.render();
    this.frameBudget?.end(dt);
    requestAnimationFrame(this._animate);
  }
}
