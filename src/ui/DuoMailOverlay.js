import { CASE_STUDIES } from "../content/caseStudies.js";
import {
  DUO_MAIL_ASPECT,
  DUO_MAIL_EDGE_GLITCH_INTENSITY,
  DUO_MAIL_EDGE_GLITCH_OUTER_PX,
  DUO_MAIL_ENTRANCE_SEC,
  DUO_MAIL_LIST_FRAC,
  DUO_MAIL_PULSE_COUNT,
  DUO_MAIL_PULSE_OPACITY
} from "../scene/duo/duoConstants.js";

/** Min height; width follows `DUO_MAIL_ASPECT` (1.4). iPad Mail–scale panel. */
const MIN_H = 480;
const MIN_W = Math.round(MIN_H * DUO_MAIL_ASPECT);


/**
 * Apple Mail–style two-column overlay — drag / resize, stays put until dismiss.
 */
export class DuoMailOverlay {
  /**
   * @param {{
   *   root?: HTMLElement | null,
   *   onOpenCaseStudy?: (slug: string) => void,
   *   onRequestClose?: () => void,
   *   onSelect?: (slug: string) => void,
   *   onProjectionDirty?: () => void
   * }} [opts]
   */
  constructor(opts = {}) {
    this.root = opts.root ?? document.getElementById("duo-mail-overlay");
    this.onOpenCaseStudy = opts.onOpenCaseStudy ?? null;
    this.onRequestClose = opts.onRequestClose ?? null;
    this.onSelect = opts.onSelect ?? null;
    this.onProjectionDirty = opts.onProjectionDirty ?? null;
    this._selected = CASE_STUDIES[0]?.slug ?? null;
    this._open = false;
    /** Once the user drags/resizes, stop following Duo / auto-centering. */
    this._userPlaced = false;
    /** Entrance pulse finished this open (panel at rest). */
    this._emerged = false;
    /** One-shot hologram entrance in progress. */
    this._entranceActive = false;
    this._entranceT = 0;
    /** @type {{ left: number, top: number, width: number, height: number } | null} */
    this._entranceTo = null;
    this._reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;
    /** Entrance pulse progress 0→1 (Duo → panel). */
    this._pulseProgress = 0;
    this._pulseAmount = 0;
    /** Beam opacity 0→1 during entrance (ramps with projection). */
    this._beamStrength = 0;
    /** @type {{ x: number, y: number } | null} */
    this._pointer = null;
    /** @type {{ left: number, top: number, width: number, height: number } | null} */
    this._layout = null;
    /** @type {{ mode: string, startX: number, startY: number, left: number, top: number, width: number, height: number } | null} */
    this._drag = null;
    /** @type {{ left: number, top: number, width: number, height: number, corners?: [number, number][] | null, measure?: string, normal?: number[] } | null} */
    this._duoRect = null;
    if (!this.root) return;

    this.root.innerHTML = `
      <svg class="duo-mail__beams" aria-hidden="true">
        <defs>
          <filter id="duo-mail-beam-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.5" result="soft" />
            <feGaussianBlur stdDeviation="1.1" result="core" />
            <feMerge>
              <feMergeNode in="soft" />
              <feMergeNode in="core" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="duo-mail-frustum-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="duo-mail-beam-grad-0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="rgba(170,245,255,0.95)" />
            <stop offset="18%" stop-color="rgba(120,230,255,0.45)" />
            <stop offset="55%" stop-color="rgba(100,210,255,0.12)" />
            <stop offset="100%" stop-color="rgba(180,245,255,0.02)" />
          </linearGradient>
          <linearGradient id="duo-mail-beam-grad-1" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="rgba(170,245,255,0.95)" />
            <stop offset="18%" stop-color="rgba(120,230,255,0.45)" />
            <stop offset="55%" stop-color="rgba(100,210,255,0.12)" />
            <stop offset="100%" stop-color="rgba(180,245,255,0.02)" />
          </linearGradient>
          <linearGradient id="duo-mail-beam-grad-2" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="rgba(170,245,255,0.95)" />
            <stop offset="18%" stop-color="rgba(120,230,255,0.45)" />
            <stop offset="55%" stop-color="rgba(100,210,255,0.12)" />
            <stop offset="100%" stop-color="rgba(180,245,255,0.02)" />
          </linearGradient>
          <linearGradient id="duo-mail-beam-grad-3" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="rgba(170,245,255,0.95)" />
            <stop offset="18%" stop-color="rgba(120,230,255,0.45)" />
            <stop offset="55%" stop-color="rgba(100,210,255,0.12)" />
            <stop offset="100%" stop-color="rgba(180,245,255,0.02)" />
          </linearGradient>
        </defs>
        <polygon class="duo-mail__frustum" filter="url(#duo-mail-frustum-glow)" />
        <g class="duo-mail__pulses" aria-hidden="true">
          <polygon class="duo-mail__pulse duo-mail__pulse--0" />
          <polygon class="duo-mail__pulse duo-mail__pulse--1" />
          <polygon class="duo-mail__pulse duo-mail__pulse--2" />
        </g>
        <g class="duo-mail__beams-halo" filter="url(#duo-mail-beam-glow)">
          <line class="duo-mail__beam duo-mail__beam--halo" data-beam="0" />
          <line class="duo-mail__beam duo-mail__beam--halo" data-beam="1" />
          <line class="duo-mail__beam duo-mail__beam--halo" data-beam="2" />
          <line class="duo-mail__beam duo-mail__beam--halo" data-beam="3" />
        </g>
        <g class="duo-mail__beams-core">
          <line class="duo-mail__beam duo-mail__beam--core" data-beam="0" stroke="url(#duo-mail-beam-grad-0)" />
          <line class="duo-mail__beam duo-mail__beam--core" data-beam="1" stroke="url(#duo-mail-beam-grad-1)" />
          <line class="duo-mail__beam duo-mail__beam--core" data-beam="2" stroke="url(#duo-mail-beam-grad-2)" />
          <line class="duo-mail__beam duo-mail__beam--core" data-beam="3" stroke="url(#duo-mail-beam-grad-3)" />
        </g>
      </svg>
      <div class="duo-mail" role="dialog" aria-label="Dane's Projects">
        <div class="duo-mail__edge-glitch" aria-hidden="true"></div>
        <header class="duo-mail__chrome">
          <div class="duo-mail__traffic" role="group" aria-label="Close">
            <button type="button" class="duo-mail__traffic-btn duo-mail__traffic-btn--close" aria-label="Close"></button>
            <button type="button" class="duo-mail__traffic-btn duo-mail__traffic-btn--close" aria-label="Close"></button>
            <button type="button" class="duo-mail__traffic-btn duo-mail__traffic-btn--close" aria-label="Close"></button>
          </div>
          <div class="duo-mail__title">Dane's Projects</div>
        </header>
        <div class="duo-mail__body">
          <aside class="duo-mail__list" role="listbox" aria-label="Case studies"></aside>
          <section class="duo-mail__preview">
            <div class="duo-mail__preview-empty">Select a message</div>
          </section>
        </div>
        <div class="duo-mail__resize duo-mail__resize--e" data-resize="e" aria-hidden="true"></div>
        <div class="duo-mail__resize duo-mail__resize--s" data-resize="s" aria-hidden="true"></div>
        <div class="duo-mail__resize duo-mail__resize--se" data-resize="se" aria-hidden="true"></div>
        <div class="duo-mail__resize duo-mail__resize--w" data-resize="w" aria-hidden="true"></div>
        <div class="duo-mail__resize duo-mail__resize--n" data-resize="n" aria-hidden="true"></div>
        <div class="duo-mail__resize duo-mail__resize--ne" data-resize="ne" aria-hidden="true"></div>
        <div class="duo-mail__resize duo-mail__resize--nw" data-resize="nw" aria-hidden="true"></div>
        <div class="duo-mail__resize duo-mail__resize--sw" data-resize="sw" aria-hidden="true"></div>
      </div>
      <button type="button" class="duo-mail__backdrop" aria-label="Dismiss inbox"></button>
    `;

    this._shell = this.root.querySelector(".duo-mail");
    this._beams = this.root.querySelector(".duo-mail__beams");
    this._frustum = this.root.querySelector(".duo-mail__frustum");
    this._beamHalos = Array.from(
      this.root.querySelectorAll(".duo-mail__beam--halo")
    );
    this._beamCores = Array.from(
      this.root.querySelectorAll(".duo-mail__beam--core")
    );
    this._beamGrads = [0, 1, 2, 3].map((i) =>
      this.root.querySelector(`#duo-mail-beam-grad-${i}`)
    );
    this._pulses = this.root.querySelector(".duo-mail__pulses");
    this._pulseLayers = Array.from(
      this.root.querySelectorAll(".duo-mail__pulse")
    );
    this._edgeGlitch = this.root.querySelector(".duo-mail__edge-glitch");
    this._list = this.root.querySelector(".duo-mail__list");
    this._preview = this.root.querySelector(".duo-mail__preview");
    this._backdrop = this.root.querySelector(".duo-mail__backdrop");
    this._chrome = this.root.querySelector(".duo-mail__chrome");

    // Drive list/preview split from constant (iPad Mail ≈ 30/70).
    this._shell?.style.setProperty(
      "--duo-mail-list",
      `${DUO_MAIL_LIST_FRAC}fr`
    );
    this._shell?.style.setProperty(
      "--duo-mail-preview",
      `${1 - DUO_MAIL_LIST_FRAC}fr`
    );

    this.root.querySelectorAll(".duo-mail__traffic-btn--close").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onRequestClose?.();
      });
    });
    // Backdrop is visual only (pointer-events: none) — Stage closes on
    // outside canvas clicks / Duo toggle.

    this._chrome?.addEventListener("pointerdown", (e) => {
      if (e.target.closest?.(".duo-mail__traffic-btn")) return;
      this._beginDrag(e, "move");
    });

    this.root.querySelectorAll(".duo-mail__resize").forEach((el) => {
      el.addEventListener("pointerdown", (e) => {
        const mode = el.getAttribute("data-resize") || "se";
        this._beginDrag(e, mode);
      });
    });

    this._onPointerMove = (e) => this._onDragMove(e);
    this._onPointerUp = () => this._endDrag();

    this._renderList();
    this._renderPreview();
    this._bindProjectionSync();
  }

  /** Keep glass capture locked to every live panel change (no debounce lag). */
  _bindProjectionSync() {
    if (!this._shell || typeof MutationObserver === "undefined") return;
    this._projectionMo?.disconnect?.();
    this._projectionMo = new MutationObserver(() => {
      this.onProjectionDirty?.();
    });
    this._projectionMo.observe(this._shell, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true
    });
    const bump = () => this.onProjectionDirty?.();
    this._list?.addEventListener("scroll", bump, { passive: true });
    this._preview?.addEventListener("scroll", bump, { passive: true });
    this._shell.addEventListener("transitionend", bump);
  }

  /**
   * @param {PointerEvent} e
   * @param {string} mode
   */
  _beginDrag(e, mode) {
    if (!this._shell || !this._open) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = this._shell.getBoundingClientRect();
    this._layout = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
    this._drag = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
    this._userPlaced = true;
    this._shell.classList.add("is-dragging");
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    window.addEventListener("pointercancel", this._onPointerUp);
  }

  /** @param {PointerEvent} e */
  _onDragMove(e) {
    if (!this._drag || !this._shell) return;
    const dx = e.clientX - this._drag.startX;
    const dy = e.clientY - this._drag.startY;
    let { left, top, width, height } = this._drag;
    const mode = this._drag.mode;
    const aspect = DUO_MAIL_ASPECT;

    if (mode === "move") {
      left += dx;
      top += dy;
    } else {
      // Keep Duo open-face aspect (1.4∶1) while resizing.
      if (mode === "e" || mode === "w") {
        const nextW =
          mode === "e" ? this._drag.width + dx : this._drag.width - dx;
        width = Math.max(MIN_W, nextW);
        height = width / aspect;
        if (mode === "w") left = this._drag.left + this._drag.width - width;
        top = this._drag.top + (this._drag.height - height) * 0.5;
      } else if (mode === "n" || mode === "s") {
        const nextH =
          mode === "s" ? this._drag.height + dy : this._drag.height - dy;
        height = Math.max(MIN_H, nextH);
        width = height * aspect;
        if (mode === "n") top = this._drag.top + this._drag.height - height;
        left = this._drag.left + (this._drag.width - width) * 0.5;
      } else {
        // Corners: drive from the dominant delta, lock aspect.
        const fromW =
          mode.includes("e")
            ? this._drag.width + dx
            : this._drag.width - dx;
        const fromH =
          mode.includes("s")
            ? this._drag.height + dy
            : this._drag.height - dy;
        if (Math.abs(dx) * aspect >= Math.abs(dy)) {
          width = Math.max(MIN_W, fromW);
          height = width / aspect;
        } else {
          height = Math.max(MIN_H, fromH);
          width = height * aspect;
        }
        if (mode.includes("w")) left = this._drag.left + this._drag.width - width;
        if (mode.includes("n")) top = this._drag.top + this._drag.height - height;
      }
    }

    width = Math.max(MIN_W, width);
    height = width / aspect;

    const maxL = Math.max(8, window.innerWidth - width - 8);
    const maxT = Math.max(8, window.innerHeight - height - 8);
    left = Math.min(Math.max(8, left), maxL);
    top = Math.min(Math.max(8, top), maxT);

    this._layout = { left, top, width, height };
    this._applyLayout();
  }

  _endDrag() {
    const wasDragging = Boolean(this._drag);
    this._drag = null;
    this._shell?.classList.remove("is-dragging");
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerUp);
    if (wasDragging) this.onProjectionDirty?.();
  }

  _applyLayout() {
    if (!this._shell || !this._layout) return;
    const { left, top, width, height } = this._layout;
    this._shell.style.left = `${left}px`;
    this._shell.style.top = `${top}px`;
    this._shell.style.width = `${width}px`;
    this._shell.style.height = `${height}px`;
    this._shell.style.visibility = "visible";
    this._syncBeams();
    this._syncEdgeGlitch();
  }

  /**
   * Advance hologram entrance pulse + edge GlitchQL arm.
   * @param {number} dt
   */
  tick(dt) {
    if (!this._open) return;
    const safeDt = Math.min(0.05, Math.max(0, dt || 0));
    this._tickEntrance(safeDt);
    this._syncBeams();
    this._syncEdgeGlitch();
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  setPointerClient(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      this._pointer = null;
      return;
    }
    this._pointer = { x: clientX, y: clientY };
  }

  /**
   * One-shot entrance: shape peels off the open Duo face (exact optical size/
   * angle), rides rails while morphing to the Mail square; beams ramp with it;
   * Mail panel is the last thing to appear.
   * @param {number} dt
   */
  _tickEntrance(dt) {
    if (!this._entranceActive || this._emerged) return;
    if (!this._entranceTo) return;

    if (this._reducedMotion) {
      this._finishEntrance();
      return;
    }

    this._entranceT += dt;
    const u = Math.min(
      1,
      this._entranceT / Math.max(1e-3, DUO_MAIL_ENTRANCE_SEC)
    );

    // Linear along rails — corners stay locked to Duo→Mail beam lines.
    this._pulseProgress = u;
    // Full strength from the first frame so the lead silhouette matches Duo.
    this._pulseAmount = u >= 1 ? 0 : 1;

    // Beams strengthen over the projection (not visible before the shape).
    this._beamStrength = smoothstep(0.08, 0.7, u);

    // Panel stays on the Mail square; only appears late as the morph lands.
    this._layout = this._entranceTo;
    this._applyLayout();

    // Mail overlay = last beat of the entrance.
    const reveal = smoothstep(0.78, 0.98, u);
    if (this._shell) {
      this._shell.style.opacity = String(reveal);
      this._shell.style.transform = `scale(${(0.96 + 0.04 * reveal).toFixed(4)})`;
      this._shell.style.pointerEvents = reveal > 0.7 ? "auto" : "none";
    }

    if (u >= 1) this._finishEntrance();
  }

  _finishEntrance() {
    this._entranceActive = false;
    this._emerged = true;
    this._pulseProgress = 0;
    this._pulseAmount = 0;
    this._beamStrength = 1;
    this._layout = this._entranceTo ?? this._layoutCentered();
    this._entranceTo = null;
    if (this._shell) {
      this._shell.classList.remove("is-entering");
      this._shell.classList.add("is-visible");
      this._shell.style.opacity = "";
      this._shell.style.transform = "";
      this._shell.style.pointerEvents = "";
    }
    this._applyLayout();
    this.onProjectionDirty?.();
  }

  /**
   * Soft frustum + structural beams + traveling hologram shape.
   * During entrance: rails grow with the pulse; beam opacity ramps via
   * `--mail-beams`. Rails = live Duo face corners → Mail square.
   */
  _syncBeams() {
    const hasLines =
      (this._beamCores?.length || 0) > 0 || (this._beamHalos?.length || 0) > 0;
    if (!this._beams || !hasLines) return;
    if (!this._open || !this._duoRect || !this._layout) {
      this._beams.classList.remove("is-on");
      this._pulses?.classList.remove("is-on");
      this._beams.style.setProperty("--mail-beams", "0");
      this._beamSig = null;
      return;
    }

    const panelTarget =
      this._entranceActive && this._entranceTo ? this._entranceTo : this._layout;
    fillCornerPairs(this._duoRect, panelTarget, _PAIRS);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tipT = this._entranceActive
      ? Math.min(1, Math.max(0.001, this._pulseProgress))
      : 1;
    const beamAmt = this._entranceActive
      ? this._beamStrength ?? 0
      : this._open
        ? 1
        : 0;
    if (this._beamSigMatches(vw, vh, tipT, beamAmt)) {
      return;
    }
    this._beamSigStore(vw, vh, tipT, beamAmt);

    this._beams.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
    this._beams.setAttribute("width", String(vw));
    this._beams.setAttribute("height", String(vh));

    fillLerpQuad(_PAIRS, tipT, _TIP);
    fillDuoCorners(this._duoRect, _DUO);

    if (this._frustum) {
      this._frustum.setAttribute("points", pointsAttr8(_DUO, _TIP));
    }

    const applyPair = (line, i) => {
      if (!line) return;
      const pair = _PAIRS[i];
      const tip = _TIP[i];
      const x1 = pair[0];
      const y1 = pair[1];
      const x2 = tip[0];
      const y2 = tip[1];
      line.setAttribute("x1", String(x1));
      line.setAttribute("y1", String(y1));
      line.setAttribute("x2", String(x2));
      line.setAttribute("y2", String(y2));
      line.setAttribute("stroke", _BEAM_STROKES[i]);
      const grad = this._beamGrads[i];
      if (grad) {
        grad.setAttribute("x1", String(x1));
        grad.setAttribute("y1", String(y1));
        grad.setAttribute("x2", String(x2));
        grad.setAttribute("y2", String(y2));
      }
    };

    for (let i = 0; i < this._beamHalos.length; i += 1) applyPair(this._beamHalos[i], i);
    for (let i = 0; i < this._beamCores.length; i += 1) applyPair(this._beamCores[i], i);

    this._beams.style.setProperty("--mail-beams", beamAmt.toFixed(3));
    this._beams.classList.toggle("is-on", beamAmt > 0.01);
    this._syncPulses(_PAIRS);
  }

  _beamSigMatches(vw, vh, tipT, beamAmt) {
    const sig = this._beamSig;
    if (!sig) return false;
    if (sig[0] !== vw || sig[1] !== vh || sig[2] !== tipT || sig[3] !== beamAmt) return false;
    for (let i = 0; i < 4; i += 1) {
      const pair = _PAIRS[i];
      const base = 4 + i * 4;
      if (
        sig[base] !== pair[0] ||
        sig[base + 1] !== pair[1] ||
        sig[base + 2] !== pair[2] ||
        sig[base + 3] !== pair[3]
      ) {
        return false;
      }
    }
    return true;
  }

  _beamSigStore(vw, vh, tipT, beamAmt) {
    const sig = this._beamSig || (this._beamSig = new Float64Array(20));
    sig[0] = vw;
    sig[1] = vh;
    sig[2] = tipT;
    sig[3] = beamAmt;
    for (let i = 0; i < 4; i += 1) {
      const pair = _PAIRS[i];
      const base = 4 + i * 4;
      sig[base] = pair[0];
      sig[base + 1] = pair[1];
      sig[base + 2] = pair[2];
      sig[base + 3] = pair[3];
    }
  }

  /**
   * Lead silhouette starts as the exact Duo face quad, then each corner rides
   * its rail to the Mail square. Trailing echoes lag behind on the same rails.
   * @param {[number, number, number, number][]} pairs
   */
  _syncPulses(pairs) {
    if (!this._pulseLayers?.length || !pairs?.length) {
      this._pulses?.classList.remove("is-on");
      return;
    }
    if (!this._entranceActive || this._pulseAmount < 0.02) {
      this._pulseLayers.forEach((el) => {
        el.style.opacity = "0";
      });
      this._pulses?.classList.remove("is-on");
      return;
    }
    const count = Math.min(DUO_MAIL_PULSE_COUNT, this._pulseLayers.length);
    const base = this._pulseProgress;
    this._pulseLayers.forEach((el, i) => {
      if (i >= count) {
        el.style.opacity = "0";
        return;
      }
      // Lead (i=0) is flush with Duo at t=0; trails stagger behind.
      const lag = i * 0.12;
      const t = Math.min(1, Math.max(0, base - lag));
      if (i > 0 && t <= 0) {
        el.style.opacity = "0";
        return;
      }
      // Soft land only — no fade-in at Duo (must match screen optical size).
      const land = t > 0.88 ? (1 - t) / 0.12 : 1;
      const trail = i === 0 ? 1 : 1 - i * 0.22;
      const strength = this._pulseAmount * land * trail;
      const quad = lerpCornerQuad(pairs, t);
      el.setAttribute("points", pointsAttr(quad));
      el.style.opacity = String(DUO_MAIL_PULSE_OPACITY * strength);
      // Crisp on the Duo face; slight bloom mid-flight; sharpen at Mail.
      const blur =
        t < 0.08
          ? 0.15
          : t > 0.9
            ? 0.25
            : 0.15 + (1 - Math.abs(t - 0.5) * 2) * 1.1;
      el.style.filter = `blur(${blur.toFixed(2)}px)`;
      el.style.strokeWidth = String((1.85 - t * 0.25).toFixed(2));
    });
    this._pulses?.classList.add("is-on");
  }

  /**
   * GlitchQL-style edge tears + RGB split on the Mail panel rim (cursor-armed).
   */
  _syncEdgeGlitch() {
    if (!this._shell || !this._edgeGlitch || !this._layout) {
      this._shell?.style.setProperty("--mail-glitch", "0");
      return;
    }
    if (this._reducedMotion || !this._open || !this._pointer) {
      this._shell.style.setProperty("--mail-glitch", "0");
      this._shell.classList.remove("is-edge-glitch");
      return;
    }
    const { left, top, width, height } = this._layout;
    const px = this._pointer.x;
    const py = this._pointer.y;
    const dx = Math.max(left - px, 0, px - (left + width));
    const dy = Math.max(top - py, 0, py - (top + height));
    // Distance to rect (0 = inside or on edge).
    const dist = Math.hypot(dx, dy);
    const outer = DUO_MAIL_EDGE_GLITCH_OUTER_PX;
    let gate = 0;
    if (dist <= 0) {
      // Inside: ramp up only near the rim (like EdgeGlitch hard-cut inside).
      const insetX = Math.min(px - left, left + width - px);
      const insetY = Math.min(py - top, top + height - py);
      const inset = Math.min(insetX, insetY);
      const rim = Math.min(width, height) * 0.08;
      gate = inset <= rim ? 1 - inset / Math.max(1e-3, rim) : 0;
    } else if (dist < outer) {
      gate = 1 - dist / outer;
    }
    gate = Math.max(0, Math.min(1, gate)) * DUO_MAIL_EDGE_GLITCH_INTENSITY;
    this._shell.style.setProperty("--mail-glitch", gate.toFixed(3));
    this._shell.style.setProperty(
      "--mail-glitch-shift",
      `${(gate * 3.2).toFixed(2)}px`
    );
    this._shell.classList.toggle("is-edge-glitch", gate > 0.04);
  }

  /**
   * Size panel for viewport center (iPad Mail–scale).
   * @returns {{ left: number, top: number, width: number, height: number }}
   */
  _layoutCentered() {
    const aspect = DUO_MAIL_ASPECT;
    const maxH = Math.min(window.innerHeight * 0.78, 720);
    const maxW = Math.min(window.innerWidth * 0.72, maxH * aspect);
    let height = Math.max(MIN_H, Math.min(maxH, window.innerHeight * 0.62));
    let width = height * aspect;
    if (width > maxW) {
      width = maxW;
      height = width / aspect;
    }
    const left = Math.max(12, (window.innerWidth - width) * 0.5);
    const top = Math.max(12, (window.innerHeight - height) * 0.5);
    return { left, top, width, height };
  }

  /**
   * @deprecated Prefer `_layoutCentered` — kept for beam math helpers.
   * @param {{ left: number, top: number, width: number, height: number }} rect
   */
  _layoutClearOfDuo(rect) {
    void rect;
    return this._layoutCentered();
  }

  _renderList() {
    if (!this._list) return;
    this._list.innerHTML = CASE_STUDIES.map((study) => {
      const active = study.slug === this._selected ? " is-active" : "";
      return `
        <button type="button" class="duo-mail__row${active}" role="option"
          aria-selected="${study.slug === this._selected}" data-slug="${study.slug}">
          <span class="duo-mail__row-from">${escapeHtml(study.from)}</span>
          <span class="duo-mail__row-subject">${escapeHtml(study.title)}</span>
          <span class="duo-mail__row-snippet">${escapeHtml(study.summary)}</span>
        </button>`;
    }).join("");

    this._list.querySelectorAll(".duo-mail__row").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._selected = btn.getAttribute("data-slug");
        this._renderList();
        this._renderPreview();
        this.onSelect?.(this._selected);
        this.onProjectionDirty?.();
      });
    });
  }

  _renderPreview() {
    if (!this._preview) return;
    const study = CASE_STUDIES.find((c) => c.slug === this._selected);
    if (!study) {
      this._preview.innerHTML = `<div class="duo-mail__preview-empty">Select a message</div>`;
      return;
    }

    const img = study.image
      ? `<img class="duo-mail__hero" src="${study.image}" alt="" loading="lazy" onerror="this.classList.add('is-missing')" />`
      : `<div class="duo-mail__hero duo-mail__hero--placeholder" data-slug="${study.slug}"></div>`;

    this._preview.innerHTML = `
      <div class="duo-mail__preview-meta">
        <div class="duo-mail__preview-from">${escapeHtml(study.from)}</div>
        <div class="duo-mail__preview-subject">${escapeHtml(study.title)}</div>
        <div class="duo-mail__preview-cat">${escapeHtml(study.category)}</div>
      </div>
      ${img}
      <p class="duo-mail__preview-summary">${escapeHtml(study.summary)}</p>
      <div class="duo-mail__actions">
        <button type="button" class="duo-mail__open-cs" data-slug="${study.slug}">
          Open Case Study
        </button>
      </div>
    `;

    this._preview.querySelector(".duo-mail__open-cs")?.addEventListener("click", () => {
      this.onOpenCaseStudy?.(study.slug);
    });
    const hero = this._preview.querySelector(".duo-mail__hero");
    if (hero instanceof HTMLImageElement) {
      if (hero.complete) this.onProjectionDirty?.();
      else hero.addEventListener("load", () => this.onProjectionDirty?.(), { once: true });
    } else {
      this.onProjectionDirty?.();
    }
  }

  open() {
    console.info("[DuoMailOverlay] open", {
      hasRoot: Boolean(this.root),
      hidden: this.root?.hidden ?? null,
      open: this._open
    });
    window.__mailOpenLog = window.__mailOpenLog || [];
    window.__mailOpenLog.push({
      t: Math.round(performance.now()),
      hasRoot: Boolean(this.root),
      hidden: this.root?.hidden ?? null
    });
    if (!this.root) return;
    this._open = true;
    this._userPlaced = false;
    this._emerged = false;
    this._entranceActive = true;
    this._entranceT = 0;
    this._entranceTo = null;
    this._layout = null;
    this._pulseProgress = 0;
    this._pulseAmount = 0;
    this._beamStrength = 0;
    this.root.hidden = false;
    this.root.classList.add("is-open");
    this._shell?.classList.remove("is-visible");
    this._shell?.classList.add("is-entering");
    if (this._shell) {
      this._shell.style.visibility = "visible";
      this._shell.style.opacity = "1";
      this._shell.style.transform = "scale(1)";
      this._shell.style.pointerEvents = "auto";
    }
    if (this._duoRect?.width > 1) {
      const dest = this._layoutCentered();
      this._entranceTo = dest;
      this._layout = dest;
      this._entranceT = DUO_MAIL_ENTRANCE_SEC * 0.86;
      this._pulseProgress = 0.86;
      this._applyLayout();
    } else {
      this._layout = this._layoutCentered();
      this._applyLayout();
      this._finishEntrance();
    }
    this._beams?.style.setProperty("--mail-beams", "0");
    this.onProjectionDirty?.();
  }

  close() {
    if (!this.root) return;
    this._endDrag();
    this._open = false;
    this._userPlaced = false;
    this._emerged = false;
    this._entranceActive = false;
    this._entranceT = 0;
    this._entranceTo = null;
    this._layout = null;
    this._duoRect = null;
    this._beamSig = null;
    this._beams?.classList.remove("is-on");
    this._pulses?.classList.remove("is-on");
    this._beams?.style.setProperty("--mail-beams", "0");
    this._shell?.classList.remove("is-edge-glitch");
    this._shell?.style.setProperty("--mail-glitch", "0");
    this._pulseProgress = 0;
    this._pulseAmount = 0;
    this._beamStrength = 0;
    this._shell?.classList.remove("is-entering", "is-emerging");
    this.root.classList.remove("is-open");
    this._shell?.classList.remove("is-visible");
    if (this._shell) {
      this._shell.style.opacity = "";
      this._shell.style.transform = "";
      this._shell.style.pointerEvents = "";
    }
    this.root.hidden = true;
  }

  _ensureDuoRect() {
    if (this._duoRect) return this._duoRect;
    this._duoRect = {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      corners: [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0]
      ],
      measure: "",
      normal: null,
      _seen: false,
      _hasCorners: false
    };
    return this._duoRect;
  }

  get isOpen() {
    return this._open;
  }

  get selectedSlug() {
    return this._selected;
  }

  /** Live Mail panel element for on-glass html-to-image capture. */
  get shell() {
    return this._shell;
  }

  /**
   * @param {{
   *   left: number,
   *   top: number,
   *   width: number,
   *   height: number,
   *   corners?: [number, number][],
   *   measure?: string,
   *   normal?: number[]
   * } | null} rect
   */
  setScreenRect(rect) {
    if (!this._shell) return;
    if (!rect) {
      if (this._open) this._shell.style.visibility = "visible";
      this._beams?.classList.remove("is-on");
      this._pulses?.classList.remove("is-on");
      return;
    }
    this._duoRect = this._ensureDuoRect();
    const slot = this._duoRect;
    const nextMeasure = rect.measure || "";
    const nextCorners = rect.corners;
    const nextHasCorners = Array.isArray(nextCorners) && nextCorners.length === 4;
    const unchanged =
      !this._entranceActive &&
      Math.abs(slot.left - rect.left) < 0.5 &&
      Math.abs(slot.top - rect.top) < 0.5 &&
      Math.abs(slot.width - rect.width) < 0.5 &&
      Math.abs(slot.height - rect.height) < 0.5 &&
      slot.measure === nextMeasure &&
      slot._seen &&
      Boolean(slot._hasCorners) === nextHasCorners &&
      (!nextHasCorners || cornersWithin(slot.corners, nextCorners, 0.5));
    if (unchanged) return;

    slot.left = rect.left;
    slot.top = rect.top;
    slot.width = rect.width;
    slot.height = rect.height;
    slot.measure = nextMeasure;
    slot.normal = rect.normal || null;
    slot._seen = true;
    const corners = rect.corners;
    if (Array.isArray(corners) && corners.length === 4) {
      for (let i = 0; i < 4; i += 1) {
        slot.corners[i][0] = corners[i][0];
        slot.corners[i][1] = corners[i][1];
      }
      slot._hasCorners = true;
    } else {
      writeRectCorners(slot, slot.corners);
      slot._hasCorners = false;
    }

    if (!this._open) return;

    // After drag/resize, keep placement but still update projection beams.
    if (this._userPlaced) {
      this._shell.style.visibility = "visible";
      this._syncBeams();
      return;
    }

    const dest = this._layoutCentered();

    // Kick off hologram-pulse entrance: rails Duo face → Mail square.
    if (this._entranceActive && !this._emerged) {
      if (!this._entranceTo) {
        this._entranceTo = dest;
        this._layout = dest;
        this._applyLayout();
        this._shell.style.visibility = "visible";
        if (this._reducedMotion) this._finishEntrance();
      } else {
        // Keep destination current if viewport resized mid-entrance.
        this._entranceTo = dest;
        this._layout = dest;
      }
      this._syncBeams();
      return;
    }

    const prev = this._layout;
    this._layout = dest;
    this._applyLayout();
    if (
      !prev ||
      Math.abs(prev.width - dest.width) > 1 ||
      Math.abs(prev.height - dest.height) > 1 ||
      Math.abs(prev.left - dest.left) > 2 ||
      Math.abs(prev.top - dest.top) > 2
    ) {
      this.onProjectionDirty?.();
    }
  }
}

