/**
 * FogTuner — live fog parameter panel embedded in the main stage.
 *
 * Usage:
 *   Press  Shift+F  to toggle open/closed (works any time after boot).
 *   Sliders apply immediately to window.__stage.setVolumetricParams().
 *   SAVE     → persists a named snapshot to localStorage (history).
 *   UNDO     → reverts working sliders to the most-recent saved snapshot.
 *   RESET    → reverts working sliders to FOG_DEFAULTS.
 *   COPY     → copies current params as JSON to clipboard.
 *   FINALIZE → writes current (or a history row's) params into
 *              src/fog/fogConfig.js as production FOG_DEFAULTS (dev server only).
 *   Each history row has LOAD, FINALIZE, and × (delete) buttons.
 *
 * localStorage key: "fog-tuner-history-v1"  (up to MAX_HISTORY snapshots)
 */

import { FOG_PARAM_SCHEMA, FOG_DEFAULTS, createFogParams } from "../fog/fogConfig.js";

/** Keys shown at the top of the slider list. */
const PRIORITY = [
  "fogDensityMultiplier",
  "noisePow",
  "noiseSpeed",
  "heightFogExpK",
  "heightFogHazeStartY",
  "heightFogHazeFloor",
  "outputDither",
  "falloffCeilingJitter",
  "noiseMovementX",
  "noiseMovementY",
];

/** Friendlier display names. */
const LABELS = {
  fogDensityMultiplier:   "density",
  noisePow:               "noise pow",
  noiseSpeed:             "travel speed",
  heightFogExpK:          "exp falloff k",
  heightFogHazeStartY:    "haze start Y",
  heightFogHazeRangeY:    "haze range Y",
  heightFogHazeFloor:     "haze floor",
  outputDither:           "output dither",
  falloffCeilingJitter:   "ceiling jitter",
  falloffNoiseWarp:       "noise warp",
  noiseMovementX:         "wind X",
  noiseMovementY:         "wind Z",
  noiseYScroll:           "Y scroll",
  fogFloorFadeRangeY:     "floor fade range",
  heightFogFactor:        "height fog factor",
  baseRaymarchStepCount:  "ray steps",
  baseMaxRayLength:       "ray length",
  globalScale:            "global scale",
  halfRes:                "half-res",
  noiseBias:              "noise bias",
  fogFadeOutRangeY:       "fade-out range",
  fogFadeOutPow:          "fade-out pow",
  fogMaxY:                "fog max Y",
  fogMinY:                "fog min Y",
};

const STORAGE_KEY = "fog-tuner-history-v1";
const MAX_HISTORY = 30;

