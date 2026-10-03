/**
 * Pass F — flight recorder. Always available, gated off by default (`?flight=1`
 * to enable, near-zero cost otherwise — the module isn't even instantiated).
 *
 * Collects a per-frame record into a 240-frame ring buffer, and on a BLINK /
 * POP-IN / SLOW trigger, freezes a snapshot (120 frames before, 30 after) so
 * the exact cause of a presented black frame or an un-ramped pop-in can be
 * read back after the fact, instead of guessed from a screen recording.
 *
 * `compileHeldRoot` (stageModelReveal.js) and the StageExperience
 * resize/bake paths report into this via the module-level
 * `noteFlight()` — a `setActiveFrameBudget`-style singleton, so call sites
 * don't need a recorder reference threaded through them.
 *
 * Known limitation: BLACK samples a literal 2x2 pixel block at canvas
 * center, not a real "is the frame black" judgement — it will fire (and is
 * meant only as a secondary signal) if the camera genuinely has dark scene
 * content sitting at dead-center, independent of any skip/visibility bug.
 * Cross-check a BLACK snapshot's `skipBeauty`/`worldVisible`/`visCensus`
 * fields before treating it as a real repro; BLINK and POP-IN are the
 * load-bearing triggers.
 *
 * Pass I: `gpuMs` is confirmed unreliable on ANGLE/Metal — EXT_disjoint_
 * timer_query_webgl2 results there don't track real cost (measured: median
 * 58ms while the actual settled rate was ~46fps, i.e. ≤~22ms/frame). Do not
 * use `gpuMs` for cost decisions; it's left in the record for whatever
 * signal it's still worth, but `cpuWorkMs` (real wall-clock inside
 * `_animate`, not the inter-frame interval `frameMs` is) and `cpuSections`
 * (that same tick broken down by named span) are the trustworthy numbers.
 * For actual GPU cost, A/B: toggle the thing off, measure settled fps over
 * a few seconds, compare.
 */

const RING_SIZE = 240;
const MAX_SNAPSHOTS_PER_KIND = 6;
const PRE_FRAMES = 120;
const POST_FRAMES = 30;
const SLOW_MS = 1000 / 24; // 41.7ms — the stated 24fps floor
const TRIGGER_REFIRE_GAP_MS = 500;
const BLACK_CHECK_EVERY_N = 10;

/** @type {FlightRecorder | null} */
let active = null;

export function setActiveFlightRecorder(recorder) {
  active = recorder;
}

/** Cheap no-op when no recorder is active (the `?flight=1` default-off case). */
export function noteFlight(kind, data) {
  active?.note(kind, data);
}

export function readFlightEnabled(search) {
  const params = new URLSearchParams(search != null ? search : window.location.search);
  const v = params.get("flight");
  return v === "1" || v === "true";
}

export class FlightRecorder {
  /**
   * @param {{
   *   renderer: import("three").WebGLRenderer,
   *   roots: { label: string, get: () => import("three").Object3D | null }[]
   * }} opts
   */
  constructor({ renderer, roots }) {
    this.renderer = renderer;
    this.roots = roots;
    /** @type {object[]} newest last */
    this.ring = [];
    this.frameIndex = 0;
    /** @type {object[]} */
    this.snapshots = [];
    /** @type {object[]} snapshots still collecting their post-trigger window */
    this._armedPost = [];
    this._pendingNotes = [];
    this._lastFired = {};
    // Pass G — true totals, independent of the refire-throttled snapshot
    // pool: "report ALL trigger counts, not only the causes you fixed."
    this._totalCounts = {};
    this._totalCountsByPhase = {};
    this._reasonCounts = {};
    /** @type {object[]} up to 10, sorted desc by frameMs, independent of SLOW's refire throttle. */
    this._topSlow = [];
    this._prevProgramCount = renderer?.info?.programs?.length ?? 0;
    this._frameUploads = 0;
    this._frameResizes = [];
    this._frameBakes = [];
    this._blackCheckCounter = 0;
    this.lastBlackLuminance = null;
    this._prevHarvestedBlack = null;
    this._meshCache = new Map();
    this._initBlackReadback();
    this._initGpuTimer();
  }

