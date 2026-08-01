import * as THREE from "three";
import { toCanvas } from "html-to-image";
import {
  MYSPACE_PROFILE,
  findContentById,
  resolveMySpaceNavId
} from "../content/myspace-content.js";
import {
  applyScreenMapSettings,
  computeScreenWindowRect,
  screenUvToCanvas,
  SCREEN_MAP_PLANE
} from "../scene/vignettes/screenTextureMap.js";
import {
  buildIeLayout,
  collectIeChromeHitRegions,
  drawIeChrome,
  IE_HOME_TOOL_IDS,
  insetWindowRect
} from "./myspace/ieChrome.js";
import { MySpacePageView } from "./myspace/MySpacePageView.js";
import { XpBootMonitor } from "./xpBoot/XpBootMonitor.js";
import { XP_BOOT_STATES } from "./xpBoot/config.js";
import { renderCrtPowerOnFrame } from "./crtPowerOnCanvas.js";
import { playXpLinkClick } from "../audio/siteAudio.js";

const WIDTH = 1024;
const HEIGHT = 768;
/** External margin for the IE frame inside the CRT glass (not page padding). */
const CRT_BEZEL_INSET_X_RATIO = 0.038;
const CRT_BEZEL_INSET_Y_RATIO = 0.042;
/** Scanline + vignette strength on the canvas texture (0.6 = 40% softer overlays). */
const CRT_OVERLAY_INTENSITY = 0.6;
/** Classic MySpace link hover — painted on the CRT canvas, never via DOM re-capture. */
const LINK_HOVER_ORANGE = { r: 255, g: 102, b: 0 }; // #ff6600
/** Minimum blue-vs-red/green delta to treat a pixel as link ink (incl. AA fringes). */
const LINK_BLUE_DELTA = 25;
const LINK_PAGE_BG = "#ffffff";

export class MySpaceScreen {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    applyScreenMapSettings(this.texture);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    this.view = "dashboard";
    this.selectedId = null;
    this.hoverId = null;
    /** Page-local link regions (relative to content origin + scroll). */
    this._pageHitRegions = [];
    /** Merged page + IE chrome regions used by hitTest / hover. */
    this.hitRegions = [];
    this.onChange = null;
    this.powerOnProgress = 0;
    this.powerOnPlayed = false;
    /** CRT emissive LED — true after the monitor finishes powering on (mid-boot). */
    this.monitorLedOn = false;
    this._powerOnRunning = false;
    this._powerOnTween = null;
    this.scrollY = 0;
    this.pageHeight = HEIGHT;
    this.screenUvBounds = null;
    this.screenMap = SCREEN_MAP_PLANE;
    this.screenWindow = { x: 0, y: 0, w: WIDTH, h: HEIGHT };
    this.layout = buildIeLayout(this.screenWindow);
    this._powerOnRoot = document.getElementById("crt-power-on-root");
    this._pageBitmap = null;
    this._captureW = null;
    this._captureH = null;
    this._captureGen = 0;
    this._capturePending = false;
    this._captureDirty = false;
    /** Dev/stress counter — html-to-image runs (must stay near-zero during hover). */
    this._captureCount = 0;
    this._hoverPaintCount = 0;
    /** Hover-neutral CRT frame — hover blits this then paints orange overlay. */
    this._baseFrameCanvas = document.createElement("canvas");
    this._baseFrameCanvas.width = WIDTH;
    this._baseFrameCanvas.height = HEIGHT;
    this._baseFrameCtx = this._baseFrameCanvas.getContext("2d");
    this._baseFrameValid = false;

    this._crtHost =
      document.getElementById("myspace-crt-host") ?? this._createCrtHost();

    this.pageView = new MySpacePageView({
      mode: "crt",
      onNavigate: (id) => {
        if (id === null) this.backToDashboard();
        else this.openItem(id);
      }
    });
    this.pageView.mount(this._crtHost);

    this.xpBoot = new XpBootMonitor(this, WIDTH, HEIGHT);

