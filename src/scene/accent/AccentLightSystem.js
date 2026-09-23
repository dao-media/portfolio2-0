/**
 * Dynamic accent lights — rim SpotLights + orbiting sweep Point + fog shaft Spot.
 * Accents on the dark single-source base. No ambient/hemi/IBL fill.
 *
 * Stop 0 first; `setSubject` / activeIndex gate extends to other stops later.
 */

import * as THREE from "three";
import {
  ACCENT_STOP_INDICES,
  createAccentParams
} from "./accentConfig.js";
import { NEON_FOG_LAYER } from "../stage/constants.js";

const _subject = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _toNeon = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _tmp = new THREE.Vector3();
const _neonPos = new THREE.Vector3();

/**
 * @param {string} name
 * @param {"spot" | "point"} [kind]
 * @returns {THREE.SpotLight | THREE.PointLight}
 */
function makeAccentLight(name, kind = "spot") {
  if (kind === "point") {
    const light = new THREE.PointLight(0xffffff, 0, 3, 2.5);
    light.name = name;
    light.castShadow = false;
    light.layers.enable(0);
    light.layers.enable(NEON_FOG_LAYER);
    return light;
  }
  const light = new THREE.SpotLight(0xffffff, 0, 4, 0.3, 0.5, 2);
  light.name = name;
  light.castShadow = false;
  light.layers.enable(0);
  light.layers.enable(NEON_FOG_LAYER);
  light.target.name = `${name}-target`;
  return light;
}

