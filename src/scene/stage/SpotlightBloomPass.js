import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/**
 * Selective Unreal bloom for the POV spotlight pool.
 *
 * Mechanics ported from the official Three.js example:
 * https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective
 *
 * Not wired into StageExperience yet — keep for the dedicated lighting pass.
 * Wire via PostPass.renderComposed() and tune SPOTLIGHT_BLOOM in constants.js.
 *
 * Objects assigned to {@link SPOTLIGHT_BLOOM_LAYER} are isolated via a material
 * swap (non-bloom meshes render black), bloomed in a secondary composer, then
 * mixed back over the full scene.
 */
export const SPOTLIGHT_BLOOM_LAYER = 1;

const MIX_VERTEX = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MIX_FRAGMENT = `
  uniform sampler2D baseTexture;
  uniform sampler2D bloomTexture;
  uniform float bloomStrength;

  varying vec2 vUv;

  void main() {
    gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv) * bloomStrength;
  }
`;

export class SpotlightBloomPass {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{
   *   pixelRatio?: number,
   *   threshold?: number,
   *   strength?: number,
   *   radius?: number,
   *   enabled?: boolean
   * }} [options]
   */
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.pixelRatio = options.pixelRatio ?? renderer.getPixelRatio();
    this.enabled = options.enabled ?? true;

    this.params = {
      threshold: options.threshold ?? 0,
      strength: options.strength ?? 0.52,
      radius: options.radius ?? 0.42
    };

    this.bloomLayer = new THREE.Layers();
    this.bloomLayer.set(SPOTLIGHT_BLOOM_LAYER);

    this.darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this._materialSwap = new Map();

    this._scene = null;
    this._camera = null;

    const bloomTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.bloomComposer = new EffectComposer(renderer, bloomTarget);
    this.bloomComposer.renderToScreen = false;

    this.bloomRenderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.5, 0.4, 0.85);
    this.bloomPass.threshold = this.params.threshold;
    this.bloomPass.strength = this.params.strength;
    this.bloomPass.radius = this.params.radius;

    this.bloomComposer.addPass(this.bloomRenderPass);
    this.bloomComposer.addPass(this.bloomPass);

    this.mixPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          baseTexture: { value: null },
          bloomTexture: { value: this.bloomComposer.renderTarget2.texture },
          bloomStrength: { value: this.params.strength }
        },
        vertexShader: MIX_VERTEX,
        fragmentShader: MIX_FRAGMENT
      }),
      "baseTexture"
    );
    this.mixPass.needsSwap = true;

    this.outputPass = new OutputPass();

    const finalTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.finalComposer = new EffectComposer(renderer, finalTarget);
    this.finalComposer.renderToScreen = false;

    this.finalRenderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.finalComposer.addPass(this.finalRenderPass);
    this.finalComposer.addPass(this.mixPass);
    this.finalComposer.addPass(this.outputPass);
  }

  /**
   * Mark an object (and mesh descendants) for selective bloom.
   * @param {THREE.Object3D} object
   */
  enable(object) {
    object.traverse((node) => {
      if (node.isMesh || node.isLine || node.isPoints) {
        node.layers.enable(SPOTLIGHT_BLOOM_LAYER);
      }
    });
  }

  /**
   * Remove selective bloom from an object subtree.
   * @param {THREE.Object3D} object
   */
  disable(object) {
    object.traverse((node) => {
      if (node.isMesh || node.isLine || node.isPoints) {
        node.layers.disable(SPOTLIGHT_BLOOM_LAYER);
      }
    });
  }

  /** Toggle bloom layer membership (matches the Three.js example click handler). */
  toggle(object) {
    object.traverse((node) => {
      if (node.isMesh || node.isLine || node.isPoints) {
        node.layers.toggle(SPOTLIGHT_BLOOM_LAYER);
      }
    });
  }

  setStrength(strength) {
    this.params.strength = strength;
    this.bloomPass.strength = strength;
    this.mixPass.material.uniforms.bloomStrength.value = strength;
  }

  setThreshold(threshold) {
    this.params.threshold = threshold;
    this.bloomPass.threshold = threshold;
  }

  setRadius(radius) {
    this.params.radius = radius;
    this.bloomPass.radius = radius;
  }

  setSize(width, height) {
    this.bloomComposer.setSize(width, height);
    this.finalComposer.setSize(width, height);
  }

  setPixelRatio(pixelRatio) {
    this.pixelRatio = pixelRatio;
    this.bloomComposer.setPixelRatio(pixelRatio);
    this.finalComposer.setPixelRatio(pixelRatio);
  }

  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @returns {THREE.Texture|null} Composed frame for downstream passes (grain), or null when disabled.
   */
  render(scene, camera) {
    if (!this.enabled) return null;

    this._scene = scene;
    this._camera = camera;

    this.bloomRenderPass.scene = scene;
    this.bloomRenderPass.camera = camera;
    this.finalRenderPass.scene = scene;
    this.finalRenderPass.camera = camera;

    scene.traverse((obj) => this._darkenNonBloomed(obj));
    this.bloomComposer.render();
    scene.traverse((obj) => this._restoreMaterials(obj));

    this.finalComposer.render();

    return this.finalComposer.writeBuffer.texture;
  }

  _darkenNonBloomed(object) {
    if (!object.isMesh || this.bloomLayer.test(object.layers) !== false) return;

    this._materialSwap.set(object.uuid, object.material);
    object.material = this.darkMaterial;
  }

  _restoreMaterials(object) {
    const stored = this._materialSwap.get(object.uuid);
    if (!stored) return;

    object.material = stored;
    this._materialSwap.delete(object.uuid);
  }

  dispose() {
    this.darkMaterial.dispose();
    this.mixPass.material.dispose();
    this.bloomComposer.dispose();
    this.finalComposer.dispose();
  }
}
