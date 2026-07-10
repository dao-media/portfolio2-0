import {
  FOCUS_BLEND_THRESHOLD,
  FOCUS_ENTER_DURATION,
  FOCUS_EXIT_DURATION,
  FOCUS_PARALLAX_EASE_DURATION
} from "./constants.js";

/** Desktop focus lifecycle — higher-priority phases block lower-priority motion. */
export const STAGE_FOCUS_PHASE = {
  IDLE: "idle",
  ENTERING: "entering",
  FOCUSED: "focused",
  EXITING: "exiting"
};

export { FOCUS_BLEND_THRESHOLD, FOCUS_ENTER_DURATION, FOCUS_EXIT_DURATION, FOCUS_PARALLAX_EASE_DURATION };

/**
 * @param {{
 *   introComplete?: boolean,
 *   locked?: boolean,
 *   _transitionTl?: unknown,
 *   current?: number,
 *   _focusPhase?: string,
 *   _focusTween?: unknown
 * }} stage
 */
export function canEnterDesktopFocus(stage) {
  return (
    stage.introComplete === true &&
    !stage.locked &&
    !stage._transitionTl &&
    stage.current === 1 &&
    (stage._focusPhase === STAGE_FOCUS_PHASE.IDLE ||
      stage._focusPhase === STAGE_FOCUS_PHASE.EXITING) &&
    !stage._focusTween
  );
}

/**
 * Cursor parallax is always layered on top of vignette motion — never suppressed.
 * @param {object} _stage
 * @returns {false}
 */
export function isParallaxSuppressed(_stage) {
  return false;
}

/**
 * @param {{
 *   _focusPhase?: string,
 *   focusBlend?: number
 * }} stage
 */
export function canStartDesktopBoot(stage) {
  if (stage._focusPhase === STAGE_FOCUS_PHASE.ENTERING) return false;
  if (stage._focusPhase === STAGE_FOCUS_PHASE.FOCUSED) return true;
  return (stage.focusBlend ?? 0) > FOCUS_BLEND_THRESHOLD;
}

/**
 * @param {{
 *   _focusPhase?: string,
 *   focusBlend?: number
 * }} stage
 */
export function shouldBlockScrollCaptureBlend(stage) {
  return (
    stage._focusPhase === STAGE_FOCUS_PHASE.FOCUSED ||
    (stage.focusBlend ?? 0) > FOCUS_BLEND_THRESHOLD
  );
}