  /**
   * Pass H item 1 — GPU ms for the beauty pass, via
   * EXT_disjoint_timer_query_webgl2. A TIME_ELAPSED query can only have one
   * instance active at a time per target, and its result isn't available
   * until a later frame (often the next one) — queue of in-flight queries,
   * polled every endFrame, each one resolved into the record for the frame
   * it was taken on (not the frame it happens to resolve on).
   */
  _initGpuTimer() {
    const gl = this.renderer?.getContext?.();
    this._gpuTimerExt =
      gl?.getExtension?.("EXT_disjoint_timer_query_webgl2") ?? null;
    this._gpuQueryPending = [];
  }

  /** Call right before the beauty render. No-op if the extension is unavailable. */
  beginGpuTimer() {
    const gl = this._gl ?? this.renderer?.getContext?.();
    const ext = this._gpuTimerExt;
    if (!gl || !ext || this._gpuQueryActive) return;
    const query = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    this._gpuQueryActive = query;
  }

  /** Call right after the beauty render. Tags the pending result with the current frame index. */
  endGpuTimer() {
    const gl = this._gl ?? this.renderer?.getContext?.();
    const ext = this._gpuTimerExt;
    if (!gl || !ext || !this._gpuQueryActive) return;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    this._gpuQueryPending.push({ query: this._gpuQueryActive, frame: this.frameIndex });
    this._gpuQueryActive = null;
  }

  /** Non-blocking: harvests any queries whose result is ready, returns {frame, ms}[]. */
  _pollGpuTimers() {
    const gl = this._gl ?? this.renderer?.getContext?.();
    if (!gl || !this._gpuQueryPending.length) return [];
    const resolved = [];
    this._gpuQueryPending = this._gpuQueryPending.filter(({ query, frame }) => {
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return true;
      const ns = gl.getQueryParameter(query, gl.QUERY_RESULT);
      resolved.push({ frame, ms: +(ns / 1e6).toFixed(3) });
      gl.deleteQuery(query);
      return false;
    });
    return resolved;
  }

  /**
   * BLACK trigger readback, PBO + fence based (WebGL2) — never blocks the
   * frame that requests it. `gl.readPixels` straight to CPU memory forces a
   * full pipeline sync (the thing that turned on the first flight run: 2–13
   * fps the instant this ran every-10th-frame with a blocking read). A
   * request here queues a GPU->PBO copy and a fence; a *later* frame polls
   * the fence non-blockingly and only reads the (by-then-ready) buffer back
   * once it's signaled. One request in flight at a time.
   */
  _initBlackReadback() {
    const gl = this.renderer?.getContext?.();
    this._blackReadbackSupported = Boolean(
      gl && gl.createBuffer && gl.PIXEL_PACK_BUFFER != null && typeof gl.fenceSync === "function"
    );
    if (!this._blackReadbackSupported) return;
    this._gl = gl;
    // Pass G: 4 points at 25%/75% of width/height instead of dead-center —
    // the hold's black hole has a genuinely black core sitting exactly at
    // canvas center, which made every BLACK reading during the hold a false
    // positive on real (intended) content, not a skip/visibility bug. One
    // PBO, 4 separate 2x2 reads at distinct byte offsets, one fence after
    // the last — by the time that fence signals, all 4 copies are done.
    this._blackPbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._blackPbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, 64, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this._blackPending = null;
  }

