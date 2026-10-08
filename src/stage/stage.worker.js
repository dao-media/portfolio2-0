import "./workerDom.js";
import { StageExperience } from "../scene/StageExperience.js";

let stage = null;

function post(message) {
  self.postMessage(message);
}

self.onmessage = (event) => {
  const msg = event.data;
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "init" && !stage) {
    try {
      stage = new StageExperience(msg.canvas, {
        worker: true,
        width: msg.width,
        height: msg.height,
        dpr: msg.dpr,
        reducedMotion: msg.reducedMotion,
        isCoarse: msg.isCoarse,
        search: msg.search || "",
        postMessage: post
      });
    } catch (error) {
      post({
        type: "error",
        message: error?.stack || error?.message || String(error)
      });
    }
    return;
  }

  if (!stage) return;

  if (msg.type === "gap") {
    stage._noteGap?.(msg.name || "main", msg.ms || 0);
    return;
  }

  const t0 = performance.now();
  if (msg.type === "pointerBuf" && msg.buf) {
    const buf = msg.buf;
    stage.handleHostPointer({
      x: buf[0],
      y: buf[1],
      clientX: buf[2],
      clientY: buf[3],
      inside: buf[4] > 0.5,
      button: buf[5]
    });
    post({ type: "pointerBuf", slot: msg.slot, buf }, [buf.buffer]);
  } else if (msg.type === "pointer") stage.handleHostPointer(msg);
  else if (msg.type === "resize") stage.handleHostResize(msg);
  else if (msg.type === "scroll") stage.handleHostWheel(msg);
  else if (msg.type === "pointerdown") stage.handleHostPointerDown(msg);
  else if (msg.type === "pointerup") stage.handleHostPointerUp?.(msg);
  else if (msg.type === "click") stage.handleHostClick(msg);
  else if (msg.type === "keydown") stage.handleHostKey(msg);
  else if (msg.type === "goTo") stage.goTo(msg.index);
  else if (msg.type === "blackHoleEngage") stage.engageBlackHole();
  else if (msg.type === "crtHoverIndex") stage.setCrtHoverIndex?.(msg.index);
  else if (msg.type === "updateCrtTexture") stage.applyCrtBitmap(msg.bitmap, msg.state);
  else if (msg.type === "updateSidekickTexture") stage.applySidekickBitmap(msg.bitmap);
  else if (msg.type === "updateDuoTexture") stage.applyDuoBitmap(msg.bitmap, msg.meta);
  else if (msg.type === "duo") stage.handleHostDuo(msg);
  else if (msg.type === "pixelBudget") stage.setPixelBudget(msg.megapixels);
  else if (msg.type === "groundFog") stage.setGroundFogParams(msg.params);
  else if (msg.type === "floorReset") stage.resetFloorStats();
  else if (msg.type === "debugCall") {
    Promise.resolve()
      .then(() => stage[msg.method]?.(...(msg.args || [])))
      .catch((error) => ({ error: error?.message || String(error) }))
      .then((result) => post({ type: "debugResult", id: msg.id, result }));
  }
  const ms = performance.now() - t0;
  if (ms >= 20) stage._noteGap?.(`message:${msg.type}`, ms);
};

self.addEventListener("error", (event) => {
  post({ type: "error", message: event.message || "worker error" });
});
self.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  post({
    type: "error",
    message: reason?.stack || reason?.message || String(reason)
  });
});
