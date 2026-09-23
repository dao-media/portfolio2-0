/**
 * PROJECTS hologram label canvas — digital glitch + traveling energy pulse disc.
 * Screen-aligned wash lives on `washTexture`; this texture is billboarded.
 */

import * as THREE from "three";
import {
  DUO_PROJECTS_GLITCH_MIN_SEC,
  DUO_PROJECTS_GLITCH_MAX_SEC,
  DUO_PROJECTS_GLITCH_SEC,
  DUO_PROJECTS_GLOW,
  DUO_PROJECTS_TEXT,
  DUO_PROJECTS_FONT,
  DUO_PROJECTS_TRACK,
  DUO_PROJECTS_TEXT_Y,
  DUO_HOLO_PULSE_PERIOD_SEC,
  DUO_HOLO_PULSE_SEC
} from "./duoConstants.js";

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

export class DuoProjectsScreen {
  /**
   * @param {{ reducedMotion?: boolean }} [opts]
   */
  constructor(opts = {}) {
    this._reducedMotion = Boolean(opts.reducedMotion);
    this.width = 512;
    this.height = 512;
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext("2d", { alpha: true });

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = true;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.premultiplyAlpha = true;
    this.texture.needsUpdate = true;

    this.washCanvas = document.createElement("canvas");
    this.washCanvas.width = 256;
    this.washCanvas.height = 256;
    this.washCtx = this.washCanvas.getContext("2d", { alpha: true });
    this.washTexture = new THREE.CanvasTexture(this.washCanvas);
    this.washTexture.colorSpace = THREE.SRGBColorSpace;
    this.washTexture.flipY = true;
    this.washTexture.generateMipmaps = true;
    this.washTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.washTexture.magFilter = THREE.LinearFilter;
    this.washTexture.premultiplyAlpha = true;
    this._paintWash();

    // Soft circular energy disc — coplanar, travels up the volume.
    this.pulseCanvas = document.createElement("canvas");
    this.pulseCanvas.width = 256;
    this.pulseCanvas.height = 256;
    this.pulseCtx = this.pulseCanvas.getContext("2d", { alpha: true });
    this.pulseTexture = new THREE.CanvasTexture(this.pulseCanvas);
    this.pulseTexture.colorSpace = THREE.SRGBColorSpace;
    this.pulseTexture.flipY = true;
    this.pulseTexture.generateMipmaps = true;
    this.pulseTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.pulseTexture.magFilter = THREE.LinearFilter;
    this.pulseTexture.premultiplyAlpha = true;
    this._paintPulseDisc();

    this._time = 0;
    this._glitchT = 0;
    this._glitchActive = false;
    this._nextGlitchAt = randRange(
      DUO_PROJECTS_GLITCH_MIN_SEC,
      DUO_PROJECTS_GLITCH_MAX_SEC
    );
    this._sliceSeed = 0;
    /** 0–1 progress through the current energy pulse (0 = idle). */
    this._pulseT = 0;
    this._pulseActive = false;
    this._nextPulseAt = DUO_HOLO_PULSE_PERIOD_SEC;
    /** @type {number} 0–1 strength of the rising energy band (for slab boost). */
    this.pulseAmount = 0;
    /** @type {number} 0–1 travel of the pulse band (0 = glass, 1 = tip). */
    this.pulseProgress = 0;
    /**
     * Unhover exit: text glitch-out then clearing pulse.
     * @type {null | 'glitch' | 'clear'}
     */
    this._exitPhase = null;
    /** 0 = full hologram volume, 1 = wiped clean by clear pulse. */
    this.holoClearAmount = 0;
    /** PROJECTS glyph opacity (fades during exit glitch). */
    this._textOpacity = 1;
    this._dirty = true;
    this._paint(0);
  }

  setReducedMotion(on) {
    this._reducedMotion = Boolean(on);
  }

