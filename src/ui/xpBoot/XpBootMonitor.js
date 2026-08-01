import { toCanvas } from "html-to-image";
import { isSiteAudioMuted, playSiteSfx } from "../../audio/siteAudio.js";
import { playCrtPowerOnAnimation } from "../crtPowerOnCanvas.js";
import { XP_BOOT_CONFIG, XP_BOOT_STATES } from "./config.js";
import { buildXpBootCrtRoot } from "./buildXpBootDom.js";

/**
 * XP boot sequence rendered on the CRT monitor texture (not full-page).
 */
export class XpBootMonitor {
  /**
   * @param {import("../MySpaceScreen.js").MySpaceScreen} screen
   * @param {number} width
   * @param {number} height
   */
  constructor(screen, width, height) {
    this.screen = screen;
    this.width = width;
    this.height = height;
    this.cfg = XP_BOOT_CONFIG;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.state = XP_BOOT_STATES.POWER;
    this.active = false;
    this._bootStarted = false;
    this._hoveredUser = null;
    this._timers = [];
    this._captureRaf = 0;
    this._captureBusy = false;
    this._captureCount = 0;
    this._baseLoginBitmap = null;
    this._muted = isSiteAudioMuted();

    const host =
      document.getElementById("xp-crt-host") ??
      (() => {
        const el = document.createElement("div");
        el.id = "xp-crt-host";
        el.setAttribute("aria-hidden", "true");
        document.body.appendChild(el);
        return el;
      })();

    this.host = host;
    this.root = buildXpBootCrtRoot(width, height);
    host.appendChild(this.root);

    this._els = {
      skip: this.root.querySelector("#xp-boot-skip"),
      loginPrompt: this.root.querySelector("#xp-login-prompt"),
      userAdmin: this.root.querySelector("#xp-user-admin"),
      userGuest: this.root.querySelector("#xp-user-guest"),
      userTiles: this.root.querySelectorAll(".xp-user-tile")
    };

    this._startupAudio = new Audio(this.cfg.assets.startup);
    this._startupAudio.preload = "auto";
    this._loginAudio = new Audio(this.cfg.assets.login);
    this._loginAudio.preload = "auto";

    this._bootImg = this._preloadImage(this.cfg.assets.bootScreen);
    this._welcomeImg = this._preloadImage(this.cfg.assets.welcomeScreen);

    this._bind();
    this._onMuteChange = (event) => {
      this._muted = event.detail.muted;
      if (this._muted) {
        this._startupAudio.pause();
        this._loginAudio.pause();
      }
    };
    window.addEventListener("siteaudiomutechange", this._onMuteChange);
  }

