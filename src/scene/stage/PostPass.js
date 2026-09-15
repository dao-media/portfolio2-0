import * as THREE from "three";
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  KernelSize,
  RenderPass
} from "postprocessing";
import { NEON_BLOOM } from "./constants.js";
import { FilmGrainEffect } from "./FilmGrainEffect.js";

/**
 * One live composer: RenderPass → volumetric fog → (optional) EdgeGlitchPass →
 * bloom → (optional) film grain. Grain defaults to **0**. Grain stays last so
 * it is not bloomed. Do not add a second composer.
 */
export class PostPass {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {number} pixelRatio
   * @param {number} grain
   * @param {THREE.Camera} camera
   * @param {{
   *   bloom?: boolean,
   *   scene?: THREE.Scene,
   *   volumetricPass?: import("../neon/VolumetricFogPass.js").VolumetricFogPass | null,
   *   edgeGlitchPass?: import("../edgeGlitch/EdgeGlitchPass.js").EdgeGlitchPass | null,
   *   edgeTubeGlitchPass?: import("../edgeGlitch/EdgeGlitchPass.js").EdgeGlitchPass | null
   * }} [options]
   */
  constructor(renderer, pixelRatio, grain = 0, camera, options = {}) {
    this.renderer = renderer;
    this.pixelRatio = pixelRatio;
    this.grain = grain;
    this.camera = camera;
    this._width = 0;
    this._height = 0;
    this._drawW = 0;
    this._drawH = 0;
    this._scene = options.scene ?? null;
    this.volumetricPass = options.volumetricPass ?? null;
    this.edgeGlitchPass =
      options.edgeGlitchPass ?? options.edgeTubeGlitchPass ?? null;
    this.edgeTubeGlitchPass = this.edgeGlitchPass;

    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0
    });

    this.renderPass = new RenderPass(this._scene ?? new THREE.Scene(), camera);
    const bloomScale = NEON_BLOOM.resolutionScale ?? 0.5;
    // mipmapBlur: false — Kawase/mipmap path intermittently outputs a full-black
    // frame when the camera translates every frame (stop-0 parallax). Kernel
    // blur stays stable under the same motion. Do not re-enable without a
    // move-cursor zero-frame probe at stop 0.
    this.bloomEffect = new BloomEffect({
      mipmapBlur: false,
      luminanceThreshold: NEON_BLOOM.luminanceThreshold,
      luminanceSmoothing: NEON_BLOOM.luminanceSmoothing,
      intensity: options.bloom === false ? 0 : NEON_BLOOM.intensity,
      radius: NEON_BLOOM.radius,
      resolutionScale: bloomScale,
      kernelSize: KernelSize.LARGE
    });
    this.bloomPass = new EffectPass(camera, this.bloomEffect);
    this.grainEffect = new FilmGrainEffect({ grain });
    this.grainPass = new EffectPass(camera, this.grainEffect);

    this.composer.addPass(this.renderPass);
    if (this.volumetricPass) {
      this.composer.addPass(this.volumetricPass);
    }
    // fog → EdgeGlitch → bloom → grain (silhouette tears before bloom)
    if (this.edgeGlitchPass) {
      this.composer.addPass(this.edgeGlitchPass);
    }
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.grainPass);

    this.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * CSS pixel size → composer + volumetric RTs from the *drawing buffer*.
   * Early-out only when both CSS and drawing-buffer dims are unchanged and
   * composer buffers are non-zero (DPR / work-quality must not stick at 0×0).
   */
  setSize(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const draw = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(draw);
    let dw = Math.max(0, Math.floor(draw.x));
    let dh = Math.max(0, Math.floor(draw.y));

    const cssSame = w === this._width && h === this._height;
    const drawSame = dw === this._drawW && dh === this._drawH;
    const buffersOk =
      (this.composer.inputBuffer?.width ?? 0) >= 1 &&
      (this.composer.inputBuffer?.height ?? 0) >= 1;

    if (cssSame && drawSame && buffersOk) return;

    this._width = w;
    this._height = h;

    // EffectComposer.setSize also syncs the renderer when CSS size differs.
    this.composer.setSize(w, h);

    this.renderer.getDrawingBufferSize(draw);
    dw = Math.max(1, Math.floor(draw.x) || w);
    dh = Math.max(1, Math.floor(draw.y) || h);
    this._drawW = dw;
    this._drawH = dh;

    // Guard: if composer landed on 0×0 (canvas not ready), force ≥1.
    if ((this.composer.inputBuffer?.width ?? 0) < 1 || (this.composer.inputBuffer?.height ?? 0) < 1) {
      this.composer.inputBuffer.setSize(dw, dh);
      this.composer.outputBuffer.setSize(dw, dh);
    }

    this.volumetricPass?.setSize?.(dw, dh);
  }

  /**
   * Authored bloom intensity (restored after fog opacity land fade).
   * @param {number} intensity
   */
  setBloomIntensity(intensity) {
    if (!this.bloomEffect) return;
    this.bloomEffect.intensity = Math.max(0, intensity);
  }

  /** @returns {number} */
  getBloomIntensity() {
    return this.bloomEffect?.intensity ?? 0;
  }

  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {number} time
   * @param {{ grainStrength?: number }} [options]
   */
  render(scene, camera, time, options = {}) {
    const grainStrength =
      typeof options.grainStrength === "number"
        ? THREE.MathUtils.clamp(options.grainStrength, 0, 1)
        : 1;

    this._scene = scene;
    this.renderPass.mainScene = scene;
    this.renderPass.mainCamera = camera;
    if (this.volumetricPass) {
      this.volumetricPass.sceneCamera = camera;
      this.volumetricPass.setTime(time);
      this.volumetricPass.ensureSizeFromRenderer?.(this.renderer);
    }
    this.grainEffect.uniforms.get("uTime").value = time;
    this.grainEffect.uniforms.get("uGrain").value = this.grain * grainStrength;
    this.composer.render();
  }

  /** Throwaway composed frame — warms bloom, volumetric shaders, and grain if amount > 0. */
  warm() {
    if (!this._scene) return;
    // Ensure RTs are real before the throwaway draw (§9/§20 — no compile hitch later).
    this.setSize(this._width || window.innerWidth, this._height || window.innerHeight);
    this.volumetricPass?.ensureSizeFromRenderer?.(this.renderer);

    const vol = this.volumetricPass;
    const prevEnabled = vol ? vol.enabled : null;
    const prevScale = vol?.marchMaterial?.uniforms?.uDensityScale?.value;
    if (vol) {
      vol.enabled = true;
      vol.setDensityScale?.(0);
    }
    this.composer.render();
    if (vol) {
      vol.enabled = prevEnabled;
      if (typeof prevScale === "number") vol.setDensityScale(prevScale);
    }
  }

  dispose() {
    this.composer.dispose();
    this.bloomEffect.dispose();
    // edgeTubeGlitchEffect is owned by EdgeGlitchSystem
    this.grainEffect.dispose();
    this.volumetricPass?.dispose?.();
  }
}
