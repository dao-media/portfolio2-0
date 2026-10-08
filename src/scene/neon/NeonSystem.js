import * as THREE from "three";
import {
  NEON_ARRIVE_RAD,
  NEON_FLICKER_SEC,
  NEON_FLICKER_TRAVEL_FRAC,
  NEON_FOG_LAYER,
  WET_FLOOR_LAYER,
  NEON_GRADIENT_SCROLL,
  NEON_LIGHT_DECAY,
  NEON_LIGHT_DISTANCE,
  NEON_LIGHT_FALLOFF,
  NEON_LIGHT_HEIGHT,
  NEON_CORE_MAX,
  NEON_MAX_EMISSIVE,
  NEON_MAX_LIGHT,
  NEON_SHADOW,
  STOP_FADE_IN_RAD,
  STOP_FADE_IN_SEC,
  STOP_FADE_OUT_SEC,
  vignetteAngle
} from "../stage/constants.js";
import { restResource } from "../stage/restFidelity.js";
import { noteFlight } from "../stage/flightRecorder.js";
import { makeNeonTube } from "./makeNeonTube.js";
import { makeNeonGlobe, GLOBE } from "./makeNeonGlobe.js";
import { makeNeonLantern, LANTERN_WARM, LANTERN_LIGHT, BUST_LANTERN_HEIGHT_M } from "./makeNeonLantern.js";
import { sampleNeonMapUv } from "./neonGradientTexture.js";
import {
  makeNeonFloorGlow,
  seatNeonFloorGlow,
  setNeonFloorGlowLevel,
  applyDesktopFloorGlowClearance,
  syncDesktopTowerFootprintClip
} from "./neonFloorGlow.js";

const _TUBE_WORLD = new THREE.Vector3();
const _DRAW_SIZE = new THREE.Vector2();
const _FOOT_COLOR = new THREE.Color();
const _LIGHT_COLOR = new THREE.Color();

/**
 * Per-stop neon PointLights + tubes.
 * Focus-only: inactive stops are dark; the active stop fades in near rest,
 * flickers in the last ~7% of hop travel, and scrolls its emissive gradient.
 * Fog renderers are parked in src/fog-aside and are not constructed here.
 */
