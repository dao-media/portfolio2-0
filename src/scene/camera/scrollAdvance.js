// Collapses one physical scroll gesture (many small `wheel` events,
// especially on trackpads) into a single discrete advance(±1) call.
// Debounced by a "quiet gap" timer rather than a fixed post-trigger lock —
// once the gesture goes quiet for `quietMs` we re-arm immediately, so a
// deliberate second scroll can still redirect an in-flight transition
// instead of being swallowed for a fixed cooldown window.
export function createScrollAdvance({ onAdvance, threshold = 50, quietMs = 120 } = {}) {
  let accum = 0;
  let armed = true;
  let quietTimer = null;

  function handleWheel(e) {
    e.preventDefault();
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      armed = true;
      accum = 0;
    }, quietMs);

    if (!armed) return;
    accum += e.deltaY;
    if (Math.abs(accum) >= threshold) {
      onAdvance(Math.sign(accum));
      armed = false;
      accum = 0;
    }
  }

  return {
    handleWheel,
    attach(el) {
      el.addEventListener("wheel", handleWheel, { passive: false });
    },
    detach(el) {
      el.removeEventListener("wheel", handleWheel);
      clearTimeout(quietTimer);
    }
  };
}
