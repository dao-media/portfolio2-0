// Content-agnostic "screen in a dark room" light spill for Three.js.
// Samples the average color of whatever texture is on the screen and
// drives a RectAreaLight (forward spill) + PointLight (bezel backglow).
//
// Requires three >= r150. RectAreaLight only lights MeshStandard/PhysicalMaterial.

import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

let _rectAreaInit = false;

export class ScreenLightRig {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{
   *   screenTexture: THREE.Texture,
   *   screenWidth?: number,
   *   screenHeight?: number,
   *   maxSpillIntensity?: number,
   *   maxGlowIntensity?: number,
   *   sampleInterval?: number,
   *   smoothing?: number,
   *   saturationBoost?: number,
   *   forwardOffset?: number,
   *   glowDepth?: number,
   *   flipForward?: boolean
   * }} options
   */
  constructor(renderer, options = {}) {
    const {
      screenTexture,
      screenWidth = 0.4,
      screenHeight = 0.3,
      maxSpillIntensity = 6,
      maxGlowIntensity = 0.6,
      sampleInterval = 4,
      smoothing = 0.08,
      saturationBoost = 1.35,
      forwardOffset = 0.02,
      glowDepth = 0.15,
      flipForward = false
    } = options;

    if (!_rectAreaInit) {
      RectAreaLightUniformsLib.init();
      _rectAreaInit = true;
    }

    this.renderer = renderer;
    this.texture = screenTexture;
    this.sampleInterval = sampleInterval;
    this.smoothing = smoothing;
    this.saturationBoost = saturationBoost;
    this.maxSpillIntensity = maxSpillIntensity;
    this.maxGlowIntensity = maxGlowIntensity;

    this._rt = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false
    });
    this._pixel = new Uint8Array(4);

    this._blitScene = new THREE.Scene();
    this._blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._blitMat = new THREE.MeshBasicMaterial({ map: screenTexture });
    this._blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._blitMat));

    this.group = new THREE.Group();

    this.spill = new THREE.RectAreaLight(0xffffff, 0, screenWidth, screenHeight);
    this.spill.position.set(0, 0, forwardOffset);
    this.spill.lookAt(0, 0, flipForward ? -1 : 1);
    this.group.add(this.spill);

    this.glow = new THREE.PointLight(0xffffff, 0, screenWidth * 6, 2);
    this.glow.position.set(0, 0, -Math.abs(glowDepth));
    this.group.add(this.glow);

    this._frame = 0;
    this._targetColor = new THREE.Color(0x000000);
    this._targetLuma = 0;
    this._hsl = { h: 0, s: 0, l: 0 };
  }

  /** @param {THREE.Texture} [texture] */
  setTexture(texture) {
    if (!texture) return;
    this.texture = texture;
    this._blitMat.map = texture;
  }

  /** Call once per frame from your render loop. */
  update() {
    this._frame++;
    if (this._frame % this.sampleInterval === 0) this._sample();

    this.spill.color.lerp(this._targetColor, this.smoothing);
    this.glow.color.copy(this.spill.color);

    const targetSpill = this._targetLuma * this.maxSpillIntensity;
    const targetGlow = this._targetLuma * this.maxGlowIntensity;
    this.spill.intensity += (targetSpill - this.spill.intensity) * this.smoothing;
    this.glow.intensity += (targetGlow - this.glow.intensity) * this.smoothing;
  }

  _sample() {
    const r = this.renderer;
    const prevRT = r.getRenderTarget();

    this._blitMat.map = this.texture;
    r.setRenderTarget(this._rt);
    r.render(this._blitScene, this._blitCam);
    r.readRenderTargetPixels(this._rt, 0, 0, 1, 1, this._pixel);
    r.setRenderTarget(prevRT);

    const [pr, pg, pb] = this._pixel;
    const c = this._targetColor.setRGB(pr / 255, pg / 255, pb / 255);

    this._targetLuma = 0.2126 * (pr / 255) + 0.7152 * (pg / 255) + 0.0722 * (pb / 255);

    c.getHSL(this._hsl);
    if (this._hsl.s > 0.02) {
      c.setHSL(
        this._hsl.h,
        Math.min(1, this._hsl.s * this.saturationBoost),
        THREE.MathUtils.clamp(this._hsl.l, 0.35, 0.6)
      );
    } else {
      c.setHSL(0.58, 0.08, 0.55);
    }
  }

  dispose() {
    this._rt.dispose();
    this._blitMat.dispose();
    this.group.removeFromParent();
  }
}