const _PAIRS = [
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0]
];
const _TIP = [
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0]
];
const _DUO = [
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0]
];
const _PANEL = [
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0]
];
const _BEAM_STROKES = [
  "url(#duo-mail-beam-grad-0)",
  "url(#duo-mail-beam-grad-1)",
  "url(#duo-mail-beam-grad-2)",
  "url(#duo-mail-beam-grad-3)"
];

/** All 4 points within `eps` px on both axes — a perspective quad is not a rect. */
function cornersWithin(a, b, eps) {
  for (let i = 0; i < 4; i += 1) {
    if (Math.abs(a[i][0] - b[i][0]) >= eps || Math.abs(a[i][1] - b[i][1]) >= eps) return false;
  }
  return true;
}

function writeRectCorners(r, out) {
  out[0][0] = r.left;
  out[0][1] = r.top;
  out[1][0] = r.left + r.width;
  out[1][1] = r.top;
  out[2][0] = r.left + r.width;
  out[2][1] = r.top + r.height;
  out[3][0] = r.left;
  out[3][1] = r.top + r.height;
}

function fillDuoCorners(d, out) {
  if (d?._hasCorners && Array.isArray(d.corners) && d.corners.length === 4) {
    for (let i = 0; i < 4; i += 1) {
      out[i][0] = d.corners[i][0];
      out[i][1] = d.corners[i][1];
    }
    return out;
  }
  writeRectCorners(d, out);
  return out;
}

