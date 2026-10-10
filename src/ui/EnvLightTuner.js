/**
 * EnvLightTuner — scene IBL, ambient, hemisphere, exposure (Shift+E).
 * Does not touch the POV spot, neon, or accent lights.
 * Each change logs to the console so the numbers can be baked later.
 */

import {
  ENV_LIGHT_PARAM_SCHEMA,
  createEnvLightParams
} from "../scene/stage/envLightConfig.js";

const STORAGE_KEY = "env-light-tuner-history-v1";
const MAX_HISTORY = 30;

/** @param {number} v */
function fmt(v) {
  if (Math.abs(v) >= 10) return v.toFixed(1);
  if (Math.abs(v) < 0.01) return v.toFixed(3);
  return v.toFixed(2);
}

/** @param {string} s */
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export class EnvLightTuner {
  /** @type {Record<string, number>} */
  _params = createEnvLightParams();
  _open = false;
  /** @type {Record<string, HTMLInputElement>} */
  _inputMap = {};
  /** @type {Record<string, HTMLOutputElement>} */
  _outputMap = {};

  /**
   * @param {{
   *   apply?: (params: Record<string, number>) => Record<string, number> | void,
   *   read?: () => Record<string, number> | null,
   *   button?: boolean
   * }} [options] `apply` / `read` reach the stage (default: the main-thread
   *   `window.__stage`; the worker host passes a postMessage bridge). `button:
   *   false` skips the on-page toggle (Shift+E only, like the other tuners).
   */
  constructor(options = {}) {
    this._apply = options.apply ?? ((p) => window.__stage?.setEnvLightParams?.(p));
    this._read = options.read ?? (() => window.__stage?.getEnvLightParams?.());
    this._injectStyles();
    if (options.button !== false) this._buildToggleBtn();
    this._buildPanel();
    this._bindKeys();
    window.__envLightTuner = this;
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
    const btn = this._panel.querySelector("#el-save");
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

  /** @param {Record<string, number>} params */
  _applyParams(params) {
    this._params = { ...createEnvLightParams(), ...params };
    this._syncSlidersToParams();
    this._pushToStage();
  }

  _pushToStage() {
    const applied = this._apply(this._params);
    const row = applied ?? this._params;
    console.log(
      "[EnvLightTuner] environmentIntensity=%s ambientIntensity=%s hemiIntensity=%s exposure=%s",
      Number(row.environmentIntensity).toFixed(3),
      Number(row.ambientIntensity).toFixed(3),
      Number(row.hemiIntensity).toFixed(3),
      Number(row.exposure).toFixed(3)
    );
  }

  _buildToggleBtn() {
    const btn = document.createElement("button");
    btn.id = "env-light-tuner-toggle";
    btn.title = "Environment / lighting (Shift+E)";
    btn.setAttribute("aria-label", "Toggle environment lighting tuner");
    btn.textContent = "E";
    btn.addEventListener("click", () => this.toggle());
    document.body.appendChild(btn);
    this._toggleBtn = btn;
  }

  _buildPanel() {
    const panel = document.createElement("div");
    panel.id = "env-light-tuner-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Environment lighting tuner");
    panel.innerHTML = `
      <div class="el-header">
        <span class="el-title">ENVIRONMENT</span>
        <div class="el-actions">
          <button class="el-btn" id="el-reset">RESET</button>
          <button class="el-btn" id="el-undo">UNDO</button>
          <button class="el-btn" id="el-copy">COPY</button>
          <button class="el-btn el-btn--primary" id="el-save">SAVE</button>
          <button class="el-close" aria-label="Close">×</button>
        </div>
      </div>
      <div id="el-flash" class="el-flash" hidden></div>
      <p class="el-hint">env · ambient · hemi · exposure · logs on change · Shift+E</p>
      <div id="el-sliders" class="el-sliders"></div>
      <div class="el-history-wrap">
        <div class="el-history-header">
          <span>HISTORY</span>
          <button class="el-btn el-btn--sm" id="el-clear">CLEAR</button>
        </div>
        <div id="el-history-list" class="el-history-list"></div>
      </div>
    `;
    document.body.appendChild(panel);
    this._panel = panel;

    panel.querySelector("#el-reset").addEventListener("click", () => {
      this._applyParams(createEnvLightParams());
      this._flashMsg("Reset to starting defaults");
    });
    panel.querySelector("#el-undo").addEventListener("click", () => this.undo());
    panel.querySelector("#el-save").addEventListener("click", () => {
      const label = window.prompt("Label this snapshot (optional):", "");
      if (label !== null) this.save(label);
    });
    panel.querySelector("#el-copy").addEventListener("click", () => this._copyJSON());
    panel.querySelector(".el-close").addEventListener("click", () => this.close());
    panel.querySelector("#el-clear").addEventListener("click", () => {
      if (confirm("Delete all environment tuner history?")) {
        this._saveToStorage([]);
        this._renderHistory();
      }
    });

    this._buildSliders();
    this._renderHistory();
  }

  _buildSliders() {
    const container = this._panel.querySelector("#el-sliders");
    for (const spec of ENV_LIGHT_PARAM_SCHEMA) {
      const row = document.createElement("div");
      row.className = "el-row";
      if (spec.hint) row.title = spec.hint;
      const id = `el-p-${spec.key}`;
      row.innerHTML = `
        <label for="${id}">${esc(spec.label)}</label>
        <input id="${id}" type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${spec.default}" />
        <output for="${id}">${fmt(spec.default)}</output>
      `;
      container.appendChild(row);
      const input = /** @type {HTMLInputElement} */ (row.querySelector("input"));
      const output = /** @type {HTMLOutputElement} */ (row.querySelector("output"));
      this._inputMap[spec.key] = input;
      this._outputMap[spec.key] = output;
      input.addEventListener("input", () => {
        const v = Number(input.value);
        this._params[spec.key] = v;
        output.textContent = fmt(v);
        this._pushToStage();
      });
    }
  }

  _syncSlidersToParams() {
    for (const spec of ENV_LIGHT_PARAM_SCHEMA) {
      const v = this._params[spec.key] ?? spec.default;
      const input = this._inputMap[spec.key];
      const output = this._outputMap[spec.key];
      if (input) input.value = String(v);
      if (output) output.textContent = fmt(v);
    }
  }

  _renderHistory() {
    const list = this._panel.querySelector("#el-history-list");
    const history = this._loadHistory();
    list.innerHTML = history.length
      ? history
          .map((h, i) => {
            const when = new Date(h.ts).toLocaleString();
            const label = h.label ? esc(h.label) : "untitled";
            return `<button class="el-hist" data-i="${i}" title="${when}">${label} · ${when}</button>`;
          })
          .join("")
      : `<p class="el-empty">No saves yet</p>`;
    list.querySelectorAll(".el-hist").forEach((btn) => {
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
      console.log("[EnvLightTuner] params:", json);
      this._flashMsg("Logged JSON to console");
    }
    console.log("[EnvLightTuner] params:", json);
  }

  /** @param {string} msg @param {number} [ms] */
  _flashMsg(msg, ms = 2200) {
    const el = this._panel.querySelector("#el-flash");
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
    const live = this._read();
    if (live) this._params = { ...createEnvLightParams(), ...live };
    this._syncSlidersToParams();
    this._open = true;
    this._panel.hidden = false;
    this._toggleBtn?.classList.add("is-active");
  }

  close() {
    this._open = false;
    this._panel.hidden = true;
    this._toggleBtn?.classList.remove("is-active");
  }

  _bindKeys() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "E" && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        this.toggle();
      }
    });
  }

  _injectStyles() {
    if (document.getElementById("env-light-tuner-styles")) return;
    const style = document.createElement("style");
    style.id = "env-light-tuner-styles";
    style.textContent = `
#env-light-tuner-toggle {
  position: fixed; top: 228px; right: 16px; z-index: 9000;
  width: 34px; height: 34px; padding: 0; border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(8,8,10,0.78); color: rgba(255,255,255,0.45);
  font: 700 13px/1 ui-monospace, monospace; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
#env-light-tuner-toggle:hover { border-color: rgba(255,196,120,0.55); color: #ffc98a; }
#env-light-tuner-toggle.is-active { border-color: #ffc98a; color: #ffc98a; background: rgba(80,50,16,0.45); }
#env-light-tuner-panel {
  position: fixed; top: 12px; right: 12px; z-index: 10040;
  width: min(320px, calc(100vw - 24px)); max-height: calc(100vh - 24px);
  overflow: auto; background: rgba(8,8,10,0.94); color: #d8d8e4;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 10px 12px 12px;
  font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
  backdrop-filter: blur(14px);
}
.el-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.el-title { font-weight: 700; letter-spacing: 0.06em; color: #ffc98a; }
.el-actions { display: flex; flex-wrap: wrap; gap: 4px; }
.el-btn { background: #1c1c26; color: #c8c8d4; border: 1px solid #333; border-radius: 5px; padding: 3px 7px; cursor: pointer; font: inherit; }
.el-btn--primary { border-color: #ffc98a; color: #ffc98a; }
.el-btn--sm { padding: 2px 5px; font-size: 10px; }
.el-close { background: transparent; border: 0; color: #888; font-size: 18px; cursor: pointer; }
.el-hint { margin: 0 0 8px; color: #7a7a88; font-size: 11px; }
.el-flash { background: #2a2214; color: #ffc98a; padding: 6px 8px; border-radius: 6px; margin-bottom: 8px; }
.el-row { display: grid; grid-template-columns: 1fr 1.2fr 42px; gap: 6px; align-items: center; margin-bottom: 5px; }
.el-row label { color: #a0a0b0; font-size: 11px; }
.el-row output { text-align: right; color: #ffc98a; font-variant-numeric: tabular-nums; }
.el-history-wrap { margin-top: 10px; border-top: 1px solid #2a2a34; padding-top: 8px; }
.el-history-header { display: flex; justify-content: space-between; margin-bottom: 6px; color: #7a7a88; }
.el-history-list { display: flex; flex-direction: column; gap: 3px; max-height: 120px; overflow: auto; }
.el-hist { text-align: left; background: #16161e; border: 1px solid #2a2a34; color: #b8b8c8; border-radius: 5px; padding: 4px 6px; cursor: pointer; font: inherit; }
.el-empty { color: #555; margin: 0; }
`;
    document.head.appendChild(style);
  }
}
