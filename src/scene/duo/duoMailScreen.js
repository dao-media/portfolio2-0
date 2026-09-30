/**
 * Insight emissiveMap = live capture of the DOM Mail overlay
 * (same UI projected onto the Duo glass).
 *
 * Landmine: live `.duo-mail` is `position:fixed` + holographic. Feeding that
 * node to html-to-image paints the panel into a corner of a light fill → white
 * glass. Capture an offscreen in-flow clone with opaque Apple-Mail chrome.
 */

import * as THREE from "three";
import { toCanvas } from "html-to-image";
import { releaseCaptureCanvas } from "../../ui/releaseCaptureCanvas.js";
import { DUO_MAIL_ASPECT } from "./duoConstants.js";

const CAPTURE_H = 520;
const CAPTURE_W = Math.round(CAPTURE_H * DUO_MAIL_ASPECT);
/** No debounce — glass must stay locked to the live overlay. */
const CAPTURE_DEBOUNCE_MS = 0;

/**
 * Build an offscreen, opaque, in-flow clone of the Mail shell for capture.
 * @param {HTMLElement} source
 * @returns {{ host: HTMLElement, clone: HTMLElement }}
 */
function buildCaptureClone(source) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("data-duo-mail-capture-host", "1");
  host.style.cssText = [
    "position:fixed",
    "left:-12000px",
    "top:0",
    `width:${CAPTURE_W}px`,
    `height:${CAPTURE_H}px`,
    "overflow:hidden",
    "pointer-events:none",
    "opacity:1",
    "z-index:-1"
  ].join(";");

  const clone = /** @type {HTMLElement} */ (source.cloneNode(true));
  clone.classList.add("is-visible");
  clone.removeAttribute("data-duo-capturing");
  // Kill fixed placement + holographic wash — force solid Mail paper.
  clone.style.cssText = [
    "position:relative",
    "left:0",
    "top:0",
    "right:auto",
    "bottom:auto",
    `width:${CAPTURE_W}px`,
    `height:${CAPTURE_H}px`,
    "max-width:none",
    "max-height:none",
    "opacity:1",
    "visibility:visible",
    "transform:none",
    "animation:none",
    "box-shadow:none",
    "background:linear-gradient(180deg,#f2f8fb 0%,#e8f2f7 100%)",
    "border:1px solid #b8d4e0",
    "color:#1c1c1e",
    "display:flex",
    "flex-direction:column",
    "overflow:hidden",
    "border-radius:14px",
    "font-family:-apple-system,'SF Pro Text','Helvetica Neue',Arial,sans-serif",
    "pointer-events:none"
  ].join(";");

  const style = document.createElement("style");
  style.textContent = `
    [data-duo-mail-capture-host] .duo-mail::before,
    [data-duo-mail-capture-host] .duo-mail::after { display:none !important; content:none !important; }
    [data-duo-mail-capture-host] .duo-mail__resize { display:none !important; }
    [data-duo-mail-capture-host] .duo-mail__chrome {
      background:#dfeef5 !important;
      backdrop-filter:none !important;
      -webkit-backdrop-filter:none !important;
    }
    [data-duo-mail-capture-host] .duo-mail__list { background:#f7fbfd !important; }
    [data-duo-mail-capture-host] .duo-mail__preview { background:#ffffff !important; }
    [data-duo-mail-capture-host] .duo-mail__row.is-active { background:#d7eef8 !important; }
  `;
  host.appendChild(style);
  host.appendChild(clone);
  document.body.appendChild(host);
  return { host, clone };
}

export class DuoMailScreen {
  constructor() {
    this.width = CAPTURE_W;
    this.height = CAPTURE_H;
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext("2d", { alpha: false });

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = true;
    this.texture.center.set(0.5, 0.5);
    // The open-pose Ry(π) spins insight UVs 180°. π around the center puts
    // the Mail / case-study capture back upright with the overlay.
    this.texture.rotation = Math.PI;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;

    /** @type {(() => HTMLElement | null) | null} */
    this._getSource = null;
    this._captureGen = 0;
    this._capturePending = false;
    this._captureTimer = 0;
    this._dirty = false;
    this._active = false;

    this._paintPlaceholder();
  }

