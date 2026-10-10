import * as THREE from "three";
import {
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  KernelSize,
  SMAAEffect,
  SMAAPreset
} from "postprocessing";
import { N8AOPostPass } from "n8ao";
import { BLACK_HOLE_MSAA, CURSOR_DOF, NEON_BLOOM } from "./constants.js";
import { installComposerSizePool } from "./composerSizePool.js";
import { DisplayGrainEffect, ExposureEffect, HalationEffect, StillAccumulatePass, makeHalationBloom, makeToneMap } from "./filmLookStudy.js";
import { FilmGrainEffect } from "./FilmGrainEffect.js";
import { PortalAwareRenderPass } from "../vignettes/PortalAwareRenderPass.js";

/**
 * One live composer: PortalAwareRenderPass → (optional, `?ao=1`) N8AO →
 * volumetric fog → (optional) EdgeGlitchPass → SMAA → cursor depth of
 * field → bloom → (optional) film grain. Rest AA is SMAA (multisampling 0).
 * The black-hole sequence disables SMAA and turns on MSAA. Grain defaults
 * to **0** and stays last so it is not bloomed. Depth of field stays
 * disabled while CURSOR_DOF.enabled is false. AO is a fidelity prototype,
 * off by default — see `options.aoEnabled`. Do not add a second composer.
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
   *   edgeTubeGlitchPass?: import("../edgeGlitch/EdgeGlitchPass.js").EdgeGlitchPass | null,
   *   aoEnabled?: boolean
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
      multisampling: 0,
      // Required for Archaeology Giza portal stencil window.
      stencilBuffer: true
    });

    this.renderPass = new PortalAwareRenderPass(
      this._scene ?? new THREE.Scene(),
      camera
    );
    // Stencil must clear each frame or Equal content smears outside the opening.
    this.renderPass.clearPass.setClearFlags(true, true, true);

    // Fidelity prototype (§20 Pass B item 3) — off by default, `?ao=1`.
    // Not in the DO-NOT list: governor/megapixel values, bloom threshold,
    // lights and environmentIntensity are all untouched; this only adds an
    // optional extra pass to the existing composer.
    this.aoPass = options.aoEnabled
      ? new N8AOPostPass(
          this._scene ?? new THREE.Scene(),
          camera,
          options.width || 1,
          options.height || 1
        )
      : null;
    if (this.aoPass) {
      this.aoPass.configuration.halfRes = true;
      this.aoPass.configuration.aoRadius = 1.5;
      this.aoPass.configuration.intensity = 3;
      this.aoPass.configuration.distanceFalloff = 1;
    }

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
    // Focus distance is overwritten each frame from the cursor hit when
    // CURSOR_DOF.enabled is true. The pass stays off while that flag is false.
    this.dofEffect = new DepthOfFieldEffect(camera, {
      focusDistance: 12,
      focusRange: CURSOR_DOF.focusRange,
      bokehScale: CURSOR_DOF.bokehScale,
      resolutionScale: CURSOR_DOF.resolutionScale
    });
    this.dofPass = new EffectPass(camera, this.dofEffect);
    this.dofPass.enabled = false;
    this._aaMode = "smaa";
    this.smaaEffect = new SMAAEffect({ preset: SMAAPreset.HIGH });
    this.smaaPass = new EffectPass(camera, this.smaaEffect);
    this.smaaPass.enabled = false;
    this.smaaEffect.addEventListener("load", () => {
      this._adoptSmaaBitmaps();
      if (this._aaMode === "smaa") this.smaaPass.enabled = true;
    });
    this.grainEffect = new FilmGrainEffect({ grain });
    this.grainPass = new EffectPass(camera, this.grainEffect);

    this.composer.addPass(this.renderPass);
    if (this.aoPass) {
      this.composer.addPass(this.aoPass);
    }
    if (this.volumetricPass) {
      this.composer.addPass(this.volumetricPass);
    }
    // fog → EdgeGlitch → SMAA → depth of field → bloom → grain
    // (AO, when enabled, sits right after the render pass so bloom reads
    // occluded color, not the other way around.)
    if (this.edgeGlitchPass) {
      this.composer.addPass(this.edgeGlitchPass);
    }
    this.composer.addPass(this.smaaPass);
    this.composer.addPass(this.dofPass);
    this.composer.addPass(this.bloomPass);
    // Pass P (DEV study, off): still-camera accumulation, before the last pass.
    this.accumPass = new StillAccumulatePass();
    this.accumPass.enabled = false;
    this.composer.addPass(this.accumPass);
    this.composer.addPass(this.grainPass);
    // Pass P (DEV study): halation + display grain swap into the last pass.
    this.halBloom = makeHalationBloom();
    this.halation = new HalationEffect({ texture: this.halBloom.texture });
    this.displayGrain = new DisplayGrainEffect();
    this._filmLook = 0;
    // Pass S S2 — shipped per-stop film look: halation + display grain stay
    // in the last pass permanently (no recompile across a hop); their
    // strengths are set per frame from the stop fades (setStopFilm).
    this.stopFilm = { grain: 0, halation: 0 };
    const halUpdate = this.halBloom.update.bind(this.halBloom);
    this.halBloom.update = (renderer, inputBuffer, deltaTime) => {
      // The blur source costs a half-res bloom chain; skip it while nothing
      // reads it (its texture keeps the last result, at intensity 0).
      if (this._filmLook || this.stopFilm.halation > 0) halUpdate(renderer, inputBuffer, deltaTime);
    };
    this._studyTone = null;
    this.studyExposure = new ExposureEffect();
    this._toneMaps = {};

    this.setStudyLook();
    this.setStopFilm(this.stopFilm);
    this.setSize(options.width || 1, options.height || 1);
    this._syncDepthBlit();
    installComposerSizePool(this.renderer, this.composer);
  }

  /**
   * DEV/Pass P P3/P4 — the last (to-screen) pass's effect list. Today it is
   * grain only and the composed image is NOT tone mapped (renderer
   * toneMapping / exposure never reach it). Study variants put an exposure
   * multiply + tone map, and/or halation + display-res grain, in that pass.
   * @param {{ tone?: string | null, exposure?: number, film?: 0 | { grain: number, halation: number } }} look
   */
  setStudyLook({ tone = this._studyTone, exposure, film = this._filmLook } = {}) {
    this._studyTone = tone || null;
    this._filmLook = film || 0;
    if (exposure != null) this.studyExposure.uniforms.get("uExposure").value = exposure;
    const effects = [];
    if (this._studyTone) {
      this._toneMaps[this._studyTone] ??= makeToneMap(this._studyTone);
      effects.push(this.studyExposure, this._toneMaps[this._studyTone]);
    }
    this.halation.uniforms.get("tHalation").value = this.halBloom.texture;
    if (this._filmLook) {
      this.displayGrain.uniforms.get("uAmount").value = this._filmLook.grain;
      this.halation.uniforms.get("uIntensity").value = this._filmLook.halation;
      effects.push(this.halBloom, this.halation, this.displayGrain);
    } else effects.push(this.halBloom, this.halation, this.displayGrain, this.grainEffect);
    this.grainPass.setEffects(effects);
  }

  /**
   * Pass S S2 — this frame's shipped film look (fade-weighted per stop).
   * A DEV study look (`setStudyLook({ film })`) overrides it.
   * @param {{ grain: number, halation: number }} look
   */
  setStopFilm(look) {
    this.stopFilm.grain = Math.max(0, look?.grain ?? 0);
    this.stopFilm.halation = Math.max(0, look?.halation ?? 0);
    if (this._filmLook) return;
    this.displayGrain.uniforms.get("uAmount").value = this.stopFilm.grain;
    this.halation.uniforms.get("uIntensity").value = this.stopFilm.halation;
  }

  /** Back-compat for the P4 switch. */
  setFilmLook(look) {
    this.setStudyLook({ film: look || 0 });
  }

  /** Composer buffer width after the last draw-size swap. */
  get drawWidth() {
    return this.composer?.inputBuffer?.width || 0;
  }

  /** Composer buffer height after the last draw-size swap. */
  get drawHeight() {
    return this.composer?.inputBuffer?.height || 0;
  }

  /**
   * The worker Image stand-in is not a valid texImage2D source. SMAA's lookup
   * textures point at that stand-in; the decoded ImageBitmap hangs off `.bitmap`.
   */
  _adoptSmaaBitmaps() {
    const weights = this.smaaEffect?.weightsMaterial;
    for (const texture of [weights?.searchTexture, weights?.areaTexture]) {
      const bitmap = texture?.image?.bitmap;
      if (!(bitmap instanceof ImageBitmap)) continue;
      texture.image = bitmap;
      texture.needsUpdate = true;
    }
  }

  /** Rest: SMAA, no multisampling. */
  setRestAntialias() {
    this._aaMode = "smaa";
    const samples = this.setMultisampling(0);
    this._adoptSmaaBitmaps();
    this.smaaPass.enabled = Boolean(this.smaaEffect?.weightsMaterial?.searchTexture);
    return samples;
  }

  /**
   * Black-hole sequence: MSAA, SMAA off. Fill-bound rest frames do not pay both.
   * @param {number} [samples]
   */
  setSequenceAntialias(samples = BLACK_HOLE_MSAA) {
    this._aaMode = "msaa";
    this.smaaPass.enabled = false;
    return this.setMultisampling(samples);
  }

  /**
   * Multisampled depth cannot be blitted into the composer's single-sample
   * depth texture (GL_INVALID_OPERATION every frame). SMAA reads that texture
   * only while samples are 0. Skip the blit while MSAA is on.
   */
  _syncDepthBlit() {
    if (!this.renderPass) return;
    this.renderPass.needsDepthBlit = !(this.composer.multisampling > 0);
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
   * Composer-internal draw size. The canvas pixel ratio stays put.
   * A size that was allocated during warm swaps GL targets instead of
   * reallocating. @returns {boolean} true when this size was not pooled yet.
   * @param {number} dw
   * @param {number} dh
   */
  setDrawSize(dw, dh) {
    const width = Math.max(1, Math.floor(dw));
    const height = Math.max(1, Math.floor(dh));
    const input = this.composer?.inputBuffer;
    const output = this.composer?.outputBuffer;
    if (!input || !output) return false;
    if (input.width === width && input.height === height && !input.userData?._poolMiss) {
      return false;
    }
    input.setSize(width, height);
    output.setSize(width, height);
    this.composer.depthRenderTarget?.setSize?.(width, height);
    const passes = this.composer.passes || [];
    for (let i = 0; i < passes.length; i += 1) passes[i].setSize?.(width, height);
    this._drawW = width;
    this._drawH = height;
    return Boolean(input.userData?._poolMiss || output.userData?._poolMiss);
  }

  /**
   * Wire Archaeology Giza portal for the beauty stencil subpass.
   * @param {{ renderPortalSubpass?: Function } | null} portal
   */
  setPortal(portal) {
    this.renderPass?.setPortal?.(portal ?? null);
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
   * Swap composer MSAA. Disposes the beauty targets once, then reallocates
   * them before the next presented frame. Not a per-frame call.
   * @param {number} samples
   * @returns {number} samples actually set (clamped to GL_MAX_SAMPLES)
   */
  setMultisampling(samples) {
    const gl = this.renderer.getContext();
    const max = gl?.getParameter?.(gl.MAX_SAMPLES) ?? samples;
    const next = Math.max(0, Math.min(Math.round(samples) || 0, max));
    if (this.composer.multisampling === next) return next;

    const cssW = Math.max(1, this._width || 1);
    const cssH = Math.max(1, this._height || 1);
    this.composer.multisampling = next;
    this._width = 0;
    this._height = 0;
    this._drawW = 0;
    this._drawH = 0;
    this.setSize(cssW, cssH);
    // Allocate the new sample count now. The samples setter only disposes.
    this.renderer.setRenderTarget(this.composer.inputBuffer);
    this.renderer.setRenderTarget(this.composer.outputBuffer);
    this.renderer.setRenderTarget(null);
    this._syncDepthBlit();
    return next;
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
    this.displayGrain.uniforms.get("uTime").value = time;
    this.grainEffect.uniforms.get("uGrain").value = this.grain * grainStrength;
    this.composer.render();
  }

  /** Throwaway composed frame — warms bloom, volumetric shaders, and grain if amount > 0. */
  warm() {
    if (!this._scene) return;
    // Ensure RTs are real before the throwaway draw (§9/§20 — no compile hitch later).
    this.setSize(this._width || 1, this._height || 1);
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
    this.dofEffect?.dispose?.();
    // edgeTubeGlitchEffect is owned by EdgeGlitchSystem
    this.grainEffect.dispose();
    this.volumetricPass?.dispose?.();
    this.aoPass?.dispose?.();
  }
}
