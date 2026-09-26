/**
 * Wet-concrete floor lighting + CubeCamera reflection probe.
 * Neon PointLights stain the ground; roughnessMap = puddles (sharp env) vs dry matte.
 * Floor is on WET_FLOOR_LAYER so the POV SpotLight (layer 0) cannot paint a disc.
 */

import * as THREE from "three";
import {
  createWetFloorParams,
  WET_FLOOR_TEX
} from "./wetFloorConfig.js";
import { NEON_LIGHT_DISTANCE, WET_FLOOR_LAYER } from "../stage/constants.js";

const _probeOrigin = new THREE.Vector3(0, 0.08, 0);
/** Soft apron kill outside the neon bubble (matches PointLight distance + feather). */
const BUBBLE_FEATHER_M = 1.15;

export class WetFloorSystem {
  /**
   * @param {{
   *   renderer: THREE.WebGLRenderer,
   *   scene: THREE.Scene,
   *   floorMesh: THREE.Mesh,
   *   material: THREE.MeshStandardMaterial
   * }} opts
   */
  constructor(opts) {
    this.renderer = opts.renderer;
    this.scene = opts.scene;
    this.floorMesh = opts.floorMesh;
    this.material = opts.material;
    /** @type {Record<string, number>} */
    this._params = createWetFloorParams();
    this._workQuality = 1;
    this._frame = 0;
    this._probeSize = 0;
    /** @type {number | null} Governor cadence override (null = config). */
    this._probeEveryNOverride = null;
    this._restEveryN = null;
    this._restProbeSize = null;
    /** Settled cube is one render per arrival, then frozen. */
    this._bakeOnce = true;
    this._bakePending = false;
    this._prebaked = false;
    this._bakes = 0;
    /** @type {THREE.WebGLCubeRenderTarget | null} */
    this._cubeTarget = null;
    /** @type {THREE.CubeCamera | null} */
    this._cubeCamera = null;
    this._matte = false;
    /** @type {{ uBubbleCenter: { value: THREE.Vector3 }, uBubbleRadius: { value: number }, uBubbleFeather: { value: number } } | null} */
    this._bubbleUniforms = null;

    this._installBubbleMask();
    this._ensureProbe(Math.round(this._params.probeSize) || 128);
    this.applyParams(this._params);
  }