/** Format a numeric fog param value for display. */
function fmt(key, v) {
  if (key === "baseRaymarchStepCount" || key === "baseMaxRayLength") return String(Math.round(v));
  if (Math.abs(v) < 0.01 || Math.abs(v) >= 100) return v.toFixed(3);
  if (Math.abs(v) >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

/** Escape HTML special chars for safe innerHTML. */
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export class FogTuner {
  /** @type {Record<string, number|boolean>} mutable working copy of params */
  _params = createFogParams();
  _open = false;
  /** @type {Record<string, HTMLInputElement>} */
  _inputMap = {};
  /** @type {Record<string, HTMLOutputElement>} */
  _outputMap = {};

  constructor() {
    this._injectStyles();
    this._buildToggleBtn();
    this._buildPanel();
    this._bindKeys();
    window.__fogTuner = this;
  }

  // ─── History ────────────────────────────────────────────────────────────────

  _loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  _saveToStorage(history) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  }

  /**
   * Push current working params to history.
   * @param {string} [label]
   */
  save(label = "") {
    const history = this._loadHistory();
    history.unshift({ ts: Date.now(), label: label.trim(), params: { ...this._params } });
    this._saveToStorage(history);
    this._renderHistory();
    // Flash the save button
    const btn = this._panel.querySelector("#ft-save");
    btn.textContent = "SAVED ✓";
    btn.classList.add("ft-btn--saved");
    setTimeout(() => {
      btn.textContent = "SAVE";
      btn.classList.remove("ft-btn--saved");
    }, 1600);
  }

  /** Revert working params to the most-recent saved snapshot. */
  undo() {
    const history = this._loadHistory();
    if (history.length === 0) {
      this._flashMsg("No history yet — nothing to undo");
      return;
    }
    this._applyParams({ ...history[0].params }, "undo");
  }

  /**
   * Write params into src/fog/fogConfig.js as production FOG_DEFAULTS.
   * Requires Vite dev middleware at POST /__fog_finalize.
   * @param {Record<string, number|boolean>} [params]
   * @param {string} [label]
   */
  async finalize(params = this._params, label = "finalize") {
    if (!confirm(`Write these fog params into fogConfig.js as production defaults?\n\nLabel: ${label}`)) {
      return;
    }
    try {
      const res = await fetch("/__fog_finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, params })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      this._flashMsg(
        `FINALIZED → fogConfig.js (${data.updated?.length ?? 0} keys). Hard-refresh to load new defaults.`,
        5000
      );
      console.info("[FogTuner] finalized", data);
    } catch (err) {
      this._flashMsg(`Finalize failed: ${err.message} (dev server only)`, 5000);
      console.error("[FogTuner] finalize failed", err);
    }
  }

  // ─── Param application ──────────────────────────────────────────────────────

  /**
   * Set working params, sync sliders, push to stage.
   * @param {Record<string, number|boolean>} params  full params object
   * @param {string} [_reason]  optional debug tag
   */
  _applyParams(params, _reason) {
    this._params = { ...params };
    this._syncSlidersToParams();
    this._pushToStage();
  }

  _pushToStage() {
    window.__stage?.setVolumetricParams?.(this._params);
  }

  // ─── Panel construction ──────────────────────────────────────────────────────

  _buildToggleBtn() {
    const btn = document.createElement("button");
    btn.id = "fog-tuner-toggle";
    btn.title = "Fog Tuner (Shift+F)";
    btn.setAttribute("aria-label", "Toggle fog tuner");
    // Sliders icon
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <rect x="1" y="2.5" width="13" height="1.2" rx="0.6" fill="currentColor"/>
      <circle cx="5" cy="3.1" r="1.5" fill="currentColor"/>
      <rect x="1" y="7" width="13" height="1.2" rx="0.6" fill="currentColor"/>
      <circle cx="10" cy="7.6" r="1.5" fill="currentColor"/>
      <rect x="1" y="11.5" width="13" height="1.2" rx="0.6" fill="currentColor"/>
      <circle cx="6" cy="12.1" r="1.5" fill="currentColor"/>
    </svg>`;
    btn.addEventListener("click", () => this.toggle());
    document.body.appendChild(btn);
    this._toggleBtn = btn;
  }

  _buildPanel() {
    const panel = document.createElement("div");
    panel.id = "fog-tuner-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Fog tuner");

    panel.innerHTML = `
      <div class="ft-header">
        <span class="ft-title">FOG TUNER</span>
        <div class="ft-actions">
          <button class="ft-btn ft-btn--ghost" id="ft-reset" title="Reset to FOG_DEFAULTS">RESET</button>
          <button class="ft-btn ft-btn--ghost" id="ft-undo" title="Load most-recent save">UNDO</button>
          <button class="ft-btn ft-btn--ghost" id="ft-copy" title="Copy params as JSON">COPY</button>
          <button class="ft-btn ft-btn--finalize" id="ft-finalize" title="Write current sliders into fogConfig.js as production defaults">FINALIZE</button>
          <button class="ft-btn ft-btn--primary" id="ft-save">SAVE</button>
          <button class="ft-close" aria-label="Close panel">×</button>
        </div>
      </div>

      <div id="ft-flash" class="ft-flash" hidden></div>

      <div id="ft-sliders" class="ft-sliders"></div>

      <div class="ft-history-wrap">
        <div class="ft-history-header">
          <span class="ft-section-label">HISTORY</span>
          <button class="ft-btn ft-btn--ghost ft-btn--sm ft-btn--danger" id="ft-clear">CLEAR ALL</button>
        </div>
        <div id="ft-history-list" class="ft-history-list"></div>
      </div>
    `;

    document.body.appendChild(panel);
    this._panel = panel;

    // Header button wiring
    panel.querySelector("#ft-reset").addEventListener("click", () => {
      this._applyParams(createFogParams(), "reset");
      this._flashMsg("Reset to FOG_DEFAULTS");
    });
    panel.querySelector("#ft-undo").addEventListener("click", () => this.undo());
    panel.querySelector("#ft-save").addEventListener("click", () => {
      const label = this._promptLabel();
      if (label !== null) this.save(label);
    });
    panel.querySelector("#ft-copy").addEventListener("click", () => this._copyJSON());
    panel.querySelector("#ft-finalize").addEventListener("click", () => {
      this.finalize(this._params, "current");
    });
    panel.querySelector(".ft-close").addEventListener("click", () => this.close());
    panel.querySelector("#ft-clear").addEventListener("click", () => {
      if (confirm("Delete all fog tuner history?")) {
        this._saveToStorage([]);
        this._renderHistory();
      }
    });

    this._buildSliders();
    this._renderHistory();
  }

  _buildSliders() {
    const container = this._panel.querySelector("#ft-sliders");

    // Sort: priority first, then alpha
    const sorted = [...FOG_PARAM_SCHEMA].sort((a, b) => {
      const ia = PRIORITY.indexOf(a.key), ib = PRIORITY.indexOf(b.key);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.key.localeCompare(b.key);
    });

    for (const spec of sorted) {
      const row = document.createElement("div");
      row.className = spec.type === "boolean" ? "ft-row ft-row--check" : "ft-row";

      const id = `ft-p-${spec.key}`;
      const labelEl = document.createElement("label");
      labelEl.htmlFor = id;
      labelEl.textContent = LABELS[spec.key] ?? spec.key;

      if (spec.type === "boolean") {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = id;
        input.checked = Boolean(this._params[spec.key]);
        input.addEventListener("change", () => {
          this._params[spec.key] = input.checked;
          this._pushToStage();
        });
        this._inputMap[spec.key] = input;
        row.append(input, labelEl);
      } else {
        const input = document.createElement("input");
        input.type = "range";
        input.id = id;
        input.min = String(spec.min ?? 0);
        input.max = String(spec.max ?? 1);
        input.step = String(spec.step ?? 0.01);
        input.value = String(this._params[spec.key]);

        const out = document.createElement("output");
        out.htmlFor = id;
        out.textContent = fmt(spec.key, /** @type {number} */ (this._params[spec.key]));

        input.addEventListener("input", () => {
          const v = Number(input.value);
          this._params[spec.key] = v;
          out.textContent = fmt(spec.key, v);
          this._pushToStage();
        });

        this._inputMap[spec.key] = input;
        this._outputMap[spec.key] = out;
        row.append(labelEl, input, out);
      }

      container.appendChild(row);
    }
  }

  _syncSlidersToParams() {
    for (const spec of FOG_PARAM_SCHEMA) {
      const input = this._inputMap[spec.key];
      if (!input) continue;
      const v = this._params[spec.key];
      if (spec.type === "boolean") {
        input.checked = Boolean(v);
      } else {
        input.value = String(v);
        const out = this._outputMap[spec.key];
        if (out) out.textContent = fmt(spec.key, /** @type {number} */ (v));
      }
    }
  }

  // ─── History rendering ────────────────────────────────────────────────────

  _renderHistory() {
    const list = this._panel?.querySelector("#ft-history-list");
    if (!list) return;
    const history = this._loadHistory();

    if (history.length === 0) {
      list.innerHTML = `<div class="ft-history-empty">No saves yet — hit SAVE to snapshot current settings</div>`;
      return;
    }

    list.innerHTML = "";
    history.forEach((entry, i) => {
      const d = new Date(entry.ts);
      const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
      const label = entry.label || `snapshot ${history.length - i}`;

      const row = document.createElement("div");
      row.className = "ft-history-row";
      row.innerHTML = `
        <div class="ft-history-meta">
          <span class="ft-history-label">${esc(label)}</span>
          <span class="ft-history-time">${date} ${time}</span>
        </div>
        <div class="ft-history-btns">
          <button class="ft-btn ft-btn--primary ft-btn--sm" data-act="load">LOAD</button>
          <button class="ft-btn ft-btn--finalize ft-btn--sm" data-act="finalize" title="Write this snapshot into fogConfig.js">FINALIZE</button>
          <button class="ft-btn ft-btn--ghost ft-btn--sm ft-btn--danger" data-act="del">×</button>
        </div>
      `;

      row.querySelector('[data-act="load"]').addEventListener("click", () => {
        this._applyParams({ ...entry.params }, "history-load");
        this._flashMsg(`Loaded "${label}"`);
      });
      row.querySelector('[data-act="finalize"]').addEventListener("click", () => {
        this.finalize({ ...entry.params }, label);
      });
      row.querySelector('[data-act="del"]').addEventListener("click", () => {
        const h = this._loadHistory();
        h.splice(i, 1);
        this._saveToStorage(h);
        this._renderHistory();
      });

      list.appendChild(row);
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Inline label prompt — uses a small overlay input instead of window.prompt(). */
  _promptLabel() {
    // Simple approach: native prompt (synchronous, avoids extra DOM complexity).
    // Returns null if cancelled, "" if blank.
    return window.prompt("Label this snapshot (optional):", "");
  }

  _copyJSON() {
    const json = JSON.stringify(this._params, null, 2);
    navigator.clipboard.writeText(json).then(
      () => this._flashMsg("Copied JSON to clipboard"),
      () => this._flashMsg("Clipboard unavailable — check console"),
    );
    console.log("[FogTuner] current params:", JSON.stringify(this._params, null, 2));
  }

  _flashMsg(msg, durationMs = 2500) {
    const el = this._panel.querySelector("#ft-flash");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      el.hidden = true;
    }, durationMs);
  }

  // ─── Open / close / toggle ─────────────────────────────────────────────────

  toggle() {
    this._open ? this.close() : this.open();
  }

  open() {
    this._open = true;
    this._panel.hidden = false;
    this._toggleBtn.classList.add("is-active");
    this._renderHistory(); // refresh on every open
  }

  close() {
    this._open = false;
    this._panel.hidden = true;
    this._toggleBtn.classList.remove("is-active");
  }

  _bindKeys() {
    document.addEventListener("keydown", (e) => {
      // Shift+F — avoids collision with normal 'f' key usage on the page
      if (e.key === "F" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        this.toggle();
      }
    });
  }

  // ─── Styles ────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById("fog-tuner-styles")) return;
    const style = document.createElement("style");
    style.id = "fog-tuner-styles";
    style.textContent = FOG_TUNER_CSS;
    document.head.appendChild(style);
  }
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
// Scoped to #fog-tuner-* and .ft-* to avoid collisions with stage styles.

const FOG_TUNER_CSS = `
/* ── Toggle button ───────────────────────────────────────── */
#fog-tuner-toggle {
  position: fixed;
  bottom: 60px;
  right: 16px;
  z-index: 9000;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 4px;
  background: rgba(8,8,10,0.78);
  backdrop-filter: blur(6px);
  color: rgba(255,255,255,0.45);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color .15s, color .15s, background .15s;
}
#fog-tuner-toggle:hover {
  border-color: rgba(154,212,255,0.55);
  color: #9ad4ff;
  background: rgba(8,8,10,0.92);
}
#fog-tuner-toggle.is-active {
  border-color: #9ad4ff;
  color: #9ad4ff;
  background: rgba(0,60,90,0.45);
}

