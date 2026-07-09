/** Default tunables for WaterCursor — override via `new WaterCursor({ config: { ... } })`. */

/** Stable release — harmonic SDF, momentum heading, stretch/wave springs. */
export const WATER_CURSOR_VERSION = "1.0.0";

export const DEFAULT_WATER_CURSOR_CONFIG = {
  /** Visible blob diameter in CSS pixels (~24–32). */
  baseDiameter: 22.4,
  /** Quad side = baseDiameter × this — headroom for stretch without clipping. */
  quadScale: 3,

  /** Position follower rate (1/s) — ~10 feels cursor-tight. */
  followRate: 10,
  /** Velocity low-pass rate (1/s). */
  velocityFilterRate: 20,
  /** px/s that maps to normalized speed = 1. */
  maxSpeed: 2500,
  /** Perceptual speed curve — pow(speed, this). */
  speedResponseExponent: 0.7,

  /** Max stretch spring target at full speed (harmonic amplitude). */
  maxStretch: 0.6,
  /** Mode-1 teardrop bias — nose/tail asymmetry coefficient. */
  tailBias: 0.4,
  /** Allow negative stretch overshoot magnitude after stop. */
  maxStretchOvershoot: 0.35,
  /** Stretch spring — underdamped for ~2 visible oscillations (~500ms). */
  springStiffness: 170,
  springDamping: 14,

  /** Heading tracking rate (1/s) while moving. */
  angleRate: 12,
  /** Angular momentum decay (1/s) during coast — higher = thicker liquid. */
  angularFriction: 5,
  /** Below this px/s, heading coasts on momentum instead of tracking. */
  directionSpeedThreshold: 40,
  /** Omega smoothing rate while tracking (1/s). */
  omegaTrackRate: 10,

  /** Turn ripple — angular velocity drives a traveling boundary wave. */
  waveStiffness: 120,
  waveDamping: 9,
  /** Peak UV radius modulation at max turn rate. */
  waveAmp: 0.012,
  /** Angular velocity (rad/s) that maps turn intensity to 1. */
  omegaMax: 6,
  /** Phase travel multiplier vs angular velocity. */
  waveTravel: 1.5,

  /** Hover swell disabled — cursor stays constant size on this site. */
  hoverScale: 1,
  hoverDuration: 0.3,
  hoverEase: "power2.out",
  /** Press compress — SDF radius multiplier. */
  pressScale: 0.92,
  pressDuration: 0.12,
  pressEase: "power2.out",

  /** Viewport exit — shrink + fade (no bounce). */
  presenceHideDuration: 0.22,
  presenceHideEase: "power2.in",
  /** Viewport enter — spring-settle (show only); reduced-motion falls back to tween. */
  presenceShowDuration: 0.3,
  presenceShowEase: "power2.out",
  /** Underdamped presence spring — overshoots 1.0 then settles. */
  presenceSpringStiffness: 320,
  presenceSpringDamping: 11,
  /** Initial presence spring velocity on enter (bounce impulse). */
  presenceEnterVelocityKick: 2.8,
  /** Stretch spring kick on enter — couples to catch-up distance. */
  presenceEnterStretchKick: 0.12,
  /** Angular nudge on enter when pointer leads the follower. */
  presenceEnterSpinKick: 0.18,

  color: "#e8f4ff",
  opacity: 0.92,
  /** Optional idle edge wobble on radius (nearly subliminal; 0 = off). */
  idleRadiusWobble: 0.004,

  reducedMotionPlain: true,
  reducedMotionSkip: false
};