function fillCornerPairs(duoRect, panel, out) {
  fillDuoCorners(duoRect, _DUO);
  if (Array.isArray(panel)) {
    for (let i = 0; i < 4; i += 1) {
      _PANEL[i][0] = panel[i][0];
      _PANEL[i][1] = panel[i][1];
    }
  } else {
    writeRectCorners(panel, _PANEL);
  }
  for (let i = 0; i < 4; i += 1) {
    out[i][0] = _DUO[i][0];
    out[i][1] = _DUO[i][1];
    out[i][2] = _PANEL[i][0];
    out[i][3] = _PANEL[i][1];
  }
}

function fillLerpQuad(pairs, t, out) {
  for (let i = 0; i < 4; i += 1) {
    const pair = pairs[i];
    out[i][0] = pair[0] + (pair[2] - pair[0]) * t;
    out[i][1] = pair[1] + (pair[3] - pair[1]) * t;
  }
}

function pointsAttr8(duo, tip) {
  return `${duo[0][0]},${duo[0][1]} ${duo[1][0]},${duo[1][1]} ${duo[2][0]},${duo[2][1]} ${duo[3][0]},${duo[3][1]} ${tip[3][0]},${tip[3][1]} ${tip[2][0]},${tip[2][1]} ${tip[1][0]},${tip[1][1]} ${tip[0][0]},${tip[0][1]}`;
}

