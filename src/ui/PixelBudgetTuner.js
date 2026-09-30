import { REST_PIXEL_BUDGET_MP } from "../scene/stage/constants.js";

/**
 * Live rest-resolution cap. Shift+P. The worker owns the drawing buffer;
 * this panel only posts the megapixel target.
 */
export class PixelBudgetTuner {
  /**
   * @param {{ onChange?: (megapixels: number) => void, initial?: number }} [options]
   */
  constructor(options = {}) {
    this._onChange = options.onChange ?? null;
    this._target = options.initial ?? REST_PIXEL_BUDGET_MP;

    const root = document.createElement("div");
    root.hidden = true;
    root.style.cssText = [
      "position:fixed",
      "left:16px",
      "bottom:16px",
      "z-index:40",
      "width:240px",
      "padding:12px 14px",
      "border-radius:10px",
      "background:rgba(8,8,12,0.88)",
      "color:#f4efe6",
      "font:12px/1.4 ui-sans-serif,system-ui,sans-serif",
      "box-shadow:0 8px 28px rgba(0,0,0,0.35)"
    ].join(";");

    const title = document.createElement("div");
    title.textContent = "Rest pixel budget";
    title.style.marginBottom = "8px";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0.8";
    slider.max = "6";
    slider.step = "0.1";
    slider.value = String(this._target);
    slider.style.width = "100%";

    const readout = document.createElement("div");
    readout.style.marginTop = "8px";
    readout.style.opacity = "0.85";

    slider.addEventListener("input", () => {
      this._target = Number(slider.value);
      this._paint(readout);
      this._onChange?.(this._target);
    });

    root.append(title, slider, readout);
    document.body.append(root);
    this._root = root;
    this._slider = slider;
    this._readout = readout;
    this._paint(readout);

    window.addEventListener("keydown", (event) => {
      if (event.key !== "P" || !event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) return;
      event.preventDefault();
      root.hidden = !root.hidden;
    });
  }

  /**
   * @param {{
   *   targetMp?: number,
   *   pixelRatio?: number,
   *   drawW?: number,
   *   drawH?: number,
   *   drawMp?: number,
   *   smaa?: boolean,
   *   msaa?: number
   * }} state
   */
  setState(state) {
    if (typeof state.targetMp === "number" && Math.abs(state.targetMp - this._target) > 0.05) {
      this._target = state.targetMp;
      this._slider.value = String(state.targetMp);
    }
    this._live = state;
    this._paint(this._readout);
    window.__pixelBudget = state;
  }

  /** @param {HTMLElement} readout */
  _paint(readout) {
    const live = this._live;
    const ratio = live?.pixelRatio != null ? live.pixelRatio.toFixed(3) : "—";
    const draw = live?.drawW ? `${live.drawW}×${live.drawH} (${live.drawMp} MP)` : "—";
    const aa = live?.smaa ? "SMAA" : `MSAA ${live?.msaa ?? 0}`;
    readout.textContent = `target ${this._target.toFixed(1)} MP · ratio ${ratio} · ${draw} · ${aa}`;
  }
}
