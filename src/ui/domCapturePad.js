/**
 * Edge inset for CRT DOM pages (MySpace / XP) and html-to-image capture.
 * Permanent padding on each page’s parent container — keeps chrome/glyphs
 * inside the phosphor window. Do not UV-scale or texture-crop instead.
 */
export const DOM_CAPTURE_EDGE_PAD_PX = 40;

/**
 * Apply capture edge pad; returns a restore fn.
 * Parents already carry this inset in CSS; this keeps box-sizing / fill
 * color correct for the capture frame.
 * @param {HTMLElement | null | undefined} el
 * @param {{ background?: string }} [opts]
 * @returns {() => void}
 */
export function beginDomCapturePad(el, opts = {}) {
  if (!(el instanceof HTMLElement)) return () => {};
  const prev = {
    padding: el.style.padding,
    boxSizing: el.style.boxSizing,
    background: el.style.backgroundColor
  };
  el.style.boxSizing = "border-box";
  el.style.padding = `${DOM_CAPTURE_EDGE_PAD_PX}px`;
  if (opts.background) el.style.backgroundColor = opts.background;
  el.classList.add("is-dom-capturing");
  return () => {
    el.style.padding = prev.padding;
    el.style.boxSizing = prev.boxSizing;
    el.style.backgroundColor = prev.background;
    el.classList.remove("is-dom-capturing");
  };
}
