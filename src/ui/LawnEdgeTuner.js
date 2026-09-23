/**
 * LawnEdgeTuner — live bust-lawn noise coverage knobs.
 *
 * Usage:
 *   Press  Shift+L  to toggle open/closed.
 *   Sliders → window.__stage.setLawnEdgeParams().
 *   FINALIZE → POST /__lawn_edge_finalize → patches lawnEdgeConfig.js.
 *
 * Does not touch fog, glitch, or bust mesh.
 *
 * localStorage key: "lawn-edge-tuner-history-v2"
 */

import {
  LAWN_EDGE_PARAM_SCHEMA,
  createLawnEdgeParams
} from "../scene/vignettes/lawnEdgeConfig.js";

const STORAGE_KEY = "lawn-edge-tuner-history-v2";
const MAX_HISTORY = 30;

/** @param {string} _key @param {number} v */
function fmt(_key, v) {
  if (Math.abs(v) >= 10) return v.toFixed(1);
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

/** @param {string} s */
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export class LawnEdgeTuner {
  /** @type {Record<string, number>} */
  _params = createLawnEdgeParams();
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
    window.__lawnEdgeTuner = this;
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
    const btn = this._panel.querySelector("#le-save");
    btn.textContent = "SAVED ✓";
    btn.classList.add("le-btn--saved");
    setTimeout(() => {
      btn.textContent = "SAVE";
      btn.classList.remove("le-btn--saved");
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
        `Write these lawn-edge params into lawnEdgeConfig.js as production defaults?\n\nLabel: ${label}`
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/__lawn_edge_finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, params })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      this._flashMsg(
        `FINALIZED → lawnEdgeConfig.js (${data.updated?.length ?? 0} keys). Hard-refresh to load new defaults.`,
        5000
      );
      console.info("[LawnEdgeTuner] finalized", data);
    } catch (err) {
      this._flashMsg(`Finalize failed: ${err.message} (dev server only)`, 5000);
      console.error("[LawnEdgeTuner] finalize failed", err);
    }
  }

  /**
   * @param {Record<string, number>} params
   * @param {string} [_reason]
   */
  _applyParams(params, _reason) {
    this._params = { ...createLawnEdgeParams(), ...params };
    this._syncSlidersToParams();
    this._pushToStage();
  }

  _pushToStage() {
    window.__stage?.setLawnEdgeParams?.(this._params);
  }

  _buildToggleBtn() {
    const btn = document.createElement("button");
    btn.id = "lawn-edge-tuner-toggle";
    btn.title = "Lawn Edge Tuner (Shift+L)";
    btn.setAttribute("aria-label", "Toggle lawn edge tuner");
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M2 11c2-3 3-5 5.5-5S11 8 13 11" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <circle cx="4" cy="7" r="1.1" fill="currentColor"/>
      <circle cx="7.5" cy="5" r="1.2" fill="currentColor"/>
      <circle cx="11" cy="7.5" r="1" fill="currentColor"/>
    </svg>`;
    btn.addEventListener("click", () => this.toggle());
    document.body.appendChild(btn);
    this._toggleBtn = btn;
  }

  _buildPanel() {
    const panel = document.createElement("div");
    panel.id = "lawn-edge-tuner-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Lawn edge tuner");

    panel.innerHTML = `
      <div class="le-header">
        <span class="le-title">LAWN EDGE</span>
        <div class="le-actions">
          <button class="le-btn le-btn--ghost" id="le-reset" title="Reset to lawnEdgeConfig.js defaults">RESET</button>
          <button class="le-btn le-btn--ghost" id="le-undo" title="Load most-recent save">UNDO</button>
          <button class="le-btn le-btn--ghost" id="le-copy" title="Copy params as JSON">COPY</button>
          <button class="le-btn le-btn--finalize" id="le-finalize" title="Write current sliders into lawnEdgeConfig.js">FINALIZE</button>
          <button class="le-btn le-btn--primary" id="le-save">SAVE</button>
          <button class="le-close" aria-label="Close panel">×</button>
        </div>
      </div>

      <div id="le-flash" class="le-flash" hidden></div>
      <p class="le-hint">size · length · density · tufts · breeze · coverage · Shift+L</p>
      <div id="le-sliders" class="le-sliders"></div>

      <div class="le-history-wrap">
        <div class="le-history-header">
          <span class="le-section-label">HISTORY</span>
          <button class="le-btn le-btn--ghost le-btn--sm le-btn--danger" id="le-clear">CLEAR ALL</button>
        </div>
        <div id="le-history-list" class="le-history-list"></div>
      </div>
    `;

    document.body.appendChild(panel);
    this._panel = panel;

    panel.querySelector("#le-reset").addEventListener("click", () => {
      this._applyParams(createLawnEdgeParams(), "reset");
      this._flashMsg("Reset to lawnEdgeConfig.js defaults");
    });
    panel.querySelector("#le-undo").addEventListener("click", () => this.undo());
    panel.querySelector("#le-save").addEventListener("click", () => {
      const label = window.prompt("Label this snapshot (optional):", "");
      if (label !== null) this.save(label);
    });
    panel.querySelector("#le-copy").addEventListener("click", () => this._copyJSON());
    panel.querySelector("#le-finalize").addEventListener("click", () => {
      this.finalize(this._params, "current");
    });
    panel.querySelector(".le-close").addEventListener("click", () => this.close());
    panel.querySelector("#le-clear").addEventListener("click", () => {
      if (confirm("Delete all lawn-edge tuner history?")) {
        this._saveToStorage([]);
        this._renderHistory();
      }
    });

    this._buildSliders();
    this._renderHistory();
  }

  _buildSliders() {
    const container = this._panel.querySelector("#le-sliders");
    for (const spec of LAWN_EDGE_PARAM_SCHEMA) {
      const row = document.createElement("div");
      row.className = "le-row";
      if (spec.hint) row.title = spec.hint;

      const id = `le-p-${spec.key}`;
      const labelEl = document.createElement("label");
      labelEl.htmlFor = id;
      labelEl.textContent = spec.label;

      const input = document.createElement("input");
      input.type = "range";
      input.id = id;
      input.min = String(spec.min);
      const softMax =
        spec.max == null ? (spec.softMax ?? Math.max(spec.default * 4, 4)) : spec.max;
      input.max = String(softMax);
      input.step = String(spec.step);
      input.value = String(this._params[spec.key]);
      input.dataset.unbounded = spec.max == null ? "1" : "0";

      const out = document.createElement("output");
      out.htmlFor = id;
      out.textContent = fmt(spec.key, this._params[spec.key]);

      input.addEventListener("input", () => {
        let v = Number(input.value);
        // Unbounded: grow the range track when the thumb hits the end
        if (input.dataset.unbounded === "1") {
          const curMax = Number(input.max);
          if (v >= curMax - Number(input.step) * 0.5) {
            const nextMax = Math.max(curMax * 1.5, v + Number(input.step) * 10);
            input.max = String(nextMax);
          }
        }
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
    for (const spec of LAWN_EDGE_PARAM_SCHEMA) {
      const input = this._inputMap[spec.key];
      if (!input) continue;
      const v = this._params[spec.key];
      if (spec.max == null && v > Number(input.max)) {
        input.max = String(Math.max(v * 1.25, Number(input.max) * 1.5));
      }
      input.value = String(v);
      const out = this._outputMap[spec.key];
      if (out) out.textContent = fmt(spec.key, v);
    }
  }

  _renderHistory() {
    const list = this._panel?.querySelector("#le-history-list");
    if (!list) return;
    const history = this._loadHistory();

    if (history.length === 0) {
      list.innerHTML = `<div class="le-history-empty">No saves yet — hit SAVE to snapshot</div>`;
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
      row.className = "le-history-row";
      row.innerHTML = `
        <div class="le-history-meta">
          <span class="le-history-label">${esc(label)}</span>
          <span class="le-history-time">${date} ${time}</span>
        </div>
        <div class="le-history-btns">
          <button class="le-btn le-btn--primary le-btn--sm" data-act="load">LOAD</button>
          <button class="le-btn le-btn--finalize le-btn--sm" data-act="finalize" title="Write this snapshot into lawnEdgeConfig.js">FINALIZE</button>
          <button class="le-btn le-btn--ghost le-btn--sm le-btn--danger" data-act="del">×</button>
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
    console.log("[LawnEdgeTuner] current params:", json);
  }

  /** @param {string} msg @param {number} [durationMs] */
  _flashMsg(msg, durationMs = 2500) {
    const el = this._panel.querySelector("#le-flash");
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
    const live = window.__stage?.getLawnEdgeParams?.();
    if (live) {
      this._params = { ...createLawnEdgeParams(), ...live };
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
      if (e.key === "L" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        this.toggle();
      }
    });
  }

  _injectStyles() {
    if (document.getElementById("lawn-edge-tuner-styles")) return;
    const style = document.createElement("style");
    style.id = "lawn-edge-tuner-styles";
    style.textContent = LAWN_EDGE_TUNER_CSS;
    document.head.appendChild(style);
  }
}

