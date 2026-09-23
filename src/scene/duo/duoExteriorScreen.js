/**
 * Closed Duo exterior cover — desert lock wallpaper + live date/time.
 * CanvasTexture → emissiveMap on `screen_xm`.
 */

import * as THREE from "three";
import {
  DUO_EXTERIOR_WALLPAPER_URL,
  DUO_EXTERIOR_CANVAS_W,
  DUO_EXTERIOR_CANVAS_H,
  DUO_EXTERIOR_TIME_FONT,
  DUO_EXTERIOR_DATE_FONT,
  DUO_EXTERIOR_CLOCK_Y
} from "./duoConstants.js";

const CLOCK_FONT =
  '"Segoe UI Variable", "Segoe UI", "IBM Plex Sans", "Helvetica Neue", sans-serif';

/** Duo-style weekday: Thur (not Thu / Thursday). */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thur", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

export class DuoExteriorScreen {
  constructor() {
    this.width = DUO_EXTERIOR_CANVAS_W;
    this.height = DUO_EXTERIOR_CANVAS_H;
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext("2d", { alpha: false });

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;

    /** @type {HTMLImageElement | null} */
    this._wallpaper = null;
    this._wallpaperReady = false;
    this._lastStamp = "";
    this._dirty = true;

    this._loadWallpaper();
    this._paint(new Date());
  }

  _loadWallpaper() {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      this._wallpaper = img;
      this._wallpaperReady = true;
      this._dirty = true;
      this._paint(new Date());
    };
    img.onerror = () => {
      this._wallpaper = null;
      this._wallpaperReady = false;
      this._dirty = true;
      this._paint(new Date());
    };
    img.src = DUO_EXTERIOR_WALLPAPER_URL;
  }

  /**
   * @param {number} _dt
   * @param {{ active?: boolean }} [opts]
   */
  tick(_dt, opts = {}) {
    const active = opts.active !== false;
    if (!active && !this._dirty) return;

    const now = new Date();
    // Repaint once per minute (or when wallpaper finishes loading).
    const stamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    if (!this._dirty && stamp === this._lastStamp) return;
    this._paint(now);
  }

  /**
   * @param {Date} now
   */
  _paint(now) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (!ctx) return;

    this._drawWallpaper(ctx, w, h);
    this._drawClock(ctx, w, h, now);

    this.texture.needsUpdate = true;
    this._lastStamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    this._dirty = false;
  }

  /**
   * Cover-fit wallpaper into the portrait canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   */
  _drawWallpaper(ctx, w, h) {
    const img = this._wallpaper;
    if (!img || !this._wallpaperReady) {
      // Soft dusk fallback while loading / on error.
      const grd = ctx.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, "#0a1224");
      grd.addColorStop(0.45, "#6a5a78");
      grd.addColorStop(0.62, "#2a2430");
      grd.addColorStop(1, "#c8c0c4");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
      return;
    }

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (w - dw) * 0.5;
    const dy = (h - dh) * 0.5;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  /**
   * Duo cover clock overlay: date above time only (no frosted panel).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   * @param {Date} now
   */
  _drawClock(ctx, w, h, now) {
    const timeStr = this._formatTime(now);
    const dateStr = this._formatDate(now);
    const cx = w * 0.5;
    const cy = h * DUO_EXTERIOR_CLOCK_Y;
    const timePx = Math.round(h * DUO_EXTERIOR_TIME_FONT);
    const datePx = Math.round(h * DUO_EXTERIOR_DATE_FONT);
    const gap = datePx * 0.55;
    const blockH = datePx + gap + timePx;
    const dateY = cy - blockH * 0.5 + datePx * 0.5;
    const timeY = dateY + datePx * 0.5 + gap + timePx * 0.5;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = h * 0.018;
    ctx.shadowOffsetY = h * 0.003;

    ctx.font = `400 ${datePx}px ${CLOCK_FONT}`;
    ctx.fillText(dateStr, cx, dateY);

    ctx.font = `200 ${timePx}px ${CLOCK_FONT}`;
    ctx.shadowBlur = h * 0.022;
    ctx.fillText(timeStr, cx, timeY);
    ctx.restore();
  }

  /**
   * 12h hour:minute with no AM/PM (Duo cover style).
   * @param {Date} now
   */
  _formatTime(now) {
    const h24 = now.getHours();
    const h12 = h24 % 12 || 12;
    const m = String(now.getMinutes()).padStart(2, "0");
    return `${h12}:${m}`;
  }

  /**
   * Duo cover date: "Thur Apr 21".
   * @param {Date} now
   */
  _formatDate(now) {
    return `${WEEKDAYS[now.getDay()]} ${MONTHS[now.getMonth()]} ${now.getDate()}`;
  }

  dispose() {
    this.texture?.dispose?.();
    this.texture = null;
    this.canvas = null;
    this.ctx = null;
    this._wallpaper = null;
  }
}
