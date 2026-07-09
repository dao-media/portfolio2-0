import { damp, Spring } from "./waterCursorSpring.js";
import { sanitizeWaterCursorConfig, clampDeltaSeconds, wrapAngle, finite } from "./waterCursorSanitize.js";
import { DEFAULT_WATER_CURSOR_CONFIG } from "./waterCursorConfig.js";

const OMEGA_EPS = 1e-4;
const MAX_OMEGA = 24;

/**
 * Headless physics slice — mirrors WaterCursor._tick direction + deform path.
 * Used by the stress suite without WebGL/DOM.
 */
export function simulateWaterCursorFrame(state, cfg, dtMs) {
  const dt = clampDeltaSeconds(dtMs);

  const prevX = state.posX;
  const prevY = state.posY;
  state.posX = damp(state.posX, state.pointerX, cfg.followRate, dt);
  state.posY = damp(state.posY, state.pointerY, cfg.followRate, dt);

  const vx = (state.posX - prevX) / dt;
  const vy = (state.posY - prevY) / dt;
  state.velX = damp(state.velX, vx, cfg.velocityFilterRate, dt);
  state.velY = damp(state.velY, vy, cfg.velocityFilterRate, dt);

  const speedPx = Math.hypot(state.velX, state.velY);

  if (speedPx > cfg.directionSpeedThreshold) {
    const targetAngle = Math.atan2(state.velY, state.velX);
    let diff = targetAngle - state.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const step = diff * (1 - Math.exp(-cfg.angleRate * dt));
    state.angle += step;
    state.omega = damp(state.omega, step / dt, cfg.omegaTrackRate, dt);
  } else {
    state.angle += state.omega * dt;
    state.omega *= Math.exp(-cfg.angularFriction * dt);
  }

  state.angle = wrapAngle(state.angle);
  state.omega = finite(state.omega, 0);
  if (Math.abs(state.omega) < OMEGA_EPS) state.omega = 0;
  state.omega = Math.sign(state.omega || 1) * Math.min(Math.abs(state.omega), MAX_OMEGA);

  const turn = Math.min(Math.abs(state.omega) / cfg.omegaMax, 1);
  state.waveSpring.target = cfg.waveAmp * turn;
  const waveAmp = Math.max(state.waveSpring.update(dt), 0);
  state.wavePhase = wrapAngle(state.wavePhase + state.omega * cfg.waveTravel * dt);

  const speed = Math.min(speedPx / cfg.maxSpeed, 1);
  const shapedSpeed = Math.pow(speed, cfg.speedResponseExponent);
  state.stretchSpring.target = cfg.maxStretch * shapedSpeed;
  state.stretchSpring.update(dt);
  state.stretch = Math.min(
    Math.max(state.stretchSpring.value, -cfg.maxStretchOvershoot),
    cfg.maxStretch
  );

  return {
    dt,
    speedPx,
    waveAmp,
    stretch: state.stretch,
    angle: state.angle,
    omega: state.omega
  };
}

function createSimState(pointerX = 0, pointerY = 0) {
  const cfg = sanitizeWaterCursorConfig(DEFAULT_WATER_CURSOR_CONFIG);
  return {
    cfg,
    pointerX,
    pointerY,
    posX: pointerX,
    posY: pointerY,
    velX: 0,
    velY: 0,
    angle: 0,
    omega: 0,
    wavePhase: 0,
    stretch: 0,
    stretchSpring: new Spring(cfg.springStiffness, cfg.springDamping),
    waveSpring: new Spring(cfg.waveStiffness, cfg.waveDamping)
  };
}

function assertFinite(label, values) {
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isFinite(value)) {
      throw new Error(`${label}: ${key} is not finite (${value})`);
    }
  }
}

/** @returns {{ passed: number, failed: number, results: { name: string, ok: boolean, error?: string }[] }} */
export function runWaterCursorStressTest() {
  const results = [];

  const run = (name, fn) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  };

  run("sanitize rejects toxic config", () => {
    const cfg = sanitizeWaterCursorConfig({
      maxSpeed: 0,
      springStiffness: NaN,
      waveAmp: Infinity,
      tailBias: -99,
      followRate: undefined
    });
    if (cfg.maxSpeed <= 0) throw new Error("maxSpeed should be clamped above 0");
    if (!Number.isFinite(cfg.springStiffness)) throw new Error("springStiffness not finite");
    if (!Number.isFinite(cfg.waveAmp)) throw new Error("waveAmp not finite");
    if (cfg.tailBias < 0) throw new Error("tailBias should be clamped");
  });

  run("tab-wake dt spike (5s)", () => {
    const state = createSimState(400, 300);
    state.pointerX = 800;
    state.pointerY = 600;
    const out = simulateWaterCursorFrame(state, state.cfg, 5000);
    assertFinite("tab spike", out);
    assertFinite("tab spike state", {
      posX: state.posX,
      velX: state.velX,
      angle: state.angle,
      omega: state.omega,
      stretch: state.stretch
    });
  });

  run("10k random dt frames", () => {
    const state = createSimState(100, 100);
    for (let i = 0; i < 10000; i += 1) {
      state.pointerX = 100 + Math.sin(i * 0.03) * 400;
      state.pointerY = 100 + Math.cos(i * 0.02) * 300;
      const dtMs = 1 + Math.random() * 500;
      const out = simulateWaterCursorFrame(state, state.cfg, dtMs);
      assertFinite(`random frame ${i}`, out);
    }
  });

  run("pointer teleport", () => {
    const state = createSimState(0, 0);
    for (let i = 0; i < 120; i += 1) {
      state.pointerX = i % 2 === 0 ? 0 : 4000;
      state.pointerY = i % 2 === 0 ? 0 : 3000;
      simulateWaterCursorFrame(state, state.cfg, 16.7);
      assertFinite("teleport", {
        posX: state.posX,
        velX: state.velX,
        omega: state.omega,
        stretch: state.stretch
      });
    }
  });

  run("circle then hard stop — coast without NaN", () => {
    const state = createSimState(500, 400);
    const radius = 180;
    for (let i = 0; i < 300; i += 1) {
      const t = i * 0.05;
      state.pointerX = 500 + Math.cos(t) * radius;
      state.pointerY = 400 + Math.sin(t) * radius;
      simulateWaterCursorFrame(state, state.cfg, 16.7);
    }
    state.pointerX = 500;
    state.pointerY = 400;
    let lastOmega = Math.abs(state.omega);
    for (let i = 0; i < 200; i += 1) {
      simulateWaterCursorFrame(state, state.cfg, 16.7);
      assertFinite("coast", { omega: state.omega, angle: state.angle });
      if (Math.abs(state.omega) > MAX_OMEGA + 1e-3) {
        throw new Error("omega exceeded hard clamp during coast");
      }
      lastOmega = Math.abs(state.omega);
    }
    if (lastOmega > 0.5) {
      throw new Error("omega did not decay meaningfully after stop");
    }
  });

  run("spring stability under micro dt", () => {
    const spring = new Spring(170, 14);
    spring.target = 0.6;
    for (let i = 0; i < 50000; i += 1) {
      const v = spring.update(0.001);
      if (!Number.isFinite(v)) throw new Error(`spring NaN at ${i}`);
    }
  });

  run("damp with NaN inputs", () => {
    const v = damp(NaN, 100, 10, 0.016);
    if (!Number.isFinite(v)) throw new Error("damp did not recover from NaN current");
  });

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { passed, failed, results };
}
