/**
 * WaterCursorRimTuner — live surface-tension RESPONSE curves (blob only).
 *
 * Usage:
 *   Press  Shift+C  to toggle open/closed.
 *   Sliders apply immediately via window.__stage.setWaterCursorRimParams().
 *   SAVE / UNDO / RESET / COPY / FINALIZE — same pattern as EdgeGlitchTuner.
 *   FINALIZE → POST /__water_cursor_rim_finalize → patches waterCursorRimConfig.js.
 *
 * Glitch pass / ARM_OUTER / EdgeGlitchTuner are untouched.
 *
 * localStorage key: "water-cursor-rim-tuner-history-v1"
 */

import {
  WATER_CURSOR_RIM_PARAM_SCHEMA,
  createWaterCursorRimParams
} from "../cursor/waterCursorRimConfig.js";

const STORAGE_KEY = "water-cursor-rim-tuner-history-v1";
const MAX_HISTORY = 30;

/** @param {string} key @param {number} v */
function fmt(key, v) {
  if (key === "blowExponent" || key === "neckPinch") return v.toFixed(2);
  if (key === "recoilPushPx") return v.toFixed(1);
  return v.toFixed(3);
}

/** @param {string} s */
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export class WaterCursorRimTuner {
  /** @type {Record<string, number>} */
  _params = createWaterCursorRimParams();
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
    window.__waterCursorRimTuner = this;
  }

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

  /** @param {string} [label] */
  save(label = "") {
    const history = this._loadHistory();
    history.unshift({ ts: Date.now(), label: label.trim(), params: { ...this._params } });
    this._saveToStorage(history);
    this._renderHistory();
    const btn = this._panel.querySelector("#wcr-save");
    btn.textContent = "SAVED ✓";
    btn.classList.add("wcr-btn--saved");
    setTimeout(() => {
      btn.textContent = "SAVE";
      btn.classList.remove("wcr-btn--saved");
    }, 1600);
  }

  undo() {
    const history = this._loadHistory();
    if (history.length === 0) {
      this._flashMsg("No history yet — nothing to undo");
      return;
    }
    this._applyParams({ ...history[0].params }, "undo");
  }

  /**
   * @param {Record<string, number>} [params]
   * @param {string} [label]
   */
  async finalize(params = this._params, label = "finalize") {
    if (
      !confirm(
        `Write these water-cursor rim params into waterCursorRimConfig.js as production defaults?\n\nLabel: ${label}`
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/__water_cursor_rim_finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, params })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      this._flashMsg(
        `FINALIZED → waterCursorRimConfig.js (${data.updated?.length ?? 0} keys). Hard-refresh to load new defaults.`,
        5000
      );
      console.info("[WaterCursorRimTuner] finalized", data);
    } catch (err) {
      this._flashMsg(`Finalize failed: ${err.message} (dev server only)`, 5000);
      console.error("[WaterCursorRimTuner] finalize failed", err);
    }
  }

  /**
   * @param {Record<string, number>} params
   * @param {string} [_reason]
   */
  _applyParams(params, _reason) {
    this._params = { ...createWaterCursorRimParams(), ...params };
    this._syncSlidersToParams();
    this._pushToStage();
  }

  _pushToStage() {
    window.__stage?.setWaterCursorRimParams?.(this._params);
  }

  _buildToggleBtn() {
    const btn = document.createElement("button");
    btn.id = "water-cursor-rim-tuner-toggle";
    btn.title = "Water Cursor Rim Tuner (Shift+C)";
    btn.setAttribute("aria-label", "Toggle water cursor rim tuner");
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <circle cx="7.5" cy="7.5" r="4.2" stroke="currentColor" stroke-width="1.4"/>
      <path d="M11.5 3.5c1.2 1.4 1.2 3.6 0 5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    </svg>`;
    btn.addEventListener("click", () => this.toggle());
    document.body.appendChild(btn);
    this._toggleBtn = btn;
  }

  _buildPanel() {
    const panel = document.createElement("div");
    panel.id = "water-cursor-rim-tuner-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Water cursor rim tuner");

    panel.innerHTML = `
      <div class="wcr-header">
        <span class="wcr-title">CURSOR RIM</span>
        <div class="wcr-actions">
          <button class="wcr-btn wcr-btn--ghost" id="wcr-reset" title="Reset to rim config defaults">RESET</button>
          <button class="wcr-btn wcr-btn--ghost" id="wcr-undo" title="Load most-recent save">UNDO</button>
          <button class="wcr-btn wcr-btn--ghost" id="wcr-copy" title="Copy params as JSON">COPY</button>
          <button class="wcr-btn wcr-btn--finalize" id="wcr-finalize" title="Write current sliders into waterCursorRimConfig.js">FINALIZE</button>
          <button class="wcr-btn wcr-btn--primary" id="wcr-save">SAVE</button>
          <button class="wcr-close" aria-label="Close panel">×</button>
        </div>
      </div>

      <div id="wcr-flash" class="wcr-flash" hidden></div>
      <p class="wcr-hint">blob response only · glitch / ARM_OUTER unchanged · Shift+C</p>
      <div id="wcr-sliders" class="wcr-sliders"></div>

      <div class="wcr-history-wrap">
        <div class="wcr-history-header">
          <span class="wcr-section-label">HISTORY</span>
          <button class="wcr-btn wcr-btn--ghost wcr-btn--sm wcr-btn--danger" id="wcr-clear">CLEAR ALL</button>
        </div>
        <div id="wcr-history-list" class="wcr-history-list"></div>
      </div>
    `;

    document.body.appendChild(panel);
    this._panel = panel;

    panel.querySelector("#wcr-reset").addEventListener("click", () => {
      this._applyParams(createWaterCursorRimParams(), "reset");
      this._flashMsg("Reset to waterCursorRimConfig.js defaults");
    });
    panel.querySelector("#wcr-undo").addEventListener("click", () => this.undo());
    panel.querySelector("#wcr-save").addEventListener("click", () => {
      const label = window.prompt("Label this snapshot (optional):", "");
      if (label !== null) this.save(label);
    });
    panel.querySelector("#wcr-copy").addEventListener("click", () => this._copyJSON());
    panel.querySelector("#wcr-finalize").addEventListener("click", () => {
      this.finalize(this._params, "current");
    });
    panel.querySelector(".wcr-close").addEventListener("click", () => this.close());
    panel.querySelector("#wcr-clear").addEventListener("click", () => {
      if (confirm("Delete all water-cursor rim tuner history?")) {
        this._saveToStorage([]);
        this._renderHistory();
      }
    });

    this._buildSliders();
    this._renderHistory();
  }

  _buildSliders() {
    const container = this._panel.querySelector("#wcr-sliders");
    for (const spec of WATER_CURSOR_RIM_PARAM_SCHEMA) {
      const row = document.createElement("div");
      row.className = "wcr-row";
      if (spec.hint) row.title = spec.hint;

      const id = `wcr-p-${spec.key}`;
      const labelEl = document.createElement("label");
      labelEl.htmlFor = id;
      labelEl.textContent = spec.label;

      const input = document.createElement("input");
      input.type = "range";
      input.id = id;
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.value = String(this._params[spec.key]);

      const out = document.createElement("output");
      out.htmlFor = id;
      out.textContent = fmt(spec.key, this._params[spec.key]);

      input.addEventListener("input", () => {
        const v = Number(input.value);
        this._params[spec.key] = v;
        out.textContent = fmt(spec.key, v);
        this._pushToStage();
      });

      this._inputMap[spec.key] = input;
      this._outputMap[spec.key] = out;
      row.append(labelEl, input, out);
      container.appendChild(row);
    }
  }

  _syncSlidersToParams() {
    for (const spec of WATER_CURSOR_RIM_PARAM_SCHEMA) {
      const input = this._inputMap[spec.key];
      if (!input) continue;
      const v = this._params[spec.key];
      input.value = String(v);
      const out = this._outputMap[spec.key];
      if (out) out.textContent = fmt(spec.key, v);
    }
  }

  _renderHistory() {
    const list = this._panel?.querySelector("#wcr-history-list");
    if (!list) return;
    const history = this._loadHistory();

    if (history.length === 0) {
      list.innerHTML = `<div class="wcr-history-empty">No saves yet — hit SAVE to snapshot</div>`;
      return;
    }

    list.innerHTML = "";
    history.forEach((entry, i) => {
      const d = new Date(entry.ts);
      const time = d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
      const label = entry.label || `snapshot ${history.length - i}`;

      const row = document.createElement("div");
      row.className = "wcr-history-row";
      row.innerHTML = `
        <div class="wcr-history-meta">
          <span class="wcr-history-label">${esc(label)}</span>
          <span class="wcr-history-time">${date} ${time}</span>
        </div>
        <div class="wcr-history-btns">
          <button class="wcr-btn wcr-btn--primary wcr-btn--sm" data-act="load">LOAD</button>
          <button class="wcr-btn wcr-btn--finalize wcr-btn--sm" data-act="finalize" title="Write this snapshot into rim config">FINALIZE</button>
          <button class="wcr-btn wcr-btn--ghost wcr-btn--sm wcr-btn--danger" data-act="del">×</button>
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

  _copyJSON() {
    const json = JSON.stringify(this._params, null, 2);
    navigator.clipboard.writeText(json).then(
      () => this._flashMsg("Copied JSON to clipboard"),
      () => this._flashMsg("Clipboard unavailable — check console")
    );
    console.log("[WaterCursorRimTuner] current params:", json);
  }

  /** @param {string} msg @param {number} [durationMs] */
  _flashMsg(msg, durationMs = 2500) {
    const el = this._panel.querySelector("#wcr-flash");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      el.hidden = true;
    }, durationMs);
  }

  toggle() {
    this._open ? this.close() : this.open();
  }

  open() {
    this._open = true;
    this._panel.hidden = false;
    this._toggleBtn.classList.add("is-active");
    const live = window.__stage?.getWaterCursorRimParams?.();
    if (live) {
      this._params = { ...createWaterCursorRimParams(), ...live };
      this._syncSlidersToParams();
    }
    this._renderHistory();
  }

  close() {
    this._open = false;
    this._panel.hidden = true;
    this._toggleBtn.classList.remove("is-active");
  }

  _bindKeys() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "C" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        this.toggle();
      }
    });
  }

  _injectStyles() {
    if (document.getElementById("water-cursor-rim-tuner-styles")) return;
    const style = document.createElement("style");
    style.id = "water-cursor-rim-tuner-styles";
    style.textContent = WATER_CURSOR_RIM_TUNER_CSS;
    document.head.appendChild(style);
  }
}

const WATER_CURSOR_RIM_TUNER_CSS = `
#water-cursor-rim-tuner-toggle {
  position: fixed;
  bottom: 152px;
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
#water-cursor-rim-tuner-toggle:hover {
  border-color: rgba(140,220,255,0.55);
  color: #9ad4ff;
  background: rgba(8,8,10,0.92);
}
#water-cursor-rim-tuner-toggle.is-active {
  border-color: #9ad4ff;
  color: #9ad4ff;
  background: rgba(20,50,80,0.45);
}

#water-cursor-rim-tuner-panel {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
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
  box-shadow: 0 4px 32px rgba(20,60,100,0.4), 0 1px 4px rgba(0,0,0,0.6);
}