/* ── Panel shell ─────────────────────────────────────────── */
#fog-tuner-panel {
  position: fixed;
  top: 12px;
  right: 12px;
  width: min(320px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow: hidden auto;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  background: rgba(8,8,10,0.94);
  backdrop-filter: blur(14px);
  box-sizing: border-box;
  z-index: 9001;
  font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  font-size: 11px;
  color: #e0e0e0;
  /* Subtle blue shadow so it reads above the 3-D scene */
  box-shadow: 0 4px 32px rgba(0,60,100,0.45), 0 1px 4px rgba(0,0,0,0.6);
}

/* ── Header ──────────────────────────────────────────────── */
.ft-header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 11px 9px 13px;
  border-bottom: 1px solid rgba(255,255,255,0.09);
  background: rgba(8,8,10,0.97);
  z-index: 1;
  gap: 8px;
}

.ft-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #9ad4ff;
  white-space: nowrap;
}

.ft-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* ── Buttons ─────────────────────────────────────────────── */
.ft-btn {
  appearance: none;
  font-family: inherit;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.07em;
  padding: 4px 7px;
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
  transition: background .12s, border-color .12s, color .12s;
  line-height: 1.2;
}

.ft-btn--ghost {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.18);
  color: #999;
}
.ft-btn--ghost:hover {
  border-color: rgba(255,255,255,0.36);
  color: #fff;
}