export class AccentLightSystem {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   camera: THREE.Camera,
   *   reducedMotion?: boolean
   * }} opts
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.reducedMotion = Boolean(opts.reducedMotion);
    /** @type {Record<string, number>} */
    this._params = createAccentParams();
    this._workQuality = 1;
    this._arriveLevel = 0;
    this._activeIndex = 0;
    /** @type {THREE.Object3D | null} */
    this._subjectRoot = null;
    this._sweepPhase = 0;
    this._frozenSweepAngle = 0.35;

    this.rimA = makeAccentLight("accent-rim-a", "spot");
    this.rimB = makeAccentLight("accent-rim-b", "spot");
    this.sweep = makeAccentLight("accent-sweep", "point");
    this.shaft = makeAccentLight("accent-shaft", "spot");
    /** Fog-only intensity mirror — not added to scene as a second light. */
    this._shaftFogProxy = makeAccentLight("accent-shaft-fog-proxy", "spot");

    this.scene.add(this.rimA);
    this.scene.add(this.rimA.target);
    this.scene.add(this.rimB);
    this.scene.add(this.rimB.target);
    this.scene.add(this.sweep);
    this.scene.add(this.shaft);
    this.scene.add(this.shaft.target);

    this._applyParamsToLights();
  }

  /** @returns {Record<string, number>} */
  getParams() {
    return { ...this._params };
  }

  /**
   * @param {Partial<Record<string, number>>} [partial]
   * @returns {Record<string, number>}
   */
  setParams(partial = {}) {
    for (const [k, v] of Object.entries(partial)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        this._params[k] = v;
      }
    }
    this._applyParamsToLights();
    return this.getParams();
  }

  /** @param {number} scale */
  setWorkQuality(scale) {
    this._workQuality = Number.isFinite(scale) ? scale : 1;
  }

  /**
   * @param {THREE.Object3D | null | undefined} root
   */
  setSubject(root) {
    this._subjectRoot = root ?? null;
  }

  /**
   * Lights to append after neon PointLights for VolumetricFogPass.setLights.
   * Shaft uses fog-boosted intensity + tight cone.
   * @returns {THREE.SpotLight[]}
   */
  getFogLights() {
    if (!this._accentsLive()) return [];
    if (!(this._params.shaftEnabled > 0.5)) return [];
    const boost = Math.max(0, this._params.shaftFogBoost ?? 1);
    const meshI = Math.max(0, this._params.shaftIntensity ?? 0);
    this._shaftFogProxy.color.copy(this.shaft.color);
    this._shaftFogProxy.position.copy(this.shaft.position);
    this._shaftFogProxy.target.position.copy(this.shaft.target.position);
    this._shaftFogProxy.target.updateMatrixWorld(true);
    this._shaftFogProxy.distance = this.shaft.distance;
    this._shaftFogProxy.decay = this.shaft.decay;
    this._shaftFogProxy.angle = this.shaft.angle;
    this._shaftFogProxy.penumbra = this.shaft.penumbra;
    this._shaftFogProxy.intensity =
      meshI * boost * this._arriveLevel * (this._params.enabled > 0.5 ? 1 : 0);
    this._shaftFogProxy.updateMatrixWorld(true);
    return [this._shaftFogProxy];
  }

  /** Near-tube density knobs for VolumetricFogPass when accents are live. */
  getFogDensityTune() {
    if (!this._accentsLive() || !(this._params.shaftEnabled > 0.5)) {
      return null;
    }
    return {
      nearTubeDensityBoost: this._params.nearTubeDensityBoost,
      nearTubeDensityRadius: this._params.nearTubeDensityRadius
    };
  }

  _accentsLive() {
    return (
      this._params.enabled > 0.5 &&
      ACCENT_STOP_INDICES.includes(this._activeIndex) &&
      this._arriveLevel > 1e-3 &&
      Boolean(this._subjectRoot)
    );
  }

  _effectiveRimCount() {
    const want = Math.max(0, Math.min(2, Math.round(this._params.rimCount ?? 2)));
    if (this._workQuality < 0.4) return Math.min(1, want);
    return want;
  }

  _sweepAllowed() {
    if (this.reducedMotion) return false;
    if (this._workQuality < 0.4) return false;
    return (this._params.sweepIntensity ?? 0) > 1e-4;
  }

  _applyParamsToLights() {
    const p = this._params;
    this.rimA.color.setRGB(p.rimColorR, p.rimColorG, p.rimColorB);
    this.rimB.color.copy(this.rimA.color);
    this.rimA.distance = p.rimDistance;
    this.rimB.distance = p.rimDistance;
    this.rimA.decay = p.rimDecay;
    this.rimB.decay = p.rimDecay;
    this.rimA.angle = p.rimAngle;
    this.rimB.angle = p.rimAngle;
    this.rimA.penumbra = p.rimPenumbra;
    this.rimB.penumbra = p.rimPenumbra;

    this.sweep.color.setRGB(p.sweepColorR, p.sweepColorG, p.sweepColorB);
    this.sweep.distance = p.sweepDistance;
    this.sweep.decay = p.sweepDecay;

    this.shaft.color.setRGB(p.shaftColorR, p.shaftColorG, p.shaftColorB);
    this.shaft.distance = p.shaftDistance;
    this.shaft.decay = p.shaftDecay;
    this.shaft.angle = p.shaftAngle;
    this.shaft.penumbra = p.shaftPenumbra;
  }

  /**
   * @param {number} timeSec
   * @param {{
   *   activeIndex?: number,
   *   arriveLevel?: number,
   *   dt?: number,
   *   subjectRoot?: THREE.Object3D | null,
   *   keyLight?: THREE.Light | null
   * }} [opts]
   */
  update(timeSec, opts = {}) {
    this._activeIndex = opts.activeIndex ?? 0;
    this._arriveLevel = Math.max(0, Math.min(1, opts.arriveLevel ?? 0));
    if (opts.subjectRoot !== undefined) {
      this._subjectRoot = opts.subjectRoot;
    }

    const live = this._accentsLive();
    if (!live) {
      this.rimA.intensity = 0;
      this.rimB.intensity = 0;
      this.sweep.intensity = 0;
      this.shaft.intensity = 0;
      return;
    }

    this._subjectRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this._subjectRoot);
    box.getCenter(_subject);
    _subject.y = THREE.MathUtils.lerp(box.min.y, box.max.y, 0.55);

    this.camera.updateMatrixWorld(true);
    this.camera.getWorldPosition(_tmp);
    _toCam.copy(_tmp).sub(_subject);
    const camDist = _toCam.length();
    if (camDist < 1e-4) _toCam.set(0, 0, 1);
    else _toCam.multiplyScalar(1 / camDist);

    // Shadow axis = opposite the neon key (not cam×up — that missed the dark profile).
    const key = opts.keyLight ?? null;
    if (key) {
      key.getWorldPosition(_neonPos);
      _toNeon.copy(_neonPos).sub(_subject);
      if (_toNeon.lengthSq() < 1e-6) _toNeon.set(1, 0, 0);
      else _toNeon.normalize();
    } else {
      _side.crossVectors(_toCam, _up);
      if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
      else _side.normalize();
      _toNeon.copy(_side);
    }

    const p = this._params;
    const level = this._arriveLevel;
    const rimN = this._effectiveRimCount();

    // Camera-left / camera-right in the view plane (world XZ), then bias behind.
    // Opposite-neon alone can land the light inside the bust or on the key side
    // when neon sits near the subject AABB.
    _side.crossVectors(_toCam, _up);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
    else _side.normalize();
    // Prefer the side away from neon (shadow profile).
    if (_side.dot(_toNeon) > 0) _side.negate();

    // Rim A — behind + shadow-side, aimed THROUGH the bust toward camera so the
    // cone grazes the silhouette (not a chest specular blob).
    _tmp
      .copy(_subject)
      .addScaledVector(_toCam, -Math.max(p.rimBack, 0.55))
      .addScaledVector(_side, p.rimSide);
    _tmp.y = _subject.y + p.rimHeight;
    this.rimA.position.copy(_tmp);
    this.rimA.target.position
      .copy(_subject)
      .addScaledVector(_toCam, Math.max(0.35, p.rimCamBias));
    this.rimA.target.position.y = _subject.y + p.rimHeight * 0.5;
    this.rimA.target.updateMatrixWorld(true);
    this.rimA.intensity = rimN >= 1 ? p.rimIntensity * level : 0;

    // Rim B — secondary silhouette graze (no shoulder spotlight bias)
    _tmp
      .copy(_subject)
      .addScaledVector(_toCam, -Math.max(p.rimBack, 0.55) * 1.15)
      .addScaledVector(_side, p.rimSide * 0.7);
    _tmp.y = _subject.y + p.rimHeight + 0.1;
    this.rimB.position.copy(_tmp);
    this.rimB.target.position
      .copy(_subject)
      .addScaledVector(_toCam, Math.max(0.35, p.rimCamBias));
    this.rimB.target.position.y = _subject.y + p.rimHeight * 0.5;
    this.rimB.target.updateMatrixWorld(true);
    this.rimB.intensity =
      rimN >= 2 ? p.rimIntensity * p.rim2Mul * level : 0;

    // Sweep orbit
    const dt = Math.min(Math.max(opts.dt ?? 1 / 60, 0), 0.05);
    if (this._sweepAllowed()) {
      this._sweepPhase =
        (this._sweepPhase + p.sweepSpeed * dt) % (Math.PI * 2);
    } else if (this.reducedMotion) {
      this._sweepPhase = this._frozenSweepAngle;
    }
    const ang = this._sweepPhase;
    this.sweep.position.set(
      _subject.x + Math.cos(ang) * p.sweepRadius,
      box.min.y + p.sweepHeight,
      _subject.z + Math.sin(ang) * p.sweepRadius
    );
    this.sweep.intensity = this._sweepAllowed()
      ? p.sweepIntensity * level
      : 0;

    // Shaft — high, from neon side, tight cone into subject (fog-readable)
    if (p.shaftEnabled > 0.5) {
      _tmp
        .copy(_subject)
        .addScaledVector(_toCam, -p.shaftBack)
        .addScaledVector(_toNeon, p.shaftSide === 0 ? 0.2 : p.shaftSide);
      _tmp.addScaledVector(_toNeon, 0.15);
      _tmp.y = box.min.y + p.shaftHeight;
      this.shaft.position.copy(_tmp);
      this.shaft.target.position.copy(_subject);
      this.shaft.target.updateMatrixWorld(true);
      this.shaft.intensity = p.shaftIntensity * level;
    } else {
      this.shaft.intensity = 0;
    }

    this.rimA.updateMatrixWorld(true);
    this.rimB.updateMatrixWorld(true);
    this.sweep.updateMatrixWorld(true);
    this.shaft.updateMatrixWorld(true);
  }

  debugState() {
    return {
      enabled: this._params.enabled,
      live: this._accentsLive(),
      activeIndex: this._activeIndex,
      arriveLevel: this._arriveLevel,
      workQuality: this._workQuality,
      reducedMotion: this.reducedMotion,
      rimCount: this._effectiveRimCount(),
      sweepOn: this._sweepAllowed() && this.sweep.intensity > 0,
      rimA: this.rimA.intensity,
      rimB: this.rimB.intensity,
      sweep: this.sweep.intensity,
      shaft: this.shaft.intensity,
      params: this.getParams()
    };
  }

  dispose() {
    for (const L of [this.rimA, this.rimB]) {
      this.scene.remove(L);
      this.scene.remove(L.target);
      L.dispose?.();
    }
    this.scene.remove(this.sweep);
    this.sweep.dispose?.();
    this.scene.remove(this.shaft);
    this.scene.remove(this.shaft.target);
    this.shaft.dispose?.();
  }
}