.wcr-header {
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
.wcr-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #9ad4ff;
  white-space: nowrap;
}
.wcr-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.wcr-hint {
  margin: 0;
  padding: 6px 13px 0;
  font-size: 9.5px;
  color: #666;
  line-height: 1.35;
}

.wcr-btn {
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
.wcr-btn--ghost {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.18);
  color: #999;
}
.wcr-btn--ghost:hover {
  border-color: rgba(255,255,255,0.36);
  color: #fff;
}
.wcr-btn--primary {
  background: rgba(154,212,255,0.12);
  border: 1px solid rgba(154,212,255,0.38);
  color: #9ad4ff;
}
.wcr-btn--primary:hover {
  background: rgba(154,212,255,0.24);
  border-color: rgba(154,212,255,0.65);
}
.wcr-btn--finalize {
  background: rgba(100,220,140,0.12);
  border: 1px solid rgba(100,220,140,0.38);
  color: #88e88a;
}
.wcr-btn--finalize:hover {
  background: rgba(100,220,140,0.24);
  border-color: rgba(100,220,140,0.65);
}
.wcr-btn--saved {
  background: rgba(100,220,100,0.14) !important;
  border-color: rgba(100,220,100,0.45) !important;
  color: #88e88a !important;
}
.wcr-btn--sm { font-size: 8.5px; padding: 3px 5px; }
.wcr-btn--danger { color: #e06060; border-color: rgba(224,96,96,0.2); }
.wcr-btn--danger:hover {
  background: rgba(224,96,96,0.12);
  border-color: rgba(224,96,96,0.5);
  color: #f88;
}
.wcr-close {
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
.wcr-close:hover { color: #ccc; }

.wcr-flash {
  padding: 6px 13px;
  font-size: 10px;
  color: #9ad4ff;
  background: rgba(20,50,80,0.4);
  border-bottom: 1px solid rgba(154,212,255,0.2);
}

.wcr-sliders {
  padding: 10px 13px 12px;
  display: grid;
  gap: 7px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.wcr-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 6px;
  align-items: center;
}
.wcr-row label {
  grid-column: 1 / -1;
  color: #777;
  font-size: 9.5px;
  letter-spacing: 0.03em;
}
.wcr-row input[type="range"] {
  width: 100%;
  cursor: pointer;
  accent-color: #9ad4ff;
  height: 14px;
}
.wcr-row output {
  min-width: 4.5ch;
  text-align: right;
  color: #e8e8e8;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.wcr-history-wrap { padding: 9px 13px 13px; }
.wcr-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
}
.wcr-section-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #555;
}
.wcr-history-list {
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
  padding-right: 2px;
}
.wcr-history-empty {
  color: #444;
  font-size: 10px;
  line-height: 1.5;
  padding: 3px 0;
}
.wcr-history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 3px;
  background: rgba(255,255,255,0.025);
}
.wcr-history-row:hover {
  background: rgba(255,255,255,0.045);
  border-color: rgba(255,255,255,0.12);
}
.wcr-history-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.wcr-history-label {
  color: #ccc;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wcr-history-time { color: #555; font-size: 9px; }
.wcr-history-btns { display: flex; gap: 4px; flex-shrink: 0; }
`;
