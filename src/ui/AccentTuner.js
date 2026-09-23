/**
 * AccentTuner — live rim / sweep / shaft knobs (Shift+A).
 * FINALIZE → POST /__accent_finalize → patches accentConfig.js exports.
 */

import {
  ACCENT_PARAM_SCHEMA,
  createAccentParams
} from "../scene/accent/accentConfig.js";

const STORAGE_KEY = "accent-tuner-history-v1";
const MAX_HISTORY = 30;

/** @param {string} key @param {number} v */
function fmt(key, v) {
  if (key === "enabled" || key === "rimCount" || key === "shaftEnabled") {
    return String(Math.round(v));
  }
  if (Math.abs(v) >= 10) return v.toFixed(1);
  if (Math.abs(v) < 0.01) return v.toFixed(3);
  return v.toFixed(2);
}

/** @param {string} s */
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export class AccentTuner {
  /** @type {Record<string, number>} */
  _params = createAccentParams();
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
    window.__accentTuner = this;
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
    const btn = this._panel.querySelector("#ac-save");
    btn.textContent = "SAVED ✓";
    setTimeout(() => {
      btn.textContent = "SAVE";
    }, 1600);
  }

  undo() {
    const history = this._loadHistory();
    if (!history.length) {
      this._flashMsg("No history yet");
      return;
    }
    this._applyParams({ ...history[0].params });
  }

  /**
   * @param {Record<string, number>} [params]
   * @param {string} [label]
   */
  async finalize(params = this._params, label = "finalize") {
    if (
      !confirm(
        `Write these accent params into accentConfig.js as production defaults?\n\nLabel: ${label}`
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/__accent_finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, params })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      this._flashMsg(
        `FINALIZED → accentConfig.js (${data.updated?.length ?? 0} keys). Hard-refresh.`,
        5000
      );
      console.info("[AccentTuner] finalized", data);
    } catch (err) {
      this._flashMsg(`Finalize failed: ${err.message} (dev server only)`, 5000);
      console.error("[AccentTuner] finalize failed", err);
    }
  }

  /** @param {Record<string, number>} params */
  _applyParams(params) {
    this._params = { ...createAccentParams(), ...params };
    this._syncSlidersToParams();
    this._pushToStage();
  }

  _pushToStage() {
    window.__stage?.setAccentParams?.(this._params);
  }

  _buildToggleBtn() {
    const btn = document.createElement("button");
    btn.id = "accent-tuner-toggle";
    btn.title = "Accent Light Tuner (Shift+A)";
    btn.setAttribute("aria-label", "Toggle accent light tuner");
    btn.textContent = "A";
    btn.addEventListener("click", () => this.toggle());
    document.body.appendChild(btn);
    this._toggleBtn = btn;
  }

  _buildPanel() {
    const panel = document.createElement("div");
    panel.id = "accent-tuner-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Accent light tuner");
    panel.innerHTML = `
      <div class="ac-header">
        <span class="ac-title">ACCENT LIGHTS</span>
        <div class="ac-actions">
          <button class="ac-btn" id="ac-reset">RESET</button>
          <button class="ac-btn" id="ac-undo">UNDO</button>
          <button class="ac-btn" id="ac-copy">COPY</button>
          <button class="ac-btn ac-btn--finalize" id="ac-finalize">FINALIZE</button>
          <button class="ac-btn ac-btn--primary" id="ac-save">SAVE</button>
          <button class="ac-close" aria-label="Close">×</button>
        </div>
      </div>
      <div id="ac-flash" class="ac-flash" hidden></div>
      <p class="ac-hint">rim + sweep + fog shaft · no ambient fill · Stop 0 · Shift+A</p>
      <div id="ac-sliders" class="ac-sliders"></div>
      <div class="ac-history-wrap">
        <div class="ac-history-header">
          <span>HISTORY</span>
          <button class="ac-btn ac-btn--sm" id="ac-clear">CLEAR</button>
        </div>
        <div id="ac-history-list" class="ac-history-list"></div>
      </div>
    `;
    document.body.appendChild(panel);
    this._panel = panel;

    panel.querySelector("#ac-reset").addEventListener("click", () => {
      this._applyParams(createAccentParams());
      this._flashMsg("Reset to accentConfig.js defaults");
    });
    panel.querySelector("#ac-undo").addEventListener("click", () => this.undo());
    panel.querySelector("#ac-save").addEventListener("click", () => {
      const label = window.prompt("Label this snapshot (optional):", "");
      if (label !== null) this.save(label);
    });
    panel.querySelector("#ac-copy").addEventListener("click", () => this._copyJSON());
    panel.querySelector("#ac-finalize").addEventListener("click", () => {
      this.finalize(this._params, "current");
    });
    panel.querySelector(".ac-close").addEventListener("click", () => this.close());
    panel.querySelector("#ac-clear").addEventListener("click", () => {
      if (confirm("Delete all accent tuner history?")) {
        this._saveToStorage([]);
        this._renderHistory();
      }
    });

    this._buildSliders();
    this._renderHistory();
  }

  _buildSliders() {
    const container = this._panel.querySelector("#ac-sliders");
    for (const spec of ACCENT_PARAM_SCHEMA) {
      const row = document.createElement("div");
      row.className = "ac-row";
      if (spec.hint) row.title = spec.hint;
      const id = `ac-p-${spec.key}`;
      row.innerHTML = `
        <label for="${id}">${esc(spec.label)}</label>
        <input id="${id}" type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${spec.default}" />
        <output for="${id}">${fmt(spec.key, spec.default)}</output>
      `;
      container.appendChild(row);
      const input = /** @type {HTMLInputElement} */ (row.querySelector("input"));
      const output = /** @type {HTMLOutputElement} */ (row.querySelector("output"));
      this._inputMap[spec.key] = input;
      this._outputMap[spec.key] = output;
      input.addEventListener("input", () => {
        const v = Number(input.value);
        this._params[spec.key] = v;
        output.textContent = fmt(spec.key, v);
        this._pushToStage();
      });
    }
  }

  _syncSlidersToParams() {
    for (const spec of ACCENT_PARAM_SCHEMA) {
      const v = this._params[spec.key] ?? spec.default;
      const input = this._inputMap[spec.key];
      const output = this._outputMap[spec.key];
      if (input) input.value = String(v);
      if (output) output.textContent = fmt(spec.key, v);
    }
  }

  _renderHistory() {
    const list = this._panel.querySelector("#ac-history-list");
    const history = this._loadHistory();
    list.innerHTML = history.length
      ? history
          .map((h, i) => {
            const when = new Date(h.ts).toLocaleString();
            const label = h.label ? esc(h.label) : "untitled";
            return `<button class="ac-hist" data-i="${i}" title="${when}">${label} · ${when}</button>`;
          })
          .join("")
      : `<p class="ac-empty">No saves yet</p>`;
    list.querySelectorAll(".ac-hist").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-i"));
        const row = this._loadHistory()[i];
        if (row?.params) this._applyParams(row.params);
      });
    });
  }

  async _copyJSON() {
    const json = JSON.stringify(this._params, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      this._flashMsg("Copied JSON");
    } catch {
      console.log("[AccentTuner] params:", json);
      this._flashMsg("Logged JSON to console");
    }
  }

  /** @param {string} msg @param {number} [ms] */
  _flashMsg(msg, ms = 2200) {
    const el = this._panel.querySelector("#ac-flash");
    el.hidden = false;
    el.textContent = msg;
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => {
      el.hidden = true;
    }, ms);
  }

  toggle() {
    if (this._open) this.close();
    else this.open();
  }

  open() {
    const live = window.__stage?.getAccentParams?.();
    if (live) this._params = { ...createAccentParams(), ...live };
    this._syncSlidersToParams();
    this._open = true;
    this._panel.hidden = false;
    this._toggleBtn.classList.add("is-active");
  }

  close() {
    this._open = false;
    this._panel.hidden = true;
    this._toggleBtn.classList.remove("is-active");
  }

  _bindKeys() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "A" && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
        e.preventDefault();
        this.toggle();
      }
    });
  }

  _injectStyles() {
    if (document.getElementById("accent-tuner-styles")) return;
    const style = document.createElement("style");
    style.id = "accent-tuner-styles";
    style.textContent = `
#accent-tuner-toggle {
  position: fixed; bottom: 16px; left: 16px; z-index: 10040;
  width: 36px; height: 36px; border-radius: 8px; border: 1px solid #3a3a45;
  background: #121218; color: #c8c8d4; font: 700 14px/1 ui-monospace, monospace;
  cursor: pointer;
}
#accent-tuner-toggle.is-active { border-color: #5eefff; color: #5eefff; }
#accent-tuner-panel {
  position: fixed; bottom: 60px; left: 16px; z-index: 10040;
  width: min(380px, calc(100vw - 32px)); max-height: min(70vh, 640px);
  overflow: auto; background: rgba(12,12,18,0.94); color: #d8d8e4;
  border: 1px solid #2e2e38; border-radius: 10px; padding: 10px 12px 12px;
  font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
  backdrop-filter: blur(8px);
}
.ac-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.ac-title { font-weight: 700; letter-spacing: 0.06em; color: #5eefff; }
.ac-actions { display: flex; flex-wrap: wrap; gap: 4px; }
.ac-btn { background: #1c1c26; color: #c8c8d4; border: 1px solid #333; border-radius: 5px; padding: 3px 7px; cursor: pointer; font: inherit; }
.ac-btn--primary { border-color: #5eefff; color: #5eefff; }
.ac-btn--finalize { border-color: #9dff1a; color: #9dff1a; }
.ac-btn--sm { padding: 2px 5px; font-size: 10px; }
.ac-close { background: transparent; border: 0; color: #888; font-size: 18px; cursor: pointer; }
.ac-hint { margin: 0 0 8px; color: #7a7a88; font-size: 11px; }
.ac-flash { background: #1a2a1a; color: #9dff1a; padding: 6px 8px; border-radius: 6px; margin-bottom: 8px; }
.ac-row { display: grid; grid-template-columns: 1fr 1.2fr 42px; gap: 6px; align-items: center; margin-bottom: 5px; }
.ac-row label { color: #a0a0b0; font-size: 11px; }
.ac-row output { text-align: right; color: #5eefff; font-variant-numeric: tabular-nums; }
.ac-history-wrap { margin-top: 10px; border-top: 1px solid #2a2a34; padding-top: 8px; }
.ac-history-header { display: flex; justify-content: space-between; margin-bottom: 6px; color: #7a7a88; }
.ac-history-list { display: flex; flex-direction: column; gap: 3px; max-height: 120px; overflow: auto; }
.ac-hist { text-align: left; background: #16161e; border: 1px solid #2a2a34; color: #b8b8c8; border-radius: 5px; padding: 4px 6px; cursor: pointer; font: inherit; }
.ac-empty { color: #555; margin: 0; }
`;
    document.head.appendChild(style);
  }
}