.ft-btn--primary {
  background: rgba(154,212,255,0.12);
  border: 1px solid rgba(154,212,255,0.38);
  color: #9ad4ff;
}
.ft-btn--primary:hover {
  background: rgba(154,212,255,0.24);
  border-color: rgba(154,212,255,0.65);
}

.ft-btn--finalize {
  background: rgba(100,220,140,0.12);
  border: 1px solid rgba(100,220,140,0.38);
  color: #88e88a;
}
.ft-btn--finalize:hover {
  background: rgba(100,220,140,0.24);
  border-color: rgba(100,220,140,0.65);
}

.ft-btn--saved {
  background: rgba(100,220,100,0.14) !important;
  border-color: rgba(100,220,100,0.45) !important;
  color: #88e88a !important;
}

.ft-btn--sm {
  font-size: 8.5px;
  padding: 3px 5px;
}

.ft-btn--danger {
  color: #e06060;
  border-color: rgba(224,96,96,0.2);
}
.ft-btn--danger:hover {
  background: rgba(224,96,96,0.12);
  border-color: rgba(224,96,96,0.5);
  color: #f88;
}

.ft-close {
  appearance: none;
  background: none;
  border: none;
  color: #555;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  margin-left: 2px;
}
.ft-close:hover { color: #ccc; }

/* ── Flash message ───────────────────────────────────────── */
.ft-flash {
  padding: 6px 13px;
  font-size: 10px;
  color: #9ad4ff;
  background: rgba(0,80,120,0.35);
  border-bottom: 1px solid rgba(154,212,255,0.2);
}

/* ── Sliders area ────────────────────────────────────────── */
.ft-sliders {
  padding: 10px 13px 12px;
  display: grid;
  gap: 7px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}

.ft-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 6px;
  align-items: center;
}