export class NeonSystem {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   camera: THREE.Camera,
   *   reducedMotion?: boolean,
   *   isCoarse?: boolean,
   *   loadingManager?: import("three").LoadingManager | null
   * }} opts
   */
  constructor({ scene, camera, reducedMotion = false, isCoarse = false, loadingManager = null }) {
    this.scene = scene;
    this.camera = camera;
    this.reducedMotion = reducedMotion;
    this.isCoarse = isCoarse;
    this.loadingManager = loadingManager;
    this.entries = [];
    this.stopLights = [];
    /**
     * Stop indices whose tube / PointLight / floor glow stay dark — another
     * key light (e.g. Archaeology Giza portal daylight) owns the vignette.
     * Arrive envelope + neon-lit-content still run so props can reveal.
     * @type {Set<number>}
     */
    this._portalStops = new Set();

    /** Live tune — defaults from constants; `__stage.setNeon` mutates these. */
    this._lightHeight = NEON_LIGHT_HEIGHT;
    this._maxLight = NEON_MAX_LIGHT;

    this._wasSettled = false;
    this._flickering = false;
    this._flickerT = 0;
    this._flickerIndex = -1;
    this._flickerFiredForIndex = -1;
    /** True only after leaving the flicker strike band — blocks intro-land flicker. */
    this._flickerEligible = false;
    /**
     * Active stop whose arrive envelope has latched (settle / travel-in).
     * Stop 0 never travels into itself on load — latch on first settle so
     * neon-lit-content stays shown with a dead-still camera (§12).
     */
    this._arriveLatchedIndex = -1;
    this._lastActiveIndex = -1;
    /**
     * Stop forced to arrive 1 before the first reveal (Bust lantern prewarm).
     * Cleared once the camera leaves that stop so later hops fade in normally.
     */
    this._prelitIndex = -1;
    /** Set once allowNeon goes true (intro landed) — prelight never re-arms. */
    this._introDone = false;
    /**
     * Pass J — one opacity ramp per stop (content, tube/lantern, floor glow,
     * contact pads, PointLight). Only the resting/arriving stop is ever > 0.
     * Time-based: out over STOP_FADE_OUT_SEC as a hop starts, in over
     * STOP_FADE_IN_SEC once the camera is within STOP_FADE_IN_RAD of it.
     * @type {number[]}
     */
    this._stopFade = [];
    /** Stop whose fade-in has started; held until the active stop changes. */
    this._fadeInLatched = -1;
    this._gradientPhase = 0;
    /** @deprecated Alias of `_gradientPhase` — PointLight always tracks the live tube. */
    this._lightColorPhase = 0;
    /** DEV/probe — freeze tube + light gradient scroll. */
    this._freezeGradient = false;

    camera.layers.enable(NEON_FOG_LAYER);

    /** Fog depth pre-pass is parked in src/fog-aside and is not constructed. */
    this.depthCapture = null;
    this.debugOverlay = null;
  }

  /**
   * Compile MeshDepthMaterial programs for GPU_HOLD_LAYER roots into the
   * offscreen depth target — not the live beauty frame.
   */
  compileHeldFogDepth(renderer, scene, camera) {
    if (!this.depthCapture) return;
    this.depthCapture.render(renderer, scene, camera, [], { includeHoldLayer: true });
  }

  /**
   * Latch arrive for the landing / active stop without a travel fade.
   * Intro→first-settle handoff for stop 0 (C01) — content/neon one stable lit state.
   * @param {number} index
   */
  /**
   * Bust lantern is already at full intensity before the world is shown.
   * @param {number} [index=0]
   */
  prelightStop(index = 0) {
    const n = this.entries.length;
    // Pass J: intro-only. After the first reveal the lantern follows the
    // stop fade like every other stop — no permanent prelight.
    if (!n || this._introDone) return;
    this._prelitIndex = ((index % n) + n) % n;
  }

  /**
   * Pass J — advance every stop's fade. Call once per frame before anything
   * reads {@link getStopFade} (model reveal, layer cull, neon update).
   * @param {number} theta Camera orbit angle
   * @param {{ activeIndex?: number, settled?: boolean, dt?: number, allowNeon?: boolean }} opts
   * @returns {number[]}
   */
  tickStopFades(theta, opts = {}) {
    const n = this.entries.length;
    if (!n) return this._stopFade;
    const activeIndex = ((opts.activeIndex ?? 0) % n + n) % n;
    const settled = Boolean(opts.settled);
    const allowNeon = opts.allowNeon !== false;
    // Cap like the model reveal so a hitch does not swallow the ramp.
    const dt = Math.min(Math.max(opts.dt ?? 1 / 60, 0), 1 / 24);
    while (this._stopFade.length < n) this._stopFade.push(0);

    if (this._fadeInLatched !== activeIndex) this._fadeInLatched = -1;
    const dist = angularDistance(theta, this.entries[activeIndex].theta);
    if (!allowNeon) {
      // Intro (hold / spiral / drop): the arrival stop is owned by the
      // synchronized Bust reveal, not by this ramp. Snap, never ramp.
      for (let i = 0; i < n; i += 1) this._stopFade[i] = i === activeIndex ? 1 : 0;
      return this._stopFade;
    }
    if (settled || this.reducedMotion || dist <= STOP_FADE_IN_RAD) {
      this._fadeInLatched = activeIndex;
    }
    for (let i = 0; i < n; i += 1) {
      const target = i === this._fadeInLatched ? 1 : 0;
      const f = this._stopFade[i];
      if (this.reducedMotion) this._stopFade[i] = target;
      else if (target > f) this._stopFade[i] = Math.min(1, f + dt / STOP_FADE_IN_SEC);
      else if (target < f) this._stopFade[i] = Math.max(0, f - dt / STOP_FADE_OUT_SEC);
    }
    return this._stopFade;
  }

  /**
   * Pass J item 2 — apply a governor shadow-size change only at the very
   * start of this stop's fade-in (casters on camera, opacity near 0), and
   * re-render the map in that same frame, so no frame ever shows the stop
   * without its shadow. Returns true if the map will exist this frame.
   * @param {THREE.Light} light
   * @param {number} arriveLevel
   */
  _shadowReady(light, arriveLevel) {
    const pend = light.userData.pendingShadowSize;
    if (pend && arriveLevel > 0 && arriveLevel < 0.2) {
      light.shadow.mapSize.set(pend, pend);
      light.shadow.map?.dispose?.();
      light.shadow.map = null;
      light.shadow.needsUpdate = true;
      light.userData.shadowBakes = (light.userData.shadowBakes ?? 0) + 1;
      delete light.userData.pendingShadowSize;
      noteFlight("shadow-bake", { light: light.name, reason: "resize-at-fade-in", size: pend });
    }
    return light.shadow.map != null || light.shadow.needsUpdate === true;
  }

  /**
   * Eased (smoothstep) fade for a stop, 0..1.
   * @param {number} index
   */
  getStopFade(index = 0) {
    const f = this._stopFade[index] ?? 0;
    return f * f * (3 - 2 * f);
  }

  /** Raw (linear) fade — 0 means the stop is culled. */
  getStopFadeRaw(index = 0) {
    return this._stopFade[index] ?? 0;
  }

  armArriveForActiveStop(index = 0) {
    const n = this.entries.length;
    if (!n) return;
    const i = ((index % n) + n) % n;
    this._arriveLatchedIndex = i;
    this._lastActiveIndex = i;
    // Intro land sits inside the strike band — keep flicker disarmed.
    this._flickerEligible = false;
    this._flickering = false;
    this._flickerT = 0;
  }

  captureFogDepth(renderer, scene, camera, hideObjects = []) {
    if (!this.depthCapture) return;

    this.depthCapture.render(renderer, scene, camera, hideObjects);

    renderer.getDrawingBufferSize(_DRAW_SIZE);
    this.debugOverlay?.sync(camera, camera.near, camera.far, 2.0);
  }

  /** Keep the depth target matched to the drawing buffer on resize. */
  setSize(renderer) {
    this.depthCapture?.setSizeFromRenderer(renderer);
  }

  /**
   * @param {{ def: { neonColors?: string[], name?: string, tubeLength?: number, neonProp?: string, neonTubeXZ?: [number, number] }, group: THREE.Group, tube?: THREE.Object3D }} vignette
   */
  attach(vignette) {
    const isLantern = vignette.def?.neonProp === "lantern";
    const isGlobe = vignette.def?.neonProp === "globe";
    const hexColors = vignette.def.neonColors?.length
      ? vignette.def.neonColors
      : isLantern
        ? ["#ffa45a", "#ffc878"]
        : ["#00e5ff", "#ff2d95"];
    const colors = hexColors.map((h) => new THREE.Color(h));
    const dominant = isLantern
      ? new THREE.Color(LANTERN_WARM.light)
      : isGlobe
        ? new THREE.Color(GLOBE.light)
        : colors[0].clone();
    const tube = isLantern
      ? makeNeonLantern({
          ...vignette.def,
          loadingManager: this.loadingManager
        })
      : isGlobe
        ? makeNeonGlobe({ ...vignette.def, loadingManager: this.loadingManager })
        : makeNeonTube(vignette.def);
    vignette.group.add(tube);
    this._seatTubeOnFloor(tube, vignette.group);

    const floorGlow = makeNeonFloorGlow(dominant);
    vignette.group.add(floorGlow);
    if (isGlobe) {
      // A 3.2 m floating globe: wide pool under it, no tube-foot stump.
      floorGlow.userData.poolScale = GLOBE.poolScale;
      if (floorGlow.userData.cone) floorGlow.userData.cone.visible = false;
      floorGlow.userData.noCone = true;
    }
    // Desktop tube sits near the tower — shrink/bias pool + full footprint clip
    // so additive glow cannot soft-bleed onto the case (§12 / §20).
    if (/desktop/i.test(vignette.def?.name ?? "")) {
      applyDesktopFloorGlowClearance(floorGlow, vignette.group);
    }
    seatNeonFloorGlow(floorGlow, tube, vignette.group);

    vignette.group.updateMatrixWorld(true);
    tube.getWorldPosition(_TUBE_WORLD);

    const lanternKnobs = tube.userData?.lanternLight ?? null;
    const light = new THREE.PointLight(
      dominant,
      0,
      lanternKnobs?.distance ?? NEON_LIGHT_DISTANCE,
      lanternKnobs?.decay ?? NEON_LIGHT_DECAY
    );
    light.name = `neon-stop-light-${this.entries.length}`;
    // castShadow stays on for every stop. Intensity 0 drops the shadow
    // without changing NUM_POINT_LIGHT_SHADOWS.
    light.castShadow = true;
    light.shadow.autoUpdate = false;
    light.shadow.intensity = 0;
    light.layers.enable(0);
    light.layers.enable(NEON_FOG_LAYER);
    light.layers.enable(WET_FLOOR_LAYER);
    const lightY = isLantern
      ? _TUBE_WORLD.y + (tube.userData.flameLocalY ?? LANTERN_LIGHT.flameFrac * BUST_LANTERN_HEIGHT_M)
      : isGlobe
        ? _TUBE_WORLD.y + tube.userData.flameLocalY
        : this._lightHeight;
    light.position.set(_TUBE_WORLD.x, lightY, _TUBE_WORLD.z);
    if (isLantern && restResource(this.entries.length, "lantern-shadow-bake")) {
      light.userData.lanternWarm = true;
      light.userData.lanternMaxLight =
        lanternKnobs?.maxIntensity ?? LANTERN_LIGHT.maxIntensity;
      // restFidelity bust/lantern-shadow-bake: one cube on settle, frozen after.
      light.shadow.autoUpdate = false;
      light.userData.shadowBakes = 0;
      light.userData.shadowCasting = false;
    } else if (isLantern) {
      light.userData.lanternWarm = true;
      light.userData.lanternMaxLight =
        lanternKnobs?.maxIntensity ?? LANTERN_LIGHT.maxIntensity;
    }
    // Map allocation is once. castShadow is still settled-active only.
    light.shadow.mapSize.set(NEON_SHADOW.mapSize, NEON_SHADOW.mapSize);
    light.shadow.bias = NEON_SHADOW.bias;
    light.shadow.normalBias = NEON_SHADOW.normalBias;
    light.shadow.radius = NEON_SHADOW.radius;
    light.shadow.camera.near = NEON_SHADOW.near;
    light.shadow.camera.far = light.distance || NEON_SHADOW.far;
    this.scene.add(light);

    const theta = Math.atan2(vignette.group.position.x, vignette.group.position.z);
    vignette.tube = tube;
    this.entries.push({ vignette, tube, floorGlow, dominant, colors, theta });
    this.stopLights.push({ light, theta });
  }

  /**
   * Keep every tube's world-space bottom on Y=0 after vignette floor snaps
   * (Desktop drops group.y; Archaeology lifts it). Length/XZ offset stay identical.
   */
  seatTubesOnFloor() {
    for (let i = 0; i < this.entries.length; i += 1) {
      const { vignette, tube, floorGlow } = this.entries[i];
      this._seatTubeOnFloor(tube, vignette.group);
      if (floorGlow) seatNeonFloorGlow(floorGlow, tube, vignette.group);
      vignette.group.updateMatrixWorld(true);
      tube.getWorldPosition(_TUBE_WORLD);
      const entry = this.stopLights[i];
      if (entry?.light) {
        const prop = tube.userData?.neonProp;
        const ly =
          prop === "lantern" || prop === "globe"
            ? _TUBE_WORLD.y + (tube.userData.flameLocalY ?? 0.85)
            : this._lightHeight;
        entry.light.position.set(_TUBE_WORLD.x, ly, _TUBE_WORLD.z);
      }
    }
  }

  /**
   * @param {THREE.Object3D} tube
   * @param {THREE.Object3D} group
   */
  _seatTubeOnFloor(tube, group) {
    const length = tube.userData.tubeLength ?? 4;
    if (tube.userData.seatOrigin === "bottom") {
      // Lantern / foot-pivoted props: origin at the planted foot.
      tube.position.y = 0 - group.position.y;
    } else {
      tube.position.y = length * 0.5 - group.position.y;
    }
  }

  /** No-op — haze cards removed; kept so StageExperience call sites stay stable. */
  finishMount() {}

  /**
   * Mute tube / PointLight / floor glow for a stop (portal daylight takes over).
   * @param {number} index
   * @param {boolean} [enabled=true]
   */
  setPortalReplacesNeon(index, enabled = true) {
    const i = Math.max(0, index | 0);
    if (enabled) this._portalStops.add(i);
    else this._portalStops.delete(i);
    const entry = this.entries[i];
    if (entry?.tube) entry.tube.visible = !enabled;
    if (entry?.floorGlow) entry.floorGlow.visible = !enabled;
    const light = this.stopLights[i]?.light;
    if (light && enabled) {
      light.intensity = 0;
      light.userData.fogIntensity = 0;
    }
  }

  /**
   * @param {number} theta Camera orbit angle
   * @param {number} _total Stop count
   * @param {number} [time] Elapsed seconds
   * @param {{
   *   activeIndex?: number,
   *   settled?: boolean,
   *   dt?: number,
   *   allowNeon?: boolean
   * }} [opts]
   */
  /** Arm a lantern shadow bake for the next motion frame, not the hold. */
  deferShadowBake() {
    const lights = this.stopLights;
    if (!lights) return;
    for (let i = 0; i < lights.length; i += 1) {
      if (!restResource(i, "lantern-shadow-bake")) continue;
      const light = lights[i]?.light;
      if (!light?.shadow) continue;
      if (light.userData.shadowPrebaked === true && light.shadow.map != null) continue;
      light.userData.shadowBakeDeferred = true;
      light.shadow.needsUpdate = false;
    }
  }

  update(theta, _total, time = 0, opts = {}) {
    const n = this.entries.length;
    if (!n) return;

    const activeIndex = ((opts.activeIndex ?? 0) % n + n) % n;
    const settled = Boolean(opts.settled);
    const dt = Math.min(Math.max(opts.dt ?? 1 / 60, 0), 0.05);
    const allowNeon = opts.allowNeon !== false;
    if (allowNeon && !this._introDone) {
      this._introDone = true;
      this._prelitIndex = -1;
    }

    if (activeIndex !== this._lastActiveIndex) {
      this._lastActiveIndex = activeIndex;
      this._flickerFiredForIndex = -1;
      this._flickering = false;
      this._flickerT = 0;
      this._flickerEligible = false;
      if (this._arriveLatchedIndex !== activeIndex) {
        this._arriveLatchedIndex = -1;
      }
      if (this._prelitIndex >= 0 && this._prelitIndex !== activeIndex) {
        this._prelitIndex = -1;
      }
    }

    const hopStep = (Math.PI * 2) / n;
    const flickerStartDist = hopStep * NEON_FLICKER_TRAVEL_FRAC;
    const activeDist = angularDistance(theta, this.entries[activeIndex].theta);

    // Re-arm flicker / clear arrive latch only after leaving the arrive window.
    // Strike-band re-arm (~0.14 rad) re-fired during spring settle → strobe.
    if (activeDist > NEON_ARRIVE_RAD) {
      this._flickerFiredForIndex = -1;
      this._arriveLatchedIndex = -1;
    }
    // Must leave the strike band before a strike can arm — intro lands already
    // inside it, so without this stop 0 flickers on a still load-rest camera.
    if (activeDist > flickerStartDist) {
      this._flickerEligible = true;
    }

    if (!allowNeon) {
      this._flickering = false;
      this._flickerT = 0;
    } else if (
      !this.reducedMotion &&
      !this._flickering &&
      this._flickerEligible &&
      this._flickerFiredForIndex !== activeIndex &&
      activeDist <= flickerStartDist
    ) {
      // Last ~7% of stop-to-stop travel — strike while arriving, not after settle.
      this._flickering = true;
      this._flickerT = 0;
      this._flickerIndex = activeIndex;
      this._flickerFiredForIndex = activeIndex;
      this._flickerEligible = false;
    }

    // Settled inside the arrive window → latch (load-rest stop 0 never
    // travels into its own fade). Holds until leaving NEON_ARRIVE_RAD.
    if (allowNeon && settled && activeDist <= NEON_ARRIVE_RAD) {
      this._arriveLatchedIndex = activeIndex;
    }
    this._wasSettled = settled;

    if (this._flickering) {
      this._flickerT += dt;
      if (this._flickerT >= NEON_FLICKER_SEC) {
        this._flickering = false;
        this._flickerT = NEON_FLICKER_SEC;
      }
    }

    if (!this.reducedMotion && allowNeon && !this._freezeGradient) {
      this._gradientPhase = (this._gradientPhase + NEON_GRADIENT_SCROLL * dt) % 1;
      this._lightColorPhase = this._gradientPhase;
    }

    for (let i = 0; i < n; i += 1) {
      // Arrive envelope (content visibility) vs display level (lights/emissive).
      // Flicker keys hit 0 — gating content on display level strobed the whole
      // stop solid black. Content follows arrive only; flicker stays on glow.
      let arriveLevel = 0;
      let level = 0;
      if (allowNeon && i === activeIndex) {
        arriveLevel =
          settled || this.reducedMotion
            ? 1
            : glslSmoothstep(NEON_ARRIVE_RAD, 0, activeDist);
        if (this._arriveLatchedIndex === i) {
          arriveLevel = 1;
        }
        level = arriveLevel;
        // Neon tube strike flicker — not for the warm lantern fire.
        if (
          this._flickering &&
          i === this._flickerIndex &&
          this.entries[i].tube?.userData?.neonProp !== "lantern" &&
          this.entries[i].tube?.userData?.neonProp !== "globe"
        ) {
          level *= neonFlickerMul(this._flickerT);
        }
      }
      if (this._prelitIndex === i) {
        arriveLevel = 1;
        level = 1;
      }
      // Pass J — the stop fade is the one envelope for the whole stop.
      // After the intro it replaces the angle-based arrive smoothstep (the
      // old mid-hop blackout + snap-in); the tube strike flicker still
      // rides on top of it.
      if (allowNeon) {
        const fade = this.getStopFade(i);
        const flick = arriveLevel > 1e-4 ? level / arriveLevel : 1;
        arriveLevel = fade;
        level = fade * flick;
      }
      this.entries[i]._arriveLevel = arriveLevel;

      const portalLit = this._portalStops.has(i);
      // Portal stops keep content arrive, but never light the neon tube / PointLight.
      const displayLevel = portalLit ? 0 : level;

      const tube = this.entries[i].tube;
      if (tube) tube.visible = !portalLit;
      const isLantern = tube?.userData?.neonProp === "lantern";
      const mat = tube?.material ?? tube?.userData?.neonCoreMat;

      // —— Lantern: warm fire + soft scene fill (no neon gradient scroll) ——
      if (isLantern) {
        const flicker =
          typeof tube.userData.tickLantern === "function"
            ? tube.userData.tickLantern(
                time,
                displayLevel,
                this.reducedMotion,
                this.camera
              )
            : 1;

        const light = this.stopLights[i].light;
        const maxL =
          light.userData.lanternMaxLight ??
          LANTERN_LIGHT.maxIntensity ??
          this._maxLight;
        light.intensity = displayLevel * maxL * flicker;
        // Settled-only cube. castShadow stays true on every stop so the
        // shadow #define does not change mid-hop. shadow.intensity hides it.
        const shouldCast =
          i === activeIndex &&
          settled &&
          displayLevel > 0.08 &&
          !this.reducedMotion;
        const bake = restResource(i, "lantern-shadow-bake");
        light.castShadow = true;
        light.shadow.autoUpdate = false;
        // Pass J item 2: the map is baked during warm and kept; its strength
        // rides the stop fade (casters are static) instead of snapping
        // 0 -> 1 on the settle frame — that snap was the shadow pop-in.
        light.shadow.intensity =
          this._shadowReady(light, arriveLevel) && !this.reducedMotion ? arriveLevel : 0;
        if (bake) {
          const wasCasting = light.userData.shadowCasting === true;
          const prebaked =
            light.userData.shadowPrebaked === true && light.shadow.map != null;
          const flush =
            i === activeIndex &&
            light.userData.shadowBakeDeferred === true &&
            light.shadow.map == null;
          if (flush) {
            noteFlight("shadow-bake", { light: light.name, reason: "lantern-flush" });
            light.shadow.needsUpdate = true;
            light.userData.shadowBakeDeferred = false;
            light.userData.shadowPrebaked = true;
            light.userData.flushShadow = true;
            light.userData.shadowBakes = (light.userData.shadowBakes ?? 0) + 1;
          } else if (shouldCast && (!wasCasting || light.shadow.map == null)) {
            if (prebaked || light.shadow.map != null) light.userData.shadowPrebaked = false;
            else {
              light.userData.shadowBakeDeferred = true;
              light.shadow.needsUpdate = false;
            }
            if (shouldCast && light.shadow.map == null) {
          noteFlight("shadow-bake", { light: light.name, reason: "no-map-on-settle" });
          light.shadow.needsUpdate = true;
        }
          }
          light.userData.shadowCasting = shouldCast;
        } else if (shouldCast && light.shadow.map == null) {
          light.shadow.needsUpdate = true;
        }
        // Reach must match the warm spill (attach-time far can lag knobs).
        if (light.shadow?.camera) {
          light.shadow.camera.far = Math.max(
            light.distance || 1,
            LANTERN_LIGHT.distance
          );
          light.shadow.camera.updateProjectionMatrix?.();
        }
        light.userData.fogIntensity = portalLit
          ? 0
          : arriveLevel * maxL * 0.85;
        _LIGHT_COLOR.copy(
          tube.userData.lanternWarm ?? this.entries[i].dominant
        );
        // Tiny warmth drift with flicker (not neon hue scroll).
        if (displayLevel > 1e-3) {
          _LIGHT_COLOR.offsetHSL(0, 0.02 * (flicker - 1), 0.03 * (flicker - 1));
        }
        light.color.copy(_LIGHT_COLOR);

        // Keep light seated in the flame chamber.
        tube.getWorldPosition(_TUBE_WORLD);
        light.position.set(
          _TUBE_WORLD.x,
          _TUBE_WORLD.y + (tube.userData.flameLocalY ?? 0.85),
          _TUBE_WORLD.z
        );

        const glassMats = tube.userData.neonGlassMats;
        if (Array.isArray(glassMats)) {
          for (const gm of glassMats) {
            if (gm?.emissive) gm.emissive.copy(_LIGHT_COLOR);
          }
        }

        _FOOT_COLOR.copy(_LIGHT_COLOR);
        // Stronger floor spill so warm light reads as coming from the lantern foot.
        setNeonFloorGlowLevel(
          this.entries[i].floorGlow,
          displayLevel * (1.05 + 0.35 * flicker),
          _FOOT_COLOR
        );
        if (this.entries[i].floorGlow) {
          this.entries[i].floorGlow.visible =
            !portalLit && displayLevel > 1e-3;
        }

        this._syncContentLit(this.entries[i], arriveLevel, {
          latched: this._arriveLatchedIndex === i
        });
        continue;
      }

      // —— Globe (Archaeology): emissive night-side Earth, light at its centre ——
      const isGlobe = tube?.userData?.neonProp === "globe";
      if (isGlobe) tube.userData.tickGlobe?.(time, displayLevel, this.reducedMotion);

      // —— Standard neon tube ——
      if (mat && !isGlobe) {
        // Option 1: luminance-compensated core under bloom (no Additive shell).
        const map = mat.userData?.neonGradientMap ?? mat.map ?? mat.emissiveMap;
        if (map && displayLevel > 1e-3 && !this.reducedMotion) {
          map.offset.y = this._gradientPhase;
        }

        const bloomTarget = mat.userData?.neonCoreMax ?? NEON_CORE_MAX;
        if (mat.uniforms?.uLevel) {
          mat.uniforms.uLevel.value = displayLevel;
          if (mat.uniforms.uBloomTarget) {
            mat.uniforms.uBloomTarget.value = bloomTarget;
          }
          if (mat.uniforms.uMapOffset) {
            mat.uniforms.uMapOffset.value.set(0, this._gradientPhase);
          }
          const bodyMat = mat.userData?.neonBodyMat;
          if (bodyMat && "envMapIntensity" in bodyMat) {
            bodyMat.envMapIntensity = displayLevel > 1e-3 ? 0.7 : 0.35;
          }
        } else if (mat.isMeshBasicMaterial) {
          const coreGlow = displayLevel * bloomTarget;
          mat.color.setRGB(coreGlow, coreGlow, coreGlow);
          const bodyMat = mat.userData?.neonBodyMat;
          if (bodyMat && "envMapIntensity" in bodyMat) {
            bodyMat.envMapIntensity = displayLevel > 1e-3 ? 0.7 : 0.35;
          }
        } else if ("emissiveIntensity" in mat) {
          mat.emissiveIntensity = displayLevel * NEON_MAX_EMISSIVE;
        }
      }

      const light = this.stopLights[i].light;
      light.intensity = displayLevel * this._maxLight;
      // Same shadow #define on every stop. Only the settled tube contributes.
      const shouldCast =
        i === activeIndex &&
        settled &&
        displayLevel > 0.08 &&
        !this.reducedMotion;
      light.castShadow = true;
      if (light.shadow) {
        light.shadow.autoUpdate = false;
        // Pass J item 2: same as the lantern — a baked, static map whose
        // strength follows the stop fade (no snap on settle). Only a stop
        // with no map yet bakes, once, on its first settle.
        light.shadow.intensity =
          this._shadowReady(light, arriveLevel) && !this.reducedMotion ? arriveLevel : 0;
        if (shouldCast && light.shadow.map == null) {
          noteFlight("shadow-bake", { light: light.name, reason: "no-map-on-settle" });
          light.shadow.needsUpdate = true;
        }
      }
      // Fog / haze integrate over the volume — use arrive only (no strike flicker).
      // Portal stops contribute no neon fog — daylight Spot owns in-scatter.
      light.userData.fogIntensity = portalLit
        ? 0
        : arriveLevel * this._maxLight;
      // Cast light MUST match the visible tube — same mid-UV sample as emissive
      // (map.offset.y = _gradientPhase). No slow phase / rate-cap lag.
      if (isGlobe) {
        light.color.copy(tube.userData.globeWarm ?? this.entries[i].dominant);
      } else if (displayLevel > 1e-3) {
        const gradientMap =
          mat?.userData?.neonGradientMap ?? mat?.map ?? mat?.emissiveMap;
        if (gradientMap) {
          sampleNeonMapUv(gradientMap, 0.5, 0.5, _LIGHT_COLOR);
        } else {
          _LIGHT_COLOR.copy(this.entries[i].dominant);
        }
        light.color.copy(_LIGHT_COLOR);
      }

      // Floor pool/cone = exact tube-foot texel (CylinderGeometry side UV v=0).
      const footMap =
        mat?.userData?.neonGradientMap ?? mat?.map ?? mat?.emissiveMap;
      if (isGlobe) {
        _FOOT_COLOR.copy(tube.userData.globeWarm ?? this.entries[i].dominant);
      } else if (footMap) {
        sampleNeonMapUv(footMap, 0.5, 0, _FOOT_COLOR);
      } else {
        _FOOT_COLOR.copy(this.entries[i].dominant);
      }
      setNeonFloorGlowLevel(this.entries[i].floorGlow, displayLevel, _FOOT_COLOR);
      if (this.entries[i].floorGlow) {
        this.entries[i].floorGlow.visible = !portalLit && displayLevel > 1e-3;
      }
      if (this.entries[i].floorGlow?.userData?.desktopTowerClip) {
        syncDesktopTowerFootprintClip(
          this.entries[i].floorGlow,
          this.entries[i].vignette?.group
        );
      }

      // No lights → props must not read from IBL / ambient / POV spill.
      // Gate a content parent (not per-mesh) so intro reveal / GPU-hold
      // can keep owning child `.visible`. Latched stops ignore envelope noise.
      this._syncContentLit(this.entries[i], arriveLevel, {
        latched: this._arriveLatchedIndex === i
      });
    }
  }

  /**
   * Pre-flicker arrive envelope for a stop (0→1). Fog / content use this;
   * tube glow + PointLight.intensity still take the strike flicker.
   * @param {number} index
   */
  getArriveLevel(index = 0) {
    const i = Math.max(0, index | 0);
    return this.entries[i]?._arriveLevel ?? 0;
  }

  /**
   * Reparent non-tube vignette children under `neon-lit-content` once, then
   * toggle that group from the stop’s arrive envelope (not flicker zeros).
   * Once arrive is latched for this stop, visibility follows the latch only —
   * the envelope carries spring micro-noise that used to edge-chatter content.
   * @param {{ vignette: { group?: THREE.Group }, tube?: THREE.Object3D, contentRoot?: THREE.Group, _contentLit?: boolean }} entry
   * @param {number} arriveLevel Arrive smoothstep 0..1 (pre-flicker)
   * @param {{ latched?: boolean }} [opts]
   */
  _syncContentLit(entry, arriveLevel, opts = {}) {
    const group = entry?.vignette?.group;
    if (!group) return;

    let root = entry.contentRoot;
    if (!root || root.parent !== group) {
      root = null;
      for (let i = 0; i < group.children.length; i += 1) {
        if (group.children[i].name === "neon-lit-content") {
          root = group.children[i];
          break;
        }
      }
      if (!root) {
        root = new THREE.Group();
        root.name = "neon-lit-content";
        group.add(root);
      }
      entry.contentRoot = root;
    }

    // Pull any siblings that mounted after the wrapper (GLB commit, blockout).
    for (let i = group.children.length - 1; i >= 0; i -= 1) {
      const child = group.children[i];
      if (
        child === root ||
        child === entry.tube ||
        child === entry.floorGlow ||
        child.name === "neon-tube" ||
        child.name === "neon-floor-glow" ||
        child.name === "arch-portal-root" ||
        child.name === "arch-portal-floor-pool" ||
        child.name === "arch-portal-opening-mask" ||
        child.name === "arch-portal-world" ||
        child.name === "arch-portal-screen"
      ) {
        continue;
      }
      root.add(child);
    }

    // Pass J: content is never toggled here any more. The stop fade
    // ramps its opacity and StageExperience culls the whole stop by layer
    // at fade 0 — a binary `visible` flip at an arrive threshold was the
    // mid-hop blackout and the un-ramped snap-in.
    const lit = arriveLevel > 0;
    entry._contentLit = lit;
    root.visible = true;
  }

  /**
   * TEMP tuning probe — hot-update all 4 neon PointLights.
   * Prefer raising `height` before lowering `maxLight` (slab peak vs fog spread).
   * Remove once a pair is baked into constants.js.
   * @param {{ height?: number, maxLight?: number }} opts
   */
  setNeon({ height, maxLight } = {}) {
    if (typeof height === "number" && Number.isFinite(height)) {
      this._lightHeight = Math.max(0.05, height);
      for (const { light } of this.stopLights) {
        light.position.y = this._lightHeight;
      }
    }
    if (typeof maxLight === "number" && Number.isFinite(maxLight)) {
      this._maxLight = Math.max(0, maxLight);
    }
    return this.debugState();
  }

  /**
   * Show FogDepthCapture on a camera-parented debug quad (same beauty pass).
   * `depth` = packed `.r` (nearer = brighter). `soft` = contact ramp (red=0, green=1).
   * @param {"off"|"depth"|"soft"|"both"} [mode]
   */
  debugFogVis(mode = "both") {
    return this.debugOverlay?.setMode(mode) ?? "off";
  }

  /**
   * Isolate neon floor stain. Feather/fog/haze knobs removed with the ring path.
   * @param {{ floor?: boolean }} opts
   */
  debugFogIsolate({ floor } = {}) {
    if (typeof floor === "boolean" && this._stageFloor) {
      this._stageFloor.visible = floor;
    }
    return {
      floorVisible: this._stageFloor?.visible ?? null
    };
  }

  /** Bind the stage floor so isolate() can hide neon floor stain. */
  setStageFloor(floor) {
    this._stageFloor = floor;
  }

  /**
   * Capture stats for the depth RT: size vs drawing buffer, nearest filter,
   * live camera near/far, and a few packed-depth samples.
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  debugFogCapture(renderer, scene, camera) {
    this.captureFogDepth(renderer, scene, camera);
    const rt = this.depthCapture?.target;
    const draw = renderer.getDrawingBufferSize(new THREE.Vector2());
    const samples = [];
    if (rt) {
      const pts = [
        [0.5, 0.5],
        [0.5, 0.22],
        [0.5, 0.72],
        [0.2, 0.4],
        [0.8, 0.4]
      ];
      const pixel = new Uint8Array(4);
      for (const [nx, ny] of pts) {
        const x = Math.min(rt.width - 1, Math.max(0, Math.floor(nx * rt.width)));
        const y = Math.min(rt.height - 1, Math.max(0, Math.floor(ny * rt.height)));
        renderer.readRenderTargetPixels(rt, x, y, 1, 1, pixel);
        const packed = pixel[0] / 255;
        const sceneDepth = 1 - packed;
        const near = camera.near;
        const far = camera.far;
        const sceneViewZ = (near * far) / ((far - near) * sceneDepth - far);
        samples.push({
          nx,
          ny,
          rgba: [pixel[0], pixel[1], pixel[2], pixel[3]],
          packed,
          sceneDepth,
          sceneViewZ: Number(sceneViewZ.toFixed(3))
        });
      }
    }
    return {
      rt: rt
        ? {
            width: rt.width,
            height: rt.height,
            minFilter: rt.texture.minFilter,
            magFilter: rt.texture.magFilter,
            generateMipmaps: rt.texture.generateMipmaps,
            type: rt.texture.type,
            colorSpace: rt.texture.colorSpace
          }
        : null,
      drawingBuffer: { width: draw.x, height: draw.y },
      sizeMatch: Boolean(rt && rt.width === draw.x && rt.height === draw.y),
      nearest: Boolean(
        rt &&
          rt.texture.minFilter === THREE.NearestFilter &&
          rt.texture.magFilter === THREE.NearestFilter
      ),
      camera: { near: camera.near, far: camera.far },
      depthMatToneMapped: this.depthCapture?.depthMaterial?.toneMapped ?? null,
      rendererToneMapping: renderer.toneMapping,
      samples
    };
  }

  debugState() {
    return {
      height: this._lightHeight,
      maxLight: this._maxLight,
      defaults: { height: NEON_LIGHT_HEIGHT, maxLight: NEON_MAX_LIGHT },
      focusOnly: true,
      arriveRad: NEON_ARRIVE_RAD,
      flickerTravelFrac: NEON_FLICKER_TRAVEL_FRAC,
      flickerSec: NEON_FLICKER_SEC,
      gradientScroll: NEON_GRADIENT_SCROLL,
      flickering: this._flickering,
      flickerFiredForIndex: this._flickerFiredForIndex,
      flickerEligible: this._flickerEligible,
      arriveLatchedIndex: this._arriveLatchedIndex,
      gradientPhase: this._gradientPhase,
      lightCount: this.stopLights.length,
      lights: this.stopLights.map((s, i) => ({
        name: this.entries[i]?.vignette?.def?.name ?? i,
        intensity: s.light.intensity,
        color: `#${s.light.color.getHexString()}`,
        theta: s.theta,
        y: s.light.position.y,
        layer0: s.light.layers.isEnabled(0),
        layer2: s.light.layers.isEnabled(NEON_FOG_LAYER)
      })),
      stops: this.entries.map((entry, i) => ({
        name: entry?.vignette?.def?.name ?? i,
        contentVisible: Boolean(entry?.contentRoot?.visible),
        contentLit: Boolean(entry?._contentLit),
        contentChildren: entry?.contentRoot?.children?.length ?? 0,
        arriveLatched: this._arriveLatchedIndex === i,
        contentFromLatch: this._arriveLatchedIndex === i
      })),
      depthCapture: Boolean(this.depthCapture?.depthTexture)
    };
  }
}

/** Shortest arc in [0, π]. */
export function angularDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function glslSmoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** 1 beside the stop, 0 at `falloff` radians away. */
export function neonProximity(camTheta, stopTheta, falloff = NEON_LIGHT_FALLOFF) {
  return glslSmoothstep(falloff, 0, angularDistance(camTheta, stopTheta));
}

/** Angular smoothstep used by lights and tubes. */
export function neonActiveAmount(theta, index, total) {
  return neonProximity(theta, vignetteAngle(index, total));
}

/**
 * Scripted neon strike — bright / dark bursts, then holds at 1.
 * @param {number} t Seconds since settle rising edge
 */
export function neonFlickerMul(t) {
  if (t <= 0) return 0;
  if (t >= NEON_FLICKER_SEC) return 1;
  const keys = [
    [0.0, 0.0],
    [0.03, 0.85],
    [0.06, 0.0],
    [0.1, 1.0],
    [0.14, 0.12],
    [0.18, 0.95],
    [0.22, 0.0],
    [0.28, 1.0],
    [0.34, 0.35],
    [0.4, 1.0],
    [NEON_FLICKER_SEC, 1.0]
  ];
  for (let i = 0; i < keys.length - 1; i += 1) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t <= t1) {
      const u = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * u;
    }
  }
  return 1;
}
