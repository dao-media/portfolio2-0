import { SKY_PARALLAX_PRESETS, SKY_PARALLAX_RADIUS } from "../scene/blackhole/StarField.js";

/**
 * Pass Q Q3 — live sky-parallax radius. Shift+S. The worker owns the star
 * field; this panel only posts the radius (and logs it, so a FINALIZE is a
 * copy into SKY_PARALLAX_RADIUS). The slider is logarithmic: 60 m – 5 km;
 * the far end ("∞") is the old rotation-only sky.
 */
const MIN_R = 60;
const MAX_R = 5000;
const STEPS = 200;

const toRadius = (v) => (v >= STEPS ? Infinity : Math.round(MIN_R * (MAX_R / MIN_R) ** (v / STEPS)));
const toSlider = (r) => (Number.isFinite(r) ? Math.round((STEPS * Math.log(r / MIN_R)) / Math.log(MAX_R / MIN_R)) : STEPS);

export class SkyParallaxTuner {
  /** @param {{ onChange?: (radius: number) => void }} [options] */
  constructor(options = {}) {
    this._onChange = options.onChange ?? null;
    const root = document.createElement("div");
    root.hidden = true;
    root.style.cssText = [
      "position:fixed",
      "left:16px",
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
    title.textContent = "Sky parallax radius (Shift+S)";
    title.style.marginBottom = "8px";
    const row = document.createElement("label");
    row.style.cssText = "display:grid;grid-template-columns:1fr 56px;gap:6px;align-items:center";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(STEPS);
    slider.step = "1";
    slider.value = String(toSlider(SKY_PARALLAX_RADIUS));
    const value = document.createElement("span");
    const show = (r) => {
      value.textContent = Number.isFinite(r) ? `${r} m` : "∞";
    };
    show(SKY_PARALLAX_RADIUS);
    const set = (r) => {
      slider.value = String(toSlider(r));
      show(r);
      this._onChange?.(r);
      console.log("[SkyParallaxTuner] radius:", Number.isFinite(r) ? r : "Infinity");
    };
    slider.addEventListener("input", () => set(toRadius(Number(slider.value))));
    row.append(slider, value);
    const presets = document.createElement("div");
    presets.style.cssText = "display:flex;gap:6px;margin-top:8px";
    for (const [name, r] of [...Object.entries(SKY_PARALLAX_PRESETS), ["∞", Infinity]]) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = name;
      b.style.cssText = "flex:1;padding:3px 0;border-radius:6px;border:1px solid #f4efe655;background:transparent;color:inherit;font:inherit;cursor:pointer";
      b.addEventListener("click", () => set(r));
      presets.append(b);
    }
    root.append(title, row, presets);
    document.body.append(root);

    window.addEventListener("keydown", (event) => {
      if (event.key !== "S" || !event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) return;
      root.hidden = !root.hidden;
    });
  }
}