.ft-row label {
  grid-column: 1 / -1;
  color: #777;
  font-size: 9.5px;
  letter-spacing: 0.03em;
}

.ft-row input[type="range"] {
  width: 100%;
  cursor: pointer;
  accent-color: #9ad4ff;
  height: 14px;
}

.ft-row output {
  min-width: 4.5ch;
  text-align: right;
  color: #e8e8e8;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.ft-row--check {
  grid-template-columns: auto 1fr;
  gap: 0 7px;
}
.ft-row--check label {
  grid-column: auto;
  color: #aaa;
  font-size: 10px;
}
.ft-row--check input[type="checkbox"] {
  accent-color: #9ad4ff;
  cursor: pointer;
  width: 12px;
  height: 12px;
}

/* ── History ─────────────────────────────────────────────── */
.ft-history-wrap {
  padding: 9px 13px 13px;
}

.ft-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
}

.ft-section-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #555;
}

.ft-history-list {
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
  /* subtle inset scroll region */
  padding-right: 2px;
}

.ft-history-empty {
  color: #444;
  font-size: 10px;
  line-height: 1.5;
  padding: 3px 0;
}

.ft-history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 3px;
  background: rgba(255,255,255,0.025);
}
.ft-history-row:hover {
  background: rgba(255,255,255,0.045);
  border-color: rgba(255,255,255,0.12);
}

.ft-history-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ft-history-label {
  color: #ccc;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ft-history-time {
  color: #555;
  font-size: 9px;
}

.ft-history-btns {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
`;
