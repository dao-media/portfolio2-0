import { toCanvas } from "html-to-image";
import { isSiteAudioMuted } from "../../audio/siteAudio.js";
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
    this._stopCaptureLoop();
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
    await this._captureToScreen();
    this._startCaptureLoop();
    this._scheduleBootPhases();
  }

  _scheduleBootPhases() {
    this._schedule(async () => {
      this.root.classList.add("xp-crt--fade");
      await this._delay(this.cfg.bootFadeMs);
      this.root.classList.remove("xp-crt--fade");
      this._goTo(XP_BOOT_STATES.WELCOME);
      this._playStartup();
      await this._captureToScreen();

      this._schedule(async () => {
        this._goTo(XP_BOOT_STATES.LOGIN);
        await this._captureToScreen();
        this._stopCaptureLoop();
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
    this._stopCaptureLoop();
    this._finish();
  }

  _finish() {
    this._clearTimers();
    this._stopCaptureLoop();
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
    this.screen.hitRegions = [];
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

    this._els.userTiles?.forEach((tile) => {
      tile.classList.toggle(
        "is-hover",
        tile.dataset.user === hovered && !tile.classList.contains("is-selected")
      );
    });
    void this._captureToScreen();
  }

  clearHover() {
    if (!this._hoveredUser) return;
    this._hoveredUser = null;
    this._els.userTiles?.forEach((tile) => tile.classList.remove("is-hover"));
    void this._captureToScreen();
  }

  async _captureToScreen() {
    try {
      const captured = await toCanvas(this.root, {
        width: this.width,
        height: this.height,
        pixelRatio: 1,
        cacheBust: true,
        useCORS: true
      });

      const ctx = this.screen.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(captured, 0, 0, this.width, this.height);
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
    } else if (this.state === XP_BOOT_STATES.WELCOME && this._welcomeImg?.complete) {
      ctx.drawImage(this._welcomeImg, 0, 0, this.width, this.height);
    }

    this.screen._drawScanlines?.();
    this.screen.texture.needsUpdate = true;
  }

  _startCaptureLoop() {
    this._stopCaptureLoop();
    this._captureBusy = false;
    const tick = () => {
      if (!this.active || this.state !== XP_BOOT_STATES.BOOT) {
        this._captureRaf = 0;
        return;
      }
      if (!this._captureBusy) {
        this._captureBusy = true;
        void this._captureToScreen().finally(() => {
          this._captureBusy = false;
        });
      }
      this._captureRaf = requestAnimationFrame(tick);
    };
    this._captureRaf = requestAnimationFrame(tick);
  }

  _stopCaptureLoop() {
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
    this._startupAudio.currentTime = 0;
    this._startupAudio.play().catch(() => {});
  }

  _playLogin() {
    if (this._muted) return;
    this._loginAudio.currentTime = 0;
    this._loginAudio.play().catch(() => {});
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
