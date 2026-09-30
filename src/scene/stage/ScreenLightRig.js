// Content-agnostic "screen in a dark room" light spill for Three.js.
// The screen image is a 2D canvas before it becomes a texture. The spill
// tint is the average of that canvas — never a WebGL readback.
//
// Requires three >= r150. RectAreaLight only lights MeshStandard/PhysicalMaterial.

import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

let _rectAreaInit = false;

export class ScreenLightRig {
  /**
   * @param {THREE.WebGLRenderer} _renderer unused — kept so callers stay stable
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
  constructor(_renderer, options = {}) {
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
      flipForward = false,
      spill = null,
      glow = null
    } = options;

    if (!_rectAreaInit) {
      RectAreaLightUniformsLib.init();
      _rectAreaInit = true;
    }

    this.texture = screenTexture;
    this.sampleInterval = sampleInterval;
    this.smoothing = smoothing;
    this.saturationBoost = saturationBoost;
    this._baseMaxSpillIntensity = maxSpillIntensity;
    this._baseMaxGlowIntensity = maxGlowIntensity;
    this.maxSpillIntensity = maxSpillIntensity;
    this.maxGlowIntensity = maxGlowIntensity;
    this._intensityScale = 1;
    /** 0 = off (black screen / powered down); 1 = full spill. */
    this._power = 0;
    this._powerTarget = 0;

    const sample = document.createElement("canvas");
    sample.width = 1;
    sample.height = 1;
    this._sampleCanvas = sample;
    this._sampleCtx = sample.getContext("2d", { willReadFrequently: true });

    this.group = new THREE.Group();
    this._ownedLights = !(spill && glow);
    this._spillAnchor = new THREE.Object3D();
    this._spillAnchor.name = "screen-spill-anchor";
    this._spillAnchor.position.set(0, 0, forwardOffset);
    this._spillAnchor.lookAt(0, 0, flipForward ? -1 : 1);
    this._glowAnchor = new THREE.Object3D();
    this._glowAnchor.name = "screen-glow-anchor";
    this._glowAnchor.position.set(0, 0, -Math.abs(glowDepth));

    if (this._ownedLights) {
      this.spill = new THREE.RectAreaLight(0xffffff, 0, screenWidth, screenHeight);
      this.spill.position.copy(this._spillAnchor.position);
      this.spill.quaternion.copy(this._spillAnchor.quaternion);
      this.group.add(this.spill);
      this.glow = new THREE.PointLight(0xffffff, 0, screenWidth * 7.5, 1.85);
      this.glow.position.copy(this._glowAnchor.position);
      this.group.add(this.glow);
    } else {
      this.spill = spill;
      this.glow = glow;
      this.spill.width = screenWidth;
      this.spill.height = screenHeight;
      this.glow.distance = screenWidth * 7.5;
      this.spill.intensity = 0;
      this.glow.intensity = 0;
      this.glow.castShadow = false;
    }

