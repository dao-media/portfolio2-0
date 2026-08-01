import * as THREE from "three";
import gsap from "gsap";
import { toCanvas } from "html-to-image";
import { SidekickSmsForm } from "./SidekickSmsForm.js";
import {
  SIDEKICK_FRAME_SIZE,
  SIDEKICK_FRAME_URL,
  SIDEKICK_SCREEN_WINDOW,
  SIDEKICK_SPLASH_BG,
  SIDEKICK_SPLASH_ROTATION_DEG,
  SIDEKICK_SPLASH_SIZE,
  fitContentInSidekickWindow,
  rasterizeSplashSvg
} from "../../scene/vignettes/sidekickScreenTexture.js";
import {
  applySidekickScreenMapSettings,
  SIDEKICK_SCREEN_MAP
} from "../../scene/vignettes/screenTextureMap.js";

/**
 * Capture at 3× native Sidekick res (240×160). 1080×720 html-to-image
 * snaps were melting the main thread (~150–400ms each).
 */
const CAPTURE_W = 720;
const CAPTURE_H = 480;

/** Splash → compose paper flip (seconds). */
const FLIP_DURATION = 0.55;

/** Debounce form → atlas recaptures (ms). */
const CAPTURE_DEBOUNCE_MS = 180;

/**
 * Sidekick LCD: splash + SMS form composited into the bezel atlas.
 * Content z-flips 180° inside the hollow window (frame stays upright).
 *
 * Splash is drawn at SIDEKICK_SPLASH_ROTATION_DEG. SMS is the paper backside:
 * after a 180° turn it needs another 180° in-plane so it reads rightside-up —
 * i.e. final draw rotation = splashRot + 180° ≡ 0° for the upright capture.
 */
export class SidekickSmsScreen {
  /**
   * @param {{
   *   onSubmit?: (payload: import("./SidekickSmsForm.js").SidekickSmsPayload) => void | Promise<void>,
   *   onSendSequence?: () => void | Promise<void>,
   *   reducedMotion?: boolean
   * }} [options]
   */
  constructor(options = {}) {
    this.reducedMotion = options.reducedMotion ?? false;
    this.onSubmit = options.onSubmit ?? null;
    this.onSendSequence = options.onSendSequence ?? null;

    this.canvas = document.createElement("canvas");
    this.canvas.width = SIDEKICK_FRAME_SIZE;
    this.canvas.height = SIDEKICK_FRAME_SIZE;
    this.ctx = this.canvas.getContext("2d", { alpha: false });

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 4;
    applySidekickScreenMapSettings(this.texture);

    /** 0 = splash face, 1 = SMS face (after full z-flip). */
    this.flipProgress = 0;
    this._flipTween = null;
    this._ready = false;
    this._dirty = false;
    this._capturePending = false;
    this._captureGen = 0;
    this._captureTimer = 0;
    this._formReady = false;
    this._formBitmap = null;
    this._splashCanvas = null;
    this._frameImage = null;
    /** @type {HTMLCanvasElement | null} Full splash+frame atlas — idle path, zero per-frame work. */
    this._splashAtlas = null;
    this._formMounted = false;

    this._host =
      document.getElementById("sidekick-sms-host") ?? this._createHost();

    /** @type {SidekickSmsForm | null} */
    this.form = null;
  }

  /** @returns {THREE.CanvasTexture} */
  getTexture() {
    return this.texture;
  }

  get isComposeVisible() {
    return this.flipProgress > 0.55;
  }

  get isFlipping() {
    return Boolean(this._flipTween);
  }

  async init() {
    const [frame, splash] = await Promise.all([
      loadImage(SIDEKICK_FRAME_URL),
      rasterizeSplashSvg()
    ]);
    this._frameImage = frame;
    this._splashCanvas = splash;
    this._ready = true;
    this._bakeSplashAtlas();
    this._blitSplashAtlas();
  }

