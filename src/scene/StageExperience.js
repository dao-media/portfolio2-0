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
  PARALLAX_LOOK_X,
  PARALLAX_LOOK_Y,
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
  PARALLAX_CAPTURE_IN,
  PARALLAX_CAPTURE_OUT,
  PARALLAX_FOLLOW,
  PARALLAX_FOLLOW_SETTLING,
  PARALLAX_POST_TRANSITION_FOLLOW,
  PARALLAX_POST_TRANSITION_MS,
  VIGOROUS_SCROLL_MS,
  TRANSITION_DURATION,
  TRANSITION_VIGOROUS_SPEED,
  vignetteAnchorRotation,
  vignetteStageDegrees,
  rotationDeltaToAnchor,
  placeOnStage,
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
import { STAGE_FLOOR_Y, measureBlockoutReferenceBounds, measureSceneBounds, snapAllGroupsToFloor, snapGroupToFloor } from "./vignettes/pcSceneBlockout.js";
import { WaterCursor } from "../cursor/WaterCursor.js";

/** Vertical drop into the resting POV — stage stays fixed; camera only translates on Y. */
const INTRO_DESCENT = 11;

/** Ease-out cubic — faster start, soft settle at the resting POV. */
function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

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
    this.introRig = { descent: INTRO_DESCENT };
    this._introStartedAt = 0;
    this._introDuration = this.reducedMotion ? 600 : 2400;
    this._pendingFloorSnap = false;
    this._lastImpulseAt = 0;
    this._lastImpulseDir = 0;
    this._wheelGestureOpen = true;
    this._wheelIdleTimer = 0;
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
    this._focusTween = null;
    /** True while desktop monitor dolly-in is running — parallax stays off. */
    this._focusDollyIn = false;
    this.captureBlend = 0;
    this._captureBlendTarget = false;
    this._captureBlendTween = null;
    /** Parallax offset frozen when the pointer enters a no-scroll zone. */
    this._parallaxLock = { x: 0, y: 0 };
    /** 0 = follow cursor; 1 = locked at _parallaxLock (realtime eased). */
    this.parallaxInfluence = 0;
    this._parallaxInfluenceTarget = 0;
    this._lastPointer = {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.5
    };
    this._transitionParallaxFrom = null;
    this._parallaxSettleUntil = 0;

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
    this._cacheIntroRestRotation();
    this._setActiveVignette(0);
    this._runIntro();

    window.addEventListener("resize", this._onResize);
    this._onResize();
    this.clock = new THREE.Clock();
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
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
   * POV spotlight — rigid rig on the camera (above the head, fixed aim in camera space).
   * Vignettes rotate into the pool; the beam must not drift during transitions.
   */
  _mountPovSpotlight() {
    this.camera.updateMatrixWorld(true);
    _SPOT_AIM_LOCAL.copy(LOOK);
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

  /** Dev helper — Sidekick anchor + motion state (run while settled or moving the cursor). */
  debugSidekick() {
    const sidekick = this.vignettes[2]?.instance;
    return {
      current: this.current,
      focusBlend: this.focusBlend,
      parallax: { ...this.parallax },
      parallaxLock: { ...this._parallaxLock },
      transitioning: Boolean(this._transitionTl),
      anchorsReady: sidekick?._anchorsReady ?? false,
      sidekick: sidekick?.debugAnchors?.() ?? null
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

  _finishIntro() {
    if (this.introComplete) return;
    this.introRig.descent = 0;
    this.introComplete = true;
    requestAnimationFrame(() => {
      void this._releaseIntroDeferredWork();
    });
  }

  /** Heavy vignette + env work — runs only after the camera descent finishes. */
  async _releaseIntroDeferredWork() {
    await Promise.all(
      this.vignettes.map((vig) => vig.instance?.integrateAfterIntro?.() ?? null)
    );

    if (this._pendingFloorSnap) {
      this._snapAllVignettesToFloor(true);
    }

    this._bakeSidekickAnchors();

    this._flushIntroDeferredWork();
  }

  /** One-shot updates deferred until the entrance settles. */
  _flushIntroDeferredWork() {
    this.liveEnv.update(null, this.liveEnv.position, { applyToScene: false });

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

  _tickIntro() {
    if (this.introComplete || !this._introStartedAt) return;

    const linear = Math.min(1, (performance.now() - this._introStartedAt) / this._introDuration);
    const eased = easeOutCubic(linear);
    this.introRig.descent = INTRO_DESCENT * (1 - eased);

    if (linear >= 1) {
      this._finishIntro();
    }
  }

  /** Lock the resting look direction so intro is a straight vertical drop, not a re-aim each frame. */
  _cacheIntroRestRotation() {
    this.camera.position.set(CAM_REST_OFFSET_X, CAM_Y, CAM_Z + CAM_REST_BACK);
    this.camera.lookAt(LOOK);
    this._introRestQuat.copy(this.camera.quaternion);
    if (!this.spotLight) {
      this._mountPovSpotlight();
    }
    this._applyIntroCamera();
  }

  /** Fixed stage — only the camera descends into the resting POV. */
  _applyIntroCamera() {
    this.camera.position.set(
      CAM_REST_OFFSET_X,
      CAM_Y + this.introRig.descent,
      CAM_Z + CAM_REST_BACK
    );
    this.camera.quaternion.copy(this._introRestQuat);
  }

  /**
   * Post-intro camera must match the locked intro settle pose when parallax/focus are idle —
   * regenerating lookAt every frame would fight the intro rest quaternion and nudge the spotlight.
   */
  _restingCameraMatchesIntro() {
    return (
      this.focusBlend < 0.001 &&
      Math.abs(this.parallax.x) < 0.0005 &&
      Math.abs(this.parallax.y) < 0.0005
    );
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
              this._bakeSidekickAnchors();
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

  /** Zero parallax so viewport anchors match the resting POV (parallax would drift framing). */
  _zeroParallaxForSidekickBake() {
    return {
      x: this.parallax.x,
      y: this.parallax.y,
      tx: this.parallax.tx,
      ty: this.parallax.ty,
      lockX: this._parallaxLock.x,
      lockY: this._parallaxLock.y
    };
  }

  _restoreParallaxAfterSidekickBake(saved) {
    this.parallax.x = saved.x;
    this.parallax.y = saved.y;
    this.parallax.tx = saved.tx;
    this.parallax.ty = saved.ty;
    this._parallaxLock.x = saved.lockX;
    this._parallaxLock.y = saved.lockY;
  }

  /** Snap cursor parallax off on the Sidekick stop — mesh anchors assume a fixed POV. */
  _freezeParallaxForSidekickStop() {
    this.parallax.x = 0;
    this.parallax.y = 0;
    this.parallax.tx = 0;
    this.parallax.ty = 0;
    this._parallaxLock.x = 0;
    this._parallaxLock.y = 0;
  }

  /** Bake Sidekick rest/focus anchors while the stage faces the 240° stop. */
  _bakeSidekickAnchors(force = false) {
    const sidekick = this.vignettes[2]?.instance;
    if (!sidekick?.bakeAnchors || (!force && sidekick._anchorsReady)) return false;
    if (!sidekick._aligned) return false;

    if (force) {
      sidekick.invalidateAnchors?.();
    }

    const savedRotation = this.world.rotation.y;
    const savedParallax = this._zeroParallaxForSidekickBake();

    this.parallax.x = 0;
    this.parallax.y = 0;
    this.parallax.tx = 0;
    this.parallax.ty = 0;
    this._parallaxLock.x = 0;
    this._parallaxLock.y = 0;

    this.world.rotation.y = sanitizeWorldRotation(this._anchorY(2));
    this.world.updateMatrixWorld(true);
    this._applyCameraPose();

    const baked = sidekick.bakeAnchors(this.camera);

    this.world.rotation.y = savedRotation;
    this.world.updateMatrixWorld(true);
    this._restoreParallaxAfterSidekickBake(savedParallax);
    this._applyCameraPose();

    if (baked) {
      sidekick.update?.(0);
    }

    return baked;
  }

  _setActiveVignette(index) {
    this.vignettes[this.current]?.instance?.setInactive?.();
    this.current = index;
    this.vignettes[this.current]?.instance?.setActive?.();
    if (index === 2) {
      this._freezeParallaxForSidekickStop();
      if (!this.vignettes[2]?.instance?._anchorsReady) {
        this._bakeSidekickAnchors();
      }
    }
    this._updatePlaceholderVisibility(index);
    this.hud.updateMySpacePanelForVignette(index);
  }

  /** Ease out of interactive/focused state when the turntable starts moving. */
  _prepareForVignetteTransition(fromIndex) {
    this._focusTween?.kill();
    this._focusTween = null;
    this._focusDollyIn = false;
    this.focusBlend = 0;

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
    this.focusBlend = 0;
  }

  /** Zero parallax during monitor dolly-in so the camera doesn't fight the focus tween. */
  _freezeParallaxForFocusIn() {
    this._captureBlendTween?.kill();
    this._captureBlendTween = null;
    this._captureBlendTarget = false;
    this.captureBlend = 0;
    this.parallaxInfluence = 0;
    this._parallaxInfluenceTarget = 0;
    this.parallax.x = 0;
    this.parallax.y = 0;
    this.parallax.tx = 0;
    this.parallax.ty = 0;
    this._parallaxLock.x = 0;
    this._parallaxLock.y = 0;
  }

  _focusVignette() {
    if (this.reducedMotion) {
      this.focusBlend = 1;
      this._onVignetteFocusComplete();
      return;
    }
    this._focusTween?.kill();
    this._focusDollyIn = true;
    this._freezeParallaxForFocusIn();
    this._focusTween = gsap.to(this, {
      focusBlend: 1,
      duration: 0.62,
      ease: "power3.out",
      overwrite: true,
      onComplete: () => {
        this._focusTween = null;
        this._onVignetteFocusComplete();
      }
    });
  }

  _onVignetteFocusComplete() {
    this._focusDollyIn = false;
    this._tryStartDesktopBoot();
  }

  /** Start XP boot once the desktop monitor is zoomed — idempotent. */
  _tryStartDesktopBoot() {
    if (this.current !== 1 || this.focusBlend <= 0.85) return;
    const mySpace = this.hud.getMySpaceScreen();
    if (!mySpace) return;

    if (mySpace.xpBoot?.canStartBoot) {
      void this._getDesktopInstance()?.playPowerOn?.();
      return;
    }

    if (mySpace.isPoweredOn) {
      mySpace.draw();
    }
  }

  _unfocusVignette() {
    if (this.reducedMotion) {
      this.focusBlend = 0;
      return;
    }
    this._focusTween?.kill();
    this._focusTween = gsap.to(this, {
      focusBlend: 0,
      duration: 0.72,
      ease: "power3.inOut",
      overwrite: true,
      onComplete: () => {
        this._focusTween = null;
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
    if (!force && (this.reducedMotion || this.parallaxInfluence > 0.02)) return;
    this._refreshParallaxTarget();
    if (force) {
      this.parallax.x = this.parallax.tx;
      this.parallax.y = this.parallax.ty;
    }
  }

  _onVignetteTransitionComplete(target) {
    this._snapToVignette(target);
    this._setCaption(target);
    this._setActiveVignette(target);
    this._updateHoverFromClient(this._lastPointer.x, this._lastPointer.y);
    if (target !== 2) {
      this._parallaxLock.x = this.parallax.x;
      this._parallaxLock.y = this.parallax.y;
    }
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
  }

  goTo(target, dirHint, options = {}) {
    const vigorous = options.vigorous ?? false;
    const n = this.vignettes.length;

    if (this._transitionTl) {
      this._killActiveTransition(vigorous);
    }

    if (target === this.current) return;

    const fromIndex = this.current;

    const fromY = this.world.rotation.y;
    const anchorY = this._anchorY(target);
    const delta = rotationDeltaToAnchor(fromY, anchorY, dirHint);
    const toY = fromY + delta;

    const profile = this._transitionProfile(vigorous);
    this._prepareForVignetteTransition(fromIndex);

    this.locked = true;
    this._animTarget = target;
    this._transitionFromIndex = fromIndex;
    this._transitionRotFrom = fromY;
    this._transitionRotTo = toY;
    this._transition.progress = 0;
    if (!this.reducedMotion) {
      this._transitionParallaxFrom = { x: this.parallax.x, y: this.parallax.y };
    } else {
      this._transitionParallaxFrom = null;
    }

    if (this.ui.caption) this.ui.caption.style.opacity = "0";

    const tl = gsap.timeline({
      onComplete: () => {
        this._onVignetteTransitionComplete(target);
      }
    });

    this._transitionTl = tl;

    tl.to(
      this._transition,
      {
        progress: 1,
        duration: profile.duration,
        ease: profile.ease,
        onUpdate: () => {
          const t = finite(this._transition.progress, 0);
          this.world.rotation.y = fromY + (toY - fromY) * t;
        }
      },
      0
    );
  }

  /**
   * @param {number} steps Signed step count (+1 next, -1 prev).
   * @param {{ vigorous?: boolean }} [options]
   */
  advance(steps, options = {}) {
    if (!steps) return;
    const n = this.vignettes.length;
    const dir = Math.sign(steps);
    const target = (this.current + dir + n * 32) % n;
    this.goTo(target, dir, options);
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
          this._resetScrollIntent();
          return;
        }

        if (this.scrollCapture.activeDomKey) {
          event.preventDefault();
          const target = document.elementFromPoint(event.clientX, event.clientY);
          const viewport = target?.closest(".ms-viewport");
          if (viewport) {
            viewport.scrollTop += normalizeWheelDelta(event);
          }
          this._resetScrollIntent();
          return;
        }
      }

      const stageWeight = 1 - smoothstep(0, SCROLL_CAPTURE_WHEEL_OFF, blend);
      if (stageWeight <= 0.02) {
        if (blend > 0.02) event.preventDefault();
        return;
      }

      const delta = normalizeWheelDelta(event) * stageWeight;
      if (Math.abs(delta) < WHEEL_MIN_DELTA) return;

      event.preventDefault();

      if (!this._wheelGestureOpen) {
        this._extendWheelGestureIdle();
        return;
      }

      const now = performance.now();
      const dir = delta > 0 ? 1 : -1;
      const vigorous = this._isVigorousScroll(now);
      this._consumeWheelGesture();
      this._registerScrollImpulse(dir, { vigorous });
    };

    window.addEventListener("wheel", this._onWheel, { passive: false });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.focusBlend > 0.02) {
        this._unfocusVignette();
        this.vignettes[2]?.instance?.playSlideClose?.();
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
      },
      { passive: true }
    );

    this.canvas.addEventListener("pointerdown", this._onPointerDown, { capture: true });
    this.canvas.addEventListener("pointerup", this._onPointerUp, { capture: true });
    this.canvas.addEventListener("pointerleave", this._onPointerLeave, { capture: true });
  }

  _getCanvasRect() {
    return this.canvas.getBoundingClientRect();
  }

  _parallaxTargetFromClient(clientX, clientY) {
    const rect = this._getCanvasRect();
    return parallaxTargetFromClient(clientX, clientY, rect);
  }

  /** Ease wheel authority when entering/leaving scroll-capture zones; parallax uses parallaxInfluence. */
  _setScrollCaptureBlendTarget(active) {
    if (active === this._captureBlendTarget) return;
    this._captureBlendTarget = active;
    this._parallaxInfluenceTarget = active ? 1 : 0;

    if (this.reducedMotion) {
      this.captureBlend = active ? 1 : 0;
      this.parallaxInfluence = active ? 1 : 0;
      if (active) {
        this._parallaxLock.x = this.parallax.x;
        this._parallaxLock.y = this.parallax.y;
      }
      return;
    }

    if (active) {
      this._parallaxLock.x = this.parallax.x;
      this._parallaxLock.y = this.parallax.y;
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
      const sidekickOpen = Boolean(this.vignettes[2]?.instance?.isOpen);
      if (!this.waterCursor) {
        const cursorMode = hovering
          ? "pointer"
          : this._pcScreenHovered
            ? this.focusBlend > 0.02
              ? "pointer"
              : "zoom-in"
            : onSidekick
              ? sidekickOpen || this.focusBlend > 0.02
                ? "pointer"
                : "zoom-in"
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

    this._setScrollCaptureBlendTarget(this.scrollCapture.isActive);

    return meshTarget ?? null;
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
    return THREE.MathUtils.euclideanModulo(
      THREE.MathUtils.radToDeg(-this.world.rotation.y),
      360
    );
  }

  _applyCameraPose() {
    this._sanitizeMotionState();

    const sidekick = this.vignettes[2]?.instance;
    const sidekickOwnsFocus =
      this.current === 2 && (this.focusBlend > 0.02 || sidekick?.isOpen || sidekick?._swivelTween);
    const focus = sidekickOwnsFocus
      ? 0
      : THREE.MathUtils.clamp(this.focusBlend, 0, 1);
    const restX = CAM_REST_OFFSET_X * (1 - focus);
    const restZ = CAM_REST_BACK * (1 - focus);
    const pullback = this._getTransitionPullback();

    if (
      !this._focusDollyIn &&
      this._restingCameraMatchesIntro() &&
      pullback < 1e-6 &&
      focus < 0.001
    ) {
      this.camera.position.set(CAM_REST_OFFSET_X, CAM_Y, CAM_Z + CAM_REST_BACK);
      this.camera.quaternion.copy(this._introRestQuat);
      return;
    }

    const parallaxX = this._focusDollyIn ? 0 : this.parallax.x;
    const parallaxY = this._focusDollyIn ? 0 : this.parallax.y;

    if (!this.reducedMotion) {
      this.camera.position.x = restX + parallaxX * PARALLAX_CAM_X;
      this.camera.position.y = CAM_Y + parallaxY * PARALLAX_CAM_Y;
      this.camera.position.z = CAM_Z + restZ + pullback;
      this.camera.lookAt(
        LOOK.x + parallaxX * PARALLAX_LOOK_X,
        LOOK.y + parallaxY * PARALLAX_LOOK_Y,
        LOOK.z
      );
      sanitizeCameraPose(this.camera, LOOK);
      return;
    }

    this.camera.position.set(restX, CAM_Y, CAM_Z + restZ + pullback);
    this.camera.lookAt(LOOK);
    sanitizeCameraPose(this.camera, LOOK);
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
    if (this.locked) return;
    this._updateHoverFromClient(event.clientX, event.clientY);

    const onSidekick =
      this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.sidekick;
    const sidekick = this.vignettes[2]?.instance;
    const sidekickFocused = Boolean(sidekick?.isOpen || sidekick?._swivelTween);
    const onDesktop =
      this.scrollCapture.activeMeshId === SCROLL_CAPTURE_MESH_IDS.finalPcScreen;

    if (onSidekick && (this.focusBlend > 0.02 || sidekickFocused)) {
      this._unfocusVignette();
      this.vignettes[2]?.instance?.playSlideClose?.();
      event.stopImmediatePropagation();
      return;
    }

    if (onDesktop && this.focusBlend > 0.02) {
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
      // Clicks on the screen stay in-screen (blog posts, etc.) — unfocus only outside.
      event.stopImmediatePropagation();
      return;
    }

    if (this.scrollCapture.handlePointerDown()) {
      this.waterCursor?.setPressed(true);
      if (onSidekick) {
        event.stopImmediatePropagation();
        return;
      }
      if (this.focusBlend < 0.98) {
        this._focusVignette();
      } else if (onDesktop) {
        this._tryStartDesktopBoot();
      }
      event.stopImmediatePropagation();
      return;
    }

    if (this.focusBlend > 0.02) {
      this._unfocusVignette();
      this.vignettes[2]?.instance?.playSlideClose?.();
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
      locked: this.locked,
      current: this.current,
      sidekickAnchors: this.vignettes[2]?.instance?.debugAnchors?.(),
      transitionProgress: this._transition?.progress ?? 0,
      wheelGestureOpen: this._wheelGestureOpen
    };
  }

  _runIntro() {
    requestAnimationFrame(() => {
      window.setTimeout(() => this.ui.fader?.classList.add("gone"), 80);
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
      this.vignettes[2]?.instance?.invalidateAnchors?.();
      this._bakeSidekickAnchors(true);
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

  _animate() {
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;

    const desktop = this.vignettes[1]?.instance;
    if (this.introComplete) {
      desktop?._ensurePowerLed?.();
      desktop?.powerLed?.update(t);
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

    if (!this.introComplete) {
      if (this._introStartedAt === 0) {
        this._introStartedAt = performance.now();
      }
      this._tickIntro();
      this._applyIntroCamera();
    } else {
      if (!this.reducedMotion) {
        const { tx, ty } = this._parallaxTargetFromClient(this._lastPointer.x, this._lastPointer.y);
        this.parallax.tx = tx;
        this.parallax.ty = ty;

        const infTarget = this._parallaxInfluenceTarget;
        const infEase = infTarget > this.parallaxInfluence ? PARALLAX_CAPTURE_IN : PARALLAX_CAPTURE_OUT;
        if (!this._transitionTl && !this._focusDollyIn) {
          this.parallaxInfluence += (infTarget - this.parallaxInfluence) * infEase;
        }

        const inf = this.parallaxInfluence;
        const lock = this._parallaxLock;
        let desiredX = tx * (1 - inf) + lock.x * inf;
        let desiredY = ty * (1 - inf) + lock.y * inf;

        const sidekickStop = this.current === 2 && !this._transitionTl;

        if (this._focusDollyIn) {
          desiredX = 0;
          desiredY = 0;
        } else if (sidekickStop) {
          desiredX = 0;
          desiredY = 0;
        }

        if (this._transitionTl && this._transitionParallaxFrom) {
          desiredX = this._transitionParallaxFrom.x;
          desiredY = this._transitionParallaxFrom.y;
        }

        const postTransitionSettle = performance.now() < this._parallaxSettleUntil;
        const infSettling = Math.abs(infTarget - inf) > 0.015;
        let follow = infSettling ? PARALLAX_FOLLOW_SETTLING : PARALLAX_FOLLOW;
        if (postTransitionSettle) follow = PARALLAX_POST_TRANSITION_FOLLOW;

        if (this._focusDollyIn || sidekickStop) {
          this.parallax.x = 0;
          this.parallax.y = 0;
        } else {
          this.parallax.x += (desiredX - this.parallax.x) * follow;
          this.parallax.y += (desiredY - this.parallax.y) * follow;
        }
      }
      this._applyCameraPose();
      this._applyVignetteMotion(t);
    }

    if (this.ui.readout) {
      const deg = this._getDisplayStageDegrees();
      this.ui.readout.textContent = `STAGE ${deg.toFixed(1).padStart(5, "0")}°`;
    }

    this.post.render(this.scene, this.camera, t);
    this.waterCursor?.render();
    requestAnimationFrame(this._animate);
  }
}