  _requestBlackReadback() {
    if (!this._blackReadbackSupported || this._blackPending) return;
    const gl = this._gl;
    const canvas = this.renderer.domElement;
    const points = [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75]
    ];
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._blackPbo);
    points.forEach(([fx, fy], i) => {
      const cx = Math.max(0, Math.floor(canvas.width * fx) - 1);
      const cy = Math.max(0, Math.floor(canvas.height * fy) - 1);
      gl.readPixels(cx, cy, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, i * 16);
    });
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    this._blackPending = { sync };
  }

  /** Non-blocking: returns a value only once that fence has actually signaled. */
  _pollBlackReadback() {
    if (!this._blackReadbackSupported || !this._blackPending) return null;
    const gl = this._gl;
    const status = gl.clientWaitSync(this._blackPending.sync, 0, 0);
    if (status === gl.TIMEOUT_EXPIRED) return null;
    gl.deleteSync(this._blackPending.sync);
    this._blackPending = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._blackPbo);
    const px = new Uint8Array(64);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, px);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    let sum = 0;
    for (let i = 0; i < 16; i += 1) {
      const o = i * 4;
      sum += (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) / 255;
    }
    return +(sum / 16).toFixed(3);
  }

  /** Any module can report an event into the frame currently being built. */
  note(kind, data) {
    this._pendingNotes.push({ kind, data, t: Math.round(performance.now()) });
    if (kind === "texture-upload") this._frameUploads += 1;
    if (kind === "resize") this._frameResizes.push(data);
    if (kind === "bake") this._frameBakes.push(data);
  }

  beginFrame() {
    this._pendingNotes = [];
    this._frameUploads = 0;
    this._frameResizes = [];
    this._frameBakes = [];
  }

  /**
   * Pass G: call this immediately after the real `post.render()` call — NOT
   * at the end of the frame, after duoFab/waterCursor/HUD work has also run.
   * A hide-then-restore that happens entirely between this point and the
   * previous call (e.g. still inside `_tickModelReveal`, before `render()`)
   * is correctly invisible to this census, because it genuinely never
   * reached the screen; the bug this exists to catch is the opposite case
   * — something hidden *during* the real render and only restored
   * afterward, which this now samples while it's still actually hidden.
   * When beauty was skipped this frame (nothing new presented), carries the
   * last real sample forward instead of re-deriving a fresh (meaningless —
   * nothing changed on screen) one.
   */
  sampleVisibilityAtPresent(skippedBeauty) {
    if (skippedBeauty) {
      this._pendingVisCensus = this._lastVisCensus ?? {};
      return;
    }
    const visCensus = {};
    for (const { label, get } of this.roots) {
      let root = null;
      try {
        root = get();
      } catch {
        root = null;
      }
      if (!root) {
        visCensus[label] = null;
        continue;
      }
      // Cache the representative mesh per root (found once) instead of a
      // full subtree traverse every frame — the apple tree alone is dozens
      // of meshes, times 11 roots, times every frame adds up for free.
      let mesh = this._meshCache.get(root);
      if (mesh === undefined) {
        mesh = null;
        root.traverse((obj) => {
          if (mesh || !obj.isMesh || !obj.material) return;
          const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
          if (mat && typeof mat.opacity === "number") mesh = obj;
        });
        this._meshCache.set(root, mesh);
      }
      const mat = mesh ? (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) : null;
      const opacity = mat && typeof mat.opacity === "number" ? mat.opacity : 1;
      // "hidden at present": this root, or any ancestor up to the scene,
      // was non-visible at the exact moment it should have been drawn —
      // catches a hidden *parent* (e.g. the old hideSceneExcept pattern)
      // even though the root object's own `.visible` never changed.
      let hiddenAtPresent = !root.visible;
      let p = root.parent;
      while (p && !hiddenAtPresent) {
        if (p.visible === false) hiddenAtPresent = true;
        p = p.parent;
      }
      visCensus[label] = {
        visible: Boolean(root.visible),
        opacity: +opacity.toFixed(3),
        hiddenAtPresent
      };
    }
    this._pendingVisCensus = visCensus;
    this._lastVisCensus = visCensus;
  }

  /**
   * @param {{
   *   frameMs: number, governorLevel: number | null, pixelRatio: number,
   *   drawingBuffer: { w: number, h: number }, frameCause: string | null,
   *   skipBeauty: boolean, chunkPending: number, chunkMipmapPending: number
   * }} ctx
   */
  endFrame(ctx) {
    const visCensus = this._pendingVisCensus ?? {};
    const programs = this.renderer?.info?.programs?.length ?? 0;
    const programsCreated = Math.max(0, programs - this._prevProgramCount);
    this._prevProgramCount = programs;

    // Harvest whatever the PBO readback from ~1-2 frames ago turned up
    // (non-blocking — null if that fence hasn't signaled yet), then queue
    // the next one every Nth frame. Never reads and requests on the same
    // frame; that would just be a slower way to force the same stall.
    const harvested = this._pollBlackReadback();
    let blackLuminance = null;
    let blackLuminancePrev = null;
    if (harvested != null) {
      blackLuminance = harvested;
      blackLuminancePrev = this._prevHarvestedBlack;
      this._prevHarvestedBlack = harvested;
      this.lastBlackLuminance = harvested;
    }
    this._blackCheckCounter += 1;
    if (!ctx.skipBeauty && this._blackCheckCounter >= BLACK_CHECK_EVERY_N) {
      this._blackCheckCounter = 0;
      this._requestBlackReadback();
    }

    const record = {
      frame: this.frameIndex++,
      t: Math.round(performance.now()),
      frameMs: ctx.frameMs != null ? +ctx.frameMs.toFixed(2) : null,
      gpuMs: null,
      governorNotch: ctx.governorLevel ?? null,
      pixelRatio: ctx.pixelRatio != null ? +ctx.pixelRatio.toFixed(3) : null,
      drawingBuffer: ctx.drawingBuffer ?? null,
      frameCause: ctx.frameCause ?? null,
      skipBeauty: Boolean(ctx.skipBeauty),
      postRenderRan: !ctx.skipBeauty,
      worldVisible: ctx.worldVisible ?? null,
      warmPhase: ctx.warmPhase ?? null,
      warmLiveAt: ctx.warmLiveAt ?? null,
      warmLiveKind: ctx.warmLiveKind ?? null,
      phase: ctx.phase ?? null,
      // Pass I: gpuMs (below) is confirmed unreliable on ANGLE/Metal —
      // don't make cost decisions from it. cpuWorkMs is the trustworthy
      // number (real wall-clock time inside _animate); cpuSections is the
      // same tick broken down by named span (_markPre + the three
      // already-measured render calls), for naming which section spikes.
      cpuWorkMs: ctx.cpuWorkMs != null ? +ctx.cpuWorkMs.toFixed(2) : null,
      cpuSections: ctx.cpuSections ?? null,
      // Pass G: `renderer.info.render` resets on every individual
      // renderer.render() call — reading it here (after every post-process
      // pass, duoFab, water cursor) always saw whatever tiny fullscreen
      // quad ran last. `sceneTriangles` is captured by the beauty RenderPass
      // itself (PortalAwareRenderPass.lastSceneTriangles) right after the
      // real scene draw, immune to that.
      triangles: ctx.sceneTriangles ?? null,
      programs,
      programsCreated,
      texturesUploaded: this._frameUploads,
      chunkPending: ctx.chunkPending ?? null,
      chunkMipmapPending: ctx.chunkMipmapPending ?? null,
      resizes: this._frameResizes.length ? this._frameResizes.slice() : null,
      bakes: this._frameBakes.length ? this._frameBakes.slice() : null,
      blackLuminance,
      blackLuminancePrev,
      visCensus,
      events: this._pendingNotes.length ? this._pendingNotes.slice() : null
    };

    this.ring.push(record);
    if (this.ring.length > RING_SIZE) this.ring.shift();

    // GPU timer results land on a *later* frame than the one they measured
    // — patch the already-pushed record for that frame (and any already-
    // captured snapshot windows holding a reference to the same object).
    for (const { frame, ms } of this._pollGpuTimers()) {
      const target = this.ring.find((r) => r.frame === frame);
      if (target) target.gpuMs = ms;
    }

    this._appendPost(record);
    this._detectTriggers(record);
  }

  _appendPost(record) {
    if (!this._armedPost.length) return;
    this._armedPost = this._armedPost.filter((snap) => {
      snap.post.push(record);
      return snap.post.length < POST_FRAMES;
    });
  }

  _detectTriggers(record) {
    const prev = this.ring.length >= 2 ? this.ring[this.ring.length - 2] : null;

    if (record.frameMs != null && record.frameMs > SLOW_MS) {
      this._fire("SLOW", record, `frameMs=${record.frameMs} (cause: ${record.frameCause ?? "unknown"})`);
    }

    if (!prev) return;

    if (
      prev.triangles != null &&
      record.triangles != null &&
      prev.triangles > 0 &&
      record.triangles < prev.triangles * 0.5
    ) {
      this._fire("BLINK", record, `triangles ${prev.triangles} -> ${record.triangles}`);
    }

    if (record.skipBeauty) {
      this._fire("BLINK", record, `beauty render skipped (${record.frameCause ?? "unknown cause"}) — presented frame is a repeat of the last drawn buffer`);
    }

    for (const label of Object.keys(record.visCensus)) {
      const a = prev.visCensus[label];
      const b = record.visCensus[label];
      if (!a || !b) continue;
      // The black hole's own hide is a deliberate, scripted one-shot at the
      // spiral->drop handoff (`_onBlackHoleSpiralComplete` calls
      // `blackHole.hide()`) — not a bug. Only flag it outside that moment.
      const isExpectedBlackHoleHide = label === "black-hole" && record.phase === "drop";
      if (a.visible && !b.visible && !isExpectedBlackHoleHide) {
        this._fire("BLINK", record, `${label} went visible -> hidden`);
      }
      // `hiddenAtPresent` catches a hidden ancestor even when the root's own
      // `.visible` never flipped — the exact shape of the old
      // hideSceneExcept bug (it hid siblings, not the held root itself).
      if (!a.hiddenAtPresent && b.hiddenAtPresent && !isExpectedBlackHoleHide) {
        this._fire("BLINK", record, `${label} hidden at present (an ancestor was non-visible during render)`);
      }
      const wasGone = !a.visible || a.opacity < 0.05 || a.hiddenAtPresent;
      const nowShown = b.visible && b.opacity > 0.5 && !b.hiddenAtPresent;
      if (wasGone && nowShown) {
        this._fire("POP-IN", record, `${label} ${a.visible ? "opacity " + a.opacity : "hidden"} -> visible opacity ${b.opacity} with no ramp between`);
      }
    }

    if (
      record.blackLuminancePrev != null &&
      record.blackLuminance != null &&
      record.blackLuminancePrev > 0.05 &&
      record.blackLuminance < 0.01
    ) {
      this._fire("BLACK", record, `center luminance ${record.blackLuminancePrev} -> ${record.blackLuminance}`);
    }
  }

  _fire(kind, record, summary) {
    // Totals count every qualifying frame, unthrottled — the refire gap
    // below only governs how many *snapshots* (expensive, 150-frame windows)
    // get kept, not what's reported as having happened.
    this._totalCounts[kind] = (this._totalCounts[kind] ?? 0) + 1;
    const phaseKey = `${kind}:${record.phase ?? "unknown"}`;
    this._totalCountsByPhase[phaseKey] = (this._totalCountsByPhase[phaseKey] ?? 0) + 1;
    // Cheap (just a string counter) per-cause tally so "what caused the 10
    // BLINKs" survives even once the snapshot pool has evicted most of them.
    // Strips the leading "beauty render skipped (X) — ..." down to "X", and
    // a visibility-flip summary down to "<label> visible<->hidden", so the
    // same underlying cause collapses to one key instead of one per frame.
    const reasonKey = /^beauty render skipped \(([^)]*)\)/.exec(summary)?.[1] ?? summary.replace(/\d+(\.\d+)?/g, "#");
    const key = `${kind}:${reasonKey}`;
    this._reasonCounts[key] = (this._reasonCounts[key] ?? 0) + 1;
    if (kind === "SLOW") {
      this._topSlow.push({ frame: record.frame, t: record.t, frameMs: record.frameMs, cause: record.frameCause, phase: record.phase });
      this._topSlow.sort((a, b) => b.frameMs - a.frameMs);
      if (this._topSlow.length > 10) this._topSlow.length = 10;
    }
    const last = this._lastFired[kind];
    if (last != null && record.t - last < TRIGGER_REFIRE_GAP_MS) return;
    this._lastFired[kind] = record.t;
    const snap = {
      kind,
      frame: record.frame,
      t: record.t,
      summary,
      pre: this.ring.slice(-PRE_FRAMES),
      post: []
    };
    this.snapshots.push(snap);
    // Per-kind cap, not a shared pool — a noisy SLOW stretch must not evict
    // the rarer BLINK/POP-IN snapshots that are the actual point of this.
    const sameKind = this.snapshots.filter((s) => s.kind === kind);
    if (sameKind.length > MAX_SNAPSHOTS_PER_KIND) {
      const oldest = sameKind[0];
      this.snapshots.splice(this.snapshots.indexOf(oldest), 1);
    }
    this._armedPost.push(snap);
  }

  /** `window.__stageDebug("flightDump")`. */
  dump() {
    return {
      enabled: true,
      frameCount: this.frameIndex,
      // True totals — every qualifying frame, not just the ones that got a
      // (throttled, capped) snapshot. This is the number to report.
      totalCounts: { ...this._totalCounts },
      totalCountsByPhase: { ...this._totalCountsByPhase },
      reasonCounts: { ...this._reasonCounts },
      topSlow: this._topSlow.slice(),
      snapshotCounts: this.snapshots.reduce((acc, s) => {
        acc[s.kind] = (acc[s.kind] ?? 0) + 1;
        return acc;
      }, {}),
      snapshots: this.snapshots
    };
  }

  pillSummary() {
    return { frameCount: this.frameIndex, counts: { ...this._totalCounts } };
  }
}
