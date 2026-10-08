import { GROUND_FOG_DEFAULTS } from "../scene/vignettes/SidekickGroundFog.js";

/**
 * Pass J item 7 / Pass K K3 — live Sidekick ground-fog panel. Shift+K. The worker owns
 * the fog; this panel only posts param patches (and logs the full set on
 * every change so a FINALIZE is a copy-paste into GROUND_FOG_DEFAULTS).
 */
const SLIDERS = [
  ["density", 0, 8, 0.05],
  ["height", 0.05, 0.6, 0.01],
  ["extent", 1.5, 6, 0.05],
  ["noiseScale", 0.3, 5, 0.05],
  ["speed", 0, 4, 0.05],
  ["edgeSoft", 0.1, 0.9, 0.01],
  ["lightGain", 0, 4, 0.05],
  ["propSoft", 0.02, 0.5, 0.01],
  ["steps", 4, 12, 1]
];

export class GroundFogTuner {
  /** @param {{ onChange?: (params: Record<string, number>) => void }} [options] */
  constructor(options = {}) {
    this._onChange = options.onChange ?? null;
    this._params = { ...GROUND_FOG_DEFAULTS };

    const root = document.createElement("div");
    root.hidden = true;
    root.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:40",
      "width:260px",
      "padding:12px 14px",
      "border-radius:10px",
      "background:rgba(8,8,12,0.88)",
      "color:#f4efe6",
      "font:12px/1.4 ui-sans-serif,system-ui,sans-serif",
      "box-shadow:0 8px 28px rgba(0,0,0,0.35)"
    ].join(";");
    const title = document.createElement("div");
    title.textContent = "Sidekick ground fog (Shift+K)";
    title.style.marginBottom = "8px";
    root.append(title);

    for (const [key, min, max, step] of SLIDERS) {
      const row = document.createElement("label");
      row.style.cssText = "display:grid;grid-template-columns:86px 1fr 40px;gap:6px;align-items:center;margin:3px 0";
      const name = document.createElement("span");
      name.textContent = key;
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(min);
      slider.max = String(max);
      slider.step = String(step);
      slider.value = String(this._params[key]);
      const value = document.createElement("span");
      value.textContent = String(this._params[key]);
      slider.addEventListener("input", () => {
        this._params[key] = Number(slider.value);
        value.textContent = slider.value;
        this._onChange?.({ [key]: this._params[key] });
        console.log("[GroundFogTuner]", JSON.stringify(this._params));
      });
      row.append(name, slider, value);
      root.append(row);
    }
    document.body.append(root);
    this._root = root;

    window.addEventListener("keydown", (event) => {
      if (event.key !== "K" || !event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) return;
      event.preventDefault();
      root.hidden = !root.hidden;
    });
  }
}