  /**
   * @param {(() => HTMLElement | null) | null} getter
   */
  setSourceGetter(getter) {
    this._getSource = getter;
  }

  tick(_dt, opts = {}) {
    const active = Boolean(opts.active);
    if (active && !this._active) {
      this._active = true;
      this._dirty = true;
      void this._captureNow();
    } else if (!active && this._active) {
      this._active = false;
      this._dirty = false;
    } else if (active && this._dirty && !this._capturePending) {
      void this._captureNow();
    }
  }

  /** Queue a recapture of the live Mail panel. */
  requestCapture() {
    this._dirty = true;
    if (!this._active) return;
    if (this._capturePending) return;
    if (CAPTURE_DEBOUNCE_MS <= 0) {
      void this._captureNow();
      return;
    }
    if (this._captureTimer) return;
    this._captureTimer = window.setTimeout(() => {
      this._captureTimer = 0;
      void this._captureNow();
    }, CAPTURE_DEBOUNCE_MS);
  }

  async _captureNow() {
    if (this._capturePending || !this._active) return;
    const source = this._getSource?.() ?? null;
    if (typeof HTMLElement === "undefined" || !(source instanceof HTMLElement)) {
      this._dirty = false;
      return;
    }

    this._capturePending = true;
    this._dirty = false;
    const gen = ++this._captureGen;
    let host = null;

    try {
      const built = buildCaptureClone(source);
      host = built.host;
      const { clone } = built;

      const captured = await toCanvas(clone, {
        width: CAPTURE_W,
        height: CAPTURE_H,
        pixelRatio: 1,
        cacheBust: false,
        backgroundColor: "#eef5f8",
        fontEmbedCSS: "",
        style: {
          position: "relative",
          left: "0",
          top: "0",
          width: `${CAPTURE_W}px`,
          height: `${CAPTURE_H}px`,
          opacity: "1",
          transform: "none",
          visibility: "visible",
          boxShadow: "none",
          animation: "none"
        },
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          return !node.classList?.contains("duo-mail__resize");
        }
      });

      if (gen !== this._captureGen) {
        releaseCaptureCanvas(captured);
        return;
      }

      const ctx = this.ctx;
      if (!ctx) {
        releaseCaptureCanvas(captured);
        return;
      }

      ctx.fillStyle = "#eef5f8";
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.drawImage(captured, 0, 0, this.width, this.height);
      // Slight paper darken so emissive + bloom keep list/preview readable.
      ctx.fillStyle = "rgba(8, 18, 24, 0.12)";
      ctx.fillRect(0, 0, this.width, this.height);

      this.texture.needsUpdate = true;
      releaseCaptureCanvas(captured);
    } catch (err) {
      console.warn("[DuoMailScreen] Overlay capture failed:", err);
      this._paintPlaceholder();
    } finally {
      host?.remove();
      this._capturePending = false;
      if (this._dirty && this._active) {
        this.requestCapture();
      }
    }
  }

  /** Fallback while waiting for first capture. */
  _paintPlaceholder() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = "#e8f0f4";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#3a4a52";
    ctx.font = `600 ${Math.round(this.height * 0.06)}px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Dane's Projects", this.width * 0.5, this.height * 0.5);
    this.texture.needsUpdate = true;
  }

  /** @deprecated selection is reflected via DOM capture */
  setSelected(_slug) {
    this.requestCapture();
  }

  dispose() {
    if (this._captureTimer) {
      window.clearTimeout(this._captureTimer);
      this._captureTimer = 0;
    }
    this._captureGen += 1;
    this.texture?.dispose?.();
    this.texture = null;
    this.canvas = null;
    this.ctx = null;
    this._getSource = null;
  }
}
