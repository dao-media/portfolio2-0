import { findContentById } from "../../content/myspace-content.js";
import { buildMySpacePage } from "./buildMySpacePage.js";

/** Base CRT capture typography — matches `.ms-root` in myspace-page.css (+10%). */
const MS_CAPTURE_BASE_FONT_PX = 12.1;
const MS_CAPTURE_MIN_FONT_PX = 8.8;

/**
 * Responsive SpaceHey-style MySpace profile — shared by CRT capture and mobile fullscreen.
 */
export class MySpacePageView {
  /**
   * @param {{ mode?: "crt" | "live", onNavigate?: (id: string | null) => void }} options
   */
  constructor(options = {}) {
    this.mode = options.mode ?? "crt";
    this.onNavigate = options.onNavigate ?? null;
    this.view = "dashboard";
    this.selectedId = null;
    this.hoverId = null;

    this.root = document.createElement("div");
    this.root.className = `ms-root ms-root--${this.mode}`;

    this.viewport = document.createElement("div");
    this.viewport.className = "ms-viewport";
    this.root.appendChild(this.viewport);

    this.root.addEventListener("click", (event) => {
      const link = event.target.closest("[data-ms-link]");
      if (!link) return;
      event.preventDefault();
      const id = link.dataset.msLink;
      if (id === "__back") {
        this.onNavigate?.(null);
        return;
      }
      this.onNavigate?.(id);
    });

    this.render();
  }

  mount(container) {
    if (!container) return;
    container.replaceChildren(this.root);
  }

  setView(view, selectedId = null) {
    this.view = view;
    this.selectedId = selectedId;
    this.render();
  }

  setHover(id) {
    if (this.hoverId === id) return;
    this.hoverId = id;
    this.viewport.querySelectorAll("[data-ms-link]").forEach((el) => {
      el.classList.toggle("is-hover", el.dataset.msLink === id);
    });
  }

  /** @param {number} y */
  setScrollTop(y) {
    this.viewport.scrollTop = y;
  }

  get scrollTop() {
    return this.viewport.scrollTop;
  }

  get scrollHeight() {
    return this.viewport.scrollHeight;
  }

  get clientHeight() {
    return this.viewport.clientHeight;
  }

  /** CRT capture target — clipped scrollport. */
  get captureElement() {
    return this.viewport;
  }

  /**
   * Hit regions in page-local coordinates (before CRT content offset).
   * @returns {{ id: string, x: number, y: number, w: number, h: number }[]}
   */
  collectHitRegions() {
    const regions = [];
    const base = this.viewport.getBoundingClientRect();

    this.viewport.querySelectorAll("[data-ms-link]").forEach((el) => {
      const rect = el.getBoundingClientRect();
      regions.push({
        id: el.dataset.msLink,
        x: rect.left - base.left,
        y: rect.top - base.top,
        w: rect.width,
        h: rect.height
      });
    });

    return regions;
  }

  /** @param {number} widthPx */
  setCaptureWidth(widthPx) {
    const w = Math.round(widthPx);
    const px = `${w}px`;
    this.root.style.width = px;
    this.root.style.minWidth = px;
    this.root.style.maxWidth = px;
    this.root.style.setProperty("--ms-capture-w", px);
  }

  /** @param {number} heightPx — visible CRT viewport height for capture. */
  setCaptureHeight(heightPx) {
    this.root.style.setProperty("--ms-capture-h", `${Math.round(heightPx)}px`);
  }

  /**
   * Shrink CRT typography until the layout fits the capture width (no transform scale).
   * @param {number} widthPx
   * @returns {number} applied font size in px
   */
  fitCaptureWidth(widthPx) {
    const target = Math.round(widthPx);
    this.setCaptureWidth(target);
    this.root.style.fontSize = `${MS_CAPTURE_BASE_FONT_PX}px`;
    this.root.style.transform = "";
    this.root.style.transformOrigin = "";

    let fontSize = MS_CAPTURE_BASE_FONT_PX;
    for (let pass = 0; pass < 12; pass += 1) {
      const overflow = this.viewport.scrollWidth - this.viewport.clientWidth;
      if (overflow <= 2) break;
      fontSize = Math.max(MS_CAPTURE_MIN_FONT_PX, fontSize - 0.5);
      this.root.style.fontSize = `${fontSize}px`;
    }

    return fontSize;
  }

  /** Expand viewport for a full-page DOM capture (no vertical clip). */
  beginFullPageCapture(captureW, captureH) {
    this.setCaptureWidth(captureW);
    this.setCaptureHeight(captureH);
    this.viewport.style.height = "auto";
    this.viewport.style.maxHeight = "none";
    this.viewport.style.overflow = "visible";
    this.fitCaptureWidth(captureW);
  }

  /** Restore viewport after capture. */
  endFullPageCapture() {
    this.viewport.style.height = "";
    this.viewport.style.maxHeight = "";
    this.viewport.style.overflow = "";
    this.clearCaptureFit();
  }

  clearCaptureFit() {
    this.root.style.fontSize = "";
    this.root.style.transform = "";
    this.root.style.transformOrigin = "";
    this.root.style.removeProperty("--ms-capture-h");
  }

  render() {
    if (this.view === "detail" && this.selectedId && !findContentById(this.selectedId)) {
      this.view = "dashboard";
      this.selectedId = null;
    }

    this.viewport.innerHTML = buildMySpacePage({
      view: this.view,
      selectedId: this.selectedId,
      hoverId: this.hoverId
    });

    if (this.hoverId) {
      this.setHover(this.hoverId);
    }
  }
}
