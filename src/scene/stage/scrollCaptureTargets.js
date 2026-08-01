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
  /** CRT monitor face — blocks turntable scroll while zoomed; wheel scrolls MySpace. */
  finalPcScreen: "final-pc-screen",
  /** Sidekick body — click target only. Does NOT capture wheel (too large a hit area). */
  sidekick: "sidekick-phone"
};

/** Parallax damp-zone ids (registered via createParallaxDampZones). */
export const PARALLAX_DAMP_ZONE_IDS = {
  /** CRT monitor — softens cursor parallax while hovering the screen. */
  pcMonitor: "pc-monitor"
};