  destroy() {
    this._flipTween?.kill();
    window.clearTimeout(this._captureTimer);
    this.form?.destroy();
    this.form = null;
    this.texture?.dispose();
  }

  /** Open beat — splash z-flips onto the SMS compose face. */
  async flipToCompose() {
    await this._ensureForm();
    await this._captureFormNow();
    return this._animateFlip(1);
  }

  /** Close beat — SMS flips back to splash. */
  flipToSplash() {
    window.clearTimeout(this._captureTimer);
    return this._animateFlip(0);
  }

  /** Snap without motion (reduced-motion / interrupted close). */
  snapToCompose() {
    this._flipTween?.kill();
    this._flipTween = null;
    this.flipProgress = 1;
    void this._ensureForm().then(() => {
      this.form?.showScreen("compose");
      this.paint();
    });
  }

  snapToSplash() {
    this._flipTween?.kill();
    this._flipTween = null;
    window.clearTimeout(this._captureTimer);
    this.flipProgress = 0;
    this.form?.resetCompose();
    this._blitSplashAtlas();
  }

  /**
   * UV hit → form control. Returns true when the LCD consumed the click.
   * @param {{ x: number, y: number } | null | undefined} uv
   */
  handlePointer(uv) {
    if (!uv || !this.isComposeVisible || this.isFlipping || !this.form) return false;

    const atlas = this._uvToAtlas(uv);
    if (!atlas) return false;

    const local = this._atlasToContent(atlas.x, atlas.y, /* showBack */ true);
    if (!local) return false;

    return this.form.handleScenePointer(local.x, local.y, CAPTURE_W, CAPTURE_H);
  }

  /** Schedule a debounced form recapture (typing / chrome changes). */
  markDirty() {
    if (this.isFlipping || this.flipProgress < 0.5) return;
    this._dirty = true;
    window.clearTimeout(this._captureTimer);
    this._captureTimer = window.setTimeout(() => {
      this._captureTimer = 0;
      void this._captureFormNow();
    }, CAPTURE_DEBOUNCE_MS);
  }

  /** Immediate paint of current flip face into the live atlas. */
  paint() {
    if (!this._ready || !this._frameImage) return;

    // Idle splash — blit the pre-baked atlas (no per-frame compositing).
    if (this.flipProgress <= 1e-6 && this._splashAtlas) {
      this._blitSplashAtlas();
      return;
    }

    const ctx = this.ctx;
    const size = SIDEKICK_FRAME_SIZE;
    const windowRect = SIDEKICK_SCREEN_WINDOW;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = SIDEKICK_SPLASH_BG;
    ctx.fillRect(windowRect.x, windowRect.y, windowRect.w, windowRect.h);

    this._paintFlippingContent(ctx, windowRect);
    ctx.drawImage(this._frameImage, 0, 0, size, size);

    this.texture.needsUpdate = true;
  }