/**
 * Axis-aligned rect → TL, TR, BR, BL client corners.
 * @param {{ left: number, top: number, width: number, height: number }} r
 * @returns {[number, number][]}
 */
function rectCorners(r) {
  return [
    [r.left, r.top],
    [r.left + r.width, r.top],
    [r.left + r.width, r.top + r.height],
    [r.left, r.top + r.height]
  ];
}

/**
 * Insight-face quad when present; otherwise AABB corners (same TL/TR/BR/BL order).
 * @param {{
 *   left: number,
 *   top: number,
 *   width: number,
 *   height: number,
 *   corners?: [number, number][] | null
 * }} d
 * @returns {[number, number][]}
 */
function duoFaceCorners(d) {
  if (Array.isArray(d.corners) && d.corners.length === 4) {
    return /** @type {[number, number][]} */ (
      d.corners.map((c) => [c[0], c[1]])
    );
  }
  return rectCorners(d);
}

/**
 * Shared Duo→panel corner pairs for beams, frustum, and echoes.
 * Panel side = flat layout box corners.
 * @param {{
 *   left: number,
 *   top: number,
 *   width: number,
 *   height: number,
 *   corners?: [number, number][] | null
 * }} duoRect
 * @param {[number, number][] | { left: number, top: number, width: number, height: number }} panel
 * @returns {[number, number, number, number][]}
 */
function buildCornerPairs(duoRect, panel) {
  const duo = duoFaceCorners(duoRect);
  const panelCorners = Array.isArray(panel) ? panel : rectCorners(panel);
  return duo.map((dc, i) => [
    dc[0],
    dc[1],
    panelCorners[i][0],
    panelCorners[i][1]
  ]);
}

/**
 * Depth-slice a corner quad at t∈[0,1] along each Duo→panel edge.
 * @param {[number, number, number, number][]} pairs
 * @param {number} t
 * @returns {[number, number][]}
 */
function lerpCornerQuad(pairs, t) {
  return pairs.map(([x1, y1, x2, y2]) => [
    x1 + (x2 - x1) * t,
    y1 + (y2 - y1) * t
  ]);
}

/** @param {[number, number][]} corners */
function pointsAttr(corners) {
  return corners.map(([x, y]) => `${x},${y}`).join(" ");
}

/** @param {number} a @param {number} b @param {number} x */
function smoothstep(a, b, x) {
  if (b <= a) return x >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
