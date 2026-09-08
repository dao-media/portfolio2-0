import * as THREE from "three";

const _clearColor = new THREE.Color();

/**
 * Opaque-scene depth for fog soft-particle fade.
 *
 * EffectComposer's depth texture is only blitted *after* RenderPass (for post
 * effects). Fog draws *during* RenderPass, so it cannot sample that buffer
 * without a framebuffer feedback loop. This pre-pass is one depth-only
 * traversal of layer-0 geometry (fog/haze stay on layer 2 and are skipped).
 *
 * Depth is written with MeshDepthMaterial into a **color** target (Three's
 * BasicDepthPacking stores `1.0 - windowZ` in `.r` — the fog shader undoes that).
 * Sampling a DepthTexture attachment from a prior pass was unreliable with the
 * half-float composer; color-encoded depth is stable.
 *
 * Not a second EffectComposer — no color beauty, just packed depth.
 */
export class FogDepthCapture {
  constructor() {
    this._size = new THREE.Vector2(1, 1);
    this._depthMat = new THREE.MeshDepthMaterial({
      depthTest: true,
      depthWrite: true
    });
    // ACES on this pass would warp BasicDepthPacking `.r` before the fog invert-undo.
    this._depthMat.toneMapped = false;
    this._target = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: true,
      stencilBuffer: false,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false
    });
    this._target.texture.name = "neon-fog-scene-depth";
    this._target.texture.colorSpace = THREE.NoColorSpace;
    this._target.texture.flipY = false;
    /** @type {THREE.Object3D[]} */
    this._hidden = [];
  }

  /** Packed inverted window-depth in .r (BasicDepthPacking). @returns {THREE.Texture} */
  get depthTexture() {
    return this._target.texture;
  }

  get target() {
    return this._target;
  }

  get depthMaterial() {
    return this._depthMat;
  }

  /**
   * Match the drawing buffer so `gl_FragCoord / uResolution` lines up.
   * @param {THREE.WebGLRenderer} renderer
   */
  setSizeFromRenderer(renderer) {
    renderer.getDrawingBufferSize(this._size);
    const w = Math.max(1, Math.floor(this._size.x));
    const h = Math.max(1, Math.floor(this._size.y));
    if (w === this._target.width && h === this._target.height) return;
    this._target.setSize(w, h);
  }

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {THREE.Object3D[]} [hideObjects]
   * @param {{ includeHoldLayer?: boolean, holdLayer?: number }} [opts]
   */
  render(renderer, scene, camera, hideObjects = [], { includeHoldLayer = false, holdLayer = 3 } = {}) {
    this.setSizeFromRenderer(renderer);

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevOverride = scene.overrideMaterial;
    const prevLayerMask = camera.layers.mask;
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    const prevShadowNeeds = renderer.shadowMap.needsUpdate;
    const prevBg = scene.background;
    const prevToneMapping = renderer.toneMapping;
    renderer.getClearColor(_clearColor);
    const prevClearAlpha = renderer.getClearAlpha();

    this._hidden.length = 0;
    for (let i = 0; i < hideObjects.length; i += 1) {
      const obj = hideObjects[i];
      if (!obj || !obj.visible) continue;
      obj.visible = false;
      this._hidden.push(obj);
    }

    // Layer 0 only — fog ring + haze are NEON_FOG_LAYER (2).
    // Held roots sit on holdLayer until compile; include them only for the
    // pre-show depth warm so the first live fog frame does not compile.
    camera.layers.set(0);
    if (includeHoldLayer) camera.layers.enable(holdLayer);
    scene.overrideMaterial = this._depthMat;
    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.autoClear = true;
    // BasicDepthPacking stores (1.0 - windowZ): far/empty → 0 (black).
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(this._target);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);

    renderer.setRenderTarget(prevTarget);
    renderer.toneMapping = prevToneMapping;
    renderer.setClearColor(_clearColor, prevClearAlpha);
    renderer.autoClear = prevAutoClear;
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    camera.layers.mask = prevLayerMask;
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    renderer.shadowMap.needsUpdate = prevShadowNeeds;

    for (let i = 0; i < this._hidden.length; i += 1) {
      this._hidden[i].visible = true;
    }
    this._hidden.length = 0;
  }

  dispose() {
    this._target.dispose();
    this._depthMat.dispose();
  }
}
