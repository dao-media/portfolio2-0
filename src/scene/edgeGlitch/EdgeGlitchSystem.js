import * as THREE from "three";
import {
  EDGE_GLITCH_ARM_RAMP,
  EDGE_GLITCH_BAND_OUTER,
  EDGE_GLITCH_CURSOR_OUTER,
  EDGE_GLITCH_DEBUG,
  EDGE_GLITCH_GLITCH_ARM_OUTER,
  EDGE_GLITCH_INTENSITY,
  EDGE_GLITCH_LIQUID_ARM_OUTER,
  EDGE_GLITCH_OCC_BIAS,
  EDGE_GLITCH_OCC_SOFT,
  EDGE_GLITCH_RGB_SPLIT,
  EDGE_GLITCH_SDF_SIZE,
  EDGE_GLITCH_SPAN_ALONG,
  EDGE_GLITCH_SPAN_IN,
  EDGE_GLITCH_SPAN_OUT,
  EDGE_GLITCH_STAGE,
  EDGE_GLITCH_TEAR_BANDS,
  createEdgeGlitchParams
} from "./constants.js";
import { EdgeSilhouetteSdf } from "./EdgeSilhouetteSdf.js";
import { createEdgeBandDebugOverlay } from "./EdgeBandDebugOverlay.js";
import { EdgeGlitchPass } from "./EdgeGlitchPass.js";

/**
 * Cursor-proximity edge glitch — restored 9/15–9/16 beauty tears + RGB.
 * SDF / diamond / occlusion / proximity. Shift+G.
 */
export class EdgeGlitchSystem {
  /**
   * @param {{
   *   renderer: THREE.WebGLRenderer,
   *   scene: THREE.Scene,
   *   camera: THREE.Camera,
   *   reducedMotion?: boolean,
   *   glitchPass?: EdgeGlitchPass | null
   * }} opts
   */
  constructor(opts) {
    this.renderer = opts.renderer;
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.reducedMotion = Boolean(opts.reducedMotion);
    this.enabled = !this.reducedMotion && EDGE_GLITCH_STAGE >= 1;
    this.stage = EDGE_GLITCH_STAGE;
    this.debug = EDGE_GLITCH_DEBUG;

    this.sdf = new EdgeSilhouetteSdf(this.renderer, { size: EDGE_GLITCH_SDF_SIZE });
    this.resolution = new THREE.Vector2(1, 1);
    this._overlay = null;
    /** @type {THREE.Object3D | null} */
    this._activeRoot = null;
    /** @type {THREE.Object3D[]} */
    this._activeRoots = [];
    /** Stable uuid join — skip SDF rebuild when the set is unchanged. */
    this._activeRootsKey = "";
    /** @deprecated alias of _activeRoot when bust is active */
    this._bustRoot = null;
    this._applied = false;
    this._workQuality = 1;
    this._pointerNdc = new THREE.Vector2(0, 0);
    this._pointerLive = false;
    this._cursorUv = new THREE.Vector2(-1, -1);
    /** @type {Record<string, number>} live tuner / constants snapshot */
    this._params = createEdgeGlitchParams();
    /** @type {THREE.Texture | null} FogDepthCapture packed scene depth */
    this._sceneDepth = null;

    this.glitchPass =
      opts.glitchPass ??
      (this.enabled && this.stage >= 3 ? new EdgeGlitchPass() : null);
    /** @deprecated */
    this.tubePass = this.glitchPass;
    this.tubeEffect = this.glitchPass;
  }