  /** Unhover step 1 — tear the PROJECTS label out. */
  beginExitGlitch() {
    if (this._reducedMotion) {
      this._textOpacity = 0;
      this._glitchActive = false;
      this._exitPhase = "glitch";
      this._paint(0);
      return;
    }
    this._exitPhase = "glitch";
    this._glitchActive = true;
    this._glitchT = 0;
    this._sliceSeed = Math.random() * 1000;
    this._textOpacity = 1;
    // Freeze idle glitch scheduling while exiting.
    this._nextGlitchAt = Infinity;
    this._nextPulseAt = Infinity;
  }

  /** Unhover step 2 — final energy pulse that clears the hologram volume. */
  beginClearPulse() {
    this._exitPhase = "clear";
    this._textOpacity = 0;
    this._glitchActive = false;
    this._glitchT = 0;
    if (this._reducedMotion) {
      this.holoClearAmount = 1;
      this.pulseAmount = 0;
      this.pulseProgress = 0;
      this._pulseActive = false;
      this._paint(0);
      return;
    }
    this._pulseActive = true;
    this._pulseT = 0;
    this.holoClearAmount = 0;
    this._nextPulseAt = Infinity;
  }

  /** Abort unhover exit (pointer returned). */
  cancelExit() {
    this._exitPhase = null;
    this.holoClearAmount = 0;
    this._textOpacity = 1;
    this._glitchActive = false;
    this._glitchT = 0;
    this._pulseActive = false;
    this._pulseT = 0;
    this.pulseAmount = 0;
    this.pulseProgress = 0;
    this._nextGlitchAt =
      this._time +
      randRange(DUO_PROJECTS_GLITCH_MIN_SEC, DUO_PROJECTS_GLITCH_MAX_SEC);
    this._nextPulseAt = this._time + DUO_HOLO_PULSE_PERIOD_SEC * 0.35;
    this._dirty = true;
    this._paint(0);
  }

  get isExiting() {
    return this._exitPhase != null;
  }

  /**
   * @param {number} dt
   * @param {{ active?: boolean }} [opts]
   */
  tick(dt, opts = {}) {
    const active = Boolean(opts.active);
    this._time += dt;

    // Exit choreography keeps ticking even if holo gate flickers.
    if (this._exitPhase) {
      this._tickExit(dt);
      return;
    }

    if (!active) {
      this._glitchActive = false;
      this._glitchT = 0;
      this._pulseActive = false;
      this._pulseT = 0;
      this.pulseAmount = 0;
      this.pulseProgress = 0;
      this.holoClearAmount = 0;
      this._textOpacity = 1;
      if (this._dirty) {
        this._paint(0);
        this._dirty = false;
      }
      return;
    }

    if (this._reducedMotion) {
      this.pulseAmount = 0;
      this.pulseProgress = 0;
      if (this._dirty) {
        this._paint(0);
        this._dirty = false;
      }
      return;
    }

    // --- digital glitch ---
    if (!this._glitchActive) {
      if (this._time >= this._nextGlitchAt) {
        this._glitchActive = true;
        this._glitchT = 0;
        this._sliceSeed = Math.random() * 1000;
      }
    } else {
      this._glitchT += dt;
      if (this._glitchT >= DUO_PROJECTS_GLITCH_SEC) {
        this._glitchActive = false;
        this._glitchT = 0;
        this._nextGlitchAt =
          this._time +
          randRange(DUO_PROJECTS_GLITCH_MIN_SEC, DUO_PROJECTS_GLITCH_MAX_SEC);
      }
    }

    const glitch = this._glitchEnvelope();

    // --- energy pulse every DUO_HOLO_PULSE_PERIOD_SEC ---
    if (!this._pulseActive) {
      if (this._time >= this._nextPulseAt) {
        this._pulseActive = true;
        this._pulseT = 0;
      }
    } else {
      this._pulseT += dt;
      if (this._pulseT >= DUO_HOLO_PULSE_SEC) {
        this._pulseActive = false;
        this._pulseT = 0;
        this._nextPulseAt = this._time + DUO_HOLO_PULSE_PERIOD_SEC;
      }
    }
    this._applyPulseEnvelope();

    this._paint(glitch);
  }

