import * as THREE from "three";
import {
  NEON_ARRIVE_RAD,
  NEON_FLICKER_SEC,
  NEON_FLICKER_TRAVEL_FRAC,
  NEON_FOG_LAYER,
  NEON_GRADIENT_SCROLL,
  NEON_LIGHT_COLOR_MAX_RATE,
  NEON_LIGHT_COLOR_SCROLL,
  NEON_LIGHT_DECAY,
  NEON_LIGHT_DISTANCE,
  NEON_LIGHT_FALLOFF,
  NEON_LIGHT_HEIGHT,
  NEON_CORE_MAX,
  NEON_MAX_EMISSIVE,
  NEON_MAX_LIGHT,
  vignetteAngle
} from "../stage/constants.js";
import { FogDepthCapture } from "./FogDepthCapture.js";
import { FogDebugOverlay } from "./FogDebugOverlay.js";
import { makeNeonTube } from "./makeNeonTube.js";
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
 * Atmosphere is VolumetricFogPass; FogDepthCapture feeds soft-contact depth.
 */
export class NeonSystem {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   camera: THREE.Camera,
   *   reducedMotion?: boolean,
   *   isCoarse?: boolean
   * }} opts
   */
  constructor({ scene, camera, reducedMotion = false, isCoarse = false }) {
    this.scene = scene;
    this.camera = camera;
    this.reducedMotion = reducedMotion;
    this.isCoarse = isCoarse;
    this.entries = [];
    this.stopLights = [];

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
    this._gradientPhase = 0;
    /** Slow V phase for PointLight color (independent of tube scroll). */
    this._lightColorPhase = 0;
    /** DEV/probe — freeze tube + light gradient scroll. */
    this._freezeGradient = false;

    camera.layers.enable(NEON_FOG_LAYER);

    /** Opaque depth pre-pass for volumetric soft-contact. */
    this.depthCapture = new FogDepthCapture();

    /** DEV depth / soft-term quads. Off until debugFogVis(). */
    this.debugOverlay = new FogDebugOverlay(camera, this.depthCapture.depthTexture);
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

  captureFogDepth(renderer, scene, camera) {
    if (!this.depthCapture) return;

    this.depthCapture.render(renderer, scene, camera, []);

    renderer.getDrawingBufferSize(_DRAW_SIZE);
    this.debugOverlay?.sync(camera, camera.near, camera.far, 2.0);
  }

  /** Keep the depth target matched to the drawing buffer on resize. */
  setSize(renderer) {
    this.depthCapture?.setSizeFromRenderer(renderer);
  }

  /**
   * @param {{ def: { neonColors?: string[], name?: string, tubeLength?: number }, group: THREE.Group, tube?: THREE.Mesh }} vignette
   */
  attach(vignette) {
    const hexColors = vignette.def.neonColors?.length
      ? vignette.def.neonColors
      : ["#00e5ff", "#ff2d95"];
    const colors = hexColors.map((h) => new THREE.Color(h));
    const dominant = colors[0].clone();
    const tube = makeNeonTube(vignette.def);
    vignette.group.add(tube);
    this._seatTubeOnFloor(tube, vignette.group);

    const floorGlow = makeNeonFloorGlow(dominant);
    vignette.group.add(floorGlow);
    // Desktop tube sits near the tower — shrink/bias pool + full footprint clip
    // so additive glow cannot soft-bleed onto the case (§12 / §20).
    if (/desktop/i.test(vignette.def?.name ?? "")) {
      applyDesktopFloorGlowClearance(floorGlow, vignette.group);
    }
    seatNeonFloorGlow(floorGlow, tube, vignette.group);

    vignette.group.updateMatrixWorld(true);
    tube.getWorldPosition(_TUBE_WORLD);

    const light = new THREE.PointLight(dominant, 0, NEON_LIGHT_DISTANCE, NEON_LIGHT_DECAY);
    light.name = `neon-stop-light-${this.entries.length}`;
    light.castShadow = false;
    light.layers.enable(0);
    light.layers.enable(NEON_FOG_LAYER);
    light.position.set(_TUBE_WORLD.x, this._lightHeight, _TUBE_WORLD.z);
    this.scene.add(light);

    const theta = Math.atan2(vignette.group.position.x, vignette.group.position.z);
    vignette.tube = tube;
    this.entries.push({ vignette, tube, floorGlow, dominant, colors, theta });
    this.stopLights.push({ light, theta });
  }

  /**
   * Keep every tube's world-space bottom on Y=0 after vignette floor snaps
   * (Desktop drops group.y; Travel lifts it). Length/XZ offset stay identical.
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
        entry.light.position.set(_TUBE_WORLD.x, this._lightHeight, _TUBE_WORLD.z);
      }
    }
  }

  /**
   * @param {THREE.Mesh} tube
   * @param {THREE.Object3D} group
   */
  _seatTubeOnFloor(tube, group) {
    const length = tube.userData.tubeLength ?? 4;
    tube.position.y = length * 0.5 - group.position.y;
  }

  /** No-op — haze cards removed; kept so StageExperience call sites stay stable. */
  finishMount() {}

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
  update(theta, _total, time = 0, opts = {}) {
    const n = this.entries.length;
    if (!n) return;

    const activeIndex = ((opts.activeIndex ?? 0) % n + n) % n;
    const settled = Boolean(opts.settled);
    const dt = Math.min(Math.max(opts.dt ?? 1 / 60, 0), 0.05);
    const allowNeon = opts.allowNeon !== false;

    if (activeIndex !== this._lastActiveIndex) {
      this._lastActiveIndex = activeIndex;
      this._flickerFiredForIndex = -1;
      this._flickering = false;
      this._flickerT = 0;
      this._flickerEligible = false;
      if (this._arriveLatchedIndex !== activeIndex) {
        this._arriveLatchedIndex = -1;
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
      // Cast-light hue drifts slower than the tube scroll — same gradient, capped rate
      // so PC/canopy speculars do not crawl (§12 / §20.18).
      this._lightColorPhase =
        (this._lightColorPhase + NEON_LIGHT_COLOR_SCROLL * dt) % 1;
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
        if (this._flickering && i === this._flickerIndex) {
          level *= neonFlickerMul(this._flickerT);
        }
      }

      const tube = this.entries[i].tube;
      const mat = tube?.material;
      if (mat) {
        // Option 1: luminance-compensated core under bloom (no Additive shell).
        const map = mat.userData?.neonGradientMap ?? mat.map ?? mat.emissiveMap;
        if (map && level > 1e-3 && !this.reducedMotion) {
          map.offset.y = this._gradientPhase;
        }

        const bloomTarget = mat.userData?.neonCoreMax ?? NEON_CORE_MAX;
        if (mat.uniforms?.uLevel) {
          mat.uniforms.uLevel.value = level;
          if (mat.uniforms.uBloomTarget) {
            mat.uniforms.uBloomTarget.value = bloomTarget;
          }
          if (mat.uniforms.uMapOffset) {
            mat.uniforms.uMapOffset.value.set(0, this._gradientPhase);
          }
          const bodyMat = mat.userData?.neonBodyMat;
          if (bodyMat && "envMapIntensity" in bodyMat) {
            bodyMat.envMapIntensity = level > 1e-3 ? 0.7 : 0.35;
          }
        } else if (mat.isMeshBasicMaterial) {
          const coreGlow = level * bloomTarget;
          mat.color.setRGB(coreGlow, coreGlow, coreGlow);
          const bodyMat = mat.userData?.neonBodyMat;
          if (bodyMat && "envMapIntensity" in bodyMat) {
            bodyMat.envMapIntensity = level > 1e-3 ? 0.7 : 0.35;
          }
        } else if ("emissiveIntensity" in mat) {
          mat.emissiveIntensity = level * NEON_MAX_EMISSIVE;
        }
      }

      const light = this.stopLights[i].light;
      light.intensity = level * this._maxLight;
      // Cast light tracks the tube gradient. Bust (widest hue span) samples the
      // SAME phase as the visible tube emissive — rate-cap lagged green↔cyan.
      // Other stops keep slow phase + rate-cap (§12 / §20.18 speaker shimmer).
      if (level > 1e-3) {
        const gradientMap =
          mat?.userData?.neonGradientMap ?? mat?.map ?? mat?.emissiveMap;
        const isBust = /bust/i.test(this.entries[i].vignette?.def?.name ?? "");
        if (gradientMap) {
          if (isBust) {
            // Live tube path: respect map.offset.y (= _gradientPhase) at mid UV.
            sampleNeonMapUv(gradientMap, 0.5, 0.5, _LIGHT_COLOR);
          } else {
            sampleNeonMapUv(gradientMap, 0.5, this._lightColorPhase, _LIGHT_COLOR, {
              ignoreOffset: true
            });
          }
        } else {
          _LIGHT_COLOR.copy(this.entries[i].dominant);
        }
        if (isBust) {
          light.color.copy(_LIGHT_COLOR);
        } else {
          const maxStep = NEON_LIGHT_COLOR_MAX_RATE * Math.max(dt, 0);
          light.color.r += THREE.MathUtils.clamp(
            _LIGHT_COLOR.r - light.color.r,
            -maxStep,
            maxStep
          );
          light.color.g += THREE.MathUtils.clamp(
            _LIGHT_COLOR.g - light.color.g,
            -maxStep,
            maxStep
          );
          light.color.b += THREE.MathUtils.clamp(
            _LIGHT_COLOR.b - light.color.b,
            -maxStep,
            maxStep
          );
        }
      }

      // Floor pool/cone = exact tube-foot texel (CylinderGeometry side UV v=0).
      const footMap =
        mat?.userData?.neonGradientMap ?? mat?.map ?? mat?.emissiveMap;
      if (footMap) {
        sampleNeonMapUv(footMap, 0.5, 0, _FOOT_COLOR);
      } else {
        _FOOT_COLOR.copy(this.entries[i].dominant);
      }
      setNeonFloorGlowLevel(this.entries[i].floorGlow, level, _FOOT_COLOR);
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
        child.name === "neon-floor-glow"
      ) {
        continue;
      }
      root.add(child);
    }

    let lit;
    if (opts.latched) {
      // C04: latched-at-rest → content is ON from the latch alone.
      lit = true;
    } else {
      // Travel arrive: ON threshold ABOVE OFF threshold. The old 1e-3 / 0.02
      // pair turned content on at 1e-3 then immediately off until 0.02 —
      // three-frame chatter while approaching a stop.
      const wasLit = Boolean(entry._contentLit);
      lit = wasLit ? arriveLevel > 0.02 : arriveLevel > 0.08;
    }
    entry._contentLit = lit;
    root.visible = lit;
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