  /**
   * Hot-update live knobs (no rebuild). Merges into working params.
   * @param {Partial<Record<string, number>>} [partial]
   * @returns {Record<string, number>}
   */
  setParams(partial = {}) {
    for (const [k, v] of Object.entries(partial)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        this._params[k] = v;
      }
    }
    this._applyLiveUniforms();
    return this.getParams();
  }

  /** @returns {Record<string, number>} */
  getParams() {
    return { ...this._params };
  }

  _applyLiveUniforms() {
    const p = this._params;
    const passU = this.glitchPass?.uniforms;
    if (passU) {
      if (passU.uArmOuter) {
        passU.uArmOuter.value =
          p.glitchArmOuter ?? EDGE_GLITCH_GLITCH_ARM_OUTER;
      }
      if (passU.uArmRamp) passU.uArmRamp.value = p.armRamp ?? EDGE_GLITCH_ARM_RAMP;
      if (passU.uSpanAlong) {
        passU.uSpanAlong.value = p.spanAlong ?? EDGE_GLITCH_SPAN_ALONG;
      }
      if (passU.uSpanOut) passU.uSpanOut.value = p.spanOut ?? EDGE_GLITCH_SPAN_OUT;
      if (passU.uSpanIn) passU.uSpanIn.value = p.spanIn ?? EDGE_GLITCH_SPAN_IN;
      if (passU.uGlitchIntensity) {
        passU.uGlitchIntensity.value = p.intensity ?? EDGE_GLITCH_INTENSITY;
      }
      if (passU.uRgbSplit) {
        passU.uRgbSplit.value = p.rgbSplit ?? EDGE_GLITCH_RGB_SPLIT;
      }
      if (passU.uTearBands) {
        passU.uTearBands.value = p.tearBands ?? EDGE_GLITCH_TEAR_BANDS;
      }
    }
    const ou = this._overlay?.userData?.uniforms;
    if (ou) {
      const arm = p.glitchArmOuter ?? EDGE_GLITCH_GLITCH_ARM_OUTER;
      if (ou.uArmOuter) ou.uArmOuter.value = arm;
      if (ou.uArmRamp) ou.uArmRamp.value = p.armRamp ?? EDGE_GLITCH_ARM_RAMP;
      if (ou.uSpanAlong) ou.uSpanAlong.value = p.spanAlong ?? EDGE_GLITCH_SPAN_ALONG;
      if (ou.uSpanOut) ou.uSpanOut.value = p.spanOut ?? EDGE_GLITCH_SPAN_OUT;
      if (ou.uSpanIn) ou.uSpanIn.value = p.spanIn ?? EDGE_GLITCH_SPAN_IN;
    }
  }

  /**
   * No-op — fringe/dissolve hue retired with the dissolve pass.
   * @param {THREE.Color | { r: number, g: number, b: number } | null | undefined} _color
   */
  setNeonHue(_color) {}

  /**
   * @deprecated Prefer setNeonHue
   */
  setInjectHue(color) {
    this.setNeonHue(color);
  }

  /**
   * @param {THREE.Vector2} ndc
   * @param {{ live?: boolean }} [opts]
   */
  setPointerNdc(ndc, opts = {}) {
    this._pointerNdc.copy(ndc);
    this._pointerLive = opts.live !== false;
  }

  /**
   * Bind silhouette subject(s) for the active stop (bust / PC / Sidekick / Archaeology).
   * Archaeology may pass several roots (rest vs zoom sets). Swapping rebuilds the SDF mesh list.
   * @param {THREE.Object3D | THREE.Object3D[] | null | undefined} rootOrRoots
   */
  setActiveRoot(rootOrRoots) {
    if (!this.enabled) return;
    const roots = (Array.isArray(rootOrRoots) ? rootOrRoots : [rootOrRoots]).filter(
      Boolean
    );
    if (!roots.length) {
      this._activeRoot = null;
      this._activeRoots = [];
      this._activeRootsKey = "";
      this._bustRoot = null;
      this.sdf.setRoots([]);
      this._applied = false;
      return;
    }
    const key = roots.map((r) => r.uuid).join("|");
    if (key === this._activeRootsKey && this._applied) return;

    this._activeRootsKey = key;
    this._activeRoots = roots;
    this._activeRoot = roots[0];
    this._bustRoot = roots[0];
    this.sdf.setRoots(roots);

    if (this.debug && !this._overlay) {
      this._overlay = createEdgeBandDebugOverlay(this.sdf.getTexture(), {
        armOuter: this._params.liquidArmOuter ?? EDGE_GLITCH_LIQUID_ARM_OUTER,
        armRamp: this._params.armRamp ?? EDGE_GLITCH_ARM_RAMP,
        spanAlong: this._params.spanAlong ?? EDGE_GLITCH_SPAN_ALONG,
        spanOut: this._params.spanOut ?? EDGE_GLITCH_SPAN_OUT,
        spanIn: this._params.spanIn ?? EDGE_GLITCH_SPAN_IN
      });
      this.scene.add(this._overlay);
    }
    this._applied = true;
  }

  /** @param {THREE.Object3D | null | undefined} bustRoot */
  attachBust(bustRoot) {
    this.setActiveRoot(bustRoot);
  }

  /** @param {number} w @param {number} h */
  setSize(w, h) {
    const ww = Math.max(1, w);
    const hh = Math.max(1, h);
    this.resolution.set(ww, hh);
    this.sdf.setDepthSize(ww, hh);
    const passU = this.glitchPass?.uniforms;
    if (passU?.uBustDepthTexel) {
      passU.uBustDepthTexel.value.set(1 / ww, 1 / hh);
    }
    if (passU?.uResolution) {
      passU.uResolution.value.set(ww, hh);
    }
  }

  /**
   * Bind FogDepthCapture packed scene depth (BasicDepthPacking).
   * Must stay wired even when STAGE_FOG_MODE is off — occlusion clip depends on it.
   * @param {THREE.Texture | null | undefined} texture
   */
  setSceneDepth(texture) {
    this._sceneDepth = texture ?? null;
  }

  /** @param {number} scale */
  setWorkQuality(scale) {
    this._workQuality = scale;
    const on = this.enabled && scale >= 0.55;
    if (this._overlay?.userData?.uniforms?.uEnabled) {
      this._overlay.userData.uniforms.uEnabled.value = on ? 1 : 0;
    }
    if (this.glitchPass?.uniforms?.uEnabled) {
      this.glitchPass.uniforms.uEnabled.value = on && this.stage >= 3 ? 1 : 0;
    }
    this._applyLiveUniforms();
  }

  /**
   * @param {{
   *   activeIndex?: number,
   *   activeRoot?: THREE.Object3D | THREE.Object3D[] | null,
   *   bustReady?: boolean,
   *   time?: number
   * }} [opts]
   */
  update(opts = {}) {
    const passU = this.glitchPass?.uniforms;
    if (!this.enabled || this.reducedMotion) {
      if (this._overlay) this._overlay.visible = false;
      if (passU) passU.uEnabled.value = 0;
      return;
    }

    // Stops 0–3: Bust, Desktop PC, Sidekick, Archaeology. Water-cursor rim stays stop 0.
    const activeIndex = opts.activeIndex ?? 0;
    const onGlitchStop = activeIndex >= 0 && activeIndex <= 3;
    if (!onGlitchStop || this._workQuality < 0.55) {
      if (this._overlay) this._overlay.visible = false;
      if (passU) passU.uEnabled.value = 0;
      return;
    }

    if (opts.activeRoot) {
      this.setActiveRoot(opts.activeRoot);
    } else if (!this._applied && opts.bustReady && this._bustRoot) {
      this.setActiveRoot(this._bustRoot);
    }
    if (!this._applied || !this._activeRoot) {
      if (this._overlay) this._overlay.visible = false;
      if (passU) passU.uEnabled.value = 0;
      return;
    }

    const draw = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(draw);
    this.sdf.setDepthSize(draw.x, draw.y);
    const passUSize = this.glitchPass?.uniforms?.uBustDepthTexel;
    if (passUSize) passUSize.value.set(1 / Math.max(1, draw.x), 1 / Math.max(1, draw.y));
    if (passU?.uResolution) {
      passU.uResolution.value.set(draw.x, draw.y);
    }

    this.sdf.update(this.scene, this.camera);

    const cursorActive = this._pointerLive && this.stage >= 2 ? 1 : 0;
    if (cursorActive) {
      this._cursorUv.set(
        this._pointerNdc.x * 0.5 + 0.5,
        this._pointerNdc.y * 0.5 + 0.5
      );
    } else {
      this._cursorUv.set(-1, -1);
    }

    if (this._overlay) {
      this._overlay.visible = this.debug && cursorActive > 0;
      const u = this._overlay.userData.uniforms;
      u.uEdgeSdf.value = this.sdf.getTexture();
      u.uCursorUv.value.copy(this._cursorUv);
      u.uCursorActive.value = cursorActive;
    }

    if (passU && this.stage >= 3) {
      const subjectDepth = this.sdf.getDepthTexture();
      const sceneDepth = this._sceneDepth;
      passU.uEdgeSdf.value = this.sdf.getTexture();
      passU.uBustDepth.value = subjectDepth;
      passU.uSceneDepth.value = sceneDepth ?? subjectDepth;
      passU.uHasSceneDepth.value = sceneDepth ? 1 : 0;
      passU.uOccSoft.value = EDGE_GLITCH_OCC_SOFT;
      passU.uOccBias.value = EDGE_GLITCH_OCC_BIAS;
      if (passU.uCamNear) passU.uCamNear.value = this.camera?.near ?? 0.1;
      if (passU.uCamFar) passU.uCamFar.value = this.camera?.far ?? 40;
      passU.uCursorUv.value.copy(this._cursorUv);
      passU.uCursorActive.value = cursorActive;
      passU.uEnabled.value = 1;
      this._applyLiveUniforms();
      if (typeof opts.time === "number") {
        this.glitchPass.setTime(opts.time);
      }
    }
  }

  /**
   * GPU water-cursor rim source. The stage binds this texture; the cursor
   * shader taps it. Do not sample it with readRenderTargetPixels per frame.
   * @returns {{
   *   active: boolean,
   *   texture: THREE.Texture | null,
   *   size: number,
   *   arm: number,
   *   ramp: number
   * }}
   */
  getRimGpuSource() {
    const texture = this.sdf?.getTexture?.() ?? null;
    const active = Boolean(
      this.enabled &&
        this._applied &&
        !this.reducedMotion &&
        this.stage >= 2 &&
        this._workQuality >= 0.55 &&
        texture
    );
    return {
      active,
      texture,
      size: this.sdf?.size ?? EDGE_GLITCH_SDF_SIZE,
      arm: Math.max(
        this._params.liquidArmOuter ?? EDGE_GLITCH_LIQUID_ARM_OUTER,
        1e-6
      ),
      ramp: Math.max(this._params.armRamp ?? EDGE_GLITCH_ARM_RAMP, 0.01)
    };
  }

  debugState() {
    const p = this._params;
    const liquidArm = p.liquidArmOuter ?? EDGE_GLITCH_LIQUID_ARM_OUTER;
    const glitchArm = p.glitchArmOuter ?? EDGE_GLITCH_GLITCH_ARM_OUTER;
    const dCursor =
      this._pointerLive && this.stage >= 2
        ? this.sdf.sampleDistance(this._cursorUv.x, this._cursorUv.y)
        : null;
    let liquidGate = 0;
    let glitchGate = 0;
    if (dCursor != null && dCursor > 0.0) {
      const ramp = Math.max(p.armRamp, 0.01);
      liquidGate = Math.pow(
        Math.min(1, Math.max(0, 1 - dCursor / Math.max(liquidArm, 1e-6))),
        ramp
      );
      glitchGate = Math.pow(
        Math.min(1, Math.max(0, 1 - dCursor / Math.max(glitchArm, 1e-6))),
        ramp
      );
    }
    return {
      stage: this.stage,
      enabled: this.enabled,
      applied: this._applied,
      csmCount: 0,
      csmRemoved: true,
      bandOuter: EDGE_GLITCH_BAND_OUTER,
      cursorOuter: EDGE_GLITCH_CURSOR_OUTER,
      spanAlong: p.spanAlong ?? EDGE_GLITCH_SPAN_ALONG,
      spanOut: p.spanOut ?? EDGE_GLITCH_SPAN_OUT,
      spanIn: p.spanIn ?? EDGE_GLITCH_SPAN_IN,
      liquidArmOuter: liquidArm,
      glitchArmOuter: glitchArm,
      armOuter: liquidArm,
      armRamp: p.armRamp ?? EDGE_GLITCH_ARM_RAMP,
      intensity: p.intensity ?? EDGE_GLITCH_INTENSITY,
      rgbSplit: p.rgbSplit ?? EDGE_GLITCH_RGB_SPLIT,
      tearBands: p.tearBands ?? EDGE_GLITCH_TEAR_BANDS,
      sdfSize: EDGE_GLITCH_SDF_SIZE,
      pointerLive: this._pointerLive,
      cursorUv: { x: this._cursorUv.x, y: this._cursorUv.y },
      dCursor,
      liquidGate,
      glitchGate,
      cursorGate: liquidGate,
      edgeProx: liquidGate,
      tubeEnabled: Boolean(this.glitchPass?.uniforms?.uEnabled?.value),
      approach:
        "Restored 9/15–9/16 look — beauty tears + RGB split on L1 diamond. No dissolve / no revealBoost.",
      activeRoot: this._activeRoot?.name ?? null,
      activeRoots: this._activeRoots.map((r) => r.name || r.uuid),
      occSoft: EDGE_GLITCH_OCC_SOFT,
      occBias: EDGE_GLITCH_OCC_BIAS,
      hasSceneDepth: Boolean(this._sceneDepth),
      hasSceneDepthUniform: Boolean(this.glitchPass?.uniforms?.uHasSceneDepth?.value),
      overlayVisible: Boolean(this._overlay?.visible),
      defaults: {
        liquidArmOuter: EDGE_GLITCH_LIQUID_ARM_OUTER,
        glitchArmOuter: EDGE_GLITCH_GLITCH_ARM_OUTER,
        armRamp: EDGE_GLITCH_ARM_RAMP,
        spanAlong: EDGE_GLITCH_SPAN_ALONG,
        spanOut: EDGE_GLITCH_SPAN_OUT,
        spanIn: EDGE_GLITCH_SPAN_IN,
        intensity: EDGE_GLITCH_INTENSITY,
        rgbSplit: EDGE_GLITCH_RGB_SPLIT,
        tearBands: EDGE_GLITCH_TEAR_BANDS
      }
    };
  }

  dispose() {
    if (this._overlay) {
      this.scene.remove(this._overlay);
      this._overlay.geometry.dispose();
      this._overlay.material.dispose();
      this._overlay = null;
    }
    this.glitchPass?.dispose?.();
    this.sdf.dispose();
  }
}
