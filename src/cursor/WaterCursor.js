import * as THREE from "three";
import gsap from "gsap";
import {
  DEFAULT_WATER_CURSOR_CONFIG,
  WATER_CURSOR_VERSION
} from "./waterCursorConfig.js";
import { damp, Spring } from "./waterCursorSpring.js";
import {
  waterCursorFragmentShader,
  waterCursorRimResolveShader,
  waterCursorRimResolveVertexShader,
  waterCursorVertexShader
} from "./waterCursorShaders.js";
import {
  clampDeltaSeconds,
  finite,
  sanitizeWaterCursorConfig,
  wrapAngle
} from "./waterCursorSanitize.js";

export { WATER_CURSOR_VERSION };

const _COLOR = new THREE.Color();
const OMEGA_EPS = 1e-4;
const MAX_OMEGA = 24;
const MAX_WAVE_AMP = 0.08;

/**
 * WebGL overlay cursor v1 — single liquid mass rendered after the main scene pass.
 *
 * Physics: position follower → velocity → stretch spring → harmonic polar SDF.
 * Heading uses angular momentum (coast); radial deformations use springs.
 */
/** Pass K item 7 — rim sim pauses after the blob has been this still (ms). */
const RIM_IDLE_MS = 1200;

export class WaterCursor {
  /**
   * @param {{ renderer: THREE.WebGLRenderer, ticker: { add: Function, remove: Function }, config?: Partial<typeof DEFAULT_WATER_CURSOR_CONFIG> }} options
   */
  constructor({
    renderer,
    ticker,
    config = {},
    headless = false,
    width = 0,
    height = 0,
    reducedMotion = null
  }) {
    if (!renderer?.domElement) {
      throw new Error("[WaterCursor] A WebGLRenderer with domElement is required.");
    }
    if (!ticker?.add) {
      throw new Error("[WaterCursor] ticker.add(fn) is required (e.g. gsap.ticker).");
    }

    this.renderer = renderer;
    this.ticker = ticker;
    this.cfg = sanitizeWaterCursorConfig(config);
    this.version = WATER_CURSOR_VERSION;

    this.reducedMotion =
      typeof reducedMotion === "boolean"
        ? reducedMotion
        : window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.deformEnabled =
      !this.reducedMotion || !this.cfg.reducedMotionPlain;

    this._width = 1;
    this._height = 1;
    this._initialized = false;
    this._disposed = false;
    this._renderWarned = false;

    /** Raw pointer target — CSS pixels, top-left origin. Events only write here. */
    this._pointer = new THREE.Vector2(Number.NaN, Number.NaN);
    /** Smoothed follower position — CSS pixels. */
    this._pos = new THREE.Vector2(0, 0);
    /** Filtered velocity — px/s. */
    this._velocity = new THREE.Vector2();
    /** Motion heading — radians. */
    this._angle = 0;
    /** Angular momentum — rad/s, coasts after stop. */
    this._omega = 0;
    /** Signed stretch from spring (can go negative on settle). */
    this._stretch = 0;
    /** Disk spiral shear. Null clears it. Strength stays under 1. */
    this._diskShear = null;
    this._diskYank = 0;

    this._stretchSpring = new Spring(this.cfg.springStiffness, this.cfg.springDamping);
    this._waveSpring = new Spring(this.cfg.waveStiffness, this.cfg.waveDamping);
    this._presenceSpring = new Spring(
      this.cfg.presenceSpringStiffness,
      this.cfg.presenceSpringDamping
    );
    this._presenceSpring.target = 0;
    this._presenceUseSpring = false;
    this._wavePhase = 0;
    /** True after first in-frame pointer sample (boot or enter). */
    this._hasPointerSample = false;

    this._rimDtSec = 1 / 60;
    this._rimClock = performance.now();

    this._quadPx = this.cfg.baseDiameter * this.cfg.quadScale;
    this._baseRadiusUv = 0.5 / this.cfg.quadScale;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
    this.camera.position.set(0, 0, 1);
    this.camera.lookAt(0, 0, 0);

    _COLOR.set(this.cfg.color);
    this.uniforms = {
      uTime: { value: 0 },
      uStretch: { value: 0 },
      uAngle: { value: 0 },
      uGravity: { value: 0 },
      uCurve: { value: 0 },
      uHoleHide: { value: 0 },
      uHoleUv: { value: new THREE.Vector2(0.5, 0.5) },
      uHoleRad: { value: 0 },
      uTailBias: { value: this.cfg.tailBias },
      uPressScale: { value: 1 },
      uRimPress: { value: 1 },
      uPresence: { value: 0 },
      uRadius: { value: this._baseRadiusUv },
      uIdleRadiusWobble: {
        value: this.deformEnabled ? this.cfg.idleRadiusWobble : 0
      },
      uWaveAmp: { value: 0 },
      uWavePhase: { value: 0 },
      uDeformEnabled: { value: this.deformEnabled ? 1 : 0 },
      uColor: { value: new THREE.Vector3(_COLOR.r, _COLOR.g, _COLOR.b) },
      uOpacity: { value: this.cfg.opacity },
      uEdgeSdf: { value: null },
      uRimPrev: { value: null },
      uRimState: { value: null },
      uCursorUv: { value: new THREE.Vector2(0.5, 0.5) },
      uSdfEps: { value: 1.5 / 256 },
      uRimGate: { value: 0 },
      uArm: { value: 0.15 },
      uArmRamp: { value: 1 },
      uInsideFree: { value: this.cfg.rimInsideFree },
      uSlurpBand: { value: this.cfg.rimSlurpBand },
      uBlowExponent: { value: this.cfg.blowExponent },
      uNeckPinch: { value: this.cfg.neckPinch },
      uRecoilPushPx: { value: this.cfg.recoilPushPx },
      uSnap: { value: this.cfg.snapThreshold },
      uSmooth: { value: this.cfg.rimFieldSmooth },
      uDt: { value: 1 / 60 },
      uRimSlurp: { value: this.cfg.rimSlurp },
      uQuadPx: { value: this._quadPx }
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: waterCursorVertexShader,
      fragmentShader: waterCursorFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this._sdfDummy = new THREE.DataTexture(
      new Float32Array([0, 0, 0, 1]),
      1,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this._sdfDummy.minFilter = THREE.NearestFilter;
    this._sdfDummy.magFilter = THREE.NearestFilter;
    this._sdfDummy.colorSpace = THREE.NoColorSpace;
    this._sdfDummy.needsUpdate = true;
    this.uniforms.uEdgeSdf.value = this._sdfDummy;

    const rimRT = () => {
      const rt = new THREE.WebGLRenderTarget(2, 1, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false
      });
      rt.texture.colorSpace = THREE.NoColorSpace;
      return rt;
    };
    this._rimRead = rimRT();
    this._rimWrite = rimRT();
    this.uniforms.uRimPrev.value = this._rimRead.texture;
    this.uniforms.uRimState.value = this._rimRead.texture;

    this._rimScene = new THREE.Scene();
    this._rimCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._rimMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: waterCursorRimResolveVertexShader,
      fragmentShader: waterCursorRimResolveShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.NoBlending,
      transparent: false
    });
    const rimQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._rimMat);
    rimQuad.frustumCulled = false;
    this._rimScene.add(rimQuad);
    this._clearRimTarget(this._rimRead);
    this._clearRimTarget(this._rimWrite);

    this._pressTween = null;
    this._presenceTween = null;
    /** Pointer inside the document viewport (CSS pixel bounds). Start hidden. */
    this._inViewport = false;
    /** True while pointer is over Mail / case-study chrome — blob shrinks away. */
    this._uiChromeSuppressed = false;
    /** Last presence show target (viewport ∧ !chrome). */
    this._presenceTargetShow = false;

    this._headless = Boolean(headless);

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onDocumentLeave = this._onDocumentLeave.bind(this);
    this._onDocumentEnter = this._onDocumentEnter.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onVisibilityChange = this._onVisibilityChange.bind(this);
    this._tick = this._tick.bind(this);

    if (!this._headless) {
      window.addEventListener("pointermove", this._onPointerMove, { passive: true });
      document.documentElement.addEventListener("mouseleave", this._onDocumentLeave);
      document.documentElement.addEventListener("mouseenter", this._onDocumentEnter);
      window.addEventListener("pointerdown", this._onPointerDown, { passive: true });
      window.addEventListener("pointerup", this._onPointerUp, { passive: true });
      document.addEventListener("visibilitychange", this._onVisibilityChange);
    }

    this.ticker.add(this._tick);

    if (width > 0 && height > 0) this.resize(width, height);
    else this.resize(window.innerWidth || 1, window.innerHeight || 1);
    this._applyHiddenNativeCursor();
    this._initialized = true;
  }

  /**
   * @param {ConstructorParameters<typeof WaterCursor>[0]} options
   * @returns {WaterCursor | null}
   */
  static tryCreate(options) {
    const fine = options.pointerFine ?? window.matchMedia("(pointer: fine)").matches;
    if (!fine) return null;

    const reduced = options.reducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cfg = sanitizeWaterCursorConfig(options.config ?? {});
    if (reduced && cfg.reducedMotionSkip) return null;

    try {
      return new WaterCursor({ ...options, config: cfg });
    } catch (error) {
      console.warn("[WaterCursor] Init failed:", error);
      return null;
    }
  }

  get initialized() {
    return this._initialized;
  }

  /** @param {boolean} _on — size stays constant on this site. */
  setHover(_on) {}

  /** @param {boolean} on */
  setPressed(on) {
    if (!this._initialized || this._disposed) return;
    this._markMotion();
    this._pressTween?.kill();
    this._pressTween = gsap.to(this.uniforms.uPressScale, {
      value: on ? this.cfg.pressScale : 1,
      duration: this.cfg.pressDuration,
      ease: this.cfg.pressEase,
      overwrite: true
    });
  }

  /**
   * Bind the bust edge SDF and live response knobs. The blob shader consumes
   * a 2×1 GPU state target — nothing is read back to the CPU.
   * @param {{
   *   gate?: boolean,
   *   texture?: THREE.Texture | null,
   *   size?: number,
   *   arm?: number,
   *   ramp?: number,
   *   u?: number,
   *   v?: number
   * }} [src]
   */
  setRimGpu(src = {}) {
    if (!this._initialized || this._disposed) return;
    this._syncRimKnobs();
    const gate = Boolean(src.gate) && this.deformEnabled;
    const tex = src.texture ?? this._sdfDummy;
    if ((gate ? 1 : 0) !== this.uniforms.uRimGate.value || tex !== this.uniforms.uEdgeSdf.value) this._markMotion();
    this.uniforms.uRimGate.value = gate ? 1 : 0;
    this.uniforms.uCursorUv.value.set(
      Number.isFinite(src.u) ? src.u : 0,
      Number.isFinite(src.v) ? src.v : 0
    );
    const size = Math.max(1, Number.isFinite(src.size) ? src.size : 256);
    this.uniforms.uSdfEps.value = 1.5 / size;
    if (Number.isFinite(src.arm)) this.uniforms.uArm.value = src.arm;
    if (Number.isFinite(src.ramp)) this.uniforms.uArmRamp.value = src.ramp;
    this.uniforms.uEdgeSdf.value = src.texture ?? this._sdfDummy;
  }

  /** Push Shift+C / config response constants into the rim shader. */
  _syncRimKnobs() {
    this.uniforms.uBlowExponent.value = this.cfg.blowExponent;
    this.uniforms.uNeckPinch.value = this.cfg.neckPinch;
    this.uniforms.uRecoilPushPx.value = this.cfg.recoilPushPx;
    this.uniforms.uSlurpBand.value = this.cfg.rimSlurpBand;
    this.uniforms.uSnap.value = this.cfg.snapThreshold;
    this.uniforms.uInsideFree.value = this.cfg.rimInsideFree;
    this.uniforms.uSmooth.value = this.cfg.rimFieldSmooth;
    this.uniforms.uRimSlurp.value = this.cfg.rimSlurp;
    this.uniforms.uQuadPx.value = this._quadPx;
  }

  /**
   * Live rim RESPONSE knobs (WaterCursorRimTuner) — glitch params untouched.
   * @param {Partial<{
   *   blowExponent: number,
   *   neckPinch: number,
   *   recoilPushPx: number,
   *   slurpBand: number,
   *   snapThreshold: number
   * }>} partial
   */
  setRimParams(partial = {}) {
    if (!this._initialized || this._disposed) return null;
    const next = sanitizeWaterCursorConfig({
      ...this.cfg,
      blowExponent: partial.blowExponent ?? this.cfg.blowExponent,
      neckPinch: partial.neckPinch ?? this.cfg.neckPinch,
      recoilPushPx: partial.recoilPushPx ?? this.cfg.recoilPushPx,
      rimSlurpBand: partial.slurpBand ?? this.cfg.rimSlurpBand,
      snapThreshold: partial.snapThreshold ?? this.cfg.snapThreshold
    });
    this.cfg.blowExponent = next.blowExponent;
    this.cfg.neckPinch = next.neckPinch;
    this.cfg.recoilPushPx = next.recoilPushPx;
    this.cfg.rimSlurpBand = next.rimSlurpBand;
    this.cfg.snapThreshold = next.snapThreshold;
    this._syncRimKnobs();
    return this.getRimParams();
  }

  /** @returns {Record<string, number>} */
  getRimParams() {
    return {
      blowExponent: this.cfg.blowExponent,
      neckPinch: this.cfg.neckPinch,
      recoilPushPx: this.cfg.recoilPushPx,
      slurpBand: this.cfg.rimSlurpBand,
      snapThreshold: this.cfg.snapThreshold
    };
  }

  /** @param {number} width @param {number} height — CSS pixels. */
  resize(width, height) {
    if (this._disposed) return;
    this._width = Math.max(1, finite(width, 1));
    this._height = Math.max(1, finite(height, 1));
    this.camera.left = 0;
    this.camera.right = this._width;
    this.camera.top = 0;
    this.camera.bottom = this._height;
    this.camera.position.set(0, 0, 1);
    this.camera.updateProjectionMatrix();
    this.mesh.scale.set(this._quadPx, this._quadPx, 1);
    if (this.uniforms?.uQuadPx) this.uniforms.uQuadPx.value = this._quadPx;
  }

  /**
   * Pass K item 7 — run the rim sim (2×1 state target) *before* the composer
   * draws the frame, and not at all once the blob has been still for
   * RIM_IDLE_MS: the field damps at rimFieldSmooth (16/s → 3e-4 left after
   * 0.5 s), so a still cursor's state is already converged and the shader
   * keeps sampling it unchanged — the quad itself (and its uTime idle
   * wobble) still draws every frame, so nothing snaps. Resolving after the
   * frame was drawn switched the canvas out for a 2×1 target and back each
   * frame (a full framebuffer store/reload on tiled GPUs).
   */
  prepare() {
    if (!this._initialized || this._disposed) return;
    this._preparedThisFrame = true;
    if (this._rimIdle()) {
      this._rimSkips = (this._rimSkips ?? 0) + 1;
      return;
    }
    this._rimRuns = (this._rimRuns ?? 0) + 1;
    try {
      this._resolveRimState();
    } catch (error) {
      if (!this._renderWarned) {
        this._renderWarned = true;
        console.warn("[WaterCursor] Rim resolve failed:", error);
      }
    }
  }

  /** Pass K item 7 — still long enough that the rim field has converged. */
  _rimIdle() {
    return performance.now() - (this._lastMotionAt ?? 0) > RIM_IDLE_MS;
  }

  _markMotion() {
    this._lastMotionAt = performance.now();
  }

  /**
   * DEV/Pass K item 7 — proof the idle freeze cannot snap: read the frozen
   * 2×1 rim state, run one live resolve from it, read again; max |Δ| per
   * channel. ~0 means the frozen state is what the live sim would hold.
   */
  debugRimFreezeDelta() {
    const read = (target) => {
      const buf = new Float32Array(2 * 4);
      try {
        this.renderer.readRenderTargetPixels(target, 0, 0, 2, 1, buf);
      } catch (error) {
        return null;
      }
      return Array.from(buf);
    };
    const before = read(this._rimRead);
    this._resolveRimState();
    const after = read(this._rimRead);
    if (!before || !after) return null;
    const maxDelta = Math.max(...before.map((v, i) => Math.abs(v - after[i])));
    return { idle: this._rimIdle(), before: before.map((v) => +v.toFixed(5)), after: after.map((v) => +v.toFixed(5)), maxDelta: +maxDelta.toExponential(2) };
  }

  /** DEV — rim sim runs vs idle skips. */
  debugRim() {
    return { runs: this._rimRuns ?? 0, skips: this._rimSkips ?? 0, idle: this._rimIdle(), stillMs: Math.round(performance.now() - (this._lastMotionAt ?? 0)) };
  }

  render() {
    if (!this._initialized || this._disposed) return;

    try {
      const gl = this.renderer.getContext?.();
      if (gl && gl.isContextLost?.()) return;

      if (!this._preparedThisFrame && !this._rimIdle()) this._resolveRimState();
      this._preparedThisFrame = false;
      if (this.uniforms.uPresence.value < 0.001) return;

      const prevAutoClear = this.renderer.autoClear;
      const prevTarget = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(null);
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.scene, this.camera);
      this.renderer.autoClear = prevAutoClear;
      this.renderer.setRenderTarget(prevTarget);
    } catch (error) {
      if (!this._renderWarned) {
        this._renderWarned = true;
        console.warn("[WaterCursor] Render failed:", error);
      }
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._initialized = false;

    this.ticker.remove?.(this._tick);
    window.removeEventListener("pointermove", this._onPointerMove);
    document.documentElement.removeEventListener("mouseleave", this._onDocumentLeave);
    document.documentElement.removeEventListener("mouseenter", this._onDocumentEnter);
    window.removeEventListener("pointerdown", this._onPointerDown);
    window.removeEventListener("pointerup", this._onPointerUp);
    document.removeEventListener("visibilitychange", this._onVisibilityChange);

    this._pressTween?.kill();
    this._presenceTween?.kill();
    this._restoreNativeCursor();

    this.mesh.geometry.dispose();
    this.material.dispose();
    this._rimMat?.dispose();
    this._rimRead?.dispose();
    this._rimWrite?.dispose();
    this._sdfDummy?.dispose();
  }

  /** Zero the rim state so the first damp step does not inherit garbage texels. */
  _clearRimTarget(target) {
    const renderer = this.renderer;
    const prevTarget = renderer.getRenderTarget();
    const prevColor = new THREE.Color();
    const prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(prevColor);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.setClearColor(prevColor, prevAlpha);
    renderer.setRenderTarget(prevTarget);
  }

  /**
   * SDF taps + response curves into a 2×1 float target. Never readPixels.
   */
  _resolveRimState() {
    const now = performance.now();
    this._rimDtSec = clampDeltaSeconds(now - this._rimClock);
    this._rimClock = now;
    this.uniforms.uDt.value = this._rimDtSec;

    const read = this._rimRead;
    const write = this._rimWrite;
    this.uniforms.uRimPrev.value = read.texture;

    const renderer = this.renderer;
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevTone = renderer.toneMapping;
    try {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setRenderTarget(write);
      renderer.autoClear = true;
      renderer.clear();
      renderer.render(this._rimScene, this._rimCam);
      this._rimRead = write;
      this._rimWrite = read;
      this.uniforms.uRimState.value = write.texture;
    } finally {
      renderer.toneMapping = prevTone;
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget);
    }
  }

  _onPointerMove(event) {
    if (this._disposed) return;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    const x = event.clientX;
    const y = event.clientY;
    const inside = this._isPointerInViewport(x, y);
    if (!this._hasPointerSample) {
      if (!inside) return;
      this.appearAt(x, y);
      return;
    }
    this._pointer.x = x;
    this._pointer.y = y;
    this._syncViewportPresence(inside);
  }

  _isPointerInViewport(x, y) {
    return (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= 0 &&
      x <= this._width &&
      y >= 0 &&
      y <= this._height
    );
  }

  /**
   * Pop the blob onto a known CSS-pixel pointer (boot sample or first enter).
   * Slight positional / stretch recoil — never spawns at screen center.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  appearAt(x, y) {
    if (this._disposed || !this._initialized) return false;
    if (!this._isPointerInViewport(x, y)) return false;

    this._hasPointerSample = true;
    this._pointer.set(x, y);
    // Seed a short offset so the follower + presence spring read as a pop/recoil.
    const kick = 12;
    this._pos.set(x + kick * 0.4, y - kick * 0.25);
    this._velocity.set(-kick * 14, kick * 6);
    this._omega = 0.35;
    this._syncViewportPresence(true);
    return true;
  }

  _onDocumentLeave() {
    if (this._disposed) return;
    this._syncViewportPresence(false);
  }

  _onDocumentEnter() {
    if (this._disposed) return;
    if (!this._hasPointerSample) return;
    this._syncViewportPresence(this._isPointerInViewport(this._pointer.x, this._pointer.y));
  }

  _applyHiddenNativeCursor() {
    if (document.body?.style) document.body.style.cursor = "none";
    if (this.renderer.domElement?.style) this.renderer.domElement.style.cursor = "none";
  }

  _restoreNativeCursor() {
    if (document.body?.style) document.body.style.cursor = "";
    if (this.renderer.domElement?.style) this.renderer.domElement.style.cursor = "";
  }

  /**
   * CSS-pixel pointer in the same space as `resize` (canvas-local in the worker).
   * @param {number} x
   * @param {number} y
   * @param {boolean} [inside]
   */
  setPointer(x, y, inside = true) {
    if (this._disposed) return;
    if (!inside || !Number.isFinite(x) || !Number.isFinite(y)) {
      this._syncViewportPresence(false);
      return;
    }
    if (!this._hasPointerSample) {
      this.appearAt(x, y);
      return;
    }
    if (x !== this._pointer.x || y !== this._pointer.y) this._markMotion();
    this._pointer.x = x;
    this._pointer.y = y;
    this._syncViewportPresence(this._isPointerInViewport(x, y));
  }

  /**
   * Hide / shrink the blob while the pointer is over DOM UI chrome
   * (Mail panel, case study modal). Restores the system cursor so chrome
   * stays usable; re-hides native cursor when returning to open stage.
   * @param {boolean} suppressed
   */
  setUiChromeSuppressed(suppressed) {
    if (this._disposed || !this._initialized) return;
    const next = Boolean(suppressed);
    if (this._uiChromeSuppressed === next) return;
    this._uiChromeSuppressed = next;
    if (next) {
      this._restoreNativeCursor();
    } else if (this._inViewport) {
      this._applyHiddenNativeCursor();
    }
    this._syncViewportPresence(this._inViewport);
  }

  /**
   * Shrink + fade out when the pointer leaves the viewport (or UI chrome);
   * grow back when returning to open stage space.
   * @param {boolean} inside
   */
  _syncViewportPresence(inside) {
    this._inViewport = Boolean(inside);
    const show = this._inViewport && !this._uiChromeSuppressed;
    if (this._presenceTargetShow === show) return;
    this._presenceTargetShow = show;

    this._presenceTween?.kill();

    if (!show) {
      this._presenceUseSpring = false;
      this._velocity.multiplyScalar(0.35);
      this._omega *= 0.35;
      this._presenceSpring.target = 0;
      this._presenceSpring.velocity = 0;
      this._presenceTween = gsap.to(this.uniforms.uPresence, {
        value: 0,
        duration: this.cfg.presenceHideDuration,
        ease: this.cfg.presenceHideEase,
        overwrite: true
      });
      return;
    }

    this._presenceTween?.kill();
    this._presenceTween = null;

    if (this.reducedMotion) {
      this._presenceUseSpring = false;
      this._presenceTween = gsap.to(this.uniforms.uPresence, {
        value: 1,
        duration: this.cfg.presenceShowDuration,
        ease: this.cfg.presenceShowEase,
        overwrite: true
      });
      return;
    }

    this._beginPresenceEnterSpring();
  }

  /** Spring bounce-in with stretch/spin kick — show path only. */
  _beginPresenceEnterSpring() {
    const current = finite(this.uniforms.uPresence.value, 0);
    this._presenceSpring.value = Math.max(0, current);
    this._presenceSpring.velocity = this.cfg.presenceEnterVelocityKick;
    this._presenceSpring.target = 1;
    this._presenceUseSpring = true;
    this.uniforms.uPresence.value = this._presenceSpring.value;

    if (!this.deformEnabled) return;

    const dx = this._pointer.x - this._pos.x;
    const dy = this._pointer.y - this._pos.y;
    const dist = Math.hypot(dx, dy);
    const catchUp = Math.min(dist / 140, 1);

    this._stretchSpring.target = this.cfg.maxStretch * 0.32 * catchUp;
    this._stretchSpring.velocity += this.cfg.presenceEnterStretchKick * catchUp;

    if (dist > 1e-3) {
      const leadAngle = Math.atan2(dy, dx);
      let diff = leadAngle - this._angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this._omega += diff * this.cfg.presenceEnterSpinKick * catchUp;
    }
  }

  _updatePresenceSpring(dt) {
    if (!this._presenceUseSpring) return;

    this._presenceSpring.update(dt);
    this.uniforms.uPresence.value = Math.max(0, this._presenceSpring.value);

    const settled =
      Math.abs(this._presenceSpring.value - 1) < 0.004 &&
      Math.abs(this._presenceSpring.velocity) < 0.06;

    if (!settled) return;

    this._presenceUseSpring = false;
    this._presenceSpring.value = 1;
    this._presenceSpring.velocity = 0;
    this._presenceSpring.target = 1;
    this.uniforms.uPresence.value = 1;
  }

  _onPointerDown() {
    if (this._disposed) return;
  }

  _onPointerUp() {
    if (this._disposed) return;
    this.setPressed(false);
  }

  /** Tab hidden — hide blob; restore from pointer position when visible again. */
  _onVisibilityChange() {
    if (this._disposed) return;
    if (document.visibilityState === "hidden") {
      this._velocity.set(0, 0);
      this._omega *= 0.25;
      this._syncViewportPresence(false);
      return;
    }
    if (!this._hasPointerSample) return;
    this._syncViewportPresence(this._isPointerInViewport(this._pointer.x, this._pointer.y));
  }

  /** @param {number} _time @param {number} deltaTimeMs — gsap.ticker delta (MILLISECONDS). */
  _tick(_time, deltaTimeMs) {
    if (!this._initialized || this._disposed) return;
    // Stay fully dormant until we know a real pointer location (no center spawn).
    if (!this._hasPointerSample) {
      this.uniforms.uPresence.value = 0;
      return;
    }

    const dt = clampDeltaSeconds(deltaTimeMs);
    this.uniforms.uTime.value = performance.now() * 0.001;

    const guided =
      this._diskShear &&
      Number.isFinite(this._diskShear.guideX) &&
      Number.isFinite(this._diskShear.guideY);
    if (this._diskYank > 0) this._diskYank = Math.max(0, this._diskYank - dt);
    const followRate = this._diskYank > 0 ? 32 : guided ? 16 : this.cfg.followRate;
    const targetX = guided ? this._diskShear.guideX : this._pointer.x;
    const targetY = guided ? this._diskShear.guideY : this._pointer.y;

    const prevX = this._pos.x;
    const prevY = this._pos.y;
    this._pos.x = damp(this._pos.x, targetX, followRate, dt);
    this._pos.y = damp(this._pos.y, targetY, followRate, dt);

    const vx = (this._pos.x - prevX) / dt;
    const vy = (this._pos.y - prevY) / dt;
    this._velocity.x = damp(this._velocity.x, vx, this.cfg.velocityFilterRate, dt);
    this._velocity.y = damp(this._velocity.y, vy, this.cfg.velocityFilterRate, dt);

    this._updateDirection(dt);

    if (this.deformEnabled) {
      const turn = Math.min(Math.abs(this._omega) / this.cfg.omegaMax, 1);
      this._waveSpring.target = this.cfg.waveAmp * turn;
      const waveAmp = Math.min(Math.max(this._waveSpring.update(dt), 0), MAX_WAVE_AMP);
      this._wavePhase = wrapAngle(this._wavePhase + this._omega * this.cfg.waveTravel * dt);

      this.uniforms.uWaveAmp.value = waveAmp;
      this.uniforms.uWavePhase.value = this._wavePhase;

      const speedPx = this._velocity.length();
      const speed = Math.min(speedPx / this.cfg.maxSpeed, 1);
      const captured = (this._diskShear?.strength ?? 0) > 0;
      const shapedSpeed = Math.pow(Math.max(speed, 0), this.cfg.speedResponseExponent);

      this._stretchSpring.target = captured
        ? Math.max(this.cfg.maxStretch * shapedSpeed, 0.34)
        : this.cfg.maxStretch * shapedSpeed;
      this._stretchSpring.update(dt);
      this._stretch = THREE.MathUtils.clamp(
        this._stretchSpring.value,
        -this.cfg.maxStretchOvershoot,
        this.cfg.maxStretch
      );
    } else {
      this._stretchSpring.reset();
      this._stretch = 0;
      this._waveSpring.reset();
      this._omega = 0;
      this.uniforms.uWaveAmp.value = 0;
      this.uniforms.uWavePhase.value = 0;
    }

    if (!this._sanitizeState()) return;

    this._updatePresenceSpring(dt);

    this._applyDiskShear(dt);

    this.uniforms.uStretch.value = this._stretch;
    this.uniforms.uAngle.value = this._angle;
    this.uniforms.uGravity.value = this.deformEnabled ? (this._diskShear?.strength ?? 0) : 0;
    this.uniforms.uCurve.value = this.deformEnabled ? (this._diskShear?.curve ?? 0) : 0;
    const shear = this._diskShear;
    const quad = this._quadPx;
    if (shear && shear.behind > 0 && quad > 1 && Number.isFinite(shear.holeX)) {
      this.uniforms.uHoleHide.value = shear.behind;
      this.uniforms.uHoleUv.value.set(
        0.5 + (shear.holeX - this._pos.x) / quad,
        0.5 + (shear.holeY - this._pos.y) / quad
      );
      this.uniforms.uHoleRad.value = shear.holeRad / quad;
    } else {
      this.uniforms.uHoleHide.value = 0;
    }
    this.uniforms.uRimPress.value = 1;
    this.mesh.position.set(this._pos.x, this._pos.y, 0);
    const moving =
      Math.abs(this._pos.x - targetX) > 0.05 ||
      Math.abs(this._pos.y - targetY) > 0.05 ||
      this._velocity.length() > 1 ||
      Math.abs(this._stretch) > 1e-3 ||
      this.uniforms.uWaveAmp.value > 1e-3 ||
      Math.abs(this._omega) > 1e-3 ||
      this._presenceUseSpring ||
      (this._diskShear?.strength ?? 0) > 0 ||
      this._diskYank > 0;
    if (moving) this._markMotion();
  }

  /**
   * Captured disk orbit. Null returns the blob to the pointer.
   * @param {{ strength: number, angle: number } | null} shear
   */
  setDiskShear(shear) {
    if (!shear || !(shear.strength > 0) || !Number.isFinite(shear.angle)) {
      if (this._diskShear) this._diskYank = 0.22;
      this._diskShear = null;
      return;
    }
    this._diskYank = 0;
    this._diskShear = {
      strength: Math.min(shear.strength, 0.92),
      angle: shear.angle,
      guideX: shear.guideX,
      guideY: shear.guideY,
      curve: Number.isFinite(shear.curve) ? shear.curve : 0,
      behind: Number.isFinite(shear.behind) ? shear.behind : 0,
      holeX: shear.holeX,
      holeY: shear.holeY,
      holeRad: Number.isFinite(shear.holeRad) ? shear.holeRad : 0
    };
  }

  /**
   * Heading follows the disk flow. A still pointer locks to that tangent
   * instead of coasting — coasting was what snapped the blob vertical.
   * The track guide owns translation, so this does not drift the position.
   * @param {number} dt
   */
  _applyDiskShear(dt) {
    const shear = this._diskShear;
    const strength = shear?.strength ?? 0;
    if (!(strength > 0) || !this.deformEnabled) return;
    const speedPx = this._velocity.length();
    if (speedPx < this.cfg.directionSpeedThreshold) {
      this._angle = shear.angle;
      this._omega = 0;
      return;
    }
    const speed = Math.min(speedPx / 900, 1);
    const steer = strength * (1 - speed * 0.6);
    let diff = shear.angle - this._angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this._angle = wrapAngle(this._angle + diff * (1 - Math.exp(-10 * steer * dt)));
  }

  /**
   * Heading tracks velocity while moving; coasts on angular momentum when stopped.
   * Radial deformations spring; rotation has inertia — no return force.
   * Rim teardrop axis is the GPU tip angle, not this heading.
   */
  _updateDirection(dt) {
    const speedPx = this._velocity.length();

    if (speedPx > this.cfg.directionSpeedThreshold) {
      const targetAngle = Math.atan2(this._velocity.y, this._velocity.x);
      let diff = targetAngle - this._angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const step = diff * (1 - Math.exp(-this.cfg.angleRate * dt));
      this._angle += step;
      this._omega = damp(this._omega, step / dt, this.cfg.omegaTrackRate, dt);
    } else {
      this._angle += this._omega * dt;
      this._omega *= Math.exp(-this.cfg.angularFriction * dt);
    }

    this._angle = wrapAngle(this._angle);
    this._omega = finite(this._omega, 0);
    if (Math.abs(this._omega) < OMEGA_EPS) this._omega = 0;
    this._omega = Math.sign(this._omega || 1) * Math.min(Math.abs(this._omega), MAX_OMEGA);
  }

  /** Recover from numerical blow-up instead of poisoning the shader. */
  _sanitizeState() {
    const bad =
      !Number.isFinite(this._pos.x) ||
      !Number.isFinite(this._pos.y) ||
      !Number.isFinite(this._velocity.x) ||
      !Number.isFinite(this._velocity.y) ||
      !Number.isFinite(this._angle) ||
      !Number.isFinite(this._omega) ||
      !Number.isFinite(this._stretch);

    if (!bad) return true;

    console.warn("[WaterCursor] State corruption recovered");
    if (this._hasPointerSample && Number.isFinite(this._pointer.x)) {
      this._pos.copy(this._pointer);
    } else {
      this._pos.set(0, 0);
    }
    this._velocity.set(0, 0);
    this._angle = 0;
    this._omega = 0;
    this._stretch = 0;
    this._wavePhase = 0;
    this._stretchSpring.reset();
    this._waveSpring.reset();
    if (this._hasPointerSample && this._inViewport) {
      this._presenceSpring.target = 1;
      this._presenceSpring.value = 1;
      this.uniforms.uPresence.value = 1;
    } else {
      this._presenceSpring.target = 0;
      this._presenceSpring.value = 0;
      this.uniforms.uPresence.value = 0;
    }
    this._presenceSpring.velocity = 0;
    this._presenceUseSpring = false;
    return true;
  }
}