  _bakeSplashAtlas() {
    if (!this._frameImage || !this._splashCanvas) return;
    const atlas = document.createElement("canvas");
    atlas.width = SIDEKICK_FRAME_SIZE;
    atlas.height = SIDEKICK_FRAME_SIZE;
    const ctx = atlas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const windowRect = SIDEKICK_SCREEN_WINDOW;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, atlas.width, atlas.height);
    ctx.fillStyle = SIDEKICK_SPLASH_BG;
    ctx.fillRect(windowRect.x, windowRect.y, windowRect.w, windowRect.h);
    drawFace(
      ctx,
      windowRect,
      this._splashCanvas,
      this._splashCanvas.width,
      this._splashCanvas.height,
      SIDEKICK_SPLASH_ROTATION_DEG,
      1
    );
    ctx.drawImage(this._frameImage, 0, 0, atlas.width, atlas.height);
    this._splashAtlas = atlas;
  }

  _blitSplashAtlas() {
    if (!this._splashAtlas) {
      this.paint();
      return;
    }
    this.ctx.drawImage(this._splashAtlas, 0, 0);
    this.texture.needsUpdate = true;
  }

  async _ensureForm() {
    if (this._formMounted && this.form) return;

    this.form = new SidekickSmsForm({
      sceneMode: true,
      onChange: () => this.markDirty(),
      onSubmit: async (payload) => {
        if (this.onSubmit) await this.onSubmit(payload);
      },
      onSendComplete: async () => {
        if (this.onSendSequence) await this.onSendSequence();
      }
    });
    this.form.mount(this._host);
    this.form.showScreen("compose");
    this._formMounted = true;
  }

  /**
   * @param {number} target 0 | 1
   * @returns {Promise<void>}
   */
  _animateFlip(target) {
    this._flipTween?.kill();
    window.clearTimeout(this._captureTimer);

    if (this.reducedMotion) {
      this.flipProgress = target;
      if (target >= 1) this.form?.showScreen("compose");
      else this.form?.resetCompose();
      this.paint();
      return Promise.resolve();
    }

    if (target >= 1) this.form?.showScreen("compose");

    return new Promise((resolve) => {
      const state = { t: this.flipProgress };
      let lastPaint = 0;
      this._flipTween = gsap.to(state, {
        t: target,
        duration: FLIP_DURATION * Math.max(Math.abs(target - this.flipProgress), 0.2),
        ease: "power2.inOut",
        onUpdate: () => {
          this.flipProgress = state.t;
          // Cap atlas rebuilds ~30fps during the flip — 2360² compositing is heavy.
          const now = performance.now();
          if (now - lastPaint < 32) return;
          lastPaint = now;
          this.paint();
        },
        onComplete: () => {
          this._flipTween = null;
          this.flipProgress = target;
          if (target < 0.5) {
            this.form?.resetCompose();
            this._blitSplashAtlas();
          } else {
            this.paint();
          }
          resolve();
        }
      });
    });
  }

  /**
   * Paper turn inside the hollow window:
   * scaleX = cos(π · flip) goes through 0 at the edge-on midpoint;
   * past halfway we paint the SMS backside (pre-oriented +180° vs splash).
   */
  _paintFlippingContent(ctx, windowRect) {
    const angle = this.flipProgress * Math.PI;
    const scaleX = Math.cos(angle);
    const showBack = scaleX < 0;
    const sx = Math.max(Math.abs(scaleX), 0.001);

    const content = showBack ? this._formBitmap : this._splashCanvas;
    if (!content) return;

    const contentW = showBack
      ? CAPTURE_W
      : (this._splashCanvas?.width ?? SIDEKICK_SPLASH_SIZE.w);
    const contentH = showBack
      ? CAPTURE_H
      : (this._splashCanvas?.height ?? SIDEKICK_SPLASH_SIZE.h);

    const faceRot = showBack
      ? SIDEKICK_SPLASH_ROTATION_DEG + 180
      : SIDEKICK_SPLASH_ROTATION_DEG;

    drawFace(ctx, windowRect, content, contentW, contentH, faceRot, sx);
  }

  /** @param {{ x: number, y: number }} uv */
  _uvToAtlas(uv) {
    const map = SIDEKICK_SCREEN_MAP;
    const sampleU = map.offsetX + map.repeatX * uv.x;
    const sampleV = map.offsetY + map.repeatY * uv.y;
    return {
      x: sampleU * SIDEKICK_FRAME_SIZE,
      y: sampleV * SIDEKICK_FRAME_SIZE
    };
  }

  /**
   * @param {number} ax
   * @param {number} ay
   * @param {boolean} showBack
   */
  _atlasToContent(ax, ay, showBack) {
    const windowRect = SIDEKICK_SCREEN_WINDOW;
    if (
      ax < windowRect.x ||
      ax > windowRect.x + windowRect.w ||
      ay < windowRect.y ||
      ay > windowRect.y + windowRect.h
    ) {
      return null;
    }

    const contentW = showBack ? CAPTURE_W : SIDEKICK_SPLASH_SIZE.w;
    const contentH = showBack ? CAPTURE_H : SIDEKICK_SPLASH_SIZE.h;
    const dest = fitContentInSidekickWindow(windowRect, contentW, contentH);

    const faceRot = showBack
      ? SIDEKICK_SPLASH_ROTATION_DEG + 180
      : SIDEKICK_SPLASH_ROTATION_DEG;
    const rad = (faceRot * Math.PI) / 180;

    const lx = ax - (dest.x + dest.w * 0.5);
    const ly = ay - (dest.y + dest.h * 0.5);

    const c = Math.cos(-rad);
    const s = Math.sin(-rad);
    const rx = lx * c - ly * s;
    const ry = lx * s + ly * c;

    if (Math.abs(rx) > dest.w * 0.5 || Math.abs(ry) > dest.h * 0.5) return null;

    return {
      x: (rx / dest.w + 0.5) * contentW,
      y: (ry / dest.h + 0.5) * contentH
    };
  }

  /** Single capture pass — never chains recursively. */
  async _captureFormNow() {
    if (!this.form || this._capturePending) {
      this._dirty = true;
      return;
    }
    this._capturePending = true;
    this._dirty = false;
    const gen = ++this._captureGen;

    const lcd = this.form.root.querySelector(".sk-sms__lcd");
    if (!(lcd instanceof HTMLElement)) {
      this._capturePending = false;
      return;
    }

    // Size the offscreen host to the capture resolution once.
    this._host.style.width = `${CAPTURE_W}px`;
    this._host.style.height = `${CAPTURE_H}px`;
    this.form.root.style.width = `${CAPTURE_W}px`;
    this.form.root.style.height = `${CAPTURE_H}px`;

    try {
      const captured = await toCanvas(lcd, {
        width: CAPTURE_W,
        height: CAPTURE_H,
        pixelRatio: 1,
        cacheBust: false,
        backgroundColor: SIDEKICK_SPLASH_BG,
        // Skip webfont waits — Tahoma/system stack only.
        fontEmbedCSS: ""
      });
      if (gen !== this._captureGen) return;
      this._formBitmap = captured;
      this._formReady = true;
      if (this.flipProgress > 0.01) this.paint();
    } catch (err) {
      console.warn("[SidekickSmsScreen] Form capture failed:", err);
    } finally {
      this._capturePending = false;
      // One deferred retry max if something changed mid-capture — not a tight loop.
      if (this._dirty && !this.isFlipping && this.flipProgress > 0.5) {
        this._dirty = false;
        window.clearTimeout(this._captureTimer);
        this._captureTimer = window.setTimeout(() => {
          this._captureTimer = 0;
          void this._captureFormNow();
        }, CAPTURE_DEBOUNCE_MS);
      }
    }
  }

  _createHost() {
    const host = document.createElement("div");
    host.id = "sidekick-sms-host";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
    return host;
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number }} windowRect
 * @param {CanvasImageSource} content
 * @param {number} contentW
 * @param {number} contentH
 * @param {number} faceRotDeg
 * @param {number} scaleX
 */
function drawFace(ctx, windowRect, content, contentW, contentH, faceRotDeg, scaleX) {
  const dest = fitContentInSidekickWindow(windowRect, contentW, contentH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(windowRect.x, windowRect.y, windowRect.w, windowRect.h);
  ctx.clip();
  ctx.translate(dest.x + dest.w * 0.5, dest.y + dest.h * 0.5);
  ctx.rotate((faceRotDeg * Math.PI) / 180);
  ctx.scale(scaleX, 1);
  ctx.drawImage(content, -dest.w * 0.5, -dest.h * 0.5, dest.w, dest.h);
  ctx.restore();
}

/** @param {string} url */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}