    this._frame = 0;
    this._lastSampleFrame = -1000;
    this._sampledVersion = -1;
    this._hasSample = false;
    this._targetColor = new THREE.Color(0x000000);
    this._targetLuma = 0;
    this._hsl = { h: 0, s: 0, l: 0 };
  }

  /** @param {THREE.Texture} [texture] */
  setTexture(texture) {
    if (!texture) return;
    this.texture = texture;
  }

  /** Scale spill/glow caps — e.g. pull back when the monitor fills the frame. */
  setIntensityScale(scale) {
    const s = THREE.MathUtils.clamp(scale, 0, 1);
    if (Math.abs(s - this._intensityScale) < 1e-4) return;
    this._intensityScale = s;
    this.maxSpillIntensity = this._baseMaxSpillIntensity * s;
    this.maxGlowIntensity = this._baseMaxGlowIntensity * s;
  }

  /**
   * Soft power gate — 0 while the CRT is off, 1 once lit.
   * @param {number} power
   */
  setPower(power) {
    this._powerTarget = THREE.MathUtils.clamp(power, 0, 1);
  }

  /**
   * Screen mesh owns the pose anchors. The lights stay on the stage rig.
   * @param {THREE.Object3D} screenMesh
   */
  bindAnchor(screenMesh) {
    this.anchor = screenMesh;
    screenMesh.add(this._spillAnchor);
    screenMesh.add(this._glowAnchor);
    this.syncPose();
  }

  /** Copy anchor world pose onto the scene-level lights. */
  syncPose() {
    if (this._ownedLights || !this.anchor) return;
    this._spillAnchor.updateWorldMatrix(true, false);
    this.spill.position.setFromMatrixPosition(this._spillAnchor.matrixWorld);
    this.spill.quaternion.setFromRotationMatrix(this._spillAnchor.matrixWorld);
    this._glowAnchor.updateWorldMatrix(true, false);
    this.glow.position.setFromMatrixPosition(this._glowAnchor.matrixWorld);
    this.glow.quaternion.setFromRotationMatrix(this._glowAnchor.matrixWorld);
  }

  /**
   * Hidden vignette content used to drop these lights out of the program key.
   * Keep them in the graph and write intensity 0 instead.
   * @returns {boolean} true when the lights are held at 0
   */
  hold() {
    this.syncPose();
    let node = this.anchor;
    while (node) {
      if (node.visible === false) {
        this.spill.intensity = 0;
        this.glow.intensity = 0;
        return true;
      }
      node = node.parent;
    }
    return false;
  }

  /** Call once per frame from your render loop. */
  update() {
    if (this.hold()) return;
    this._power += (this._powerTarget - this._power) * 0.08;
    if (this._power < 0.002 && this._powerTarget < 0.002) {
      this.spill.intensity *= 0.85;
      this.glow.intensity *= 0.85;
      if (this.spill.intensity < 0.01) this.spill.intensity = 0;
      if (this.glow.intensity < 0.01) this.glow.intensity = 0;
      return;
    }

    this._frame++;
    const version = this.texture?.version ?? 0;
    const stale = !this._hasSample || version !== this._sampledVersion;
    if (stale && this._frame - this._lastSampleFrame >= this.sampleInterval) {
      this._sample();
      this._sampledVersion = version;
      this._lastSampleFrame = this._frame;
      this._hasSample = true;
    }

    this.spill.color.lerp(this._targetColor, this.smoothing);
    this.glow.color.copy(this.spill.color);

    const power = this._power;
    const targetSpill = this._targetLuma * this.maxSpillIntensity * power;
    const targetGlow = this._targetLuma * this.maxGlowIntensity * power;
    this.spill.intensity += (targetSpill - this.spill.intensity) * this.smoothing;
    this.glow.intensity += (targetGlow - this.glow.intensity) * this.smoothing;
  }

  /**
   * Average the source canvas into one pixel. The image is the same
   * canvas the CanvasTexture uploads — this does not touch WebGL.
   */
  _sample() {
    const source = this.texture?.image;
    const ctx = this._sampleCtx;
    if (!ctx || !source || !source.width || !source.height) return;

    ctx.drawImage(source, 0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const pr = data[0] / 255;
    const pg = data[1] / 255;
    const pb = data[2] / 255;
    const c = this._targetColor.setRGB(pr, pg, pb);

    this._targetLuma = THREE.MathUtils.clamp(
      0.2126 * pr + 0.7152 * pg + 0.0722 * pb,
      0,
      0.78
    );

    c.getHSL(this._hsl);
    if (this._hsl.s > 0.02) {
      c.setHSL(
        this._hsl.h,
        Math.min(1, this._hsl.s * this.saturationBoost),
        THREE.MathUtils.clamp(this._hsl.l, 0.32, 0.62)
      );
    } else {
      // Near-neutral UI (MySpace white) — warm CRT phosphor tint.
      c.setHSL(0.12, 0.12, 0.58);
    }
  }

  dispose() {
    this._sampleCanvas = null;
    this._sampleCtx = null;
    this._spillAnchor.removeFromParent();
    this._glowAnchor.removeFromParent();
    this.anchor = null;
    if (this._ownedLights) this.group.removeFromParent();
    else {
      this.spill.intensity = 0;
      this.glow.intensity = 0;
    }
  }
}
