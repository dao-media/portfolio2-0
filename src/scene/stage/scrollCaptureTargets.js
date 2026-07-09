/**
 * Targets that block turntable scroll while hovered.
 *
 * DOM — add any of these to HTML overlays:
 *   id="my-scroll-zone"
 *   class="scroll-capture"
 *   data-scroll-capture
 *
 * Or append a selector to SCROLL_CAPTURE_DOM_SELECTORS below.
 *
 * 3D — vignettes register mesh ids at runtime via StageScrollCapture.registerMesh().
 * See SCROLL_CAPTURE_MESH_IDS.finalPcScreen.
 */

/** CSS selectors matched with Element.closest() on pointer hover. */
export const SCROLL_CAPTURE_DOM_SELECTORS = [
  "#myspace-panel",
  "[data-scroll-capture]",
  ".scroll-capture"
];

/** Runtime mesh ids (registered from vignette code). */
export const SCROLL_CAPTURE_MESH_IDS = {
  /** CRT monitor face — blocks turntable scroll; wheel scrolls MySpace content. */
  finalPcScreen: "final-pc-screen",
  /** Sidekick body — blocks turntable scroll; click to slide the screen open. */
  sidekick: "sidekick-phone"
};
