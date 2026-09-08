/**
 * Drop an html-to-image (or other 2D) canvas after its pixels have been copied
 * into a kept bitmap / WebGL texture. Zeroing dimensions releases the backing store.
 * @param {HTMLCanvasElement | OffscreenCanvas | null | undefined} canvas
 */
export function releaseCaptureCanvas(canvas) {
  if (!canvas) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    /* OffscreenCanvas in some engines rejects 0; ignore. */
  }
}
