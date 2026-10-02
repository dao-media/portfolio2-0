/**
 * Pass F — flight recorder. Always available, gated off by default (`?flight=1`
 * to enable, near-zero cost otherwise — the module isn't even instantiated).
 *
 * Collects a per-frame record into a 240-frame ring buffer, and on a BLINK /
 * POP-IN / SLOW trigger, freezes a snapshot (120 frames before, 30 after) so
 * the exact cause of a presented black frame or an un-ramped pop-in can be
 * read back after the fact, instead of guessed from a screen recording.
 *
 * `hideSceneExcept` / `compileHeldRoot` (stageModelReveal.js) and the
 * StageExperience resize/bake paths report into this via the module-level
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
    this._prevProgramCount = renderer?.info?.programs?.length ?? 0;
    this._frameUploads = 0;
    this._frameResizes = [];
    this._frameBakes = [];
    this._blackCheckCounter = 0;
    this.lastBlackLuminance = null;
    this._prevHarvestedBlack = null;
    this._meshCache = new Map();
    this._initBlackReadback();
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
    this._blackPbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._blackPbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, 16, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this._blackPending = null;
  }

  _requestBlackReadback() {
    if (!this._blackReadbackSupported || this._blackPending) return;
    const gl = this._gl;
    const canvas = this.renderer.domElement;
    const cx = Math.max(0, Math.floor(canvas.width / 2) - 1);
    const cy = Math.max(0, Math.floor(canvas.height / 2) - 1);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._blackPbo);
    gl.readPixels(cx, cy, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, 0);
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
    const px = new Uint8Array(16);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, px);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    let sum = 0;
    for (let i = 0; i < 4; i += 1) {
      const o = i * 4;
      sum += (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) / 255;
    }
    return +(sum / 4).toFixed(3);
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
   * @param {{
   *   frameMs: number, governorLevel: number | null, pixelRatio: number,
   *   drawingBuffer: { w: number, h: number }, frameCause: string | null,
   *   skipBeauty: boolean, chunkPending: number, chunkMipmapPending: number
   * }} ctx
   */
  endFrame(ctx) {
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
      visCensus[label] = { visible: Boolean(root.visible), opacity: +opacity.toFixed(3) };
    }

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
      triangles: this.renderer?.info?.render?.triangles ?? null,
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
      if (a.visible && !b.visible) {
        this._fire("BLINK", record, `${label} went visible -> hidden`);
      }
      const wasGone = !a.visible || a.opacity < 0.05;
      const nowShown = b.visible && b.opacity > 0.5;
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
      triggerCounts: this.snapshots.reduce((acc, s) => {
        acc[s.kind] = (acc[s.kind] ?? 0) + 1;
        return acc;
      }, {}),
      snapshots: this.snapshots
    };
  }

  pillSummary() {
    const counts = this.snapshots.reduce((acc, s) => {
      acc[s.kind] = (acc[s.kind] ?? 0) + 1;
      return acc;
    }, {});
    return { frameCount: this.frameIndex, counts };
  }
}
