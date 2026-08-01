// Collapses one physical scroll gesture (many small `wheel` events,
// especially on trackpads) into a single discrete advance(±1) call.
//
// Re-arm rules:
// 1. Camera must be settled on a stop
// 2. After an advance, wait for land + a short quiet gap
//
// Mid-travel wheel must not reset the quiet clock (that made clickwheel feel
// dead). Mid-travel intent is also NOT queued into an auto-fire on land —
// that skipped stops (force-scroll past Sidekick).

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
    }, quietMs);
  }

  function fire(dir) {
    const step = Math.sign(dir);
    if (!step) return;
    onAdvance(step);
    armed = false;
    accum = 0;
    pendingPostSettleIdle = false;
    scheduleIdleArm();
  }

  /** Call from the camera update loop when settle state may have flipped. */
  function notifySettled() {
    if (!isSettled()) return;
    if (!pendingPostSettleIdle && armed) return;
    // Landed — require a fresh quiet gap. Never auto-advance on the settle frame.
    pendingPostSettleIdle = false;
    accum = 0;
    scheduleIdleArm();
  }

  function handleWheel(e) {
    e.preventDefault();
    const deltaY = normalizeDeltaY(e);
    if (!deltaY) return;

    // Mid-travel: remember to re-arm after land, but do not queue another hop.
    if (!isSettled()) {
      pendingPostSettleIdle = true;
      return;
    }

    // Landed but disarmed — still gesturing; postpone re-arm (don't chain).
    if (!armed) {
      scheduleIdleArm();
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
