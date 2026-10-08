import { HUDController } from "../ui/HUDController.js";
import { toCanvas } from "html-to-image";
import { DuoMailOverlay } from "../ui/DuoMailOverlay.js";
import { DuoCaseStudyOverlay } from "../ui/DuoCaseStudyOverlay.js";
import { SidekickSmsScreen } from "../ui/sidekickSms/SidekickSmsScreen.js";
import { PixelBudgetTuner } from "../ui/PixelBudgetTuner.js";
import { GroundFogTuner } from "../ui/GroundFogTuner.js";
import { REST_PIXEL_BUDGET_MP } from "../scene/stage/constants.js";
import { DUO_MAIL_ASPECT } from "../scene/duo/duoConstants.js";

/** Same capture size as the worker mail screen (`duoMailScreen.js`). */
const DUO_CAPTURE_H = 520;
const DUO_CAPTURE_W = Math.round(DUO_CAPTURE_H * DUO_MAIL_ASPECT);

/**
 * Transfers the scene canvas to the stage worker and keeps the page HUD here.
 * @param {HTMLCanvasElement} canvas
 * @param {{ hud?: HUDController }} [options]
 */
export function startStageHost(canvas, options = {}) {
  const pageLog = [];
  let pageTrigger = "boot";
  const loafLog = [];
  window.__loaf = loafLog;
  window.__longTasks = [];
  window.__eventTasks = [];
  window.__harness = [];

  function pushCapped(list, row, cap) {
    list.push(row);
    if (list.length > cap) list.shift();
  }

  function scriptRows(entry) {
    const scripts = entry.scripts || [];
    const rows = [];
    for (let i = 0; i < scripts.length; i += 1) {
      const script = scripts[i];
      rows.push({
        sourceURL: script.sourceURL || "",
        sourceFunctionName: script.sourceFunctionName || "",
        invoker: script.invoker || "",
        invokerType: script.invokerType || "",
        duration: Math.round(script.duration || 0),
        forcedStyleAndLayoutDuration: Math.round(script.forcedStyleAndLayoutDuration || 0)
      });
    }
    return rows;
  }

  try {
    const loafObserver = new PerformanceObserver((list) => {
      const frames = list.getEntries();
      for (let i = 0; i < frames.length; i += 1) {
        const entry = frames[i];
        if (entry.duration < 100) continue;
        pushCapped(loafLog, {
          startTime: Math.round(entry.startTime),
          duration: Math.round(entry.duration),
          blockingDuration: Math.round(entry.blockingDuration || 0),
          renderStart: Math.round(entry.renderStart || 0),
          styleAndLayoutStart: Math.round(entry.styleAndLayoutStart || 0),
          scripts: scriptRows(entry),
          visibility: document.visibilityState
        }, 40);
      }
    });
    loafObserver.observe({ type: "long-animation-frame", buffered: true });
  } catch {
    window.__loafError = "long-animation-frame unsupported";
  }

  try {
    const longTaskObserver = new PerformanceObserver((list) => {
      const tasks = list.getEntries();
      for (let i = 0; i < tasks.length; i += 1) {
        const entry = tasks[i];
        pushCapped(window.__longTasks, {
          startTime: Math.round(entry.startTime),
          duration: Math.round(entry.duration),
          name: entry.name || "",
          visibility: document.visibilityState
        }, 40);
      }
    });
    longTaskObserver.observe({ type: "longtask", buffered: true });
  } catch {
    window.__longTaskError = "longtask unsupported";
  }

  try {
    const eventObserver = new PerformanceObserver((list) => {
      const events = list.getEntries();
      for (let i = 0; i < events.length; i += 1) {
        const entry = events[i];
        const target = entry.target;
        pushCapped(window.__eventTasks, {
          startTime: Math.round(entry.startTime),
          duration: Math.round(entry.duration),
          name: entry.name || "",
          processingStart: Math.round(entry.processingStart || 0),
          processingEnd: Math.round(entry.processingEnd || 0),
          processing: Math.round((entry.processingEnd || 0) - (entry.processingStart || 0)),
          target: target?.id || target?.className || target?.tagName || "",
          visibility: document.visibilityState
        }, 80);
      }
    });
    eventObserver.observe({ type: "event", buffered: true, durationThreshold: 16 });
  } catch {
    window.__eventError = "event timing unsupported";
  }

  function noteMainGap(name, ms, extra) {
    if (!(ms >= 20)) return;
    const row = {
      name,
      ms: Math.round(ms),
      t: performance.now(),
      trigger: pageTrigger,
      ...(extra || {})
    };
    pageLog.push({ name: row.name, ms: row.ms, t: row.t, trigger: row.trigger });
    if (pageLog.length > 160) pageLog.shift();
    window.__gaps = window.__gaps || [];
    window.__gaps.push(row);
    if (window.__gaps.length > 16) window.__gaps.shift();
    window.__mainTasks = window.__mainTasks || [];
    window.__mainTasks.push(row);
    if (window.__mainTasks.length > 24) window.__mainTasks.shift();
    if (!window.__pageTaskPeak || row.ms > window.__pageTaskPeak.ms) {
      window.__pageTaskPeak = {
        name: row.name,
        ms: row.ms,
        trigger: row.trigger
      };
    }
    worker.postMessage({ type: "gap", name, ms: Math.round(ms) });
  }

  function rememberPage(name, ms) {
    if (!(ms >= 1)) return;
    if (ms >= 20) noteMainGap(name, ms, { kind: "page" });
    else {
      pageLog.push({
        name,
        ms: Math.round(ms * 10) / 10,
        t: performance.now(),
        trigger: pageTrigger
      });
      if (pageLog.length > 160) pageLog.shift();
    }
  }

  function wrapSync(obj, key, label) {
    const orig = obj?.[key];
    if (typeof orig !== "function") return;
    obj[key] = function pageWrapped(...args) {
      const t0 = performance.now();
      try {
        return orig.apply(this, args);
      } finally {
        rememberPage(label, performance.now() - t0);
      }
    };
  }

  function wrapAsync(obj, key, label) {
    const orig = obj?.[key];
    if (typeof orig !== "function") return;
    obj[key] = async function pageWrapped(...args) {
      const t0 = performance.now();
      try {
        return await orig.apply(this, args);
      } finally {
        rememberPage(label, performance.now() - t0);
      }
    };
  }

  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) =>
    nativeRaf((ts) => {
      const t0 = performance.now();
      try {
        return fn(ts);
      } finally {
        rememberPage(`raf:${fn.name || "anon"}`, performance.now() - t0);
      }
    });
  const nativeTimeout = window.setTimeout.bind(window);
  window.setTimeout = (fn, delay, ...args) => {
    if (typeof fn !== "function") return nativeTimeout(fn, delay, ...args);
    return nativeTimeout(() => {
      const t0 = performance.now();
      try {
        return fn(...args);
      } finally {
        rememberPage(`timeout:${fn.name || "anon"}`, performance.now() - t0);
      }
    }, delay);
  };
  const nativeInterval = window.setInterval.bind(window);
  window.setInterval = (fn, delay, ...args) => {
    if (typeof fn !== "function") return nativeInterval(fn, delay, ...args);
    return nativeInterval(() => {
      const t0 = performance.now();
      try {
        return fn(...args);
      } finally {
        rememberPage(`interval:${fn.name || "anon"}`, performance.now() - t0);
      }
    }, delay);
  };

  const hud = options.hud ?? new HUDController();
  const worker = new Worker(new URL("./stage.worker.js", import.meta.url), {
    type: "module"
  });

  const offscreen = canvas.transferControlToOffscreen();

  function getDimensions() {
    const rect = canvas.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
      dpr: Math.min(window.devicePixelRatio || 1, 1.75)
    };
  }

  function clientOnCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    const clientX = event.clientX - rect.left;
    const clientY = event.clientY - rect.top;
    return {
      clientX,
      clientY,
      // Y grows downward — same NDC CameraRig received from the old pointermove.
      x: (clientX / width) * 2 - 1,
      y: (clientY / height) * 2 - 1
    };
  }

  const pointerMsg = {
    type: "pointer",
    inside: true,
    clientX: 0,
    clientY: 0,
    x: 0,
    y: 0
  };
  let pointerDirty = false;
  const canvasBox = { left: 0, top: 0, width: 1, height: 1 };

  function readCanvasBox() {
    const rect = canvas.getBoundingClientRect();
    canvasBox.left = rect.left;
    canvasBox.top = rect.top;
    canvasBox.width = rect.width || 1;
    canvasBox.height = rect.height || 1;
  }

  function writePointer(event, inside) {
    const clientX = event.clientX - canvasBox.left;
    const clientY = event.clientY - canvasBox.top;
    const x = (clientX / canvasBox.width) * 2 - 1;
    const y = (clientY / canvasBox.height) * 2 - 1;
    if (
      pointerMsg.inside === inside &&
      pointerMsg.clientX === clientX &&
      pointerMsg.clientY === clientY
    ) {
      return;
    }
    pointerMsg.inside = inside;
    pointerMsg.clientX = clientX;
    pointerMsg.clientY = clientY;
    pointerMsg.x = x;
    pointerMsg.y = y;
    pointerDirty = true;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isCoarse = window.matchMedia("(pointer: coarse)").matches;

  worker.postMessage(
    {
      type: "init",
      canvas: offscreen,
      ...getDimensions(),
      reducedMotion,
      isCoarse,
      search: window.location.search
    },
    [offscreen]
  );

  readCanvasBox();
  const resizeObserver = new ResizeObserver(() => {
    readCanvasBox();
    worker.postMessage({ type: "resize", ...getDimensions() });
  });
  resizeObserver.observe(canvas);

  canvas.addEventListener("pointermove", (event) => {
    pageTrigger = "pointer";
    const t0 = performance.now();
    writePointer(event, true);
    rememberPage("pointermove", performance.now() - t0);
  });

  const pageDuring = [];
  let lastPageRaf = performance.now();
  let lastMailT = lastPageRaf;
  let hoverRev = -1;
  const pointerSlots = [new Float32Array(8), new Float32Array(8)];
  const pointerFree = [true, true];
  let pointerSeq = 0;
  function postPointerBuf() {
    const slot = pointerFree[0] ? 0 : pointerFree[1] ? 1 : -1;
    if (slot < 0) return;
    const buf = pointerSlots[slot];
    buf[0] = pointerMsg.x;
    buf[1] = pointerMsg.y;
    buf[2] = pointerMsg.clientX;
    buf[3] = pointerMsg.clientY;
    buf[4] = pointerMsg.inside ? 1 : 0;
    buf[5] = 0;
    buf[6] = (pointerSeq += 1);
    pointerFree[slot] = false;
    pointerDirty = false;
    worker.postMessage({ type: "pointerBuf", slot, buf }, [buf.buffer]);
  }
  function flushPointer() {
    const now = performance.now();
    const gap = now - lastPageRaf;
    pageDuring.length = 0;
    for (let i = 0; i < pageLog.length; i += 1) {
      const row = pageLog[i];
      if (row.t < now - gap || row.t > now + 1) continue;
      if (String(row.name).startsWith("page-raf:")) continue;
      pageDuring.push(row);
    }
    lastPageRaf = now;
    if (gap > 40) {
      const big = pageDuring.filter((row) => row.ms >= 40);
      const label = big.length
        ? big.map((row) => `${row.name}:${row.ms}`).join(",")
        : "none";
      let sum = 0;
      for (let i = 0; i < pageDuring.length; i += 1) sum += pageDuring[i].ms;
      noteMainGap(`${gap > 200 ? "page-raf:stall" : "page-raf:late"}|${label}`, gap, {
        kind: "raf"
      });
      if (!window.__pageStall || gap > window.__pageStall.ms) {
        const gapEnd = now;
        const gapStart = now - gap;
        const harnessHit = [];
        const harness = window.__harness || [];
        for (let h = 0; h < harness.length; h += 1) {
          const span = harness[h];
          if (span.end >= gapStart && span.start <= gapEnd) harnessHit.push(span.kind);
        }
        window.__pageStall = {
          ms: Math.round(gap),
          label,
          trigger: pageTrigger,
          sum: Math.round(sum),
          during: pageDuring.slice(-12),
          t: Math.round(gapEnd),
          start: Math.round(gapStart),
          visibility: document.visibilityState,
          harness: harnessHit
        };
      }
    }
    if (pointerDirty) postPointerBuf();
    if (myspace && myspace.hoverIndexRev !== hoverRev) {
      hoverRev = myspace.hoverIndexRev;
      worker.postMessage({ type: "crtHoverIndex", index: myspace.exportHoverIndex() });
    }
    if (duoMail?.isOpen) duoMail.tick((now - lastMailT) / 1000);
    lastMailT = now;
    requestAnimationFrame(flushPointer);
  }
  requestAnimationFrame(flushPointer);

  canvas.addEventListener(
    "wheel",
    (event) => {
      pageTrigger = "wheel";
      event.preventDefault();
      worker.postMessage({
        type: "scroll",
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        ...clientOnCanvas(event)
      });
    },
    { passive: false }
  );

  canvas.addEventListener("pointerdown", (event) => {
    pageTrigger = "pointerdown";
    const t0 = performance.now();
    worker.postMessage({ type: "pointerdown", button: event.button, ...clientOnCanvas(event) });
    rememberPage("pointerdown", performance.now() - t0);
  });

  canvas.addEventListener("pointerup", (event) => {
    worker.postMessage({ type: "pointerup", button: event.button, ...clientOnCanvas(event) });
  });

  canvas.addEventListener("pointerleave", () => {
    if (!pointerMsg.inside && pointerMsg.clientX === -1) return;
    pointerMsg.inside = false;
    pointerMsg.clientX = -1;
    pointerMsg.clientY = -1;
    pointerMsg.x = 0;
    pointerMsg.y = 0;
    pointerDirty = true;
  });

  canvas.addEventListener("click", (event) => {
    pageTrigger = "click";
    const t0 = performance.now();
    worker.postMessage({ type: "click", ...clientOnCanvas(event) });
    rememberPage("click", performance.now() - t0);
  });

  window.__stageCmd = (msg) => worker.postMessage(msg);
  let debugCallSeq = 0;
  const debugCallPending = new Map();
  window.__stageDebug = (method, ...args) =>
    new Promise((resolve) => {
      const id = (debugCallSeq += 1);
      debugCallPending.set(id, resolve);
      worker.postMessage({ type: "debugCall", id, method, args });
    });
  window.__resetFloor = () => worker.postMessage({ type: "floorReset" });

  window.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) return;
    worker.postMessage({
      type: "keydown",
      key: event.key,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey
    });
  });

  document.getElementById("bh-enter")?.addEventListener("click", () => {
    markDuoLive();
    worker.postMessage({ type: "blackHoleEngage" });
  });

  const myspace = hud.getMySpaceScreen();
  const sidekick = new SidekickSmsScreen({ reducedMotion });
  const dirty = { crt: false, sidekick: false };
  let bitmapBusy = false;

  function crtState(screen) {
    return {
      powerOnProgress: screen.powerOnProgress ?? 0,
      isPoweredOn: Boolean(screen.isPoweredOn),
      monitorLedOn: Boolean(screen.monitorLedOn),
      isMonitorBooting: Boolean(screen.isMonitorBooting),
      hoverId: screen.hoverId ?? null,
      canStartBoot: Boolean(screen.xpBoot?.canStartBoot),
      isBooting: Boolean(screen.xpBoot?.isBooting || screen.xpBoot?.active)
    };
  }

  async function flushBitmaps() {
    if (bitmapBusy) return;
    bitmapBusy = true;
    const t0 = performance.now();
    try {
      if (dirty.crt && myspace?.canvas) {
        dirty.crt = false;
        pageTrigger = "screen:crt";
        const b0 = performance.now();
        // WebGL ignores texture.flipY for an ImageBitmap-sourced texture here
        // (confirmed: toggling SCREEN_MAP_CRT.flipY has no visible effect) —
        // flip the bitmap itself at creation time instead, the one place
        // this image's orientation is actually decided.
        const bitmap = await createImageBitmap(myspace.canvas, { imageOrientation: "flipY" });
        rememberPage("bitmap:crt", performance.now() - b0);
        const p0 = performance.now();
        worker.postMessage(
          { type: "updateCrtTexture", bitmap, state: crtState(myspace) },
          [bitmap]
        );
        rememberPage("post:crt", performance.now() - p0);
      }
      if (dirty.sidekick && sidekick?.canvas) {
        dirty.sidekick = false;
        pageTrigger = "screen:sidekick";
        const b0 = performance.now();
        const bitmap = await createImageBitmap(sidekick.canvas);
        rememberPage("bitmap:sidekick", performance.now() - b0);
        // Pass K item 6 — per-repaint page cost of the LCD readback (dev stat).
        const st = window.__sidekickBitmapStats || (window.__sidekickBitmapStats = { n: 0, totalMs: 0, maxMs: 0, w: 0 });
        const bms = performance.now() - b0;
        st.n += 1;
        st.totalMs += bms;
        st.maxMs = Math.max(st.maxMs, bms);
        st.w = sidekick.canvas.width;
        const p0 = performance.now();
        worker.postMessage({ type: "updateSidekickTexture", bitmap }, [bitmap]);
        rememberPage("post:sidekick", performance.now() - p0);
      }
    } catch (error) {
      console.warn("[stageHost] screen bitmap", error);
    } finally {
      rememberPage("bitmap:flush", performance.now() - t0);
      bitmapBusy = false;
      if (dirty.crt || dirty.sidekick) requestAnimationFrame(() => void flushBitmaps());
    }
  }

  function markScreen(kind) {
    pageTrigger = `screen:${kind}`;
    dirty[kind] = true;
    requestAnimationFrame(() => void flushBitmaps());
  }

  wrapSync(myspace, "draw", "crt.draw");
  wrapSync(myspace, "_paintFrame", "crt.paint");
  wrapSync(myspace, "_compositeHoverFrame", "crt.hover");
  wrapAsync(myspace, "_capturePage", "crt.capture");
  wrapAsync(myspace?.xpBoot, "_captureToScreen", "xp.capture");
  wrapAsync(myspace?.xpBoot, "_runBoot", "xp.boot");
  wrapSync(sidekick, "paint", "sidekick.paint");
  wrapAsync(sidekick, "_captureFormNow", "sidekick.capture");
  wrapAsync(sidekick, "init", "sidekick.init");

  myspace?.setFrameHandler?.(() => markScreen("crt"));
  markScreen("crt");
  sidekick.setFrameHandler(() => markScreen("sidekick"));
  void sidekick.init().then(() => markScreen("sidekick"));

  const duoMail = new DuoMailOverlay({
    onOpenCaseStudy: (slug) => {
      duoCaseStudy.open(slug);
      worker.postMessage({ type: "duo", action: "poseCaseStudy", slug });
    },
    onRequestClose: () => worker.postMessage({ type: "duo", action: "close" }),
    onSelect: () => scheduleDuoRaster("select"),
    onProjectionDirty: () => scheduleDuoRaster("dirty")
  });
  const duoCaseStudy = new DuoCaseStudyOverlay({
    onBack: () => worker.postMessage({ type: "duo", action: "back" }),
    onClose: () => worker.postMessage({ type: "duo", action: "close" })
  });
  wrapSync(duoMail, "open", "duo.open");
  wrapSync(duoMail, "close", "duo.close");
  wrapSync(duoMail, "setScreenRect", "duo.screenRect");
  wrapSync(duoMail, "_applyLayout", "duo.layout");
  wrapSync(duoCaseStudy, "open", "duo.caseOpen");
  wrapSync(duoCaseStudy, "close", "duo.caseClose");

  function longTaskLabel(entry) {
    const attr = entry.attribution?.[0];
    const script = attr?.containerSrc || "";
    const container = attr?.containerName || attr?.containerId || "";
    const type = attr?.containerType || "";
    const bits = [entry.name || "longtask", type, container, script].filter(Boolean);
    return `longtask:${bits.join(":")}`;
  }

  if (typeof PerformanceObserver !== "undefined") {
    try {
      const gaps = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < 20) continue;
          noteMainGap(longTaskLabel(entry), entry.duration, {
            kind: entry.entryType || "longtask"
          });
        }
      });
      gaps.observe({ type: "longtask", buffered: true });
    } catch {
      /* longtask is not in every browser */
    }
    try {
      const events = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < 20) continue;
          noteMainGap(`event:${entry.name || "input"}`, entry.duration, { kind: "event" });
        }
      });
      events.observe({ type: "event", buffered: true, durationThreshold: 20 });
    } catch {
      /* event timing is not in every browser */
    }
  }

  let duoCaptureBusy = false;
  let duoCaptureAgain = false;
  let duoInteractionLive = false;
  let duoCachedVersion = "";
  window.__duoToCanvas = { warm: 0, live: 0, skipped: 0 };
  window.__duoLive = false;

  function markDuoLive() {
    duoInteractionLive = true;
    window.__duoLive = true;
  }

  /**
   * Pass F — flight-recorder pill (Shift+D in the worker toggles it; the
   * worker has no DOM, so the page owns the actual element). Clicking the
   * pill fetches the full dump over the existing debug-call bridge and
   * downloads it as .json — the "Shift+D+click to save" UX from the spec,
   * read as "Shift+D opens the pill, clicking the pill saves."
   */
  let flightPillEl = null;
  function updateFlightPill(msg) {
    if (!msg.visible) {
      flightPillEl?.remove();
      flightPillEl = null;
      return;
    }
    if (!flightPillEl) {
      flightPillEl = document.createElement("button");
      flightPillEl.type = "button";
      flightPillEl.id = "flight-recorder-pill";
      flightPillEl.style.cssText = [
        "position:fixed",
        "right:12px",
        "bottom:12px",
        "z-index:999999",
        "font:11px/1.4 ui-monospace,monospace",
        "color:#eafff2",
        "background:rgba(10,20,16,0.82)",
        "border:1px solid rgba(255,255,255,0.25)",
        "border-radius:8px",
        "padding:6px 10px",
        "cursor:pointer",
        "pointer-events:auto"
      ].join(";");
      flightPillEl.addEventListener("click", async () => {
        flightPillEl.textContent = "flight: saving…";
        try {
          const dump = await window.__stageDebug("flightDump");
          const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `flight-recorder-${Date.now()}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch (err) {
          console.warn("[FlightRecorder] save failed:", err);
        }
      });
      document.body.appendChild(flightPillEl);
    }
    const counts = Object.entries(msg.counts || {})
      .map(([k, v]) => `${k}:${v}`)
      .join(" ") || "none yet";
    flightPillEl.textContent = `flight #${msg.frameCount ?? 0} — ${counts} (click to save)`;
  }

  /**
   * Pass J item 6 — everything the phone screen must mirror: visible text,
   * open state, selection, both scroll offsets, and the hovered row. Any
   * change here is a capture; nothing else is.
   * @param {HTMLElement} shell
   */
  function duoShellVersion(shell) {
    const text = (shell.textContent || "").replace(/\s+/g, " ").trim();
    const list = shell.querySelector(".duo-mail__list");
    const preview = shell.querySelector(".duo-mail__preview");
    return [
      text.length,
      text.slice(0, 120),
      shell.classList.contains("is-visible") ? "open" : "closed",
      duoMail.selectedSlug ?? "",
      Math.round(list?.scrollTop ?? 0),
      Math.round(preview?.scrollTop ?? 0),
      duoHoverIndex
    ].join("|");
  }

  /** Index of the list row under the pointer (-1 = none). */
  let duoHoverIndex = -1;
  document.addEventListener(
    "pointerover",
    (event) => {
      const shell = duoMail.shell;
      if (!shell) return;
      const row = event.target?.closest?.(".duo-mail__row");
      const rows = row && shell.contains(row) ? [...shell.querySelectorAll(".duo-mail__row")] : null;
      const idx = rows ? rows.indexOf(row) : -1;
      if (idx === duoHoverIndex) return;
      duoHoverIndex = idx;
      scheduleDuoRaster("hover");
    },
    { passive: true }
  );

  /** src -> downscaled JPEG data URL for the Mail capture (built once). */
  const duoHeroCache = new Map();
  /** @param {HTMLImageElement} img */
  function duoSmallHero(img) {
    const src = img.currentSrc || img.src;
    if (!src || !img.complete || !img.naturalWidth) return null;
    let url = duoHeroCache.get(src);
    if (url) return url;
    const w = Math.min(img.naturalWidth, Math.round(DUO_CAPTURE_W * 0.75));
    const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    url = c.toDataURL("image/jpeg", 0.86);
    duoHeroCache.set(src, url);
    return url;
  }

  /**
   * Offscreen in-flow clone. The live shell is position:fixed and paints white.
   * Clones lose scroll position and :hover, so both are re-applied here.
   * @param {HTMLElement} source
   */
  function buildDuoCaptureClone(source) {
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.setAttribute("data-duo-mail-capture-host", "1");
    host.style.cssText = [
      "position:fixed",
      "left:-12000px",
      "top:0",
      `width:${DUO_CAPTURE_W}px`,
      `height:${DUO_CAPTURE_H}px`,
      "overflow:hidden",
      "pointer-events:none",
      "opacity:1",
      "z-index:-1"
    ].join(";");
    const clone = /** @type {HTMLElement} */ (source.cloneNode(true));
    clone.classList.add("is-visible");
    clone.style.cssText = [
      "position:relative",
      "left:0",
      "top:0",
      `width:${DUO_CAPTURE_W}px`,
      `height:${DUO_CAPTURE_H}px`,
      "max-width:none",
      "max-height:none",
      "opacity:1",
      "visibility:visible",
      "transform:none",
      "animation:none",
      "background:linear-gradient(180deg,#f2f8fb 0%,#e8f2f7 100%)",
      "color:#1c1c1e",
      "display:flex",
      "flex-direction:column",
      "overflow:hidden",
      "pointer-events:none"
    ].join(";");
    for (const sel of [".duo-mail__list", ".duo-mail__preview"]) {
      const from = source.querySelector(sel);
      const to = clone.querySelector(sel);
      const y = Math.round(from?.scrollTop ?? 0);
      if (!to || y <= 0) continue;
      to.style.overflow = "hidden";
      for (const child of to.children) child.style.transform = `translateY(${-y}px)`;
    }
    if (duoHoverIndex >= 0) {
      clone.querySelectorAll(".duo-mail__row")[duoHoverIndex]?.classList.add("is-hover");
    }
    // The hero webp is embedded as base64 into the SVG on every capture and
    // re-decoded each time; swap in a cached copy sized for the capture.
    const liveHero = source.querySelector("img.duo-mail__hero");
    const cloneHero = clone.querySelector("img.duo-mail__hero");
    const small = liveHero && duoSmallHero(liveHero);
    if (cloneHero && small) {
      cloneHero.removeAttribute("loading");
      cloneHero.src = small;
    }
    const style = document.createElement("style");
    style.textContent =
      "[data-duo-mail-capture-host] .duo-mail__row.is-hover:not(.is-active){background:rgba(0,160,220,0.08)}";
    host.appendChild(style);
    host.appendChild(clone);
    document.body.appendChild(host);
    return host;
  }

  /**
   * Pass J item 6 — capture on every overlay change, at most every
   * DUO_MIN_INTERVAL_MS (<= 10 fps), never per frame. Trailing edge: a change
   * inside the window schedules one capture at the window's end, so the last
   * state always lands. The old `duoInteractionLive` lock (set for good at
   * Enter / black-hole exit) skipped every capture after the intro — the
   * phone stayed frozen on the pre-flight warm frame.
   */
  const DUO_MIN_INTERVAL_MS = 100;
  /**
   * Only the properties the Mail layout actually uses. Chrome returns an
   * empty computed `cssText`, so html-to-image otherwise copies all ~350
   * computed properties onto every cloned node — the bulk of the 66–111 ms
   * per capture measured before this list.
   */
  const DUO_CAPTURE_STYLE_PROPS = [
    "display", "position", "top", "right", "bottom", "left", "z-index", "box-sizing",
    "width", "height", "min-width", "min-height", "max-width", "max-height",
    "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
    "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis", "order",
    "align-items", "align-self", "align-content", "justify-content", "justify-items", "gap", "row-gap", "column-gap",
    "grid-template-columns", "grid-template-rows", "grid-column", "grid-row",
    "overflow-x", "overflow-y", "visibility", "opacity", "transform", "transform-origin",
    "color", "background-color", "background-image", "background-size", "background-position", "background-repeat",
    "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing",
    "text-align", "text-transform", "text-overflow", "text-decoration-line", "white-space",
    "word-break", "overflow-wrap", "vertical-align", "object-fit", "object-position",
    "-webkit-line-clamp", "-webkit-box-orient", "content", "list-style-type", "fill", "stroke"
  ];
  let duoLastCaptureAt = -Infinity;
  let duoTrailingTimer = 0;
  /** performance.timeOrigin-based ms of the first change not yet captured. */
  let duoDirtySince = 0;

  function scheduleDuoRaster(reason) {
    const shell = duoMail.shell;
    if (!shell) return;
    const version = duoShellVersion(shell);
    if (reason !== "warm" && version === duoCachedVersion && !duoCaptureBusy) {
      duoDirtySince = 0;
      return;
    }
    if (!duoDirtySince) duoDirtySince = performance.timeOrigin + performance.now();
    if (duoCaptureBusy) {
      duoCaptureAgain = true;
      return;
    }
    const wait = DUO_MIN_INTERVAL_MS - (performance.now() - duoLastCaptureAt);
    if (wait > 0) {
      if (!duoTrailingTimer) {
        duoTrailingTimer = setTimeout(() => {
          duoTrailingTimer = 0;
          scheduleDuoRaster("trailing");
        }, wait);
      }
      return;
    }
    void postDuoGlass(reason, version);
  }

  async function postDuoGlass(reason, version) {
    const shell = duoMail.shell;
    if (!shell) return;
    duoCaptureBusy = true;
    duoLastCaptureAt = performance.now();
    const startAt = performance.timeOrigin + performance.now();
    const dirtyAt = duoDirtySince || startAt;
    duoDirtySince = 0;
    const host = buildDuoCaptureClone(shell);
    const t0 = performance.now();
    try {
      pageTrigger = `duo:${reason || "raster"}`;
      const captured = await toCanvas(host, {
        pixelRatio: 1,
        canvasWidth: DUO_CAPTURE_W,
        canvasHeight: DUO_CAPTURE_H,
        cacheBust: false,
        backgroundColor: "#eef5f8",
        fontEmbedCSS: "",
        // The host sits at left:-12000px to stay off screen; html-to-image
        // copies the root's computed style into the SVG, which put the whole
        // capture 12000 px off its own canvas — every Mail mirror frame was
        // the background fill alone. Re-anchor the root inside the capture.
        style: { position: "relative", left: "0px", top: "0px", zIndex: "auto" },
        ...(window.__duoFullStyle ? {} : { includeStyleProperties: DUO_CAPTURE_STYLE_PROPS })
      });
      const ms = performance.now() - t0;
      // DEV/verification: keep the last capture when a probe asks for it.
      if (window.__duoKeepCapture) window.__duoLastCapture = captured.toDataURL("image/png");
      if (duoInteractionLive) window.__duoToCanvas.live += 1;
      else window.__duoToCanvas.warm += 1;
      noteMainGap("toCanvas:duo", ms);
      duoCachedVersion = version || duoShellVersion(shell);
      const b0 = performance.now();
      const bitmap = await createImageBitmap(captured);
      rememberPage("bitmap:duo", performance.now() - b0);
      worker.postMessage(
        {
          type: "updateDuoTexture",
          bitmap,
          meta: {
            version: duoCachedVersion,
            dirtyAt,
            startAt,
            postAt: performance.timeOrigin + performance.now(),
            captureMs: Math.round(ms)
          }
        },
        [bitmap]
      );
    } catch (error) {
      console.warn("[stageHost] duo glass bitmap", reason, error);
    } finally {
      host.remove();
      duoCaptureBusy = false;
      if (duoCaptureAgain) {
        duoCaptureAgain = false;
        scheduleDuoRaster("retry");
      }
    }
  }

  /** Pass J item 6 verification — the overlay's current mirror signature. */
  window.__duoMirrorVersion = () => (duoMail.shell ? duoShellVersion(duoMail.shell) : null);

  requestAnimationFrame(() => scheduleDuoRaster("warm"));

  const fader = document.getElementById("fader");
  // Pass J item 7 — Shift+K.
  new GroundFogTuner({
    onChange: (params) => worker.postMessage({ type: "groundFog", params })
  });
  const pixelTuner = new PixelBudgetTuner({
    initial: REST_PIXEL_BUDGET_MP,
    onChange: (megapixels) => worker.postMessage({ type: "pixelBudget", megapixels })
  });

  const msgStats = {};
  window.__msgStats = msgStats;
  function noteMsg(msg) {
    const type = msg?.type === "duo" ? `duo:${msg.action || "msg"}` : msg?.type === "crt" ? `crt:${msg.command || "msg"}` : msg?.type === "sidekick" ? `sidekick:${msg.command || "msg"}` : msg?.type || "unknown";
    const bitmap = msg?.bitmap;
    let bytes = 48;
    if (bitmap && bitmap.width && bitmap.height) bytes += bitmap.width * bitmap.height * 4;
    else if (msg.rect) bytes += 80;
    else if (typeof msg.message === "string") bytes += msg.message.length;
    else if (msg.type === "floor") bytes += 256;
    const row = msgStats[type] || (msgStats[type] = { count: 0, bytes: 0 });
    row.count += 1;
    row.bytes += bytes;
  }

  worker.onmessage = (event) => {
    const msg = event.data;
    if (!msg || typeof msg.type !== "string") return;
    noteMsg(msg);
    const msgT0 = performance.now();

    if (msg.type === "ready") {
      fader?.classList.add("gone");
      fader?.classList.remove("is-gating");
    }

    if (msg.type === "bootProgress" && fader) {
      fader.style.setProperty("--boot-progress", String(msg.progress ?? 0));
    }

    if (msg.type === "stops") {
      hud.setStops(msg.stops || [], (index) => {
        worker.postMessage({ type: "goTo", index });
      });
    }

    if (msg.type === "stopChange") {
      pageTrigger = "hop";
      hud.updateCaption(msg.data || {});
    }

    if (msg.type === "hud") {
      if (typeof msg.fps === "number") hud.setFps(msg.fps);
      if (msg.readout) hud.setReadout(msg.readout);
    }

    if (msg.type === "flight") {
      updateFlightPill(msg);
    }

    if (msg.type === "dom") {
      if (typeof msg.blackHole === "boolean") {
        document.body.classList.toggle("is-black-hole", msg.blackHole);
        if (msg.blackHole) scheduleDuoRaster("capture");
        else markDuoLive();
      }
      const enter = document.getElementById("bh-enter");
      if (enter && typeof msg.enterVisible === "boolean") {
        if (msg.enterVisible) enter.removeAttribute("hidden");
        else enter.setAttribute("hidden", "");
      }
    }

      if (msg.type === "floor") {
        window.__floor = msg;
      }
      window.__resetFloor = () => worker.postMessage({ type: "floorReset" });
      if (msg.type === "pixelBudget") {
      pixelTuner.setState(msg);
    }

    if (msg.type === "crt") {
      pageTrigger = `crt:${msg.command || "msg"}`;
      const screen = hud.getMySpaceScreen();
      if (!screen) {
        noteMainGap(`host:${msg.type}`, performance.now() - msgT0, { kind: "message" });
        return;
      }
      if (msg.command === "playPowerOn") void screen.playPowerOn();
      else if (msg.command === "setHover") screen.setHover(msg.uv, msg.id);
      else if (msg.command === "backToDashboard") screen.backToDashboard();
      else if (msg.command === "pointer") screen.handlePointer(msg.uv);
      else if (msg.command === "wheel") screen.handleWheel(msg.deltaY);
    }

    if (msg.type === "sidekick") {
      pageTrigger = `sidekick:${msg.command || "msg"}`;
      if (msg.command === "flipToCompose") void sidekick.flipToCompose();
      else if (msg.command === "snapToSplash") sidekick.snapToSplash();
      else if (msg.command === "flipToSplash") void sidekick.flipToSplash();
      else if (msg.command === "pointer") sidekick.handlePointer(msg.uv);
    }

    if (msg.type === "pointerBuf" && msg.buf) {
      pointerSlots[msg.slot] = msg.buf;
      pointerFree[msg.slot] = true;
      if (pointerDirty) postPointerBuf();
    }

    if (msg.type === "mailTrace") {
      window.__mailTrace = window.__mailTrace || [];
      window.__mailTrace.push({ hit: msg.hit, x: msg.x, y: msg.y, live: msg.live, state: msg.state, t: Math.round(performance.now()) });
      if (window.__mailTrace.length > 24) window.__mailTrace.shift();
    }

    if (msg.type === "crtLive") {
      pageTrigger = `crtLive:${msg.action || "msg"}`;
      if (msg.action === "screenRect") hud.crtLive?.setScreenRect(msg.rect);
      else if (msg.action === "live") hud.crtLive?.setLive(Boolean(msg.live));
    }

    if (msg.type === "duo") {
      pageTrigger = `duo:${msg.action || "msg"}`;
      if (msg.action === "openMail") duoMail.open();
      else if (msg.action === "openCaseStudy") duoCaseStudy.open(msg.slug);
      else if (msg.action === "state" && msg.state === "idle") {
        duoMail.close();
        duoCaseStudy.close();
      }
      else if (msg.action === "screenRect") {
        window.__duoRect = msg.rect;
        duoMail.setScreenRect(msg.rect);
      }
      else if (msg.action === "capture") scheduleDuoRaster("capture");
    }

    if (msg.type === "error") {
      console.error("[stage.worker]", msg.message);
    }
    if (msg.type === "debugResult") {
      const resolve = debugCallPending.get(msg.id);
      if (resolve) {
        debugCallPending.delete(msg.id);
        resolve(msg.result);
      }
    }
    noteMainGap(`host:${msg.type}`, performance.now() - msgT0, { kind: "message" });
  };

  return { worker, hud };
}