  /**
   * Crush apron outside the active neon pool so the stage reads as a color bubble
   * in void — PointLight distance alone still washes the floor at grazing angles.
   */
  _installBubbleMask() {
    const mat = this.material;
    if (!mat || mat.userData.wetFloorBubble) return;
    mat.userData.wetFloorBubble = true;

    const uniforms = {
      uBubbleCenter: { value: new THREE.Vector3(0, 0, 0) },
      uBubbleRadius: { value: NEON_LIGHT_DISTANCE * 0.92 },
      uBubbleFeather: { value: BUBBLE_FEATHER_M }
    };
    this._bubbleUniforms = uniforms;

    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      prev?.(shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          /* glsl */ `#include <common>
varying vec3 vWetFloorWorld;`
        )
        .replace(
          "#include <project_vertex>",
          /* glsl */ `#include <project_vertex>
vWetFloorWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          /* glsl */ `#include <common>
varying vec3 vWetFloorWorld;
uniform vec3 uBubbleCenter;
uniform float uBubbleRadius;
uniform float uBubbleFeather;`
        )
        .replace(
          "#include <opaque_fragment>",
          /* glsl */ `{
  float bubDist = length(vWetFloorWorld.xz - uBubbleCenter.xz);
  float bub = 1.0 - smoothstep(
    uBubbleRadius,
    uBubbleRadius + max(uBubbleFeather, 1e-3),
    bubDist
  );
  outgoingLight *= bub;
}
#include <opaque_fragment>`
        );
    };
    mat.customProgramCacheKey = () => "wet-floor-bubble-v1";
    mat.needsUpdate = true;
  }

  /**
   * @param {THREE.Vector3 | null | undefined} world
   */
  setBubbleCenter(world) {
    if (!this._bubbleUniforms) return;
    if (world) {
      this._bubbleUniforms.uBubbleCenter.value.copy(world);
      this._bubbleUniforms.uBubbleCenter.value.y = 0;
    } else {
      this._bubbleUniforms.uBubbleCenter.value.set(0, 0, 0);
    }
    this._bubbleUniforms.uBubbleRadius.value = NEON_LIGHT_DISTANCE * 0.92;
    this._bubbleUniforms.uBubbleFeather.value = BUBBLE_FEATHER_M;
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
    const size = Math.round(this._params.probeSize) || 128;
    if (size !== this._probeSize) this._ensureProbe(size);
    this.applyParams(this._params);
    return this.getParams();
  }

  /** @param {number} scale */
  setWorkQuality(scale) {
    this._workQuality = Number.isFinite(scale) ? scale : 1;
    this.applyParams(this._params);
  }

  /**
   * Governor override for CubeCamera cadence (null = use wetFloorConfig).
   * A rest-fidelity cadence is a floor: the governor can only skip more frames.
   * @param {number | null} n
   */
  setProbeEveryN(n) {
    this._probeEveryNOverride =
      n == null || !Number.isFinite(n) ? null : Math.max(1, Math.round(n));
  }

  /**
   * Settled rest probe. One cube render per arrival, then the map stays frozen.
   * @param {{ probeSize?: number } | null} opts
   */
  setRestProbe(opts) {
    if (!opts) return;
    this.armSettleBake(opts);
  }

  /**
   * Bake-once-on-settle. The next update() renders the cube a single time.
   * A prebake from the black-hole warm is consumed by the first arrival
   * instead of rendering again.
   * @param {{ probeSize?: number, prebaked?: boolean }} [opts]
   */
  armSettleBake(opts = {}) {
    this._bakeOnce = true;
    if (Number.isFinite(opts.probeSize)) {
      const size = Math.round(opts.probeSize);
      const before = this._probeSize;
      this._ensureProbe(size);
      if (this._probeSize !== before && this._cubeTarget && !this._matte) {
        this.material.envMap = this._cubeTarget.texture;
        this.material.needsUpdate = true;
      }
    }
    if (opts.prebaked) {
      this._prebaked = false;
      this._bakePending = false;
      return;
    }
    if (this._prebaked) {
      this._prebaked = false;
      this._bakePending = false;
      return;
    }
    this._bakePending = true;
  }

  /** Hop — do not render. The last cube stays on the material. */
  clearSettleBake() {
    this._bakePending = false;
  }

  /** Warm already rendered the cube. Settling must not arm another bake. */
  consumePrebake() {
    if (!this._prebaked) return;
    this._prebaked = false;
    this._bakePending = false;
  }

  /** Black-hole warm already rendered the cube. First settle must not repeat it. */
  markPrebaked() {
    this._bakeOnce = true;
    this._prebaked = true;
    this._bakePending = false;
  }

  /** Cadence actually used by update(). */
  effectiveProbeEveryN() {
    const base = Math.max(1, Math.round(this._params.probeEveryN ?? 3));
    const gov = this._probeEveryNOverride;
    const rest = this._restEveryN;
    let every = gov ?? rest ?? base;
    if (rest != null) every = Math.max(every, rest);
    return every;
  }

  /**
   * @param {Record<string, number>} p
   */
  applyParams(p) {
    const mat = this.material;
    const gain = Math.max(0.05, p.colorGain ?? 0.55);
    mat.color.setRGB(gain, gain, gain);
    mat.metalness = Math.max(0, p.metalness ?? 0.04);
    mat.roughness = Math.max(0.05, Math.min(1, p.roughness ?? 1));
    if (mat.normalScale) {
      const n = p.normalScale ?? 0.55;
      mat.normalScale.set(n, n);
    }

    const rep = Math.max(1, p.uvRepeat ?? 48);
    for (const tex of [
      mat.map,
      mat.roughnessMap,
      mat.normalMap,
      mat.metalnessMap
    ]) {
      if (!tex) continue;
      tex.repeat.set(rep, rep);
      tex.needsUpdate = true;
    }

    // Roughness-map influence: lerp map toward white (uniform dry) when influence→0.
    if (mat.roughnessMap && mat.roughnessMap.userData._neutral) {
      // kept for API; actual blend via roughness + optional userData flag
    }
    mat.userData.roughnessInfluence = Math.max(
      0,
      Math.min(1, p.roughnessInfluence ?? 1)
    );
    this._applyRoughnessInfluence();

    const wantReflect =
      (p.enabled ?? 1) > 0.5 &&
      this._workQuality >= 0.4 &&
      (p.envStrength ?? 0) > 1e-4;
    this._matte = !wantReflect;
    if (wantReflect && this._cubeTarget) {
      mat.envMap = this._cubeTarget.texture;
      mat.envMapIntensity = p.envStrength ?? 1.35;
    } else {
      mat.envMap = null;
      mat.envMapIntensity = 0;
    }
    mat.needsUpdate = true;
  }

  /** Soften or restore roughnessMap contrast for tuner "influence". */
  _applyRoughnessInfluence() {
    const mat = this.material;
    const infl = mat.userData.roughnessInfluence ?? 1;
    // Shader-free: when influence is low, raise material.roughness toward 1
    // and drop env so dry reads dominate. Full influence uses authored roughness.
    if (infl < 0.999) {
      const base = this._params.roughness ?? 1;
      mat.roughness = THREE.MathUtils.lerp(1, base, infl);
    }
  }

  /**
   * @param {number} size
   */
  _ensureProbe(size) {
    const s = size === 256 || size === 64 ? size : 128;
    if (this._cubeTarget && this._probeSize === s) return;
    this._disposeProbe();
    this._probeSize = s;
    this._cubeTarget = new THREE.WebGLCubeRenderTarget(s, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter
    });
    this._cubeTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this._cubeCamera = new THREE.CubeCamera(0.2, 80, this._cubeTarget);
    this._cubeCamera.name = "wet-floor-cube-camera";
  }

  /**
   * Update CubeCamera when reflections are live. Hides floor (+ optional extras)
   * so the probe reads neon tubes, not a green grass wash.
   * @param {number} [_time]
   * @param {{
   *   probeWorld?: THREE.Vector3 | null,
   *   hideExtra?: THREE.Object3D[]
   * }} [opts]
   */
  update(_time, opts = {}) {
    // Bubble center tracks the active neon every frame (probe may skip frames).
    this.setBubbleCenter(opts.probeWorld ?? null);

    if (this._matte || !this._cubeCamera || !this._cubeTarget) return;
    // Bake-once-on-settle: a hop never sets pending, and rest never re-enters.
    if (!this._bakePending) return false;
    this._bakePending = false;
    this._bakes += 1;

    const near = this._params.probeNear ?? 0.2;
    const far = this._params.probeFar ?? 80;
    for (const cam of this._cubeCamera.children) {
      if (!cam.isCamera) continue;
      cam.near = near;
      cam.far = far;
      cam.updateProjectionMatrix();
    }

    if (opts.probeWorld) {
      _probeOrigin.copy(opts.probeWorld);
      _probeOrigin.y = 0.12;
    } else {
      _probeOrigin.set(0, 0.12, 0);
    }
    this._cubeCamera.position.copy(_probeOrigin);

    /** @type {THREE.Object3D[]} */
    const hidden = [];
    const hide = (obj) => {
      if (!obj || !obj.visible) return;
      obj.visible = false;
      hidden.push(obj);
    };
    hide(this.floorMesh);
    const extras = opts.hideExtra ?? [];
    for (let i = 0; i < extras.length; i += 1) hide(extras[i]);

    this._cubeCamera.update(this.renderer, this.scene);

    for (let i = 0; i < hidden.length; i += 1) hidden[i].visible = true;

    // CubeCamera leaves the active viewport at cube-face size — restore CSS
    // viewport bounds (setViewport is CSS px; drawing-buffer dims inflate it).
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    this.renderer.setViewport(0, 0, Math.max(1, size.x), Math.max(1, size.y));
    this.renderer.setScissorTest(false);
    return true;
  }

  debugState() {
    return {
      enabled: this._params.enabled,
      matte: this._matte,
      workQuality: this._workQuality,
      probeSize: this._probeSize,
      probeEveryN: this._bakeOnce ? null : this.effectiveProbeEveryN(),
      bakeOnce: this._bakeOnce,
      bakePending: this._bakePending,
      prebaked: this._prebaked,
      bakes: this._bakes,
      restEveryN: this._restEveryN,
      envIntensity: this.material.envMapIntensity,
      layer: this.floorMesh.layers.mask,
      params: this.getParams()
    };
  }

  _disposeProbe() {
    this._cubeTarget?.dispose();
    this._cubeTarget = null;
    this._cubeCamera = null;
    this._probeSize = 0;
  }

  dispose() {
    this._disposeProbe();
  }
}

/**
 * Load wet-concrete textures (1024 runtime from masters/concrete-6).
 * @returns {Promise<{
 *   map: THREE.Texture,
 *   roughnessMap: THREE.Texture,
 *   normalMap: THREE.Texture,
 *   metalnessMap: THREE.Texture
 * }>}
 */
export function loadWetFloorTextures() {
  const loader = new THREE.TextureLoader();
  const load = (url, colorSpace) =>
    new Promise((resolve, reject) => {
      loader.load(
        url,
        (tex) => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.anisotropy = 4;
          if (colorSpace != null) tex.colorSpace = colorSpace;
          resolve(tex);
        },
        undefined,
        reject
      );
    });

  return Promise.all([
    load(WET_FLOOR_TEX.baseColor, THREE.SRGBColorSpace),
    load(WET_FLOOR_TEX.roughness, THREE.NoColorSpace),
    load(WET_FLOOR_TEX.normal, THREE.NoColorSpace),
    load(WET_FLOOR_TEX.metallic, THREE.NoColorSpace)
  ]).then(([map, roughnessMap, normalMap, metalnessMap]) => ({
    map,
    roughnessMap,
    normalMap,
    metalnessMap
  }));
}
