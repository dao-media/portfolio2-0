import * as THREE from "three";
import {
  EDGE_GLITCH_ARM_OUTER,
  EDGE_GLITCH_ARM_RAMP,
  EDGE_GLITCH_BAND_OUTER,
  EDGE_GLITCH_CURSOR_OUTER,
  EDGE_GLITCH_DEBUG,
  EDGE_GLITCH_INTENSITY,
  EDGE_GLITCH_LOCAL_BASE,
  EDGE_GLITCH_LOCAL_GROWTH,
  EDGE_GLITCH_OCC_BIAS,
  EDGE_GLITCH_OCC_SOFT,
  EDGE_GLITCH_SDF_SIZE,
  EDGE_GLITCH_STAGE,
  EDGE_GLITCH_TEAR_BANDS,
  createEdgeGlitchParams
} from "./constants.js";
import { EdgeSilhouetteSdf } from "./EdgeSilhouetteSdf.js";
import { createEdgeBandDebugOverlay } from "./EdgeBandDebugOverlay.js";
import { EdgeGlitchPass } from "./EdgeGlitchPass.js";

/**
 * Edge glitch — local silhouette rim + beauty-resample tears.
 * Origin on edge; proximity boosts width/intensity more than scale. No CSM.
 * Live knobs via setParams (EdgeGlitchTuner / __stage.setEdgeGlitchParams).
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
    return { ...this._params };
  }

  /** @returns {Record<string, number>} */
  getParams() {
    return { ...this._params };
  }

  _applyLiveUniforms() {
    const p = this._params;
    const passU = this.glitchPass?.uniforms;
    if (passU) {
      if (passU.uArmOuter) passU.uArmOuter.value = p.armOuter;
      if (passU.uArmRamp) passU.uArmRamp.value = p.armRamp;
      if (passU.uLocalBase) passU.uLocalBase.value = p.localBase;
      if (passU.uLocalGrowth) passU.uLocalGrowth.value = p.localGrowth;
      if (passU.uGlitchIntensity) passU.uGlitchIntensity.value = p.intensity;
    }
    const ou = this._overlay?.userData?.uniforms;
    if (ou) {
      if (ou.uArmOuter) ou.uArmOuter.value = p.armOuter;
      if (ou.uArmRamp) ou.uArmRamp.value = p.armRamp;
      if (ou.uLocalBase) ou.uLocalBase.value = p.localBase;
      if (ou.uLocalGrowth) ou.uLocalGrowth.value = p.localGrowth;
    }
  }

  /**
   * Attach bust for SDF mask only — plain MeshStandard (no CSM).
   * @param {THREE.Object3D | null | undefined} bustRoot
   */
  attachBust(bustRoot) {
    if (!this.enabled || !bustRoot || this._applied) return;
    this._bustRoot = bustRoot;
    this.sdf.setRoots([bustRoot]);

    if (this.debug && !this._overlay) {
      this._overlay = createEdgeBandDebugOverlay(this.sdf.getTexture(), {
        bandOuter: EDGE_GLITCH_BAND_OUTER,
        armOuter: this._params.armOuter,
        armRamp: this._params.armRamp,
        localBase: this._params.localBase,
        localGrowth: this._params.localGrowth
      });
      this.scene.add(this._overlay);
    }
    this._applied = true;
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
  }

  /**
   * Bind FogDepthCapture packed scene depth (BasicDepthPacking).
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
  }

  /**
   * @param {THREE.Vector2 | { x: number, y: number } | null | undefined} ndc
   * @param {{ live?: boolean }} [opts]
   */
  setPointerNdc(ndc, opts = {}) {
    if (!ndc || !Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) {
      this._pointerLive = false;
      return;
    }
    this._pointerNdc.set(ndc.x, ndc.y);
    this._pointerLive = opts.live !== false;
  }

  /**
   * @param {{ activeIndex?: number, bustReady?: boolean, time?: number }} [opts]
   */
  update(opts = {}) {
    const passU = this.glitchPass?.uniforms;
    if (!this.enabled || this.reducedMotion) {
      if (this._overlay) this._overlay.visible = false;
      if (passU) passU.uEnabled.value = 0;
      return;
    }
    const active = (opts.activeIndex ?? 0) === 0;
    if (!active || this._workQuality < 0.55) {
      if (this._overlay) this._overlay.visible = false;
      if (passU) passU.uEnabled.value = 0;
      return;
    }
    if (!this._applied && opts.bustReady && this._bustRoot) {
      this.attachBust(this._bustRoot);
    }
    if (!this._applied) return;

    const draw = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(draw);
    this.sdf.setDepthSize(draw.x, draw.y);
    const passUSize = this.glitchPass?.uniforms?.uBustDepthTexel;
    if (passUSize) passUSize.value.set(1 / Math.max(1, draw.x), 1 / Math.max(1, draw.y));

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
      passU.uEdgeSdf.value = this.sdf.getTexture();
      passU.uBustDepth.value = this.sdf.getDepthTexture();
      passU.uSceneDepth.value = this._sceneDepth;
      passU.uHasSceneDepth.value = this._sceneDepth ? 1 : 0;
      passU.uOccSoft.value = EDGE_GLITCH_OCC_SOFT;
      passU.uOccBias.value = EDGE_GLITCH_OCC_BIAS;
      passU.uCursorUv.value.copy(this._cursorUv);
      passU.uCursorActive.value = cursorActive;
      passU.uEnabled.value = 1;
      passU.uBandOuter.value = EDGE_GLITCH_BAND_OUTER;
      passU.uTearBands.value = EDGE_GLITCH_TEAR_BANDS;
      this._applyLiveUniforms();
      if (typeof opts.time === "number") {
        this.glitchPass.setTime(opts.time);
      }
    }
  }

  /**
   * Cheap CPU rim field for WaterCursor blow / tip-slurp.
   * Active outside within ARM, and slightly inside for the crossing tip.
   * 3× readPixels max — only call on stop 0.
   * @param {number} u UV 0–1
   * @param {number} v UV 0–1
   * @param {{ insideFree?: number, slurpBand?: number }} [opts]
   * @returns {{
   *   active: boolean,
   *   d: number,
   *   proximity: number,
   *   blow: number,
   *   slurp: number,
   *   gx: number,
   *   gy: number
   * }}
   */
  sampleRimField(u, v, opts = {}) {
    const inactive = {
      active: false,
      d: 0,
      proximity: 0,
      blow: 0,
      slurp: 0,
      gx: 0,
      gy: 0
    };
    if (
      !this.enabled ||
      !this._applied ||
      this.reducedMotion ||
      this.stage < 2 ||
      this._workQuality < 0.55 ||
      !Number.isFinite(u) ||
      !Number.isFinite(v)
    ) {
      return inactive;
    }
    const uu = Math.min(1, Math.max(0, u));
    const vv = Math.min(1, Math.max(0, v));
    const d = this.sdf.sampleDistance(uu, vv);
    const arm = Math.max(this._params.armOuter ?? EDGE_GLITCH_ARM_OUTER, 1e-6);
    const ramp = Math.max(this._params.armRamp ?? EDGE_GLITCH_ARM_RAMP, 0.01);
    const insideFree = Math.max(opts.insideFree ?? 0.022, 1e-4);
    const slurpBand = Math.max(opts.slurpBand ?? 0.032, 1e-4);

    // Deep inside — free round cursor (tip already past the glitch)
    if (d < -insideFree) return { ...inactive, d };
    // Far outside arm
    if (d > arm) return { ...inactive, d };

    const eps = 1.5 / Math.max(this.sdf.size, 1);
    const dU = this.sdf.sampleDistance(Math.min(1, uu + eps), vv);
    const dV = this.sdf.sampleDistance(uu, Math.min(1, vv + eps));
    let gx = dU - d;
    let gy = dV - d;
    const len = Math.hypot(gx, gy);
    if (len > 1e-8) {
      gx /= len;
      gy /= len;
    } else {
      gx = 0;
      gy = 0;
    }

    // Outside arm proximity (glitch couple / blown back)
    let proximity = 0;
    if (d > 0) {
      const t = Math.min(1, Math.max(0, 1 - d / arm));
      proximity = Math.pow(t, ramp);
    }

    // Blow tracks proximity — closer to glitch = more elongated teardrop
    const blow = d > 0 ? proximity : 0;

    // Slurp peaks at the alpha threshold (both sides of the edge)
    const slurp = 1 - Math.min(1, Math.max(0, Math.abs(d) / slurpBand));

    if (proximity < 1e-4 && slurp < 1e-4) {
      return { ...inactive, d };
    }

    return { active: true, d, proximity, blow, slurp, gx, gy };
  }

  debugState() {
    const p = this._params;
    const dCursor =
      this._pointerLive && this.stage >= 2
        ? this.sdf.sampleDistance(this._cursorUv.x, this._cursorUv.y)
        : null;
    let cursorGate = 0;
    if (dCursor != null && dCursor > 0.0) {
      const t = Math.min(1, Math.max(0, 1 - dCursor / Math.max(p.armOuter, 1e-6)));
      cursorGate = Math.pow(t, Math.max(p.armRamp, 0.01));
    }
    return {
      stage: this.stage,
      enabled: this.enabled,
      applied: this._applied,
      csmCount: 0,
      csmRemoved: true,
      bandOuter: EDGE_GLITCH_BAND_OUTER,
      cursorOuter: EDGE_GLITCH_CURSOR_OUTER,
      localBase: p.localBase,
      localGrowth: p.localGrowth,
      armOuter: p.armOuter,
      armRamp: p.armRamp,
      tearBands: EDGE_GLITCH_TEAR_BANDS,
      intensity: p.intensity,
      sdfSize: EDGE_GLITCH_SDF_SIZE,
      pointerLive: this._pointerLive,
      cursorUv: { x: this._cursorUv.x, y: this._cursorUv.y },
      dCursor,
      cursorGate,
      edgeProx: cursorGate,
      tubeEnabled: Boolean(this.glitchPass?.uniforms?.uEnabled?.value),
      approach:
        "Local rim from edge-origin. ARM hard-gates. Scene vs bust depth fades strength → 0 at rim ∩ occluder.",
      occSoft: EDGE_GLITCH_OCC_SOFT,
      occBias: EDGE_GLITCH_OCC_BIAS,
      hasSceneDepth: Boolean(this._sceneDepth),
      overlayVisible: Boolean(this._overlay?.visible),
      defaults: {
        armOuter: EDGE_GLITCH_ARM_OUTER,
        armRamp: EDGE_GLITCH_ARM_RAMP,
        localBase: EDGE_GLITCH_LOCAL_BASE,
        localGrowth: EDGE_GLITCH_LOCAL_GROWTH,
        intensity: EDGE_GLITCH_INTENSITY
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
