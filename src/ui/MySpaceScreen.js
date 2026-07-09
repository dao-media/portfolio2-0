import * as THREE from "three";
import { toCanvas } from "html-to-image";
import { MYSPACE_PROFILE, findContentById } from "../content/myspace-content.js";
import {
  applyScreenMapSettings,
  computeScreenWindowRect,
  screenUvToCanvas,
  SCREEN_MAP_PLANE
} from "../scene/vignettes/screenTextureMap.js";
import { buildIeLayout, drawIeChrome, insetWindowRect } from "./myspace/ieChrome.js";
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

    this.hitRegions = [];
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
    if (!findContentById(id)) return;
    playXpLinkClick();
    this.selectedId = id;
    this.view = "detail";
    this.scrollY = 0;
    this.draw();
    this.onChange?.(findContentById(id));
  }

  backToDashboard() {
    playXpLinkClick();
    this.view = "dashboard";
    this.selectedId = null;
    this.scrollY = 0;
    this.draw();
    this.onChange?.(null);
  }

  /** Sync DOM view state used by CRT capture and mobile panel. */
  syncPageView() {
    this.pageView.setView(this.view, this.selectedId);
    this.pageView.setHover(this.hoverId);
    this.pageView.setScrollTop(this.scrollY);
  }

  handleWheel(deltaY) {
    const maxScroll = this.maxScroll;
    if (maxScroll <= 0) return false;
    const next = Math.max(0, Math.min(maxScroll, this.scrollY + deltaY * 0.9));
    if (next === this.scrollY) return true;
    this.scrollY = next;
    this.syncPageView();
    this._paintFrame(this._pageBitmap);
    return true;
  }

  get maxScroll() {
    return Math.max(0, this.pageHeight - this.layout.content.h);
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

    const { content } = this.layout;
    const pageX = x - content.x;
    const pageY = y - content.y + this.scrollY;
    for (let i = this.hitRegions.length - 1; i >= 0; i -= 1) {
      const region = this.hitRegions[i];
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
    if (id === "__back") {
      this.backToDashboard();
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
    this.draw();
  }

  draw() {
    if (this.xpBoot?.active) return;

    if (this.powerOnProgress <= 0) {
      this.drawOff();
      return;
    }

    this._paintFrame(this._pageBitmap);
    this._scheduleCapture();
  }

  _paintFrame(pageBitmap) {
    const { content } = this.layout;
    this.hitRegions = [];

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
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillRect(content.x, content.y, content.w, content.h);
    }

    this._drawScrollbar();
    this.ctx.restore();

    drawIeChrome(this.ctx, this.layout, MYSPACE_PROFILE.url);
    this._drawScanlines();

    if (this.powerOnProgress < 1) {
      this._drawCrtPowerOn();
    }

    this.texture.needsUpdate = true;
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

    this.syncPageView();
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
    this.hitRegions = regions.map((region) => ({
      id: region.id,
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h
    }));

    try {
      const captured = await toCanvas(captureEl, {
        width: captureW,
        height: fullH,
        pixelRatio: 1,
        backgroundColor: "#ffffff",
        cacheBust: true,
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
