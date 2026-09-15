/**
 * EdgeGlitchTuner — live edge-glitch knobs on the main stage.
 *
 * Usage:
 *   Press  Shift+G  to toggle open/closed.
 *   Sliders apply immediately via window.__stage.setEdgeGlitchParams().
 *   SAVE / UNDO / RESET / COPY / FINALIZE — same pattern as FogTuner.
 *   FINALIZE → POST /__edge_glitch_finalize → patches constants.js exports.
 *
 * Two sizes to feel apart:
 *   armOuter  = cursor→edge TRIGGER distance
 *   localBase / localGrowth = WIDTH of the glitched strip once armed
 *
 * localStorage key: "edge-glitch-tuner-history-v1"
 */

import {
  EDGE_GLITCH_PARAM_SCHEMA,
  createEdgeGlitchParams
} from "../scene/edgeGlitch/constants.js";

const STORAGE_KEY = "edge-glitch-tuner-history-v1";
const MAX_HISTORY = 30;

/** @param {string} key @param {number} v */
function fmt(key, v) {
  if (key === "armRamp") return v.toFixed(2);
  if (Math.abs(v) < 0.01) return v.toFixed(3);
  return v.toFixed(3);
}

/** @param {string} s */
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export class EdgeGlitchTuner {
  /** @type {Record<string, number>} */
  _params = createEdgeGlitchParams();
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
    window.__edgeGlitchTuner = this;
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
    const btn = this._panel.querySelector("#eg-save");
    btn.textContent = "SAVED ✓";
    btn.classList.add("eg-btn--saved");
    setTimeout(() => {
      btn.textContent = "SAVE";
      btn.classList.remove("eg-btn--saved");
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
        `Write these edge-glitch params into constants.js as production defaults?\n\nLabel: ${label}`
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/__edge_glitch_finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, params })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      this._flashMsg(
        `FINALIZED → constants.js (${data.updated?.length ?? 0} keys). Hard-refresh to load new defaults.`,
        5000
      );
      console.info("[EdgeGlitchTuner] finalized", data);
    } catch (err) {
      this._flashMsg(`Finalize failed: ${err.message} (dev server only)`, 5000);
      console.error("[EdgeGlitchTuner] finalize failed", err);
    }
  }

  /**
   * @param {Record<string, number>} params
   * @param {string} [_reason]
   */
  _applyParams(params, _reason) {
    this._params = { ...createEdgeGlitchParams(), ...params };
    this._syncSlidersToParams();
    this._pushToStage();
  }

  _pushToStage() {
    window.__stage?.setEdgeGlitchParams?.(this._params);
  }

  _buildToggleBtn() {
    const btn = document.createElement("button");
    btn.id = "edge-glitch-tuner-toggle";
    btn.title = "Edge Glitch Tuner (Shift+G)";
    btn.setAttribute("aria-label", "Toggle edge glitch tuner");
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M2 3.5h11M2 7.5h7M2 11.5h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M10 5.5l2.5 2-2.5 2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    btn.addEventListener("click", () => this.toggle());
    document.body.appendChild(btn);
    this._toggleBtn = btn;
  }

  _buildPanel() {
    const panel = document.createElement("div");
    panel.id = "edge-glitch-tuner-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Edge glitch tuner");

    panel.innerHTML = `
      <div class="eg-header">
        <span class="eg-title">EDGE GLITCH</span>
        <div class="eg-actions">
          <button class="eg-btn eg-btn--ghost" id="eg-reset" title="Reset to constants.js defaults">RESET</button>
          <button class="eg-btn eg-btn--ghost" id="eg-undo" title="Load most-recent save">UNDO</button>
          <button class="eg-btn eg-btn--ghost" id="eg-copy" title="Copy params as JSON">COPY</button>
          <button class="eg-btn eg-btn--finalize" id="eg-finalize" title="Write current sliders into constants.js">FINALIZE</button>
          <button class="eg-btn eg-btn--primary" id="eg-save">SAVE</button>
          <button class="eg-close" aria-label="Close panel">×</button>
        </div>
      </div>

      <div id="eg-flash" class="eg-flash" hidden></div>
      <p class="eg-hint">arm = trigger distance · local = strip width once armed</p>
      <div id="eg-sliders" class="eg-sliders"></div>

      <div class="eg-history-wrap">
        <div class="eg-history-header">
          <span class="eg-section-label">HISTORY</span>
          <button class="eg-btn eg-btn--ghost eg-btn--sm eg-btn--danger" id="eg-clear">CLEAR ALL</button>
        </div>
        <div id="eg-history-list" class="eg-history-list"></div>
      </div>
    `;

    document.body.appendChild(panel);
    this._panel = panel;

    panel.querySelector("#eg-reset").addEventListener("click", () => {
      this._applyParams(createEdgeGlitchParams(), "reset");
      this._flashMsg("Reset to constants.js defaults");
    });
    panel.querySelector("#eg-undo").addEventListener("click", () => this.undo());
    panel.querySelector("#eg-save").addEventListener("click", () => {
      const label = window.prompt("Label this snapshot (optional):", "");
      if (label !== null) this.save(label);
    });
    panel.querySelector("#eg-copy").addEventListener("click", () => this._copyJSON());
    panel.querySelector("#eg-finalize").addEventListener("click", () => {
      this.finalize(this._params, "current");
    });
    panel.querySelector(".eg-close").addEventListener("click", () => this.close());
    panel.querySelector("#eg-clear").addEventListener("click", () => {
      if (confirm("Delete all edge-glitch tuner history?")) {
        this._saveToStorage([]);
        this._renderHistory();
      }
    });

    this._buildSliders();
    this._renderHistory();
  }

  _buildSliders() {
    const container = this._panel.querySelector("#eg-sliders");
    for (const spec of EDGE_GLITCH_PARAM_SCHEMA) {
      const row = document.createElement("div");
      row.className = "eg-row";
      if (spec.hint) row.title = spec.hint;

      const id = `eg-p-${spec.key}`;
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
    for (const spec of EDGE_GLITCH_PARAM_SCHEMA) {
      const input = this._inputMap[spec.key];
      if (!input) continue;
      const v = this._params[spec.key];
      input.value = String(v);
      const out = this._outputMap[spec.key];
      if (out) out.textContent = fmt(spec.key, v);
    }
  }

  _renderHistory() {
    const list = this._panel?.querySelector("#eg-history-list");
    if (!list) return;
    const history = this._loadHistory();

    if (history.length === 0) {
      list.innerHTML = `<div class="eg-history-empty">No saves yet — hit SAVE to snapshot</div>`;
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
      row.className = "eg-history-row";
      row.innerHTML = `
        <div class="eg-history-meta">
          <span class="eg-history-label">${esc(label)}</span>
          <span class="eg-history-time">${date} ${time}</span>
        </div>
        <div class="eg-history-btns">
          <button class="eg-btn eg-btn--primary eg-btn--sm" data-act="load">LOAD</button>
          <button class="eg-btn eg-btn--finalize eg-btn--sm" data-act="finalize" title="Write this snapshot into constants.js">FINALIZE</button>
          <button class="eg-btn eg-btn--ghost eg-btn--sm eg-btn--danger" data-act="del">×</button>
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
    console.log("[EdgeGlitchTuner] current params:", json);
  }

  /** @param {string} msg @param {number} [durationMs] */
  _flashMsg(msg, durationMs = 2500) {
    const el = this._panel.querySelector("#eg-flash");
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
    // Sync from stage if live params already differ
    const live = window.__stage?.getEdgeGlitchParams?.();
    if (live) {
      this._params = { ...createEdgeGlitchParams(), ...live };
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
      if (e.key === "G" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        this.toggle();
      }
    });
  }

  _injectStyles() {
    if (document.getElementById("edge-glitch-tuner-styles")) return;
    const style = document.createElement("style");
    style.id = "edge-glitch-tuner-styles";
    style.textContent = EDGE_GLITCH_TUNER_CSS;
    document.head.appendChild(style);
  }
}

const EDGE_GLITCH_TUNER_CSS = `
#edge-glitch-tuner-toggle {
  position: fixed;
  bottom: 112px;
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
#edge-glitch-tuner-toggle:hover {
  border-color: rgba(255,160,120,0.55);
  color: #ffb090;
  background: rgba(8,8,10,0.92);
}
#edge-glitch-tuner-toggle.is-active {
  border-color: #ffb090;
  color: #ffb090;
  background: rgba(90,40,20,0.45);
}

#edge-glitch-tuner-panel {
  position: fixed;
  top: 12px;
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
  box-shadow: 0 4px 32px rgba(90,30,10,0.4), 0 1px 4px rgba(0,0,0,0.6);
}