    this.powerOnProgress = 0;
    this.powerOnPlayed = false;
    this.drawOff();
    this.xpBoot.prepare();
  }

  /** @returns {{ captureCount: number, hoverPaintCount: number, hoverId: string | null }} */
  debugPerf() {
    return {
      captureCount: this._captureCount,
      hoverPaintCount: this._hoverPaintCount,
      hoverId: this.hoverId,
      capturePending: this._capturePending
    };
  }

  _createCrtHost() {
    const host = document.createElement("div");
    host.id = "myspace-crt-host";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
    return host;
  }

  _updateScreenGeometry() {
    const crtFace = computeScreenWindowRect(
      WIDTH,
      HEIGHT,
      this.screenUvBounds,
      this.screenMap
    );
    const insetX = Math.round(crtFace.w * CRT_BEZEL_INSET_X_RATIO);
    const insetY = Math.round(crtFace.h * CRT_BEZEL_INSET_Y_RATIO);
    this.crtFace = crtFace;
    this.screenWindow = insetWindowRect(crtFace, insetX, insetY);
    this.layout = buildIeLayout(this.screenWindow);
  }

  /** Kept for API compatibility — curvature comes from the 3D CRT mesh, not canvas warping. */
  setWarpSourceMesh(_mesh) {}

  getTexture() {
    return this.texture;
  }

  setScreenUvBounds(bounds) {
    this.screenUvBounds = bounds;
    this._updateScreenGeometry();
    if (this.powerOnProgress > 0) this.draw();
  }

  setScreenMap(map) {
    this.screenMap = map;
    applyScreenMapSettings(this.texture, map);
    this._updateScreenGeometry();
    if (this.powerOnProgress > 0) this.draw();
  }

  setContentWarp(_warp) {}

  setChangeHandler(fn) {
    this.onChange = fn;
  }

  setPoweredOnHandler(fn) {
    this.onPoweredOn = fn;
  }

  setMonitorPowerLedHandler(fn) {
    this.onMonitorPowerLed = fn;
  }

  notifyMonitorPowerLed(state) {
    this.monitorLedOn = state === "on";
    this.onMonitorPowerLed?.(state);
  }

  /** True while CRT boot sequence is running (including CRT warm-up). */
  get isMonitorBooting() {
    return Boolean(this.xpBoot?.active || this.xpBoot?._bootStarted);
  }

  drawOff() {
    if (this.isMonitorBooting || this.monitorLedOn) return;

    this._pageHitRegions = [];
    this.hitRegions = [];
    this._baseFrameValid = false;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = "#030403";
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
    this._drawScanlines();
    this.texture.needsUpdate = true;
  }

  async playPowerOn() {
    if (this.isPoweredOn) {
      this.draw();
      return;
    }

    const boot = this.xpBoot;
    if (boot?._bootStarted && !boot.active && !this.monitorLedOn) {
      boot.prepare();
    }

    return boot?.startBoot();
  }

  get isPoweredOn() {
    return this.powerOnProgress >= 1 && !this._powerOnRunning && !this.xpBoot?.active;
  }

  openItem(id) {
    const navId = resolveMySpaceNavId(id);
    if (!navId || !findContentById(navId)) return;
    playXpLinkClick();
    this.selectedId = navId;
    this.view = "detail";
    this.scrollY = 0;
    this.draw();
    this.onChange?.(findContentById(navId));
  }

  backToDashboard() {
    playXpLinkClick();
    this.view = "dashboard";
    this.selectedId = null;
    this.scrollY = 0;
    this.hoverId = null;
    this.draw();
    this.onChange?.(null);
  }

  /** IE Back / Refresh / Home — always return to the main profile in-window. */
  goHome() {
    if (this.view === "dashboard" && this.scrollY === 0) {
      playXpLinkClick();
      this.hoverId = null;
      this.draw();
      return;
    }
    this.backToDashboard();
  }

  /** Sync DOM view state used by CRT capture and mobile panel. */
  syncPageView({ includeHover = false } = {}) {
    this.pageView.setView(this.view, this.selectedId);
    // CRT bitmap is hover-neutral; hover is a cheap canvas overlay.
    this.pageView.setHover(includeHover ? this.hoverId : null);
    this.pageView.setScrollTop(this.scrollY);
  }

  handleWheel(deltaY) {
    const maxScroll = this.maxScroll;
    if (maxScroll <= 0) return false;
    const next = Math.max(0, Math.min(maxScroll, this.scrollY + deltaY * 0.9));
    if (next === this.scrollY) return true;
    this.scrollY = next;
    this.pageView.setScrollTop(this.scrollY);
    this._baseFrameValid = false;
    this._paintFrame(this._pageBitmap);
    return true;
  }

  get maxScroll() {
    return Math.max(0, this.pageHeight - this.layout.content.h);
  }

  _rebuildHitRegions() {
    const chrome = this.isPoweredOn ? collectIeChromeHitRegions(this.layout) : [];
    this.hitRegions = [...this._pageHitRegions, ...chrome];
  }

  hitTest(uv) {
    if (!uv) return null;
    const { x, y } = screenUvToCanvas(uv, WIDTH, HEIGHT, this.screenUvBounds, this.screenMap);

    if (this.xpBoot?.active) {
      for (let i = this.hitRegions.length - 1; i >= 0; i -= 1) {
        const region = this.hitRegions[i];
        if (x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h) {
          return region.id;
        }
      }
      return null;
    }

    // IE chrome is in canvas space (above the content window).
    for (let i = this.hitRegions.length - 1; i >= 0; i -= 1) {
      const region = this.hitRegions[i];
      if (!IE_HOME_TOOL_IDS.has(region.id)) continue;
      if (
        x >= region.x &&
        x <= region.x + region.w &&
        y >= region.y &&
        y <= region.y + region.h
      ) {
        return region.id;
      }
    }

    const { content } = this.layout;
    if (x < content.x || x > content.x + content.w || y < content.y || y > content.y + content.h) {
      return null;
    }

    const pageX = x - content.x;
    const pageY = y - content.y + this.scrollY;
    for (let i = this._pageHitRegions.length - 1; i >= 0; i -= 1) {
      const region = this._pageHitRegions[i];
      if (
        pageX >= region.x &&
        pageX <= region.x + region.w &&
        pageY >= region.y &&
        pageY <= region.y + region.h
      ) {
        return region.id;
      }
    }
    return null;
  }

  handlePointer(uv) {
    if (!this.isPoweredOn) {
      if (!uv || !this.xpBoot?.active) return false;
      const { x, y } = screenUvToCanvas(uv, WIDTH, HEIGHT, this.screenUvBounds, this.screenMap);
      return this.xpBoot.handlePointer(x, y);
    }

    const id = this.hitTest(uv);
    if (!id) return false;
    if (id === "__back" || IE_HOME_TOOL_IDS.has(id)) {
      this.goHome();
      return true;
    }
    this.openItem(id);
    return true;
  }

  setHover(uv) {
    if (this.xpBoot?.isBooting && this.xpBoot.state === XP_BOOT_STATES.LOGIN) {
      if (!uv) {
        this.xpBoot.clearHover();
        return;
      }
      const { x, y } = screenUvToCanvas(uv, WIDTH, HEIGHT, this.screenUvBounds, this.screenMap);
      this.xpBoot.setHover(x, y);
      return;
    }
    if (this.xpBoot?.active) return;
    const next = uv ? this.hitTest(uv) : null;
    if (next === this.hoverId) return;
    this.hoverId = next;
    this._hoverPaintCount += 1;
    // Hover must never trigger html-to-image — blit cached base + orange overlay.
    this._compositeHoverFrame();
  }

  /**
   * Full content refresh (view change / power-on). Schedules DOM→canvas capture.
   * Hover and scroll use `_paintFrame` / `_compositeHoverFrame` and must not call this.
   */
  draw() {
    if (this.xpBoot?.active) return;

    if (this.powerOnProgress <= 0) {
      this.drawOff();
      return;
    }

    if (this._pageBitmap) {
      this._paintFrame(this._pageBitmap);
    }
    this._scheduleCapture();
  }

  /** Rebuild hover-neutral CRT frame (page + chrome + scanlines). */
  _paintFrame(pageBitmap) {
    const { content } = this.layout;
    this._rebuildHitRegions();

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = "#030403";
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(content.x, content.y, content.w, content.h);
    this.ctx.clip();

    if (pageBitmap) {
      const captureW = this._captureW ?? content.w;
      const captureH = this._captureH ?? content.h;
      this.ctx.drawImage(
        pageBitmap,
        0,
        this.scrollY,
        captureW,
        captureH,
        content.x,
        content.y,
        captureW,
        captureH
      );
    } else {
      this.ctx.fillStyle = LINK_PAGE_BG;
      this.ctx.fillRect(content.x, content.y, content.w, content.h);
    }

    this._drawScrollbar();
    this.ctx.restore();

    drawIeChrome(this.ctx, this.layout, MYSPACE_PROFILE.url);
    this._drawScanlines();

    if (this.powerOnProgress < 1) {
      this._drawCrtPowerOn();
    }

    this._baseFrameCtx.drawImage(this.canvas, 0, 0);
    this._baseFrameValid = true;
    this._compositeHoverFrame();
  }

  /** Blit cached base frame, then paint hover highlight if any. */
  _compositeHoverFrame() {
    if (this._baseFrameValid) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.drawImage(this._baseFrameCanvas, 0, 0);
    } else if (this._pageBitmap) {
      this._paintFrame(this._pageBitmap);
      return;
    }

    if (this.hoverId) {
      this.ctx.save();
      const { content } = this.layout;
      this.ctx.beginPath();
      this.ctx.rect(content.x, content.y, content.w, content.h);
      this.ctx.clip();
      this._paintLinkHoverOverlay();
      this.ctx.restore();
      this._paintIeToolHover();
    }

    this.texture.needsUpdate = true;
  }

  /** Orange link hover — recolor existing link pixels only (no fill, no text redraw). */
  _paintLinkHoverOverlay() {
    if (!this.hoverId || IE_HOME_TOOL_IDS.has(this.hoverId)) return;

    const region = this._pageHitRegions.find((r) => r.id === this.hoverId);
    if (!region || region.w <= 0 || region.h <= 0) return;

    const { content } = this.layout;
    const x = Math.round(content.x + region.x);
    const y = Math.round(content.y + region.y - this.scrollY);
    const w = Math.max(1, Math.ceil(region.w));
    const h = Math.max(1, Math.ceil(region.h));
    if (y + h < content.y || y > content.y + content.h) return;

    const clipY = Math.max(y, content.y);
    const clipBottom = Math.min(y + h, content.y + content.h);
    const clipH = clipBottom - clipY;
    if (clipH <= 0) return;

    const img = this.ctx.getImageData(x, clipY, w, clipH);
    const data = img.data;
    const or = LINK_HOVER_ORANGE.r;
    const og = LINK_HOVER_ORANGE.g;
    const ob = LINK_HOVER_ORANGE.b;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Classic link blue (#0000ee) and anti-aliased fringes on white.
      if (b <= r + LINK_BLUE_DELTA || b <= g + LINK_BLUE_DELTA || b < 80) continue;
      const ink = Math.min(1, (255 - Math.min(r, g)) / 255);
      if (ink < 0.04) continue;
      data[i] = Math.round(or * ink + 255 * (1 - ink));
      data[i + 1] = Math.round(og * ink + 255 * (1 - ink));
      data[i + 2] = Math.round(ob * ink + 255 * (1 - ink));
    }

    this.ctx.putImageData(img, x, clipY);
  }

  _paintIeToolHover() {
    if (!this.hoverId || !IE_HOME_TOOL_IDS.has(this.hoverId)) return;
    const region = this.hitRegions.find((r) => r.id === this.hoverId);
    if (!region) return;
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    this.ctx.fillRect(region.x + 1, region.y + 1, region.w - 2, region.h - 2);
  }

  _scheduleCapture() {
    if (this._capturePending) {
      this._captureDirty = true;
      return;
    }
    this._capturePending = true;
    this._captureDirty = false;
    const gen = ++this._captureGen;

    requestAnimationFrame(() => {
      this._capturePage(gen).finally(() => {
        this._capturePending = false;
        if (this._captureDirty) {
          this._captureDirty = false;
          this._scheduleCapture();
        }
      });
    });
  }

  async _capturePage(gen) {
    const { content } = this.layout;
    const captureW = Math.max(1, content.w);
    const captureH = content.h;
    this._captureW = captureW;
    this._captureH = captureH;
    this._captureCount += 1;

    // Capture is always hover-neutral so hover can be a cheap overlay.
    this.syncPageView({ includeHover: false });
    this.pageView.setScrollTop(0);
    this.scrollY = Math.min(this.scrollY, this.maxScroll);

    this.pageView.beginFullPageCapture(captureW, captureH);

    if (this._crtHost) {
      this._crtHost.style.width = `${captureW}px`;
      this._crtHost.style.maxWidth = `${captureW}px`;
      this._crtHost.style.overflow = "visible";
    }

    await document.fonts?.ready?.catch(() => {});
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    if (gen !== this._captureGen) {
      this.pageView.endFullPageCapture();
      return;
    }

    const captureEl = this.pageView.captureElement;
    const fullH = Math.max(captureH, captureEl.scrollHeight);

    const regions = this.pageView.collectHitRegions();
    this._pageHitRegions = regions.map((region) => ({
      id: region.id,
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
      text: region.text,
      font: region.font,
      lineHeight: region.lineHeight
    }));
    this._rebuildHitRegions();

    try {
      const captured = await toCanvas(captureEl, {
        width: captureW,
        height: fullH,
        pixelRatio: 1,
        backgroundColor: LINK_PAGE_BG,
        cacheBust: false,
        useCORS: true,
        style: {
          overflow: "visible",
          width: `${captureW}px`,
          boxSizing: "border-box"
        }
      });

      if (gen !== this._captureGen) return;

      this._pageBitmap = captured;
      this.pageHeight = fullH;
      this.scrollY = Math.min(this.scrollY, this.maxScroll);
      this.pageView.setScrollTop(this.scrollY);
      this._paintFrame(captured);
    } catch (error) {
      console.warn("[MySpaceScreen] Page capture failed:", error);
    } finally {
      this.pageView.endFullPageCapture();
      if (this._crtHost) {
        this._crtHost.style.overflow = "hidden";
      }
    }
  }

  _drawScrollbar() {
    const maxScroll = this.maxScroll;
    if (maxScroll <= 0) return;

    const { content } = this.layout;
    const trackW = 8;
    const trackX = content.x + content.w - trackW - 2;
    const trackY = content.y;
    const trackH = content.h;
    const thumbH = Math.max(28, (content.h / this.pageHeight) * trackH);
    const thumbY = trackY + (this.scrollY / maxScroll) * (trackH - thumbH);

    this.ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    this.ctx.fillRect(trackX, trackY, trackW, trackH);
    this.ctx.fillStyle = "rgba(80, 80, 80, 0.55)";
    this.ctx.fillRect(trackX + 1, thumbY, trackW - 2, thumbH);
  }

  _drawScanlines() {
    const { window: win } = this.layout;
    const scanAlpha = 0.04 * CRT_OVERLAY_INTENSITY;
    const vignetteAlpha = 0.14 * CRT_OVERLAY_INTENSITY;
    this.ctx.fillStyle = `rgba(0, 0, 0, ${scanAlpha})`;
    for (let y = win.y; y < win.y + win.h; y += 3) {
      this.ctx.fillRect(win.x, y, win.w, 1);
    }
    const cx = win.x + win.w / 2;
    const cy = win.y + win.h / 2;
    const vignette = this.ctx.createRadialGradient(
      cx,
      cy,
      win.h * 0.2,
      cx,
      cy,
      win.h * 0.75
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, `rgba(0,0,0,${vignetteAlpha})`);
    this.ctx.fillStyle = vignette;
    this.ctx.fillRect(win.x, win.y, win.w, win.h);
  }

  _drawCrtPowerOn() {
    renderCrtPowerOnFrame(this.ctx, WIDTH, HEIGHT, this.powerOnProgress);
  }
}
