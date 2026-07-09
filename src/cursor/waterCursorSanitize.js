import { DEFAULT_WATER_CURSOR_CONFIG } from "./waterCursorConfig.js";

/** @param {number} value @param {number} fallback */
export function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/** @param {number} value @param {number} min @param {number} max */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return (min + max) * 0.5;
  return Math.min(max, Math.max(min, value));
}

/** @param {number} angle */
export function wrapAngle(angle) {
  if (!Number.isFinite(angle)) return 0;
  const twoPi = Math.PI * 2;
  return angle - twoPi * Math.floor((angle + Math.PI) / twoPi);
}

/** @param {number} deltaTimeMs — gsap.ticker delta (milliseconds) */
export function clampDeltaSeconds(deltaTimeMs, maxDt = 1 / 30) {
  const dt = finite(deltaTimeMs, 16.7) / 1000;
  return clamp(dt, 0.001, maxDt);
}

/**
 * Clamp user overrides to safe ranges so bad config cannot NaN the sim.
 * @param {Partial<typeof DEFAULT_WATER_CURSOR_CONFIG>} overrides
 */
export function sanitizeWaterCursorConfig(overrides = {}) {
  const cfg = { ...DEFAULT_WATER_CURSOR_CONFIG, ...overrides };

  cfg.baseDiameter = clamp(finite(cfg.baseDiameter, 22.4), 8, 96);
  cfg.quadScale = clamp(finite(cfg.quadScale, 3), 1.5, 6);
  cfg.followRate = clamp(finite(cfg.followRate, 10), 1, 40);
  cfg.velocityFilterRate = clamp(finite(cfg.velocityFilterRate, 20), 1, 60);
  cfg.maxSpeed = clamp(finite(cfg.maxSpeed, 2500), 100, 20000);
  cfg.speedResponseExponent = clamp(finite(cfg.speedResponseExponent, 0.7), 0.2, 2);

  cfg.maxStretch = clamp(finite(cfg.maxStretch, 0.6), 0, 1.2);
  cfg.tailBias = clamp(finite(cfg.tailBias, 0.4), 0, 1);
  cfg.maxStretchOvershoot = clamp(finite(cfg.maxStretchOvershoot, 0.35), 0, 1);
  cfg.springStiffness = clamp(finite(cfg.springStiffness, 170), 10, 600);
  cfg.springDamping = clamp(finite(cfg.springDamping, 14), 1, 80);

  cfg.angleRate = clamp(finite(cfg.angleRate, 12), 1, 40);
  cfg.angularFriction = clamp(finite(cfg.angularFriction, 5), 0.5, 30);
  cfg.directionSpeedThreshold = clamp(finite(cfg.directionSpeedThreshold, 40), 0, 500);
  cfg.omegaTrackRate = clamp(finite(cfg.omegaTrackRate, 10), 1, 40);

  cfg.waveStiffness = clamp(finite(cfg.waveStiffness, 120), 10, 400);
  cfg.waveDamping = clamp(finite(cfg.waveDamping, 9), 1, 60);
  cfg.waveAmp = clamp(finite(cfg.waveAmp, 0.012), 0, 0.08);
  cfg.omegaMax = clamp(finite(cfg.omegaMax, 6), 0.5, 24);
  cfg.waveTravel = clamp(finite(cfg.waveTravel, 1.5), 0, 6);

  cfg.pressScale = clamp(finite(cfg.pressScale, 0.92), 0.5, 1);
  cfg.pressDuration = clamp(finite(cfg.pressDuration, 0.12), 0.01, 1);
  cfg.presenceHideDuration = clamp(finite(cfg.presenceHideDuration, 0.22), 0.05, 1);
  cfg.presenceShowDuration = clamp(finite(cfg.presenceShowDuration, 0.3), 0.05, 1);
  cfg.presenceSpringStiffness = clamp(finite(cfg.presenceSpringStiffness, 320), 40, 800);
  cfg.presenceSpringDamping = clamp(finite(cfg.presenceSpringDamping, 11), 2, 40);
  cfg.presenceEnterVelocityKick = clamp(finite(cfg.presenceEnterVelocityKick, 2.8), 0, 8);
  cfg.presenceEnterStretchKick = clamp(finite(cfg.presenceEnterStretchKick, 0.12), 0, 0.5);
  cfg.presenceEnterSpinKick = clamp(finite(cfg.presenceEnterSpinKick, 0.18), 0, 1);
  cfg.opacity = clamp(finite(cfg.opacity, 0.92), 0.05, 1);
  cfg.idleRadiusWobble = clamp(finite(cfg.idleRadiusWobble, 0.004), 0, 0.05);

  if (typeof cfg.color !== "string" || !cfg.color) {
    cfg.color = DEFAULT_WATER_CURSOR_CONFIG.color;
  }

  return cfg;
}