  /** @param {number} dt */
  _tickExit(dt) {
    if (this._exitPhase === "glitch") {
      if (this._reducedMotion) {
        this._textOpacity = 0;
        this._paint(0);
        return;
      }
      this._glitchT += dt;
      // Hold a hot tear, then kill the glyph.
      const gDur = Math.max(DUO_PROJECTS_GLITCH_SEC, 0.18);
      const u = Math.min(1, this._glitchT / gDur);
      this._textOpacity = Math.max(0, 1 - u * 1.35);
      this._glitchActive = u < 1;
      const glitch = this._glitchEnvelope() * (0.75 + 0.25 * (1 - u));
      // No idle pulses while text is tearing out.
      this.pulseAmount = 0;
      this.pulseProgress = 0;
      this._paint(Math.max(glitch, u < 1 ? 0.55 : 0));
      return;
    }

    if (this._exitPhase === "clear") {
      this._textOpacity = 0;
      if (this._reducedMotion) {
        this.holoClearAmount = 1;
        this.pulseAmount = 0;
        this.pulseProgress = 0;
        this._paint(0);
        return;
      }
      if (this._pulseActive) {
        this._pulseT += dt;
        if (this._pulseT >= DUO_HOLO_PULSE_SEC) {
          this._pulseActive = false;
          this._pulseT = DUO_HOLO_PULSE_SEC;
        }
      }
      this._applyPulseEnvelope();
      // Wipe volume as the disc travels — fully clear by the tip.
      this.holoClearAmount = Math.min(
        1,
        Math.max(this.holoClearAmount, this.pulseProgress)
      );
      if (!this._pulseActive) {
        this.holoClearAmount = 1;
        this.pulseAmount = 0;
      }
      this._paint(0);
    }
  }

  _glitchEnvelope() {
    if (!this._glitchActive) return 0;
    const gIn = Math.min(
      1,
      this._glitchT / Math.max(1e-3, DUO_PROJECTS_GLITCH_SEC * 0.25)
    );
    const gOut =
      1 -
      Math.min(
        1,
        Math.max(0, this._glitchT - DUO_PROJECTS_GLITCH_SEC * 0.4) /
          Math.max(1e-3, DUO_PROJECTS_GLITCH_SEC * 0.6)
      );
    return Math.min(gIn, 1) * gOut;
  }

  _applyPulseEnvelope() {
    const pulse = this._pulseActive
      ? Math.min(1, this._pulseT / Math.max(1e-3, DUO_HOLO_PULSE_SEC))
      : this._exitPhase === "clear" && this.holoClearAmount >= 1
        ? 1
        : 0;
    this.pulseProgress = pulse;
    this.pulseAmount =
      pulse <= 0
        ? 0
        : pulse < 0.12
          ? pulse / 0.12
          : pulse > 0.88
            ? (1 - pulse) / 0.12
            : 1;
  }

  _paintWash() {
    const ctx = this.washCtx;
    const s = this.washCanvas?.width ?? 256;
    if (!ctx) return;
    ctx.clearRect(0, 0, s, s);

    const grd = ctx.createRadialGradient(
      s * 0.5,
      s * 0.5,
      s * 0.06,
      s * 0.5,
      s * 0.5,
      s * 0.55
    );
    grd.addColorStop(0, "rgba(200, 245, 255, 0.85)");
    grd.addColorStop(0.35, "rgba(130, 220, 255, 0.45)");
    grd.addColorStop(0.7, "rgba(80, 190, 255, 0.14)");
    grd.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, s, s);

    ctx.globalCompositeOperation = "destination-in";
    const mask = ctx.createRadialGradient(
      s * 0.5,
      s * 0.5,
      s * 0.32,
      s * 0.5,
      s * 0.5,
      s * 0.5
    );
    mask.addColorStop(0, "rgba(0,0,0,1)");
    mask.addColorStop(0.7, "rgba(0,0,0,1)");
    mask.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = "source-over";

