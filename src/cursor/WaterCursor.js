import * as THREE from "three";
import gsap from "gsap";
import {
  DEFAULT_WATER_CURSOR_CONFIG,
  WATER_CURSOR_VERSION
} from "./waterCursorConfig.js";
import { damp, Spring } from "./waterCursorSpring.js";
import { waterCursorVertexShader, waterCursorFragmentShader } from "./waterCursorShaders.js";
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
export class WaterCursor {
  /**
   * @param {{ renderer: THREE.WebGLRenderer, ticker: { add: Function, remove: Function }, config?: Partial<typeof DEFAULT_WATER_CURSOR_CONFIG> }} options
   */
  constructor({ renderer, ticker, config = {} }) {
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

    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.deformEnabled =
      !this.reducedMotion || !this.cfg.reducedMotionPlain;

    this._width = 1;
    this._height = 1;
    this._initialized = false;
    this._disposed = false;
    this._renderWarned = false;

    /** Raw pointer target — CSS pixels, top-left origin. Events only write here. */
    this._pointer = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5);
    /** Smoothed follower position — CSS pixels. */
    this._pos = this._pointer.clone();
    /** Filtered velocity — px/s. */
    this._velocity = new THREE.Vector2();
    /** Motion heading — radians. */
    this._angle = 0;
    /** Angular momentum — rad/s, coasts after stop. */
    this._omega = 0;
    /** Signed stretch from spring (can go negative on settle). */
    this._stretch = 0;

    this._stretchSpring = new Spring(this.cfg.springStiffness, this.cfg.springDamping);
    this._waveSpring = new Spring(this.cfg.waveStiffness, this.cfg.waveDamping);
    this._presenceSpring = new Spring(
      this.cfg.presenceSpringStiffness,
      this.cfg.presenceSpringDamping
    );
    this._presenceSpring.target = 1;
    this._presenceUseSpring = false;
    this._wavePhase = 0;

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
      uTailBias: { value: this.cfg.tailBias },
      uPressScale: { value: 1 },
      uPresence: { value: 1 },
      uRadius: { value: this._baseRadiusUv },
      uIdleRadiusWobble: {
        value: this.deformEnabled ? this.cfg.idleRadiusWobble : 0
      },
      uWaveAmp: { value: 0 },
      uWavePhase: { value: 0 },
      uDeformEnabled: { value: this.deformEnabled ? 1 : 0 },
      uColor: { value: new THREE.Vector3(_COLOR.r, _COLOR.g, _COLOR.b) },
      uOpacity: { value: this.cfg.opacity }
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

    this._pressTween = null;
    this._presenceTween = null;
    /** Pointer inside the document viewport (CSS pixel bounds). */
    this._inViewport = true;

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onDocumentLeave = this._onDocumentLeave.bind(this);
    this._onDocumentEnter = this._onDocumentEnter.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onVisibilityChange = this._onVisibilityChange.bind(this);
    this._tick = this._tick.bind(this);

    window.addEventListener("pointermove", this._onPointerMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", this._onDocumentLeave);
    document.documentElement.addEventListener("mouseenter", this._onDocumentEnter);
    window.addEventListener("pointerdown", this._onPointerDown, { passive: true });
    window.addEventListener("pointerup", this._onPointerUp, { passive: true });
    document.addEventListener("visibilitychange", this._onVisibilityChange);

    this.ticker.add(this._tick);

    this.resize(window.innerWidth, window.innerHeight);
    this._applyHiddenNativeCursor();
    this._initialized = true;
  }

  /**
   * @param {ConstructorParameters<typeof WaterCursor>[0]} options
   * @returns {WaterCursor | null}
   */
  static tryCreate(options) {
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine) return null;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    this._pressTween?.kill();
    this._pressTween = gsap.to(this.uniforms.uPressScale, {
      value: on ? this.cfg.pressScale : 1,
      duration: this.cfg.pressDuration,
      ease: this.cfg.pressEase,
      overwrite: true
    });
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
  }

  render() {
    if (!this._initialized || this._disposed) return;
    if (this.uniforms.uPresence.value < 0.001) return;

    try {
      const gl = this.renderer.getContext?.();
      if (gl && gl.isContextLost?.()) return;

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
  }

  _onPointerMove(event) {
    if (this._disposed) return;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    this._pointer.x = event.clientX;
    this._pointer.y = event.clientY;
    this._syncViewportPresence(this._isPointerInViewport(event.clientX, event.clientY));
  }

  _isPointerInViewport(x, y) {
    return x >= 0 && x <= this._width && y >= 0 && y <= this._height;
  }

  _onDocumentLeave() {
    if (this._disposed) return;
    this._syncViewportPresence(false);
  }

  _onDocumentEnter() {
    if (this._disposed) return;
    this._syncViewportPresence(this._isPointerInViewport(this._pointer.x, this._pointer.y));
  }

  _applyHiddenNativeCursor() {
    document.body.style.cursor = "none";
    this.renderer.domElement.style.cursor = "none";
  }

  _restoreNativeCursor() {
    document.body.style.cursor = "";
    this.renderer.domElement.style.cursor = "";
  }

  /**
   * Shrink + fade out when the pointer leaves the viewport; grow back on return.
   * @param {boolean} inside
   */
  _syncViewportPresence(inside) {
    if (this._inViewport === inside) return;
    this._inViewport = inside;

    this._presenceTween?.kill();

    if (!inside) {
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
    this._syncViewportPresence(this._isPointerInViewport(this._pointer.x, this._pointer.y));
  }

  /** @param {number} _time @param {number} deltaTimeMs — gsap.ticker delta (MILLISECONDS). */
  _tick(_time, deltaTimeMs) {
    if (!this._initialized || this._disposed) return;

    const dt = clampDeltaSeconds(deltaTimeMs);
    this.uniforms.uTime.value = performance.now() * 0.001;

    const prevX = this._pos.x;
    const prevY = this._pos.y;
    this._pos.x = damp(this._pos.x, this._pointer.x, this.cfg.followRate, dt);
    this._pos.y = damp(this._pos.y, this._pointer.y, this.cfg.followRate, dt);

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
      const shapedSpeed = Math.pow(Math.max(speed, 0), this.cfg.speedResponseExponent);

      this._stretchSpring.target = this.cfg.maxStretch * shapedSpeed;
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

    this.uniforms.uStretch.value = this._stretch;
    this.uniforms.uAngle.value = this._angle;
    this.mesh.position.set(this._pos.x, this._pos.y, 0);
  }

  /**
   * Heading tracks velocity while moving; coasts on angular momentum when stopped.
   * Radial deformations spring; rotation has inertia — no return force.
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
    this._pos.copy(this._pointer);
    this._velocity.set(0, 0);
    this._angle = 0;
    this._omega = 0;
    this._stretch = 0;
    this._wavePhase = 0;
    this._stretchSpring.reset();
    this._waveSpring.reset();
    this._presenceSpring.target = 1;
    this._presenceSpring.value = 1;
    this._presenceSpring.velocity = 0;
    this._presenceUseSpring = false;
    this.uniforms.uPresence.value = 1;
    return true;
  }
}
