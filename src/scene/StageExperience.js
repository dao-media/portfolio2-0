import * as THREE from "three";
import gsap from "gsap";
import { HUDController } from "../ui/HUDController.js";
import { DesktopVignette, desktopVignetteMeta } from "./vignettes/DesktopVignette.js";
import { BustVignette, bustVignetteMeta } from "./vignettes/BustVignette.js";
import { addDegreeLabels } from "./stage/placeholderVignettes.js";
import { SidekickVignette, sidekickVignetteMeta } from "./vignettes/SidekickVignette.js";
import {
  configureSidekickScreenMaterial,
  ensureSidekickScreenMapLocked
} from "./vignettes/sidekickScreenTexture.js";
import { ArchaeologyVignette, archaeologyVignetteMeta } from "./vignettes/ArchaeologyVignette.js";
import { PostPass } from "./stage/PostPass.js";
import { CursorDepthOfField } from "./stage/CursorDepthOfField.js";
import { createStageLoadGate } from "./stage/StageLoadGate.js";
import { StageBootSequence } from "../ui/xpBoot/StageBootSequence.js";
import { NeonSystem } from "./neon/NeonSystem.js";
import { EdgeGlitchSystem } from "./edgeGlitch/EdgeGlitchSystem.js";
import { EdgeGlitchPass } from "./edgeGlitch/EdgeGlitchPass.js";
import { EDGE_GLITCH_STAGE } from "./edgeGlitch/constants.js";
import { AccentLightSystem } from "./accent/AccentLightSystem.js";
import { createFogParams } from "../fog/fogConfig.js";
import { configureSpotShadow } from "./stage/configureSpotShadow.js";
import { VignetteContactShadows } from "./stage/VignetteContactShadows.js";
import { LiveStageEnvironment } from "./stage/LiveStageEnvironment.js";
import { buildStageStudioRoom } from "./stage/StageStudioRoom.js";
import { buildStageFloor } from "./stage/StageFloor.js";
import { createCursorStarTrail, updateCursorStarTrail } from "./blackhole/CursorStarTrail.js";
import { createStarField, rebuildStarField, updateStarField, STAR_FIELD_RADIUS } from "./blackhole/StarField.js";
import { createFlightStarStreak, updateFlightStarStreak, STREAK_SPAWN_AHEAD } from "./blackhole/FlightStarStreak.js";
import {
  loadWetFloorTextures,
  WetFloorSystem
} from "./floor/WetFloorSystem.js";
import { createEnvLightParams } from "./stage/envLightConfig.js";
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
  SKY_BG,
  REST_DPR,
  REST_PIXEL_BUDGET_MP,
  FLOOR_DROP_MS,
  FLOOR_FRAME_MS,
  FLOOR_MIN_MP,
  FLOOR_MP_NOTCHES,
  FLOOR_RECOVER_MS,
  FLOOR_RECOVER_SEC,
  BLACK_HOLE_DPR,
  BLACK_HOLE_MSAA,
  EXPOSURE,
  BOOT_MIN_MS,
  NEON_BLOOM,
  CURSOR_DOF,
  WET_FLOOR_LAYER,
  SKY_LAYER,
  STAGE_FOG_MODE,
  STAGE_FOG_ENABLED,
  INACTIVE_VIGNETTE_LAYER,
  STOP_FADE_IN_RAD,
  NEON_FOG_LAYER,
  NEON_SHADOW
} from "./stage/constants.js";
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
  compileHeldRootVariants,
  releaseRootToCamera,
  setGroupRenderOpacity,
  withAuthoredVariant,
  withFadeVariant,
  warmMeshesChunked
} from "./stage/stageModelReveal.js";
import { FlightRecorder, noteFlight, readFlightEnabled, setActiveFlightRecorder } from "./stage/flightRecorder.js";
import { createFrameBudget, setActiveFrameBudget, spanFrame, tagFrame } from "./stage/frameBudget.js";
import { createStageLightRig } from "./stage/StageLightRig.js";
import {
  StagePerfGovernor,
  MOTION_DPR
} from "./stage/stagePerfGovernor.js";
import { restFidelityForIndex, restResource } from "./stage/restFidelity.js";
import { createVignette0WarmState, stepVignette0Warm } from "./stage/warmVignette0.js";
import { ChunkedTextureQueue } from "./stage/chunkedTextureUpload.js";
import { SidekickGroundFog } from "./vignettes/SidekickGroundFog.js";
import { STAGE_FLOOR_Y, measureBlockoutReferenceBounds, measureSceneBounds, snapAllGroupsToFloor, snapGroupToFloor } from "./vignettes/pcSceneBlockout.js";
import { preloadPcTextures, setPcTextureLoadingManager } from "./vignettes/pcProductionMaterials.js";
import { WaterCursor } from "../cursor/WaterCursor.js";
import { WorkerCrtPlaceholder } from "../stage/workerCrtPlaceholder.js";
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
 * Pass B item 2 (washed-out blacks): Ptolemy, Ishtar and Lucy's materials
 * all have `envMap: null`, so per-material `envMapIntensity` (set by
 * `polishMesh`'s `forceLit` branch) is dead — r172 instead drives their
 * ambient term off `scene.environmentIntensity` (0.6, do-not-touch) alone.
 * Olmec reads correctly under the same neon with that same global, so the
 * fix is per-prop: give just these roots the studio PMREM as their own
 * `envMap` (see `_applyArchaeologyEnvMap`) so `envMapIntensity` finally
 * takes effect, then tune it down until their darkest-5% matches Olmec's.
 * Values picked by isolated-render A/B screenshots (hide everything but the
 * one prop, reframe tight, compare): Ishtar's glazed-brick blue reads
 * noticeably richer/less washed out already at 0.16, but the same 0.16
 * crushed Ptolemy and Lucy into near-silhouettes and lost their carved
 * detail, so they get a gentler 0.3. Olmec is left alone (still
 * `envMap: null`, still governed by `scene.environmentIntensity`) since it
 * is the reference, not a prop to fix.
 */
const ARCHAEOLOGY_ENV_MAP_INTENSITY = {
  "ptolemy-root": 0.3,
  "ishtar-gate-root": 0.16,
  "lucy-root": 0.3
};

/**
 * `?work` or `?work=1` → 60% object raster. `?quality=0.6` sets the scale.
 * `?work=0` forces full. Screen canvases are not read from this.
 */
function readWorkRenderScale(search) {
  const params = new URLSearchParams(
    search != null ? search : window.location.search
  );
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
 * Pass B item 3 — AO prototype, off by default. `?ao=1` (or `ao=true`)
 * enables N8AO on the composer; any other value, or its absence, leaves it
 * off. Prototype only — not wired to a persisted setting.
 */
function readAoEnabled(search) {
  const params = new URLSearchParams(
    search != null ? search : window.location.search
  );
  const v = params.get("ao");
  return v === "1" || v === "true";
}

/** Tail of three r172 WebGLPrograms.getProgramCacheKey, last token first in the split. */
const PROGRAM_KEY_TAIL = [
  "precision",
  "outputColorSpace",
  "envMapMode",
  "envMapCubeUVHeight",
  "mapUv",
  "alphaMapUv",
  "lightMapUv",
  "aoMapUv",
  "bumpMapUv",
  "normalMapUv",
  "displacementMapUv",
  "emissiveMapUv",
  "metalnessMapUv",
  "roughnessMapUv",
  "anisotropyMapUv",
  "clearcoatMapUv",
  "clearcoatNormalMapUv",
  "clearcoatRoughnessMapUv",
  "iridescenceMapUv",
  "iridescenceThicknessMapUv",
  "sheenColorMapUv",
  "sheenRoughnessMapUv",
  "specularMapUv",
  "specularColorMapUv",
  "specularIntensityMapUv",
  "transmissionMapUv",
  "thicknessMapUv",
  "combine",
  "fogExp2",
  "sizeAttenuation",
  "morphTargetsCount",
  "morphAttributeCount",
  "numDirLights",
  "numPointLights",
  "numSpotLights",
  "numSpotLightMaps",
  "numHemiLights",
  "numRectAreaLights",
  "numDirLightShadows",
  "numPointLightShadows",
  "numSpotLightShadows",
  "numSpotLightShadowsWithMaps",
  "numLightProbes",
  "shadowMapType",
  "toneMapping",
  "numClippingPlanes",
  "numClipIntersection",
  "depthPacking",
  "boolMaskA",
  "boolMaskB",
  "rendererColorSpace",
  "customProgramCacheKey"
];

const PROGRAM_MASK_A = [
  "supportsVertexTextures",
  "instancing",
  "instancingColor",
  "instancingMorph",
  "matcap",
  "envMap",
  "normalMapObjectSpace",
  "normalMapTangentSpace",
  "clearcoat",
  "iridescence",
  "alphaTest",
  "vertexColors",
  "vertexAlphas",
  "vertexUv1s",
  "vertexUv2s",
  "vertexUv3s",
  "vertexTangents",
  "anisotropy",
  "alphaHash",
  "batching",
  "dispersion",
  "batchingColor"
];

const PROGRAM_MASK_B = [
  "fog",
  "useFog",
  "flatShading",
  "logarithmicDepthBuffer",
  "reverseDepthBuffer",
  "skinning",
  "morphTargets",
  "morphNormals",
  "morphColors",
  "premultipliedAlpha",
  "shadowMapEnabled",
  "doubleSided",
  "flipSided",
  "useDepthPacking",
  "dithering",
  "transmission",
  "sheen",
  "opaque",
  "pointsUvs",
  "decodeVideoTexture",
  "decodeVideoTextureEmissive",
  "alphaToCoverage"
];

function maskBits(prev, next, names) {
  const left = Number(prev);
  const right = Number(next);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return [`${prev}>${next}`];
  const changed = left ^ right;
  const parts = [];
  for (let i = 0; i < names.length; i += 1) {
    if ((changed & (1 << i)) === 0) continue;
    parts.push(`${names[i]}:${(left >> i) & 1}>${(right >> i) & 1}`);
  }
  return parts.length ? parts : [`${prev}>${next}`];
}

/** All 4 points within `eps` px on both axes — a perspective quad is not a rect. */
function cornersWithin(a, b, eps) {
  for (let i = 0; i < 4; i += 1) {
    if (Math.abs(a[i][0] - b[i][0]) >= eps || Math.abs(a[i][1] - b[i][1]) >= eps) return false;
  }
  return true;
}

/**
 * Which cache-key fields differ between a warm program and the live one.
 * @param {string[] | undefined} warmKeys
 * @param {string} liveKey
 */
function programKeyDelta(warmKeys, liveKey) {
  if (!warmKeys?.length) return "no-warm-key";
  if (warmKeys.includes(liveKey)) return "";
  let best = null;
  for (let k = 0; k < warmKeys.length; k += 1) {
    const diff = diffProgramKeys(warmKeys[k], liveKey);
    if (!best || diff.length < best.length) best = diff;
  }
  return best || "opaque";
}

function diffProgramKeys(warmKey, liveKey) {
  const warm = String(warmKey).split(",");
  const live = String(liveKey).split(",");
  const n = PROGRAM_KEY_TAIL.length;
  const parts = [];
  if (warm.length !== live.length) parts.push(`len ${warm.length}>${live.length}`);
  const warmStart = warm.length - n;
  const liveStart = live.length - n;
  if (warmStart < 0 || liveStart < 0) return `unaligned ${warm.length}/${live.length}`;
  const warmPrefix = warm.slice(0, warmStart).join(",");
  const livePrefix = live.slice(0, liveStart).join(",");
  if (warmPrefix !== livePrefix) parts.push("prefix");
  for (let i = 0; i < n; i += 1) {
    const left = warm[warmStart + i];
    const right = live[liveStart + i];
    if (left === right) continue;
    const label = PROGRAM_KEY_TAIL[i];
    if (label === "boolMaskA") parts.push(...maskBits(left, right, PROGRAM_MASK_A));
    else if (label === "boolMaskB") parts.push(...maskBits(left, right, PROGRAM_MASK_B));
    else parts.push(`${label}:${left}>${right}`);
  }
  return parts.join(" ") || "opaque";
}

const _STAR_CSS = new THREE.Vector2();
const INACTIVE_MASK = 1 << INACTIVE_VIGNETTE_LAYER;

/** Pass K item 4 — background work waits this long after the last input. */
const BG_INPUT_QUIET_MS = 300;
/** Pass K item 4 — mid-hop chunk uploads are off (no background work on camera motion). */
const PASS_K_HOP_UPLOADS = false;

export class StageExperience {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas, options = {}) {
    // eslint-disable-next-line no-console
    console.log(
      `[StageExperience] build commit ${typeof __BUILD_COMMIT__ !== "undefined" ? __BUILD_COMMIT__ : "unknown"}`
    );
    this.canvas = canvas;
    this._inWorker = Boolean(options.worker || globalThis.__STAGE_WORKER);
    this._hostPost = typeof options.postMessage === "function" ? options.postMessage : null;
    this._search = options.search ?? "";
    this._cssWidth = options.width || 0;
    this._cssHeight = options.height || 0;
    if (this._inWorker) {
      this.reducedMotion = Boolean(options.reducedMotion);
      this.isCoarse = Boolean(options.isCoarse);
      this._fullPixelRatio = Math.min(options.dpr || 1, this.isCoarse ? 1.5 : 1.75);
    } else {
      this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.isCoarse = window.matchMedia("(pointer: coarse)").matches;
      this._fullPixelRatio = Math.min(window.devicePixelRatio || 1, this.isCoarse ? 1.5 : 1.75);
    }
    this._renderScale = readWorkRenderScale(this._inWorker ? this._search : undefined);
    this.pixelRatio = this._fullPixelRatio * this._renderScale;
    this._aoEnabled = readAoEnabled(this._inWorker ? this._search : undefined);
    this._flightEnabled = readFlightEnabled(this._inWorker ? this._search : undefined);
    /** @type {FlightRecorder | null} set once `this.renderer` exists, below. */
    this._flight = null;

    if (this._inWorker) {
      this._crtPlaceholder = new WorkerCrtPlaceholder();
      this._crtPlaceholder.onCommand = (command, payload) => {
        this._hostPost?.({ type: "crt", command, ...(payload || {}) });
      };
      this.setCrtHoverIndex = (index) => this._crtPlaceholder.setHoverIndex?.(index);
      this.hud = {
        setProgress() {},
        updateMySpacePanelForVignette() {},
        getMySpaceScreen: () => this._crtPlaceholder
      };
      this.bootSequence = {
        setProgress: (progress) => this._hostPost?.({ type: "bootProgress", progress }),
        dismiss: () => {
          this._faderDismissed = true;
          noteFlight("fader-dismiss", { cleanFrames: this._preDismissClean ?? 0 });
          this._hostPost?.({ type: "ready" });
        }
      };
    } else {
      this.hud = new HUDController();
      this.bootSequence = new StageBootSequence({
        fader: document.getElementById("fader"),
        hud: this.hud
      });
    }
    this.loadingManager = new THREE.LoadingManager();
    setPcTextureLoadingManager(this.loadingManager);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.animFns = [];
    this.current = 0;
    this.locked = true;
    this._interactionReady = false;
    this.introComplete = false;
    this._vignette0Warm = createVignette0WarmState();
    this._descentPendingWarm = false;
    this._landFrameMs = [];
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
    this.scene.background = new THREE.Color(SKY_BG);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      ...(this._inWorker ? { alpha: false } : {}),
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(this.pixelRatio);
    {
      const { w, h } = this._viewportCssSize();
      this.renderer.setSize(w, h, false);
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (!import.meta.env.DEV) this.renderer.debug.checkShaderErrors = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._envLight = createEnvLightParams();
    this.renderer.toneMappingExposure = this._envLight.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(SKY_BG, 1);
    this.chunkedTextures = new ChunkedTextureQueue();
    this._installChunkedUploads();
    this._installGlProbe();
    this._installProgramLog();
    this._installContextLossLog();
    this._floorMp = null;
    this._floorUnderSec = 0;
    this._floorIgnoreNext = false;
    this._resizeSkipScene = false;
    this._skipBeauty = false;
    this._hasPresentedFrame = false;
    this._flushShadowBake = false;
    this._frameCause = "render";
    this._lastCause = "render";
    this._floorStats = { maxMs: 0, minFps: 999, cause: "render", frames: 0 };
    this._gapTasks = [];
    this._rafEnd = 0;
    this._installGapProbe();
    this._floorPostT = 0;
    this._bakeScratch = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true });

    // Pass F — flight recorder, `?flight=1`. Root getters are lazy closures;
    // `this.vignettes`/`this.neon`/`this.blackHole` don't exist yet at this
    // point in the constructor, only by the time a frame actually ticks.
    if (this._flightEnabled) {
      this._flight = new FlightRecorder({
        renderer: this.renderer,
        roots: [
          { label: "bust", get: () => this.vignettes?.[0]?.instance?.bustRoot ?? null },
          { label: "tree", get: () => this.vignettes?.[0]?.instance?.appleRoot ?? null },
          { label: "lawn", get: () => this.vignettes?.[0]?.instance?.grassRoot ?? null },
          { label: "lantern", get: () => this.neon?.entries?.[0]?.tube ?? null },
          { label: "black-hole", get: () => this.blackHole?.group ?? null },
          { label: "pc", get: () => this.vignettes?.[1]?.instance?.pcRoot ?? null },
          { label: "sidekick", get: () => this.vignettes?.[2]?.instance?.sidekickRoot ?? null },
          { label: "ptolemy", get: () => this.vignettes?.[3]?.instance?.group?.getObjectByName?.("ptolemy-root") ?? null },
          { label: "ishtar-gate", get: () => this.vignettes?.[3]?.instance?.group?.getObjectByName?.("ishtar-gate-root") ?? null },
          { label: "lucy", get: () => this.vignettes?.[3]?.instance?.group?.getObjectByName?.("lucy-root") ?? null },
          { label: "cuneiform-tablet", get: () => this.vignettes?.[3]?.instance?.group?.getObjectByName?.("cuneiform-tablet-root") ?? null }
        ]
      });
      setActiveFlightRecorder(this._flight);
      // eslint-disable-next-line no-console
      console.log("[FlightRecorder] enabled via ?flight=1 — window.__stageDebug(\"flightDump\") to read back, Shift+D for the on-screen pill.");
    }

    const view = this._viewportCssSize();
    this.camera = new THREE.PerspectiveCamera(
      CAM_FOV,
      view.w / view.h,
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
    const viewPointer = this._viewportCssSize();
    this._lastPointer = {
      x: viewPointer.w * 0.5,
      y: viewPointer.h * 0.5
    };
    this._introHandoffUntil = 0;
    this._introSettleUntil = 0;
    this._introHeavyEffectsAfter = 0;
    this._introIntegrationActive = false;
    /** True once _releaseIntroDeferredWork has finished a full pass with
     *  nothing still holding — the actual "safe to reveal" signal, since
     *  _introIntegrationActive itself drops to false between stillHolding
     *  retries too. */
    this._introIntegrationSettled = false;
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
    this._restFidelityKey = "";
    /** Settled DPR fraction of the device ratio. Motion uses the governor. */
    this._restDpr = REST_DPR;
    this._pixelBudgetMp = REST_PIXEL_BUDGET_MP;
    this._restDprActive = false;
    this._restDprWait = false;
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
    this.scene.environmentIntensity = this._envLight.environmentIntensity;
    this.vignettes = this._buildVignettes();
    // Fog renderers live in src/fog-aside and are not constructed.
    this._fogMode = "off";
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
    this._mountSidekickGroundFog();
    this._initCameraRig();
    this._updatePlaceholderVisibility(0);

    if (import.meta.env.DEV && !this._inWorker) {
      window.__stage = this;
    }

    this.cursorDof = new CursorDepthOfField();
    this._dofBokeh = 0;
    this.post = new PostPass(
      this.renderer,
      this.pixelRatio,
      0, // grain off — sensor-noise look crushed fog; bloom stays
      this.camera,
      {
        scene: this.scene,
        bloom: !this.reducedMotion,
        volumetricPass: this.volumetricFog,
        edgeGlitchPass: this._edgeGlitchPass,
        aoEnabled: this._aoEnabled,
        width: this._viewportCssSize().w,
        height: this._viewportCssSize().h
      }
    );
    if (this.post.dofEffect) this.post.dofEffect.target = this.cursorDof.point;
    this.post.smaaEffect?.addEventListener("load", () => {
      this._pixelBudgetKey = "";
      this._publishPixelBudget();
    });
    this._publishPixelBudget();

    this._initLoadGate();

    // Cursor waits until the pageload drop is done — init cost hitching the open beat.
    this.waterCursor = null;
    /** Last known CSS-pixel pointer — filled from first move so the blob can pop in place. */
    this._clientPointer = null;
    this._onClientPointerSample = (event) => {
      if (!Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return;
      this._clientPointer = { x: event.clientX, y: event.clientY };
    };
    if (!this._inWorker) {
      window.addEventListener("pointermove", this._onClientPointerSample, {
        passive: true,
        capture: true
      });
    }

    this._bindUi();
    this._bindInput();
    this._mountDuoFab();
    this._mountPovSpotlight();
    this._setActiveVignette(0);
    this._runIntro();

    if (!this._inWorker) {
      window.addEventListener("resize", this._onResize);
      this._viewportResizeObserver = new ResizeObserver(() => this._onResize());
      this._viewportResizeObserver.observe(document.documentElement);
    }
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
      cameraRig: this.cameraRig,
      getRect: () => this._getCanvasRect()
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
    this.camera.layers.enable(SKY_LAYER);

    this.wetFloor = null;
    this.studioRoom.visible = false;
    this.starField = createStarField();
    this.starField.layers.set(SKY_LAYER);
    this.scene.add(this.starField);
    this.flightStarStreak = createFlightStarStreak();
    this.flightStarStreak.layers.set(SKY_LAYER);
    this.scene.add(this.flightStarStreak);
    this.cursorStarTrail = createCursorStarTrail();
    this.cursorStarTrail.layers.set(SKY_LAYER);
    this.scene.add(this.cursorStarTrail);
    loadWetFloorTextures()
      .then((maps) => {
        const mat = this._wetFloorMaterial;
        if (!mat) return;
        mat.map = maps.map;
        mat.roughnessMap = maps.roughnessMap;
        mat.normalMap = maps.normalMap;
        mat.metalnessMap = maps.metalnessMap;
        for (const tex of [mat.map, mat.roughnessMap, mat.normalMap, mat.metalnessMap]) {
          if (!tex) continue;
          tex.channel = 0;
          Object.defineProperty(tex, "channel", {
            configurable: true,
            enumerable: true,
            get() {
              return 0;
            },
            set() {}
          });
        }
        mat.needsUpdate = true;
        if (this._wetFloorMesh) this._wetFloorMesh.visible = true;
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
    // POV SpotLight is the key. Ambient is near-off; the studio env does the fill.
    const env = this._envLight ?? createEnvLightParams();
    this.ambientLight = new THREE.AmbientLight(0xffffff, env.ambientIntensity);
    // Portal sun / fill / ambient stay in the scene at intensity 0 until the
    // gate opens, so the directional and ambient counts never change.
    this._portalSun = new THREE.DirectionalLight(0xffe6c0, 0);
    this._portalSun.name = "arch-portal-sun";
    this._portalSun.userData.portalIntensity = 3.4;
    this._portalFill = new THREE.DirectionalLight(0x9ec8ff, 0);
    this._portalFill.name = "arch-portal-fill";
    this._portalFill.userData.portalIntensity = 1.1;
    this._portalAmb = new THREE.AmbientLight(0xffd8a8, 0);
    this._portalAmb.name = "arch-portal-amb";
    this._portalAmb.userData.portalIntensity = 0.7;
    this.scene.add(this._portalSun, this._portalSun.target, this._portalFill, this._portalFill.target, this._portalAmb);
    this.stageLights = createStageLightRig(this.scene);
    this.environment.add(this.ambientLight);
    this.hemiLight = new THREE.HemisphereLight(0xd8dce8, STAGE_BG, env.hemiIntensity);
    this.hemiLight.position.set(0, 12, 0);
    this.environment.add(this.hemiLight);
  }

  /**
   * DEV — Shift+E. Env intensity, ambient, hemisphere, exposure.
   * Does not touch the POV spot, neon, or accent lights.
   * @param {Record<string, number>} [partial]
   */
  setEnvLightParams(partial = {}) {
    const base = this._envLight ?? createEnvLightParams();
    const next = { ...base, ...partial };
    next.environmentIntensity = Math.min(2, Math.max(0, Number(next.environmentIntensity) || 0));
    next.ambientIntensity = Math.min(0.5, Math.max(0, Number(next.ambientIntensity) || 0));
    next.hemiIntensity = Math.min(0.5, Math.max(0, Number(next.hemiIntensity) || 0));
    next.exposure = Math.min(2.2, Math.max(0.4, Number(next.exposure) || EXPOSURE));
    this._envLight = next;
    this.scene.environmentIntensity = next.environmentIntensity;
    if (this.ambientLight) this.ambientLight.intensity = next.ambientIntensity;
    if (this.hemiLight) this.hemiLight.intensity = next.hemiIntensity;
    this.renderer.toneMappingExposure = next.exposure;
    return this.getEnvLightParams();
  }

  /** DEV — current env / fill / exposure. */
  getEnvLightParams() {
    const env = this._envLight ?? createEnvLightParams();
    return { ...env };
  }

  /**
   * Bust material response to scene IBL. r172 uses scene.environmentIntensity
   * only when material.envMap is null; a set envMap uses material.envMapIntensity.
   */
  debugEnvLight() {
    const bust = this.vignettes?.[0]?.instance?.bustRoot ?? null;
    /** @type {Array<Record<string, unknown>>} */
    const materials = [];
    bust?.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        materials.push({
          mesh: obj.name || "(unnamed)",
          material: mat.name || "(unnamed)",
          type: mat.type,
          metalness: typeof mat.metalness === "number" ? +mat.metalness.toFixed(3) : null,
          roughness: typeof mat.roughness === "number" ? +mat.roughness.toFixed(3) : null,
          envMapIntensity: typeof mat.envMapIntensity === "number" ? +mat.envMapIntensity.toFixed(3) : null,
          hasOwnEnvMap: Boolean(mat.envMap)
        });
      }
    });
    return {
      ...this.getEnvLightParams(),
      sceneEnvironmentIntensity: this.scene.environmentIntensity,
      rendererExposure: this.renderer.toneMappingExposure,
      ambient: this.ambientLight?.intensity ?? null,
      hemi: this.hemiLight?.intensity ?? null,
      hasEnvironment: Boolean(this.scene.environment),
      bustMaterials: materials
    };
  }

  /**
   * Mean 0-1 value of one channel of a texture's image, cached on the
   * texture. glTF packs metalness in B — a low `metalness` factor next to a
   * mostly-white metalness map (the bust: factor 0→0, but before that fix,
   * factor 0.12 next to a map averaging 0.88 still read as visible sheen)
   * is exactly the effective-metalness gap `debugMaterialAudit` flags.
   * @param {THREE.Texture | null | undefined} tex
   * @param {number} channelIndex 0=R, 1=G, 2=B, 3=A
   */
  _meanTextureChannel(tex, channelIndex) {
    if (!tex?.image) return null;
    const cache = tex.userData.__channelMean || (tex.userData.__channelMean = {});
    if (typeof cache[channelIndex] === "number") return cache[channelIndex];
    const img = tex.image;
    const w = img.width;
    const h = img.height;
    if (!w || !h) return null;
    try {
      const sampleW = Math.min(w, 128);
      const sampleH = Math.min(h, 128);
      const canvas = new OffscreenCanvas(sampleW, sampleH);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, sampleW, sampleH);
      const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
      let sum = 0;
      let count = 0;
      for (let i = channelIndex; i < data.length; i += 4) {
        sum += data[i];
        count += 1;
      }
      const mean = count ? sum / count / 255 : null;
      cache[channelIndex] = mean;
      return mean;
    } catch {
      return null;
    }
  }

  /**
   * Perceptual-luminance min/mean of a color texture, downsampled the same
   * way `_meanTextureChannel` is — for the washed-out-blacks audit (item 2):
   * a lifted darkest-region read can be the source texture's own authored
   * floor, not a lighting/material bug.
   * @param {THREE.Texture | null | undefined} tex
   */
  _textureLuminanceStats(tex) {
    if (!tex?.image) return null;
    const cache = tex.userData.__lumStats;
    if (cache) return cache;
    const img = tex.image;
    const w = img.width;
    const h = img.height;
    if (!w || !h) return null;
    try {
      const sampleW = Math.min(w, 128);
      const sampleH = Math.min(h, 128);
      const canvas = new OffscreenCanvas(sampleW, sampleH);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, sampleW, sampleH);
      const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
      const lums = new Array(sampleW * sampleH);
      let sum = 0;
      for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
        const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        lums[j] = lum;
        sum += lum;
      }
      lums.sort((a, b) => a - b);
      const p5Index = Math.max(0, Math.floor(lums.length * 0.05) - 1);
      const stats = {
        min: +lums[0].toFixed(3),
        p5: +lums[p5Index].toFixed(3),
        mean: lums.length ? +(sum / lums.length).toFixed(3) : null
      };
      tex.userData.__lumStats = stats;
      return stats;
    } catch {
      return null;
    }
  }

  /**
   * WebGL has no API to read back a texture's actual allocated internal
   * format from the GPU (desktop GL's `glGetTexLevelParameter` has no WebGL
   * equivalent) — this instead replicates three.js r172's own deterministic
   * `colorSpace`/`type`/`format` → internal-format mapping
   * (`WebGLTextures.getInternalFormat`, uncompressed RGBA8-family path,
   * which is what every texture here uses) and reports whether the texture
   * has actually been uploaded yet (`allocated`) — the Pass A class of bug
   * (colorSpace set after upload, so the wrong format is already baked in)
   * shows up as `allocated: true` with a `colorSpace` that doesn't match
   * what the texture was uploaded under; `allocated: false` means nothing
   * has claimed a GL object for it yet and this is purely prospective.
   * @param {THREE.Texture | null | undefined} tex
   */
  _textureGlInternalFormat(tex) {
    if (!tex?.isTexture) return null;
    const allocated = Boolean(this.renderer?.properties?.get(tex)?.__webglTexture);
    const format = tex.colorSpace === THREE.SRGBColorSpace ? "SRGB8_ALPHA8" : "RGBA8";
    return { format, colorSpace: tex.colorSpace ?? null, allocated };
  }

  /**
   * One row per material across every vignette (+ wet floor). DEV —
   * `window.__stageDebug("debugMaterialAudit")`. r172: `scene.environmentIntensity`
   * only drives IBL for materials with no own `envMap`; a set `envMap` uses
   * `material.envMapIntensity` instead (see {@link debugEnvLight}).
   * `effectiveMetalness` = factor × mean(metalnessMap.B) — the factor alone
   * (what most of this file tunes) understates reflectivity whenever the map
   * isn't flat; flagged when that product is still >0.3.
   */
  debugMaterialAudit() {
    const rows = [];
    const seen = new Set();
    const visit = (root, vignetteName) => {
      root?.traverse?.((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (!mat || seen.has(mat)) continue;
          seen.add(mat);
          const metalness = typeof mat.metalness === "number" ? mat.metalness : null;
          const metalMapMean = mat.metalnessMap ? this._meanTextureChannel(mat.metalnessMap, 2) : null;
          const effectiveMetalness =
            metalness == null ? null : +(metalness * (metalMapMean ?? 1)).toFixed(3);
          const isUnlit = mat.isMeshBasicMaterial || Boolean(mat.userData?.KHR_materials_unlit);
          rows.push({
            vignette: vignetteName,
            mesh: obj.name || "(unnamed)",
            material: mat.name || "(unnamed)",
            type: mat.type,
            metalness: metalness == null ? null : +metalness.toFixed(3),
            roughness: typeof mat.roughness === "number" ? +mat.roughness.toFixed(3) : null,
            hasMetalnessMap: Boolean(mat.metalnessMap),
            hasRoughnessMap: Boolean(mat.roughnessMap),
            sameOrmTexture: Boolean(mat.metalnessMap && mat.metalnessMap === mat.roughnessMap),
            metalMapMean: metalMapMean == null ? null : +metalMapMean.toFixed(3),
            effectiveMetalness,
            effectiveMetalnessFlag: effectiveMetalness != null && effectiveMetalness > 0.3,
            envMapIntensity: typeof mat.envMapIntensity === "number" ? +mat.envMapIntensity.toFixed(3) : null,
            hasOwnEnvMap: Boolean(mat.envMap),
            mapImageW: mat.map?.image?.width ?? null,
            mapImageH: mat.map?.image?.height ?? null,
            mapImageCtor: mat.map?.image?.constructor?.name ?? null,
            mapVersion: mat.map?.version ?? null,
            mapSourceVersion: mat.map?.source?.version ?? null,
            isUnlit,
            toneMapped: mat.toneMapped,
            mapColorSpace: mat.map?.colorSpace ?? null,
            emissiveMapColorSpace: mat.emissiveMap?.colorSpace ?? null,
            normalMapColorSpace: mat.normalMap?.colorSpace ?? null,
            roughnessMapColorSpace: mat.roughnessMap?.colorSpace ?? null,
            emissive: mat.emissive ? [+mat.emissive.r.toFixed(3), +mat.emissive.g.toFixed(3), +mat.emissive.b.toFixed(3)] : null,
            emissiveIntensity: typeof mat.emissiveIntensity === "number" ? +mat.emissiveIntensity.toFixed(3) : null,
            hasEmissiveMap: Boolean(mat.emissiveMap),
            hasAoMap: Boolean(mat.aoMap),
            aoMapIntensity: typeof mat.aoMapIntensity === "number" ? +mat.aoMapIntensity.toFixed(3) : null,
            hasUv2: Boolean(obj.geometry?.attributes?.uv2 ?? obj.geometry?.attributes?.uv1),
            baseColorLum: this._textureLuminanceStats(mat.map)
          });
        }
      });
    };
    const vignettes = this.vignettes || [];
    for (let i = 0; i < vignettes.length; i += 1) {
      visit(vignettes[i]?.group, vignettes[i]?.def?.name || `vignette-${i}`);
    }
    if (this.wetFloor?.floorMesh) visit(this.wetFloor.floorMesh, "wet-floor");
    return {
      sceneEnvironmentIntensity: this.scene.environmentIntensity,
      ambient: this.ambientLight?.intensity ?? null,
      hemi: this.hemiLight?.intensity ?? null,
      rows
    };
  }

  /**
   * DEV — many Archaeology props come from GLBs with generic internal mesh/
   * material names ("Object_2"/"material_0"), so a name search in
   * debugMaterialAudit finds nothing for them. This looks a named root
   * child up directly by its own name (e.g. "ptolemy-root") under a
   * vignette's group and dumps every mesh/material underneath it, plus
   * whether it's present at all and how many meshes it holds — the same
   * "GLB has no meshes" check ArchaeologyVignette.js itself runs.
   * `window.__stageDebug("debugFindRoot", 3, "ptolemy-root")`.
   * @param {number} vignetteIndex
   * @param {string} rootName
   */
  debugFindRoot(vignetteIndex, rootName) {
    const group = this.vignettes?.[vignetteIndex]?.group;
    if (!group) return { error: "no such vignette" };
    let root = null;
    group.traverse((obj) => {
      if (!root && obj.name === rootName) root = obj;
    });
    if (!root) return { found: false, rootName };
    const meshes = [];
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        meshes.push({
          mesh: obj.name || "(unnamed)",
          material: mat?.name || "(unnamed)",
          type: mat?.type ?? null,
          visible: obj.visible,
          color: mat?.color ? [+mat.color.r.toFixed(3), +mat.color.g.toFixed(3), +mat.color.b.toFixed(3)] : null,
          metalness: typeof mat?.metalness === "number" ? +mat.metalness.toFixed(3) : null,
          roughness: typeof mat?.roughness === "number" ? +mat.roughness.toFixed(3) : null,
          envMapIntensity: typeof mat?.envMapIntensity === "number" ? +mat.envMapIntensity.toFixed(3) : null,
          mapImageW: mat?.map?.image?.width ?? null,
          mapImageH: mat?.map?.image?.height ?? null,
          toneMapped: mat?.toneMapped ?? null,
          hasOwnEnvMap: Boolean(mat?.envMap),
          hasAoMap: Boolean(mat?.aoMap),
          aoMapIntensity: typeof mat?.aoMapIntensity === "number" ? +mat.aoMapIntensity.toFixed(3) : null,
          hasUv2: Boolean(obj.geometry?.attributes?.uv2 ?? obj.geometry?.attributes?.uv1),
          baseColorLum: this._textureLuminanceStats(mat?.map),
          vertexColors: Boolean(mat?.vertexColors),
          hasGeometryColorAttr: Boolean(obj.geometry?.attributes?.color),
          mapColorSpace: mat?.map?.colorSpace ?? null,
          mapGlInternalFormat: this._textureGlInternalFormat(mat?.map),
          mapChunkClaimed: Boolean(mat?.map?.userData?.__chunkClaimed),
          mapChunkDone: Boolean(mat?.map?.userData?.__chunkDone)
        });
      }
    });
    return {
      found: true,
      rootName,
      rootVisible: root.visible,
      parentedInGroup: Boolean(root.parent),
      meshCount: meshes.length,
      meshes
    };
  }

  /**
   * Pass H item 1 — per-object triangle/draw-call table for the whole scene,
   * not just one root: `window.__stageDebug("debugTriangleBreakdown")`.
   * For every mesh under every vignette group plus grass/lantern/floor,
   * reports its own triangle count (instance-aware — an InstancedMesh
   * reports geometryTriangles * count), draw calls (1 per material slot),
   * castShadow/receiveShadow, material type, and whether it's actually
   * reachable right now (`.visible` false anywhere up its own ancestor
   * chain, the same walk the flight recorder's `hiddenAtPresent` does) —
   * so "is some other stop's geometry still being drawn at Bust" is a
   * direct read of this table, not an inference.
   */
  debugTriangleBreakdown() {
    const rows = [];
    const totalsByStop = {};
    const triCount = (geom) => {
      if (!geom) return 0;
      if (geom.index) return geom.index.count / 3;
      const pos = geom.attributes?.position;
      return pos ? pos.count / 3 : 0;
    };
    const hiddenAtPresent = (obj) => {
      let p = obj;
      while (p) {
        if (p.visible === false) return true;
        p = p.parent;
      }
      return false;
    };
    const visit = (root, stopLabel) => {
      if (!root) return;
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        const instances = obj.isInstancedMesh ? obj.count : 1;
        const tris = triCount(obj.geometry) * instances;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        totalsByStop[stopLabel] = (totalsByStop[stopLabel] ?? 0) + tris;
        rows.push({
          stop: stopLabel,
          mesh: obj.name || "(unnamed)",
          triangles: Math.round(tris),
          instances: obj.isInstancedMesh ? instances : null,
          drawCalls: mats.length,
          materialType: mats[0]?.type ?? null,
          castShadow: Boolean(obj.castShadow),
          receiveShadow: Boolean(obj.receiveShadow),
          visible: obj.visible,
          hiddenAtPresent: hiddenAtPresent(obj)
        });
      });
    };
    const names = ["bust", "desktop", "sidekick", "archaeology"];
    this.vignettes.forEach((vig, i) => visit(vig?.group, names[i] ?? `vignette-${i}`));
    if (this.wetFloor?.floorMesh) visit(this.wetFloor.floorMesh, "wet-floor");
    if (this.stageFloor) visit(this.stageFloor, "stage-floor");
    rows.sort((a, b) => b.triangles - a.triangles);
    return {
      totalsByStop: Object.fromEntries(
        Object.entries(totalsByStop).map(([k, v]) => [k, Math.round(v)])
      ),
      grandTotalTriangles: Math.round(rows.reduce((sum, r) => sum + r.triangles, 0)),
      rows
    };
  }

  /**
   * Pass I item 1 — A/B cost toggle. `gpuMs` is confirmed unreliable on
   * ANGLE/Metal, so cost is measured by toggling one thing off, watching
   * settled fps over a few seconds, then toggling it back — not by reading
   * a per-pass GPU timer. `window.__stageDebug("debugAbToggle", "grass", false)`
   * then `window.__stageDebug("debugAbToggle", "grass", true)` to restore.
   * Returns `{ name, on, applied }` — `applied: false` means that name
   * doesn't resolve to anything right now (e.g. a stop-specific light that
   * isn't mounted yet).
   * @param {string} name
   * @param {boolean} on
   */
  debugAbToggle(name, on) {
    const grass = this.vignettes?.[0]?.instance;
    const lanternLight = this.neon?.stopLights?.[0]?.light;
    let applied = false;
    switch (name) {
      case "grass":
        if (grass?.grassRoot) {
          grass.grassRoot.visible = on;
          applied = true;
        }
        break;
      case "grass-shadow":
        if (grass?.grassEngine?.mesh) {
          grass.grassEngine.mesh.castShadow = on;
          if (grass.grassEngine.depthMesh) grass.grassEngine.depthMesh.castShadow = on;
          applied = true;
        }
        break;
      case "pov-spot-shadow":
        if (this.spotLight) {
          this.spotLight.castShadow = on;
          applied = true;
        }
        break;
      case "neon":
        // Tubes, floor glow and PointLights to 0 (light count unchanged, so
        // no program changes) — applied after neon.update each frame.
        this._abNeonOff = !on;
        applied = Boolean(this.neon);
        break;
      case "sidekick-phone":
        if (this.vignettes?.[2]?.instance?.sidekickRoot) {
          this.vignettes[2].instance.sidekickRoot.visible = on;
          applied = true;
        }
        break;
      case "contact-pads":
        this._abPadsOff = !on;
        applied = Boolean(this.contactShadows?.length);
        break;
      case "ground-fog":
        this._abGroundFogOff = !on;
        applied = Boolean(this.groundFog);
        break;
      case "lantern-shadow":
        if (lanternLight) {
          lanternLight.castShadow = on;
          applied = true;
        }
        break;
      case "edge-glitch":
        if (this.edgeGlitch) {
          this.edgeGlitch.enabled = on;
          applied = true;
        }
        break;
      case "wet-floor":
        if (this.wetFloor?.floorMesh) {
          this.wetFloor.floorMesh.visible = on;
          applied = true;
        }
        break;
      case "bloom":
        if (this.post?.setBloomIntensity) {
          this._abBloomSaved = this._abBloomSaved ?? this.post.getBloomIntensity?.() ?? 1;
          this.post.setBloomIntensity(on ? this._abBloomSaved : 0);
          applied = true;
        }
        break;
      case "smaa":
        if (this.post?.smaaPass) {
          this.post.smaaPass.enabled = on;
          applied = true;
        }
        break;
      case "duo":
        if (this.duoFab?.root) {
          this.duoFab.root.visible = on;
          applied = true;
        }
        break;
      case "water-cursor":
        this._abWaterCursorOff = !on;
        applied = true;
        break;
      case "star-field":
        if (this.starField) {
          this.starField.visible = on;
          applied = true;
        }
        break;
      case "cursor-trail":
        if (this.cursorStarTrail) {
          this.cursorStarTrail.visible = on;
          applied = true;
        }
        break;
      case "black-hole-disk":
        if (this.blackHole?.group) {
          this.blackHole.group.visible = on;
          applied = true;
        }
        break;
      case "warm-work":
        this._abWarmPaused = !on;
        applied = true;
        break;
      case "msaa": {
        // on here means a sample count, passed via the second arg as a number.
        const samples = typeof on === "number" ? on : on ? 4 : 0;
        if (this.post?.setMultisampling) {
          this.post.setMultisampling(samples);
          applied = true;
        }
        break;
      }
      default:
        break;
    }
    return { name, on, applied };
  }

  /**
   * DEV — isolate a named root under the real stage lighting (hide every
   * other mesh, reframe the camera tight on it, paint one frame, freeze the
   * tick) so it can be screenshotted without the camera rig fighting direct
   * positioning. Pair with `debugUnframeRoot` to restore. Re-added twice now
   * (Pass B, Pass B2) for the same "is this prop actually readable" check —
   * kept as permanent tooling this time instead of a throwaway.
   * `window.__stageDebug("debugFrameRoot", 3, "cuneiform-tablet-root")`.
   */
  debugFrameRoot(vignetteIndex, rootName) {
    const group = this.vignettes?.[vignetteIndex]?.group;
    if (!group) return { error: "no such vignette" };
    let root = null;
    group.traverse((obj) => {
      if (!root && obj.name === rootName) root = obj;
    });
    if (!root) return { found: false, rootName };
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return { error: "empty bounds" };
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 0.1;
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const dist = (radius / Math.sin(fovRad / 2)) * 1.4;

    if (!this._debugFrameSaved) {
      this._debugFrameSaved = {
        camPos: this.camera.position.clone(),
        camQuat: this.camera.quaternion.clone(),
        visibility: []
      };
      this.scene.traverse((obj) => {
        if (!obj.isMesh && !obj.isLine && !obj.isPoints) return;
        this._debugFrameSaved.visibility.push({ obj, visible: obj.visible });
      });
    }
    this.scene.traverse((obj) => {
      if (!obj.isMesh && !obj.isLine && !obj.isPoints) return;
      let underRoot = false;
      let p = obj;
      while (p) {
        if (p === root) { underRoot = true; break; }
        p = p.parent;
      }
      obj.visible = underRoot;
    });
    this.camera.position.copy(center).addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()), -dist);
    this.camera.lookAt(center);
    this.camera.updateMatrixWorld();
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prevTarget);
    return { ok: true };
  }

  /** DEV — restores what `debugFrameRoot` hid/moved, and resumes the tick. */
  debugUnframeRoot() {
    const saved = this._debugFrameSaved;
    if (!saved) return { ok: false };
    this.camera.position.copy(saved.camPos);
    this.camera.quaternion.copy(saved.camQuat);
    this.camera.updateMatrixWorld();
    for (const { obj, visible } of saved.visibility) obj.visible = visible;
    this._debugFrameSaved = null;
    return { ok: true };
  }

  /** DEV — screen-space CSS-pixel center/box for a named root's world AABB (identifying a prop on screen without guessing from a screenshot). `window.__stageDebug("debugRootScreenBox", 3, "cuneiform-tablet-root")`. */
  debugRootScreenBox(vignetteIndex, rootName) {
    const group = this.vignettes?.[vignetteIndex]?.group;
    if (!group) return { error: "no such vignette" };
    let root = null;
    group.traverse((obj) => {
      if (!root && obj.name === rootName) root = obj;
    });
    if (!root) return { found: false, rootName };
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return { found: true, error: "empty bounds" };
    const canvasRect = this._getCanvasRect();
    const corners = [];
    for (let xi = 0; xi < 2; xi += 1) {
      for (let yi = 0; yi < 2; yi += 1) {
        for (let zi = 0; zi < 2; zi += 1) {
          const v = new THREE.Vector3(
            xi ? box.max.x : box.min.x,
            yi ? box.max.y : box.min.y,
            zi ? box.max.z : box.min.z
          ).project(this.camera);
          corners.push([
            (v.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left,
            (-v.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top
          ]);
        }
      }
    }
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    return {
      found: true,
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
      centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
      centerY: (Math.min(...ys) + Math.max(...ys)) / 2
    };
  }

  /**
   * DEV — per-texture GPU/decode settings for every material matching
   * `materialName`, for comparing e.g. a slow upload against a fast one of
   * the same size (`window.__stageDebug("debugTextureFields", "name")`).
   * @param {string} materialName
   */
  debugTextureFields(materialName) {
    const rows = [];
    const seen = new Set();
    const dumpTex = (tex, slot) => {
      if (!tex?.isTexture || seen.has(tex)) return;
      seen.add(tex);
      const props = this.renderer.properties.get(tex);
      const srcProps = tex.source ? this.renderer.properties.get(tex.source) : null;
      rows.push({
        slot,
        flipY: tex.flipY,
        premultiplyAlpha: tex.premultiplyAlpha,
        colorSpace: tex.colorSpace,
        generateMipmaps: tex.generateMipmaps,
        minFilter: tex.minFilter,
        magFilter: tex.magFilter,
        anisotropy: tex.anisotropy,
        wrapS: tex.wrapS,
        wrapT: tex.wrapT,
        format: tex.format,
        type: tex.type,
        internalFormat: tex.internalFormat,
        imageCtor: tex.image?.constructor?.name ?? null,
        imageW: tex.image?.width ?? null,
        imageH: tex.image?.height ?? null,
        textureVersion: tex.version,
        sourceVersion: tex.source?.version ?? null,
        glResidentVersion: srcProps?.__version ?? null,
        glResident: Boolean(props?.__webglTexture)
      });
    };
    const visit = (root) => {
      root?.traverse?.((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat?.name !== materialName) continue;
          for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap"]) {
            dumpTex(mat[key], key);
          }
        }
      });
    };
    const vignettes = this.vignettes || [];
    for (let i = 0; i < vignettes.length; i += 1) visit(vignettes[i]?.group);
    return rows;
  }

  /**
   * DEV — one row per program created during a real hop 0→3, with the live
   * cacheKey and every warmed cacheKey registered under that same program
   * name (empty when the name was never warmed at all — "no-warm-key").
   */
  debugHop03Detail() {
    return this._hop03 || [];
  }

  /**
   * DEV — roots `_compileThenShow` skipped (not held on GPU_HOLD_LAYER, so
   * never pre-warmed) and textures whose `initTexture` upload alone took
   * ≥35ms (KTX2 conversion candidates), since boot.
   */
  debugSlowTextures() {
    return {
      skippedRoots: this._compileThenShowSkipped || [],
      succeededRoots: this._compileThenShowSucceeded || [],
      slowTextures: this._slowTextureLog || [],
      textureWarmStats: this._textureWarmStats || { uploaded: 0, skipped: 0, ms: 0, byRoot: [] },
      enterShownAtMs: this._enterShownAtMs ?? null
    };
  }

  /** DEV — arms texImage2D/texSubImage2D capture for {@link debugTextureUploads}. */
  debugStartTextureCapture() {
    this._texUploadLog = [];
    this._texUploadCapture = true;
    return true;
  }

  /**
   * DEV — resolves each captured GL call (see {@link debugStartTextureCapture})
   * to the THREE.Texture / material / mesh it belongs to, by scanning every
   * vignette's current materials for a matching `__webglTexture` handle.
   */
  debugTextureUploads() {
    this._texUploadCapture = false;
    const log = this._texUploadLog || [];
    this._texUploadLog = null;
    if (!log.length) return { calls: 0, rows: [] };

    const byHandle = new Map();
    const visit = (root, vignetteName) => {
      root?.traverse?.((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (!mat) continue;
          for (const key of Object.keys(mat)) {
            const tex = mat[key];
            if (!tex?.isTexture) continue;
            const props = this.renderer.properties.get(tex);
            const handle = props?.__webglTexture;
            if (!handle || byHandle.has(handle)) continue;
            byHandle.set(handle, {
              vignette: vignetteName,
              mesh: obj.name || "(unnamed)",
              material: mat.name || "(unnamed)",
              slot: key,
              srcW: tex.image?.width ?? null,
              srcH: tex.image?.height ?? null,
              isImageBitmap: typeof ImageBitmap !== "undefined" && tex.image instanceof ImageBitmap
            });
          }
        }
      });
    };
    const vignettes = this.vignettes || [];
    for (let i = 0; i < vignettes.length; i += 1) {
      visit(vignettes[i]?.group, vignettes[i]?.def?.name || `vignette-${i}`);
    }
    if (this.wetFloor?.floorMesh) visit(this.wetFloor.floorMesh, "wet-floor");

    const rows = log.map((entry) => {
      const found = byHandle.get(entry.glTex);
      return {
        kind: entry.kind,
        t: entry.t,
        uploadW: entry.w,
        uploadH: entry.h,
        isImageBitmap: entry.isImageBitmap,
        ...(found || { vignette: "(unresolved)", mesh: null, material: null, slot: null })
      };
    });
    return { calls: log.length, rows };
  }

  /** DEV — new WebGL programs compiled since Enter showed (should stay 0). */
  debugProgramsSinceEnter() {
    return Math.max(0, (this.renderer.info.programs?.length ?? 0) - (this._programBaseline ?? 0));
  }

  /** DEV — which program names/keys compiled live (post-Enter), not during warm. */
  debugProgramLeakRows() {
    return this._programLeakRows();
  }

  /** DEV — starts/clears the frame-time ring buffer for {@link debugFrameHistogram}. */
  debugStartFrameHistogram() {
    this._frameHistogram = [];
    return true;
  }

  /**
   * DEV — p50/p1/min fps and the count of frames over the 24fps floor
   * (`FLOOR_FRAME_MS` ≈ 41.7ms), from whatever has accumulated since
   * {@link debugStartFrameHistogram}. Stops collecting so the buffer is a
   * frozen sample of the window just measured.
   */
  debugFrameHistogram() {
    const raw = this._frameHistogram || [];
    this._frameHistogram = null;
    if (!raw.length) return { frames: 0 };
    const sorted = raw.slice().sort((a, b) => a.ms - b.ms);
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const p50Ms = at(0.5).ms;
    const p99Ms = at(0.99).ms;
    const worst = sorted[sorted.length - 1];
    const fastest = sorted[0];
    const tByTime = raw.slice().sort((a, b) => a.t - b.t);
    return {
      frames: raw.length,
      windowStartMs: tByTime[0].t,
      windowEndMs: tByTime[tByTime.length - 1].t,
      windowSpanSec: +((tByTime[tByTime.length - 1].t - tByTime[0].t) / 1000).toFixed(1),
      p50Fps: Math.round((1000 / p50Ms) * 10) / 10,
      p1Fps: Math.round((1000 / p99Ms) * 10) / 10,
      minFps: Math.round((1000 / worst.ms) * 10) / 10,
      maxFps: Math.round((1000 / fastest.ms) * 10) / 10,
      overFloorCount: raw.filter((f) => f.ms > FLOOR_FRAME_MS).length,
      worstFrame: { ms: Math.round(worst.ms * 10) / 10, cause: worst.cause, t: worst.t }
    };
  }

  /**
   * DEV — every texture across every vignette that is (or was) eligible for
   * the chunk queue (either dimension >= CHUNK_TEXTURE_EDGE): mesh, material,
   * slot, dimensions, and its chunk flags. Not gated to a live upload — a
   * texture already __chunkDone still reports its recorded pre-claim size.
   */
  debugChunkInventory() {
    const edge = 2048;
    const seen = new Set();
    const rows = [];
    const keys = [
      "map",
      "normalMap",
      "roughnessMap",
      "metalnessMap",
      "aoMap",
      "emissiveMap",
      "alphaMap",
      "bumpMap",
      "displacementMap",
      "envMap",
      "lightMap"
    ];
    const visit = (vignetteName, root) => {
      root?.traverse?.((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (!mat) continue;
          for (const key of keys) {
            const tex = mat[key];
            if (!tex?.isTexture || seen.has(tex)) continue;
            const wasClaimed = Boolean(tex.userData.__chunkClaimed);
            const src = tex.userData.__chunkSource || tex.image;
            const w = wasClaimed ? tex.userData.__chunkW ?? 0 : src?.width || src?.videoWidth || 0;
            const h = wasClaimed ? tex.userData.__chunkH ?? 0 : src?.height || src?.videoHeight || 0;
            if (!wasClaimed && w < edge && h < edge) continue;
            seen.add(tex);
            const wouldBeSrgb = tex.colorSpace === THREE.SRGBColorSpace;
            rows.push({
              vignette: vignetteName,
              mesh: obj.name || "(unnamed)",
              material: mat.name || "(unnamed)",
              slot: key,
              w,
              h,
              chunkClaimed: wasClaimed,
              chunkDone: Boolean(tex.userData.__chunkDone),
              uuid: tex.uuid,
              colorSpace: tex.colorSpace,
              allocatedFormat: tex.userData.__chunkInternalFormat ?? null,
              expectedFormat: wouldBeSrgb ? "SRGB8_ALPHA8" : "RGBA8",
              formatMismatch: wasClaimed
                ? tex.userData.__chunkInternalFormat != null &&
                  tex.userData.__chunkInternalFormat !== (wouldBeSrgb ? "SRGB8_ALPHA8" : "RGBA8")
                : null,
              minFilter: tex.minFilter,
              magFilter: tex.magFilter,
              anisotropy: tex.anisotropy
            });
          }
        }
      });
    };
    for (const vig of this.vignettes || []) visit(vig?.name || "(unnamed)", vig?.group);
    return rows;
  }

  /**
   * DEV — the generateMipmap calibration state: the first measured cost (ms,
   * whichever texture finished its chunk upload first), whether later
   * generateMipmap calls are deferred to settled frames because of it, the
   * per-texture cost log (cross-reference `uuid` against debugChunkInventory
   * to name a row), and how many are still queued for a settled frame.
   */
  debugMipmapCalibration() {
    const q = this.chunkedTextures;
    return {
      calibrationMs: q?._mipmapCalibrationMs ?? null,
      deferring: Boolean(q?._deferMipmaps),
      pending: q?.mipmapPending ?? 0,
      costLog: q?._mipmapCostLog ?? []
    };
  }

  /**
   * DEV — chunk-queue state for a named material's `map` texture: claimed?
   * done? still queued? plus the queue's own pending count and front job.
   */
  debugChunkState(materialName) {
    let found = null;
    const visit = (root) => {
      root?.traverse?.((obj) => {
        if (found || !obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat?.name === materialName && mat.map) found = mat.map;
        }
      });
    };
    for (const vig of this.vignettes || []) visit(vig?.group);
    const q = this.chunkedTextures;
    const front = q?.jobs?.[0];
    return {
      pending: q?.pending ?? null,
      frontJobTextureUuid: front?.texture?.uuid ?? null,
      frontJobY: front?.y ?? null,
      frontJobH: front?.h ?? null,
      frontJobAllocated: front?.allocated ?? null,
      frontJobCoarse: front?.coarse ?? null,
      texture: found
        ? {
            uuid: found.uuid,
            chunkClaimed: Boolean(found.userData.__chunkClaimed),
            chunkDone: Boolean(found.userData.__chunkDone),
            imageW: found.image?.width ?? null,
            imageH: found.image?.height ?? null,
            isFrontJob: front?.texture === found
          }
        : null
    };
  }

  /**
   * DEV — timeline probe for the spiral-end -> drop-start gap.
   * `window.__stageDebug("debugUploadTimeline")`. Reports every job still in
   * the chunk queue (rows remaining, allocated/coarse state), the mipmap
   * queue depth, warmVignette0's own step, and the black-hole/rig state
   * needed to place this reading on a timeline (Enter shown, spiral phase,
   * rig height/settled).
   */
  debugUploadTimeline() {
    const q = this.chunkedTextures;
    const jobs = (q?.jobs || []).map((j) => ({
      textureUuid: j.texture?.uuid ?? null,
      w: j.w,
      h: j.h,
      allocated: Boolean(j.allocated),
      coarse: Boolean(j.coarse),
      y: j.y,
      rowsRemaining: Math.max(0, j.h - (j.y || 0))
    }));
    const warm = this._vignette0Warm;
    const seq = this.blackHoleSeq;
    return {
      tMs: Math.round(performance.now()),
      enterShown: Boolean(this._enterShown),
      chunkUploadsAllowed: this._chunkUploadsAllowed(),
      uploadStop: Boolean(this._uploadStop),
      queuePending: q?.pending ?? null,
      queueJobs: jobs,
      mipmapPending: q?.mipmapPending ?? null,
      warm: {
        phase: warm?.phase ?? null,
        done: Boolean(warm?.done),
        liveAt: warm?._liveAt ?? null,
        liveStepsTotal: warm?._liveSteps?.length ?? null
      },
      blackHoleActive: Boolean(this._blackHoleActive),
      blackHolePhase: seq?.phase ?? null,
      rigHeight: this.cameraRig?.state?.height ?? null,
      rigSettled: this.cameraRig?.state?.isSettled ?? null,
      worldVisible: Boolean(this.world?.visible)
    };
  }

  /**
   * DEV — reads back real GPU pixel data for a named material's `.map`
   * (or `slot`) via a framebuffer, at a few sample points, so we can tell
   * whether the chunk-uploaded texture actually holds real image data or
   * something else (garbage, all-zero, all-one, a single flat color).
   */
  debugReadTexturePixels(materialName, slot = "map", level = 0) {
    let tex = null;
    const visit = (root) => {
      root?.traverse?.((obj) => {
        if (tex || !obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat?.name === materialName && mat[slot]?.isTexture) tex = mat[slot];
        }
      });
    };
    for (const vig of this.vignettes || []) visit(vig?.group);
    if (!tex) return { error: "texture not found" };

    const renderer = this.renderer;
    const gl = renderer.getContext();
    const props = renderer.properties.get(tex);
    const glTex = props?.__webglTexture;
    if (!glTex) return { error: "no GL texture allocated" };

    const fb = gl.createFramebuffer();
    const prevFb = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glTex, level);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    const result = { fbStatus: status, fbComplete: status === gl.FRAMEBUFFER_COMPLETE, level, samples: [] };
    if (result.fbComplete) {
      // Sample points shrink with the mip level so they stay in-bounds for
      // a small mip (e.g. level 8 of a 4096² chain is 16×16).
      const shift = Math.max(0, level | 0);
      const scale = (n) => Math.max(0, n >> shift);
      const points = [
        [0, 0],
        [scale(4), scale(4)],
        [scale(16), scale(16)],
        [scale(64), scale(64)],
        [scale(200), scale(200)]
      ];
      const px = new Uint8Array(4);
      for (const [x, y] of points) {
        try {
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          result.samples.push({ x, y, rgba: [px[0], px[1], px[2], px[3]] });
        } catch (error) {
          result.samples.push({ x, y, error: String(error) });
        }
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb);
    gl.deleteFramebuffer(fb);
    return result;
  }

  /**
   * Reads the drawing buffer (post composite) right after the beauty render
   * that just happened, for a CSS-pixel rect in top-left-origin screen
   * space. WebGL's buffer is bottom-left-origin and DPR-scaled, so the rect
   * is flipped and scaled before `readPixels`. Returns perceptual-luminance
   * min/mean/p5 (5th percentile, i.e. "darkest 5%") over the sampled rect.
   */
  _readFrameLuminance(x, y, w, h) {
    const renderer = this.renderer;
    const gl = renderer?.getContext?.();
    if (!gl) return null;
    const canvas = renderer.domElement;
    const dpr = renderer.getPixelRatio?.() ?? 1;
    const bufW = canvas.width;
    const bufH = canvas.height;
    const rx = Math.max(0, Math.round(x * dpr));
    const rw = Math.max(1, Math.min(bufW - rx, Math.round(w * dpr)));
    const ryTop = Math.max(0, Math.round(y * dpr));
    const rh = Math.max(1, Math.min(bufH - ryTop, Math.round(h * dpr)));
    const ry = Math.max(0, bufH - ryTop - rh);
    const px = new Uint8Array(rw * rh * 4);
    gl.readPixels(rx, ry, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const lums = new Array(rw * rh);
    let sum = 0;
    for (let i = 0; i < lums.length; i += 1) {
      const o = i * 4;
      const lum = (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) / 255;
      lums[i] = lum;
      sum += lum;
    }
    lums.sort((a, b) => a - b);
    const p5Index = Math.max(0, Math.floor(lums.length * 0.05) - 1);
    return {
      min: +lums[0].toFixed(3),
      p5: +lums[p5Index].toFixed(3),
      mean: +(sum / lums.length).toFixed(3),
      sampleCount: lums.length
    };
  }

  /**
   * DEV — one-shot GPU readback of a screen-space CSS-pixel rect, resolved
   * right after the next beauty render. Used to compare darkest-5%
   * luminance across Archaeology props under the same neon lighting.
   * `window.__stageDebug("debugReadFrameLuminance", x, y, w, h)`.
   */
  debugReadFrameLuminance(x, y, w, h) {
    return new Promise((resolve) => {
      this._pendingFrameReadback = { x, y, w, h, resolve };
    });
  }

  /**
   * Pass J item 5 — track `count` ring stars for `seconds`: every presented
   * frame, read an 11×11 device-px patch around each star's projected
   * center (same rotation-only projection as the shader) and sum its
   * background-subtracted luminance. Resolves per-star min/max/mean and the
   * worst frame-to-frame jump as a % of that star's mean. DEV probe only —
   * the per-frame readPixels stall is the probe's own cost.
   * `window.__stageDebug("debugStarTrack", 10, 20)`.
   */
  debugStarTrack(seconds = 10, count = 20) {
    const field = this.starField;
    const pos = field?.geometry?.getAttribute?.("position");
    const bright = field?.geometry?.getAttribute?.("aBright");
    if (!pos) return Promise.resolve(null);
    const cam = this.camera;
    cam.updateMatrixWorld(true);
    const canvas = this.renderer.domElement;
    const W0 = canvas.width;
    let W = canvas.width;
    let H = canvas.height;
    const sizes = new Set();
    const frameInfo = [];
    const v = new THREE.Vector3();
    const v4 = new THREE.Vector4();
    const project = (i, out) => {
      v.fromBufferAttribute(pos, i).normalize().transformDirection(cam.matrixWorldInverse);
      v4.set(v.x, v.y, v.z, 1).applyMatrix4(cam.projectionMatrix);
      if (v4.w <= 0) return false;
      out.x = ((v4.x / v4.w) * 0.5 + 0.5) * W;
      out.y = ((v4.y / v4.w) * 0.5 + 0.5) * H;
      return true;
    };
    // Candidates: upper sky (past the horizon fade), away from the props,
    // spread across magnitudes, no neighbour within 14 px.
    const cands = [];
    const p = { x: 0, y: 0 };
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i) / Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (y < 0.12) continue;
      if (!project(i, p)) continue;
      if (p.x < W * 0.08 || p.x > W * 0.92 || p.y < H * 0.6 || p.y > H * 0.96) continue;
      p.x /= W;
      p.y /= H;
      cands.push({ i, x: p.x * W, y: p.y * H, mag: bright?.getX(i) ?? 1 });
    }
    cands.sort((a, b) => b.mag - a.mag);
    const picked = [];
    // One star per magnitude quantile (brightest → dimmest), so the dim
    // end — where blinking actually shows — is sampled, not just the top.
    for (let q = 0; q < count; q += 1) {
      const start = Math.floor((q / count) * cands.length);
      const end = Math.floor(((q + 1) / count) * cands.length);
      for (let k = start; k < end; k += 1) {
        const c = cands[k];
        if (picked.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < 14)) continue;
        if (cands.some((o) => o !== c && Math.hypot(o.x - c.x, o.y - c.y) < 9)) continue;
        picked.push(c);
        break;
      }
    }
    const series = picked.map(() => []);
    const track = picked.map(() => ({ x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }));
    const gl = this.renderer.getContext();
    const R = 5;
    const N = (2 * R + 1) * (2 * R + 1);
    const buf = new Uint8Array(N * 4);
    return new Promise((resolve) => {
      const deadline = performance.now() + seconds * 1000;
      this._starTrackHook = () => {
        cam.updateMatrixWorld(true);
        // Canvas can resize mid-probe (rest DPR / governor) — project into
        // the live buffer, report in first-frame pixel units.
        W = canvas.width;
        H = canvas.height;
        sizes.add(`${W}x${H}`);
        frameInfo.push([
          +(this.renderer.getPixelRatio?.() ?? 0).toFixed(3),
          this.post?.drawWidth ?? 0,
          +(this.starField?.material?.uniforms?.uPixelRatio?.value ?? 0).toFixed(3)
        ]);
        const unit = (W0 / W) * (W0 / W);
        for (let s = 0; s < picked.length; s += 1) {
          if (!project(picked[s].i, p)) {
            series[s].push(null);
            continue;
          }
          const tr = track[s];
          tr.x0 = Math.min(tr.x0, p.x);
          tr.x1 = Math.max(tr.x1, p.x);
          tr.y0 = Math.min(tr.y0, p.y);
          tr.y1 = Math.max(tr.y1, p.y);
          const rx = Math.round(p.x) - R;
          const ry = Math.round(p.y) - R;
          if (rx < 0 || ry < 0 || rx + 2 * R >= W || ry + 2 * R >= H) {
            series[s].push(null);
            continue;
          }
          gl.readPixels(rx, ry, 2 * R + 1, 2 * R + 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          // Background = median of the patch border ring.
          const ring = [];
          let sum = 0;
          for (let yy = 0; yy <= 2 * R; yy += 1) {
            for (let xx = 0; xx <= 2 * R; xx += 1) {
              const o = (yy * (2 * R + 1) + xx) * 4;
              const lum = 0.299 * buf[o] + 0.587 * buf[o + 1] + 0.114 * buf[o + 2];
              sum += lum;
              if (yy === 0 || xx === 0 || yy === 2 * R || xx === 2 * R) ring.push(lum);
            }
          }
          ring.sort((a, b) => a - b);
          const bg = ring[ring.length >> 1];
          series[s].push(Math.max(0, sum - bg * N) * unit);
        }
        if (performance.now() < deadline) return;
        this._starTrackHook = null;
        const rows = picked.map((c, s) => {
          const vals = series[s].filter((x) => x != null);
          if (!vals.length) return { star: c.i, frames: 0 };
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          let maxJump = 0;
          let prev = null;
          for (const x of series[s]) {
            if (x != null && prev != null && mean > 0) {
              maxJump = Math.max(maxJump, Math.abs(x - prev) / mean);
            }
            prev = x;
          }
          return {
            star: c.i,
            mag: +c.mag.toFixed(2),
            frames: vals.length,
            min: +Math.min(...vals).toFixed(1),
            max: +Math.max(...vals).toFixed(1),
            mean: +mean.toFixed(1),
            minPctOfMean: mean > 0 ? +((Math.min(...vals) / mean) * 100).toFixed(1) : null,
            maxPctOfMean: mean > 0 ? +((Math.max(...vals) / mean) * 100).toFixed(1) : null,
            maxFrameJumpPct: +(maxJump * 100).toFixed(1),
            driftPx: +Math.hypot(track[s].x1 - track[s].x0, track[s].y1 - track[s].y0).toFixed(2)
          };
        });
        resolve({
          seconds,
          bufferSizes: [...sizes],
          stars: rows,
          series: series.slice(0, 4).map((a) => a.map((x) => (x == null ? null : Math.round(x)))),
          frameInfo
        });
      };
    });
  }

  /** DEV — `window.__stageDebug("debugWarmState")`. Where stepVignette0Warm is. */
  debugWarmState() {
    const w = this._vignette0Warm;
    return {
      phase: w?.phase ?? null,
      done: Boolean(w?.done),
      liveAt: w?._liveAt ?? null,
      liveStepsTotal: w?._liveSteps?.length ?? null,
      currentStep: w?._liveSteps?.[w?._liveAt] ?? null
    };
  }

  /**
   * DEV — `window.__stageDebug("debugStarFieldGeometry")`. Reports the sky
   * shell/streak/camera numbers needed to diagnose the black-hole star hole:
   * shell radius vs. camera near/far, frustumCulled flags, black-hole
   * sequence phase/distance, and the lens/horizon-fade uniform values
   * actually in effect on StarField this frame.
   */
  debugStarFieldGeometry() {
    const seq = this.blackHoleSeq;
    const su = this.starField?.material?.uniforms;
    const fu = this.flightStarStreak?.material?.uniforms;
    return {
      cameraNear: this.camera?.near ?? null,
      cameraFar: this.camera?.far ?? null,
      cameraPos: this.camera ? [this.camera.position.x, this.camera.position.y, this.camera.position.z] : null,
      cameraQuat: this.camera
        ? [this.camera.quaternion.x, this.camera.quaternion.y, this.camera.quaternion.z, this.camera.quaternion.w]
        : null,
      rigHeight: this.cameraRig?.state?.height ?? null,
      rigSettled: this.cameraRig?.state?.isSettled ?? null,
      starFieldRadius: STAR_FIELD_RADIUS,
      starField: {
        frustumCulled: this.starField?.frustumCulled ?? null,
        visible: this.starField?.visible ?? null,
        boundingSphereRadius: this.starField?.geometry?.boundingSphere?.radius ?? null,
        uHorizonFade: su?.uHorizonFade?.value ?? null,
        uLensActive: su?.uLensActive?.value ?? null,
        uLensInner: su?.uLensInner?.value ?? null,
        uLensOuter: su?.uLensOuter?.value ?? null,
        uLensStrength: su?.uLensStrength?.value ?? null
      },
      flightStarStreak: {
        frustumCulled: this.flightStarStreak?.frustumCulled ?? null,
        visible: this.flightStarStreak?.visible ?? null,
        spawnAheadDistance: STREAK_SPAWN_AHEAD,
        uLayerFade: fu?.uLayerFade?.value ?? null
      },
      blackHole: {
        active: Boolean(this._blackHoleActive),
        phase: seq?.phase ?? null,
        distanceToCenter: seq ? seq.position.distanceTo(BLACK_HOLE_CENTER) : null,
        restParallaxBlend: seq?.restParallaxBlend?.() ?? null
      }
    };
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
    this.videoFog = null;
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

  /**
   * Pass J item 7 — ground fog inside the Sidekick group: the stop fade,
   * layer cull and warm compile of stop 2 all cover it automatically.
   */
  _mountSidekickGroundFog() {
    const group = this.vignettes?.[2]?.group;
    if (!group || this.groundFog) return;
    this.groundFog = new SidekickGroundFog();
    group.add(this.groundFog.mesh);
  }

  _tickSidekickGroundFog(time) {
    const fog = this.groundFog;
    if (!fog) return;
    const visible = !this._abGroundFogOff && (this.neon?.getStopFadeRaw?.(2) ?? 0) > 0;
    fog.mesh.visible = visible;
    if (!visible) return;
    const light = this.neon?.stopLights?.[2]?.light;
    const maxL = this.neon?._maxLight || 1;
    fog.update({
      time,
      floorY: STAGE_FLOOR_Y,
      neonColor: this.neon?.entries?.[2]?.dominant ?? null,
      neonLevel: light ? light.intensity / maxL : 0,
      phoneRoot: this.vignettes?.[2]?.instance?.sidekickRoot ?? null
    });
  }

  /** DEV — `window.__stageDebug("setGroundFogParams", { density: 0.2 })`. */
  setGroundFogParams(partial = {}) {
    return this.groundFog?.setParams(partial) ?? null;
  }

  getGroundFogParams() {
    return this.groundFog?.getParams() ?? null;
  }

  /** DEV — ground fog placement / state. */
  debugGroundFog() {
    const f = this.groundFog;
    if (!f) return null;
    const u = f.material.uniforms;
    const w = new THREE.Vector3();
    f.mesh.getWorldPosition(w);
    return {
      visible: f.mesh.visible,
      layers: f.mesh.layers.mask,
      meshLocal: f.mesh.position.toArray().map((v) => +v.toFixed(3)),
      meshWorld: w.toArray().map((v) => +v.toFixed(3)),
      groupWorldY: +(this.vignettes?.[2]?.group?.position?.y ?? 0).toFixed(3),
      floorY: u.uFloorY.value,
      box: { center: u.uBoxCenter.value.toArray().map((v) => +v.toFixed(3)), half: u.uBoxHalf.value.toArray().map((v) => +v.toFixed(3)), on: u.uBoxOn.value },
      opacity: u.uOpacity.value,
      color: u.uColor.value.toArray().map((v) => +v.toFixed(3)),
      density: u.uDensity.value
    };
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
      // Pass J item 8 — 4 consecutive presented frames with no new program
      // and beauty under 40 ms before the fader may lift.
      canDismiss: () => (this._preDismissClean ?? 0) >= 4,
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
    this._enterArmed = true;
    this._maybeShowEnter();
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
    if (!this._inWorker) {
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
    }

    const view = this._viewportCssSize();
    this.duoFab = new DuoFabSystem({
      canvas: this.canvas,
      loadingManager: this.loadingManager,
      width: view.w,
      height: view.h,
      reducedMotion: this.reducedMotion,
      onCaptureRequest: this._inWorker
        ? () => this._hostPost?.({ type: "duo", action: "capture" })
        : null,
      onStateChange: (state) => {
        this.duoMode = state === "mail" || state === "caseStudy";
        if (this._inWorker) this._hostPost?.({ type: "duo", action: "state", state });
      },
      onHoverChange: (hovered) => {
        if (!this.waterCursor && this.canvas.style) {
          this.canvas.style.cursor = hovered ? "pointer" : "default";
        }
      },
      getScreenRect: (rect) => {
        if (!this._inWorker) {
          this.duoMail?.setScreenRect?.(rect);
          return;
        }
        if (!rect) {
          if (this._duoRectNull) return;
          this._duoRectNull = true;
          this._hostPost?.({ type: "duo", action: "screenRect", rect: null });
          return;
        }
        const msg = this._duoRectMsg || (this._duoRectMsg = {
          type: "duo",
          action: "screenRect",
          rect: {
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            corners: [[0, 0], [0, 0], [0, 0], [0, 0]],
            hasCorners: false,
            measure: "",
            normal: [0, 0, 0]
          }
        });
        const slot = msg.rect;
        const corners = rect.corners;
        const hasCorners = Array.isArray(corners) && corners.length === 4;
        if (
          this._duoRectLive &&
          !this._duoRectNull &&
          Math.abs(slot.left - rect.left) < 0.5 &&
          Math.abs(slot.top - rect.top) < 0.5 &&
          Math.abs(slot.width - rect.width) < 0.5 &&
          Math.abs(slot.height - rect.height) < 0.5 &&
          slot.hasCorners === hasCorners &&
          (!hasCorners || cornersWithin(slot.corners, corners, 0.5))
        ) {
          return;
        }
        slot.left = rect.left;
        slot.top = rect.top;
        slot.width = rect.width;
        slot.height = rect.height;
        slot.hasCorners = hasCorners;
        if (hasCorners) {
          for (let i = 0; i < 4; i += 1) {
            slot.corners[i][0] = corners[i][0];
            slot.corners[i][1] = corners[i][1];
          }
        }
        slot.measure = rect.measure || "";
        if (rect.normal) {
          slot.normal[0] = rect.normal[0] ?? 0;
          slot.normal[1] = rect.normal[1] ?? 0;
          slot.normal[2] = rect.normal[2] ?? 0;
        }
        this._duoRectNull = false;
        this._duoRectLive = true;
        this._hostPost?.(msg);
      },
      getMailShell: () => this.duoMail?.shell ?? null
    });
    this.duoFab.setSize(view.w, view.h);

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
    if (this._inWorker) this._hostPost?.({ type: "duo", action: "openMail" });
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
    if (this._inWorker) this._hostPost?.({ type: "duo", action: "openCaseStudy", slug });
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
    this._rigLap("index.setActive", () => this._setActiveVignette(index));
    this._rigLap("index.caption", () => {
      this._setCaption(index);
      if (this.ui.caption) this.ui.caption.style.opacity = "1";
    });
    if (index === 2) {
      this._rigLap("index.fitSidekick", () => this._fitSidekickRestPose(false));
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
   * DEV — live StarField knobs (Shift+S). No graphical panel yet: Shift+S
   * logs the current tuning and usage to console; call setStarFieldParams
   * from devtools (or `window.__stageDebug("setStarFieldParams", {...})`)
   * to change values. Rebuilds the field's geometry in place — never writes
   * to StarField.js's DEFAULT_TUNING constants.
   * @param {Partial<import("./blackhole/StarField.js").DEFAULT_TUNING>} [partial]
   */
  setStarFieldParams(partial = {}) {
    if (!this.starField) return null;
    rebuildStarField(this.starField, partial);
    const tuning = this.starField.userData.tuning;
    console.log("[StarFieldTuner] params:", JSON.stringify(tuning));
    return tuning;
  }

  getStarFieldParams() {
    return this.starField?.userData?.tuning ?? null;
  }

  /**
   * DEV — live near-layer (flight star streak) knobs: density (rebuilds the
   * point count) and fadeDistance (the near-camera fade uniform, no rebuild).
   * @param {{ density?: number, fadeDistance?: number }} [partial]
   */
  setFlightStreakParams(partial = {}) {
    const streak = this.flightStarStreak;
    if (!streak) return null;
    if (Number.isFinite(partial.density) && partial.density !== streak.geometry.attributes.position.count) {
      const fresh = createFlightStarStreak(Math.max(0, Math.round(partial.density)));
      fresh.visible = streak.visible;
      fresh.userData.layerFadeCurrent = streak.userData.layerFadeCurrent;
      fresh.material.uniforms.uLayerFade.value = streak.material.uniforms.uLayerFade.value;
      if (Number.isFinite(partial.fadeDistance)) {
        fresh.material.uniforms.uNearFadeDistance.value = partial.fadeDistance;
      }
      this.scene.remove(streak);
      streak.geometry.dispose();
      streak.material.dispose();
      this.scene.add(fresh);
      this.flightStarStreak = fresh;
    } else if (Number.isFinite(partial.fadeDistance)) {
      streak.material.uniforms.uNearFadeDistance.value = partial.fadeDistance;
    }
    const state = {
      density: this.flightStarStreak.geometry.attributes.position.count,
      fadeDistance: this.flightStarStreak.material.uniforms.uNearFadeDistance.value
    };
    console.log("[StarFieldTuner] flight streak params:", JSON.stringify(state));
    return state;
  }

  /**
   * DEV — live cursor-trail knobs: timeWindow (seconds of path kept),
   * headRadius/taperExponent (per-sample circle size and falloff), and
   * maxLength (path-span clamp, px before pixelRatio). No rebuild needed —
   * updateCursorStarTrail reads these off the trail's own userData each tick.
   * @param {{ timeWindow?: number, headRadius?: number, taperExponent?: number, maxLength?: number }} [partial]
   */
  setCursorTrailParams(partial = {}) {
    const trail = this.cursorStarTrail;
    if (!trail) return null;
    Object.assign(trail.userData.tuning, partial);
    console.log("[StarFieldTuner] cursor trail params:", JSON.stringify(trail.userData.tuning));
    return trail.userData.tuning;
  }

  getCursorTrailParams() {
    return this.cursorStarTrail?.userData?.tuning ?? null;
  }

  _logStarFieldTuning() {
    console.log("[StarFieldTuner] Shift+S — current StarField tuning:", JSON.stringify(this.getStarFieldParams()));
    console.log(
      "[StarFieldTuner] flight streak:",
      JSON.stringify({
        density: this.flightStarStreak?.geometry.attributes.position.count ?? null,
        fadeDistance: this.flightStarStreak?.material.uniforms.uNearFadeDistance.value ?? null
      })
    );
    console.log("[StarFieldTuner] cursor trail:", JSON.stringify(this.getCursorTrailParams()));
    console.log(
      '[StarFieldTuner] tune via window.__stageDebug("setStarFieldParams", {baseCount, bandRatio, bandSigmaDeg, bandTiltDeg, coreSwellChance, coreWidthDeg, baseExponent, bandExponent, maxBrightness, minBright, minSizePx, maxSizePx, sizeExponent, spriteSoftness, minRenderPx, twinkleAmount, twinkleSpeed}), "setFlightStreakParams", {density, fadeDistance}, or "setCursorTrailParams", {timeWindow, headRadius, taperExponent, maxLength}'
    );
  }

  /**
   * Pass G — coarse phase label for the flight recorder's per-frame record,
   * so a dump can be sliced into hold/spiral/drop/settled/hop without
   * re-deriving it from raw state after the fact.
   */
  _flightPhase() {
    const seq = this.blackHoleSeq;
    if (this._blackHoleActive) {
      return seq?.phase === BLACK_HOLE_PHASE.SPIRAL ? "spiral" : "hold";
    }
    if (!this.introComplete) return "drop";
    return this.cameraRig?.state?.isSettled ? "settled" : "hop";
  }

  /**
   * Pass F — Shift+D toggles the flight-recorder pill. The pill itself is a
   * page-side DOM element (`stageHost.js` owns it, since the worker has no
   * DOM); clicking it calls `flightDump()` over the existing debug-call
   * bridge and downloads the result as .json. A no-op (logged) when
   * `?flight=1` wasn't on this load, so the shortcut is always safe to press.
   */
  _toggleFlightPill() {
    if (!this._flight) {
      console.log('[FlightRecorder] not enabled — reload with ?flight=1 to use Shift+D.');
      return;
    }
    this._flightPillVisible = !this._flightPillVisible;
    const summary = this._flight.pillSummary();
    if (this._inWorker) {
      this._hostPost?.({ type: "flight", visible: this._flightPillVisible, ...summary });
    } else {
      console.log("[FlightRecorder] Shift+D —", JSON.stringify(summary));
    }
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

  /**
   * Pass F — `window.__stageDebug("flightDump")`. Returns `{ enabled: false }`
   * when the recorder wasn't started (no `?flight=1` on this load).
   */
  flightDump() {
    return this._flight?.dump() ?? { enabled: false };
  }

  /**
   * Pass I item 1 — the A/B table's actual measurement: samples real
   * frame-to-frame intervals (via rAF, not the flight recorder) for
   * `seconds`, independent of whether `?flight=1` is even on, and returns
   * fps + p95 interval. Pairs with `debugAbToggle`.
   * `window.__stageDebug("debugMeasureFps", 5)`.
   * @param {number} seconds
   */
  debugMeasureFps(seconds = 5) {
    return new Promise((resolve) => {
      const intervals = [];
      let last = performance.now();
      const deadline = last + seconds * 1000;
      const tick = () => {
        const now = performance.now();
        intervals.push(now - last);
        last = now;
        if (now < deadline) {
          requestAnimationFrame(tick);
          return;
        }
        intervals.sort((a, b) => a - b);
        const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
        const p95 = intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * 0.95))];
        resolve({
          frames: intervals.length,
          fps: +(1000 / mean).toFixed(1),
          meanIntervalMs: +mean.toFixed(2),
          p95IntervalMs: +p95.toFixed(2),
          maxIntervalMs: +intervals[intervals.length - 1].toFixed(2)
        });
      };
      requestAnimationFrame(tick);
    });
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

  /**
   * Pixel ratio that keeps the drawing buffer inside the rest megapixel budget.
   * @param {number} cssW
   * @param {number} cssH
   */
  _pixelRatioForBudget(cssW, cssH) {
    const area = Math.max(1, cssW * cssH);
    const fromBudget = Math.sqrt((this._effectiveBudgetMp() * 1e6) / area);
    const deviceCap = this._fullPixelRatio * (this._renderScale || 1);
    return Math.max(0.2, Math.min(deviceCap, fromBudget));
  }

  _applyRenderScale() {
    const sequence = Boolean(this._blackHoleActive);
    const { w, h } = this._viewportCssSize();
    const budgetRatio = this._pixelRatioForBudget(w, h);
    const sequenceFull = this._fullPixelRatio * this._renderScale * BLACK_HOLE_DPR;
    if (sequence && this._floorMp == null) {
      this.pixelRatio = sequenceFull;
    } else if (sequence) {
      this.pixelRatio = Math.min(sequenceFull, budgetRatio);
    } else if (this._restDprActive) {
      this.pixelRatio = budgetRatio;
    } else {
      const govMul = this.perfGovernor?.effectiveDprMul ?? 1;
      const motion = this._fullPixelRatio * this._renderScale * govMul;
      this.pixelRatio = Math.min(budgetRatio, motion);
    }
    // Canvas stays at the sequence cap. The floor walks composer buffer
    // sizes that were allocated during warm; a swap does not call setSize
    // on a live frame.
    const canvasRatio = sequenceFull;
    const canvasChanged =
      Math.abs(canvasRatio - (this.renderer.getPixelRatio?.() || 0)) > 0.002;
    const dw = Math.max(1, Math.round(w * this.pixelRatio));
    const dh = Math.max(1, Math.round(h * this.pixelRatio));
    const drawChanged = Boolean(
      this.post && (this.post.drawWidth !== dw || this.post.drawHeight !== dh)
    );
    if (!canvasChanged && !drawChanged) return;
    noteFlight("resize", { canvasChanged, drawChanged, dw, dh, canvasRatio: +canvasRatio.toFixed(3) });
    const visible = Boolean(this.introComplete || this._blackHoleActive);
    if (canvasChanged) {
      if (visible) {
        // Not _skipBeauty: renderer.setPixelRatio / post.setSize already
        // reallocate render targets synchronously, so the beauty pass right
        // after is safe at the new size. Skipping it here used to assume a
        // dropped frame is free (reuse last pixels) — with this canvas's
        // preserveDrawingBuffer left at the WebGL default (false), skipping
        // instead risks a real black frame the instant the browser has
        // already discarded the backbuffer since the last present. The
        // governor changes DPR level repeatedly under load (exactly the
        // post-land settle window), so this path used to fire several times
        // in quick succession — each one a visible black flash.
        this._floorIgnoreNext = true;
        this._frameCause = "resize";
      }
      this.renderer.setPixelRatio(canvasRatio);
      if (this.post) {
        this.post.pixelRatio = canvasRatio;
        this.post.setSize(w, h);
      }
    }
    const allocated = this.post?.setDrawSize(dw, dh) === true;
    if (visible && allocated) {
      this._floorIgnoreNext = true;
      this._frameCause = "resize";
    }
    // Pass E+ item 2: this was only ever wired to `_onResize` (a literal
    // window/viewport resize) — a megapixel-budget or governor-driven DPR
    // change (every path that lands here) never resized the Bust-only
    // packed-depth target (`EdgeSilhouetteSdf.depthRT`), leaving it stuck at
    // whichever drawing-buffer size was active at the last real window
    // resize. Its own doc comment says it "must match drawing-buffer size"
    // (used to line bust depth up with FogDepthCapture) — a stale size reads
    // as exactly the reported symptom: grass/bust silhouette sampling a
    // depth texture at the wrong UV scale (ragged edges, grass blades
    // collapsing to a flat disc) at any budget other than the one active
    // when the page/canvas was last literally resized.
    this.edgeGlitch?.setSize?.(dw, dh);
    this._publishPixelBudget();
    // The hole hides the stage. Don't rebuild shadow maps on this owner.
    // A floor notch keeps the baked shadow map; disposing it is another stall.
    if (sequence || this._floorMp != null) return;
    if (!this.spotLight?.shadow) return;
    if (this._holdPrebakedShadows()) return;
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

  _holdPrebakedShadows() {
    if (!this.introComplete) return true;
    return (this._settledWarmFrames ?? 0) < 4;
  }

  _applyNeonShadowSize() {
    if (!this.neon?.stopLights) return;
    if (this._holdPrebakedShadows()) return;
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
      // Pass J item 2: never drop a baked map here (that was a re-bake —
      // and a shadow pop — on the next settle). NeonSystem swaps the size
      // in at the start of that stop's next fade-in, re-rendering the map
      // in the same frame.
      if (light.shadow.map) light.userData.pendingShadowSize = size;
      else light.shadow.mapSize.set(size, size);
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
      pixelBudgetMp: this._pixelBudgetMp,
      restDpr: this._restDpr,
      restDprActive: this._restDprActive,
      dprOwner: this._blackHoleActive ? "sequence" : this._restDprActive ? "rest" : "motion",
      msaa: this.post?.composer?.multisampling ?? 0,
      smaa: Boolean(this.post?.smaaPass?.enabled),
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
      restFidelity: this.debugRestFidelity(),
      warmVignette0: this.debugWarmVignette0(),
      landFrameMs: this._landFrameMs.slice(),
      frameBudget: this.frameBudget?.dump?.() ?? null
    };
  }

  /**
   * DEV — one cheap combined sample for the settle-window black-frame /
   * pop-in investigation (`window.__stageDebug("debugSettleProbe")`,
   * polled tightly from outside). Everything a single poll can show about
   * *why* a frame might go dark or pop a new object in: canvas/drawing-
   * buffer size (resize), governor DPR step, restFidelity key (lantern
   * shadow / wet-probe bake identity), model-reveal opacity, neon tube
   * emissive per stop, chunk-queue + mipmap depth, live program count
   * (compiles), and the black-hole/rig state to place it on the timeline.
   */
  debugSettleProbe() {
    const draw = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(draw);
    const gov = this.perfGovernor;
    const q = this.chunkedTextures;
    return {
      tMs: Math.round(performance.now()),
      drawingBuffer: { width: draw.x, height: draw.y },
      pixelRatio: +this.pixelRatio.toFixed(3),
      governorLevel: gov?.level ?? null,
      governorDprMul: gov?.profile?.dprMul ?? null,
      floorMpNotch: this._floorMp ?? null,
      restFidelityKey: this._restFidelityKey,
      modelRevealOpacity: +((this._modelRevealOpacity ?? 0).toFixed(3)),
      neonTubeEmissive: this.vignettes.map((vig) => vig.tube?.material?.emissiveIntensity ?? 0),
      chunkPending: q?.pending ?? 0,
      chunkMipmapPending: q?.mipmapPending ?? 0,
      programCount: this.renderer?.info?.programs?.length ?? null,
      geometries: this.renderer?.info?.memory?.geometries ?? null,
      textures: this.renderer?.info?.memory?.textures ?? null,
      worldVisible: Boolean(this.world?.visible),
      blackHoleActive: Boolean(this._blackHoleActive),
      rigHeight: this.cameraRig?.state?.height ?? null,
      rigSettled: Boolean(this.cameraRig?.state?.isSettled),
      introComplete: Boolean(this.introComplete),
      introMotionComplete: Boolean(this._introMotionComplete),
      enterShown: Boolean(this._enterShown),
      contextLoss: this._contextLossLog?.length ?? 0,
      liveAt: this._vignette0Warm?._liveAt ?? null,
      liveStepKind: this._vignette0Warm?._liveSteps?.[this._vignette0Warm?._liveAt]?.kind ?? null,
      liveStepStop: this._vignette0Warm?._liveSteps?.[this._vignette0Warm?._liveAt]?.stop ?? null,
      liveStepNotch: this._vignette0Warm?._liveSteps?.[this._vignette0Warm?._liveAt]?.notch ?? null,
      warmPhase: this._vignette0Warm?.phase ?? null,
      warmDone: Boolean(this._vignette0Warm?.done),
      frameCause: this._frameCause ?? null,
      skipBeauty: Boolean(this._skipBeauty)
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
  /**
   * Put the same content roots the live hop uses onto layer 0, and park the
   * rest. Returns a restore. The program key includes every light the camera
   * can see, so a warm that enables the inactive layer compiles the wrong key.
   * @param {number[]} keepIndices
   */
  _warmKeepLayers(keepIndices) {
    const keep = new Set(keepIndices);
    const saved = [];
    const vignettes = this.vignettes || [];
    for (let i = 0; i < vignettes.length; i += 1) {
      const vig = vignettes[i];
      const entry = this.neon?.entries?.[i];
      const active = keep.has(i);
      /** @type {import("three").Object3D[]} */
      const roots = [];
      if (entry?.contentRoot) roots.push(entry.contentRoot);
      if (entry?.tube) roots.push(entry.tube);
      else if (!entry?.contentRoot && vig?.group) {
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
        if (active && root.visible === false) {
          saved.push([root, root.layers.mask, false, null]);
          root.visible = true;
        }
        root.traverse((obj) => {
          if (obj.isLight) return;
          const held = obj.layers.isEnabled(GPU_HOLD_LAYER);
          if (held && !active) return;
          const cull = obj.isMesh ? obj.frustumCulled : null;
          saved.push([obj, obj.layers.mask, null, cull]);
          if (active) {
            obj.layers.disable(INACTIVE_VIGNETTE_LAYER);
            obj.layers.disable(GPU_HOLD_LAYER);
            obj.layers.enable(0);
            if (obj.isMesh) obj.frustumCulled = false;
          } else {
            obj.layers.disable(0);
            obj.layers.enable(INACTIVE_VIGNETTE_LAYER);
          }
        });
      }
    }
    const floor = this.wetFloor?.floorMesh ?? this._wetFloorMesh ?? null;
    if (floor) {
      const cull = floor.frustumCulled;
      saved.push([floor, floor.layers.mask, null, cull]);
      floor.layers.enable(0);
      floor.frustumCulled = false;
    }
    return () => {
      for (let i = saved.length - 1; i >= 0; i -= 1) {
        const [obj, mask, visible, cull] = saved[i];
        obj.layers.mask = mask;
        if (visible === false) obj.visible = false;
        if (cull != null) obj.frustumCulled = cull;
      }
    };
  }

  _syncInactiveVignetteLayers() {
    const s = this.cameraRig?.state;
    if (!s || !this.vignettes?.length) return;
    const to = s.index ?? 0;
    const settled = Boolean(s.isSettled);
    this._syncRestFidelity(settled, to);

    // Pass J — only stops with a live fade (> 0) are on camera. The whole
    // vignette group is culled (content, tube/lantern, floor glow, contact
    // pads), not just neon-lit-content: the old rule kept every tube up for
    // a "ring cue". Each culled object's own mask is saved and replaced by
    // INACTIVE_VIGNETTE_LAYER alone (tubes/glow also sit on layer 2, which
    // "disable layer 0" alone never hid), then restored on fade-in. Culled
    // stops are re-walked every frame so a root mounted into a hidden stop
    // can never render; GPU-held meshes stay owned by the hold.
    for (let i = 0; i < this.vignettes.length; i += 1) {
      const group = this.vignettes[i]?.group;
      if (!group) continue;
      const culled = this.introComplete
        ? (this.neon?.getStopFadeRaw?.(i) ?? 1) <= 0
        : !(i === to || (!settled && i === this._layerCullFromIndex));
      const was = group.userData._stopCulled === true;
      if (!culled && !was) continue;
      if (culled !== was) {
        noteFlight("stop-cull", { stop: i, culled, fade: this.neon?.getStopFadeRaw?.(i) ?? null });
      }
      group.userData._stopCulled = culled;
      group.traverse((obj) => {
        if (obj.isLight || obj === group) return;
        if (obj.layers.isEnabled(GPU_HOLD_LAYER)) return;
        const saved = obj.userData._stopCullMask;
        if (culled) {
          if (saved == null) {
            obj.userData._stopCullMask = obj.layers.mask;
            obj.layers.set(INACTIVE_VIGNETTE_LAYER);
          } else if (obj.layers.mask !== INACTIVE_MASK) {
            // Something re-enabled camera layers on an already-culled object
            // (measured: Archaeology meshes drawing at opacity 0 during a
            // 1->2 hop). Adopt its new mask as the restore value and re-cull.
            if ((this._cullReapplied = (this._cullReapplied ?? 0) + 1) <= 12) {
              noteFlight("cull-reapplied", { stop: i, name: obj.name || obj.type, mask: obj.layers.mask });
            }
            obj.userData._stopCullMask = obj.layers.mask;
            obj.layers.set(INACTIVE_VIGNETTE_LAYER);
          }
        } else if (saved != null) {
          obj.layers.mask = saved;
          delete obj.userData._stopCullMask;
        }
      });
    }
    if (settled) this._layerCullFromIndex = to;
    else if (this._layerCullFromIndex == null) this._layerCullFromIndex = to;
  }

  /**
   * Pass J — advance the per-stop fades and apply one opacity ramp to each
   * stop's whole group. Runs before the model reveal (which multiplies its
   * own ramp by this) and before neon (lights / emissive follow it too).
   * Writes only when a stop's fade moved, so a settled scene does no work.
   * Before the intro lands nothing is written: the Bust arrival reveal owns
   * those materials until then.
   * @param {number} dt
   */
  _tickStopFades(dt) {
    const s = this.cameraRig?.state;
    if (!this.neon || !s) return;
    this.neon.tickStopFades(s.theta, {
      activeIndex: s.index,
      settled: Boolean(s.isSettled),
      dt,
      allowNeon: Boolean(this.introComplete)
    });
    if (!this._appliedStopFade) this._appliedStopFade = [];
    for (let i = 0; i < this.vignettes.length; i += 1) {
      const f = this.neon.getStopFade(i);
      const prev = this._appliedStopFade[i];
      if (!this.introComplete) {
        this._appliedStopFade[i] = f;
        continue;
      }
      if (prev === f) continue;
      this._appliedStopFade[i] = f;
      const group = this.vignettes[i]?.group;
      if (!group) continue;
      // Hold opacity at 0 while culled; restore authored state at exactly 1.
      setGroupRenderOpacity(group, f);
      // Deferred roots still mid-reveal keep their own ramp under this one.
      this._reapplyRevealUnderFade(i, f);
    }
  }

  /**
   * Model-reveal roots inside stop `index` ride under the stop fade.
   * @param {number} index
   * @param {number} fade
   */
  _reapplyRevealUnderFade(index, fade) {
    const reveal = this._modelRevealOpacity;
    if (reveal == null || reveal >= 1) return;
    for (const root of this._modelRevealRootsForStop(index)) {
      setGroupRenderOpacity(root, reveal * fade);
    }
  }

  _modelRevealRootsForStop(index) {
    if (index === 1) return [this.vignettes[1]?.instance?.pcRoot].filter(Boolean);
    if (index === 2) return [this.vignettes[2]?.instance?.sidekickRoot].filter(Boolean);
    if (index === 3) {
      return this.vignettes[3]?.instance?.getMountedRoots?.({ fades: true }) ?? [];
    }
    return [];
  }

  /**
   * Flight-recorder helper: is each stop's real bounding box inside the live
   * frustum. Boxes are measured from the group (geometry bounds, not
   * per-vertex) and refreshed whenever that stop is fully faded in, so late
   * mounts are picked up without a per-frame setFromObject.
   */
  _stopsInView() {
    const cam = this.camera;
    if (!cam || !this.vignettes?.length) return null;
    if (!this._flightFrustum) {
      this._flightFrustum = new THREE.Frustum();
      this._flightPV = new THREE.Matrix4();
    }
    this._flightPV.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._flightFrustum.setFromProjectionMatrix(this._flightPV);
    return this.vignettes.map((v, i) => {
      // The subject prop (bust / PC / phone / shelf), not the whole group:
      // a small prop leaves frame while its tube and floor pads are still in view.
      const group = this._accentSubjectForStop(i) ?? v?.group;
      if (!group) return null;
      const ud = group.userData;
      const full = (this.neon?.getStopFadeRaw?.(i) ?? 0) >= 1;
      if (!ud._flightBox || (full && !ud._flightBoxFresh)) {
        // Visible, prop-sized meshes only: setFromObject on the Sidekick
        // root measured ~1.7 km (hidden / far helper meshes inside it).
        const box = (ud._flightBox ?? new THREE.Box3()).makeEmpty();
        const mesh = new THREE.Box3();
        const size = new THREE.Vector3();
        group.updateWorldMatrix(true, true);
        group.traverse((obj) => {
          if (!obj.isMesh || !obj.geometry) return;
          for (let p = obj; p && p !== group.parent; p = p.parent) if (p.visible === false) return;
          if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
          mesh.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
          if (mesh.isEmpty() || mesh.getSize(size).length() > 12) return;
          box.union(mesh);
        });
        ud._flightBox = box;
        ud._flightBoxFresh = full;
      }
      if (!full) ud._flightBoxFresh = false;
      return ud._flightBox.isEmpty() ? false : this._flightFrustum.intersectsBox(ud._flightBox);
    });
  }

  /**
   * Flight only: on a frame whose beauty triangle count moved > 30%, record
   * which top-level roots actually had meshes on the live camera (layer
   * test + visible chain) and their triangle totals — names the source of a
   * swing instead of inferring it.
   */
  _noteTriangleSwing() {
    const tri = this.post?.renderPass?.lastSceneTriangles ?? 0;
    const prev = this._flightPrevTri ?? tri;
    this._flightPrevTri = tri;
    if (!prev || Math.abs(tri - prev) / prev < 0.3) return;
    const cam = this.camera;
    const rows = {};
    const visibleChain = (o) => {
      for (let p = o; p; p = p.parent) if (p.visible === false) return false;
      return true;
    };
    this.scene.traverse((obj) => {
      if (!obj.isMesh || !obj.layers.test(cam.layers) || !visibleChain(obj)) return;
      let top = obj;
      let stop = null;
      for (let p = obj; p && p.parent; p = p.parent) {
        const vi = this.vignettes.findIndex((v) => v.group === p.parent);
        if (vi >= 0) {
          stop = vi;
          top = p;
          break;
        }
        top = p;
      }
      const key = `${stop ?? "scene"}:${top.name || top.type}`;
      const geo = obj.geometry;
      const n = geo?.index ? geo.index.count / 3 : (geo?.attributes?.position?.count ?? 0) / 3;
      const inst = obj.isInstancedMesh ? obj.count : 1;
      rows[key] = (rows[key] ?? 0) + Math.round(n * inst);
    });
    const top = Object.entries(rows)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    noteFlight("triangle-swing", { from: prev, to: tri, roots: top });
  }

  /**
   * Pass J item 2 — which shadow maps actually re-render, per light, over
   * `seconds` of live frames (wraps WebGLShadowMap.render and applies its
   * own skip rules: renderer-level autoUpdate/needsUpdate, then per-light
   * shadow.autoUpdate/needsUpdate). Also each shadow light's state now.
   * `window.__stageDebug("debugShadowReport", 5)`.
   */
  debugShadowReport(seconds = 5) {
    const sm = this.renderer.shadowMap;
    const orig = sm.render;
    const counts = new Map();
    let frames = 0;
    let lastFrame = -1;
    sm.render = function (lights, scene, camera) {
      if (sm.enabled && (sm.autoUpdate || sm.needsUpdate)) {
        for (const light of lights) {
          const sh = light.shadow;
          if (!sh || !(sh.autoUpdate || sh.needsUpdate)) continue;
          const key = light.name || `${light.type}#${light.id}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      return orig.call(this, lights, scene, camera);
    };
    const t0 = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        frames += 1;
        if (performance.now() - t0 < seconds * 1000) {
          requestAnimationFrame(tick);
          return;
        }
        sm.render = orig;
        const lights = [];
        this.scene.traverse((o) => {
          if (!o.isLight || !o.castShadow || !o.shadow) return;
          lights.push({
            name: o.name || `${o.type}#${o.id}`,
            type: o.type,
            intensity: +o.intensity.toFixed(3),
            shadowIntensity: o.shadow.intensity,
            autoUpdate: o.shadow.autoUpdate,
            needsUpdate: o.shadow.needsUpdate,
            mapSize: o.shadow.mapSize.x,
            hasMap: Boolean(o.shadow.map),
            prebaked: o.userData?.shadowPrebaked ?? null,
            bakes: o.userData?.shadowBakes ?? null
          });
        });
        resolve({
          seconds,
          frames,
          rendererAutoUpdate: sm.autoUpdate,
          // Shadow-map passes per light during the window (any beauty or
          // offscreen render that reached WebGLShadowMap).
          renders: Object.fromEntries(counts),
          lights
        });
      };
      requestAnimationFrame(tick);
    });
  }

  /** DEV — materials under stop `index` whose live opacity/blend differs from authored. */
  debugStopMaterials(index = 1) {
    const group = this.vignettes?.[index]?.group;
    const rows = [];
    let total = 0;
    group?.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        total += 1;
        const a = m.userData?.__revealAuthored;
        const off = a ? Math.abs(m.opacity - a.opacity) > 1e-3 || m.transparent !== a.transparent : m.opacity < 0.999;
        if (off && rows.length < 30) {
          rows.push({
            mesh: obj.name,
            mat: m.name,
            opacity: +m.opacity.toFixed(3),
            transparent: m.transparent,
            depthWrite: m.depthWrite,
            auth: a ? { opacity: a.opacity, transparent: a.transparent } : null
          });
        }
      }
    });
    return { fade: this.neon?.getStopFadeRaw?.(index), applied: this._appliedStopFade?.[index], reveal: this._modelRevealOpacity, total, off: rows };
  }

  /**
   * Pass J item 3 — every textured slot on every mesh under the PC root:
   * mesh, material, slot, texture size, uv channel, chunk-queue state, GL
   * residency, and a GPU readback of mip 0 (a 3×3 grid of texels, read from
   * the GL texture itself — what the shader actually samples).
   * `window.__stageDebug("debugPcTextureReport")`.
   */
  debugPcTextureReport() {
    const root = this.vignettes?.[1]?.instance?.pcRoot;
    if (!root) return { error: "no pcRoot" };
    const gl = this.renderer.getContext();
    const q = this.chunkedTextures;
    const queued = new Set((q?.jobs ?? []).map((j) => j.texture));
    const readback = (tex) => {
      const glTex = this.renderer.properties.get(tex)?.__webglTexture;
      if (!glTex) return { error: "no GL texture" };
      const w = tex.image?.width > 1 ? tex.image.width : tex.userData?.__chunkW ?? 0;
      const h = tex.image?.height > 1 ? tex.image.height : tex.userData?.__chunkH ?? 0;
      const fb = gl.createFramebuffer();
      const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glTex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      const samples = [];
      if (ok && w > 0 && h > 0) {
        const px = new Uint8Array(4);
        for (const fy of [0.2, 0.5, 0.8]) {
          for (const fx of [0.2, 0.5, 0.8]) {
            gl.readPixels(Math.floor(fx * w), Math.floor(fy * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            samples.push([px[0], px[1], px[2]]);
          }
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
      gl.deleteFramebuffer(fb);
      const flat = samples.length > 1 && samples.every((s) => s.join() === samples[0].join());
      return { fbComplete: ok, readW: w, readH: h, samples, uniform: flat };
    };
    const rows = [];
    const seen = new Map();
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        const slots = {};
        for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "alphaMap"]) {
          const tex = mat[key];
          if (!tex?.isTexture) continue;
          if (!seen.has(tex)) {
            seen.set(tex, {
              uuid: tex.uuid.slice(0, 8),
              name: tex.name || null,
              image: `${tex.image?.width ?? "?"}x${tex.image?.height ?? "?"}`,
              size: tex.userData?.__chunkW
                ? `${tex.userData.__chunkW}x${tex.userData.__chunkH}`
                : `${tex.image?.width ?? "?"}x${tex.image?.height ?? "?"}`,
              chunkClaimed: Boolean(tex.userData?.__chunkClaimed),
              chunkDone: Boolean(tex.userData?.__chunkDone),
              inQueue: queued.has(tex),
              channel: tex.channel,
              glResident: Boolean(this.renderer.properties.get(tex)?.__webglTexture),
              // false = three swapped in its own GL object over the uploader's
              glIsChunkOwn: tex.userData?.__chunkGlTex
                ? this.renderer.properties.get(tex)?.__webglTexture === tex.userData.__chunkGlTex
                : null,
              gpu: readback(tex)
            });
          }
          slots[key] = seen.get(tex);
        }
        rows.push({
          mesh: obj.name,
          material: mat.name,
          type: mat.type,
          color: `#${mat.color?.getHexString?.() ?? "?"}`,
          transparent: mat.transparent,
          alphaTest: mat.alphaTest,
          visible: obj.visible,
          uvSets: Object.keys(obj.geometry?.attributes ?? {}).filter((k) => /^uv/.test(k)),
          slots
        });
      }
    });
    return { queuePending: q?.pending ?? null, rows };
  }

  /** DEV — Pass J item 6: every Mail mirror bitmap applied, with latency. */
  debugDuoSyncLog() {
    return (this._duoSyncLog || []).slice();
  }

  /** Pass K — incoming screen bitmaps per kind (count, pixels). */
  _countBitmap(kind, bitmap) {
    if (!this._bitmapCounts) this._bitmapCounts = {};
    const row = this._bitmapCounts[kind] || (this._bitmapCounts[kind] = { count: 0, px: 0, w: 0, h: 0 });
    row.count += 1;
    row.w = bitmap?.width ?? 0;
    row.h = bitmap?.height ?? 0;
    row.px += row.w * row.h;
  }

  debugChunkStepCost() {
    return this.chunkedTextures?.stepCost ?? null;
  }

  debugBitmapCounts() {
    return { t: Math.round(performance.now()), counts: JSON.parse(JSON.stringify(this._bitmapCounts || {})) };
  }

  /**
   * DEV/Pass K — intervals between frames that were actually rendered
   * (unlike debugMeasureFps, which times every rAF tick, skipped or not).
   */
  debugRenderedIntervals(seconds = 5) {
    this._renderStamps = [];
    return new Promise((resolve) => {
      setTimeout(() => {
        const t = this._renderStamps;
        this._renderStamps = null;
        const iv = [];
        for (let i = 1; i < t.length; i += 1) iv.push(t[i] - t[i - 1]);
        const sorted = iv.slice().sort((a, b) => a - b);
        const pick = (q) => +(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0).toFixed(1);
        const mean = iv.reduce((a, b) => a + b, 0) / Math.max(1, iv.length);
        resolve({
          frames: iv.length,
          fps: +(1000 / mean).toFixed(1),
          p50: pick(0.5),
          p95: pick(0.95),
          max: +(sorted[sorted.length - 1] ?? 0).toFixed(1),
          over33: iv.filter((x) => x > 33).length,
          over50: iv.filter((x) => x > 50).length
        });
      }, seconds * 1000);
    });
  }

  /**
   * Pass K item 1.4 — was the frame that just ended paying for background
   * work? Its own cause (compile / texture / bake / reveal), or any frame
   * within 250 ms of background GPU work (a warm draw or held compile shows
   * up as a GPU stall on the *following* frames, with cause "render").
   * @param {number} now
   */
  _frameExplained(now) {
    const cause = this._lastCause || "render";
    if (/^(compile|texture|shadow-bake|wet-bake|reveal-render|warm|resize)/.test(cause)) {
      this._bgWorkAt = now;
      return true;
    }
    if (this._vignette0Warm && !this._vignette0Warm.done) return true;
    if (this._introIntegrationActive || (this._inPreCompile ?? 0) > 0) return true;
    return now - (this._bgWorkAt ?? -Infinity) < 250;
  }

  /**
   * Pass K item 8 — adaptive frame pacing (see the skip at the top of
   * _animate), driven by the rendered-frame meter: `frameMs` of frames that
   * actually rendered (paced-skipped ticks never reach the meter). The
   * display refresh comes from the raw rAF ticks, but as a low percentile —
   * an EMA of ticks drifts up with every stall and once read a 120 Hz panel
   * as 60 Hz, switching pacing off exactly when it was needed.
   *
   * Policy on a high-refresh display: start paced at 60 Hz once the world is
   * visible (a full frame here costs more GPU than 8.3 ms). Uncapped gets a
   * probe only while settled with no input, after 6 s of paced frames that
   * all landed on the even cadence; >= 3 unexplained rendered frames > 33 ms
   * within 1.5 s re-pace it (cooldown before the next probe doubles each
   * time a probe fails, 20 s → 160 s). Switching *to* paced is allowed
   * mid-motion (it only removes bursts); switching to uncapped is not.
   * Every switch is a flight milestone ("pace") with its trigger.
   * @param {number} frameMs rendered-frame interval
   * @param {number} now
   */
  _tickFramePacing(frameMs, now) {
    if (this._paceForced != null || !this.world?.visible) return;
    const refresh = this._displayRefreshMs();
    if (refresh == null) return;
    const highRefresh = refresh < 12;
    const stop = this.cameraRig?.state?.index ?? this.current ?? 0;
    if (this.introComplete && frameMs > 0 && frameMs < 1000) {
      if (!this._paceStats) this._paceStats = {};
      const row = this._paceStats[stop] || (this._paceStats[stop] = { pacedMs: 0, uncappedMs: 0, switches: 0 });
      if (this._paceMs > 0) row.pacedMs += frameMs;
      else row.uncappedMs += frameMs;
    }
    if (!highRefresh) {
      if (this._paceMs) this._setPace(0, "display-60hz", { refresh });
      return;
    }
    if (this._paceMs == null) {
      this._setPace(16.67, "initial-high-refresh", { refresh });
      this._evenSince = now;
      return;
    }
    if (!this._stalls) this._stalls = [];
    if (frameMs > 33 && !this._lastFrameExplained) this._stalls.push(now);
    while (this._stalls.length && now - this._stalls[0] > 1500) this._stalls.shift();
    if (!this._paceMs) {
      if (this._stalls.length >= 3) {
        const probing = now - (this._probeAt ?? -Infinity) < 1600;
        if (probing) {
          this._probeFails = (this._probeFails ?? 0) + 1;
          this._probeCooldownUntil = now + Math.min(160000, 20000 * 2 ** (this._probeFails - 1));
        }
        this._setPace(16.67, probing ? "probe-failed" : "stalls", {
          refresh,
          stalls: this._stalls.length,
          worstMs: Math.round(frameMs)
        });
        this._evenSince = now;
      }
      return;
    }
    if (frameMs > 19 || this._lastFrameExplained) this._evenSince = now;
    const still = Boolean(this.cameraRig?.state?.isSettled) && now - (this._lastInputAt ?? -Infinity) > 1000;
    if (!still) {
      this._evenSince = Math.max(this._evenSince ?? now, now - 4000);
      return;
    }
    if (now - (this._evenSince ?? now) > 6000 && now > (this._probeCooldownUntil ?? 0)) {
      this._probeAt = now;
      this._setPace(0, "probe", { refresh, evenMs: Math.round(now - this._evenSince) });
    }
  }

  /** Display refresh interval from raw rAF ticks (20th percentile of the last 120). */
  _displayRefreshMs() {
    const ticks = this._rawTicks;
    if (!ticks || ticks.length < 60) return null;
    const sorted = ticks.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.2)];
  }

  /** DEV/Pass K — what the hold is waiting on (Enter gate inputs). */
  debugHoldGate() {
    const desktop = this.vignettes?.[1]?.instance;
    const sidekick = this.vignettes?.[2]?.instance;
    const arch = this.vignettes?.[3]?.instance;
    const q = this.chunkedTextures;
    return {
      t: Math.round(performance.now()),
      warmPhase: this._vignette0Warm?.phase,
      bustReady: Boolean(this._vignette0Warm?.bustReady),
      liveAt: this._vignette0Warm?._liveAt ?? null,
      enterArmed: Boolean(this._enterArmed),
      enterShown: Boolean(this._enterShown),
      chunkPending: q?.pending ?? null,
      chunkJobs: (q?.jobs || []).map((j) => `${j.w}x${j.h}:${j.label || j.texture?.name || ""}`).slice(0, 6),
      uploadStop: Boolean(this._uploadStop),
      pc: Boolean(desktop?._pcSceneReady || desktop?.pcRoot),
      sidekick: Boolean(sidekick?._modelLoadSettled),
      sidekickStarted: Boolean(sidekick?._modelLoadStarted),
      arch: Boolean(arch?._modelLoadSettled),
      archStarted: Boolean(arch?._modelLoadStarted)
    };
  }

  /** DEV/Pass K — time spent paced vs uncapped per stop, plus current state. */
  debugPacingStats() {
    const out = {};
    for (const [stop, row] of Object.entries(this._paceStats || {})) {
      out[stop] = { pacedS: +(row.pacedMs / 1000).toFixed(1), uncappedS: +(row.uncappedMs / 1000).toFixed(1), switches: row.switches };
    }
    return { paceMs: this._paceMs ?? null, refreshMs: this._displayRefreshMs(), probeFails: this._probeFails ?? 0, perStop: out };
  }

  _setPace(ms, reason, info = {}) {
    this._paceMs = ms;
    this._lastPacedAt = null;
    if (this._stalls) this._stalls.length = 0;
    const stop = this.cameraRig?.state?.index ?? this.current ?? 0;
    const row = this._paceStats?.[stop];
    if (row) row.switches += 1;
    noteFlight("pace", { ms, reason, stop, settled: Boolean(this.cameraRig?.state?.isSettled), ...info });
  }

  /** DEV/Pass K — force pacing (ms; 0 = every tick) or null to return to adaptive. */
  setFramePacing(ms = null) {
    if (ms == null) {
      this._paceForced = null;
      return { adaptive: true, paceMs: this._paceMs };
    }
    this._paceForced = Math.max(0, Number(ms) || 0);
    this._paceMs = this._paceForced;
    this._lastPacedAt = null;
    return { adaptive: false, paceMs: this._paceMs };
  }

  /** DEV — drop a labelled milestone into the flight dump (test harness marks). */
  flightMark(label) {
    noteFlight("mark", { label: String(label) });
    return this._flight?.frameIndex ?? null;
  }

  /** DEV — `window.__stageDebug("debugStopFade")`. */
  debugStopFade() {
    const n = this.vignettes?.length ?? 0;
    const fades = [];
    const culled = [];
    for (let i = 0; i < n; i += 1) {
      fades.push(+(this.neon?.getStopFadeRaw?.(i) ?? 0).toFixed(3));
      culled.push(this.vignettes[i]?.group?.userData?._stopCulled === true);
    }
    return { fades, culled, latched: this.neon?._fadeInLatched ?? null };
  }

  /**
   * Settled resources from restFidelity.js. Hops restore the full versions.
   * @param {boolean} settled
   * @param {number} index
   */
  _syncRestFidelity(settled, index) {
    const key = !this.introComplete
      ? "intro"
      : settled
        ? `rest:${index}`
        : "motion";
    if (key === this._restFidelityKey) return;
    this._restFidelityKey = key;

    const engines = [];
    for (const vig of this.vignettes ?? []) {
      const engine = vig?.instance?.grassEngine;
      if (engine) engines.push(engine);
    }
    for (const engine of engines) {
      engine.clearRestCull?.();
      engine.setWindDetail?.(true);
    }

    if (!settled || !this.introComplete) {
      if (!settled && this.introComplete) {
        const wet = restResource(0, "wet-floor-probe");
        this.wetFloor?.armSettleBake?.({ probeSize: wet?.probeSize ?? 64 });
        this.neon?.deferShadowBake?.();
      }
      return;
    }
    this.wetFloor?.consumePrebake?.();
    const spec = restFidelityForIndex(index);
    if (!spec) return;
    const engine = this.vignettes?.[index]?.instance?.grassEngine ?? null;
    const cull = restResource(index, "grass-rest-cull");
    if (engine && cull) {
      engine.applyRestCull(this.camera, {
        subpixelPx: cull.subpixelPx,
        ndcMargin: cull.ndcMargin
      });
    }
    if (engine && restResource(index, "grass-rest-wind")) {
      engine.setWindDetail(false);
    }
  }

  /**
   * Settled frames use the megapixel budget. The governor keeps the motion floor.
   * The resize is one frame after arrival so it is not the reveal frame.
   * The first land is pre-sized during vignette-0 warm.
   * @param {number} value
   */
  setRestDpr(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return this._restDpr;
    this._restDpr = Math.min(1, Math.max(0.5, n));
    if (this._restDprActive) this._applyRenderScale();
    return this._restDpr;
  }

  /**
   * Rest drawing-buffer cap in megapixels. Ignored while the black-hole
   * sequence owns the camera. Clamped to 0.8–6.
   * @param {number} megapixels
   */
  setPixelBudget(megapixels) {
    const n = Number(megapixels);
    if (!Number.isFinite(n)) return this._pixelBudgetMp;
    this._pixelBudgetMp = Math.min(6, Math.max(0.8, n));
    this._floorMp = null;
    this._floorUnderSec = 0;
    if (!this._blackHoleActive) this._resizeSkipScene = true;
    return this._pixelBudgetMp;
  }

  _effectiveBudgetMp() {
    if (this._floorMp == null) return this._pixelBudgetMp;
    return Math.min(this._pixelBudgetMp, this._floorMp);
  }

  _installChunkedUploads() {
    const renderer = this.renderer;
    const orig = renderer.initTexture.bind(renderer);
    renderer.initTexture = (texture) => {
      if (this.chunkedTextures.claim(texture, renderer, orig)) return;
      if (texture?.userData?.__chunkClaimed) {
        // Already ours (pending or finished) — texture.image is permanently
        // the 1×1 placeholder, so any later call here (typically material
        // setup elsewhere bumping needsUpdate to apply wrap/colorSpace/filter
        // — not a real content change) must never reach three's real upload
        // path: it would treat that placeholder as genuine 1×1 content and
        // reallocate the GL object, corrupting or reverting a finished
        // texture. Only the wrap mode is worth re-applying post-hoc.
        this.chunkedTextures.syncParams(texture, renderer);
        return;
      }
      return orig(texture);
    };
  }

  _chunkUploadsAllowed() {
    const last = this._lastFrameMs || 0;
    if (last >= FLOOR_DROP_MS) return false;
    if (this._uploadStop || this._enterShown) return false;
    if (!this._blackHoleActive) return false;
    const seq = this.blackHoleSeq;
    return (
      seq?.phase === BLACK_HOLE_PHASE.APPROACH &&
      (seq.restParallaxBlend?.() ?? 0) >= 0.98
    );
  }

  /**
   * Chunk-queue time budget, by phase — never a row count. The black-screen
   * window between the spiral ending and the aerial drop arming (world
   * hidden, `_descentPendingWarm`) is the one that matters most: nothing is
   * visible, so drain as fast as the frame can afford, same spirit as the
   * fader/hold budgets below but much larger.
   */
  _chunkUploadBudgetMs() {
    // Pass G item 3: Bust's own chunk-drain wait (warmVignette0.js) is
    // exactly as hidden/free as `_descentPendingWarm`'s black-screen window
    // — borrow its budget regardless of which path set it.
    if (this._descentPendingWarm || this._bustTexWaitActive) return 40;
    if (this._chunkUploadsAllowed()) return 6; // hold
    return 4; // fader / XP gate / approach dolly, when visible and moving
  }

  _dropFloorNotch() {
    if (this._vignette0Warm && !this._vignette0Warm.done) return;
    if ((this.clock?.elapsedTime ?? 0) < (this._floorResizeAt ?? 0)) return;
    const current = this._effectiveBudgetMp();
    if (current <= FLOOR_MIN_MP + 0.02) return;
    let next = FLOOR_MIN_MP;
    for (let i = FLOOR_MP_NOTCHES.length - 1; i >= 0; i -= 1) {
      if (FLOOR_MP_NOTCHES[i] < current - 0.04) {
        next = FLOOR_MP_NOTCHES[i];
        break;
      }
    }
    if (this._floorMp != null && Math.abs(this._floorMp - next) < 0.02) return;
    this._floorMp = next;
    this._resizeSkipScene = true;
    this._floorResizeAt = (this.clock?.elapsedTime ?? 0) + 1;
    noteFlight("floor-notch", { dir: "down", mp: next, cause: this._lastCause });
  }

  _raiseFloorNotch() {
    if (this._floorMp == null) return;
    let next = null;
    for (const notch of FLOOR_MP_NOTCHES) {
      if (notch > this._floorMp + 0.04) {
        next = notch;
        break;
      }
    }
    if (next == null || next >= this._pixelBudgetMp - 0.04) this._floorMp = null;
    else this._floorMp = next;
    this._resizeSkipScene = true;
    this._floorResizeAt = (this.clock?.elapsedTime ?? 0) + 1;
  }

  _observeFloor(frameMs, dt) {
    if (!(frameMs > 0) || frameMs > 2000) return;
    const stats = this._floorStats;
    stats.frames += 1;
    if (this._frameHistogram) {
      const hist = this._frameHistogram;
      hist.push({ ms: frameMs, cause: this._lastCause || "render", t: Math.round(performance.now()) });
      // 60s at up to ~90fps is ~5400 frames — cap comfortably above that so
      // a full 60s capture is never silently truncated to its tail.
      if (hist.length > 6000) hist.shift();
    }
    if (frameMs > stats.maxMs) {
      stats.maxMs = frameMs;
      stats.minFps = 1000 / frameMs;
      stats.cause = this._lastCause || "render";
      stats.worstGl = this._lastGl || null;
      stats.worstWorkMs = Math.round((this._lastWorkMs || 0) * 10) / 10;
      stats.worstBeautyMs = Math.round((this._lastBeautyMs || 0) * 10) / 10;
      stats.worstDuoMs = Math.round((this._lastDuoMs || 0) * 10) / 10;
      stats.worstEdgeMs = Math.round((this._lastEdgeMs || 0) * 10) / 10;
      stats.worstPreMs = Math.round((this._lastPreMs || 0) * 10) / 10;
      stats.worstPrePart = this._prePart || "";
      stats.worstRig = {
        steps: this._lastRigSteps || [],
        state: this._lastRigState || null
      };
      stats.worstWaterMs = Math.round((this._lastWaterMs || 0) * 10) / 10;
    }
    if (frameMs > FLOOR_FRAME_MS) {
      if (!stats.breaches) stats.breaches = [];
      if (stats.breaches.length < 16) {
        stats.breaches.push({
          ms: Math.round(frameMs * 10) / 10,
          cause: this._lastCause || "render",
          workMs: Math.round((this._lastWorkMs || 0) * 10) / 10,
          beautyMs: Math.round((this._lastBeautyMs || 0) * 10) / 10,
          duoMs: Math.round((this._lastDuoMs || 0) * 10) / 10,
          gl: this._lastGl || null,
          thread: this._threadForCause(this._lastCause || "render"),
          ignored: this._floorIgnoreNext === true
        });
      }
    }
    if (this._floorIgnoreNext) {
      this._floorIgnoreNext = false;
      return;
    }
    // Pass K item 1.4 — background-work frames never drop a notch (and do
    // not reset the recover timer either: they are not the scene's cost).
    if (this._lastFrameExplained) return;
    if (frameMs >= FLOOR_DROP_MS) {
      this._dropFloorNotch();
      this._floorUnderSec = 0;
      return;
    }
    if (frameMs <= FLOOR_RECOVER_MS) {
      this._floorUnderSec += Math.min(0.05, dt || 0);
      if (this._floorUnderSec >= FLOOR_RECOVER_SEC && this._floorMp != null) {
        this._raiseFloorNotch();
        this._floorUnderSec = 0;
      }
    } else {
      this._floorUnderSec = 0;
    }
  }

  _publishFloor(dt) {
    if (!import.meta.env.DEV) return;
    this._floorPostT += dt || 0;
    if (this._floorPostT < 1) return;
    this._floorPostT = 0;
    const stats = this._floorStats;
    this._hostPost?.({
      type: "floor",
      maxMs: Math.round(stats.maxMs * 10) / 10,
      minFps: Math.round(stats.minFps * 10) / 10,
      cause: stats.cause,
      frames: stats.frames,
      floorMp: this._floorMp,
      budgetMp: this._effectiveBudgetMp(),
      pixelRatio: this.pixelRatio,
      textures: this.chunkedTextures?.pending ?? 0,
      breaches: stats.breaches || [],
      worstGl: stats.worstGl || null,
      programs: Math.max(0, (this.renderer.info.programs?.length ?? 0) - (this._programBaseline ?? 0)),
      programLeaks: this._programLeakRows(),
      thread: this._threadForCause(stats.cause),
      worstWorkMs: stats.worstWorkMs ?? 0,
      worstBeautyMs: stats.worstBeautyMs ?? 0,
      worstDuoMs: stats.worstDuoMs ?? 0,
      worstEdgeMs: stats.worstEdgeMs ?? 0,
      worstPreMs: stats.worstPreMs ?? 0,
      worstPrePart: stats.worstPrePart || "",
      worstRig: stats.worstRig || null,
      rigHits: this._rigHits || [],
      paintPeakMs: Math.round((this._paintPeakMs || 0) * 10) / 10,
      worstWaterMs: stats.worstWaterMs ?? 0,
      uploadPeakMs: Math.round((this._uploadPeakMs || 0) * 10) / 10,
      gap: this._lastGap || null,
      composerW: this.post?.drawWidth ?? 0,
      composerH: this.post?.drawHeight ?? 0,
      lightCensus: this._lightCensusRows(),
      hop03: this._hop03Buckets(),
      wetSlots: {
        warm: this._wetWarmSnap || null,
        live: this._wetLiveSnap || null,
        shared: this._wetShared || [],
        channelWrites: this._channelWrites || []
      },
      stallLabel: this._stallLabel || ""
    });
  }

  /**
   * A task that ran outside _animate. The floor report uses this when the
   * next rAF gap is long and the previous callback did almost no work.
   * @param {string} name
   * @param {number} ms
   */
  _installGapProbe() {
    if (this._gapProbe) return;
    this._gapProbe = true;
    const orig = globalThis.setTimeout.bind(globalThis);
    const stage = this;
    globalThis.setTimeout = (fn, delay, ...args) => {
      if (typeof fn !== "function") return orig(fn, delay, ...args);
      return orig(() => {
        const t0 = performance.now();
        try {
          fn(...args);
        } finally {
          const ms = performance.now() - t0;
          if (ms >= 20 && stage._rafEnd && performance.now() - stage._rafEnd > 0) {
            stage._noteGap(fn.name ? `timeout:${fn.name}` : "timeout", ms);
          }
        }
      }, delay);
    };
  }

  _noteGap(name, ms) {
    if (!(ms >= 20)) return;
    const task = { name: String(name || "task"), ms: Math.round(ms) };
    if (!this._gapTasks) this._gapTasks = [];
    this._gapTasks.push(task);
    if (this._gapTasks.length > 8) this._gapTasks.shift();
    const stats = this._floorStats;
    if (!stats || stats.cause !== "gap:unaccounted") return;
    const label = `gap:${task.name}:${task.ms}`;
    stats.cause = label;
    this._lastCause = label;
    this._lastGap = { ms: task.ms, tasks: [task] };
    const breaches = stats.breaches;
    if (!breaches) return;
    for (let i = breaches.length - 1; i >= 0; i -= 1) {
      if (breaches[i].cause !== "gap:unaccounted") continue;
      breaches[i].cause = label;
      breaches[i].thread = this._threadForCause(label);
      break;
    }
  }

  /**
   * @param {string} cause
   */
  _threadForCause(cause) {
    const label = String(cause || "");
    if (label.startsWith("gap:longtask") || label.startsWith("gap:toCanvas") || label.includes("toCanvas")) {
      return "main";
    }
    if (label.startsWith("gap:")) return label === "gap:unaccounted" ? "unaccounted" : "main";
    return "worker";
  }

  _installProgramLog() {
    const programs = this.renderer?.info?.programs;
    if (!programs || programs.__floorLog) return;
    const orig = programs.push.bind(programs);
    const stage = this;
    programs.push = (program) => {
      const count = orig(program);
      // `_compileThenShow`'s pre-compile (onPropMounted, deferred vignette
      // integration) can run after `_enterShown` flips — it's still a warm
      // pass, not a live draw, so it must register the same way regardless.
      if (stage._inPreCompile > 0 || !stage._enterShown) stage._noteWarmProgram(program);
      else stage._noteProgram(program);
      return count;
    };
    programs.__floorLog = true;
  }

  _programState() {
    const rig = this.cameraRig?.state;
    const index = rig?.index ?? this.current ?? 0;
    const settled = Boolean(rig?.isSettled);
    const hole = Boolean(this._blackHoleActive);
    const from = this._layerCullFromIndex ?? index;
    const edge = Number(this.edgeGlitch?.glitchPass?.uniforms?.uEnabled?.value ?? 0) > 0.5;
    const smaa = this.post?._aaMode === "smaa" && Boolean(this.post?.smaaPass?.enabled);
    let motion = "hop";
    if (hole) motion = "black-hole";
    else if (settled || !this.introComplete) motion = "settled";
    return {
      stop: index,
      motion,
      from: motion === "hop" ? from : index,
      to: index,
      duo: this.duoFab?.state || "idle",
      edge,
      smaa,
      hole
    };
  }

  _noteWarmProgram(program) {
    const name = program?.name || program?.type || "program";
    const cacheKey = program?.cacheKey || "";
    if (!this._warmProgramKeys) this._warmProgramKeys = new Map();
    let keys = this._warmProgramKeys.get(name);
    if (!keys) {
      keys = [];
      this._warmProgramKeys.set(name, keys);
    }
    if (keys.length < 8 && !keys.includes(cacheKey)) keys.push(cacheKey);
    if (name === "wet-concrete-floor" && !this._wetWarmSnap) {
      this._wetWarmSnap = this._snapWetSlots("warm");
    }
  }

  _noteProgram(program) {
    const state = this._programState();
    const name = program?.name || program?.type || "program";
    const key = [
      state.motion,
      `${state.from}>${state.to}`,
      `duo:${state.duo}`,
      `edge:${state.edge ? 1 : 0}`,
      `smaa:${state.smaa ? 1 : 0}`,
      name
    ].join("|");
    if (!this._programLeakMap) this._programLeakMap = new Map();
    const row = this._programLeakMap.get(key) || { key, name, count: 0, lights: this._lightKey(), ...state };
    row.count += 1;
    const delta = programKeyDelta(this._warmProgramKeys?.get(name), program?.cacheKey || "") || "same-as-warm";
    if (!row.keyDelta) row.keyDelta = delta;
    this._programLeakMap.set(key, row);
    if (state.motion === "hop" && state.from === 0 && state.to === 3) {
      if (!this._hop03) this._hop03 = [];
      if (this._hop03.length < 160) {
        this._hop03.push({
          name,
          type: program?.type || "",
          role: this._programRole(program),
          delta,
          liveCacheKey: program?.cacheKey || "",
          warmKeysForName: this._warmProgramKeys?.get(name) || []
        });
      }
    }
    if (name === "wet-concrete-floor" && !this._wetLiveSnap) {
      this._wetLiveSnap = this._snapWetSlots("live");
      this._wetShared = this._sharedTextureReport();
    }
  }

  _programRole(program) {
    const name = program?.name || "";
    const type = program?.type || "";
    const override = this.scene?.overrideMaterial;
    if (override && override.type === type && (override.name || "") === name) {
      if (/Depth|distance/i.test(type)) return "depth";
      if (/pick|id/i.test(name)) return "pick";
      return "override";
    }
    if (/MeshDepth|MeshDistance/i.test(type) || /depth/i.test(name)) return "depth";
    if (/pick|gpu-id|id-pass/i.test(name)) return "pick";
    if (/override/i.test(name)) return "override";
    return "own";
  }

  _watchWetChannels(mat) {
    const slots = ["map", "roughnessMap", "normalMap", "metalnessMap", "aoMap", "emissiveMap", "envMap"];
    this._channelWrites = [];
    for (let i = 0; i < slots.length; i += 1) {
      const tex = mat[slots[i]];
      if (!tex?.isTexture || tex.userData.__channelWatch) continue;
      tex.userData.__channelWatch = true;
      let value = tex.channel;
      const slot = slots[i];
      const log = this._channelWrites;
      Object.defineProperty(tex, "channel", {
        configurable: true,
        enumerable: true,
        get() {
          return value;
        },
        set(next) {
          if (next !== value && log.length < 12) {
            log.push({ slot, uuid: tex.uuid.slice(0, 8), from: value, to: next });
          }
          value = next;
        }
      });
    }
  }

  _snapWetSlots(when) {
    const mat = this._wetFloorMaterial;
    if (!mat) return null;
    const slots = [
      "map", "alphaMap", "lightMap", "aoMap", "bumpMap", "normalMap", "displacementMap",
      "emissiveMap", "metalnessMap", "roughnessMap", "anisotropyMap", "clearcoatMap",
      "clearcoatNormalMap", "clearcoatRoughnessMap", "iridescenceMap", "iridescenceThicknessMap",
      "sheenColorMap", "sheenRoughnessMap", "specularMap", "specularColorMap", "specularIntensityMap",
      "transmissionMap", "thicknessMap", "envMap"
    ];
    const maps = {};
    for (let i = 0; i < slots.length; i += 1) {
      const tex = mat[slots[i]];
      if (!tex?.isTexture) continue;
      maps[slots[i]] = { uuid: tex.uuid.slice(0, 8), channel: tex.channel };
    }
    return {
      when,
      type: mat.type,
      transmission: mat.transmission ?? 0,
      version: mat.version,
      maps
    };
  }

  _sharedTextureReport() {
    const owners = new Map();
    const note = (mat, slot, tex) => {
      if (!tex?.isTexture) return;
      const row = owners.get(tex.uuid) || { uuid: tex.uuid.slice(0, 8), channel: tex.channel, slots: [] };
      const label = `${mat?.name || mat?.type || "mat"}.${slot}`;
      if (row.slots.length < 8 && !row.slots.includes(label)) row.slots.push(label);
      row.channel = tex.channel;
      owners.set(tex.uuid, row);
    };
    const visitMat = (mat) => {
      if (!mat) return;
      for (const key of Object.keys(mat)) {
        const tex = mat[key];
        if (tex?.isTexture) note(mat, key, tex);
      }
    };
    this.scene?.traverse((obj) => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (let i = 0; i < mats.length; i += 1) visitMat(mats[i]);
    });
    const shared = [];
    for (const row of owners.values()) {
      if (row.slots.length > 1) shared.push(row);
    }
    return shared.slice(0, 24);
  }

  _hop03Buckets() {
    const rows = this._hop03 || [];
    const groups = new Map();
    const special = [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const bucket = groups.get(row.delta) || { delta: row.delta, count: 0, names: [], types: [] };
      bucket.count += 1;
      if (bucket.names.length < 12 && !bucket.names.includes(row.name)) bucket.names.push(row.name);
      if (bucket.types.length < 6 && !bucket.types.includes(row.type)) bucket.types.push(row.type);
      groups.set(row.delta, bucket);
      if (row.role !== "own" && special.length < 40) {
        special.push({ name: row.name, type: row.type, role: row.role, delta: row.delta });
      }
    }
    return {
      total: rows.length,
      buckets: [...groups.values()].sort((a, b) => b.count - a.count),
      special
    };
  }

  /**
   * Light counts the beauty camera would compile, matching WebGLRenderer's
   * projectObject (hidden ancestors drop the subtree; layer misses do not).
   */
  _lightKey() {
    const cam = this.camera;
    const counts = { p: 0, ps: 0, s: 0, ss: 0, d: 0, ds: 0, r: 0, h: 0, a: 0 };
    const visit = (obj) => {
      if (obj.visible === false) return;
      if (obj.isLight && (!cam || obj.layers.test(cam.layers))) {
        if (obj.isPointLight) {
          counts.p += 1;
          if (obj.castShadow) counts.ps += 1;
        } else if (obj.isSpotLight) {
          counts.s += 1;
          if (obj.castShadow) counts.ss += 1;
        } else if (obj.isDirectionalLight) {
          counts.d += 1;
          if (obj.castShadow) counts.ds += 1;
        } else if (obj.isRectAreaLight) counts.r += 1;
        else if (obj.isHemisphereLight) counts.h += 1;
        else if (obj.isAmbientLight) counts.a += 1;
      }
      const children = obj.children;
      for (let i = 0; i < children.length; i += 1) visit(children[i]);
    };
    if (this.scene) visit(this.scene);
    return `p${counts.p} ps${counts.ps} s${counts.s} ss${counts.ss} d${counts.d} ds${counts.ds} r${counts.r} h${counts.h} a${counts.a}`;
  }

  /** One row per stop/hop/Duo/edge/black-hole visit. Keys must stay a single string. */
  _noteLightCensus() {
    const state = this._programState();
    const id = [
      state.motion,
      `${state.from}>${state.to}`,
      `duo:${state.duo}`,
      `edge:${state.edge ? 1 : 0}`,
      `smaa:${state.smaa ? 1 : 0}`,
      `hole:${state.hole ? 1 : 0}`
    ].join("|");
    const lights = this._lightKey();
    if (!this._lightCensus) this._lightCensus = new Map();
    const row = this._lightCensus.get(id) || { id, keys: [] };
    if (!row.keys.includes(lights)) row.keys.push(lights);
    this._lightCensus.set(id, row);
  }

  _lightCensusRows() {
    if (!this._lightCensus) return [];
    return [...this._lightCensus.values()];
  }

  _programLeakRows() {
    if (!this._programLeakMap) return [];
    const states = new Map();
    for (const row of this._programLeakMap.values()) {
      const cut = row.key.lastIndexOf("|");
      const key = cut >= 0 ? row.key.slice(0, cut) : row.key;
      const bucket = states.get(key) || {
        key,
        count: 0,
        names: [],
        stop: row.stop,
        motion: row.motion,
        from: row.from,
        to: row.to,
        duo: row.duo,
        edge: row.edge,
        smaa: row.smaa,
        hole: row.hole,
        lights: row.lights,
        keyDelta: ""
      };
      bucket.count += row.count;
      if (bucket.names.length < 8 && !bucket.names.includes(row.name)) bucket.names.push(row.name);
      if (row.keyDelta && (row.name === "wet-concrete-floor" || !bucket.keyDelta)) {
        bucket.keyDelta = row.keyDelta;
      }
      states.set(key, bucket);
    }
    return [...states.values()].sort((a, b) => b.count - a.count).slice(0, 20);
  }

  /**
   * DEV — webglcontextlost/restored are the one unambiguous "this canvas
   * actually died" signal, distinct from a merely-dark frame. Timestamped
   * against performance.now() so a report can place it exactly against the
   * settle timeline (`debugSettleProbe`) and against GPU memory via
   * `renderer.info.memory` at the moment of loss.
   */
  _installContextLossLog() {
    this._contextLossLog = [];
    const canvas = this.renderer?.domElement;
    if (!canvas) return;
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      const mem = this.renderer?.info?.memory ?? null;
      const entry = { type: "lost", tMs: Math.round(performance.now()), memory: mem };
      this._contextLossLog.push(entry);
      console.error("[StageExperience] webglcontextlost", entry);
    });
    canvas.addEventListener("webglcontextrestored", () => {
      const entry = { type: "restored", tMs: Math.round(performance.now()) };
      this._contextLossLog.push(entry);
      console.error("[StageExperience] webglcontextrestored", entry);
    });
  }

  /** DEV — `window.__stageDebug("debugContextLossLog")`. */
  debugContextLossLog() {
    return this._contextLossLog ?? [];
  }

  /** DEV — `window.__stageDebug("debugLiveStepLog")`: which warmVignette0
   *  "live" step ran at which performance.now(), for the settle-window
   *  black-frame investigation. */
  debugLiveStepLog() {
    return this._liveStepLog ?? [];
  }

  _installGlProbe() {
    const gl = this.renderer.getContext();
    const bucket = {
      compileMs: 0,
      compiles: 0,
      linkMs: 0,
      links: 0,
      infoLogMs: 0,
      infoLogs: 0,
      linkStatusMs: 0,
      linkStatus: 0,
      readPixels: 0,
      readPixelsMs: 0,
      texImageMs: 0,
      texImages: 0,
      texSubMs: 0,
      texSubs: 0
    };
    this._glBucket = bucket;
    const wrap = (name, msKey, nKey) => {
      const orig = gl[name].bind(gl);
      gl[name] = (...args) => {
        const t0 = performance.now();
        const result = orig(...args);
        bucket[msKey] += performance.now() - t0;
        bucket[nKey] += 1;
        return result;
      };
    };
    wrap("compileShader", "compileMs", "compiles");
    wrap("linkProgram", "linkMs", "links");
    wrap("getProgramInfoLog", "infoLogMs", "infoLogs");
    wrap("getShaderInfoLog", "infoLogMs", "infoLogs");
    wrap("readPixels", "readPixelsMs", "readPixels");
    wrap("texImage2D", "texImageMs", "texImages");
    wrap("texSubImage2D", "texSubMs", "texSubs");

    // DEV — captures which raw texture each texImage2D/texSubImage2D call
    // touches, for debugTextureUploads(). Off unless armed.
    const captureUpload = (kind, args) => {
      if (!this._texUploadCapture) return;
      if (!this._texUploadLog) this._texUploadLog = [];
      if (this._texUploadLog.length >= 4000) return;
      const glTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
      const source = args[args.length - 1];
      const w = source?.width ?? (typeof args[4] === "number" ? args[4] : null);
      const h = source?.height ?? (typeof args[5] === "number" ? args[5] : null);
      this._texUploadLog.push({
        kind,
        glTex,
        w,
        h,
        isImageBitmap: typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap,
        t: Math.round(performance.now())
      });
    };
    const origTexImage2D = gl.texImage2D.bind(gl);
    gl.texImage2D = (...args) => {
      captureUpload("texImage2D", args);
      return origTexImage2D(...args);
    };
    const origTexSubImage2D = gl.texSubImage2D.bind(gl);
    gl.texSubImage2D = (...args) => {
      captureUpload("texSubImage2D", args);
      return origTexSubImage2D(...args);
    };
    const origParam = gl.getProgramParameter.bind(gl);
    const linkStatus = gl.LINK_STATUS;
    const completion = 0x91b1;
    gl.getProgramParameter = (program, pname) => {
      const t0 = performance.now();
      const result = origParam(program, pname);
      if (pname === linkStatus || pname === completion) {
        bucket.linkStatusMs += performance.now() - t0;
        bucket.linkStatus += 1;
      }
      return result;
    };
    this._glMark = { ...bucket, programs: this.renderer.info.programs?.length ?? 0 };
  }

  _snapshotGl() {
    const bucket = this._glBucket;
    const mark = this._glMark;
    if (!bucket || !mark) return null;
    const programs = this.renderer.info.programs?.length ?? 0;
    const round = (n) => Math.round(n * 10) / 10;
    const snap = {
      compileMs: round(bucket.compileMs - mark.compileMs),
      compiles: bucket.compiles - mark.compiles,
      linkMs: round(bucket.linkMs - mark.linkMs),
      links: bucket.links - mark.links,
      infoLogMs: round(bucket.infoLogMs - mark.infoLogMs),
      infoLogs: bucket.infoLogs - mark.infoLogs,
      linkStatusMs: round(bucket.linkStatusMs - mark.linkStatusMs),
      linkStatus: bucket.linkStatus - mark.linkStatus,
      readPixels: bucket.readPixels - mark.readPixels,
      readPixelsMs: round(bucket.readPixelsMs - mark.readPixelsMs),
      texImageMs: round(bucket.texImageMs - mark.texImageMs),
      texImages: bucket.texImages - mark.texImages,
      texSubMs: round(bucket.texSubMs - mark.texSubMs),
      texSubs: bucket.texSubs - mark.texSubs,
      newPrograms: programs - mark.programs
    };
    this._glMark = { ...bucket, programs };
    return snap;
  }

  resetFloorStats() {
    this._floorStats = { maxMs: 0, minFps: 999, cause: "render", frames: 0, breaches: [] };
    this._floorPostT = 1;
    this._lastGap = null;
    this._gapTasks = [];
    this._rigHits = [];
    this._paintPeakMs = 0;
    this._lastRigSteps = [];
    this._lastRigState = null;
  }

  /** Clear the rig-span lap list for this frame. */
  _beginRigProbe() {
    this._rigSteps = [];
  }

  /**
   * Record one rig-span sub-step. Hits ≥ 40 ms keep the stop/hop/Duo state
   * so a one-frame stall can be tied to the interaction that caused it.
   * @param {string} name
   * @param {number} ms
   */
  _rigRecord(name, ms) {
    if (name === "duoFab.projectsPaint" && ms > (this._paintPeakMs || 0)) {
      this._paintPeakMs = ms;
    }
    if (!(ms >= 0.4)) return;
    const rounded = Math.round(ms * 10) / 10;
    if (!this._rigSteps) this._rigSteps = [];
    this._rigSteps.push([name, rounded]);
    if (ms < 40) return;
    const state = this._programState();
    if (!this._rigHits) this._rigHits = [];
    if (this._rigHits.length >= 32) return;
    this._rigHits.push({
      name,
      ms: rounded,
      motion: state.motion,
      from: state.from,
      to: state.to,
      duo: state.duo,
      edge: state.edge ? 1 : 0,
      stop: state.stop
    });
  }

  /**
   * @template T
   * @param {string} name
   * @param {() => T} fn
   * @returns {T}
   */
  _rigLap(name, fn) {
    const t0 = performance.now();
    const value = fn();
    this._rigRecord(name, performance.now() - t0);
    return value;
  }

  _publishPixelBudget() {
    const draw = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(draw);
    const drawMp = (draw.x * draw.y) / 1e6;
    const payload = {
      type: "pixelBudget",
      targetMp: this._pixelBudgetMp,
      pixelRatio: this.pixelRatio,
      drawW: draw.x,
      drawH: draw.y,
      drawMp: Math.round(drawMp * 100) / 100,
      smaa: Boolean(this.post?.smaaPass?.enabled),
      msaa: this.post?.composer?.multisampling ?? 0
    };
    const key = `${payload.targetMp}|${payload.pixelRatio}|${payload.drawW}x${payload.drawH}|${payload.smaa}|${payload.msaa}`;
    if (key === this._pixelBudgetKey) return;
    this._pixelBudgetKey = key;
    this._hostPost?.(payload);
  }

  /** First land: resize while the black hole (or the hold) is still up. */
  _primeRestDpr() {
    if (this._restDprActive) return;
    this._restDprActive = true;
    this._restDprWait = false;
    this._applyRenderScale();
  }

  /**
   * @param {boolean} settled
   * @param {number} index
   */
  _tickRestDpr(settled, index) {
    if (!this.introComplete) return;
    const restStop = settled && index >= 0 && index <= 3;
    if (restStop) {
      if (this._restDprActive) {
        this._restDprWait = false;
        return;
      }
      if (!this._restDprWait) {
        this._restDprWait = true;
        return;
      }
      // Pass J: never resize inside the arriving stop's fade-in ramp — the
      // rest step lands only after that stop is fully faded in.
      if ((this.neon?.getStopFadeRaw?.(index) ?? 1) < 1) return;
      this._restDprWait = false;
      this._restDprActive = true;
      this._applyRenderScale();
      return;
    }
    this._restDprWait = false;
    if (this._restDprActive && !this._stopFadeRamping()) {
      this._restDprActive = false;
      this._applyRenderScale();
    }
  }

  /**
   * Pass J — true while any stop's fade is strictly between 0 and 1, or the
   * camera is inside an arriving stop's fade-in approach (a resize applied
   * at the top of a frame would otherwise land on the ramp's first frame).
   */
  _stopFadeRamping() {
    if (!this.introComplete || !this.neon) return false;
    for (let i = 0; i < (this.vignettes?.length ?? 0); i += 1) {
      const f = this.neon.getStopFadeRaw(i);
      if (f > 0 && f < 1) return true;
    }
    const s = this.cameraRig?.state;
    const entry = this.neon.entries?.[s?.index ?? -1];
    if (s && entry && this.neon.getStopFadeRaw(s.index) < 1) {
      const d = Math.abs(Math.atan2(Math.sin(s.theta - entry.theta), Math.cos(s.theta - entry.theta)));
      if (d <= STOP_FADE_IN_RAD + 0.12) return true;
    }
    return false;
  }

  debugRestFidelity() {
    const index = this.cameraRig?.state?.index ?? this.current ?? 0;
    const spec = restFidelityForIndex(index);
    const engine = this.vignettes?.[index]?.instance?.grassEngine ?? null;
    const light = this.neon?.stopLights?.[0]?.light ?? null;
    return {
      key: this._restFidelityKey,
      resources: spec ? spec.resources.map((resource) => resource.id) : [],
      grass: engine?._restStats ?? null,
      windDetail: engine?._material?.userData?.grassUniforms?.uWindDetail?.value ?? null,
      wet: this.wetFloor?.debugState?.() ?? null,
      lanternBakes: light?.userData?.shadowBakes ?? null,
      lanternAutoUpdate: light?.shadow?.autoUpdate ?? null
    };
  }

  /**
   * Apply governor wet / shadow / DPR side effects when the profile changes.
   */
  _syncPerfGovernorSideEffects() {
    // Rest owns the settled image. A ladder step must not resize shadows
    // until the hop hands this profile back.
    if (this._restDprActive) return;
    const p = this.perfGovernor?.profile;
    if (!p) return;
    const wetN = p.wetProbeEveryN ?? null;
    if (wetN !== this._wetProbeEveryNOverride) {
      this._wetProbeEveryNOverride = wetN;
      this.wetFloor?.setProbeEveryN?.(wetN);
    }
    const mul = this.perfGovernor.effectiveDprMul;
    // Pass J: a ladder step waits out any stop fade (<= 250 ms) so a resize
    // never lands inside a hop's fade-out or arrival fade-in.
    if (mul !== this._lastGovDprMul && !this._stopFadeRamping()) {
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
  _tickVolumetricFog() {}

  /** Video fog is parked in src/fog-aside. */
  _tickVideoFog() {}

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
    noteFlight("land", { t: Math.round(performance.now()) });
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
    if (this._inWorker && this.isCoarse) return;
    const view = this._viewportCssSize();
    this.waterCursor = WaterCursor.tryCreate({
      renderer: this.renderer,
      ticker: gsap.ticker,
      headless: this._inWorker,
      pointerFine: this._inWorker ? !this.isCoarse : undefined,
      reducedMotion: this._inWorker ? this.reducedMotion : undefined,
      width: this._inWorker ? view.w : 0,
      height: this._inWorker ? view.h : 0
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


  debugWarmVignette0() {
    const warm = this._vignette0Warm;
    const light = this.neon?.stopLights?.[0]?.light ?? null;
    if (!warm) return null;
    return {
      phase: warm.phase,
      done: warm.done,
      meshes: warm.meshes,
      meshAt: warm.meshAt,
      textures: warm.textures,
      textureAt: warm.textureAt,
      shadowBaked: warm.shadowBaked,
      prelit: warm.prelit,
      drawCalls: warm.drawCalls,
      lanternIntensity: light?.intensity ?? null,
      shadowPrebaked: light?.userData?.shadowPrebaked ?? false,
      lanternBakes: light?.userData?.shadowBakes ?? null
    };
  }

  /** One idle frame of Bust prewarm. No-op once the pass has finished. */
  warmVignette0() {
    if (
      !this._holdIntegrationStarted &&
      this._blackHoleActive &&
      !this._introIntegrateScheduled &&
      this._bustWarmReady()
    ) {
      this._holdIntegrationStarted = true;
      this._introIntegrateScheduled = true;
      void this._releaseIntroDeferredWork({ early: true });
    }
    // Pass K item 4 — past Bust's own step nothing here gates the drop, so
    // the rest of the sequence pauses through the spiral/drop and on any
    // non-idle frame after land.
    if (this._vignette0Warm?.bustReady && !this._vignette0Warm.done && !this._bgIdle()) {
      return this._vignette0Warm;
    }
    if (!this._vignette0Warm || this._vignette0Warm.done) {
      this._maybeShowEnter();
      return this._vignette0Warm;
    }
    // Pass I A/B toggle — debugAbToggle("warm-work", false).
    if (this._abWarmPaused) return this._vignette0Warm;
    const state = stepVignette0Warm(this, this._vignette0Warm);
    if (state?.done) {
      this._primeRestDpr();
      this._maybeShowEnter();
    }
    return state;
  }

  /**
   * The drop to Bust waits only on Bust's own readiness (`bustReady`): its
   * mesh/texture compile, its textures uploaded, its lantern shadow and the
   * wet-floor cube baked. The other three stops' live compile, every hop
   * transition, and the CRT glass env step are real work but not Bust
   * dependencies — they keep running in the background (still `warmVignette0`
   * ticks, just past the point that unblocks landing) until `done`.
   */
  _bustWarmReady() {
    return Boolean(this._vignette0Warm?.bustReady || this._vignette0Warm?.done);
  }

  /** Mark intro done once the spring pageload descent settles. */
  _tickIntroFromCameraRig() {
    if (this._introMotionComplete || !this.cameraRig) {
      // Bust's own readiness already unblocked the drop (see _bustWarmReady)
      // — nothing else keeps ticking warmVignette0 once intro motion is
      // marked complete, so without this the other three stops' live
      // compile, every hop transition, and the CRT env step would simply
      // never run and _vignette0Warm.done would never become true. Keep
      // draining it in the background, same per-step skipBeauty/frameCause
      // care as before, until it actually finishes.
      if (this._vignette0Warm && !this._vignette0Warm.done && !this._blackHoleActive && this._takeBgToken("warm")) {
        this.warmVignette0();
      }
      return;
    }
    if (this._blackHoleActive) return;

    if (this._descentPendingWarm) {
      this.warmVignette0();
      if (!this._bustWarmReady()) return;
      this._descentPendingWarm = false;
      this.world.visible = true;
      // Pass G item 3: `prelightStop` existed ("Bust lantern is already at
      // full intensity before the world is shown") but was never actually
      // called anywhere. Without it, NeonSystem's `_syncContentLit` wraps
      // bust/tree/grass in a "neon-lit-content" group gated on its own
      // camera-distance `arriveLevel` smoothstep — independent of
      // `world.visible` — while the lantern tube is explicitly excluded
      // from that wrapper and has no such gate. Lantern was popping in up
      // to ~3.7s before bust/tree/grass (confirmed via the flight recorder)
      // purely because of this split, not a load-order issue. Latching
      // arrive to 1 for stop 0 the instant the world itself goes visible
      // makes both paths resolve on the same frame.
      this.neon?.prelightStop(0);
      this._introSpringArmed = true;
      this.cameraRig.armIntroDescent();
    }

    // Aerial hold — Bust warm replaces the cold first frame. The 240 ms
    // floor still applies; the drop waits until Bust itself is ready.
    if (!this._introSpringArmed) {
      this.warmVignette0();
      if (!this._introHoldStartedAt) this._introHoldStartedAt = performance.now();
      const held = performance.now() - this._introHoldStartedAt >= INTRO_SPRING_HOLD_MS;
      if (held && this._bustWarmReady()) {
        this._introSpringArmed = true;
        this.cameraRig.armIntroDescent();
      }
      return;
    }

    if (this.reducedMotion && !this._vignette0Warm.done) {
      this.warmVignette0();
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
   * Give the washed-out Archaeology props (see `ARCHAEOLOGY_ENV_MAP_INTENSITY`)
   * their own `envMap` so `envMapIntensity` stops being a dead per-material
   * setting (r172: ignored while `envMap` is null). Must run before the
   * root's first `compileHeldRoot` pass (called right after, by the
   * `onPropMounted` callback that invokes this) — flipping `envMap` on a
   * material that has already compiled its shader program would toggle
   * `USE_ENVMAP` and mint a second program post-Enter instead of reusing
   * the one compiled during the hold.
   */
  _applyArchaeologyEnvMap(root) {
    const intensity = ARCHAEOLOGY_ENV_MAP_INTENSITY[root?.name];
    if (intensity === undefined) return;
    const envMap = this.liveEnv?.getStudioEnvironment?.();
    if (!envMap) return;
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat || !("envMap" in mat)) continue;
        mat.envMap = envMap;
        mat.envMapIntensity = intensity;
        mat.needsUpdate = true;
      }
    });
  }

  /**
   * Upload maps, compile once while the root is on GPU_HOLD_LAYER, then show.
   * Not one compile per mesh inside the live fog-depth + beauty frame.
   */
  /**
   * Pass K item 1 — held roots are integrated one at a time through a single
   * queue (onPropMounted fires these unawaited; ~13 Archaeology roots used to
   * resolve together in one 380 ms gap). A root queued twice shares one run.
   * @param {THREE.Object3D} root
   */
  _compileThenShow(root) {
    if (!root || !this.renderer) return Promise.resolve();
    if (!this._heldRuns) this._heldRuns = new Map();
    const queued = this._heldRuns.get(root);
    if (queued) return queued;
    const prev = this._heldQueue ?? Promise.resolve();
    const run = prev.then(() => this._compileThenShowNow(root));
    const settled = run.catch((error) => console.warn("[StageExperience] Held integrate failed:", error));
    this._heldQueue = settled;
    this._heldRuns.set(root, settled);
    return settled;
  }

  /**
   * One frame slot for background GPU work (held textures, compiles, draws).
   * Item 4 tightens this to idle-only post-land slicing.
   */
  async _bgSlot(kind = "held") {
    for (;;) {
      await this._yieldFrame();
      if (this._takeBgToken(kind)) return;
    }
  }

  /**
   * Pass K item 4 — may background work run on this frame? In the hold
   * (black-hole approach) yes; never during the spiral or the drop; after
   * land only while the camera is settled, no stop fade is ramping, and
   * there has been no input for BG_INPUT_QUIET_MS.
   */
  _bgIdle(now = performance.now()) {
    if (this._blackHoleActive) return this.blackHoleSeq?.phase === BLACK_HOLE_PHASE.APPROACH;
    if (!this._introMotionComplete) return false;
    if (!this.cameraRig?.state?.isSettled) return false;
    if (this._stopFadeRamping?.()) return false;
    if (now - (this._lastInputAt ?? -Infinity) < BG_INPUT_QUIET_MS) return false;
    return true;
  }

  /**
   * Pass K item 4 — one background unit per rendered frame (a held texture
   * upload, one compile batch, one held/tiny draw, one chunk strip, one
   * mip generation or one warm step), only on idle frames. Returns false
   * if this frame's unit is already spent or the frame is not idle.
   * @param {string} kind
   */
  _takeBgToken(kind) {
    if (!this._bgIdle()) {
      if (this._bgStats) this._bgStats.pausedChecks += 1;
      return false;
    }
    if (this._bgTokenFrame === this._frameNo) return false;
    this._bgTokenFrame = this._frameNo;
    this._bgTokenKind = kind;
    this._bgTokenAt = performance.now();
    if (!this._bgStats) this._bgStats = { pausedChecks: 0, byKind: {} };
    const row = this._bgStats.byKind[kind] || (this._bgStats.byKind[kind] = { units: 0, postLand: 0 });
    row.units += 1;
    if (this.introComplete) row.postLand += 1;
    return true;
  }

  /** DEV/Pass K item 4 — background units by kind (and post-land count). */
  debugBgStats() {
    return { frameNo: this._frameNo ?? 0, ...(this._bgStats || {}) };
  }

  /**
   * Upload maps, compile once while the root is on GPU_HOLD_LAYER, then show.
   * Not one compile per mesh inside the live fog-depth + beauty frame.
   */
  async _compileThenShowNow(root) {
    if (!root || !this.renderer) return;
    let held = false;
    root.traverse((obj) => {
      if (obj.isMesh && obj.layers.isEnabled(GPU_HOLD_LAYER)) held = true;
    });
    if (!held) {
      if (!this._compileThenShowSkipped) this._compileThenShowSkipped = [];
      if (this._compileThenShowSkipped.length < 20) {
        this._compileThenShowSkipped.push({ root: root.name || "(unnamed)", t: Math.round(performance.now()) });
      }
      return;
    }
    if (!this._compileThenShowSucceeded) this._compileThenShowSucceeded = [];
    if (this._compileThenShowSucceeded.length < 20) {
      this._compileThenShowSucceeded.push({ root: root.name || "(unnamed)", t: Math.round(performance.now()) });
    }
    await this._bgSlot();
    this._holdStableLightVariant();
    const warmResult = await warmMeshesChunked(
      root,
      this.renderer,
      () => this._bgSlot(),
      (info) => {
        if (!this._slowTextureLog) this._slowTextureLog = [];
        if (this._slowTextureLog.length < 20) {
          this._slowTextureLog.push({ root: root.name || "(unnamed)", ...info });
        }
      }
    );
    if (!this._textureWarmStats) {
      this._textureWarmStats = { uploaded: 0, skipped: 0, ms: 0, byRoot: [] };
    }
    this._textureWarmStats.uploaded += warmResult.uploaded;
    this._textureWarmStats.skipped += warmResult.skipped;
    this._textureWarmStats.ms += warmResult.ms;
    if (this._textureWarmStats.byRoot.length < 30) {
      this._textureWarmStats.byRoot.push({ root: root.name || "(unnamed)", ...warmResult });
    }
    try {
      this._inPreCompile = (this._inPreCompile || 0) + 1;
      await this._bgSlot();
      this._holdStableLightVariant();
      // Live state, final opaque state (roots mount mid intro-reveal,
      // transparent) and the hop-fade state — so none of them builds a
      // program or GPU pipeline live on the first hop onto this stop.
      await compileHeldRootVariants(this.renderer, this.scene, this.camera, root, {
        wraps: [(fn) => fn(), (fn) => withAuthoredVariant(root, fn), (fn) => withFadeVariant(root, fn)],
        yieldFrame: () => this._bgSlot()
      });
    } catch (error) {
      console.warn("[StageExperience] Held compile failed:", error);
    } finally {
      this._inPreCompile -= 1;
    }
    await this._bgSlot();
    releaseRootToCamera(root);
    // Pass J: a root released into a stop that is currently culled must
    // not render for even one frame before the next layer sync.
    this._syncInactiveVignetteLayers();
    this._revealPending = true;
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

  /**
   * Heavy vignette integration (PC / Sidekick / Archaeology mount, CRT cube,
   * held compiles). Pass K item 2: it starts in the black-hole hold as soon
   * as Bust is ready (`early`) and runs opportunistically — one background
   * step per frame slot (`_bgSlot`), paused through the spiral and the drop
   * — so whatever finishes before Enter never touches a post-land frame.
   * Anything left over resumes after land under the idle-slot rules.
   * @param {{ early?: boolean }} [opts]
   */
  async _releaseIntroDeferredWork(opts = {}) {
    if (this._introDeferredRunning || this._introIntegrationSettled) return;
    this._introDeferredRunning = true;
    this._introIntegrationActive = true;
    noteFlight("mark", { label: opts.early ? "integrate-start-hold" : "integrate-start-land" });

    const desktop = this.vignettes[1]?.instance;
    const sidekick = this.vignettes[2]?.instance;
    const archaeology = this.vignettes[3]?.instance;
    const yieldFrame = async (frames = 1) => {
      for (let i = 0; i < Math.max(1, frames | 0); i += 1) await this._bgSlot();
    };
    let stillHolding = false;

    try {
      if (!opts.early) await this._waitForIntegrateWindow();
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
      // Skip if the warm sequence's "env" step already captured and locked it.
      if (desktop?.glassMesh && !this.liveEnv?._livePmremLocked) {
        await yieldFrame();
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
      const archaeologyRoots = archaeology?.getMountedRoots?.({ compile: true }) ?? [];
      for (const root of archaeologyRoots) {
        await this._compileThenShow(root);
      }

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
      // Models hadn't finished loading — try again shortly. Reveal stays
      // gated (_introIntegrationSettled stays false) across this retry gap.
      window.setTimeout(() => void this._releaseIntroDeferredWork(opts), 400);
      return;
    }

    noteFlight("mark", { label: this.introComplete ? "integrate-done-post-land" : "integrate-done-hold" });
    this._introIntegrationSettled = true;
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
    const stops = this.neon.stopLights;
    if (stops) {
      for (let i = 0; i < stops.length; i += 1) {
        if (stops[i]?.light?.userData.flushShadow) {
          stops[i].light.userData.flushShadow = false;
          this._flushShadowBake = true;
        }
      }
    }
    if (this._abNeonOff) {
      for (let i = 0; i < (this.neon.entries?.length ?? 0); i += 1) {
        const e = this.neon.entries[i];
        if (e.tube) e.tube.visible = false;
        if (e.floorGlow) e.floorGlow.visible = false;
        if (stops?.[i]?.light) stops[i].light.intensity = 0;
      }
    }
    this._tickAccentLights(time, dt, s.index);
    this._tickContactShadows();
    if (this._abPadsOff) {
      for (const rig of this.contactShadows ?? []) {
        if (rig.spotPad) rig.spotPad.visible = false;
        if (rig.neonPad) rig.neonPad.visible = false;
      }
    }
    this._tickSidekickGroundFog(time);

    const neonPos =
      this.neon?.stopLights?.[s.index]?.light?.position ?? null;
    // Wet-floor cube bakes during the hop, not on the held frame — and
    // (Pass J) only once the incoming stop's fade has reached 1: earlier,
    // the destination is still culled (missing from its own reflection) and
    // the outgoing stop is mid-fade (a new blend pipeline inside the cube
    // target, measured 769 ms on the first hop off Bust).
    if (!s.isSettled) {
      this.wetFloor?.setBubbleCenter?.(neonPos);
      const destOpaque = (this.neon?.getStopFadeRaw?.(s.index) ?? 1) >= 1;
      if (this.wetFloor?._bakePending && destOpaque) {
        const baked = this.wetFloor.update?.(time, {
          probeWorld: neonPos,
          hideExtra: this.groundFog?.mesh ? [this.groundFog.mesh] : []
        });
        if (baked) {
          this._frameCause = "wet-bake";
          // Pass F: confirmed via the flight recorder that this single-frame
          // skip produces a real black flash (BLACK trigger, luminance
          // dropping to 0) when it fires post-land during a hop, not just a
          // harmless repeated frame — same `_hasPresentedFrame` rule as
          // warmVignette0.js's bakes.
          this._skipBeauty = !this._hasPresentedFrame;
        }
      }
      return;
    }
    if (this.wetFloor?._bakePending) return;
    const vig = this.vignettes?.[s.index]?.instance;
    const hideExtra = [];
    if (vig?.grassRoot) hideExtra.push(vig.grassRoot);
    if (vig?.grassEngine?.root) hideExtra.push(vig.grassEngine.root);
    if (this.groundFog?.mesh) hideExtra.push(this.groundFog.mesh);
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

  /**
   * Neon point lights and the POV spot always cast. Hops dim shadow.intensity
   * instead of clearing castShadow, so NUM_*_LIGHT_SHADOWS stays put.
   */
  _markPre(name, t0) {
    const ms = performance.now() - t0;
    if (ms >= (this._prePartMs || 0)) {
      this._prePartMs = ms;
      this._prePart = name;
    }
    // Pass I item 3 — _prePart/_prePartMs only ever kept the single worst
    // section per frame, discarding the rest; the periodic-hitch
    // investigation needs every section, every frame, to actually name
    // which one spikes rather than guessing from the frame total alone.
    if (!this._preSections) this._preSections = [];
    this._preSections.push([name, Math.round(ms * 10) / 10]);
    return performance.now();
  }

  _holdStableLightVariant() {
    this._pinStageLightSlots();
    const stops = this.neon?.stopLights || [];
    for (let i = 0; i < stops.length; i += 1) {
      const light = stops[i]?.light;
      if (!light) continue;
      light.castShadow = true;
      if (light.shadow) light.shadow.autoUpdate = false;
    }
    if (this.spotLight) this.spotLight.castShadow = true;
    const glow = this.stageLights?.glow;
    const ball = this.stageLights?.scrollball;
    if (glow) glow.castShadow = false;
    if (ball) ball.castShadow = false;
  }

  /**
   * Spill, glow, and the scrollball stay on the scene rig. A hidden vignette
   * used to drop them out of the program key (settled stop 3 went to p5 r0).
   */
  _pinStageLightSlots() {
    const rig = this.stageLights;
    if (!rig?.group || !this.scene) return;
    if (rig.group.parent !== this.scene) {
      this._noteLightPin("reparent-group", rig.group.parent?.name || "none");
      this.scene.add(rig.group);
    }
    if (rig.group.visible === false) {
      this._noteLightPin("group-hidden");
      rig.group.visible = true;
    }
    const lights = [rig.spill, rig.glow, rig.scrollball];
    for (let i = 0; i < lights.length; i += 1) {
      const light = lights[i];
      if (!light) continue;
      if (light.parent !== rig.group) {
        this._noteLightPin("reparent-light", `${light.name} from ${light.parent?.name || "none"}`);
        rig.group.add(light);
      }
      if (light.visible === false) {
        this._noteLightPin("light-hidden", light.name);
        light.visible = true;
      }
      if (this.camera && !light.layers.test(this.camera.layers)) {
        this._noteLightPin(
          "camera-miss",
          `${light.name} light ${light.layers.mask} cam ${this.camera.layers.mask}`
        );
        light.layers.mask |= this.camera.layers.mask;
      }
    }
  }

  _noteLightPin(reason, detail) {
    const key = detail ? `${reason}:${detail}` : reason;
    if (!this._lightPinSeen) this._lightPinSeen = new Set();
    if (this._lightPinSeen.has(key)) return;
    this._lightPinSeen.add(key);
    console.warn("[StageExperience] stage light slot repaired", key);
  }

  /** CRT env capture — skipped if the held-window warm already ran. */
  _flushIntroDeferredWork() {
    if (this.liveEnv?._livePmremLocked) return;
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
    const archaeology = this.vignettes[3]?.instance;
    const roots = [
      this.vignettes[1]?.instance?.pcRoot,
      this.vignettes[2]?.instance?.sidekickRoot,
      ...(archaeology?.getMountedRoots?.({ fades: true }) ?? [])
    ].filter(Boolean);
    if (!roots.length) return;

    // Only reveal once intro motion is done and at least one model is mounted.
    if (!this._introMotionComplete) return;
    // Don't tick the fade at all — not just "don't start" — until every
    // vignette's own integration (mount + _compileThenShow) has finished a
    // full pass. All four roots share one opacity value; the previous guard
    // (`&& this._modelRevealOpacity <= 0`) only blocked the very first tick,
    // so once Desktop's early compile let opacity start climbing, Sidekick
    // and Archaeology — compiled later in the same async pipeline — kept
    // getting their shaders built live while already partially visible,
    // the exact "heavy pop-in as the camera settles" pattern (confirmed via
    // a settle-window capture: ~100 new programs compiling while opacity
    // ramped 0.35 -> 0.78, each a visible hitch).
    if (!this._introIntegrationSettled) return;

    if (this._modelRevealOpacity < 1) {
      const cappedDt = Math.min(Math.max(dt, 0), 1 / 24);
      this._modelRevealOpacity = Math.min(1, this._modelRevealOpacity + cappedDt / 1.35);
    }

    const opacity = this._modelRevealOpacity;
    for (let i = 1; i <= 3; i += 1) {
      // Pass J: the reveal rides under the stop fade (a hidden stop stays at
      // 0, the arriving stop multiplies in). Stamp once both are at 1.
      // Once the reveal is done, roots are stamped once (late Archaeology
      // mounts included) and the stop fade owns their opacity from then on.
      const fade = this.neon?.getStopFade?.(i) ?? 1;
      for (const root of this._modelRevealRootsForStop(i)) {
        if (opacity >= 1 && root.userData._revealStamped) continue;
        setGroupRenderOpacity(root, opacity * fade);
        if (opacity >= 1) root.userData._revealStamped = true;
      }
    }
    if (opacity >= 1 && archaeology && !this._archRevealLogged) {
      this._archRevealLogged = true;
      const settled = archaeology.getMountedRoots().map((root) => {
        let held = 0;
        let meshOpacity = null;
        root.traverse((obj) => {
          if (!obj.isMesh) return;
          if (obj.layers.isEnabled(GPU_HOLD_LAYER)) held += 1;
          const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
          if (meshOpacity == null && mat) meshOpacity = mat.opacity;
        });
        const name = root.userData.archaeologyMount?.name || root.name;
        return `${name}:held=${held}:op=${meshOpacity}`;
      });
      console.log(`[Archaeology] reveal settled ${settled.length} ${settled.join(" ")}`);
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
          mySpace: this._inWorker ? this._crtPlaceholder : this.hud.getMySpaceScreen(),
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
          onAligned: () => this._snapAllVignettesToFloor(),
          stageLights: this.stageLights,
          getCanvasRect: () => this._getCanvasRect(),
          onCrtScreenRect: (rect) => this._publishCrtLiveScreenRect(rect),
          onCrtLiveChange: (live) => {
            this._crtLiveState = live;
            if (!this._inWorker) {
              this.hud?.crtLive?.setLive(live);
              return;
            }
            this._hostPost?.({ type: "crtLive", action: "live", live });
          }
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
          onScreenCommand: this._inWorker
            ? (command, payload) => {
                this._hostPost?.({ type: "sidekick", command, ...(payload || {}) });
              }
            : null,
          onScreenReady: () => this._applyQueuedSidekickBitmap(),
          onAligned: () => {
            this._snapAllVignettesToFloor();
            // Only fit once the camera is on the Sidekick stop — otherwise
            // viewport scaling samples from the wrong facing angle.
            if (this.introComplete && this.cameraRig?.state?.index === 2) {
              this._fitSidekickRestPose(false);
            }
          },
          stageLights: this.stageLights
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
            this._applyArchaeologyEnvMap(root);
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
    if (this._inWorker) {
      this.ui = {};
      this._hostPost?.({
        type: "stops",
        stops: this.vignettes.map((vig) => ({ name: vig.def.name, desc: vig.def.desc }))
      });
      this._setCaption(0);
      return;
    }

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
    this._hostPost?.({
      type: "stopChange",
      data: {
        stopIndex: index,
        count: this.vignettes.length,
        name: def.name,
        desc: def.desc
      }
    });
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

    this._rigLap("sidekick.worldMatrix", () => this.world.updateMatrixWorld(true));
    const fitted = this._rigLap("sidekick.fitPose", () => sidekick.fitRestHeroPose(this.camera));
    if (fitted) {
      this._rigLap("sidekick.fitUpdate", () => sidekick.update?.(0));
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
    this._prioritizeChunkQueueForVignette(this.cameraRig.state.index);
  }

  /**
   * A hop can land on a vignette whose own large textures were claimed only
   * moments ago (post-intro PC/Sidekick/Archaeology integration) and are
   * still queued behind whatever else the chunk queue was already draining.
   * Move that vignette's textures to the front so the hop-frame budget in
   * the render loop actually spends on them first.
   * @param {number} index
   */
  _prioritizeChunkQueueForVignette(index) {
    const group = this.vignettes?.[index]?.group;
    if (!group || !this.chunkedTextures?.pending) return;
    const keys = [
      "map",
      "normalMap",
      "roughnessMap",
      "metalnessMap",
      "aoMap",
      "emissiveMap",
      "alphaMap",
      "bumpMap",
      "displacementMap"
    ];
    const textures = new Set();
    group.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        for (const key of keys) {
          const tex = mat[key];
          if (tex?.isTexture) textures.add(tex);
        }
      }
    });
    this.chunkedTextures.prioritize(textures);
  }

  next = (options) => this.advance(1, options);
  prev = (options) => this.advance(-1, options);

  _bindInput() {
    this._onWheel = (event) => {
      if (this.locked) {
        event.preventDefault();
        return;
      }
      // Case study is a real scroller. preventDefault here cancels that scroll
      // because this listener is non-passive on window. Leave the event alone
      // when the pointer is over the sheet so the browser moves .duo-cs__scroll.
      if (this.duoMode) {
        if (this._wheelShouldScrollCaseStudy(event)) return;
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

    this._onKeyDown = (event) => {
      if (event.key === "?" && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const tag = event.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) return;
        event.preventDefault();
        const steps = [1.6, 2.3, 3.2];
        const index = steps.findIndex((step) => Math.abs(step - this._pixelBudgetMp) < 0.05);
        this.setPixelBudget(steps[(index + 1) % steps.length]);
        return;
      }
      if (event.key.toLowerCase() === "s" && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const tag = event.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) return;
        event.preventDefault();
        this._logStarFieldTuning();
        return;
      }
      if (event.key.toLowerCase() === "d" && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const tag = event.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) return;
        event.preventDefault();
        this._toggleFlightPill();
        return;
      }
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
    };

    if (this._inWorker) return;

    window.addEventListener("wheel", this._onWheel, { passive: false });

    window.addEventListener("keydown", this._onKeyDown);

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
    if (this._inWorker) {
      const w = Math.max(1, this._cssWidth || 1);
      const h = Math.max(1, this._cssHeight || 1);
      return { left: 0, top: 0, width: w, height: h, right: w, bottom: h };
    }
    return this.canvas.getBoundingClientRect();
  }

  /**
   * Pass C — bridge `DesktopVignette`'s CRT content-quad screen-rect to the
   * host, same double-gated (0.5px) pattern as the Duo Mail `screenRect`
   * bridge: `DesktopVignette` already gated once at the source, this gates
   * again before a worker `postMessage` (cheap to re-check, expensive to
   * spam the host with no-op rects every frame).
   * @param {{ left: number, top: number, width: number, height: number, corners: [number, number][], contentW: number, contentH: number } | null} rect
   */
  _publishCrtLiveScreenRect(rect) {
    if (!this._inWorker) {
      this.hud?.crtLive?.setScreenRect(rect);
      return;
    }
    if (!rect) {
      if (this._crtLiveRectNull) return;
      this._crtLiveRectNull = true;
      this._hostPost?.({ type: "crtLive", action: "screenRect", rect: null });
      return;
    }
    const msg = this._crtLiveRectMsg || (this._crtLiveRectMsg = {
      type: "crtLive",
      action: "screenRect",
      rect: {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        corners: [[0, 0], [0, 0], [0, 0], [0, 0]],
        contentW: 0,
        contentH: 0
      }
    });
    const slot = msg.rect;
    if (
      this._crtLiveRectLive &&
      !this._crtLiveRectNull &&
      Math.abs(slot.left - rect.left) < 0.5 &&
      Math.abs(slot.top - rect.top) < 0.5 &&
      Math.abs(slot.width - rect.width) < 0.5 &&
      Math.abs(slot.height - rect.height) < 0.5 &&
      cornersWithin(slot.corners, rect.corners, 0.5)
    ) {
      return;
    }
    slot.left = rect.left;
    slot.top = rect.top;
    slot.width = rect.width;
    slot.height = rect.height;
    for (let i = 0; i < 4; i += 1) {
      slot.corners[i][0] = rect.corners[i][0];
      slot.corners[i][1] = rect.corners[i][1];
    }
    slot.contentW = rect.contentW;
    slot.contentH = rect.contentH;
    this._crtLiveRectNull = false;
    this._crtLiveRectLive = true;
    this._hostPost?.(msg);
  }

  _hostPointerEvent(msg) {
    const event = this._hostEvent || (this._hostEvent = {
      clientX: 0,
      clientY: 0,
      button: 0,
      preventDefault() {},
      stopImmediatePropagation() {},
      target: null
    });
    event.clientX = msg.clientX ?? 0;
    event.clientY = msg.clientY ?? 0;
    event.button = msg.button ?? 0;
    return event;
  }

  handleHostResize({ width, height, dpr }) {
    this._cssWidth = width;
    this._cssHeight = height;
    if (Number.isFinite(dpr) && dpr > 0) {
      this._fullPixelRatio = Math.min(dpr, this.isCoarse ? 1.5 : 1.75);
      this.pixelRatio = this._fullPixelRatio * (this._renderScale || 1);
      this.renderer?.setPixelRatio(this.pixelRatio);
    }
    this._onResize();
  }

  applyCrtBitmap(bitmap, state) {
    this._countBitmap("applyCrtBitmap", bitmap);
    this._crtPlaceholder?.applyBitmap?.(bitmap, state);
  }

  applySidekickBitmap(bitmap) {
    this._countBitmap("applySidekickBitmap", bitmap);
    if (
      this._sidekickBitmap &&
      this._sidekickBitmap !== bitmap &&
      typeof ImageBitmap !== "undefined" &&
      this._sidekickBitmap instanceof ImageBitmap
    ) {
      this._sidekickBitmap.close();
    }
    this._sidekickBitmap = bitmap;
    this._applyQueuedSidekickBitmap();
  }

  _applyQueuedSidekickBitmap() {
    const bitmap = this._sidekickBitmap;
    const mesh = this.vignettes?.[2]?.instance?.screenMesh;
    if (!bitmap || !mesh) return;
    const material = Array.isArray(mesh.material)
      ? mesh.material.find((mat) => mat) || null
      : mesh.material;
    if (!material) return;
    if (!this._sidekickMap) {
      this._sidekickMap = new THREE.Texture(bitmap);
      this._sidekickMap.colorSpace = THREE.SRGBColorSpace;
      this._sidekickMap.flipY = false;
      this._sidekickMap.generateMipmaps = false;
      this._sidekickMap.minFilter = THREE.LinearFilter;
      this._sidekickMap.magFilter = THREE.LinearFilter;
      this._sidekickMap.userData.noChunk = true;
    }
    const prev = this._sidekickMap.image;
    this._sidekickMap.image = bitmap;
    this._sidekickMap.needsUpdate = true;
    material.map = this._sidekickMap;
    material.emissiveMap = this._sidekickMap;
    configureSidekickScreenMaterial(material);
    ensureSidekickScreenMapLocked(mesh);
    material.needsUpdate = true;
    if (prev && prev !== bitmap && typeof ImageBitmap !== "undefined" && prev instanceof ImageBitmap) {
      prev.close();
    }
  }

  applyDuoBitmap(bitmap, meta = null) {
    this._countBitmap("applyDuoBitmap", bitmap);
    // Pass J item 6 — latency log: overlay change -> texture swapped here.
    if (meta) {
      if (!this._duoSyncLog) this._duoSyncLog = [];
      const appliedAt = performance.timeOrigin + performance.now();
      this._duoSyncLog.push({ ...meta, appliedAt, latencyMs: Math.round(appliedAt - meta.dirtyAt) });
      if (this._duoSyncLog.length > 200) this._duoSyncLog.shift();
    }
    const texture = this.duoFab?._mailScreen?.texture;
    if (!texture) {
      const prev = this._duoBitmapPending;
      this._duoBitmapPending = bitmap;
      if (prev && prev !== bitmap && typeof ImageBitmap !== "undefined" && prev instanceof ImageBitmap) {
        prev.close();
      }
      return;
    }
    this._duoBitmapPending = null;
    this._duoGlassReady = true;
    const prev = texture.image;
    // Pass J item 6: WebGL ignores flipY for ImageBitmap uploads, so the
    // canvas-path rotation (π, see duoMailScreen.js) turns the bitmap
    // upside down on the open-pose glass. Verified on screen: 0 reads
    // upright with the same layout as the overlay (traffic lights top-left).
    texture.rotation = 0;
    texture.image = bitmap;
    texture.needsUpdate = true;
    if (prev && prev !== bitmap && typeof ImageBitmap !== "undefined" && prev instanceof ImageBitmap) {
      prev.close();
    }
  }

  handleHostDuo(msg) {
    if (msg.action === "poseCaseStudy") {
      this.duoFab?.openCaseStudy();
      this.duoMode = true;
      return;
    }
    if (msg.action === "close") {
      this.duoFab?.closeToIdle();
      this.duoMode = false;
      return;
    }
    if (msg.action === "back") {
      this.duoFab?.closeToMail();
      this.duoMode = true;
      return;
    }
    if (msg.action === "capture") this.duoFab?.captureMailScreen?.();
  }

  handleHostPointer(msg) {
    this._lastInputAt = performance.now();
    const event = this._hostPointerEvent(msg);
    this._updateHoverFromClient(event.clientX, event.clientY);
    if (this.cameraRig && !this.reducedMotion) {
      this.cameraRig.setPointer(msg.x || 0, msg.y || 0);
    }
    if (msg.inside === false) this.waterCursor?.setPointer?.(event.clientX, event.clientY, false);
    else this.waterCursor?.setPointer?.(event.clientX, event.clientY, true);
  }

  handleHostWheel(msg) {
    this._lastInputAt = performance.now();
    this._onWheel?.({
      ...this._hostPointerEvent(msg),
      deltaY: msg.deltaY || 0,
      deltaMode: msg.deltaMode || 0
    });
  }

  handleHostPointerDown(msg) {
    this._lastInputAt = performance.now();
    const event = this._hostPointerEvent(msg);
    this.waterCursor?.setPressed?.(true);
    if (this._blackHoleActive && this._onBlackHolePointerDown) {
      this._onBlackHolePointerDown(event);
      return;
    }
    this._onPointerDown?.(event);
  }

  handleHostPointerUp() {
    this.waterCursor?.setPressed?.(false);
    this._onPointerUp?.();
  }

  handleHostClick(msg) {
    this._onVignetteClick?.(this._hostPointerEvent(msg));
  }

  handleHostKey(msg) {
    this._lastInputAt = performance.now();
    const event = {
      key: msg.key,
      shiftKey: Boolean(msg.shiftKey),
      metaKey: Boolean(msg.metaKey),
      ctrlKey: Boolean(msg.ctrlKey),
      altKey: Boolean(msg.altKey),
      preventDefault() {},
      target: null
    };
    if (this._blackHoleActive && this._onBlackHoleKeyDown) {
      this._onBlackHoleKeyDown(event);
      return;
    }
    this._onKeyDown?.(event);
  }

  engageBlackHole() {
    this._triggerBlackHoleSpiral();
  }

  /**
   * Shrink/hide the water cursor while the pointer is over Mail or case-study UI.
   * @param {number} clientX
   * @param {number} clientY
   */
  _syncWaterCursorUiChrome(clientX, clientY) {
    if (!this.waterCursor?.setUiChromeSuppressed) return;
    // Pass C: `this._crtLiveState` is computed worker-side every frame
    // (DesktopVignette._updateCrtLiveOverlay) without needing DOM access, so
    // unlike `_pointerOverDuoUiChrome` it works correctly in worker mode —
    // broad suppression (not a precise content-rect hit-test) is fine since
    // "live" already implies the camera is close in on the CRT.
    const over = this._pointerOverDuoUiChrome(clientX, clientY) || this._crtLiveState === true;
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

  /**
   * True when this wheel should move the open case-study sheet and not the ring.
   * Wheels on the sticky nav (outside the scroller) are applied by hand.
   * @param {WheelEvent} event
   */
  _wheelShouldScrollCaseStudy(event) {
    if (!this.duoCaseStudy?.isOpen) return false;
    const root = this.duoCaseStudy.root;
    const scroller = root?.querySelector?.(".duo-cs__scroll");
    const target = event.target;
    if (!root || !scroller || !(target instanceof Node) || !root.contains(target)) {
      return false;
    }
    if (!scroller.contains(target)) {
      scroller.scrollTop += normalizeWheelDelta(event);
      event.preventDefault();
    }
    return true;
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
    this._lastInputAt = performance.now();
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
        if (!this.waterCursor && this.canvas.style) this.canvas.style.cursor = "pointer";
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
        if (this.canvas.style) this.canvas.style.cursor = cursorMode === "default" ? "default" : cursorMode;
      }
    } else {
      this._screenHover = false;
      this._pcScreenHovered = false;
      if (!this.waterCursor) {
        if (this.canvas.style) this.canvas.style.cursor = "default";
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
      this._hostPost?.({
        type: "mailTrace",
        hit: onDuo,
        x: event.clientX,
        y: event.clientY,
        live: Boolean(this.duoFab.isLive),
        state: this.duoFab.state
      });
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
    if (!this.waterCursor && this.canvas.style) {
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

  /**
   * DEV — canvas drawing-buffer size and last-frame triangle count, for a
   * "did anything actually render" smoke check. The worker owns the canvas
   * (`stageHost.js` only holds a `<canvas>` it transferred to offscreen), so
   * a test on the page side can't read `canvas.width`/`renderer.info` itself
   * the way a main-thread stage could — this is the bridge-safe equivalent.
   */
  debugCanvasStats() {
    return {
      width: this.canvas?.width ?? 0,
      height: this.canvas?.height ?? 0,
      triangles: this.renderer?.info?.render?.triangles ?? 0
    };
  }

  /**
   * DEV — presence of the key mounted roots `test:smoke` checks after a hop
   * cycle (every vignette's own async GLB loads settle on their own
   * schedule, independent of which stop the camera is looking at).
   */
  debugVignetteProps() {
    const desktop = this.vignettes?.[1]?.instance;
    const sidekick = this.vignettes?.[2]?.instance;
    const archaeology = this.vignettes?.[3]?.instance;
    return {
      pcRoot: Boolean(desktop?.pcRoot),
      screenMesh: Boolean(desktop?.screenMesh),
      buttons: Boolean(sidekick?.sidekickRoot?.getObjectByName?.("Buttons")),
      shelfRoot: Boolean(archaeology?.shelfRoot),
      venusRoot: Boolean(archaeology?.venusRoot),
      lucyRoot: Boolean(archaeology?.lucyRoot),
      trojanHorseRoot: Boolean(archaeology?.trojanHorseRoot),
      olmecHeadRoot: Boolean(archaeology?.olmecHeadRoot),
      oliveBoatRoot: Boolean(archaeology?.oliveBoatRoot),
      cuneiformRoot: Boolean(archaeology?.cuneiformRoot),
      ishtarGateRoot: Boolean(archaeology?.ishtarGateRoot),
      ptolemyRoot: Boolean(archaeology?.ptolemyRoot),
      divjeBabeFluteRoot: Boolean(archaeology?.divjeBabeFluteRoot),
      neanderthalRoot: Boolean(archaeology?.neanderthalRoot)
    };
  }

  /** DEV — CRT power/boot state, for asserting the Desktop zoom actually starts XP boot. */
  debugCrtBootState() {
    const desktop = this.vignettes?.[1]?.instance;
    return {
      isPoweredOn: Boolean(desktop?.mySpace?.isPoweredOn),
      isMonitorBooting: Boolean(desktop?.mySpace?.isMonitorBooting),
      canStartBoot: Boolean(desktop?.mySpace?.xpBoot?.canStartBoot),
      isBooting: Boolean(desktop?.mySpace?.xpBoot?.isBooting)
    };
  }

  /** DEV — Pass C CRT live-DOM eligibility, as last computed by `DesktopVignette`. */
  debugCrtLiveState() {
    return { live: Boolean(this._crtLiveState) };
  }

  /** DEV — Pass D geometry-verified Duo open-pose orientation check (see `DuoFabSystem.debugOpenOrientation`). */
  debugDuoOrientation() {
    return this.duoFab?.debugOpenOrientation?.() ?? { error: "no duoFab" };
  }

  /** DEV — the open-iso bake's candidate search log (`DuoFabSystem._openIsoDebug`). */
  debugDuoBakeInfo() {
    return this.duoFab?._openIsoDebug ?? { error: "no bake info" };
  }

  /** DEV — open the Duo into Mail (for visual screenshots), or close it back to idle. Goes through the real `_duoOpenMail`/`_duoCloseToIdle` path so the host DOM panel actually opens too, not just the worker-side state. */
  debugDuoSetOpen(open) {
    if (!this.duoFab) return { error: "no duoFab" };
    if (open) this._duoOpenMail();
    else this._duoCloseToIdle();
    return { state: this.duoFab.state };
  }

  /** DEV — the commit this worker bundle was built from (`vite.config.js`'s `__BUILD_COMMIT__`), so a stale cached/unreloaded worker is a one-line check against `git rev-parse --short HEAD`. */
  debugVersion() {
    return { commit: typeof __BUILD_COMMIT__ !== "undefined" ? __BUILD_COMMIT__ : "unknown" };
  }

  /** DEV — render-target sizes after a hop cycle (zero-size = a resize bug). */
  debugRenderTargetStats() {
    const fog = this.volumetricFog?.fogTarget;
    const input = this.post?.composer?.inputBuffer;
    const output = this.post?.composer?.outputBuffer;
    const bustDepth = this.edgeGlitch?.sdf?.depthRT;
    const draw = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(draw);
    const rt = (t) =>
      t
        ? {
            w: t.width,
            h: t.height,
            depthW: t.depthTexture?.image?.width ?? null,
            depthH: t.depthTexture?.image?.height ?? null
          }
        : null;
    return {
      drawingBuffer: { w: draw.x, h: draw.y },
      pixelBudgetMp: this._pixelBudgetMp,
      fog: fog ? { w: fog.width, h: fog.height } : null,
      input: rt(input),
      output: rt(output),
      // Pass E+ item 2: this is the target `_applyRenderScale` was missing
      // (see its own comment) — compare its w/h to drawingBuffer above; a
      // mismatch after a megapixel-budget change (not a window resize) is
      // exactly the bug.
      bustSilhouetteDepth: bustDepth ? { w: bustDepth.width, h: bustDepth.height } : null
    };
  }

  /**
   * DEV — the chunk-queue completion check `test:smoke` runs after landing:
   * is anything still pending, and is one finished texture's mip 0 real
   * image data (not a flat placeholder or garbage)?
   */
  debugChunkReadbackSample() {
    const q = this.chunkedTextures;
    let sampleMat = null;
    for (const vig of this.vignettes || []) {
      vig?.group?.traverse?.((obj) => {
        if (sampleMat || !obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat?.map?.userData?.__chunkDone) sampleMat = mat.name;
        }
      });
    }
    const readback = sampleMat ? this.debugReadTexturePixels(sampleMat, "map", 0) : null;
    return { pending: q?.pending ?? 0, sampleMaterial: sampleMat, readback };
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
      new URLSearchParams(this._inWorker ? this._search : window.location.search).get("blackhole") === "0";
    if (skip) return;

    this.blackHoleSeq = new BlackHoleCameraSequence(this.camera);
    this.blackHole = createBlackHoleModel(BLACK_HOLE_CENTER);
    this.scene.add(this.blackHole.group);
    this.cameraRig.poseSuspended = true;
    this._blackHoleActive = true;
    this._applyRenderScale();
    this.post?.setSequenceAntialias?.(BLACK_HOLE_MSAA);
    this.world.visible = false;
    this._spotIntensitySaved = this.spotLight?.intensity ?? SPOT_INTENSITY;
    if (this.spotLight) {
      this.spotLight.intensity = 0;
      this.spotLight.castShadow = true;
      if (this.spotLight.shadow) this.spotLight.shadow.intensity = 0;
    }
    document.body.classList.add("is-black-hole");
    this._hostPost?.({ type: "dom", blackHole: true });

    this._onBlackHolePointerDown = (event) => {
      if (event.button != null && event.button !== 0) return;
      this._triggerBlackHoleSpiral();
    };
    this._onBlackHoleKeyDown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (
        typeof HTMLInputElement !== "undefined" &&
        (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      event.preventDefault();
      this._triggerBlackHoleSpiral();
    };
    if (!this._inWorker) {
      window.addEventListener("pointerdown", this._onBlackHolePointerDown);
      window.addEventListener("keydown", this._onBlackHoleKeyDown);
    }
  }

  _withoutGrassShadows(draw) {
    const meshes = [];
    const vignettes = this.vignettes || [];
    for (let i = 0; i < vignettes.length; i += 1) {
      const mesh = vignettes[i]?.instance?.grassEngine?.mesh;
      if (!mesh?.castShadow) continue;
      meshes.push(mesh);
      mesh.castShadow = false;
    }
    try {
      draw();
    } finally {
      for (let i = 0; i < meshes.length; i += 1) meshes[i].castShadow = true;
    }
  }

  _maybeShowEnter() {
    if (!this._enterArmed || this._enterShown || !this._blackHoleActive) return;
    if (!this._bustWarmReady()) return;
    const pending = this.chunkedTextures?.pending ?? 0;
    if (pending > 0 && !this._uploadStop) return;
    this._enterShown = true;
    this._programBaseline = this.renderer.info.programs?.length ?? 0;
    this._showBlackHoleEnter();
  }

  _showBlackHoleEnter() {
    if (!this._blackHoleActive) return;
    this._enterShownAtMs = Math.round(performance.now());
    document.getElementById("bh-enter")?.removeAttribute("hidden");
    this._hostPost?.({ type: "dom", enterVisible: true });
  }

  _triggerBlackHoleSpiral() {
    if (!this._blackHoleActive || this.locked) return;
    if (this.blackHoleSeq?.phase !== BLACK_HOLE_PHASE.APPROACH) return;
    this.blackHoleSeq.triggerSpiral();
    document.getElementById("bh-enter")?.setAttribute("hidden", "");
    this._hostPost?.({ type: "dom", enterVisible: false });
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
    this._applyRenderScale();
    this.post?.setRestAntialias?.();
    this._unbindBlackHoleInput();
    this.blackHole?.hide();
    if (this.spotLight) {
      this.spotLight.intensity = this._spotIntensitySaved ?? SPOT_INTENSITY;
      this.spotLight.castShadow = true;
      if (this.spotLight.shadow) this.spotLight.shadow.intensity = 1;
    }
    const bustReady = this._bustWarmReady();
    this.world.visible = bustReady;
    // Pass G item 3 — see the `_descentPendingWarm` branch of
    // `_tickIntroFromCameraRig` for why this is here: this is the OTHER
    // place `world.visible` can go true (the fast path, when Bust's own
    // warm already finished by spiral-complete) — needs the same prelight.
    if (bustReady) this.neon?.prelightStop(0);
    document.body.classList.remove("is-black-hole");
    document.getElementById("bh-enter")?.setAttribute("hidden", "");
    this._hostPost?.({ type: "dom", blackHole: false, enterVisible: false });

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
    if (bustReady) {
      this._introSpringArmed = true;
      rig.armIntroDescent();
    } else {
      this._descentPendingWarm = true;
    }
  }

  _tickBlackHole(dt) {
    if (!this._blackHoleActive || !this.blackHoleSeq) return;
    const seq = this.blackHoleSeq;
    const approachIdle =
      seq.phase === BLACK_HOLE_PHASE.APPROACH && (seq.restParallaxBlend?.() ?? 0) >= 0.98;
    const finishDuringSpiral =
      seq.phase === BLACK_HOLE_PHASE.SPIRAL && !this._vignette0Warm?.done;
    if (approachIdle || finishDuringSpiral) this.warmVignette0();
    seq.update(dt, () => this._onBlackHoleSpiralComplete());
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

  /**
   * Comet of temporary stars behind the blob. Only after the hold has
   * settled, and only while the pointer is in the sky.
   * @param {number} dt
   * @param {number} time
   */
  _tickCursorStarTrail(dt, time) {
    const trail = this.cursorStarTrail;
    if (!trail) return;
    const seq = this.blackHoleSeq;
    const settled =
      this._blackHoleActive &&
      seq?.phase === BLACK_HOLE_PHASE.APPROACH &&
      (seq.restParallaxBlend?.() ?? 0) >= 0.98;
    const cursor = this.waterCursor;
    const { w, h } = this._viewportCssSize();
    updateCursorStarTrail(trail, this.camera, dt, {
      active: settled && !this.blackHole?.pointerOverDisk,
      x: cursor?._pos?.x,
      y: cursor?._pos?.y,
      vx: cursor?._velocity?.x ?? 0,
      vy: cursor?._velocity?.y ?? 0,
      width: w,
      height: h,
      pixelRatio: this.renderer?.getPixelRatio?.() ?? this.pixelRatio ?? 1,
      presence: cursor?.uniforms?.uPresence?.value ?? 0,
      time
    });
  }

  /** CSS viewport size — prefer documentElement so panel chrome doesn’t desync canvas. */
  _viewportCssSize() {
    if (this._inWorker) {
      return {
        w: Math.max(1, this._cssWidth || 1),
        h: Math.max(1, this._cssHeight || 1)
      };
    }
    const el = document.documentElement;
    const w = Math.max(1, el?.clientWidth || window.innerWidth || 1);
    const h = Math.max(1, el?.clientHeight || window.innerHeight || 1);
    return { w, h };
  }

  _onResize = () => {
    const { w, h } = this._viewportCssSize();
    this.cameraRig?.setViewport(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // false → keep CSS full-bleed (inline px from setSize was the right-edge gutter).
    this.renderer.setSize(w, h, false);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissorTest(false);
    this.post.setSize(w, h);
    this._applyRenderScale();
    this.neon?.setSize?.(this.renderer);
    this.videoFog?.setSizeFromRenderer?.(this.renderer);
    // Pass E+ item 2 follow-up: `_applyRenderScale()` above already sizes
    // `edgeGlitch` to the budget-scaled composer target (dw,dh), not the
    // native drawing buffer. This call used to run unconditionally after it
    // and re-stamp the native size on every literal resize, undoing that fix
    // whenever a resize and a budget change land together (exactly what a
    // `resize_window` + `setPixelBudget` combo, or a real monitor/DPR change,
    // produces) — leaving the Bust depth target desynced from the composer
    // again. `_applyRenderScale()` is the single source of truth for this
    // target's size now.
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
    const names = ["bust", "desktop", "sidekick", "archaeology"];

    this.vignettes.forEach((vignette, index) => {
      const label = names[index] || `v${index}`;
      this._rigLap(`${label}.focus`, () => {
        vignette.instance?.updateFocus?.(this.camera, index === this.current ? focus : 0, {
          isActive: index === this.current,
          transitioning
        });
      });
    });

    const sidekick = this.vignettes[2]?.instance;
    const archaeology = this.vignettes[3]?.instance;
    const active = this._getActiveInstance();

    if (active !== sidekick && active !== archaeology) {
      const activeIndex = this.vignettes.findIndex((vignette) => vignette.instance === active);
      const label = names[activeIndex] || "active";
      this._rigLap(`${label}.update`, () => active?.update?.(t));
    }

    if (sidekick?._aligned) {
      if (sidekick) sidekick._noteRig = (name, ms) => this._rigRecord(name, ms);
      this._rigLap("sidekick.update", () => sidekick.update(t));
    }
    if (archaeology?._aligned) {
      this._rigLap("archaeology.update", () => archaeology.update(t));
    }
  }

  /** Post-intro desktop effects — deferred until integration + settle grace complete. */
  _shouldRunIntroHeavyEffects() {
    return (
      this.introComplete &&
      !this._introIntegrationActive &&
      this._introHeavyEffectsAfter > 0 &&
      performance.now() >= this._introHeavyEffectsAfter &&
      // Pass K item 2 — integration can now finish in the hold; the heavy
      // effects still wait their delay after land, as before.
      performance.now() >= (this._introLandAt ?? Infinity) + INTRO_HEAVY_EFFECTS_DELAY_MS
    );
  }

  /**
   * Cursor depth of field. On only after the black-hole flight.
   * The focal point is a raycast hit, never a depth-buffer readback.
   * @param {number} dt
   */
  _tickCursorDof(dt) {
    const pass = this.post?.dofPass;
    const effect = this.post?.dofEffect;
    if (!pass || !effect) return;
    if (!CURSOR_DOF.enabled) {
      pass.enabled = false;
      return;
    }
    const onRing = !this._blackHoleActive && !this.reducedMotion;
    if (!onRing) {
      this._dofBokeh = 0;
      effect.bokehScale = 0;
      pass.enabled = false;
      return;
    }
    const goal = CURSOR_DOF.bokehScale;
    const k = 1 - Math.exp(-6 * Math.max(0, dt));
    this._dofBokeh += (goal - this._dofBokeh) * k;
    effect.bokehScale = this._dofBokeh;
    pass.enabled = this._dofBokeh > 0.04;
    const index = this.cameraRig?.state?.index ?? this.current ?? 0;
    this.cursorDof.update(this.camera, this.pointer, dt, {
      vignette: this.vignettes?.[index]?.group ?? null,
      floor: this._wetFloorMesh ?? null
    });
  }

  _animate() {
    if (this._debugFrameSaved) {
      requestAnimationFrame(this._animate);
      return;
    }
    // Pass K — frame pacing. On a 120 Hz display rAF fires every 8.3 ms while
    // a frame here costs ~14–17 ms of GPU: submissions outrun the GPU, the
    // swap queue fills, and delivery turns bursty (7–11 ms frames, then a
    // 30 + 60 ms pair; settled p95 81 ms at a 60 fps average) — and those
    // spikes walk the governor down while idle. Skipping alternate ticks
    // gives every frame a full 16.7 ms. A skipped tick issues no GL calls,
    // so nothing is presented and the last frame simply stays up.
    {
      // Display tick estimate (raw rAF cadence, rendered or skipped).
      const nowTick = performance.now();
      if (this._lastTickAt != null) {
        const tick = nowTick - this._lastTickAt;
        if (!this._rawTicks) this._rawTicks = [];
        if (tick > 2 && tick < 100) {
          this._rawTicks.push(tick);
          if (this._rawTicks.length > 120) this._rawTicks.shift();
        }
      }
      this._lastTickAt = nowTick;
    }
    if (this._paceMs > 0) {
      const now = performance.now();
      if (this._lastPacedAt != null && now - this._lastPacedAt < this._paceMs - 4) {
        requestAnimationFrame(this._animate);
        return;
      }
      this._lastPacedAt = now;
    }
    this._frameNo = (this._frameNo ?? 0) + 1;
    this.frameBudget?.begin();
    this._flight?.beginFrame();
    const wall = performance.now();
    const since = this._rafEnd ? wall - this._rafEnd : 0;
    const tasks = this._gapTasks?.splice(0, this._gapTasks.length) || [];
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;
    const frameMs = dt > 0 && dt < 2 ? dt * 1000 : 0;
    if (frameMs > 20 && frameMs > (this._lastWorkMs || 0) + 20) {
      const stallMs = Number(String(this._stallLabel || "").match(/(\d+)/)?.[1] || 0);
      const stallFits = stallMs > 0 && stallMs >= frameMs * 0.5;
      const label = tasks.length
        ? `gap:${tasks.map((task) => `${task.name}:${task.ms}`).join(",")}`
        : stallFits
          ? this._stallLabel
          : "gap:unaccounted";
      this._lastCause = label;
      this._lastGap = { ms: Math.round(since), tasks };
    }
    this._lastFrameExplained = this._frameExplained(wall);
    this._observeFloor(frameMs, dt);
    const workT0 = performance.now();
    this._prePartMs = 0;
    this._prePart = "";
    this._preSections = [];
    let preT = workT0;
    this._holdStableLightVariant();
    if (this._resizeSkipScene && !this._stopFadeRamping()) {
      this._resizeSkipScene = false;
      this._applyRenderScale();
    }
    // Pass I item 5 — the Bust reveal could land on the same tick as a
    // draw-size change (governor/budget reacting to the sudden post-reveal
    // workload spike), reading as a resize visibly overlapping the first
    // frame of real content. Track how many consecutive ticks the
    // composer's actual draw size has held steady; `_bustStepCount`'s gate
    // below requires at least 2 before arming the reveal.
    {
      const dw = this.post?.drawWidth ?? 0;
      const dh = this.post?.drawHeight ?? 0;
      if (dw === this._lastDrawW && dh === this._lastDrawH) {
        this._stableDrawFrames = (this._stableDrawFrames ?? 0) + 1;
      } else {
        this._stableDrawFrames = 0;
        this._lastDrawW = dw;
        this._lastDrawH = dh;
      }
    }

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
    if (desktop?.screenLightRig?.hold?.()) {
      // Desktop content is hidden. Spill and glow stay in the rig at intensity 0.
    } else if (crtLit || this._shouldRunIntroHeavyEffects()) {
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
    preT = this._markPre("crt", preT);

    this.animFns.forEach((fn) => fn(t));

    this.parallaxDampZones?.update(dt);
    this.cameraRig?.parallax?.setStrength?.(this.parallaxDampZones?.scale ?? 1);
    this._tickBlackHole(dt);
    this._tickBlackHoleCursorShear(dt);
    this._tickCursorStarTrail(dt, t);
    const camRigT0 = performance.now();
    this.cameraRig?.update(dt);
    const camRigMs = performance.now() - camRigT0;
    if (this.starField) {
      // Pass G: the per-frame `visible = true` re-assert that used to live
      // here is gone — it was defending against `compileHeldRoot`'s old
      // `hideSceneExcept` call toggling StarField's visibility off for the
      // duration of a compile. `compileHeldRoot` now renders through a
      // dedicated, layer-masked camera instead (see stageModelReveal.js) and
      // never touches `.visible` on anything, so there's nothing left to
      // defend against here.
      // uPixelRatio is set right before post.render (composer draw size).
      updateStarField(this.starField, this.camera, t, dt, {
        horizonFadeOn: !this._blackHoleActive,
        lensActive: this._blackHoleActive
      });
    }
    if (this.flightStarStreak) {
      if (!this._blackHoleActive) {
        // Hard cut, not a fade: this layer is a flight-only "streaming past"
        // effect. A multi-second fade tail was still visibly recycling
        // stars — near-camera streaks crossing the frame — for a couple of
        // seconds after landing on the ring, where the camera is settling
        // into place and nothing should still be "streaming past." The
        // pre-arrival fade below already empties it before the flight ends
        // in the normal case; this is the backstop for whatever's left.
        this.flightStarStreak.visible = false;
        this.flightStarStreak.userData.layerFadeCurrent = 0;
        if (this.flightStarStreak.material?.uniforms?.uLayerFade) {
          this.flightStarStreak.material.uniforms.uLayerFade.value = 0;
        }
      } else {
        const pixelRatio = this.renderer?.getPixelRatio?.() ?? this.pixelRatio ?? 1;
        const blend = this.blackHoleSeq?.restParallaxBlend?.() ?? 0;
        // Fade to 0 over the last stretch of the approach so the near layer
        // is gone before arrival — the ring shows only the far sky.
        const arrivalFade = Math.max(0, Math.min(1, 1 - (blend - 0.55) / 0.4));
        updateFlightStarStreak(this.flightStarStreak, this.camera, pixelRatio, arrivalFade, dt);
      }
    }
    preT = this._markPre("sky", preT);
    this._beginRigProbe();
    // Pass J item 8 — camera rig spring update is timed above (it must run
    // before the star field); reported with the rest of the rig laps.
    this._rigRecord("cameraRig", camRigMs);
    if (this.duoFab) this.duoFab._noteRig = (name, ms) => this._rigRecord(name, ms);
    this._rigLap("intro", () => this._tickIntroFromCameraRig());
    this._rigLap("index", () => this._syncCameraRigIndex());
    this._rigLap("zoom", () => this._syncCameraRigZoom());
    this._rigLap("pov", () => this._aimPovSpotlight());
    this._rigLap("duoFab", () => this.duoFab?.tick?.(dt, t));
    this._rigLap("duoMail", () => {
      this.duoMail?.tick?.(dt);
      if (this.duoMail?.isOpen && this._lastPointer) {
        this.duoMail.setPointerClient?.(this._lastPointer.x, this._lastPointer.y);
      }
    });
    if (this.introComplete) {
      this._applyVignetteMotion(t);
    }
    this._lastRigState = this._rigLap("programState", () => this._programState());
    this._lastRigSteps = (this._rigSteps || []).slice();
    preT = this._markPre("rig", preT);
    this._tickStopFades(dt);
    this._tickModelReveal(dt);
    preT = this._markPre("reveal", preT);
    this._tickPostGrainStrength(dt);
    this._tickNeon(t, dt);
    preT = this._markPre("neon", preT);
    this._tickVolumetricFog(dt);
    this._tickVideoFog(dt);
    preT = this._markPre("fog", preT);
    this._tickIntroBloomReturn(dt);
    this._syncInactiveVignetteLayers();

    // Motion DPR + adaptive governor (EMA frame ms → step-down ladder).
    this._lastFrameMs = frameMs;
    if (this.introComplete && this.cameraRig?.state?.isSettled) {
      this._settledWarmFrames = (this._settledWarmFrames ?? 0) + 1;
    }
    if (this.introComplete && this._landFrameMs.length < 3 && dt > 0 && dt < 1) {
      this._landFrameMs.push(+frameMs.toFixed(2));
    }
    this._tickRestDpr(Boolean(this.cameraRig?.state?.isSettled), this.cameraRig?.state?.index ?? this.current ?? 0);
    const govLevelWas = this.perfGovernor?.level;
    this.perfGovernor?.tick?.(dt, {
      settled: Boolean(this.cameraRig?.state?.isSettled),
      fullDpr: this._fullPixelRatio,
      frameMs,
      explained: this._lastFrameExplained
    });
    if (this.perfGovernor && this.perfGovernor.level !== govLevelWas) {
      noteFlight("governor", { from: govLevelWas, to: this.perfGovernor.level, emaMs: +this.perfGovernor.emaMs.toFixed(1), cause: this._lastCause });
    }
    this._syncPerfGovernorSideEffects();

    if (this.ui?.readout) {
      const deg = this._getDisplayStageDegrees();
      this.ui.readout.textContent = `STAGE ${deg.toFixed(1).padStart(5, "0")}°`;
    }

    if (dt > 0 && dt < 1) {
      const instant = 1 / dt;
      this._fpsEma += (instant - this._fpsEma) * Math.min(1, dt * 3);
    }
    this._fpsDomT += dt;
    if (this._fpsDomT >= 0.25 && (this.ui?.fps || this._inWorker)) {
      this._fpsDomT = 0;
      const fps = Math.round(this._fpsEma);
      if (this.ui?.fps) this.ui.fps.textContent = `${fps} FPS`;
      if (this._inWorker) {
        const deg = this._getDisplayStageDegrees();
        const readout = `STAGE ${deg.toFixed(1).padStart(5, "0")}°`;
        if (fps !== this._lastHudFps || readout !== this._lastHudReadout) {
          this._lastHudFps = fps;
          this._lastHudReadout = readout;
          this._hostPost?.({ type: "hud", fps, readout });
        }
      }
      if (this._flightPillVisible && this._flight && this._inWorker) {
        this._hostPost?.({ type: "flight", visible: true, ...this._flight.pillSummary() });
      }
    }

    const glitchCost = this._edgeGlitchCostActive();
    this.edgeGlitch?.setSceneDepth?.(null);

    // Edge SDF + glitch — settled + glitch stop + cursor-near (never governor-cut).
    this._lastEdgeMs = 0;
    if (this.edgeGlitch) {
      const passU = this._edgeGlitchPass?.uniforms;
      if (glitchCost) {
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
        const edgeT0 = performance.now();
        this.edgeGlitch.update({
          activeIndex,
          activeRoot,
          bustReady: hasRoot,
          time: t
        });
        this._lastEdgeMs = performance.now() - edgeT0;
        this.frameBudget?.endSpan?.("edge-sdf");
      } else {
        if (passU) passU.uEnabled.value = 0;
        if (this.edgeGlitch._overlay) this.edgeGlitch._overlay.visible = false;
      }
    }
    preT = this._markPre("edge", preT);
    this._tickWaterCursorRim();
    preT = this._markPre("water-cursor-rim", preT);

    this._tickCursorDof(dt);
    if (this._descentPendingWarm && this.chunkedTextures?.pending) {
      // Black screen between the spiral ending and the drop arming: the
      // world is hidden (nothing presented), and the drop is waiting on
      // warmVignette0 alone. warmVignette0's own "live" step sequence sets
      // _frameCause = "compile" on every tick it runs — the same guard the
      // other branches use to avoid competing with a visible frame — which
      // starved this queue completely for the whole window (measured: rows
      // remaining did not move for 30+ s). Nothing is visible here, so that
      // guard buys nothing; drain both queues as fast as the time budget
      // allows instead.
      const budgetMs = this._chunkUploadBudgetMs();
      const uploadT0 = performance.now();
      let lastResult = null;
      while (performance.now() - uploadT0 < budgetMs && this.chunkedTextures.pending) {
        lastResult = this.chunkedTextures.step(this.renderer);
        if (!lastResult) break;
      }
      const uploadMs = performance.now() - uploadT0;
      if (uploadMs > (this._uploadPeakMs || 0)) this._uploadPeakMs = uploadMs;
      if (lastResult) this._frameCause = `texture-blackscreen-${lastResult}`;
      const mipT0 = performance.now();
      while (performance.now() - mipT0 < budgetMs && this.chunkedTextures.mipmapPending) {
        if (!this.chunkedTextures.stepMipmap(this.renderer)) break;
      }
    } else if (
      this._frameCause !== "compile" &&
      this._chunkUploadsAllowed() &&
      this.chunkedTextures?.pending
    ) {
      // Budgeted by time, not row count (CHUNK_TEXTURE_ROWS is a per-step
      // tile size, not a per-frame cap) — a frame that can afford it drains
      // more than one row-strip.
      const budgetMs = this._chunkUploadBudgetMs();
      const uploadT0 = performance.now();
      let lastResult = null;
      while (performance.now() - uploadT0 < budgetMs && this.chunkedTextures.pending) {
        lastResult = this.chunkedTextures.step(this.renderer);
        if (!lastResult) break;
        if (lastResult === "alloc") this._skipBeauty = true;
      }
      const uploadMs = performance.now() - uploadT0;
      if (uploadMs > (this._uploadPeakMs || 0)) this._uploadPeakMs = uploadMs;
      if (lastResult) this._frameCause = `texture-${lastResult}`;
    } else if (
      this._frameCause !== "compile" &&
      !this._chunkUploadsAllowed() &&
      this.chunkedTextures?.pending
    ) {
      // Safety net for a texture claimed after the intro's drain window
      // closed (warmMeshesChunked, run post-intro for PC/Sidekick/
      // Archaeology) — the primary fix now claims those during warm too, but
      // this catches whatever still arrives late. Only on an already-settled,
      // non-hop, non-reveal frame, with a small time budget — never steals
      // from a hop or reveal frame's budget, and does nothing on this frame
      // if the previous one was already over the recover floor.
      const prevFrameMs = this._lastFrameMs || 0;
      const isHop = this._programState().motion === "hop";
      const notRevealing = this._modelRevealOpacity == null || this._modelRevealOpacity >= 1;
      // Pass K item 4 — one strip per idle frame (settled, no input, no
      // fade); never mid-hop (the destination's jobs are still moved to the
      // front of the queue on advance, so they go first once it settles).
      if (prevFrameMs <= FLOOR_RECOVER_MS && !isHop && notRevealing && this._takeBgToken("chunk")) {
        // Pass G item B: this branch only ever runs on an already-settled,
        // non-hop, non-reveal frame (its own gating above) — i.e. always on
        // a presented frame, never a hidden one. Skipping beauty here was
        // the same confirmed-bad pattern as the bake flushes (Pass F): 17
        // skipBeauty frames measured here alone in one settled Bust session.
        // It stays within `lateBudgetMs` either way, so there's no budget
        // reason to skip; just let beauty render normally every time.
        const uploadT0 = performance.now();
        const lastResult = this.chunkedTextures.step(this.renderer);
        const uploadMs = performance.now() - uploadT0;
        if (uploadMs > (this._uploadPeakMs || 0)) this._uploadPeakMs = uploadMs;
        if (lastResult) this._frameCause = `texture-late-${lastResult}`;
      } else if (isHop && PASS_K_HOP_UPLOADS) {
        // A hop can land on a vignette whose own large textures were only
        // just claimed (post-intro PC/Sidekick/Archaeology integration) and
        // are still mid-drain — measured up to ~8s to finish unattended, long
        // enough that a user landing on that stop sees flat placeholder gray
        // the whole time. _prioritizeChunkQueueForVignette (called from
        // advance()) already moved the destination's own jobs to the front
        // of the queue; spend a small budget here, even mid-hop, so those
        // specific jobs actually progress instead of waiting for the hop to
        // finish and the frame to "settle" (which most of this queue is
        // gated on everywhere else).
        const hopBudgetMs = 1.5;
        const uploadT0 = performance.now();
        let lastResult = null;
        while (performance.now() - uploadT0 < hopBudgetMs && this.chunkedTextures.pending) {
          lastResult = this.chunkedTextures.step(this.renderer);
          if (!lastResult) break;
          if (lastResult === "alloc") this._skipBeauty = true;
        }
        const uploadMs = performance.now() - uploadT0;
        if (uploadMs > (this._uploadPeakMs || 0)) this._uploadPeakMs = uploadMs;
        if (lastResult) this._frameCause = `texture-hop-${lastResult}`;
      }
    }
    if (this._frameCause !== "compile" && this.chunkedTextures?.mipmapPending) {
      // Deferred mipmap generation (see chunkedTextureUpload.js's calibration
      // — only engaged once a generateMipmap call measured over budget).
      // Same settled/non-hop/non-reveal gating as the late-claim safety net.
      const prevFrameMs = this._lastFrameMs || 0;
      const notHop = this._programState().motion !== "hop";
      const notRevealing = this._modelRevealOpacity == null || this._modelRevealOpacity >= 1;
      if (prevFrameMs <= FLOOR_RECOVER_MS && notHop && notRevealing && this._takeBgToken("mipmap")) {
        this.chunkedTextures.stepMipmap(this.renderer);
      }
    }
    if (this._flushShadowBake) {
      this._flushShadowBake = false;
      this._frameCause = "shadow-bake";
      // Pass F: this was the other confirmed source of a real black flash
      // (flight recorder: BLACK trigger, luminance -> 0) on a frame that had
      // already landed and presented real content — same fix as the wet-bake
      // and warmVignette0.js sites.
      const skipThisBakeFrame = !this._hasPresentedFrame;
      noteFlight("bake", { kind: "shadow-flush", skipsBeauty: skipThisBakeFrame });
      const prevTarget = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(this._bakeScratch);
      this._withoutGrassShadows(() => this.renderer.render(this.scene, this.camera));
      this.renderer.setRenderTarget(prevTarget);
      this._skipBeauty = skipThisBakeFrame;
    }
    this._markPre("tail", preT);
    this._lastPreMs = performance.now() - workT0;
    this._holdStableLightVariant();
    this._noteLightCensus();
    this.frameBudget?.start?.("beauty");
    this._snapshotGl();
    const beautyT0 = performance.now();
    const revealNow = Boolean(this._revealPending);
    // Pass J: once the fader is down every frame is on screen. Warm compile
    // steps, chunk allocs and shadow bakes all do their work offscreen and
    // restore state before this point, so skipping the beauty pass only ever
    // presented a stale (or, per Pass F, black) frame — 11 hold BLINKs per
    // run. Behind the fader the skip is still free and still allowed.
    if (this._skipBeauty && this._faderDismissed && this._hasPresentedFrame) {
      this._skipBeauty = false;
    }
    const skippedBeautyThisFrame = this._skipBeauty;
    if (!this._skipBeauty) {
      // Pass J item 5 — the composer renders at its own internal size
      // (rest-resolution ramp / governor) and upscales to the canvas; the
      // renderer pixel ratio does not move when that internal size steps.
      // Star sprites must be sized in the pixels they are actually drawn
      // into, or every step shrinks the whole sky at once (measured 7–16%
      // single-frame jumps). Set here, after every resize this tick.
      const starU = this.starField?.material?.uniforms?.uPixelRatio;
      if (starU) {
        const cssW = this.renderer.getSize(_STAR_CSS).x;
        const drawW = this.post?.drawWidth ?? 0;
        if (cssW > 0 && drawW > 0) starU.value = drawW / cssW;
      }
      this._flight?.beginGpuTimer();
      this.post.render(this.scene, this.camera, t, {
        grainStrength: this._postGrainStrength
      });
      this._flight?.endGpuTimer();
      // Pass F — latches once, on the first real beauty frame this session
      // ever presents (effectively frame 1), and never goes false again. See
      // warmVignette0.js's "live" phase for why this replaced `world.visible`
      // as the "is it safe to skip" check.
      this._hasPresentedFrame = true;
    }
    // Pass G — sampled right here, not at the end of the tick: catches
    // anything hidden during the render that only gets restored afterward.
    this._flight?.sampleVisibilityAtPresent(skippedBeautyThisFrame);
    if (this._flight && !skippedBeautyThisFrame) this._noteTriangleSwing();
    if (this._renderStamps) this._renderStamps.push(performance.now());
    if (!skippedBeautyThisFrame) this._tickFramePacing(frameMs, performance.now());
    if (!this._faderDismissed) {
      const progs = this.renderer.info.programs?.length ?? 0;
      const clean =
        !skippedBeautyThisFrame &&
        progs === this._preDismissProgs &&
        performance.now() - beautyT0 < 40;
      this._preDismissProgs = progs;
      this._preDismissClean = clean ? (this._preDismissClean ?? 0) + 1 : 0;
    }
    if (this._starTrackHook && !this._skipBeauty) this._starTrackHook();
    if (this._pendingFrameReadback && !this._skipBeauty) {
      const { x, y, w, h, resolve } = this._pendingFrameReadback;
      this._pendingFrameReadback = null;
      try {
        resolve(this._readFrameLuminance(x, y, w, h));
      } catch (error) {
        resolve(null);
      }
    }
    this._lastBeautyMs = performance.now() - beautyT0;
    if (revealNow) {
      this._revealPending = false;
      this._stallLabel = `reveal-render:${Math.round(this._lastBeautyMs)}`;
      this._frameCause = this._stallLabel;
    } else if ((this.edgeGlitch?.sdf?.lastMaskMs || 0) >= 20 || (this.edgeGlitch?.sdf?.lastDepthMs || 0) >= 20) {
      const maskMs = Math.round(this.edgeGlitch.sdf.lastMaskMs || 0);
      const depthMs = Math.round(this.edgeGlitch.sdf.lastDepthMs || 0);
      this._stallLabel = `pick-render:mask${maskMs}:depth${depthMs}`;
      this._frameCause = this._stallLabel;
    } else if (this._lastBeautyMs >= 50) {
      this._stallLabel = `beauty-render:${Math.round(this._lastBeautyMs)}`;
      this._frameCause = this._stallLabel;
    }
    this._lastGl = this._snapshotGl();
    this._skipBeauty = false;
    this.frameBudget?.endSpan?.("beauty");
    // Duo HUD sits above the stage (own lights / camera); cursor stays on top.
    const duoT0 = performance.now();
    this.duoFab?.render?.(this.renderer);
    this._lastDuoMs = performance.now() - duoT0;
    const waterT0 = performance.now();
    if (!this._abWaterCursorOff) this.waterCursor?.render();
    this._lastWaterMs = performance.now() - waterT0;
    this._lastWorkMs = performance.now() - workT0;
    this._lastCause = this._frameCause;
    // Pass I item 3 — these three were already measured (just never
    // reported per-frame): fold them into the same per-section list as
    // _markPre's named spans, so one table covers the whole tick.
    this._preSections.push(
      ["beauty-render", Math.round(this._lastBeautyMs * 10) / 10],
      ["duo-render", Math.round(this._lastDuoMs * 10) / 10],
      ["water-cursor-render", Math.round(this._lastWaterMs * 10) / 10]
    );
    if (this._flight) {
      const draw = new THREE.Vector2();
      this.renderer.getDrawingBufferSize(draw);
      this._flight.endFrame({
        frameMs,
        governorLevel: this.perfGovernor?.level ?? null,
        pixelRatio: this.pixelRatio,
        drawingBuffer: { w: draw.x, h: draw.y },
        frameCause: this._lastCause,
        skipBeauty: skippedBeautyThisFrame,
        chunkPending: this.chunkedTextures?.pending ?? null,
        chunkMipmapPending: this.chunkedTextures?.mipmapPending ?? null,
        worldVisible: Boolean(this.world?.visible),
        warmPhase: this._vignette0Warm?.phase ?? null,
        warmLiveAt: this._vignette0Warm?._liveAt ?? null,
        warmLiveKind: this._vignette0Warm?._liveSteps?.[this._vignette0Warm?._liveAt]?.kind ?? null,
        phase: this._flightPhase(),
        sceneTriangles: this.post?.renderPass?.lastSceneTriangles ?? null,
        // Pass I correction: `frameMs` is the inter-frame interval
        // (dt * 1000 — sums to 1.0s/s by construction), not work time; a
        // frame can read a tiny frameMs while cpuWorkMs is huge if the
        // previous frame's queued GPU work was still draining. cpuWorkMs is
        // the real wall-clock spent inside this tick, workT0 to here.
        cpuWorkMs: this._lastWorkMs,
        cpuSections: this._preSections.slice(),
        rigSections: (this._lastRigSteps || []).slice(),
        stopFade: this.neon?._stopFade ? this.neon._stopFade.map((f) => +f.toFixed(3)) : null,
        composerW: this.post?.drawWidth ?? null,
        explained: this._lastFrameExplained === true,
        theta: +(this.cameraRig?.state?.theta ?? 0).toFixed(4),
        stopInView: this._stopsInView(),
        // Pass I item 3/4 — whatever _noteGap captured since the last frame
        // (message handlers ≥20ms, setTimeout callbacks ≥20ms), regardless
        // of whether it won the `_lastCause` "gap:unaccounted" label race.
        gapTasks: tasks && tasks.length ? tasks.slice() : null,
        gapSinceMs: since != null ? Math.round(since) : null
      });
    }
    this._frameCause = "render";
    this._publishFloor(dt);
    this.frameBudget?.end(dt);
    this._rafEnd = performance.now();
    requestAnimationFrame(this._animate);
  }
}