.eg-header {
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
.eg-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #ffb090;
  white-space: nowrap;
}
.eg-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.eg-hint {
  margin: 0;
  padding: 6px 13px 0;
  font-size: 9.5px;
  color: #666;
  line-height: 1.35;
}

.eg-btn {
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
.eg-btn--ghost {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.18);
  color: #999;
}
.eg-btn--ghost:hover {
  border-color: rgba(255,255,255,0.36);
  color: #fff;
}
.eg-btn--primary {
  background: rgba(255,176,144,0.12);
  border: 1px solid rgba(255,176,144,0.38);
  color: #ffb090;
}
.eg-btn--primary:hover {
  background: rgba(255,176,144,0.24);
  border-color: rgba(255,176,144,0.65);
}
.eg-btn--finalize {
  background: rgba(100,220,140,0.12);
  border: 1px solid rgba(100,220,140,0.38);
  color: #88e88a;
}
.eg-btn--finalize:hover {
  background: rgba(100,220,140,0.24);
  border-color: rgba(100,220,140,0.65);
}
.eg-btn--saved {
  background: rgba(100,220,100,0.14) !important;
  border-color: rgba(100,220,100,0.45) !important;
  color: #88e88a !important;
}
.eg-btn--sm { font-size: 8.5px; padding: 3px 5px; }
.eg-btn--danger { color: #e06060; border-color: rgba(224,96,96,0.2); }
.eg-btn--danger:hover {
  background: rgba(224,96,96,0.12);
  border-color: rgba(224,96,96,0.5);
  color: #f88;
}
.eg-close {
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
.eg-close:hover { color: #ccc; }

.eg-flash {
  padding: 6px 13px;
  font-size: 10px;
  color: #ffb090;
  background: rgba(90,40,20,0.4);
  border-bottom: 1px solid rgba(255,176,144,0.2);
}

.eg-sliders {
  padding: 10px 13px 12px;
  display: grid;
  gap: 7px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.eg-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 6px;
  align-items: center;
}
.eg-row label {
  grid-column: 1 / -1;
  color: #777;
  font-size: 9.5px;
  letter-spacing: 0.03em;
}
.eg-row input[type="range"] {
  width: 100%;
  cursor: pointer;
  accent-color: #ffb090;
  height: 14px;
}
.eg-row output {
  min-width: 4.5ch;
  text-align: right;
  color: #e8e8e8;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.eg-history-wrap { padding: 9px 13px 13px; }
.eg-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
}
.eg-section-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #555;
}
.eg-history-list {
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
  padding-right: 2px;
}
.eg-history-empty {
  color: #444;
  font-size: 10px;
  line-height: 1.5;
  padding: 3px 0;
}
.eg-history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 3px;
  background: rgba(255,255,255,0.025);
}
.eg-history-row:hover {
  background: rgba(255,255,255,0.045);
  border-color: rgba(255,255,255,0.12);
}
.eg-history-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.eg-history-label {
  color: #ccc;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.eg-history-time { color: #555; font-size: 9px; }
.eg-history-btns { display: flex; gap: 4px; flex-shrink: 0; }
`;