const LAWN_EDGE_TUNER_CSS = `
#lawn-edge-tuner-toggle {
  position: fixed;
  top: 188px;
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
#lawn-edge-tuner-toggle:hover {
  border-color: rgba(140,200,90,0.55);
  color: #b4e070;
  background: rgba(8,8,10,0.92);
}
#lawn-edge-tuner-toggle.is-active {
  border-color: #b4e070;
  color: #b4e070;
  background: rgba(40,70,20,0.45);
}

#lawn-edge-tuner-panel {
  position: fixed;
  bottom: 12px;
  left: 12px;
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
  box-shadow: 0 4px 32px rgba(40,80,10,0.35), 0 1px 4px rgba(0,0,0,0.6);
}

.le-header {
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
.le-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #b4e070;
  white-space: nowrap;
}
.le-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.le-hint {
  margin: 0;
  padding: 6px 13px 0;
  font-size: 9.5px;
  color: #666;
  line-height: 1.35;
}

.le-btn {
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
.le-btn--ghost {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.18);
  color: #999;
}
.le-btn--ghost:hover {
  border-color: rgba(255,255,255,0.36);
  color: #fff;
}
.le-btn--primary {
  background: rgba(180,224,112,0.12);
  border: 1px solid rgba(180,224,112,0.38);
  color: #b4e070;
}
.le-btn--primary:hover {
  background: rgba(180,224,112,0.24);
  border-color: rgba(180,224,112,0.65);
}
.le-btn--finalize {
  background: rgba(100,220,140,0.12);
  border: 1px solid rgba(100,220,140,0.38);
  color: #88e88a;
}
.le-btn--finalize:hover {
  background: rgba(100,220,140,0.24);
  border-color: rgba(100,220,140,0.65);
}
.le-btn--saved {
  background: rgba(100,220,100,0.14) !important;
  border-color: rgba(100,220,100,0.45) !important;
  color: #88e88a !important;
}
.le-btn--sm { font-size: 8.5px; padding: 3px 5px; }
.le-btn--danger { color: #e06060; border-color: rgba(224,96,96,0.2); }
.le-btn--danger:hover {
  background: rgba(224,96,96,0.12);
  border-color: rgba(224,96,96,0.5);
  color: #f88;
}
.le-close {
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
.le-close:hover { color: #ccc; }

.le-flash {
  padding: 6px 13px;
  font-size: 10px;
  color: #b4e070;
  background: rgba(40,70,20,0.4);
  border-bottom: 1px solid rgba(180,224,112,0.2);
}

.le-sliders {
  padding: 10px 13px 12px;
  display: grid;
  gap: 7px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.le-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 6px;
  align-items: center;
}
.le-row label {
  grid-column: 1 / -1;
  color: #777;
  font-size: 9.5px;
  letter-spacing: 0.03em;
}
.le-row input[type="range"] {
  width: 100%;
  cursor: pointer;
  accent-color: #b4e070;
  height: 14px;
}
.le-row output {
  min-width: 4.5ch;
  text-align: right;
  color: #e8e8e8;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.le-history-wrap { padding: 9px 13px 13px; }
.le-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
}
.le-section-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #555;
}
.le-history-list {
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
  padding-right: 2px;
}
.le-history-empty {
  color: #444;
  font-size: 10px;
  line-height: 1.5;
  padding: 3px 0;
}
.le-history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 3px;
  background: rgba(255,255,255,0.025);
}
.le-history-row:hover {
  background: rgba(255,255,255,0.045);
  border-color: rgba(255,255,255,0.12);
}
.le-history-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.le-history-label {
  color: #ccc;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.le-history-time { color: #555; font-size: 9px; }
.le-history-btns { display: flex; gap: 4px; flex-shrink: 0; }
`;
