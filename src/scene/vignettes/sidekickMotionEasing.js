import gsap from "gsap";

/** Sidekick motion — softer anticipation in, gentle cubic settle out. */
export const SIDEKICK_EASE_IN = "back.in(1.25)";
export const SIDEKICK_EASE_OUT = "power3.out";

let _easeInFn = null;
let _easeOutFn = null;

function easeIn() {
  if (!_easeInFn) _easeInFn = gsap.parseEase(SIDEKICK_EASE_IN);
  return _easeInFn;
}

function easeOut() {
  if (!_easeOutFn) _easeOutFn = gsap.parseEase(SIDEKICK_EASE_OUT);
  return _easeOutFn;
}

/**
 * Full 0→1 sequence — ease-in-back on the first half, ease-out-cubic on the second.
 * @param {number} linear
 * @returns {number}
 */
export function mapSidekickSequenceEase(linear) {
  const t = Math.max(0, Math.min(1, linear));
  if (t <= 0.5) return easeIn()(t * 2) * 0.5;
  return 0.5 + easeOut()((t - 0.5) * 2) * 0.5;
}

if (!gsap.parseEase("sidekick.inOut")) {
  gsap.registerEase("sidekick.inOut", mapSidekickSequenceEase);
}
