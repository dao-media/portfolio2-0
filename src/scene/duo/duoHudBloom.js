/**
 * Lightweight HUD bloom for the Duo overlay.
 * Renders hudScene offscreen → UnrealBloomPass → composites onto the main
 * buffer without wiping the stage (composer.renderToScreen = false).
 */

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { CopyShader } from "three/examples/jsm/shaders/CopyShader.js";

const BLIT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BLIT_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  gl_FragColor = vec4(c.rgb, c.a * uOpacity);
}
`;

export class DuoHudBloom {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{
   *   strength?: number,
   *   radius?: number,
   *   threshold?: number,
   *   resolutionScale?: number
   * }} [opts]
   */
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.strength = opts.strength ?? 0.85;
    this.radius = opts.radius ?? 0.42;
    this.threshold = opts.threshold ?? 0.35;
    this.resolutionScale = opts.resolutionScale ?? 0.5;

    this._w = 1;
    this._h = 1;
    this._enabled = true;

    const rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      samples: 0
    });
    rt.texture.name = "duo-hud-bloom";

    this.composer = new EffectComposer(renderer, rt);
    this.composer.renderToScreen = false;

    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
    this.renderPass.clearColor = new THREE.Color(0x000000);
    this.renderPass.clearAlpha = 0;

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(2, 2),
      this.strength,
      this.radius,
      this.threshold
    );

    // Keep alpha so we can composite over the stage.
    this.copyPass = new ShaderPass(CopyShader);
    this.copyPass.renderToScreen = false;

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.copyPass);

    this._blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._blitMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uOpacity: { value: 1 }
      },
      vertexShader: BLIT_VERT,
      fragmentShader: BLIT_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // Additive so black RT clear doesn't wipe the stage — glow only.
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    this._blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._blitMat);
    this._blitFrustum = new THREE.Scene();
    this._blitFrustum.add(this._blit);
  }

  /**
   * @param {boolean} on
   */
  setEnabled(on) {
    this._enabled = Boolean(on);
    this.bloomPass.enabled = this._enabled;
  }

  /**
   * @param {number} strength
   */
  setStrength(strength) {
    this.strength = strength;
    this.bloomPass.strength = strength;
  }

  /**
   * @param {number} width CSS pixels
   * @param {number} height CSS pixels
   */
  setSize(width, height) {
    const scale = this.resolutionScale;
    const w = Math.max(2, Math.floor(width * scale));
    const h = Math.max(2, Math.floor(height * scale));
    if (w === this._w && h === this._h) return;
    this._w = w;
    this._h = h;
    // EffectComposer applies renderer.getPixelRatio() internally.
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio?.() ?? 1;
    this.bloomPass.resolution.set(w * pr, h * pr);
  }

  /**
   * Render `scene`/`camera` with bloom, then composite onto the current
   * framebuffer (does not clear color — call clearDepth first).
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  render(scene, camera) {
    if (!this.renderer) return;

    this.renderPass.scene = scene;
    this.renderPass.camera = camera;

    const prevTarget = this.renderer.getRenderTarget();
    const prevAutoClear = this.renderer.autoClear;
    const prevXr = this.renderer.xr?.enabled;

    try {
      if (this.renderer.xr) this.renderer.xr.enabled = false;
      this.composer.render();

      // Final pass wrote to writeBuffer (renderToScreen = false).
      const out =
        this.composer.writeBuffer?.texture ??
        this.composer.readBuffer?.texture;
      if (!out) return;

      this._blitMat.uniforms.tDiffuse.value = out;
      this.renderer.setRenderTarget(null);
      this.renderer.autoClear = false;
      this.renderer.render(this._blitFrustum, this._blitCam);
    } finally {
      this.renderer.autoClear = prevAutoClear;
      this.renderer.setRenderTarget(prevTarget);
      if (this.renderer.xr && prevXr != null) this.renderer.xr.enabled = prevXr;
    }
  }

  dispose() {
    this.composer?.dispose?.();
    this.bloomPass?.dispose?.();
    this._blitMat?.dispose?.();
    this._blit?.geometry?.dispose?.();
  }
}