    this.washTexture.needsUpdate = true;
  }

  /**
   * Soft annular band — darker shade of the cyan emissive wash (not a hot white ring).
   */
  _paintPulseDisc() {
    const ctx = this.pulseCtx;
    const s = this.pulseCanvas?.width ?? 256;
    if (!ctx) return;
    ctx.clearRect(0, 0, s, s);

    const cx = s * 0.5;
    const cy = s * 0.5;

    // Deep teal fill (darker cousin of wash / insight cyan).
    const fill = ctx.createRadialGradient(cx, cy, s * 0.08, cx, cy, s * 0.42);
    fill.addColorStop(0, "rgba(36, 78, 96, 0.72)");
    fill.addColorStop(0.5, "rgba(28, 64, 82, 0.4)");
    fill.addColorStop(1, "rgba(16, 40, 52, 0)");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, s, s);

    // Annular band — same hue family, still darker than the emissive wash.
    const ring = ctx.createRadialGradient(cx, cy, s * 0.18, cx, cy, s * 0.46);
    ring.addColorStop(0, "rgba(40, 90, 110, 0)");
    ring.addColorStop(0.3, "rgba(52, 110, 132, 0.85)");
    ring.addColorStop(0.45, "rgba(44, 98, 120, 0.95)");
    ring.addColorStop(0.62, "rgba(32, 72, 92, 0.4)");
    ring.addColorStop(1, "rgba(16, 40, 52, 0)");
    ctx.fillStyle = ring;
    ctx.fillRect(0, 0, s, s);

    this.pulseTexture.needsUpdate = true;
  }

  /**
   * @param {number} glitch 0–1
   */
  _paint(glitch) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    const textA = Math.max(0, Math.min(1, this._textOpacity ?? 1));
    if (textA > 0.01 || glitch > 0.02) {
      const aura = ctx.createRadialGradient(
        w * 0.5,
        h * 0.5,
        w * 0.04,
        w * 0.5,
        h * 0.5,
        w * 0.4
      );
      aura.addColorStop(0, `rgba(140, 230, 255, ${0.22 * textA})`);
      aura.addColorStop(0.55, `rgba(80, 190, 255, ${0.08 * textA})`);
      aura.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, w, h);

      if (textA > 0.01) {
        this._drawProjects(ctx, w, h, 0, 0, textA);
      }

      if (glitch > 0.02) {
        this._drawGlitch(ctx, w, h, glitch, textA);
      }
    }

    this.texture.needsUpdate = true;
    this._dirty = false;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   * @param {number} ox
   * @param {number} oy
   * @param {number} alpha
   */
  _drawProjects(ctx, w, h, ox, oy, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const ty = h * DUO_PROJECTS_TEXT_Y + oy;
    ctx.translate(w * 0.5 + ox, ty);
    // Slight inset so stroke/glow on the end “S” clears the plane edge.
    ctx.scale(0.92, 0.92);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontPx = Math.round(h * DUO_PROJECTS_FONT);
    ctx.font = `800 ${fontPx}px "IBM Plex Sans", "Segoe UI", sans-serif`;

    const label = "PROJECTS";
    const gap = w * DUO_PROJECTS_TRACK;

    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(2, h * 0.016);
    ctx.strokeStyle = "rgba(0, 8, 16, 0.75)";
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = h * 0.022;
    this._strokeTracked(ctx, label, gap);

    ctx.shadowColor = DUO_PROJECTS_GLOW;
    ctx.shadowBlur = h * 0.028;
    ctx.lineWidth = Math.max(1, h * 0.006);
    ctx.strokeStyle = "rgba(80, 210, 255, 0.28)";
    this._strokeTracked(ctx, label, gap);

    ctx.shadowBlur = h * 0.012;
    ctx.fillStyle = DUO_PROJECTS_TEXT;
    this._fillTracked(ctx, label, gap);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    this._fillTracked(ctx, label, gap);
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} text
   * @param {number} gap
   */
  _strokeTracked(ctx, text, gap) {
    let total = 0;
    const widths = [];
    for (const ch of text) {
      const ww = ctx.measureText(ch).width;
      widths.push(ww);
      total += ww;
    }
    total += gap * (text.length - 1);
    let x = -total * 0.5;
    for (let i = 0; i < text.length; i++) {
      ctx.strokeText(text[i], x + widths[i] * 0.5, 0);
      x += widths[i] + gap;
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} text
   * @param {number} gap
   */
  _fillTracked(ctx, text, gap) {
    let total = 0;
    const widths = [];
    for (const ch of text) {
      const ww = ctx.measureText(ch).width;
      widths.push(ww);
      total += ww;
    }
    total += gap * (text.length - 1);
    let x = -total * 0.5;
    for (let i = 0; i < text.length; i++) {
      ctx.fillText(text[i], x + widths[i] * 0.5, 0);
      x += widths[i] + gap;
    }
  }

  /**
   * Digital tear: RGB split + horizontal slice displace + block dropout.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   * @param {number} amount
   * @param {number} [textAlpha=1]
   */
  _drawGlitch(ctx, w, h, amount, textAlpha = 1) {
    const amp = amount * w * 0.06;
    const seed = this._sliceSeed + this._glitchT * 23;
    const ta = Math.max(0, Math.min(1, textAlpha));

    // RGB channel ghosts (offset glyphs).
    if (ta > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.55 * amount * ta;
      this._drawProjects(ctx, w, h, amp, 0, 1);
      ctx.globalAlpha = 0.4 * amount * ta;
      this._drawProjects(ctx, w, h, -amp * 0.9, amp * 0.12, 1);
      ctx.restore();
    }

    // Horizontal slice tears.
    const slices = 7;
    for (let i = 0; i < slices; i++) {
      const n = Math.sin(seed * (1.7 + i * 0.37)) * 0.5 + 0.5;
      const y = Math.floor(n * h * 0.7 + h * 0.12);
      const hh = Math.max(2, Math.floor(2 + amount * 14 * (0.35 + n)));
      const dx = Math.sin(seed * (2.4 + i)) * amp * 2.8;
      try {
        const img = ctx.getImageData(0, y, w, hh);
        ctx.putImageData(img, Math.round(dx), y);
      } catch {
        // ignore
      }
    }

    // Scan tear bars.
    ctx.save();
    ctx.globalAlpha = 0.35 * amount;
    ctx.fillStyle = "#7ef0ff";
    for (let i = 0; i < 3; i++) {
      const y = (((seed * (11 + i * 7)) % 1) * h) | 0;
      ctx.fillRect(0, y, w, 1 + (amount > 0.6 ? 1 : 0));
    }
    ctx.restore();

    // Block dropout (black rectangles).
    if (amount > 0.35) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 4; i++) {
        const n = Math.sin(seed * (3.1 + i)) * 0.5 + 0.5;
        const bw = Math.floor(8 + amount * 40 * n);
        const bh = Math.floor(3 + amount * 10);
        const bx = Math.floor((((seed * (5 + i)) % 1) * w) | 0);
        const by = Math.floor((((seed * (9 + i * 2)) % 1) * h) | 0);
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.fillRect(bx, by, bw, bh);
      }
      ctx.restore();
    }
  }

  dispose() {
    this.texture?.dispose?.();
    this.texture = null;
    this.washTexture?.dispose?.();
    this.washTexture = null;
    this.pulseTexture?.dispose?.();
    this.pulseTexture = null;
    this.canvas = null;
    this.ctx = null;
    this.washCanvas = null;
    this.washCtx = null;
    this.pulseCanvas = null;
    this.pulseCtx = null;
  }
}
