import * as THREE from "three";

/**
 * Film grain over the lit beauty pass — no fake spotlight mask.
 * Scene lighting uses SpotLight.castShadow for the POV pool.
 */
export class PostPass {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {number} pixelRatio
   * @param {number} grain
   */
  constructor(renderer, pixelRatio, grain = 0.05) {
    this.renderer = renderer;
    this.pixelRatio = pixelRatio;
    this.grain = grain;

    this._width = 1;
    this._height = 1;
    this._createTarget(1, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.uniforms = {
      tDiffuse: { value: this.target.texture },
      uTime: { value: 0 },
      uGrain: { value: grain }
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uGrain;

        varying vec2 vUv;

        float rand(vec2 co) {
          return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec4 col = texture2D(tDiffuse, vUv);
          float g = (rand(vUv * (uTime + 1.0)) - 0.5) * uGrain;
          col.rgb += g;
          gl_FragColor = col;
        }
      `
    });

    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.setSize(window.innerWidth, window.innerHeight);
  }

  _createTarget(width, height) {
    this.target?.dispose();

    this.target = new THREE.WebGLRenderTarget(width, height);
    this.target.texture.colorSpace = THREE.SRGBColorSpace;

    if (this.uniforms) {
      this.uniforms.tDiffuse.value = this.target.texture;
    }
  }

  setSize(width, height) {
    const w = Math.floor(width * this.pixelRatio);
    const h = Math.floor(height * this.pixelRatio);
    if (w === this._width && h === this._height) return;
    this._width = w;
    this._height = h;
    this._createTarget(w, h);
  }

  render(scene, camera, time, options = {}) {
    const grainStrength =
      typeof options.grainStrength === "number"
        ? THREE.MathUtils.clamp(options.grainStrength, 0, 1)
        : 1;

    this.uniforms.uTime.value = time;
    this.uniforms.uGrain.value = this.grain * grainStrength;

    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  /** Apply grain over an already-composed frame. */
  renderComposed(sourceTexture, time) {
    this.uniforms.uTime.value = time;
    this.uniforms.tDiffuse.value = sourceTexture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}
