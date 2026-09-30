import * as THREE from "three";
import { createGltfLoader } from "../loaders/createGltfLoader.js";
import { DuoIdleMotion } from "./duoIdleMotion.js";
import { DuoProjectsScreen } from "./duoProjectsScreen.js";
import { DuoExteriorScreen } from "./duoExteriorScreen.js";
import { DuoMailScreen } from "./duoMailScreen.js";
import { DuoHudBloom } from "./duoHudBloom.js";
import {
  DUO_GLB_URL,
  DUO_ARMATURE_NAME,
  DUO_FOLD_CLIP,
  DUO_FOLD_TIME_OPEN,
  DUO_FOLD_TIME_CLOSED,
  DUO_SCREEN_MATERIALS,
  DUO_SCREEN_EXTERIOR,
  DUO_SCREEN_INSIGHT,
  DUO_ORTHO_NEAR,
  DUO_ORTHO_FAR,
  DUO_ISO_CLOSED,
  DUO_ISO_OPEN_TIP,
  DUO_ISO_MAIL_FACE,
  DUO_SCREEN_MARGIN_PX,
  DUO_IDLE_SCALE,
  DUO_SEAT_Z,
  DUO_FIT_HEIGHT_M,
  DUO_ENTRANCE_SEC,
  DUO_ENTRANCE_FROM,
  DUO_ENTRANCE_FROM_Y,
  DUO_ENTRANCE_OVERSHOOT,
  DUO_ENTRANCE_SETTLE_FRAC,
  DUO_HOVER_SPIN_SEC,
  DUO_HOVER_OPEN_AT,
  DUO_HOLO_OPEN_AT,
  DUO_HOLO_DELAY_SEC,
  DUO_HOVER_FACE_YAW,
  DUO_HOVER_ENTER_SEC,
  DUO_HOVER_LEAVE_SEC,
  DUO_UNHOVER_STAGGER_SEC,
  DUO_IDLE_HOLD_SEC,
  DUO_IDLE_BOB_IN_SEC,
  DUO_IDLE_SPIN_DELAY_SEC,
  DUO_IDLE_SPIN_IN_SEC,
  DUO_TICK_DT_MAX,
  DUO_HIT_PAD_ENTER_PX,
  DUO_HIT_PAD_LEAVE_PX,
  DUO_OPEN_STIFFNESS,
  DUO_OPEN_DAMPING,
  DUO_FOLD_STIFFNESS,
  DUO_FOLD_DAMPING,
  DUO_HIT_PAD,
  DUO_SCREEN_EMISSIVE_CLOSED,
  DUO_SCREEN_EMISSIVE_EXTERIOR,
  DUO_SCREEN_EMISSIVE_OPEN,
  DUO_SCREEN_EMISSIVE_MAIL,
  DUO_SCREEN_INSIGHT_COLOR,
  DUO_HUD_BLOOM_STRENGTH,
  DUO_HUD_BLOOM_RADIUS,
  DUO_HUD_BLOOM_THRESHOLD,
  DUO_HUD_BLOOM_RES_SCALE,
  DUO_HUD_BLOOM_MAIL_SCALE,
  DUO_HOLO_SHEET_OFFSET,
  DUO_HOLO_SHEET_OPACITY,
  DUO_HOLO_SHEET_COLOR,
  DUO_HOLO_SHEET_WIDTH,
  DUO_HOLO_WASH_OPACITY,
  DUO_HOLO_STACK,
  DUO_HOLO_LABEL_T,
  DUO_HOLO_LABEL_OPACITY,
  DUO_HOLO_LABEL_SCALE,
  DUO_HOLO_PULSE_MAX_T,
  DUO_HOLO_PULSE_OPACITY,
  DUO_HOLO_PULSE_SCALE,
  DUO_HOLO_PULSE_SCALE_END,
  DUO_HOLO_PULSE_SLAB_BOOST,
  DUO_HOLO_MAIL_WASH_SCALE,
  DUO_KEY_COLOR,
  DUO_KEY_INTENSITY,
  DUO_FILL_COLOR,
  DUO_FILL_INTENSITY,
  DUO_AMB_INTENSITY,
  DUO_RIM_COLOR,
  DUO_RIM_INTENSITY
} from "./duoConstants.js";

/**
 * @param {number} pos
 * @param {number} vel
 * @param {number} target
 * @param {number} stiffness
 * @param {number} damping
 * @param {number} dt
 */
const _springOut = [0, 0];

