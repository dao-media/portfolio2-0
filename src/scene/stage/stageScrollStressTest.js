import {
  normalizeWheelDelta,
  smoothstep,
  parallaxTargetFromClient,
  pointerNdcFromClient,
  resolveInterruptedVignetteIndex,
  sanitizeParallax
} from "./stageScrollUtils.js";
import {
  rotationDeltaToAnchor,
  vignetteAnchorRotation,
  WHEEL_MIN_DELTA,
  SCROLL_CAPTURE_WHEEL_OFF
} from "./constants.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** @returns {{ passed: number, failed: number, results: { name: string, ok: boolean, error?: string }[] }} */
export function runStageScrollStressTest() {
  const results = [];

  const run = (name, fn) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  };

  run("rotationDeltaToAnchor never returns NaN", () => {
    for (let i = 0; i < 500; i += 1) {
      const fromY = (Math.random() - 0.5) * Math.PI * 8;
      const anchorY = (Math.random() - 0.5) * Math.PI * 8;
      const dir = Math.random() > 0.5 ? 1 : -1;
      const delta = rotationDeltaToAnchor(fromY, anchorY, dir);
      assert(Number.isFinite(delta), `NaN delta at ${i}`);
    }
  });

  run("rotationDeltaToAnchor honors scroll direction", () => {
    const fromY = 0;
    const anchorY = vignetteAnchorRotation(1, 3);
    const forward = rotationDeltaToAnchor(fromY, anchorY, 1);
    const backward = rotationDeltaToAnchor(fromY, anchorY, -1);
    assert(Math.sign(forward) !== Math.sign(backward) || forward === 0, "dir hint ignored");
  });

  run("normalizeWheelDelta handles zero viewport", () => {
    const delta = normalizeWheelDelta({ deltaY: 100, deltaMode: 0 }, 0);
    assert(Number.isFinite(delta), "delta not finite");
  });

  run("parallaxTargetFromClient zero-size viewport", () => {
    const { tx, ty } = parallaxTargetFromClient(100, 200, {
      left: 0,
      top: 0,
      width: 0,
      height: 0
    });
    assert(Number.isFinite(tx) && Number.isFinite(ty), "parallax NaN");
  });

  run("pointerNdcFromClient zero canvas", () => {
    const ndc = pointerNdcFromClient(50, 50, { left: 0, top: 0, width: 0, height: 0 });
    assert(Number.isFinite(ndc.x) && Number.isFinite(ndc.y), "ndc NaN");
  });

  run("resolveInterruptedVignetteIndex 50% rule", () => {
    assert(resolveInterruptedVignetteIndex(0.49, 2, 1) === 1, "before half stays from");
    assert(resolveInterruptedVignetteIndex(0.51, 2, 1) === 2, "after half goes pending");
    assert(resolveInterruptedVignetteIndex(NaN, 2, 1) === 1, "NaN progress safe");
  });

  run("smoothstep degenerate edges", () => {
    assert(Number.isFinite(smoothstep(1, 1, 0.5)), "degenerate smoothstep NaN");
    assert(smoothstep(0, 1, -1) === 0, "clamp low");
    assert(smoothstep(0, 1, 2) === 1, "clamp high");
  });

  run("sanitizeParallax recovers NaN", () => {
    const p = sanitizeParallax({ x: NaN, y: Infinity, tx: NaN, ty: -99 });
    assert(Number.isFinite(p.x) && Number.isFinite(p.y), "sanitize failed");
    assert(p.y <= 2 && p.y >= -2, "parallax clamp");
  });

  run("10k wheel impulses — stage weight never NaN", () => {
    for (let i = 0; i < 10000; i += 1) {
      const blend = Math.random();
      const weight = 1 - smoothstep(0, SCROLL_CAPTURE_WHEEL_OFF, blend);
      const delta =
        normalizeWheelDelta({ deltaY: (Math.random() - 0.5) * 400, deltaMode: 0 }, 900) *
        weight;
      if (Math.abs(delta) >= WHEEL_MIN_DELTA) {
        assert(Number.isFinite(delta), `wheel delta NaN at ${i}`);
      }
    }
  });

  run("rapid interrupt index resolution", () => {
    for (let i = 0; i < 2000; i += 1) {
      const from = i % 3;
      const pending = (from + 1) % 3;
      const progress = Math.random();
      const idx = resolveInterruptedVignetteIndex(progress, pending, from);
      assert(idx >= 0 && idx <= 2 && Number.isFinite(idx), "bad index");
    }
  });

  const passed = results.filter((r) => r.ok).length;
  return { passed, failed: results.length - passed, results };
}
