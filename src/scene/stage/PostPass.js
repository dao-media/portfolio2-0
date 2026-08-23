import * as THREE from "three";
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass
} from "postprocessing";
import { NEON_BLOOM } from "./constants.js";
import { FilmGrainEffect } from "./FilmGrainEffect.js";

/**
 * One live composer: RenderPass → bloom → film grain.
 * Grain stays last so it isn't bloomed. Do not add a second composer.
 */
export class PostPass {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {number} pixelRatio
   * @param {number} grain
   * @param {THREE.Camera} camera
   * @param {{ bloom?: boolean }} [options]
   */
  constructor(renderer, pixelRatio, grain = 0.05, camera, options = {}) {
    this.renderer = renderer;
    this.pixelRatio = pixelRatio;
    this.grain = grain;
    this.camera = camera;
    this._width = 1;
    this._height = 1;
    this._scene = options.scene ?? null;

    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0
    });

    this.renderPass = new RenderPass(this._scene ?? new THREE.Scene(), camera);
    this.bloomEffect = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: NEON_BLOOM.luminanceThreshold,
      luminanceSmoothing: NEON_BLOOM.luminanceSmoothing,
      intensity: options.bloom === false ? 0 : NEON_BLOOM.intensity,
      radius: NEON_BLOOM.radius
    });
    this.bloomPass = new EffectPass(camera, this.bloomEffect);
    this.grainEffect = new FilmGrainEffect({ grain });
    this.grainPass = new EffectPass(camera, this.grainEffect);

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.grainPass);

    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this._width && h === this._height) return;
    this._width = w;
    this._height = h;
    this.composer.setSize(w, h);
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
    this.grainEffect.uniforms.get("uTime").value = time;
    this.grainEffect.uniforms.get("uGrain").value = this.grain * grainStrength;
    this.composer.render();
  }

  /** Throwaway composed frame — warms bloom + grain programs. */
  warm() {
    if (!this._scene) return;
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
    this.bloomEffect.dispose();
    this.grainEffect.dispose();
  }
}