function springStep(pos, vel, target, stiffness, damping, dt) {
  const accel = stiffness * (target - pos) - damping * vel;
  const nextVel = vel + accel * dt;
  _springOut[0] = pos + nextVel * dt;
  _springOut[1] = nextVel;
  return _springOut;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Opacity ease (GSAP power2.out). */
function easePower2Out(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 2;
}

/**
 * Heavy rise — power4 brake into a small momentum peak, then hard plant to rest.
 * At t=1 result is exactly 1. Prefer this over floaty back.out for mass.
 * @param {number} t 0–1
 * @param {number} overshootAmp peak excess above 1 (e.g. 0.04 = 4%)
 * @param {number} settleFrac wall-time fraction for peak→rest
 */
function easeHeavyRise(t, overshootAmp = 0.04, settleFrac = 0.14) {
  const x = Math.min(1, Math.max(0, t));
  const amp = Math.max(0, overshootAmp);
  const frac = Math.min(0.4, Math.max(0.08, settleFrac));
  const tPeak = 1 - frac;
  const peak = 1 + amp;
  if (x <= tPeak) {
    const u = x / tPeak;
    // power4.out — commits early, brakes hard (heavy)
    return peak * (1 - (1 - u) ** 4);
  }
  const u = (x - tPeak) / frac;
  // power3.out settle — leaves apex immediately, plants
  return peak + (1 - peak) * (1 - (1 - u) ** 3);
}

const SCREEN_MAT_SET = new Set(
  DUO_SCREEN_MATERIALS.map((n) => String(n).toLowerCase().trim())
);

const _AXIS_X = new THREE.Vector3(1, 0, 0);
const _AXIS_Y = new THREE.Vector3(0, 1, 0);
const _AXIS_Z = new THREE.Vector3(0, 0, 1);
const _Q = new THREE.Quaternion();
const _V = new THREE.Vector3();
const _V2 = new THREE.Vector3();
const _V3 = new THREE.Vector3();
const _M = new THREE.Matrix4();
const _CENTER = new THREE.Vector3();
const _FACE = new THREE.Vector3();
const _FACE_Q = new THREE.Quaternion();
const _NORMAL = new THREE.Vector3();
const _quadOrder = [0, 1, 2, 3];

/**
 * Label 4 projected points as TL, TR, BR, BL in client space.
 * @param {[number, number][]} pts
 * @returns {[number, number][]}
 */
/** All 4 points within `eps` px on both axes — a perspective quad is not a rect. */
function cornersWithin(a, b, eps) {
  for (let i = 0; i < 4; i += 1) {
    if (Math.abs(a[i][0] - b[i][0]) >= eps || Math.abs(a[i][1] - b[i][1]) >= eps) return false;
  }
  return true;
}

function orderClientQuadInto(pts, out) {
  _quadOrder[0] = 0;
  _quadOrder[1] = 1;
  _quadOrder[2] = 2;
  _quadOrder[3] = 3;
  for (let i = 1; i < 4; i += 1) {
    const key = _quadOrder[i];
    let j = i - 1;
    while (j >= 0) {
      const other = _quadOrder[j];
      const dy = pts[other][1] - pts[key][1];
      const greater = dy > 0 || (dy === 0 && pts[other][0] > pts[key][0]);
      if (!greater) break;
      _quadOrder[j + 1] = other;
      j -= 1;
    }
    _quadOrder[j + 1] = key;
  }
  const topA = _quadOrder[0];
  const topB = _quadOrder[1];
  const botA = _quadOrder[2];
  const botB = _quadOrder[3];
  const tl = pts[topA][0] <= pts[topB][0] ? topA : topB;
  const tr = tl === topA ? topB : topA;
  const bl = pts[botA][0] <= pts[botB][0] ? botA : botB;
  const br = bl === botA ? botB : botA;
  out[0][0] = pts[tl][0];
  out[0][1] = pts[tl][1];
  out[1][0] = pts[tr][0];
  out[1][1] = pts[tr][1];
  out[2][0] = pts[br][0];
  out[2][1] = pts[br][1];
  out[3][0] = pts[bl][0];
  out[3][1] = pts[bl][1];
  return out;
}

/**
 * Screen-space Duo FAB on a dedicated HUD scene.
 *
 * Transform layers (spin must be UNDER iso so yaw is phone-local up):
 *   root   — fixed container seat (bottom-right margin; scale always 1)
 *   pop    — visual-center correction so open/closed stay container-centered
 *   pivot  — bob translation ONLY (never rotates — that orbited the phone)
 *   iso    — small product tilt (presentation)
 *   spin   — axial yaw + tiny nutation about phone COM (Earth rotation)
 *   basis  — FIXED once: locks model up / right / front to HUD axes
 *   model  — GLB; scale = fit × seat × entrance; position keeps COM on spin origin
 */
export class DuoFabSystem {
  /**
   * @param {{
   *   canvas: HTMLCanvasElement,
   *   loadingManager?: THREE.LoadingManager,
   *   onStateChange?: (state: 'idle' | 'mail' | 'caseStudy') => void,
   *   onHoverChange?: (hovered: boolean) => void,
   *   getScreenRect?: (rect: { left: number, top: number, width: number, height: number } | null) => void,
   *   getMailShell?: () => HTMLElement | null
   * }} deps
   */
  constructor(deps) {
    this.canvas = deps.canvas;
    this.loadingManager = deps.loadingManager ?? null;
    this.onStateChange = deps.onStateChange ?? null;
    this.onHoverChange = deps.onHoverChange ?? null;
    this.getScreenRect = deps.getScreenRect ?? null;
    this.getMailShell = deps.getMailShell ?? null;
    this.onCaptureRequest = deps.onCaptureRequest ?? null;
    this._reducedMotionOverride = deps.reducedMotion;

    this.hudScene = new THREE.Scene();
    this.hudScene.name = "duo-hud-scene";

    this.hudCamera = new THREE.OrthographicCamera(
      -1,
      1,
      1,
      -1,
      DUO_ORTHO_NEAR,
      DUO_ORTHO_FAR
    );
    this.hudCamera.position.set(0, 0, 0);
    this.hudCamera.lookAt(0, 0, -1);
    this.hudScene.add(this.hudCamera);
    this._aspect = 1;
    this._viewW = 1;
    this._viewH = 1;

    this.root = new THREE.Group();
    this.root.name = "duo-fab-root";
    // Hidden until reveal() — load-time basis/fit must never flash on screen.
    this.root.visible = false;
    this.pop = new THREE.Group();
    this.pop.name = "duo-fab-pop";
    this.pivot = new THREE.Group();
    this.pivot.name = "duo-fab-pivot";
    this.iso = new THREE.Group();
    this.iso.name = "duo-fab-iso";
    this.iso.quaternion.copy(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(DUO_ISO_CLOSED.x, DUO_ISO_CLOSED.y, DUO_ISO_CLOSED.z, "XYZ")
      )
    );
    this.spin = new THREE.Group();
    this.spin.name = "duo-fab-spin";
    this.basis = new THREE.Group();
    this.basis.name = "duo-fab-basis";

    // pivot (bob) → iso (tilt) → spin (axial yaw) → basis → model
    // Spin UNDER iso so Y is the phone’s own up, not world-Y through a tilt.
    this.spin.add(this.basis);
    this.iso.add(this.spin);
    this.pivot.add(this.iso);
    this.pop.add(this.pivot);
    this.root.add(this.pop);
    this.hudScene.add(this.root);

    this._mountLights();

    this.model = null;
    /** @type {THREE.Object3D | null} */
    this.armature = null;
    /** @type {THREE.AnimationMixer | null} */
    this._mixer = null;
    /** @type {THREE.AnimationAction | null} */
    this._foldAction = null;
    /** Scrub 0 = closed (`_folded`), 1 = open (`_opened`). */
    this._foldBlend = 0;
    this._foldVel = 0;
    /** @type {'closed' | 'open'} */
    this._foldPose = "closed";

    this.screenMeshes = [];
    /** @type {THREE.Mesh[]} */
    this.exteriorScreens = [];
    /** @type {THREE.Mesh[]} */
    this.insightScreens = [];
    this.primaryScreen = null;
    this.hitProxy = null;
    this.ready = false;
    /** Base model.scale from `_fitClosedPose` (height normalize at seat=1). */
    this._fitScale = 1;
    /**
     * Phone COM in model-local units (scale=1). Position = −com × currentScale
     * so the geometric center stays on the spin origin at every seat scale.
     */
    this._comLocal = new THREE.Vector3();
    /** Load-time baked closed pose — reveal must never re-solve orientation. */
    this._bakedBasisQuat = new THREE.Quaternion();
    this._bakedComLocal = new THREE.Vector3();
    this._bakedFitScale = 1;
    this._closedPoseBaked = false;
    /** Closed iso (Euler → quat). */
    this._isoClosedQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(DUO_ISO_CLOSED.x, DUO_ISO_CLOSED.y, DUO_ISO_CLOSED.z, "XYZ")
    );
    /**
     * Open iso — measured from insight `screen_lg` after fold (not hand Euler).
     * Maps screen normal→+Y, bottom edge→+Z, then applies `DUO_ISO_OPEN_TIP`.
     */
    this._isoOpenQuat = this._isoClosedQuat.clone();
    this._isoSlerp = new THREE.Quaternion();
    /** Extra tip toward POV while Mail is open. */
    this._isoMailFaceQ = new THREE.Quaternion();
    this._mailFaceT = 0;
    this._mailFaceVel = 0;
    this._openIsoBaked = false;
    /** Last open-bake diagnostics for `debugDuo()`. */
    this._openIsoDebug = null;
    /**
     * Fixed container half-extents in HUD meters (max of closed/open AABB).
     * Seat anchors the container’s bottom-right at `DUO_SCREEN_MARGIN_PX`.
     */
    this._containerHalfW = DUO_FIT_HEIGHT_M * DUO_IDLE_SCALE * 0.35;
    this._containerHalfH = DUO_FIT_HEIGHT_M * DUO_IDLE_SCALE * 0.5;
    /** Visual AABB centers in pivot-local (closed / open) for pop centering. */
    this._closedCenterPivot = new THREE.Vector3();
    this._openCenterPivot = new THREE.Vector3();
    this._centerLerp = new THREE.Vector3();
    this._containerBaked = false;
    /** Per-frame entrance diagnostic (first ~20 entering frames). */
    this._entranceLog = [];
    this._entranceLogArmed = false;

    /** @type {'idle' | 'mail' | 'caseStudy'} */
    this.state = "idle";
    this.hovered = false;
    /** Hit-test / hover allowed after entrance finishes. */
    this.enabled = false;

    /**
     * `hidden` until reveal; then `entering` → `holding` → `live`.
     * @type {'hidden' | 'entering' | 'holding' | 'live'}
     */
    this._entrance = "hidden";
    /** Seat scale multiplier — stay at 1. */
    this._entranceScale = 1;
    /** Pivot Y offset during rise (HUD meters, +Y up). */
    this._entranceY = 0;
    /** 0–1 bob fade (after hold). */
    this._bobIn = 0;
    /** 0–1 spin fade (after hold + spin delay). */
    this._spinIn = 0;
    /** @deprecated alias — prefer _bobIn */
    this._idleIn = 0;
    /** Seconds since reveal / phase start. */
    this._entranceElapsed = 0;
    /** Rest hold remaining (holding phase). */
    this._idleHoldT = 0;
    /** Elapsed while live for spin delay. */
    this._liveElapsed = 0;
    /**
     * Handoff continuity samples (last entering → complete → first live).
     * Probe: `__stage.debugDuo().handoffLog`.
     * @type {Array<Record<string, unknown>>}
     */
    this._handoffLog = [];
    /** Hold-phase continuity samples remaining. */
    this._handoffHoldLeft = 0;
    /** Live-phase continuity samples remaining (first ~12 live frames). */
    this._handoffLiveLeft = 0;
    /** Last centerT passed to `_applyContainerCenter` (for handoff log). */
    this._lastCenterT = 0;
    /** Last capped tick dt (handoff diagnose). */
    this._lastTickDt = 0;
    /** Material opacity multiplier during fade-in (0–1). */
    this._entranceOpacity = 1;
    /** @deprecated GSAP entrance removed — tick owns the rise. */
    this._entranceTween = null;

    this._idle = new DuoIdleMotion();
    this._openBlend = 0;
    this._openVel = 0;
    this._hoverT = 0;
    this._hoverTarget = 0;
    /** Raw pointer-over from Stage (pre-hysteresis). */
    this._wantHover = false;
    this._hoverEnterT = 0;
    this._hoverLeaveT = 0;
    this._reducedMotion = false;
    this._projects = new DuoProjectsScreen({ reducedMotion: false });
    this._exterior = new DuoExteriorScreen();
    this._mailScreen = new DuoMailScreen();
    this._mailScreen.setSourceGetter(() => this.getMailShell?.() ?? null);
    /** @type {DuoHudBloom | null} */
    this._hudBloom = null;
    /** @type {THREE.Group | null} holo root (wash + stack + plume) */
    this._holoSheet = null;
    /** @type {THREE.Mesh | null} */
    this._holoWash = null;
    /** @type {THREE.Mesh[]} */
    this._holoSlabs = [];
    /** @type {THREE.Mesh | null} */
    this._holoPlume = null;
    /** @type {THREE.Mesh | null} traveling energy disc */
    this._holoPulse = null;
    this._holoOpen = false;
    /** Seconds fold has been past `DUO_HOLO_OPEN_AT` (holo gate). */
    this._holoDelayT = 0;
    /**
     * Unhover exit: glitch → clear pulse → fold close (100 ms stagger).
     * While true, fold stays open until the close step.
     */
    this._unhoverExit = false;
    this._unhoverT = 0;
    this._unhoverPulseArmed = false;
    this._unhoverCloseArmed = false;
    /** @type {THREE.Material[]} */
    this._screenMats = [];
    this._tmpBox = new THREE.Box3();
    this._tmpVec = new THREE.Vector3();
    this._ndc = new THREE.Vector3();
    this._screenCorners = [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3()
    ];

    this._syncReducedMotion();
    if (typeof window !== "undefined" && window.matchMedia && this._reducedMotionOverride == null) {
      this._mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      this._onMq = () => this._syncReducedMotion();
      this._mq.addEventListener?.("change", this._onMq);
    }

    this.setSize(deps.width || window.innerWidth || 1, deps.height || window.innerHeight || 1);
    this._applySeat(0);
  }

  _mountLights() {
    const amb = new THREE.AmbientLight(0xffffff, DUO_AMB_INTENSITY);
    amb.name = "duo-amb";
    this.hudScene.add(amb);

    const hemi = new THREE.HemisphereLight(0xe8f0ff, 0x1a1210, 0.45);
    hemi.name = "duo-hemi";
    this.hudScene.add(hemi);

    const key = new THREE.DirectionalLight(DUO_KEY_COLOR, DUO_KEY_INTENSITY);
    key.name = "duo-key";
    key.position.set(-1.2, 1.6, 0.8);
    this.hudScene.add(key);

    const fill = new THREE.DirectionalLight(DUO_FILL_COLOR, DUO_FILL_INTENSITY);
    fill.name = "duo-fill";
    fill.position.set(1.4, 0.4, 1.0);
    this.hudScene.add(fill);

    const rim = new THREE.DirectionalLight(DUO_RIM_COLOR, DUO_RIM_INTENSITY);
    rim.name = "duo-rim";
    rim.position.set(0.2, 0.6, -1.5);
    this.hudScene.add(rim);
  }

  _syncReducedMotion() {
    this._reducedMotion =
      typeof this._reducedMotionOverride === "boolean"
        ? this._reducedMotionOverride
        : Boolean(
            typeof window !== "undefined" &&
              window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
          );
    this._projects?.setReducedMotion?.(this._reducedMotion);
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  setSize(width, height) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const aspect = w / h;
    this._viewW = w;
    this._viewH = h;
    this._aspect = aspect;
    this.hudCamera.left = -aspect;
    this.hudCamera.right = aspect;
    this.hudCamera.top = 1;
    this.hudCamera.bottom = -1;
    this.hudCamera.updateProjectionMatrix();
    this._hudBloom?.setSize?.(w, h);
    if (this.ready) this._applySeat(this._openBlend);
  }

  async load() {
    const loader = createGltfLoader(this.loadingManager ?? undefined);
    const gltf = await loader.loadAsync(DUO_GLB_URL);
    this.model = gltf.scene;
    this.model.name = "iphone-duo";
    this.model.rotation.set(0, 0, 0);
    this.model.quaternion.identity();

    this._selectArmature(this.model);
    this._setupFoldMixer(gltf.animations || []);
    this._scrubFold(0);
    this._prepareMaterials(this.armature ?? this.model);

    this.basis.add(this.model);
    this.model.traverse((obj) => {
      if (obj.isMesh) obj.frustumCulled = false;
    });
    // Fit at identity seat — scale lives on `model` (with bones), never on an
    // ancestor outside the skeleton (that collapses SkinnedMesh draws).
    this.pop.scale.setScalar(1);
    this._lockModelBasis();
    this._fitClosedPose();
    this._buildHitProxy();

    // Bake closed pose ONCE — reveal scales this; never re-solves basis/fit.
    this._scrubFold(0);
    this._refreshSkin();
    this._bakeClosedPose();
    // Measure open insight axes → bake iso quat (replaces hand-tuned Euler).
    this._bakeOpenIsoQuat();
    // Container half-extents + closed/open visual centers (shared seat).
    this._bakeContainerBounds();

    this.ready = true;
    // Full seated scale while hidden — drop/fade entrance does not shrink skins.
    this._entranceScale = 1;
    this._entranceY = 0;
    this._entranceOpacity = 1;
    this._applySeat(0, { refreshSkin: true });
    this._applyFoldVisibility(0);
    this.root.visible = false;
    return this;
  }

  /**
   * Snapshot load-time orientation + COM. Reveal restores these; never re-derives.
   */
  _bakeClosedPose() {
    this._bakedBasisQuat.copy(this.basis.quaternion);
    this._bakedComLocal.copy(this._comLocal);
    this._bakedFitScale = this._fitScale;
    this._closedPoseBaked = true;
  }

  /**
   * Why Euler guessing failed: basis is locked for the *closed* exterior (+Z),
   * but fold flips insight `screen_lg` to a different world axis. Hand Rx/Ry/Rz
   * on `iso` cannot stably map that moving frame.
   *
   * Fix: with iso/spin identity and fold open, measure insight plane axes in
   * pivot space, then bake the quaternion that maps
   *   normal → HUD +Y (project UP),
   *   short edge → HUD +Z, then Ry(π) so the hardware bottom is the near edge,
   *   right  → HUD +X,
   * plus a small tip (`DUO_ISO_OPEN_TIP`) so the top edge recedes.
   * No GLB re-export needed — directionality is solved at load from the mesh.
   */
  _bakeOpenIsoQuat() {
    this._isoClosedQuat.setFromEuler(
      new THREE.Euler(DUO_ISO_CLOSED.x, DUO_ISO_CLOSED.y, DUO_ISO_CLOSED.z, "XYZ")
    );
    this._isoOpenQuat.copy(this._isoClosedQuat);
    this._openIsoBaked = false;
    this._openIsoDebug = null;

    const insight = this.insightScreens[0];
    if (!insight) {
      console.warn("[DuoFab] open iso bake skipped — no insight screen");
      return;
    }

    const savedFold = this._foldBlend;
    const savedIso = this.iso.quaternion.clone();
    const savedSpin = this.spin.quaternion.clone();
    const savedPivotQ = this.pivot.quaternion.clone();
    const savedPivotP = this.pivot.position.clone();

    this.iso.quaternion.identity();
    this.spin.quaternion.identity();
    this.pivot.quaternion.identity();
    this.pivot.position.set(0, 0, 0);
    this._scrubFold(1);
    this.root.updateMatrixWorld(true);
    this._refreshSkin();

    const axes = this._sampleScreenAxesInPivot(insight);
    if (!axes) {
      console.warn("[DuoFab] open iso bake skipped — screen PCA failed");
      this._restoreOpenIsoBakeState(
        savedFold,
        savedIso,
        savedSpin,
        savedPivotQ,
        savedPivotP
      );
      return;
    }

    const tipQ = new THREE.Quaternion().setFromAxisAngle(
      _AXIS_X,
      DUO_ISO_OPEN_TIP
    );
    const desired = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1)
    );

    let bestFlat = null;
    let bestScore = -Infinity;
    let bestSigns = null;

    for (const flipN of [1, -1]) {
      for (const flipB of [1, -1]) {
        const normal = axes.normal.clone().multiplyScalar(flipN);
        const bottom = axes.bottom.clone().multiplyScalar(flipB);
        const right = new THREE.Vector3().crossVectors(normal, bottom);
        if (right.lengthSq() < 1e-8) continue;
        right.normalize();
        // Re-orthonormalize bottom for a clean RH basis.
        bottom.crossVectors(right, normal).normalize();

        _M.makeBasis(right, normal, bottom);
        const currentInv = _M.clone().invert();
        const isoMat = desired.clone().multiply(currentInv);
        const flat = new THREE.Quaternion().setFromRotationMatrix(isoMat);
        const q = flat.clone();
        // Score includes the tip so the same candidate still wins.
        q.premultiply(tipQ);

        const n2 = normal.clone().applyQuaternion(q);
        const b2 = bottom.clone().applyQuaternion(q);
        const r2 = right.clone().applyQuaternion(q);
        const score = n2.y * 3 + b2.z * 2 + r2.x;
        if (score > bestScore) {
          bestScore = score;
          bestFlat = flat;
          bestSigns = { flipN, flipB, n2: n2.toArray(), b2: b2.toArray(), r2: r2.toArray() };
        }
      }
    }

    if (bestFlat) {
      // PCA "bottom" is an unsigned short axis. The winning sign parks the
      // hardware top on +Z (near). Ry(π) around the flattened normal swaps
      // that for the hardware bottom before the tip, so the tilt stays.
      const halfTurn = new THREE.Quaternion().setFromAxisAngle(_AXIS_Y, Math.PI);
      const baked = bestFlat.clone();
      baked.premultiply(halfTurn);
      baked.premultiply(tipQ);
      this._isoOpenQuat.copy(baked);
      this._openIsoBaked = true;
      this._openIsoDebug = {
        score: +bestScore.toFixed(3),
        tip: DUO_ISO_OPEN_TIP,
        halfTurn: Math.PI,
        signs: bestSigns,
        restNormal: axes.normal.toArray(),
        restBottom: axes.bottom.toArray()
      };
      console.info("[DuoFab] open iso baked from insight", this._openIsoDebug);
    } else {
      console.warn("[DuoFab] open iso bake produced no candidate");
    }

    this._restoreOpenIsoBakeState(
      savedFold,
      savedIso,
      savedSpin,
      savedPivotQ,
      savedPivotP
    );
  }

  /**
   * @param {number} fold
   * @param {THREE.Quaternion} iso
   * @param {THREE.Quaternion} spin
   * @param {THREE.Quaternion} pivotQ
   * @param {THREE.Vector3} pivotP
   */
  _restoreOpenIsoBakeState(fold, iso, spin, pivotQ, pivotP) {
    this.iso.quaternion.copy(iso);
    this.spin.quaternion.copy(spin);
    this.pivot.quaternion.copy(pivotQ);
    this.pivot.position.copy(pivotP);
    this._scrubFold(fold);
    this.root.updateMatrixWorld(true);
    this._refreshSkin();
  }

  /**
   * Measure closed + open AABBs in pivot space at the shared seat scale.
   * Container half-extents = max of both; visual centers drive `pop` so the
   * phone stays container-centered when it unfolds.
   */
  _bakeContainerBounds() {
    this._containerBaked = false;
    if (!this.model) return;

    const savedFold = this._foldBlend;
    const savedIso = this.iso.quaternion.clone();
    const savedSpin = this.spin.quaternion.clone();
    const savedPivotQ = this.pivot.quaternion.clone();
    const savedPivotP = this.pivot.position.clone();
    const savedPop = this.pop.position.clone();

    this.pop.position.set(0, 0, 0);
    this.pivot.position.set(0, 0, 0);
    this.pivot.quaternion.identity();
    this.spin.quaternion.identity();

    // Seat scale must match runtime (fit × idle) so extents are in HUD meters.
    const seat = DUO_IDLE_SCALE;
    if (this.model) {
      const s = this._fitScale * seat;
      this.model.scale.setScalar(s);
      this.model.position.set(
        -this._comLocal.x * s,
        -this._comLocal.y * s,
        -this._comLocal.z * s
      );
    }

    const closedSize = new THREE.Vector3();
    const openSize = new THREE.Vector3();

    this.iso.quaternion.copy(this._isoClosedQuat);
    this._scrubFold(0);
    this.root.updateMatrixWorld(true);
    this._refreshSkin();
    const closedOk = this._samplePivotAabb(
      this._closedCenterPivot,
      closedSize
    );

    this.iso.quaternion.copy(this._isoOpenQuat);
    this._scrubFold(1);
    this.root.updateMatrixWorld(true);
    this._refreshSkin();
    const openOk = this._samplePivotAabb(this._openCenterPivot, openSize);

    this._restoreOpenIsoBakeState(
      savedFold,
      savedIso,
      savedSpin,
      savedPivotQ,
      savedPivotP
    );
    this.pop.position.copy(savedPop);

    if (!closedOk && !openOk) {
      // Fallback from fit knobs (closed phone silhouette).
      const h = DUO_FIT_HEIGHT_M * DUO_IDLE_SCALE;
      this._containerHalfW = h * 0.35;
      this._containerHalfH = h * 0.5;
      this._closedCenterPivot.set(0, 0, 0);
      this._openCenterPivot.set(0, 0, 0);
      this._containerBaked = true;
      this._buildHitProxy();
      return;
    }

    const hw = Math.max(
      closedOk ? closedSize.x * 0.5 : 0,
      openOk ? openSize.x * 0.5 : 0
    );
    const hh = Math.max(
      closedOk ? closedSize.y * 0.5 : 0,
      openOk ? openSize.y * 0.5 : 0
    );
    this._containerHalfW = Math.max(hw, 1e-3);
    this._containerHalfH = Math.max(hh, 1e-3);
    if (!closedOk) this._closedCenterPivot.copy(this._openCenterPivot);
    if (!openOk) this._openCenterPivot.copy(this._closedCenterPivot);
    this._containerBaked = true;
    this._buildHitProxy();
  }

  /**
   * Union skinned verts into pivot-local AABB; write center + size.
   * @param {THREE.Vector3} outCenter
   * @param {THREE.Vector3} outSize
   * @returns {boolean}
   */
  _samplePivotAabb(outCenter, outSize) {
    const target = this.armature ?? this.model;
    if (!target) return false;
    this._tmpBox.makeEmpty();
    let ok = false;
    this.pivot.updateMatrixWorld(true);
    target.traverse((obj) => {
      if (!obj.isSkinnedMesh || !obj.visible) return;
      if (typeof obj.getVertexPosition !== "function") return;
      const pos = obj.geometry?.attributes?.position;
      if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 700));
      for (let i = 0; i < pos.count; i += step) {
        obj.getVertexPosition(i, _V);
        obj.localToWorld(_V);
        this.pivot.worldToLocal(_V);
        if (
          Number.isFinite(_V.x) &&
          Number.isFinite(_V.y) &&
          Number.isFinite(_V.z)
        ) {
          this._tmpBox.expandByPoint(_V);
          ok = true;
        }
      }
    });
    if (!ok || this._tmpBox.isEmpty()) return false;
    this._tmpBox.getCenter(outCenter);
    this._tmpBox.getSize(outSize);
    return true;
  }

  /**
   * Keep the current pose’s visual center on the container origin.
   * @param {number} openish 0 = closed, 1 = open
   */
  _applyContainerCenter(openish) {
    const t = THREE.MathUtils.clamp(openish, 0, 1);
    this._centerLerp.lerpVectors(
      this._closedCenterPivot,
      this._openCenterPivot,
      t
    );
    this.pop.position.set(
      -this._centerLerp.x,
      -this._centerLerp.y,
      -this._centerLerp.z
    );
  }

  /**
   * Screen frame in pivot-local space (iso parent), fold already open.
   * Plane normal from the corner span, then in-plane PCA: major = long edge,
   * minor = short edge (`bottom`). Signs are chosen in the bake.
   * @param {THREE.Object3D} mesh
   * @returns {{ normal: THREE.Vector3, bottom: THREE.Vector3 } | null}
   */
  _sampleScreenAxesInPivot(mesh) {
    this.pivot.updateMatrixWorld(true);
    mesh.updateWorldMatrix?.(true, true);
    mesh.updateMatrixWorld(true);

    /** @type {THREE.Vector3[]} */
    const pts = [];
    const pushWorld = (v) => {
      this.pivot.worldToLocal(v);
      if (Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) {
        pts.push(v.clone());
      }
    };

    if (mesh.isSkinnedMesh && typeof mesh.getVertexPosition === "function") {
      const pos = mesh.geometry?.attributes?.position;
      if (!pos || pos.count < 6) return null;
      const step = Math.max(1, Math.floor(pos.count / 500));
      for (let i = 0; i < pos.count; i += step) {
        mesh.getVertexPosition(i, _V);
        mesh.localToWorld(_V);
        pushWorld(_V);
      }
    } else {
      this._tmpBox.setFromObject(mesh);
      if (this._tmpBox.isEmpty()) return null;
      const min = this._tmpBox.min;
      const max = this._tmpBox.max;
      const corners = [
        [min.x, min.y, min.z],
        [min.x, min.y, max.z],
        [min.x, max.y, min.z],
        [min.x, max.y, max.z],
        [max.x, min.y, min.z],
        [max.x, min.y, max.z],
        [max.x, max.y, min.z],
        [max.x, max.y, max.z]
      ];
      for (const c of corners) {
        _V.set(c[0], c[1], c[2]);
        pushWorld(_V);
      }
    }

    if (pts.length < 8) return null;

    const centroid = new THREE.Vector3();
    for (const p of pts) centroid.add(p);
    centroid.multiplyScalar(1 / pts.length);

    // Long axis: farthest point from centroid.
    let far = pts[0];
    let farD = -1;
    for (const p of pts) {
      const d = p.distanceToSquared(centroid);
      if (d > farD) {
        farD = d;
        far = p;
      }
    }
    const longAxis = far.clone().sub(centroid);
    if (longAxis.lengthSq() < 1e-10) return null;
    longAxis.normalize();

    // Mid axis: farthest perpendicular to long (screen height).
    let midD = -1;
    const midAxis = new THREE.Vector3();
    for (const p of pts) {
      const rel = p.clone().sub(centroid);
      const along = rel.dot(longAxis);
      rel.addScaledVector(longAxis, -along);
      const d = rel.lengthSq();
      if (d > midD) {
        midD = d;
        midAxis.copy(rel);
      }
    }
    if (midAxis.lengthSq() < 1e-10) return null;
    midAxis.normalize();

    const normal = new THREE.Vector3().crossVectors(longAxis, midAxis);
    if (normal.lengthSq() < 1e-10) return null;
    normal.normalize();

    // The farthest point from the centroid is a corner, so longAxis × midAxis
    // is a diagonal. Mapping that diagonal to +Z rotates the open phone in
    // the screen plane and off the tip axis at the same time. PCA on the
    // plane: major = long edge (right → +X), minor = short edge (bottom → +Z).
    const tangent =
      Math.abs(normal.dot(_AXIS_Y)) < 0.9
        ? new THREE.Vector3().crossVectors(_AXIS_Y, normal).normalize()
        : new THREE.Vector3().crossVectors(_AXIS_X, normal).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    let cxx = 0;
    let cyy = 0;
    let cxy = 0;
    for (const p of pts) {
      const rel = p.clone().sub(centroid);
      const x = rel.dot(tangent);
      const y = rel.dot(bitangent);
      cxx += x * x;
      cyy += y * y;
      cxy += x * y;
    }
    const trace = cxx + cyy;
    const det = cxx * cyy - cxy * cxy;
    const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
    const majorL = trace / 2 + disc;
    let vx = 1;
    let vy = 0;
    if (Math.abs(cxy) > 1e-8) {
      vx = cxy;
      vy = majorL - cxx;
    } else if (cyy > cxx) {
      vx = 0;
      vy = 1;
    }
    const major = tangent.clone().multiplyScalar(vx).addScaledVector(bitangent, vy);
    if (major.lengthSq() < 1e-10) return null;
    major.normalize();
    const minor = new THREE.Vector3().crossVectors(normal, major).normalize();

    return { normal, bottom: minor };
  }

  /**
   * Restore load-time bake if seat scale looked “bad” — do NOT re-run tipStand/fit.
   */
  _restoreBakedClosedPose() {
    if (!this._closedPoseBaked || !this.model) return;
    this.basis.quaternion.copy(this._bakedBasisQuat);
    this._comLocal.copy(this._bakedComLocal);
    this._fitScale = this._bakedFitScale;
    this._foldBlend = 0;
    this._foldVel = 0;
    this._freezeEntrancePose();
    this.basis.updateMatrixWorld(true);
  }

  /**
   * One-time axis lock (tipStand pattern): map GLB tallest → HUD +Y (up),
   * exterior / camera-island → HUD +Z (toward camera). Never animated.
   * Bails to identity if the skinned AABB is unusable (avoids NaN / insane fit).
   */
  _lockModelBasis() {
    const target = this.armature ?? this.model;
    if (!target || !this.model) return;

    const prevPop = this.pop.scale.x;
    this.pop.scale.setScalar(1);

    this.basis.quaternion.identity();
    this.basis.position.set(0, 0, 0);
    this.model.position.set(0, 0, 0);
    this.model.quaternion.identity();
    this.model.scale.setScalar(1);
    this._scrubFold(0);
    this.basis.updateMatrixWorld(true);

    const size = new THREE.Vector3();
    if (!this._measureTargetSize(target, size)) {
      this.pop.scale.setScalar(prevPop);
      return;
    }

    // 1) Tallest local axis → +Y (upright phone).
    const axes = [
      { name: "x", len: size.x },
      { name: "y", len: size.y },
      { name: "z", len: size.z }
    ].sort((a, b) => b.len - a.len);
    const tallest = axes[0].name;
    if (tallest === "x") {
      this.basis.quaternion.setFromAxisAngle(_AXIS_Z, Math.PI / 2);
    } else if (tallest === "z") {
      this.basis.quaternion.setFromAxisAngle(_AXIS_X, -Math.PI / 2);
    }
    this.basis.updateMatrixWorld(true);

    // 2) Yaw so exterior (camera island) faces +Z toward the HUD camera.
    if (!this._measureTargetSize(target, size)) {
      this.pop.scale.setScalar(prevPop);
      return;
    }
    this._tmpBox.setFromObject(target);
    if (this._tmpBox.isEmpty()) {
      this.pop.scale.setScalar(prevPop);
      return;
    }
    const phoneCenter = this._tmpBox.getCenter(new THREE.Vector3());
    const exterior = new THREE.Vector3();
    let exteriorN = 0;
    const screens = new THREE.Vector3();
    let screenN = 0;

    target.traverse((obj) => {
      if (!obj.isMesh) return;
      const n = String(obj.name || "").toLowerCase();
      obj.getWorldPosition(_V);
      if (/camera|lens|island|back|circle/.test(n)) {
        exterior.add(_V);
        exteriorN += 1;
      }
      if (obj.userData?.duoScreen || /^screen/i.test(n)) {
        screens.add(_V);
        screenN += 1;
      }
    });

    let faceDir = null;
    if (exteriorN > 0) {
      exterior.multiplyScalar(1 / exteriorN).sub(phoneCenter);
      faceDir = exterior;
    } else if (screenN > 0) {
      screens.multiplyScalar(1 / screenN).sub(phoneCenter);
      faceDir = screens.multiplyScalar(-1);
    }

    if (faceDir && faceDir.lengthSq() > 1e-8) {
      _V.copy(faceDir).applyQuaternion(_Q.copy(this.basis.quaternion).invert());
      _V.y = 0;
      if (_V.lengthSq() > 1e-8) {
        _V.normalize();
        const yaw = Math.atan2(_V.x, _V.z);
        this.basis.quaternion.multiply(_Q.setFromAxisAngle(_AXIS_Y, -yaw));
      }
    }

    this.basis.updateMatrixWorld(true);
    this.pop.scale.setScalar(prevPop);
  }

  /**
   * Union world AABBs of meshes under `target`. Returns false if unusable.
   * @param {THREE.Object3D} target
   * @param {THREE.Vector3} outSize
   */
  _measureTargetSize(target, outSize) {
    this._tmpBox.makeEmpty();
    target.updateWorldMatrix(true, true);
    target.traverse((obj) => {
      if (!obj.isMesh) return;
      // Per-mesh setFromObject is more reliable than one shot on a skinned root
      // (bind-pose / bone timing can collapse the group AABB to ~0).
      const meshBox = new THREE.Box3().setFromObject(obj);
      if (!meshBox.isEmpty()) this._tmpBox.union(meshBox);
    });
    if (this._tmpBox.isEmpty()) return false;
    this._tmpBox.getSize(outSize);
    const max = Math.max(outSize.x, outSize.y, outSize.z);
    return Number.isFinite(max) && max > 1e-3;
  }

  _fitClosedPose() {
    const target = this.armature ?? this.model;
    if (!target || !this.model) return;

    this.pop.scale.setScalar(1);
    this.model.position.set(0, 0, 0);
    this.model.scale.setScalar(1);
    this._fitScale = 1;
    this._scrubFold(0);
    this.basis.updateMatrixWorld(true);
    this._refreshSkin();

    // Measure in BASIS space (mesh-local + localToWorld). Using raw
    // getVertexPosition as a model offset shoved the phone off-screen.
    if (!this._sampleSkinnedBoundsBasis(target, this._tmpBox)) {
      this._fitScale = 1;
      return;
    }
    const size0 = this._tmpBox.getSize(this._tmpVec);
    let spanY = size0.y;
    if (!(spanY > 1e-4)) {
      target.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry) return;
        if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
        const gb = obj.geometry.boundingBox;
        if (!gb) return;
        spanY = Math.max(spanY, Math.abs(gb.max.y - gb.min.y));
      });
    }

    let s = DUO_FIT_HEIGHT_M / Math.max(spanY, 1e-3);
    s = THREE.MathUtils.clamp(s, 0.05, 80);
    this._fitScale = s;
    this.model.scale.setScalar(s);
    this.model.position.set(0, 0, 0);
    this.model.updateMatrixWorld(true);
    this._refreshSkin();

    this._centerModelInBasis(target);

    // Face the broad side toward the HUD camera (+Z).
    this._faceBroadsideToCamera();
    this._centerModelInBasis(target);

    // Bake COM in model-local (scale=1) so seat/entrance scale never drifts the spin axis.
    this._comLocal.set(
      -this.model.position.x / s,
      -this.model.position.y / s,
      -this.model.position.z / s
    );
    if (
      !Number.isFinite(this._comLocal.x) ||
      !Number.isFinite(this._comLocal.y) ||
      !Number.isFinite(this._comLocal.z)
    ) {
      this._comLocal.set(0, 0, 0);
    }
  }

  /**
   * Union skinned vertex positions into `outBox` in `basis` local space.
   * @param {THREE.Object3D} target
   * @param {THREE.Box3} outBox
   * @returns {boolean}
   */
  _sampleSkinnedBoundsBasis(target, outBox) {
    outBox.makeEmpty();
    let ok = false;
    this.basis.updateMatrixWorld(true);
    target.traverse((obj) => {
      if (!obj.isSkinnedMesh || !obj.visible) return;
      if (typeof obj.getVertexPosition !== "function") return;
      const pos = obj.geometry?.attributes?.position;
      if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 700));
      for (let i = 0; i < pos.count; i += step) {
        obj.getVertexPosition(i, _V);
        obj.localToWorld(_V);
        this.basis.worldToLocal(_V);
        if (
          Number.isFinite(_V.x) &&
          Number.isFinite(_V.y) &&
          Number.isFinite(_V.z)
        ) {
          outBox.expandByPoint(_V);
          ok = true;
        }
      }
    });
    return ok && !outBox.isEmpty();
  }

  /**
   * Shift `model.position` so skinned content is centered on the basis origin.
   * Pivot spins around this point — must be the physical phone COM.
   * @param {THREE.Object3D} target
   */
  _centerModelInBasis(target) {
    if (!this.model) return;
    // Iterate twice — first pass kills large bias, second lands dead-center.
    for (let pass = 0; pass < 2; pass++) {
      this.model.updateMatrixWorld(true);
      this._refreshSkin();
      if (!this._sampleSkinnedBoundsBasis(target, this._tmpBox)) return;
      const c = this._tmpBox.getCenter(this._tmpVec);
      if (
        !Number.isFinite(c.x) ||
        !Number.isFinite(c.y) ||
        !Number.isFinite(c.z)
      ) {
        this.model.position.set(0, 0, 0);
        return;
      }
      this.model.position.x -= c.x;
      this.model.position.y -= c.y;
      this.model.position.z -= c.z;
      if (
        !Number.isFinite(this.model.position.x) ||
        Math.abs(this.model.position.x) > 5 ||
        Math.abs(this.model.position.y) > 5 ||
        Math.abs(this.model.position.z) > 5
      ) {
        this.model.position.set(0, 0, 0);
        return;
      }
    }
    this.model.updateMatrixWorld(true);
    this._refreshSkin();
    // Confirm residual center is near 0 (spin must not read as orbiting).
    if (this._sampleSkinnedBoundsBasis(target, this._tmpBox)) {
      const c = this._tmpBox.getCenter(this._tmpVec);
      const residual = Math.hypot(c.x, c.y, c.z);
      if (residual > 0.02) {
        this.model.position.x -= c.x;
        this.model.position.y -= c.y;
        this.model.position.z -= c.z;
        this.model.updateMatrixWorld(true);
        this._refreshSkin();
      }
    }
  }

  /**
   * After skinning is posed, ensure the phone’s thin axis is Z (toward cam)
   * so we see the face, not a knife-edge.
   */
  _faceBroadsideToCamera() {
    const target = this.armature ?? this.model;
    if (!target) return;

    this.model.updateMatrixWorld(true);
    this._refreshSkin();

    if (!this._sampleSkinnedBoundsBasis(target, this._tmpBox)) return;
    const size = this._tmpBox.getSize(this._tmpVec);
    const sx = size.x;
    const sy = size.y;
    const sz = size.z;
    // Thin axis should be Z (camera looks −Z → sees XY face).
    if (sx <= sy && sx <= sz) {
      this.basis.quaternion.multiply(_Q.setFromAxisAngle(_AXIS_Y, Math.PI / 2));
    } else if (sy <= sx && sy <= sz) {
      this.basis.quaternion.multiply(_Q.setFromAxisAngle(_AXIS_X, -Math.PI / 2));
    }
    this.basis.updateMatrixWorld(true);
    this._refreshSkin();
  }

  /**
   * Entrance — three phases, never overlapping:
   *   entering → rise + overshoot + settle (frozen pose)
   *   holding  → rest beat (no bob/spin)
   *   live     → bob fades in, then spin fades in
   */
  reveal() {
    if (!this.ready) return;
    if (this._entrance !== "hidden") return;

    this._entranceTween = null;

    const scaleX = this.model?.scale?.x;
    if (
      !this._closedPoseBaked ||
      !Number.isFinite(scaleX) ||
      !Number.isFinite(this.model?.position?.x)
    ) {
      this._restoreBakedClosedPose();
    } else {
      this.basis.quaternion.copy(this._bakedBasisQuat);
      this._comLocal.copy(this._bakedComLocal);
      this._fitScale = this._bakedFitScale;
    }

    this._openBlend = 0;
    this._openVel = 0;
    this._hoverT = 0;
    this._hoverTarget = 0;
    this.hovered = false;
    this._wantHover = false;
    this._hoverEnterT = 0;
    this._hoverLeaveT = 0;
    this._foldBlend = 0;
    this._foldVel = 0;
    this._holoDelayT = 0;
    this._cancelUnhoverExit();
    this._applyFoldVisibility(0);
    this._freezeEntrancePose();
    this._idle.reset();
    this._bobIn = 0;
    this._spinIn = 0;
    this._idleIn = 0;
    this._idleHoldT = 0;
    this._liveElapsed = 0;
    this._entranceElapsed = 0;
    this._handoffLog = [];
    /** Hold-phase continuity samples remaining. */
    this._handoffHoldLeft = 0;
    /** Live-phase continuity samples remaining (first ~12 live frames). */
    this._handoffLiveLeft = 0;
    /** Last centerT passed to `_applyContainerCenter` (for handoff log). */
    this._lastCenterT = 0;

    this._buildHitProxy();

    if (this._reducedMotion) {
      this._entrance = "live";
      this._entranceScale = 1;
      this._entranceY = 0;
      this._entranceOpacity = 1;
      this._bobIn = 1;
      this._spinIn = 1;
      this._idleIn = 1;
      this._idleHoldT = 0;
      this._setEntranceOpacity(1);
      this.root.visible = true;
      this.enabled = true;
      this._applySeat(0, { refreshSkin: false });
      return;
    }

    this._entrance = "entering";
    this._entranceScale = 1;
    this._entranceY = DUO_ENTRANCE_FROM_Y;
    this._entranceOpacity = 0;
    this._bobIn = 0;
    this._spinIn = 0;
    this._idleIn = 0;
    this._idleHoldT = 0;
    this._liveElapsed = 0;
    this._entranceElapsed = 0;
    this._entranceLog = [];
    this._entranceLogArmed = true;
    this.root.visible = true;
    this.enabled = false;
    this._applySeat(0, { refreshSkin: false });
    this.pivot.position.set(0, this._entranceY, 0);
    this._setEntranceOpacity(0);
    this._logEntranceFrame("pre-tween");
    this._logPhase("entering");
  }

  /** Rise done → hold at rest. */
  _finishEntranceToHold() {
    if (this._entrance !== "entering") return;
    this._entranceY = 0;
    this._entranceOpacity = 1;
    this._entranceScale = 1;
    this._entrance = "holding";
    this._idleHoldT = DUO_IDLE_HOLD_SEC;
    this._bobIn = 0;
    this._spinIn = 0;
    this._idleIn = 0;
    this._liveElapsed = 0;
    this._idle.reset();
    this._entranceLogArmed = false;
    this._setEntranceOpacity(1);
    this._applySeat(0, { refreshSkin: false });
    this._applyRestPose();
    this._logEntranceFrame("complete");
    this._logHandoffFrame("complete");
    this._logPhase("holding");
    // Sample a few hold frames, then reserve a fresh budget for first live frames.
    this._handoffHoldLeft = 4;
    this._handoffLiveLeft = 0;
  }

  /** Hold done → live (bob/spin may begin). */
  _finishHoldToLive() {
    if (this._entrance !== "holding") return;
    this._entrance = "live";
    this.enabled = true;
    this._idleHoldT = 0;
    this._liveElapsed = 0;
    this._bobIn = 0;
    this._spinIn = 0;
    this._idleIn = 0;
    // Guarantee closed seat at the boundary (no residual open/hover).
    this._openBlend = 0;
    this._openVel = 0;
    this._hoverT = 0;
    this._hoverTarget = 0;
    this.hovered = false;
    this._wantHover = false;
    this._idle.reset();
    this._applyRestPose();
    this._logHandoffFrame("live-start");
    this._logPhase("live");
    this._handoffLiveLeft = 12;
  }

  _logPhase(phase) {
    if (typeof console !== "undefined") {
      console.info(`[DuoFab] entrance phase → ${phase}`);
    }
  }

  /** Closed phone at seat rest — zero bob/spin. */
  _applyRestPose() {
    this.iso.quaternion.copy(this._isoClosedQuat);
    this.pivot.position.set(0, 0, 0);
    this.pivot.rotation.set(0, 0, 0);
    this.spin.position.set(0, 0, 0);
    this.spin.rotation.set(0, 0, 0);
    this.root.scale.setScalar(1);
    this.pop.scale.setScalar(1);
    if (this._closedPoseBaked) {
      this.basis.quaternion.copy(this._bakedBasisQuat);
    }
  }

  /**
   * Advance bob/spin fades (live only). Spin lags bob for a clean handover.
   * @param {number} dt
   */
  _advanceIdleIn(dt) {
    if (this._reducedMotion) {
      this._bobIn = 1;
      this._spinIn = 1;
      this._idleIn = 1;
      return;
    }
    if (this._entrance !== "live") return;

    this._liveElapsed += dt;

    if (this._bobIn < 1) {
      this._bobIn = Math.min(
        1,
        this._bobIn + dt / Math.max(1e-3, DUO_IDLE_BOB_IN_SEC)
      );
    }

    if (this._liveElapsed >= DUO_IDLE_SPIN_DELAY_SEC && this._spinIn < 1) {
      this._spinIn = Math.min(
        1,
        this._spinIn + dt / Math.max(1e-3, DUO_IDLE_SPIN_IN_SEC)
      );
    }

    this._idleIn = this._bobIn;
  }

  /**
   * Idle strengths — bob and spin are independent fades.
   * @returns {{ spin: number, bob: number, wobble: number, faceYaw: null }}
   */
  _closedIdleStrengths() {
    if (this._reducedMotion) {
      return { spin: 1, bob: 1, wobble: 1, faceYaw: null };
    }
    if (this._entrance !== "live") {
      return { spin: 0, bob: 0, wobble: 0, faceYaw: null };
    }
    const bob = easePower2Out(THREE.MathUtils.clamp(this._bobIn, 0, 1));
    const spin = easePower2Out(THREE.MathUtils.clamp(this._spinIn, 0, 1));
    return {
      spin,
      bob,
      wobble: spin,
      faceYaw: null
    };
  }

  /**
   * Continuity samples across entrance→live.
   * Probe: `__stage.debugDuo().handoffLog` — look for `steps` / large `d*`.
   * @param {string} tag
   */
  _logHandoffFrame(tag) {
    const centerT =
      this._lastCenterT != null
        ? this._lastCenterT
        : THREE.MathUtils.clamp(this._hoverT ?? 0, 0, 1);
    const iq = this.iso.quaternion;
    const snap = {
      tag,
      n: this._handoffLog.length,
      entrance: this._entrance,
      entranceY: +this._entranceY.toFixed(6),
      dt: +this._lastTickDt.toFixed(5),
      openBlend: +this._openBlend.toFixed(5),
      hoverT: +this._hoverT.toFixed(5),
      centerT: +centerT.toFixed(5),
      root: [
        +this.root.position.x.toFixed(6),
        +this.root.position.y.toFixed(6)
      ],
      pop: [
        +this.pop.position.x.toFixed(6),
        +this.pop.position.y.toFixed(6),
        +this.pop.position.z.toFixed(6)
      ],
      modelScale: +(this.model?.scale?.x ?? 0).toFixed(6),
      iso: [
        +iq.x.toFixed(6),
        +iq.y.toFixed(6),
        +iq.z.toFixed(6),
        +iq.w.toFixed(6)
      ],
      idleIn: +this._idleIn.toFixed(5),
      idleY: +this._idle.y.toFixed(6),
      pivotY: +this.pivot.position.y.toFixed(6),
      spin: [
        +this.spin.rotation.x.toFixed(6),
        +this.spin.rotation.y.toFixed(6),
        +this.spin.rotation.z.toFixed(6)
      ]
    };
    const prev = this._handoffLog[this._handoffLog.length - 1];
    if (prev) {
      snap.dPivotY = +(snap.pivotY - prev.pivotY).toFixed(6);
      snap.dSpin = +(
        Math.hypot(
          snap.spin[0] - prev.spin[0],
          snap.spin[1] - prev.spin[1],
          snap.spin[2] - prev.spin[2]
        )
      ).toFixed(6);
      snap.dRoot = +(
        Math.hypot(snap.root[0] - prev.root[0], snap.root[1] - prev.root[1])
      ).toFixed(6);
      snap.dPop = +(
        Math.hypot(
          snap.pop[0] - prev.pop[0],
          snap.pop[1] - prev.pop[1],
          snap.pop[2] - prev.pop[2]
        )
      ).toFixed(6);
      snap.dModelScale = +(snap.modelScale - prev.modelScale).toFixed(6);
      // Quaternion angle (rad) between frames.
      const dot = Math.min(
        1,
        Math.abs(
          snap.iso[0] * prev.iso[0] +
            snap.iso[1] * prev.iso[1] +
            snap.iso[2] * prev.iso[2] +
            snap.iso[3] * prev.iso[3]
        )
      );
      snap.dIso = +(2 * Math.acos(dot)).toFixed(6);
      snap.dCenterT = +(snap.centerT - prev.centerT).toFixed(5);
      /** Layers that stepped beyond noise (hold→live smoking gun). */
      const steps = [];
      if (snap.dRoot > 0.002) steps.push("root.position");
      if (snap.dPop > 0.002) steps.push("pop.position");
      if (snap.dIso > 0.01) steps.push("iso.quat");
      if (Math.abs(snap.dModelScale) > 0.002) steps.push("model.scale");
      if (Math.abs(snap.dCenterT) > 0.01) steps.push("centerT");
      // Idle springs (uncapped dt) — shoot-off signature.
      if (Math.abs(snap.dPivotY) > 0.008) steps.push("pivot.y");
      if (snap.dSpin > 0.08) steps.push("spin");
      if (steps.length) snap.steps = steps;
    }
    this._handoffLog.push(snap);
  }

  /** Lock orientation layers; optionally keep entrance drop Y on pivot. */
  _freezeEntrancePose(opts = {}) {
    const keepEntranceY = Boolean(opts.keepEntranceY);
    this.iso.quaternion.copy(this._isoClosedQuat);
    this.pivot.rotation.set(0, 0, 0);
    this.spin.position.set(0, 0, 0);
    this.spin.rotation.set(0, 0, 0);
    this.root.scale.setScalar(1);
    this.pop.scale.setScalar(1);
    if (keepEntranceY) {
      this.pivot.position.set(0, this._entranceY, 0);
    } else {
      this.pivot.position.set(0, 0, 0);
    }
    if (this._closedPoseBaked) {
      this.basis.quaternion.copy(this._bakedBasisQuat);
    }
  }

  /**
   * Fade Duo meshes via material opacity (authored values restored at full).
   * @param {number} amount 0–1
   */
  _setEntranceOpacity(amount) {
    const a = THREE.MathUtils.clamp(amount, 0, 1);
    this.root.traverse((obj) => {
      if (!obj.isMesh || obj === this.hitProxy) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m || typeof m.opacity !== "number") continue;
        if (m.userData._duoOpacityAuthored == null) {
          m.userData._duoOpacityAuthored = m.opacity;
          m.userData._duoTransparentAuthored = Boolean(m.transparent);
        }
        const base = m.userData._duoOpacityAuthored;
        m.transparent = a < 0.999 || m.userData._duoTransparentAuthored;
        m.opacity = base * a;
        // Keep depth writes when nearly opaque to avoid sorting flicker.
        if ("depthWrite" in m) m.depthWrite = a > 0.92;
        m.needsUpdate = true;
      }
    });
  }

  /**
   * Snapshot orientation layers during entrance (debugDuo.entranceLog).
   * @param {string} tag
   */
  _logEntranceFrame(tag) {
    if (!this._entranceLogArmed && tag !== "complete") return;
    if (this._entranceLog.length >= 22 && tag !== "complete") return;
    const q = this.basis.quaternion;
    const snap = {
      tag,
      n: this._entranceLog.length,
      basis: [q.x, q.y, q.z, q.w].map((v) => +v.toFixed(5)),
      spin: [
        +this.spin.rotation.x.toFixed(5),
        +this.spin.rotation.y.toFixed(5),
        +this.spin.rotation.z.toFixed(5)
      ],
      iso: [
        +this.iso.rotation.x.toFixed(5),
        +this.iso.rotation.y.toFixed(5),
        +this.iso.rotation.z.toFixed(5)
      ],
      modelScale: +(this.model?.scale?.x ?? 0).toFixed(5),
      entranceY: +this._entranceY.toFixed(5),
      entranceOpacity: +this._entranceOpacity.toFixed(5),
      foldBlend: +this._foldBlend.toFixed(5)
    };
    const prev = this._entranceLog[this._entranceLog.length - 1];
    if (prev) {
      snap.delta = {
        basis: snap.basis.some((v, i) => v !== prev.basis[i]),
        spin: snap.spin.some((v, i) => v !== prev.spin[i]),
        iso: snap.iso.some((v, i) => v !== prev.iso[i]),
        modelScale: snap.modelScale !== prev.modelScale,
        entranceY: snap.entranceY !== prev.entranceY,
        entranceOpacity: snap.entranceOpacity !== prev.entranceOpacity,
        foldBlend: snap.foldBlend !== prev.foldBlend
      };
    }
    this._entranceLog.push(snap);
  }

  /**
   * Summarize which layers moved across entranceLog.
   * Rise entrance moves entranceY + entranceOpacity; spin/bob fade in mid-tween.
   * @returns {Record<string, number>}
   */
  _entranceMovers() {
    /** @type {Record<string, number>} */
    const counts = {
      basis: 0,
      spin: 0,
      iso: 0,
      modelScale: 0,
      entranceY: 0,
      entranceOpacity: 0,
      foldBlend: 0
    };
    for (const row of this._entranceLog) {
      if (!row.delta) continue;
      for (const k of Object.keys(counts)) {
        if (row.delta[k]) counts[k] += 1;
      }
    }
    return counts;
  }

  /**
   * Dev probe — seat / fit / entrance frame log.
   * After reveal, inspect `entranceMovers` (entranceY + opacity; spin fades in).
   * @returns {Record<string, unknown>}
   */
  debugState() {
    const rect = this._fabClientRect();
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    let spinCenter = null;
    let spinResidual = null;
    // Avoid mixer refresh during entrance probe — would dirty the freeze test.
    const canSample = this._entrance === "live" || this._entrance === "holding";
    if ((this.armature || this.model) && canSample) {
      this.spin.updateMatrixWorld(true);
      this._refreshSkin();
      box.makeEmpty();
      const target = this.armature ?? this.model;
      target.traverse((obj) => {
        if (!obj.isSkinnedMesh || !obj.visible) return;
        if (typeof obj.getVertexPosition !== "function") return;
        const pos = obj.geometry?.attributes?.position;
        if (!pos) return;
        const step = Math.max(1, Math.floor(pos.count / 700));
        for (let i = 0; i < pos.count; i += step) {
          obj.getVertexPosition(i, _V);
          obj.localToWorld(_V);
          this.spin.worldToLocal(_V);
          if (Number.isFinite(_V.x)) box.expandByPoint(_V);
        }
      });
      if (!box.isEmpty()) {
        spinCenter = box.getCenter(new THREE.Vector3()).toArray();
        spinResidual = Math.hypot(spinCenter[0], spinCenter[1], spinCenter[2]);
      }
      this._sampleSkinnedBoundsBasis(this.armature ?? this.model, box);
    }
    const size = box.isEmpty() ? null : box.getSize(new THREE.Vector3()).toArray();
    const q = this.basis.quaternion;
    return {
      entrance: this._entrance,
      bobIn: this._bobIn,
      spinIn: this._spinIn,
      idleIn: this._idleIn,
      idleHoldT: this._idleHoldT,
      liveElapsed: this._liveElapsed,
      entranceElapsed: this._entranceElapsed,
      handoffLog: this._handoffLog,
      ready: this.ready,
      visible: this.root.visible,
      closedPoseBaked: this._closedPoseBaked,
      fitScale: this._fitScale,
      comLocal: this._comLocal.toArray(),
      containerHalf: [this._containerHalfW, this._containerHalfH],
      containerBaked: this._containerBaked,
      screenMarginPx: DUO_SCREEN_MARGIN_PX,
      viewSize: [this._viewW, this._viewH],
      entranceScale: this._entranceScale,
      entranceY: this._entranceY,
      entranceOpacity: this._entranceOpacity,
      modelScale: this.model?.scale?.x ?? null,
      modelPos: this.model?.position?.toArray?.() ?? null,
      rootPos: this.root.position.toArray(),
      basis: [q.x, q.y, q.z, q.w],
      spin: [
        this.spin.rotation.x,
        this.spin.rotation.y,
        this.spin.rotation.z
      ],
      iso: [
        this.iso.quaternion.x,
        this.iso.quaternion.y,
        this.iso.quaternion.z,
        this.iso.quaternion.w
      ],
      openIsoBaked: this._openIsoBaked,
      openIsoDebug: this._openIsoDebug,
      foldBlend: this._foldBlend,
      spinYaw: this._idle?.spinYaw ?? 0,
      spinCenter,
      spinResidual,
      basisSize: size,
      clientRect: rect,
      entranceLog: this._entranceLog,
      entranceMovers: this._entranceMovers()
    };
  }

  /** @returns {boolean} */
  get isLive() {
    return this._entrance === "live";
  }

  /** @returns {boolean} */
  get isVisible() {
    return this._entrance !== "hidden";
  }

  /**
   * Keep `Armature` (textured on); hide `_off` / `_screen` demos.
   * @param {THREE.Object3D} root
   */
  _selectArmature(root) {
    /** @type {THREE.Object3D[]} */
    const armatures = [];
    for (const child of root.children) {
      if (/^Armature/i.test(child.name)) armatures.push(child);
    }
    if (!armatures.length) {
      root.traverse((obj) => {
        if (obj.name === DUO_ARMATURE_NAME) armatures.push(obj);
      });
    }

    this.armature =
      armatures.find((a) => a.name === DUO_ARMATURE_NAME) ??
      armatures[0] ??
      null;

    for (const arm of armatures) {
      const keep = arm === this.armature;
      arm.visible = keep;
      arm.traverse((o) => {
        if (o.isMesh) o.visible = keep;
      });
    }
  }

  /**
   * Mixer is rooted on the GLTF scene so clip node paths resolve.
   * @param {THREE.AnimationClip[]} clips
   */
  _setupFoldMixer(clips) {
    if (!this.model || !clips.length) {
      console.warn("[DuoFab] missing model or fold clips");
      return;
    }
    const clip =
      clips.find((c) => c.name === DUO_FOLD_CLIP) ??
      clips.find((c) => c.name === "ArmatureAction") ??
      clips.find(
        (c) => /ArmatureAction$/i.test(c.name) && !/_off|_screen/i.test(c.name)
      ) ??
      clips[0];
    this._mixer = new THREE.AnimationMixer(this.model);
    this._foldAction = this._mixer.clipAction(clip);
    this._foldAction.enabled = true;
    this._foldAction.setEffectiveWeight(1);
    this._foldAction.setLoop(THREE.LoopOnce, 0);
    this._foldAction.clampWhenFinished = true;
    this._foldAction.play();
    this._foldAction.paused = true;
  }

  /**
   * @param {number} foldBlend 0 closed → 1 open
   */
  _scrubFold(foldBlend) {
    this._foldBlend = THREE.MathUtils.clamp(foldBlend, 0, 1);
    this._refreshSkin();
  }

  /**
   * Re-evaluate ArmatureAction after parent transforms change.
   * Without this, scaling `pop` leaves skinned meshes collapsed/invisible.
   */
  _refreshSkin() {
    if (!this._foldAction || !this._mixer) return;
    const t0 = this._noteRig ? performance.now() : 0;
    const t = THREE.MathUtils.lerp(
      DUO_FOLD_TIME_CLOSED,
      DUO_FOLD_TIME_OPEN,
      this._foldBlend
    );
    this._foldAction.time = t;
    this._foldAction.paused = true;
    this._mixer.update(0);
    this.armature?.updateMatrixWorld(true);
    if (this._noteRig) this._noteRig("duoFab.refreshSkin", performance.now() - t0);
  }

  /**
   * @param {THREE.Object3D} root
   */
  _prepareMaterials(root) {
    this.screenMeshes = [];
    this.exteriorScreens = [];
    this.insightScreens = [];
    this._screenMats = [];

    const exteriorMap = this._exterior?.texture ?? null;
    const exteriorKey = DUO_SCREEN_EXTERIOR.toLowerCase();
    const insightKey = DUO_SCREEN_INSIGHT.toLowerCase();

    root.traverse((obj) => {
      if (!obj.isMesh) return;

      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => (m?.clone ? m.clone() : m));
      } else if (obj.material?.clone) {
        obj.material = obj.material.clone();
      }

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const matName = (m) => String(m?.name || "").toLowerCase().trim();
      const hasScreenMat = mats.some((m) => SCREEN_MAT_SET.has(matName(m)));

      const ancestry = [];
      let p = obj;
      while (p) {
        ancestry.push(String(p.name || ""));
        p = p.parent;
      }
      const underDisplayNode = ancestry.some((n) => /^screen/i.test(n));
      const nameKey = String(obj.name || "").toLowerCase();
      const isExterior =
        nameKey === exteriorKey || ancestry.some((n) => n.toLowerCase() === exteriorKey);
      const isInsight =
        nameKey === insightKey || ancestry.some((n) => n.toLowerCase() === insightKey);

      if (hasScreenMat && underDisplayNode) {
        this.screenMeshes.push(obj);
        if (isExterior) this.exteriorScreens.push(obj);
        else if (isInsight) this.insightScreens.push(obj);

        const role = isExterior ? "exterior" : isInsight ? "insight" : "other";
        obj.userData.duoScreenRole = role;

        mats.forEach((m) => {
          if (!m) return;
          // CRT-style: black albedo, image entirely from emissiveMap.
          if ("color" in m) m.color = new THREE.Color(0x000000);
          m.emissive = new THREE.Color(0xffffff);
          if ("emissiveIntensity" in m) {
            m.emissiveIntensity = 0;
          }
          if ("emissiveMap" in m) {
            if (isExterior && exteriorMap) {
              m.emissiveMap = exteriorMap;
              m.map = null;
            } else if (isInsight) {
              // Soft lit glass only — PROJECTS plume lives on the holo sheet,
              // not mirrored across the insight emissiveMap.
              m.emissiveMap = null;
              m.map = null;
              m.emissive = new THREE.Color(DUO_SCREEN_INSIGHT_COLOR);
            } else if (m.map && !m.emissiveMap) {
              m.emissiveMap = m.map;
            }
          }
          m.toneMapped = false;
          m.depthWrite = true;
          m.polygonOffset = true;
          m.polygonOffsetFactor = -1;
          m.polygonOffsetUnits = -1;
          m.needsUpdate = true;
          m.userData.duoScreenRole = role;
          this._screenMats.push(m);
        });
        obj.renderOrder = 2;
        obj.userData.duoScreen = true;
      } else if (underDisplayNode) {
        obj.renderOrder = 1;
      }

      mats.forEach((m) => {
        if (!m) return;
        m.envMapIntensity = 0;
      });

      obj.frustumCulled = false;
    });

    // Prefer insight for open Mail rect; exterior for closed hover tooltip.
    this.primaryScreen =
      this.insightScreens[0] ?? this.exteriorScreens[0] ?? this.screenMeshes[0] ?? null;

    this._buildHoloSheet();
    this._applyScreenPower(0);
  }

  /**
   * Hologram volume — coplanar wash + stack along the screen normal, billboard
   * PROJECTS label, and a bright circular energy disc that travels up the stack.
   */
  _buildHoloSheet() {
    this._disposeHoloSheet();

    const labelMap = this._projects?.texture ?? null;
    const washMap = this._projects?.washTexture ?? null;
    const pulseMap = this._projects?.pulseTexture ?? null;
    const color = new THREE.Color(DUO_HOLO_SHEET_COLOR);

    const mkMat = (map, opacity) =>
      new THREE.MeshBasicMaterial({
        map,
        color: color.clone(),
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        toneMapped: false
      });

    const root = new THREE.Group();
    root.name = "duo-holo-root";
    root.visible = false;

    this._holoWash = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      mkMat(washMap, DUO_HOLO_WASH_OPACITY)
    );
    this._holoWash.name = "duo-holo-wash";
    this._holoWash.frustumCulled = false;
    this._holoWash.renderOrder = 3;
    root.add(this._holoWash);

    this._holoSlabs = [];
    for (let i = 0; i < DUO_HOLO_STACK.length; i++) {
      const slab = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        mkMat(washMap, DUO_HOLO_STACK[i].opacity)
      );
      slab.name = `duo-holo-slab-${i}`;
      slab.frustumCulled = false;
      slab.renderOrder = 4 + i;
      root.add(slab);
      this._holoSlabs.push(slab);
    }

    // Traveling energy disc — coplanar, rises along the screen normal.
    this._holoPulse = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      mkMat(pulseMap, 0)
    );
    this._holoPulse.name = "duo-holo-pulse";
    this._holoPulse.frustumCulled = false;
    this._holoPulse.renderOrder = 10;
    this._holoPulse.visible = false;
    root.add(this._holoPulse);

    this._holoPlume = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      // Normal blend — Additive on Additive wash + bloom blew out the glyphs.
      new THREE.MeshBasicMaterial({
        map: labelMap,
        color: color.clone(),
        transparent: true,
        opacity: DUO_HOLO_LABEL_OPACITY,
        blending: THREE.NormalBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    this._holoPlume.name = "duo-holo-label";
    this._holoPlume.frustumCulled = false;
    this._holoPlume.renderOrder = 12;
    root.add(this._holoPlume);

    this._holoSheet = root;
    this.hudScene.add(root);
  }

  _disposeHoloSheet() {
    if (!this._holoSheet) {
      this._holoWash = null;
      this._holoSlabs = [];
      this._holoPlume = null;
      this._holoPulse = null;
      return;
    }
    this._holoSheet.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m?.dispose?.());
      }
    });
    this._holoSheet.parent?.remove(this._holoSheet);
    this._holoSheet = null;
    this._holoWash = null;
    this._holoSlabs = [];
    this._holoPlume = null;
    this._holoPulse = null;
  }

  /**
   * All layers share the insight face basis and step out along its normal.
   * @param {boolean} open
   */
  _placeHolo(mesh, t, scale, opacity, map, opts) {
    if (!mesh) return;
    const frame = this._holoFrame;
    if (!frame) return;
    const fade = opts?.ignoreClear ? 1 : frame.clearMul;
    mesh.position
      .copy(frame.center)
      .addScaledVector(frame.normal, DUO_HOLO_SHEET_OFFSET + frame.faceSpan * t);
    mesh.quaternion.copy(frame.faceQuat);
    mesh.scale.set(frame.washW * scale, frame.washH * scale, 1);
    mesh.visible = true;
    const mat = mesh.material;
    if (!mat) return;
    mat.opacity = opacity * frame.entrance * fade;
    if (map && mat.map !== map) {
      mat.map = map;
      mat.needsUpdate = true;
    }
  }

  _syncHoloSheet(open) {
    if (!this._holoSheet) return;
    const insight = this.insightScreens[0];
    if (!open || !insight || this._reducedMotion) {
      this._holoSheet.visible = false;
      this._holoOpen = false;
      return;
    }
    this._holoOpen = true;
    this.root.updateMatrixWorld(true);

    const center = _CENTER;
    const faceSize = _FACE;
    const faceT0 = this._noteRig ? performance.now() : 0;
    const measured = this._measureInsightFace(insight, center, faceSize);
    if (this._noteRig) this._noteRig("duoFab.measureFace", performance.now() - faceT0);
    if (!measured) {
      this._tmpBox.setFromObject(insight);
      if (this._tmpBox.isEmpty()) {
        this._holoSheet.visible = false;
        return;
      }
      this._tmpBox.getCenter(center);
      this._tmpBox.getSize(faceSize);
    }

    const x = faceSize.x;
    const y = faceSize.y;
    const z = faceSize.z;
    let faceW;
    let faceH;
    if (x >= y && x >= z) {
      faceW = x;
      faceH = Math.max(y, z);
    } else if (y >= x && y >= z) {
      faceW = y;
      faceH = Math.max(x, z);
    } else {
      faceW = z;
      faceH = Math.max(x, y);
    }
    faceW = Math.max(1e-4, faceW);
    faceH = Math.max(1e-4, faceH);
    const faceSpan = Math.max(faceW, faceH);

    insight.getWorldQuaternion(_Q);
    const normal = _V.set(0, 0, 1).applyQuaternion(_Q).normalize();
    // Flip normal toward the HUD camera so the stack rises into view.
    _V2.copy(this.hudCamera.position).sub(center);
    if (_V2.dot(normal) < 0) normal.negate();

    _V2.copy(_AXIS_Y);
    if (Math.abs(normal.dot(_V2)) > 0.92) _V2.copy(_AXIS_X);
    _V3.crossVectors(_V2, normal).normalize();
    _V2.crossVectors(normal, _V3).normalize();
    _M.makeBasis(_V3, _V2, normal);
    const faceQuat = _FACE_Q.setFromRotationMatrix(_M);

    const entrance = this._entranceOpacity ?? 1;
    const clearMul = Math.max(
      0,
      1 - (this._projects?.holoClearAmount ?? 0)
    );
    const washW = faceW * DUO_HOLO_SHEET_WIDTH;
    const washH = faceH * DUO_HOLO_SHEET_WIDTH;

    const frame = this._holoFrame || (this._holoFrame = {});
    frame.center = center;
    frame.normal = normal;
    frame.faceQuat = faceQuat;
    frame.faceSpan = faceSpan;
    frame.washW = washW;
    frame.washH = washH;
    frame.entrance = entrance;
    frame.clearMul = clearMul;

    const washMap = this._projects?.washTexture ?? null;
    const labelMap = this._projects?.texture ?? null;
    const pulseMap = this._projects?.pulseTexture ?? null;
    const pulseAmt = this._projects?.pulseAmount ?? 0;
    const pulseProg = this._projects?.pulseProgress ?? 0;
    const pulseT = pulseProg * DUO_HOLO_PULSE_MAX_T;
    const mailProjecting = this.state === "mail" || this.state === "caseStudy";
    // While projecting Mail, keep wash thin so the on-glass UI stays readable.
    const washScale = mailProjecting ? DUO_HOLO_MAIL_WASH_SCALE : 1;

    this._placeHolo(this._holoWash, 0, 1, DUO_HOLO_WASH_OPACITY * washScale, washMap);

    for (let i = 0; i < this._holoSlabs.length; i++) {
      const spec = DUO_HOLO_STACK[i];
      if (!spec) continue;
      const near =
        !mailProjecting && pulseAmt > 0.02
          ? Math.max(0, 1 - Math.abs(spec.t - pulseT) / 0.14)
          : 0;
      this._placeHolo(
        this._holoSlabs[i],
        spec.t,
        spec.scale,
        spec.opacity *
          washScale *
          (1 + near * (DUO_HOLO_PULSE_SLAB_BOOST - 1)),
        washMap
      );
    }

    // Circular energy disc — skip while Mail projects (would bury the UI).
    if (this._holoPulse) {
      if (!mailProjecting && pulseAmt > 0.02) {
        const discScale =
          DUO_HOLO_PULSE_SCALE * (1 - pulseProg) +
          DUO_HOLO_PULSE_SCALE_END * pulseProg;
        this._placeHolo(
          this._holoPulse,
          pulseT,
          discScale,
          DUO_HOLO_PULSE_OPACITY * pulseAmt,
          pulseMap,
          { ignoreClear: true }
        );
        this._holoPulse.visible = true;
      } else {
        this._holoPulse.visible = false;
      }
    }

    // PROJECTS label — billboarded so it stays readable when the phone is flat
    // (coplanar text was edge-on to the HUD camera). Kept tight to the glass.
    // Hidden while Mail projects onto the insight emissive.
    if (this._holoPlume) {
      if (mailProjecting) {
        this._holoPlume.visible = false;
      } else {
        const labelSize = Math.min(faceW, faceH) * DUO_HOLO_LABEL_SCALE;
        this._holoPlume.position
          .copy(center)
          .addScaledVector(normal, DUO_HOLO_SHEET_OFFSET + faceSpan * DUO_HOLO_LABEL_T);

        _V2.copy(this.hudCamera.position).sub(this._holoPlume.position);
        if (_V2.lengthSq() < 1e-10) _V2.set(0, 0, 1);
        else _V2.normalize();
        _V3.crossVectors(_AXIS_Y, _V2);
        if (_V3.lengthSq() < 1e-10) _V3.crossVectors(_AXIS_X, _V2);
        _V3.normalize();
        _V.crossVectors(_V2, _V3).normalize();
        if (_V.y < 0) {
          _V.negate();
          _V3.negate();
        }
        _M.makeBasis(_V3, _V, _V2);
        this._holoPlume.quaternion.setFromRotationMatrix(_M);
        this._holoPlume.scale.set(labelSize, labelSize, 1);
        this._holoPlume.visible = true;
        const pm = this._holoPlume.material;
        if (pm) {
          pm.opacity = DUO_HOLO_LABEL_OPACITY * entrance * clearMul;
          if (labelMap && pm.map !== labelMap) {
            pm.map = labelMap;
            pm.needsUpdate = true;
          }
          pm.side = THREE.FrontSide;
        }
      }
    }

    this._holoSheet.visible = true;
  }

  /**
   * Sample skinned insight verts → center + AABB size in world space.
   * @param {THREE.Object3D} insight
   * @param {THREE.Vector3} outCenter
   * @param {THREE.Vector3} outSize
   * @returns {boolean}
   */
  _measureInsightFace(insight, outCenter, outSize) {
    const box = new THREE.Box3();
    let hit = false;
    const sample = (mesh) => {
      if (!mesh?.isSkinnedMesh || typeof mesh.getVertexPosition !== "function") {
        return;
      }
      const pos = mesh.geometry?.attributes?.position;
      if (!pos || pos.count < 3) return;
      const step = Math.max(1, Math.floor(pos.count / 400));
      for (let i = 0; i < pos.count; i += step) {
        mesh.getVertexPosition(i, _V);
        mesh.localToWorld(_V);
        if (!Number.isFinite(_V.x)) continue;
        box.expandByPoint(_V);
        hit = true;
      }
    };
    if (insight.isSkinnedMesh) sample(insight);
    insight.traverse((o) => {
      if (o.isSkinnedMesh) sample(o);
    });
    if (!hit || box.isEmpty()) return false;
    box.getCenter(outCenter);
    box.getSize(outSize);
    return outSize.x + outSize.y + outSize.z > 1e-4;
  }

  /**
   * Closed → exterior cover lock screen. Open → large insight only.
   * Mail open → faint Mail UI on insight emissive (projected through holo).
   * @param {number} openish 0–1
   */
  _applyScreenPower(openish) {
    const t = THREE.MathUtils.clamp(openish, 0, 1);
    // Fold-driven only — do not light insight from Mail state alone
    // (that flashed emissive/holo before the armature opened).
    const openLit = t >= DUO_HOVER_OPEN_AT;
    const mailProjecting =
      openLit &&
      (this.state === "mail" || this.state === "caseStudy") &&
      Boolean(this._mailScreen?.texture);
    const intensity = mailProjecting
      ? DUO_SCREEN_EMISSIVE_MAIL
      : THREE.MathUtils.lerp(
          DUO_SCREEN_EMISSIVE_CLOSED,
          DUO_SCREEN_EMISSIVE_OPEN,
          openLit ? t * t * (3 - 2 * t) : 0
        );

    for (const mesh of this.exteriorScreens) {
      // Closed: lock wallpaper + clock. Open: hidden.
      mesh.visible = !openLit;
      this._setMeshEmissive(
        mesh,
        openLit ? 0 : DUO_SCREEN_EMISSIVE_EXTERIOR
      );
    }
    for (const mesh of this.insightScreens) {
      mesh.visible = openLit;
      this._setInsightMailMap(mesh, mailProjecting);
      this._setMeshEmissive(mesh, openLit ? intensity : 0);
    }
    // Any other tagged screen stays off.
    for (const mesh of this.screenMeshes) {
      const role = mesh.userData?.duoScreenRole;
      if (role === "exterior" || role === "insight") continue;
      mesh.visible = false;
      this._setMeshEmissive(mesh, 0);
    }

    this.primaryScreen = openLit
      ? this.insightScreens[0] ?? this.primaryScreen
      : this.exteriorScreens[0] ?? this.primaryScreen;
  }

  /**
   * @param {THREE.Object3D} mesh
   * @param {boolean} mailOn
   */
  _setInsightMailMap(mesh, mailOn) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const map = this._mailScreen?.texture ?? null;
    for (const m of mats) {
      if (!m || !("emissiveMap" in m)) continue;
      if (mailOn && map) {
        if (m.emissiveMap !== map) {
          m.emissiveMap = map;
          m.emissive = new THREE.Color(0xffffff);
          m.needsUpdate = true;
        }
      } else if (m.emissiveMap) {
        m.emissiveMap = null;
        m.emissive = new THREE.Color(DUO_SCREEN_INSIGHT_COLOR);
        m.needsUpdate = true;
      }
    }
  }

  /**
   * @param {THREE.Object3D} mesh
   * @param {number} intensity
   */
  _setMeshEmissive(mesh, intensity) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m && "emissiveIntensity" in m) m.emissiveIntensity = intensity;
    }
  }

  /**
   * @deprecated use _applyScreenPower — kept name for call sites during fold.
   * @param {number} openish
   */
  _applyScreenEmissive(openish) {
    this._applyScreenPower(openish);
  }

  _buildHitProxy() {
    if (this.hitProxy) {
      this.pivot.remove(this.hitProxy);
      this.hitProxy.geometry?.dispose?.();
      this.hitProxy.material?.dispose?.();
      this.hitProxy = null;
    }

    if (!this.model) return;

    // Match the fixed container (max closed/open) so hover stays stable.
    const w = this._containerHalfW * 2;
    const h = this._containerHalfH * 2;
    const d = Math.max(w, h) * 0.22;
    const geom = new THREE.BoxGeometry(
      w + DUO_HIT_PAD * 2,
      h + DUO_HIT_PAD * 2,
      d + DUO_HIT_PAD * 2
    );
    const mat = new THREE.MeshBasicMaterial({
      visible: false,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.hitProxy = new THREE.Mesh(geom, mat);
    this.hitProxy.name = "duo-fab-hit";
    this.hitProxy.userData.duoFab = true;
    this.hitProxy.frustumCulled = false;
    this.hitProxy.position.set(0, 0, 0);
    this.pivot.add(this.hitProxy);
  }

  /**
   * @returns {{ left: number, top: number, width: number, height: number } | null}
   */
  _fabClientRect() {
    const mesh = this.hitProxy ?? this.armature ?? this.model;
    if (!mesh) return null;

    this.root.updateMatrixWorld(true);
    this._tmpBox.setFromObject(mesh);
    const min = this._tmpBox.min;
    const max = this._tmpBox.max;
    const xs = [min.x, max.x];
    const ys = [min.y, max.y];
    const zs = [min.z, max.z];

    const canvasRect =
      typeof this.canvas?.getBoundingClientRect === "function"
        ? this.canvas.getBoundingClientRect()
        : { left: 0, top: 0, width: this._viewW || 1, height: this._viewH || 1 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          this._ndc.set(x, y, z).project(this.hudCamera);
          const cx =
            (this._ndc.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
          const cy =
            (-this._ndc.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top;
          minX = Math.min(minX, cx);
          maxX = Math.max(maxX, cx);
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);
        }
      }
    }
    if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;
    return {
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * @param {number} foldBlend
   */
  _applyFoldVisibility(foldBlend) {
    const openish = foldBlend >= DUO_HOVER_OPEN_AT;
    this._foldPose = openish ? "open" : "closed";
  }

  /**
   * @param {'idle' | 'mail' | 'caseStudy'} next
   */
  setState(next) {
    if (this.state === next) return;
    this.state = next;
    this.onStateChange?.(next);
  }

  openMail() {
    this.setState("mail");
    this._wantHover = true;
    this._hoverTarget = 1;
    this.hovered = true;
    this._hoverEnterT = DUO_HOVER_ENTER_SEC;
    this._hoverLeaveT = 0;
  }

  /** Sync on-glass Mail projection with DOM (recapture). @param {string} [_slug] */
  setMailSelected(_slug) {
    this._mailScreen?.requestCapture?.();
  }

  /** Force a fresh capture of the live Mail overlay onto the insight screen. */
  captureMailScreen() {
    if (this.onCaptureRequest) {
      this.onCaptureRequest();
      return;
    }
    this._mailScreen?.requestCapture?.();
  }

  openCaseStudy() {
    this.setState("caseStudy");
    this._wantHover = true;
    this._hoverTarget = 1;
  }

  closeToMail() {
    this.setState("mail");
    this._wantHover = true;
    this._hoverTarget = 1;
  }

  closeToIdle() {
    this.setState("idle");
    this._wantHover = false;
    this._hoverTarget = 0;
    this.hovered = false;
    this._hoverEnterT = 0;
    this._hoverLeaveT = 0;
    this._cancelUnhoverExit();
  }

  /**
   * Raw pointer-over from Stage. Hysteresis is applied in `tick` so edge
   * flicker doesn’t twitch fold / spin.
   * @param {boolean} hovered
   */
  setHovered(hovered) {
    if (this.state !== "idle") {
      this._wantHover = true;
      return;
    }
    this._wantHover = Boolean(hovered);
  }

  /** Begin unhover teardown: text glitch → clear pulse → fold close. */
  _startUnhoverExit() {
    this._unhoverExit = true;
    this._unhoverT = 0;
    this._unhoverPulseArmed = false;
    this._unhoverCloseArmed = false;
    // Hold fold open until the close step (+200 ms).
    this._hoverTarget = 1;
    this.hovered = true;
    this._projects?.beginExitGlitch?.();
    this.onHoverChange?.(false);
  }

  /** @param {number} dt */
  _tickUnhoverExit(dt) {
    if (!this._unhoverExit) return;
    this._unhoverT += dt;
    const step = DUO_UNHOVER_STAGGER_SEC;

    if (!this._unhoverPulseArmed && this._unhoverT >= step) {
      this._unhoverPulseArmed = true;
      this._projects?.beginClearPulse?.();
    }

    if (!this._unhoverCloseArmed && this._unhoverT >= step * 2) {
      this._unhoverCloseArmed = true;
      this.hovered = false;
      this._hoverTarget = 0;
    }

    if (
      this._unhoverCloseArmed &&
      this._hoverT < 0.02 &&
      this._foldBlend < 0.08
    ) {
      this._unhoverExit = false;
      this._unhoverT = 0;
      this._unhoverPulseArmed = false;
      this._unhoverCloseArmed = false;
    }
  }

  _cancelUnhoverExit() {
    if (!this._unhoverExit) return;
    this._unhoverExit = false;
    this._unhoverT = 0;
    this._unhoverPulseArmed = false;
    this._unhoverCloseArmed = false;
    this._projects?.cancelExit?.();
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {boolean}
   */
  hitTest(clientX, clientY) {
    if (!this.ready || !this.enabled || this._entrance !== "live") return false;
    const rect = this._fabClientRect();
    if (!rect) return false;
    // Sticky leave pad while latched — graceful degradation at the hit edge.
    const pad = this.hovered ? DUO_HIT_PAD_LEAVE_PX : DUO_HIT_PAD_ENTER_PX;
    return (
      clientX >= rect.left - pad &&
      clientX <= rect.left + rect.width + pad &&
      clientY >= rect.top - pad &&
      clientY <= rect.top + rect.height + pad
    );
  }

  /**
   * @param {number} dt
   * @param {number} time
   */
  /**
   * Phase 1: rise with overshoot + fade. Pose frozen.
   * @param {number} dt
   */
  _tickEntranceRise(dt) {
    this._entranceElapsed += dt;
    const t = Math.min(1, this._entranceElapsed / Math.max(1e-3, DUO_ENTRANCE_SEC));
    const yEase = easeHeavyRise(t, DUO_ENTRANCE_OVERSHOOT, DUO_ENTRANCE_SETTLE_FRAC);
    this._entranceY = DUO_ENTRANCE_FROM_Y * (1 - yEase);
    const oT = Math.min(
      1,
      this._entranceElapsed / Math.max(1e-3, DUO_ENTRANCE_SEC * 0.4)
    );
    this._entranceOpacity = easePower2Out(oT);
    this._setEntranceOpacity(this._entranceOpacity);

    this._applyRestPose();
    this.pivot.position.set(0, this._entranceY, 0);

    if (this._entranceElapsed >= DUO_ENTRANCE_SEC - 3 / 60) {
      this._logHandoffFrame("entering");
    }

    if (t >= 1) {
      this._finishEntranceToHold();
    }
  }

  /**
   * Phase 2: frozen at rest.
   * @param {number} dt
   */
  _tickEntranceHold(dt) {
    this._idleHoldT = Math.max(0, this._idleHoldT - dt);
    this._applyRestPose();
    if (this._handoffHoldLeft > 0) {
      this._logHandoffFrame("holding");
      this._handoffHoldLeft -= 1;
    }
    if (this._idleHoldT <= 0) {
      this._finishHoldToLive();
    }
  }

  tick(dt, time) {
    if (!this.ready || this._entrance === "hidden") return;
    // Explicit-Euler idle springs blow up on hitch-sized clock deltas.
    const safeDt = Math.min(Math.max(dt, 0), DUO_TICK_DT_MAX);
    this._lastTickDt = safeDt;

    if (this._entrance === "entering") {
      this._tickEntranceRise(safeDt);
      this._logEntranceFrame("tick");
      this._emitScreenRect();
      return;
    }

    if (this._entrance === "holding") {
      this._tickEntranceHold(safeDt);
      this._emitScreenRect();
      return;
    }

    // Phase 3: bob first, then spin — staggered soft start.
    this._advanceIdleIn(safeDt);

    const isOpen = this.state !== "idle";

    // —— Hover hysteresis (enter/leave dwell) ——
    if (isOpen) {
      this._cancelUnhoverExit();
      this._wantHover = true;
      this._hoverTarget = 1;
      this.hovered = true;
      this._hoverEnterT = DUO_HOVER_ENTER_SEC;
      this._hoverLeaveT = 0;
    } else if (this._unhoverExit) {
      // Staggered teardown — re-hover cancels; otherwise advance glitch/pulse/close.
      if (this._wantHover) {
        this._cancelUnhoverExit();
        this._hoverLeaveT = 0;
        this._hoverEnterT += safeDt;
        if (!this.hovered && this._hoverEnterT >= DUO_HOVER_ENTER_SEC) {
          this.hovered = true;
          this._hoverTarget = 1;
          this.onHoverChange?.(true);
        }
      } else {
        this._tickUnhoverExit(safeDt);
      }
    } else if (this._wantHover) {
      this._hoverLeaveT = 0;
      this._hoverEnterT += safeDt;
      if (!this.hovered && this._hoverEnterT >= DUO_HOVER_ENTER_SEC) {
        this.hovered = true;
        this._hoverTarget = 1;
        this.onHoverChange?.(true);
      }
    } else {
      this._hoverEnterT = 0;
      this._hoverLeaveT += safeDt;
      if (this.hovered && this._hoverLeaveT >= DUO_HOVER_LEAVE_SEC) {
        // Holo showing → choreographed exit; else snap-close.
        if (
          !this._reducedMotion &&
          this._foldBlend >= DUO_HOLO_OPEN_AT &&
          this._holoDelayT >= DUO_HOLO_DELAY_SEC
        ) {
          this._startUnhoverExit();
        } else {
          this.hovered = false;
          this._hoverTarget = 0;
          this.onHoverChange?.(false);
        }
      }
    }

    // Seat / scale stay at idle — Mail is an overlay toggle, not a seat move.
    const openTarget = 0;
    [this._openBlend, this._openVel] = springStep(
      this._openBlend,
      this._openVel,
      openTarget,
      DUO_OPEN_STIFFNESS,
      DUO_OPEN_DAMPING,
      safeDt
    );

    // Closed path uses staggered bob/spin fades. Hover/open stops spin.
    const hovering = this.hovered || this._hoverTarget > 0.5;
    let idleOpts;
    if (hovering || isOpen) {
      const bobFade = easePower2Out(THREE.MathUtils.clamp(this._bobIn, 0, 1));
      const bobStrength = this._reducedMotion
        ? 0
        : (isOpen ? 0.35 : 1) * Math.max(bobFade, 0.35);
      idleOpts = {
        spin: 0,
        bob: bobStrength,
        wobble: 0,
        faceYaw: DUO_HOVER_FACE_YAW
      };
    } else {
      idleOpts = this._closedIdleStrengths();
    }
    const idleT0 = this._noteRig ? performance.now() : 0;
    this._idle.tick(safeDt, time, idleOpts);
    if (this._noteRig) this._noteRig("duoFab.idle", performance.now() - idleT0);

    const hoverSpeed = 1 / Math.max(0.12, DUO_HOVER_SPIN_SEC);
    if (this._hoverT < this._hoverTarget) {
      this._hoverT = Math.min(1, this._hoverT + safeDt * hoverSpeed);
    } else if (this._hoverT > this._hoverTarget) {
      this._hoverT = Math.max(0, this._hoverT - safeDt * hoverSpeed);
    }
    // Soft ease both ways — no back.out overshoot (was twitchy).
    const hoverEased = easeInOutCubic(
      THREE.MathUtils.clamp(this._hoverT, 0, 1)
    );

    const foldTarget =
      isOpen ? 1 : this._reducedMotion ? 0 : hoverEased;
    [this._foldBlend, this._foldVel] = springStep(
      this._foldBlend,
      this._foldVel,
      foldTarget,
      DUO_FOLD_STIFFNESS,
      DUO_FOLD_DAMPING,
      safeDt
    );
    const foldT0 = this._noteRig ? performance.now() : 0;
    this._scrubFold(this._foldBlend);
    this._applyFoldVisibility(this._foldBlend);
    if (this._noteRig) this._noteRig("duoFab.fold", performance.now() - foldT0);

    // Screens + hologram follow fold only (not hoverEased) so glow can’t
    // lead the unfold. Holo waits past `DUO_HOLO_OPEN_AT` + delay.
    // Unhover exit keeps the volume alive until the clear pulse wipes it.
    const foldOpen = this._foldBlend;
    const lap = (name, fn) => {
      if (!this._noteRig) return fn();
      const t0 = performance.now();
      const value = fn();
      this._noteRig(name, performance.now() - t0);
      return value;
    };
    lap("duoFab.emissive", () => this._applyScreenEmissive(foldOpen));
    if (foldOpen >= DUO_HOLO_OPEN_AT && !this._reducedMotion) {
      this._holoDelayT += safeDt;
    } else if (!this._unhoverExit) {
      this._holoDelayT = 0;
    }
    const clearAmt = this._projects?.holoClearAmount ?? 0;
    const mailOn = this.state === "mail" || this.state === "caseStudy";
    const holoGate =
      !this._reducedMotion && this._holoDelayT >= DUO_HOLO_DELAY_SEC;
    // Idle: full hologram. Mail/caseStudy: keep a soft wash on the insight
    // glass so the phone stays lit without PROJECTS / pulse (see _syncHoloSheet).
    const holoOn =
      !this._reducedMotion &&
      foldOpen >= DUO_HOLO_OPEN_AT &&
      (this._unhoverExit
        ? clearAmt < 0.98
        : this.state === "idle"
          ? holoGate
          : mailOn);
    const exteriorLit = foldOpen < DUO_HOVER_OPEN_AT;
    lap("duoFab.exterior", () => this._exterior?.tick?.(safeDt, { active: exteriorLit }));
    lap("duoFab.projects", () => {
      if (this._projects) this._projects._noteRig = this._noteRig;
      this._projects?.tick?.(safeDt, {
        active: this.state === "idle" && (holoOn || this._unhoverExit)
      });
    });
    lap("duoFab.mailScreen", () => this._mailScreen?.tick?.(safeDt, {
      active: mailOn && foldOpen >= DUO_HOVER_OPEN_AT
    }));
    lap("duoFab.holo", () => this._syncHoloSheet(holoOn));
    lap("duoFab.bloom", () => {
      this._hudBloom?.setEnabled?.(holoOn && clearAmt < 0.95);
      this._hudBloom?.setStrength?.(
        holoOn
          ? (mailOn
              ? DUO_HUD_BLOOM_STRENGTH * DUO_HUD_BLOOM_MAIL_SCALE
              : DUO_HUD_BLOOM_STRENGTH) * Math.max(0, 1 - clearAmt)
          : 0
      );
    });

    // Iso: slerp closed tip → measured open (screens +Y, bottom +Z).
    // Mail adds extra tip so the far edge rises toward the POV.
    const isoT = isOpen ? 1 : hoverEased;
    this._isoSlerp.slerpQuaternions(
      this._isoClosedQuat,
      this._isoOpenQuat,
      isoT
    );
    const mailFaceTarget = isOpen ? 1 : 0;
    [this._mailFaceT, this._mailFaceVel] = springStep(
      this._mailFaceT,
      this._mailFaceVel,
      mailFaceTarget,
      DUO_OPEN_STIFFNESS,
      DUO_OPEN_DAMPING,
      safeDt
    );
    if (this._mailFaceT > 0.001) {
      const faceAmt =
        easeInOutCubic(THREE.MathUtils.clamp(this._mailFaceT, 0, 1)) *
        DUO_ISO_MAIL_FACE;
      this._isoMailFaceQ.setFromAxisAngle(_AXIS_X, faceAmt);
      this._isoSlerp.premultiply(this._isoMailFaceQ);
    }
    this.iso.quaternion.copy(this._isoSlerp);

    const seatT0 = this._noteRig ? performance.now() : 0;
    this._applySeat(this._openBlend, { centerT: isoT, refreshSkin: true });
    if (this._noteRig) this._noteRig("duoFab.seat", performance.now() - seatT0);
    // Same pivot expression as entering (entranceY is 0 once live).
    this.pivot.position.set(this._idle.x, this._entranceY + this._idle.y, 0);
    this.pivot.rotation.set(0, 0, 0);
    // Axial yaw (spin or face-hold). No hover Z-roll — face the viewer instead.
    this.spin.position.set(0, 0, 0);
    this.spin.rotation.set(
      this._idle.pitch,
      this._idle.spinYaw,
      this._idle.roll
    );

    if (this._handoffLiveLeft > 0) {
      this._logHandoffFrame("live");
      this._handoffLiveLeft -= 1;
    }

    const rectT0 = this._noteRig ? performance.now() : 0;
    this._emitScreenRect();
    if (this._noteRig) this._noteRig("duoFab.screenRect", performance.now() - rectT0);
  }

  /**
   * @param {THREE.WebGLRenderer} renderer
   */
  render(renderer) {
    if (!this.ready || !renderer || this._entrance === "hidden") return;
    try {
      if (!this._hudBloom) {
        this._hudBloom = new DuoHudBloom(renderer, {
          strength: DUO_HUD_BLOOM_STRENGTH,
          radius: DUO_HUD_BLOOM_RADIUS,
          threshold: DUO_HUD_BLOOM_THRESHOLD,
          resolutionScale: DUO_HUD_BLOOM_RES_SCALE
        });
        const size = new THREE.Vector2();
        renderer.getSize(size);
        this._hudBloom.setSize(size.x, size.y);
      }

      const prevAutoClear = renderer.autoClear;
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.clearDepth();
      // Solid HUD first (phone body + screens).
      renderer.render(this.hudScene, this.hudCamera);
      // Then additive bloom glow when insight hologram is lit.
      if (this._holoOpen && this._hudBloom) {
        this._hudBloom.render(this.hudScene, this.hudCamera);
      }

      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget);
    } catch (err) {
      if (!this._renderWarned) {
        this._renderWarned = true;
        console.warn("[DuoFab] HUD render failed:", err);
      }
    }
  }

  /**
   * Seat `root` so the fixed container’s bottom-right sits
   * `DUO_SCREEN_MARGIN_PX` inside the canvas. Size on `model.scale`
   * (= fit × idle × entrance). `pop` keeps the visual center on the
   * container origin for both closed and open poses.
   * Never scale `pop`/`root` — ancestors outside the skeleton collapse skins.
   * @param {number} openBlend
   * @param {{ refreshSkin?: boolean, centerT?: number }} [opts]
   */
  _applySeat(openBlend, opts = {}) {
    const refreshSkin = opts.refreshSkin !== false;
    const aspect = this._aspect || 1;
    const viewW = Math.max(1, this._viewW || 1);
    const viewH = Math.max(1, this._viewH || 1);
    const margin = DUO_SCREEN_MARGIN_PX;

    // HUD meters → CSS px (ortho: Y ±1 → viewH, X ±aspect → viewW).
    const pxPerHudX = viewW / (2 * aspect);
    const pxPerHudY = viewH / 2;
    const containerWpx = Math.max(1, this._containerHalfW * 2 * pxPerHudX);
    const containerHpx = Math.max(1, this._containerHalfH * 2 * pxPerHudY);

    // Container bottom-right inset by margin; Duo center = container center.
    const cx = viewW - margin - containerWpx * 0.5;
    const cy = viewH - margin - containerHpx * 0.5;
    const x = (cx / viewW) * 2 * aspect - aspect;
    const y = 1 - (cy / viewH) * 2;

    this.root.position.set(x, y, DUO_SEAT_Z);
    this.root.scale.setScalar(1);
    this.pop.scale.setScalar(1);

    // Shared scale for closed + open (container does not resize on hover).
    void openBlend;
    const seat = DUO_IDLE_SCALE * Math.max(1e-3, this._entranceScale);
    if (this.model) {
      const s = this._fitScale * seat;
      this.model.scale.setScalar(s);
      // Scale around COM — without this, seat/entrance scale turns spin into orbit.
      this.model.position.set(
        -this._comLocal.x * s,
        -this._comLocal.y * s,
        -this._comLocal.z * s
      );
    }

    const centerT =
      opts.centerT != null
        ? opts.centerT
        : THREE.MathUtils.clamp(this._hoverT ?? 0, 0, 1);
    this._lastCenterT = centerT;
    this._applyContainerCenter(centerT);

    this.root.updateMatrixWorld(true);
    if (refreshSkin) this._refreshSkin();
  }

  _emitScreenRect() {
    if (!this.getScreenRect) return;
    if (this._entrance === "hidden") {
      this._publishScreenRect(null);
      return;
    }

    const useScreen =
      this.state !== "idle" || this._foldBlend >= DUO_HOVER_OPEN_AT;
    if (useScreen && this.primaryScreen) {
      this.root.updateMatrixWorld(true);
      const canvasRect = this._canvasRect || (this._canvasRect = {
        left: 0,
        top: 0,
        width: 1,
        height: 1
      });
      if (typeof this.canvas?.getBoundingClientRect === "function") {
        const live = this.canvas.getBoundingClientRect();
        canvasRect.left = live.left;
        canvasRect.top = live.top;
        canvasRect.width = live.width;
        canvasRect.height = live.height;
      } else {
        canvasRect.left = 0;
        canvasRect.top = 0;
        canvasRect.width = this._viewW || 1;
        canvasRect.height = this._viewH || 1;
      }
      const face = this._projectInsightFaceCorners(canvasRect);
      if (face) {
        this._publishScreenRect(face);
        return;
      }
      // Fallback: projected AABB of the screen mesh.
      this._tmpBox.setFromObject(this.primaryScreen);
      const min = this._tmpBox.min;
      const max = this._tmpBox.max;
      const xs = [min.x, max.x];
      const ys = [min.y, max.y];
      const zs = [min.z, max.z];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const x of xs) {
        for (const y of ys) {
          for (const z of zs) {
            this._ndc.set(x, y, z).project(this.hudCamera);
            const cx =
              (this._ndc.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
            const cy =
              (-this._ndc.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top;
            minX = Math.min(minX, cx);
            maxX = Math.max(maxX, cx);
            minY = Math.min(minY, cy);
            maxY = Math.max(maxY, cy);
          }
        }
      }
      if (Number.isFinite(minX) && maxX > minX && maxY > minY) {
        this._publishAabb(
          minX,
          minY,
          Math.max(40, maxX - minX),
          Math.max(60, maxY - minY)
        );
        return;
      }
    }

    const fab = this._fabClientRect();
    if (!fab) {
      this._publishScreenRect(null);
      return;
    }
    this._publishAabb(
      fab.left,
      fab.top,
      Math.max(40, fab.width),
      Math.max(60, fab.height)
    );
  }

  _publishAabb(left, top, width, height) {
    const rect = this._aabbPayload || (this._aabbPayload = {
      left: 0,
      top: 0,
      width: 0,
      height: 0
    });
    rect.left = left;
    rect.top = top;
    rect.width = width;
    rect.height = height;
    this._publishScreenRect(rect);
  }

  _publishScreenRect(rect) {
    if (!this.getScreenRect) return;
    if (!rect) {
      if (this._screenRectNull) return;
      this._screenRectNull = true;
      this.getScreenRect(null);
      return;
    }
    const prev = this._screenRectSent;
    const corners = rect.corners;
    const hasCorners = Array.isArray(corners) && corners.length === 4;
    if (
      prev &&
      !this._screenRectNull &&
      Math.abs(prev.left - rect.left) < 0.5 &&
      Math.abs(prev.top - rect.top) < 0.5 &&
      Math.abs(prev.width - rect.width) < 0.5 &&
      Math.abs(prev.height - rect.height) < 0.5 &&
      prev.hasCorners === hasCorners &&
      (!hasCorners || cornersWithin(prev.corners, corners, 0.5))
    ) {
      return;
    }
    const sent = prev || (this._screenRectSent = {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      hasCorners: false,
      corners: [[0, 0], [0, 0], [0, 0], [0, 0]]
    });
    sent.left = rect.left;
    sent.top = rect.top;
    sent.width = rect.width;
    sent.height = rect.height;
    sent.hasCorners = hasCorners;
    if (hasCorners) {
      for (let i = 0; i < 4; i += 1) {
        sent.corners[i][0] = corners[i][0];
        sent.corners[i][1] = corners[i][1];
      }
    }
    this._screenRectNull = false;
    this.getScreenRect(rect);
  }

  _pushSample(out) {
    const pool = this._samplePool || (this._samplePool = []);
    const index = out.length;
    let vec = pool[index];
    if (!vec) {
      vec = new THREE.Vector3();
      pool[index] = vec;
    }
    vec.copy(_V);
    out.push(vec);
  }

  /**
   * Collect world-space samples from insight screen (skinned preferred).
   * @param {THREE.Object3D} insight
   * @param {THREE.Vector3[]} out
   * @returns {"skinned" | "static" | "aabb" | null}
   */
  _sampleInsightWorldPoints(insight, out) {
    out.length = 0;
    const seen = this._sampleSeen || (this._sampleSeen = new Set());
    seen.clear();
    let source = null;
    const pushSkinned = (mesh) => {
      if (
        !mesh?.isSkinnedMesh ||
        seen.has(mesh) ||
        typeof mesh.getVertexPosition !== "function"
      ) {
        return;
      }
      seen.add(mesh);
      const pos = mesh.geometry?.attributes?.position;
      if (!pos || pos.count < 3) return;
      const step = Math.max(1, Math.floor(pos.count / 500));
      for (let i = 0; i < pos.count; i += step) {
        mesh.getVertexPosition(i, _V);
        mesh.localToWorld(_V);
        if (!Number.isFinite(_V.x)) continue;
        this._pushSample(out);
      }
      if (out.length >= 4) source = "skinned";
    };
    insight.traverse((o) => {
      if (o.isSkinnedMesh) pushSkinned(o);
    });
    if (source) return source;

    const pushStatic = (mesh) => {
      if (!mesh?.isMesh || mesh.isSkinnedMesh || seen.has(mesh)) return;
      seen.add(mesh);
      const pos = mesh.geometry?.attributes?.position;
      if (!pos || pos.count < 3) return;
      mesh.updateWorldMatrix(true, false);
      const step = Math.max(1, Math.floor(pos.count / 500));
      for (let i = 0; i < pos.count; i += step) {
        _V.fromBufferAttribute(pos, i);
        mesh.localToWorld(_V);
        if (!Number.isFinite(_V.x)) continue;
        this._pushSample(out);
      }
      if (out.length >= 4) source = "static";
    };
    insight.traverse((o) => {
      if (o.isMesh) pushStatic(o);
    });
    if (source) return source;

    this._tmpBox.setFromObject(insight);
    if (this._tmpBox.isEmpty()) return null;
    const min = this._tmpBox.min;
    const max = this._tmpBox.max;
    for (let xi = 0; xi < 2; xi += 1) {
      for (let yi = 0; yi < 2; yi += 1) {
        for (let zi = 0; zi < 2; zi += 1) {
          _V.set(xi ? max.x : min.x, yi ? max.y : min.y, zi ? max.z : min.z);
          this._pushSample(out);
        }
      }
    }
    return out.length >= 4 ? "aabb" : null;
  }

  /**
   * Project insight face TL/TR/BR/BL into client pixels for hologram beams.
   * Corners are the skinned face-plane extents (not world-AABB half-sizes applied
   * along an arbitrary basis — that drew a blob around the phone).
   * @param {DOMRect} canvasRect
   * @returns {{ left: number, top: number, width: number, height: number, corners: [number, number][], measure: string, normal: number[] } | null}
   */
  _projectInsightFaceCorners(canvasRect) {
    const insight = this.insightScreens[0] ?? this.primaryScreen;
    if (!insight) return null;

    /** @type {THREE.Vector3[]} */
    const samples = this._insightSampleBuf ?? (this._insightSampleBuf = []);
    const sampleT0 = this._noteRig ? performance.now() : 0;
    const measure = this._sampleInsightWorldPoints(insight, samples);
    if (this._noteRig) this._noteRig("duoFab.sampleFace", performance.now() - sampleT0);
    if (!measure) return null;

    const center = _CENTER.set(0, 0, 0);
    for (const p of samples) center.add(p);
    center.multiplyScalar(1 / samples.length);

    insight.getWorldQuaternion(_Q);
    const normal = _NORMAL.set(0, 0, 1).applyQuaternion(_Q).normalize();
    _V2.copy(this.hudCamera.position).sub(center);
    if (_V2.dot(normal) < 0) normal.negate();

    // Face basis: prefer mesh local +Y as "up" when it lies in the face plane.
    _V2.copy(_AXIS_Y).applyQuaternion(_Q).normalize();
    if (Math.abs(_V2.dot(normal)) > 0.92) {
      _V2.copy(_AXIS_X).applyQuaternion(_Q).normalize();
    }
    // Remove normal component so up lies in the face plane.
    _V2.addScaledVector(normal, -_V2.dot(normal)).normalize();
    if (_V2.lengthSq() < 1e-8) {
      _V2.copy(_AXIS_Y);
      if (Math.abs(normal.dot(_V2)) > 0.92) _V2.copy(_AXIS_X);
      _V2.addScaledVector(normal, -_V2.dot(normal)).normalize();
    }
    _V3.crossVectors(_V2, normal).normalize(); // right
    _V2.crossVectors(normal, _V3).normalize(); // up (re-orthonormalize)

    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of samples) {
      _V.copy(p).sub(center);
      const u = _V.dot(_V3);
      const v = _V.dot(_V2);
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    if (!(maxU > minU) || !(maxV > minV)) return null;

    // Re-center on face UV mid so TL/TR/BR/BL sit on the screen rectangle.
    const midU = (minU + maxU) * 0.5;
    const midV = (minV + maxV) * 0.5;
    center.addScaledVector(_V3, midU).addScaledVector(_V2, midV);
    minU -= midU;
    maxU -= midU;
    minV -= midV;
    maxV -= midV;

    // TL, TR, BR, BL in world (face plane)
    this._screenCorners[0]
      .copy(center)
      .addScaledVector(_V3, minU)
      .addScaledVector(_V2, maxV);
    this._screenCorners[1]
      .copy(center)
      .addScaledVector(_V3, maxU)
      .addScaledVector(_V2, maxV);
    this._screenCorners[2]
      .copy(center)
      .addScaledVector(_V3, maxU)
      .addScaledVector(_V2, minV);
    this._screenCorners[3]
      .copy(center)
      .addScaledVector(_V3, minU)
      .addScaledVector(_V2, minV);

    const raw = this._rawClientCorners || (this._rawClientCorners = [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0]
    ]);
    for (let i = 0; i < 4; i++) {
      this._ndc.copy(this._screenCorners[i]).project(this.hudCamera);
      const cx =
        (this._ndc.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
      const cy =
        (-this._ndc.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top;
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
      raw[i][0] = cx;
      raw[i][1] = cy;
    }

    const corners = this._orderedClientCorners || (this._orderedClientCorners = [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0]
    ]);
    orderClientQuadInto(raw, corners);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [cx, cy] of corners) {
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);
    }
    if (!(maxX > minX && maxY > minY)) return null;

    const result = this._facePayload || (this._facePayload = {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      corners: null,
      measure: "",
      normal: [0, 0, 0]
    });
    result.left = minX;
    result.top = minY;
    result.width = Math.max(40, maxX - minX);
    result.height = Math.max(60, maxY - minY);
    result.corners = corners;
    result.measure = measure;
    result.normal[0] = normal.x;
    result.normal[1] = normal.y;
    result.normal[2] = normal.z;
    this._lastFaceCorners = result;
    return result;
  }

  dispose() {
    this._entranceTween?.kill?.();
    this._entranceTween = null;
    this._mq?.removeEventListener?.("change", this._onMq);
    this._mixer?.stopAllAction();
    this._mixer = null;
    this._foldAction = null;
    this._projects?.dispose?.();
    this._projects = null;
    this._mailScreen?.dispose?.();
    this._mailScreen = null;
    this._exterior?.dispose?.();
    this._exterior = null;
    this._hudBloom?.dispose?.();
    this._hudBloom = null;
    this._disposeHoloSheet();
    this.hudScene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m?.dispose?.());
      }
    });
  }
}