  _bind() {
    this._els.skip?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._skipToMyspace();
    });
  }

  _preloadImage(src) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    return img;
  }

  /** Prepare boot UI offscreen; monitor stays off until zoom triggers boot. */
  prepare() {
    this._clearTimers();
    this._stopBootPaintLoop();
    this.state = XP_BOOT_STATES.POWER;
    this.active = false;
    this._bootStarted = false;
    this.screen.monitorLedOn = false;
    this.screen.notifyMonitorPowerLed("standby");
    this._ensureBootDom();
  }

  /** Rebuild boot DOM if a prior finish() removed it from the document. */
  _ensureBootDom() {
    if (this.root?.isConnected) return;

    if (!this.host?.isConnected) {
      this.host =
        document.getElementById("xp-crt-host") ??
        (() => {
          const el = document.createElement("div");
          el.id = "xp-crt-host";
          el.setAttribute("aria-hidden", "true");
          document.body.appendChild(el);
          return el;
        })();
    }

    this.root = buildXpBootCrtRoot(this.width, this.height);
    this.host.appendChild(this.root);

    this._els = {
      skip: this.root.querySelector("#xp-boot-skip"),
      loginPrompt: this.root.querySelector("#xp-login-prompt"),
      userAdmin: this.root.querySelector("#xp-user-admin"),
      userGuest: this.root.querySelector("#xp-user-guest"),
      userTiles: this.root.querySelectorAll(".xp-user-tile")
    };

    this._els.skip?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._skipToMyspace();
    });
  }

  get canStartBoot() {
    return !this._bootStarted && !this.screen.isPoweredOn;
  }

  get isBooting() {
    return this.active && this.state !== XP_BOOT_STATES.DONE;
  }

  /** Called when the desktop vignette finishes zooming in. */
  async startBoot() {
    if (!this.canStartBoot) return false;
    if (this._bootPromise) return this._bootPromise;

    this._bootPromise = this._runBoot().finally(() => {
      this._bootPromise = null;
    });
    return this._bootPromise;
  }

  async _runBoot() {
    this._ensureBootDom();
    this.screen.monitorLedOn = false;
    this.screen.notifyMonitorPowerLed("standby");

    this.active = true;
    this._bootStarted = true;

    try {
      await this._onPowerPress();
    } catch (error) {
      console.warn("[XpBootMonitor] Boot failed:", error);
      this.active = false;
      this._bootStarted = false;
      this.state = XP_BOOT_STATES.POWER;
      this.screen.notifyMonitorPowerLed("standby");
      return false;
    }
    return true;
  }

  /** @param {number} canvasX
   * @param {number} canvasY */
  handlePointer(canvasX, canvasY) {
    if (!this.active) return false;

    for (let i = this.screen.hitRegions.length - 1; i >= 0; i -= 1) {
      const r = this.screen.hitRegions[i];
      if (
        canvasX >= r.x &&
        canvasX <= r.x + r.w &&
        canvasY >= r.y &&
        canvasY <= r.y + r.h
      ) {
        if (r.id === "__skip") {
          this._skipToMyspace();
          return true;
        }
        if (r.id === "__login-admin") {
          if (this.state !== XP_BOOT_STATES.LOGIN) return false;
          this._onUserLogin("admin");
          return true;
        }
      }
    }

    return false;
  }

  /** @param {"admin" | "guest"} [account] */
  async _onPowerPress() {
    this._primeAudio();

    const crtMs = this.reducedMotion
      ? Math.round(this.cfg.crtPowerOnMs * 0.55)
      : this.cfg.crtPowerOnMs;

    await playCrtPowerOnAnimation(
      this.screen.ctx,
      this.width,
      this.height,
      crtMs,
      () => {
        this.screen._drawScanlines?.();
        this.screen.texture.needsUpdate = true;
      }
    );

    this.screen.notifyMonitorPowerLed("on");
    this._goTo(XP_BOOT_STATES.BOOT);
    this._paintBootFrame(performance.now());
    this._startBootPaintLoop();
    this._scheduleBootPhases();
  }

  _scheduleBootPhases() {
    this._schedule(async () => {
      this.root.classList.add("xp-crt--fade");
      await this._delay(this.cfg.bootFadeMs);
      this.root.classList.remove("xp-crt--fade");
      this._stopBootPaintLoop();
      this._goTo(XP_BOOT_STATES.WELCOME);
      this._playStartup();
      this._paintWelcomeFrame();

      this._schedule(async () => {
        this._goTo(XP_BOOT_STATES.LOGIN);
        await this._captureToScreen();
        this._updateHitRegions();
      }, this.cfg.welcomeDuration);
    }, this.cfg.bootDuration);
  }

  /** @param {"admin" | "guest"} account */
  _onUserLogin(account) {
    this._startupAudio.pause();
    this._startupAudio.currentTime = 0;
    this._playLogin();
    this._els.userTiles?.forEach((tile) => {
      tile.classList.toggle("is-selected", tile.dataset.user === account);
    });
    if (this._els.loginPrompt) {
      this._els.loginPrompt.textContent =
        account === "guest" ? "Loading guest settings..." : "Loading your settings...";
    }
    this._captureToScreen();

    this._schedule(() => {
      this._finish();
    }, this.cfg.loginLoadMs);
  }

  _skipToMyspace() {
    this._clearTimers();
    this._stopBootPaintLoop();
    this._finish();
  }

  _finish() {
    this._clearTimers();
    this._stopBootPaintLoop();
    this.state = XP_BOOT_STATES.DONE;
    this.active = false;
    sessionStorage.setItem(this.cfg.storageKey, "1");

    this.root.remove();
    this.host.remove();

    this.screen.powerOnPlayed = true;
    this.screen.powerOnProgress = 1;
    this.screen.notifyMonitorPowerLed("on");
    this.screen.view = "dashboard";
    this.screen.selectedId = null;
    this.screen.scrollY = 0;
    this.screen.hoverId = null;
    this.screen._pageHitRegions = [];
    this.screen.hitRegions = [];
    this._baseLoginBitmap = null;
    this.screen.draw();
    this.screen.onPoweredOn?.();
  }

  _goTo(state) {
    this.state = state;
    this.root.querySelectorAll(".xp-phase").forEach((el) => {
      const on = el.dataset.phase === state;
      el.hidden = !on;
      el.classList.toggle("is-active", on);
    });

    const showSkip =
      state === XP_BOOT_STATES.BOOT ||
      state === XP_BOOT_STATES.WELCOME ||
      state === XP_BOOT_STATES.LOGIN;
    if (this._els.skip) this._els.skip.hidden = !showSkip;
  }

  _updateHitRegions() {
    const regions = [];
    const prevHostOpacity = this.host.style.opacity;
    this.host.style.opacity = "1";

    const base = this.root.getBoundingClientRect();

    const addEl = (el, id) => {
      if (!el || el.hidden) return;
      const rect = el.getBoundingClientRect();
      let x = rect.left - base.left;
      let y = rect.top - base.top;
      let w = rect.width;
      let h = rect.height;
      if (w <= 0 || h <= 0) {
        x = el.offsetLeft;
        y = el.offsetTop;
        w = el.offsetWidth;
        h = el.offsetHeight;
      }
      if (w <= 0 || h <= 0) return;
      regions.push({ id, x, y, w, h });
    };

    addEl(this._els.skip, "__skip");
    addEl(this._els.userAdmin, "__login-admin");

    this.host.style.opacity = prevHostOpacity || "";

    if (!regions.some((r) => r.id === "__login-admin") && this.state === XP_BOOT_STATES.LOGIN) {
      regions.push({ id: "__login-admin", x: 548, y: 248, w: 400, h: 140 });
    }
    if (!regions.some((r) => r.id === "__skip")) {
      regions.push({ id: "__skip", x: 900, y: 4, w: 110, h: 28 });
    }

    this.screen.hitRegions = regions;
  }

  setHover(canvasX, canvasY) {
    if (!this.active || this.state !== XP_BOOT_STATES.LOGIN) return;

    let hovered = null;
    for (const tile of this._els.userTiles ?? []) {
      if (tile.hidden || tile.classList.contains("xp-user-tile--disabled")) continue;
      let x = tile.offsetLeft;
      let y = tile.offsetTop;
      let w = tile.offsetWidth;
      let h = tile.offsetHeight;
      if (w <= 0 || h <= 0) {
        const rect = tile.getBoundingClientRect();
        const base = this.root.getBoundingClientRect();
        x = rect.left - base.left;
        y = rect.top - base.top;
        w = rect.width;
        h = rect.height;
      }
      if (
        canvasX >= x &&
        canvasX <= x + w &&
        canvasY >= y &&
        canvasY <= y + h
      ) {
        hovered = tile.dataset.user ?? null;
        break;
      }
    }

    if (hovered === this._hoveredUser) return;
    this._hoveredUser = hovered;
    this._paintLoginHoverOverlay();
  }

  clearHover() {
    if (!this._hoveredUser) return;
    this._hoveredUser = null;
    this._paintLoginHoverOverlay();
  }

  /** Cheap hover — blit cached login frame + highlight; never re-run html-to-image. */
  _paintLoginHoverOverlay() {
    const ctx = this.screen.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (this._baseLoginBitmap) {
      ctx.drawImage(this._baseLoginBitmap, 0, 0, this.width, this.height);
    }

    if (this._hoveredUser) {
      for (const tile of this._els.userTiles ?? []) {
        if (tile.dataset.user !== this._hoveredUser) continue;
        if (tile.classList.contains("xp-user-tile--disabled")) continue;
        let x = tile.offsetLeft;
        let y = tile.offsetTop;
        let w = tile.offsetWidth;
        let h = tile.offsetHeight;
        if (w <= 0 || h <= 0) {
          const rect = tile.getBoundingClientRect();
          const base = this.root.getBoundingClientRect();
          x = rect.left - base.left;
          y = rect.top - base.top;
          w = rect.width;
          h = rect.height;
        }
        ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        break;
      }
    }

    this.screen._drawScanlines?.();
    this.screen.texture.needsUpdate = true;
  }

  async _captureToScreen() {
    this._captureCount += 1;
    try {
      // Clear transient hover classes so the cached bitmap stays hover-neutral.
      this._els.userTiles?.forEach((tile) => tile.classList.remove("is-hover"));

      const captured = await toCanvas(this.root, {
        width: this.width,
        height: this.height,
        pixelRatio: 1,
        cacheBust: false,
        useCORS: true
      });

      if (this.state === XP_BOOT_STATES.LOGIN) {
        this._baseLoginBitmap = captured;
      }

      const ctx = this.screen.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(captured, 0, 0, this.width, this.height);
      if (this._hoveredUser && this.state === XP_BOOT_STATES.LOGIN) {
        this._paintLoginHoverOverlay();
        return;
      }
      this.screen._drawScanlines?.();
      this.screen.texture.needsUpdate = true;
    } catch (error) {
      console.warn("[XpBootMonitor] Capture failed:", error);
      this._paintCaptureFallback();
    }
  }

  /** Static PNG fallback when html-to-image capture fails. */
  _paintCaptureFallback() {
    const ctx = this.screen.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.state === XP_BOOT_STATES.BOOT && this._bootImg?.complete) {
      ctx.drawImage(this._bootImg, 0, 0, this.width, this.height);
      this._paintBootProgressBar(performance.now());
    } else if (this.state === XP_BOOT_STATES.WELCOME && this._welcomeImg?.complete) {
      ctx.drawImage(this._welcomeImg, 0, 0, this.width, this.height);
    }

    this.screen._drawScanlines?.();
    this.screen.texture.needsUpdate = true;
  }

  /** Boot screen + sliding progress blocks — canvas only, no html-to-image. */
  _paintBootFrame(nowMs) {
    const ctx = this.screen.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, this.width, this.height);

    if (this._bootImg?.complete) {
      ctx.drawImage(this._bootImg, 0, 0, this.width, this.height);
    }

    this._paintBootProgressBar(nowMs);
    this.screen._drawScanlines?.();
    this.screen.texture.needsUpdate = true;
  }

  /** Match .xp-boot-bar CSS — three blocks sliding across a bordered track. */
  _paintBootProgressBar(nowMs) {
    const ctx = this.screen.ctx;
    const barW = 240;
    const barH = 16;
    const barX = (this.width - barW) / 2;
    const barY = this.height * 0.63;
    const blockW = 44;
    const blockH = 10;
    const cycleMs = 1600;
    const delays = [0, 350, 700];

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);

    for (let i = 0; i < 3; i += 1) {
      const local = ((nowMs - delays[i]) % cycleMs + cycleMs) % cycleMs;
      const u = local / cycleMs;
      const x = barX - blockW + u * (barW + blockW);
      let alpha = 1;
      if (u < 0.08) alpha = u / 0.08;
      else if (u > 0.92) alpha = (1 - u) / 0.08;

      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      const grad = ctx.createLinearGradient(x, barY + 2, x, barY + 2 + blockH);
      grad.addColorStop(0, "#7ec8ff");
      grad.addColorStop(0.45, "#2a84d4");
      grad.addColorStop(1, "#1a6eb5");
      ctx.fillStyle = grad;
      ctx.fillRect(x, barY + 3, blockW, blockH);
    }
    ctx.globalAlpha = 1;
  }

  _paintWelcomeFrame() {
    const ctx = this.screen.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#245edb";
    ctx.fillRect(0, 0, this.width, this.height);
    if (this._welcomeImg?.complete) {
      ctx.drawImage(this._welcomeImg, 0, 0, this.width, this.height);
    }
    this.screen._drawScanlines?.();
    this.screen.texture.needsUpdate = true;
  }

  /** Cheap RAF paint for the boot progress bar — never html-to-image. */
  _startBootPaintLoop() {
    this._stopBootPaintLoop();
    const tick = (now) => {
      if (!this.active || this.state !== XP_BOOT_STATES.BOOT) {
        this._captureRaf = 0;
        return;
      }
      this._paintBootFrame(now);
      this._captureRaf = requestAnimationFrame(tick);
    };
    this._captureRaf = requestAnimationFrame(tick);
  }

  _stopBootPaintLoop() {
    if (this._captureRaf) {
      cancelAnimationFrame(this._captureRaf);
      this._captureRaf = 0;
    }
  }

  _primeAudio() {
    if (this._muted) return;
    this._startupAudio.volume = 1;
    this._loginAudio.volume = 0.85;
    const p = this._startupAudio.play();
    if (p) {
      p.then(() => {
        this._startupAudio.pause();
        this._startupAudio.currentTime = 0;
      }).catch(() => {});
    }
  }

  _playStartup() {
    if (this._muted) return;
    playSiteSfx(this._startupAudio, { volume: 1 });
  }

  _playLogin() {
    if (this._muted) return;
    playSiteSfx(this._loginAudio, { volume: 0.85 });
  }

  _schedule(fn, ms) {
    const id = window.setTimeout(fn, ms);
    this._timers.push(id);
  }

  _clearTimers() {
    this._timers.forEach((id) => window.clearTimeout(id));
    this._timers = [];
  }

  _delay(ms) {
    return new Promise((resolve) => {
      this._schedule(resolve, ms);
    });
  }
}
