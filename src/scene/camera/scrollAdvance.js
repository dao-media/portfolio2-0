// Collapses one physical scroll gesture (many small `wheel` events,
// especially on trackpads) into a single discrete advance(±1) call.
//
// Re-arm rules:
// 1. Camera must be settled on a stop
// 2. After an advance, wait for land + a short quiet gap
//
// Mid-travel wheel no longer resets the quiet clock (that made clickwheel
// feel dead — keeping the wheel spinning postponed the next step forever).
// At most one step may be queued while traveling.

/** Normalize wheel deltas across line / pixel / page modes. */
function normalizeDeltaY(event) {
  let { deltaY, deltaMode } = event;
  if (!Number.isFinite(deltaY)) return 0;
  if (deltaMode === 1) deltaY *= 48; // DOM_DELTA_LINE
  else if (deltaMode === 2) deltaY *= Math.max(window.innerHeight || 800, 1) * 0.85; // PAGE
  return deltaY;
}

export function createScrollAdvance({
  onAdvance,
  isSettled = () => true,
  threshold = 28,
  quietMs = 110
} = {}) {
  let accum = 0;
  let armed = true;
  let quietTimer = null;
  /** Quiet gap already requested while traveling; finish arming after land. */
  let pendingPostSettleIdle = false;
  /** At most one step queued while the camera is mid-spring. */
  let queuedDir = 0;

  function clearQuietTimer() {
    if (quietTimer != null) {
      clearTimeout(quietTimer);
      quietTimer = null;
    }
  }

  function arm() {
    armed = true;
    accum = 0;
    pendingPostSettleIdle = false;
  }

  function scheduleIdleArm() {
    clearQuietTimer();
    quietTimer = setTimeout(() => {
      quietTimer = null;
      if (!isSettled()) {
        pendingPostSettleIdle = true;
        return;
      }
      arm();
      flushQueue();
    }, quietMs);
  }

  function fire(dir) {
    const step = Math.sign(dir);
    if (!step) return;
    onAdvance(step);
    armed = false;
    accum = 0;
    queuedDir = 0;
    pendingPostSettleIdle = false;
    scheduleIdleArm();
  }

  function flushQueue() {
    if (!queuedDir || !isSettled() || !armed) return;
    const dir = queuedDir;
    queuedDir = 0;
    fire(dir);
  }

  /** Call from the camera update loop when settle state may have flipped. */
  function notifySettled() {
    if (!isSettled()) return;

    if (queuedDir) {
      clearQuietTimer();
      pendingPostSettleIdle = false;
      armed = true;
      flushQueue();
      return;
    }

    if (!pendingPostSettleIdle) return;
    pendingPostSettleIdle = false;
    scheduleIdleArm();
  }

  function handleWheel(e) {
    e.preventDefault();
    const deltaY = normalizeDeltaY(e);
    if (!deltaY) return;

    // Mid-travel: queue intent, do not reset quiet timers.
    if (!isSettled()) {
      pendingPostSettleIdle = true;
      if (!armed || queuedDir) {
        accum += deltaY;
        if (Math.abs(accum) >= threshold) {
          queuedDir = Math.sign(accum);
          accum = 0;
        }
      } else {
        // Rare: settled flag lagged behind armed — treat as queue.
        accum += deltaY;
        if (Math.abs(accum) >= threshold) {
          queuedDir = Math.sign(accum);
          accum = 0;
        }
      }
      return;
    }

    // Landed but disarmed — user still gesturing; postpone re-arm.
    if (!armed) {
      scheduleIdleArm();
      accum += deltaY;
      if (Math.abs(accum) >= threshold) {
        queuedDir = Math.sign(accum);
        accum = 0;
      }
      return;
    }

    accum += deltaY;
    if (Math.abs(accum) < threshold) return;

    fire(Math.sign(accum));
  }

  return {
    handleWheel,
    notifySettled,
    attach(el) {
      el.addEventListener("wheel", handleWheel, { passive: false });
    },
    detach(el) {
      el.removeEventListener("wheel", handleWheel);
      clearQuietTimer();
    }
  };
}
