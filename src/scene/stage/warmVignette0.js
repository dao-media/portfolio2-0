import * as THREE from "three";
import { pointOnRing } from "../camera/ringLayout.js";
import { FLOOR_MP_NOTCHES, INACTIVE_VIGNETTE_LAYER, VIGNETTE0_WARM_TEXTURES_PER_FRAME, VIGNETTE0_WARM_MOUNT_WAIT_MS } from "./constants.js";
import { noteFlight } from "./flightRecorder.js";
import { compileFadeVariants, withAuthoredVariant, withFadeVariant } from "./stageModelReveal.js";
import { SHADOW_CUBE_FACES, withShadowFace } from "./faceShadowBake.js";

/** Pass M — run the notch tiers in the black gap (see the tier skip below). */
const GAP_TIER_WARM = false;

const TEXTURE_KEYS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
  "alphaMap",
  "bumpMap",
  "displacementMap",
  "envMap",
  "lightMap"
];

const _bakeTarget = new THREE.WebGLRenderTarget(4, 4, {
  depthBuffer: true,
  stencilBuffer: false
});
// Composer beauty draws into a render target: Linear-sRGB output, no tone map.
// The HUD draws to the canvas: sRGB output and the renderer tone map.
// three only applies that canvas pair when the target is null or flagged XR.
const _screenTarget = new THREE.WebGLRenderTarget(4, 4, {
  depthBuffer: true,
  stencilBuffer: false
});
_screenTarget.isXRRenderTarget = true;
_screenTarget.texture.colorSpace = THREE.SRGBColorSpace;
const _warmCam = new THREE.PerspectiveCamera(42, 1, 0.05, 80);
const _warmPos = new THREE.Vector3();
const _warmLook = new THREE.Vector3();

/**
 * Cursor for {@link stepVignette0Warm}. One unit of GPU work per call.
 */
export function createVignette0WarmState() {
  return {
    phase: "wait",
    done: false,
    // True once Bust's own live step finishes — the drop's only real
    // dependency. "done" still means every stop's live warm has finished.
    bustReady: false,
    meshes: 0,
    meshAt: 0,
    drawAt: 0,
    textures: 0,
    textureAt: 0,
    shadowBaked: false,
    prelit: false,
    drawCalls: 0,
    startedAt: 0,
    _meshList: null,
    _textureList: null
  };
}

/**
 * Spread texture upload and the lantern shadow bake across the approach,
 * then compile each live program key through the real camera and the
 * composer's input buffer. Pixels from those draws are not presented.
 * @param {import("../StageExperience.js").StageExperience} stage
 * @param {ReturnType<typeof createVignette0WarmState>} state
 */
export function stepVignette0Warm(stage, state) {
  if (state.done) return state;
  if (!state.startedAt) state.startedAt = performance.now();

  if (state.phase === "wait") {
    if (!bustMounted(stage)) {
      if (performance.now() - state.startedAt >= VIGNETTE0_WARM_MOUNT_WAIT_MS) {
        finish(state);
      }
      return state;
    }
    state._meshList = collectMeshes(stage);
    state.meshes = state._meshList.length;
    if (state.meshes > 0) {
      state.phase = "compile";
      return state;
    }
    state._textureList = collectTextures(stage);
    state.textures = state._textureList.length;
    state.phase = state.textures > 0 ? "textures" : "shadow";
    return state;
  }

  if (state.phase === "compile") {
    if (state._compilePending) return state;
    if (state._sceneCompiled) {
      state._textureList = collectTextures(stage);
      state.textures = state._textureList.length;
      state.phase = state.textures > 0 ? "textures" : "shadow";
      return state;
    }
    // Still free here — this phase always completes before `bustReady` can
    // ever go true (nothing has unblocked the drop yet, so nothing real is
    // on screen). See the "live" phase below for the site that actually
    // needed the fix (Pass F).
    stage._skipBeauty = true;
    stage._frameCause = "compile";
    state._compilePending = true;
    const pending = compileLiveScene(stage, { stop: 0, hop: false });
    pending.then(
      () => {
        state._sceneCompiled = true;
        state._compilePending = false;
      },
      () => {
        state._sceneCompiled = true;
        state._compilePending = false;
      }
    );
    return state;
  }

  if (state.phase === "textures") {
    const n = Math.max(1, VIGNETTE0_WARM_TEXTURES_PER_FRAME | 0);
    const renderer = stage.renderer;
    for (let i = 0; i < n && state.textureAt < state._textureList.length; i += 1) {
      const tex = state._textureList[state.textureAt];
      state.textureAt += 1;
      if (!renderer || !tex?.isTexture) continue;
      withInactiveLayer(stage.camera, () => {
        try {
          renderer.initTexture(tex);
        } catch (error) {
          console.warn("[warmVignette0] texture upload failed:", error);
        }
      });
    }
    if (state.textureAt >= state._textureList.length) state.phase = "shadow";
    return state;
  }

  if (state.phase === "shadow") {
    state.shadowBaked = bakeLanternShadow(stage);
    stage._frameCause = "shadow-bake";
    stage._skipBeauty = true;
    state.phase = "probe";
    return state;
  }

  if (state.phase === "probe") {
    if (!state._probeWait) state._probeWait = performance.now();
    if (!warmMaterialsReady(stage) && performance.now() - state._probeWait < 25000) {
      return state;
    }
    bakeWarmMaterials(stage);
    // Pass L L5 — Bust's dark environment before its own live step (still
    // hidden), so Enter / the drop never wait on it and nothing swaps live.
    stage._ensureStopEnv?.(0);
    stage._frameCause = "wet-bake";
    stage._skipBeauty = true;
    state.phase = "live";
    state._liveAt = 0;
    const live = liveSteps();
    state._liveSteps = live.steps;
    state._bustStepCount = live.bustStepCount;
    state._liveReady = false;
    return state;
  }

  if (state.phase === "live") {
    const steps = state._liveSteps || [];
    const pastBust = state._liveAt >= (state._bustStepCount ?? 0);
    // Pass G item 3: Bust's own "scene" step (above) only compiles shaders
    // and warms a draw — it says nothing about whether Bust's own chunked
    // textures (the statue's 4096² map) have actually finished uploading.
    // That drains on its own schedule during the normal per-frame budget
    // (`_chunkUploadsAllowed`), fully independent of this sequence, so
    // `bustReady` could — and, per the flight recorder, did — go true while
    // the chunk queue still had rows left: the drop arms, and the texture
    // visibly fills in afterward (same root shape as the reported lantern/
    // bust/tree/grass pop-in split, just via a different channel: geometry
    // reveals as one instant unit already, but Bust's own detail trails it).
    // Hold `bustReady` — not the step progression itself, just the drop
    // trigger that reads it — until the chunk queue is actually empty, or
    // 8s, so a stalled queue can't hang the drop forever.
    // Pass M: `>=`, not `===` — the step after Bust's (edge 0) no longer
    // waits on anything, so with `===` this check got one tick and, if the
    // chunk queue wasn't drained on that tick, never ran again (Enter then
    // waited for the whole warm: 197 s).
    if (state._liveAt >= (state._bustStepCount ?? 0) && !state.bustReady) {
      if (!state._bustTexWait) state._bustTexWait = performance.now();
      const chunksDrained = (stage.chunkedTextures?.pending ?? 0) === 0;
      // Pass I item 5 — also wait for 2 consecutive ticks of a stable draw
      // size (see the tracking in _animate) so the reveal never lands on
      // the same frame as a governor/budget resize.
      const sizeStable = (stage._stableDrawFrames ?? 0) >= 2;
      if ((chunksDrained && sizeStable) || performance.now() - state._bustTexWait > 1200) {
        state.bustReady = true;
        stage._bustTexWaitActive = false;
        noteFlight("bust-ready", { t: Math.round(performance.now()), chunkPending: stage.chunkedTextures?.pending ?? 0 });
      } else {
        // The fast (40ms/frame) chunk-drain budget normally only applies
        // while `_descentPendingWarm` is true (the black-screen window) —
        // but that flag can already be false here (the spiral-complete fast
        // path sets `world.visible` directly without ever setting it),
        // leaving this wait stuck on the slow 4-6ms hold/approach budget:
        // measured 1.8-2.4s to drain the statue's 4096² texture at that
        // rate, which blew test:smoke's 2s spiral-to-drop budget outright.
        // This flag (read by `_chunkUploadBudgetMs`) borrows the same fast
        // budget for this wait specifically, regardless of which path led
        // here — still hidden, still free.
        stage._bustTexWaitActive = true;
      }
    }
    // liveModelsReady needs the other three stops mounted — real dependencies
    // for their own steps below, but not for Bust's own step above, which
    // runs (and can finish) without waiting on them at all.
    if (state._liveAt >= steps.length) {
      state.phase = "extra-textures";
      return state;
    }
    const step = steps[state._liveAt];
    if (pastBust) {
      // Pass M — each stop's steps wait only for that stop (Desktop and
      // Archaeology can be ready while Sidekick is still integrating).
      if (state._modelsWaitAt !== state._liveAt) {
        state._modelsWaitAt = state._liveAt;
        state._modelsWait = performance.now();
      }
      if (!liveModelsReady(stage, step) && performance.now() - state._modelsWait < 25000) {
        return state;
      }
    }
    // DEV — settle-window black-frame investigation: a precise log of which
    // step ran when, independent of external poll timing (`debugLiveStepLog`).
    if (!stage._liveStepLog) stage._liveStepLog = [];
    if (stage._liveStepLog.length < 400) {
      stage._liveStepLog.push({
        tMs: Math.round(performance.now()),
        liveAt: state._liveAt,
        kind: step.kind,
        stop: step.stop ?? null,
        notch: step.notch ?? null
      });
    }
    // Skipping the real composited frame is only free while the world isn't
    // visible yet (the original pre-land hidden warm-up). Once landed,
    // _tickIntroFromCameraRig keeps draining this same "live" sequence in
    // the background every tick — with canvas preserveDrawingBuffer left at
    // its WebGL default (false), skipping the beauty render even one tick
    // while the browser has already presented/discarded the backbuffer
    // produces a real black frame, not a merely-stale one. Every step below
    // already restores camera/visibility/uniform state synchronously before
    // returning, so it's safe to let the beauty pass run this same tick.
    //
    // Pass F: `world.visible` was the wrong proxy for "has anything real
    // been shown yet" — it races with `_bustWarmReady()` at black-hole
    // spiral-complete (`_onBlackHoleSpiralComplete` sets
    // `world.visible = bustReady`, which is often still false at that exact
    // instant; the real `world.visible = true` only lands later, inside
    // `_tickIntroFromCameraRig`'s `_descentPendingWarm` branch). The flight
    // recorder caught a 150+-frame stretch of this skip with `world.visible`
    // already toggled back to a presented, on-screen Bust scene — the "live"
    // phase's later steps (env/smaa/duo waits) kept re-deriving the skip
    // from `world.visible` long after a real frame had already been shown,
    // reproducing the reported "entire Bust scene disappears for ~1.2s"
    // symptom. `state.bustReady` is the actual invariant for this specific
    // phase: false only for Bust's own step (0), before which nothing real
    // is on screen yet and the drop itself is still blocked on this same
    // sequence (skipping stays genuinely free, same perf envelope as
    // before); true for every step after it, by which point the drop has
    // already unblocked and Bust is already presented — so none of them may
    // ever skip again, no matter what `world.visible` says at that instant.
    stage._skipBeauty = !state.bustReady;
    // Only a "scene" step does real synchronous compile/draw work worth
    // flagging — the other kinds are cheap bookkeeping, and setting
    // _frameCause = "compile" unconditionally here starved the chunk-texture
    // queue (every upload branch treats that as "don't touch this frame")
    // for as long as this whole sequence ran, not just the frames that
    // actually needed it.
    if (step.kind === "scene" && !state._liveCompilePending) stage._frameCause = "compile";
    if (state._liveStepNoted !== state._liveAt) {
      state._liveStepNoted = state._liveAt;
      noteFlight("warm-step", { at: state._liveAt, kind: step.kind, stop: step.stop ?? null, notch: step.notch ?? null, bustReady: state.bustReady });
    }
    if (step.kind === "env") {
      const desktop = stage.vignettes?.[1]?.instance;
      if (!desktop?.glassMesh || !stage.liveEnv) {
        if (!state._envWait) state._envWait = performance.now();
        if (performance.now() - state._envWait < 8000) return state;
      }
      bakeCrtEnvironment(stage);
      stage._holdStableLightVariant?.();
      state._liveAt += 1;
      return state;
    }
    if (step.kind === "scene") {
      bakeWarmMaterials(stage);
      // Pass K item 3 — Bust's own step (still hidden, pre-drop) keeps the
      // full composer draw: it is free there and it also links every post
      // pass. Every later stop runs on frames the user may be watching:
      // await its compileAsync (polled each tick, never a forced link
      // mid-frame), then one tiny beauty-only draw per tick (live, authored,
      // fade) — enough to upload buffers/textures, bake its static shadow
      // and build the blend pipelines. No full-size composer draw, no
      // gl.finish.
      const tiny = state.bustReady;
      if (!state._liveReady) {
        state._liveReady = true;
        state._liveCompiled = false;
        state._liveDrawAt = 0;
        state._liveCompilePending = true;
        const t0 = performance.now();
        compileLiveScene(stage, step).then(
          () => {
            state._liveCompiled = true;
            state._liveCompilePending = false;
            noteFlight("warm-step", { at: state._liveAt, kind: "scene-linked", stop: step.stop, ms: Math.round(performance.now() - t0) });
          },
          () => {
            state._liveCompiled = true;
            state._liveCompilePending = false;
          }
        );
        return state;
      }
      if (!state._liveCompiled) return state;
      if (tiny) {
        stage._frameCause = "warm-draw";
        // Pass M M3 — post-land, the stop's static cube shadow bakes one
        // face per tick (6 ticks) instead of six faces in one draw.
        if (state._liveDrawAt === 0 && ((state._liveFace ?? 0) > 0 || faceBakeDue(stage, step))) {
          // Only while the stop is off camera; if it un-culls mid-bake the
          // remaining faces finish in this frame (never a half-baked map on screen).
          const culled = stage.vignettes?.[step.stop]?.group?.userData?._stopCulled !== false;
          do {
            drawLiveSceneTiny(stage, step, 0, state._liveFace ?? 0);
            state._liveFace = (state._liveFace ?? 0) + 1;
          } while (!culled && state._liveFace < SHADOW_CUBE_FACES);
          if (state._liveFace < SHADOW_CUBE_FACES) return state;
          state._liveFace = 0;
          state._liveDrawAt = 1;
          return state;
        }
        drawLiveSceneTiny(stage, step, state._liveDrawAt);
        state._liveDrawAt += 1;
        if (state._liveDrawAt < (step.hop ? 1 : 3)) return state;
      } else {
        drawLiveScene(stage, step);
      }
      if (!step.hop && step.stop > 0) noteFlight("stop-ready", { stop: step.stop, t: Math.round(performance.now()) });
      state._liveReady = false;
      state._liveAt += 1;
      return state;
    }
    // Pass L — composer-level steps that only make sense before land: the
    // hole frame (the hold is over), and the notch tiers + restore (each a
    // composer resize plus a full-size draw: one post-land frame measured
    // 48 ms CPU + a 281 ms gap). After land a notch change simply allocates
    // its targets the first time it happens.
    // Pass M — the black gap skips them too (GAP_TIER_WARM, open trade-off):
    // tiers in the gap give a clean land (0/0 in 9 of 9 instant clicks) but
    // the governor then idles at full width and every instant-click hop
    // starts GPU-bound there (2–14 frames > 50 ms per hop window); without
    // them the floor steps down live after land and a hop's first
    // motion-DPR step allocates (one 52–72 ms resize frame).
    const tierStep = step.kind === "tier" || step.kind === "restore";
    if ((stage.introComplete || (stage._gapHold && !GAP_TIER_WARM)) && (tierStep || step.kind === "hole")) {
      state._liveAt += 1;
      return state;
    }
    if (step.kind === "hole") drawHoleFrame(stage);
    else if (step.kind === "edge") warmEdgePass(stage, step.stop ?? 0);
    else if (step.kind === "smaa") {
      if (!smaaReady(stage)) {
        if (!state._smaaWait) state._smaaWait = performance.now();
        if (performance.now() - state._smaaWait < 8000) return state;
      }
      warmSmaa(stage);
    } else if (step.kind === "duo") {
      if (!stage.duoFab?.ready) {
        if (!state._duoReadyWait) state._duoReadyWait = performance.now();
        if (performance.now() - state._duoReadyWait < 20000) return state;
      }
      if (stage._duoBitmapPending) stage.applyDuoBitmap(stage._duoBitmapPending);
      if (!stage._duoGlassReady) {
        if (!state._duoWait) state._duoWait = performance.now();
        if (performance.now() - state._duoWait < 8000) return state;
      }
      warmDuoHud(stage);
    }
    else if (step.kind === "lens") warmLens(stage);
    else if (step.kind === "tier") warmTier(stage, step.notch);
    else if (step.kind === "restore") restoreSequenceSize(stage);
    state._liveAt += 1;
    return state;
  }

  if (state.phase === "extra-textures") {
    // PC/Sidekick/Archaeology are fetched with (or right alongside) the bust,
    // but their roots often aren't mounted into their vignette group yet when
    // the "textures" phase above first scanned — collectTextures only sees
    // what's mounted at the moment it runs. By now the "live" phase's many
    // steps have spent most of the intro, so a fresh re-scan here catches
    // large textures mounted since, while the chunk queue can still drain
    // them (_chunkUploadsAllowed() closes once the black-hole flight ends).
    // Anything still missed (queue never called _chunkUploadsAllowed here
    // in time) falls to the late-claim safety net in the main render loop.
    if (!state._extraTextureList) {
      state._extraTextureList = collectTextures(stage);
      state._extraTextureAt = 0;
    }
    const n = Math.max(1, VIGNETTE0_WARM_TEXTURES_PER_FRAME | 0);
    const renderer = stage.renderer;
    for (let i = 0; i < n && state._extraTextureAt < state._extraTextureList.length; i += 1) {
      const tex = state._extraTextureList[state._extraTextureAt];
      state._extraTextureAt += 1;
      if (!renderer || !tex?.isTexture) continue;
      withInactiveLayer(stage.camera, () => {
        try {
          renderer.initTexture(tex);
        } catch (error) {
          console.warn("[warmVignette0] extra texture upload failed:", error);
        }
      });
    }
    if (state._extraTextureAt >= state._extraTextureList.length) state.phase = "light";
    return state;
  }

  if (state.phase === "light") {
    stage.neon?.prelightStop?.(0);
    state.prelit = true;
    finish(state);
  }

  return state;
}

function finish(state) {
  state.phase = "done";
  state.done = true;
  state._meshList = null;
  state._textureList = null;
}

/**
 * Bust (stop 0) is the only dependency the aerial drop has — tree, lawn,
 * lantern, its own textures, the lantern shadow, and the wet-floor cube are
 * all handled earlier (the "textures"/"shadow"/"probe" phases). This one
 * step is its only "live" dependency, and it is placed first and run
 * without waiting on the other three stops. Everything after it (the other
 * stops' own live compile, every hop transition, the hole/smaa/edge/duo/
 * lens/tier warms) is real work but none of it gates landing on Bust — it
 * keeps running in the background post-land, the same deferred-after-land
 * spirit as PC/Sidekick/Archaeology's own GPU_HOLD_LAYER integration.
 * @returns {{ bustStepCount: number, steps: object[] }}
 */
function liveSteps() {
  const bust = [{ kind: "scene", stop: 0, hop: false, from: 0 }];
  // Pass M — ordered by when it is needed:
  //  1. what the land frame itself uses (Bust's edge-glitch SDF, the Duo
  //     entrance, rest SMAA) — when the warm stalled, the land frame linked
  //     10 edge-SDF depth programs live (1.8 s);
  //  2. the CRT env (Desktop only);
  //  3. stops nearest first: Desktop and Archaeology are one hop from Bust,
  //     Sidekick two — each stop's scene then its edge step;
  //  4. the rest (lens, hole, notch tiers — hold-only, see below).
  // The 12 from→to hop combos stay gone (Pass K item 3).
  const deferred = [{ kind: "edge", stop: 0 }, { kind: "duo" }, { kind: "smaa" }, { kind: "env" }];
  for (const stop of [1, 3, 2]) {
    deferred.push({ kind: "scene", stop, hop: false, from: stop }, { kind: "edge", stop });
  }
  deferred.push({ kind: "lens" }, { kind: "hole" });
  for (let i = 0; i < FLOOR_MP_NOTCHES.length; i += 1) {
    deferred.push({ kind: "tier", notch: FLOOR_MP_NOTCHES[i] });
  }
  deferred.push({ kind: "restore" });
  return { bustStepCount: bust.length, steps: [...bust, ...deferred] };
}

function poseShadows(stage, _stop, _castPoint) {
  stage._holdStableLightVariant?.();
  return () => {};
}

function bakeCrtEnvironment(stage) {
  const desktop = stage.vignettes?.[1]?.instance;
  const liveEnv = stage.liveEnv;
  if (!desktop?.updateCrtGlassReflection || !liveEnv || liveEnv._livePmremLocked) return;
  // Pass K item 2 — integration already captured it in the hold: just lock.
  if (desktop._lastEnvRotY != null) {
    liveEnv.lockLivePmrem?.();
    return;
  }
  try {
    desktop.updateCrtGlassReflection(liveEnv, stage.scene, stage.spotLight, stage.spotTarget, {
      force: true,
      neonLight: stage.neon?.stopLights?.[1]?.light ?? null
    });
  } catch (error) {
    console.warn("[warmVignette0] CRT env bake failed:", error);
  }
  liveEnv.lockLivePmrem?.();
}

function composerTarget(stage) {
  return stage.post?.composer?.inputBuffer ?? null;
}

function withLivePose(stage, step, fn) {
  const keep = step.hop ? [step.stop, step.from] : [step.stop];
  const layers = stage._warmKeepLayers?.(keep) ?? (() => {});
  const lights = poseShadows(stage, step.stop, !step.hop);
  const shown = showVignette0(stage);
  const grass = silenceGrassShadows(stage);
  const camera = poseLiveCamera(stage, step);
  // Archaeology's Giza portal is not constructed (portal stays null). The
  // stencil subpass is a no-op; the live beauty pass is this same composer.
  const portal = stage.vignettes?.[3]?.instance?.portal ?? null;
  stage.post?.setPortal?.(portal);
  try {
    return fn();
  } finally {
    camera();
    restoreGrassShadows(grass);
    restoreShown(shown);
    lights();
    layers();
  }
}

function poseLiveCamera(stage, step) {
  const cam = stage.camera;
  const rig = stage.cameraRig;
  const stop = stage.ring?.[step.stop];
  if (!cam || !rig || !stop) return () => {};
  const saved = {
    px: cam.position.x,
    py: cam.position.y,
    pz: cam.position.z,
    qx: cam.quaternion.x,
    qy: cam.quaternion.y,
    qz: cam.quaternion.z,
    qw: cam.quaternion.w
  };
  const center = rig.center ?? [0, 0, 0];
  const pos = pointOnRing(stop.angle, rig.restRadius, rig.restHeight, center);
  cam.position.copy(pos);
  const focus = stop.focusPoint;
  if (focus?.isVector3) cam.lookAt(focus);
  else cam.lookAt(0, rig.lookAtHeight ?? 2, 0);
  cam.updateMatrixWorld();
  return () => {
    cam.position.set(saved.px, saved.py, saved.pz);
    cam.quaternion.set(saved.qx, saved.qy, saved.qz, saved.qw);
    cam.updateMatrixWorld();
  };
}

function compileLiveScene(stage, step) {
  const renderer = stage.renderer;
  const scene = stage.scene;
  const camera = stage.camera;
  const target = composerTarget(stage);
  if (!renderer || !scene || !camera || !target) return Promise.resolve();
  const prev = renderer.getRenderTarget();
  let pending = Promise.resolve();
  withLivePose(stage, step, () => {
    renderer.setRenderTarget(target);
    try {
      pending = renderer.compileAsync(scene, camera);
    } catch (error) {
      console.warn("[warmVignette0] live compile failed:", error);
    }
    // Pass J — the hop fade's transparent variant for this stop, compiled
    // under the same pose/lights while the stop is still off screen.
    if (!step.hop) {
      const group = stage.vignettes?.[step.stop]?.group;
      pending = Promise.all([
        pending,
        compileFadeVariants(renderer, group, camera, scene, target)
      ]);
    }
  });
  renderer.setRenderTarget(prev);
  return pending;
}

/**
 * Pass M — is the live step only waiting on its stop's integration? Post-land
 * a waiting step must not take the frame's background token: the held
 * compile it waits for needs that same token (a cap run deadlocked on it
 * until the 25 s fallback — Sidekick ready +24 s after land). The first
 * call for a step returns false so the step starts its own wait timer.
 */
export function warmStepBlocked(stage, state) {
  if (!state || state.phase !== "live" || state._liveReady) return false;
  const steps = state._liveSteps || [];
  if (state._liveAt < (state._bustStepCount ?? 0) || state._liveAt >= steps.length) return false;
  if (state._modelsWaitAt !== state._liveAt) return false;
  return !liveModelsReady(stage, steps[state._liveAt]) && performance.now() - state._modelsWait < 25000;
}

function liveModelsReady(stage, step = null) {
  const desktop = stage.vignettes?.[1]?.instance;
  const sidekick = stage.vignettes?.[2]?.instance;
  const arch = stage.vignettes?.[3]?.instance;
  const deskOk = Boolean(desktop?._pcSceneReady || desktop?.pcRoot);
  const sideOk = Boolean(sidekick?._modelLoadSettled);
  const archOk = Boolean(arch?._modelLoadSettled);
  const spill = Boolean(desktop?.screenLightRig?.spill && desktop?.screenLightRig?.glow);
  const led = Boolean(sidekick?.scrollballLed?.light);
  // Pass K item 2 — integration (mount + held compile + release) now runs in
  // the hold; wait for it so each stop's static shadow bake includes its
  // own props (25 s fallback as before if it never settles).
  // Pass M — each step waits only for what it touches.
  const stop = step && (step.kind === "scene" || step.kind === "edge") ? step.stop : step?.kind === "env" ? 1 : null;
  if (step && stop == null) return warmMaterialsReady(stage);
  if (stop === 0) return warmMaterialsReady(stage);
  if (stop != null) {
    const integrated = Boolean(stage._stopIntegrated?.has(stop) || stage._introIntegrationSettled);
    const own = stop === 1 ? deskOk && spill : stop === 2 ? sideOk && led : archOk;
    return own && integrated && warmMaterialsReady(stage);
  }
  const integrated = Boolean(stage._introIntegrationSettled);
  return deskOk && sideOk && archOk && spill && led && integrated && warmMaterialsReady(stage);
}

function bakeWarmMaterials(stage) {
  if (stage._warmMaterialsBaked || !warmMaterialsReady(stage)) return;
  stage.wetFloor.armSettleBake({ probeSize: 64 });
  warmWetProbe(stage);
  stage.wetFloor.markPrebaked();
  stage._warmMaterialsBaked = true;
}

function warmMaterialsReady(stage) {
  const mat = stage.wetFloor?.material;
  const wetReady = Boolean(
    mat?.map &&
      mat.roughnessMap &&
      mat.normalMap &&
      mat.metalnessMap &&
      mat.userData?.wetFloorBubble &&
      mat.onBeforeCompile &&
      mat.envMap
  );
  const entries = stage.neon?.entries || [];
  for (let i = 0; i < entries.length; i += 1) {
    const tube = entries[i]?.tube;
    if (tube?.userData?.neonProp !== "lantern") continue;
    if (!tube.userData.lanternReady) return false;
  }
  return wetReady;
}

function drawLiveScene(stage, step) {
  if (!stage.post || !stage.scene || !stage.camera) return;
  withLivePose(stage, step, () => {
    const renderer = stage.renderer;
    const prevNeeds = renderer?.shadowMap?.needsUpdate;
    if (renderer?.shadowMap) renderer.shadowMap.needsUpdate = true;
    // Pass J item 2 — bake this stop's neon shadow now, with its casters
    // on camera, so no stop ever bakes (and pops a shadow in) on a settle.
    if (!step.hop) {
      const light = stage.neon?.stopLights?.[step.stop]?.light;
      if (light?.castShadow && light.shadow && !light.shadow.map) {
        light.shadow.needsUpdate = true;
        light.userData.shadowBakes = (light.userData.shadowBakes ?? 0) + 1;
        light.userData.shadowPrebaked = true;
        noteFlight("shadow-bake", { light: light.name, reason: "warm" });
      }
    }
    try {
      presentOffscreen(stage, () => {
        stage.post.render(stage.scene, stage.camera, 0, { grainStrength: 0 });
      });
      // Pass J — draw this stop once more in its hop-fade state, so the
      // blend pipeline objects exist before the first live fade.
      if (!step.hop) {
        const group = stage.vignettes?.[step.stop]?.group;
        const draw = () =>
          presentOffscreen(stage, () => {
            stage.post.render(stage.scene, stage.camera, 0, { grainStrength: 0 });
          });
        // Final opaque state too — a stop still mid intro-reveal here would
        // otherwise build it live on the first hop onto it.
        withAuthoredVariant(group, draw);
        withFadeVariant(group, draw);
      }
    } catch (error) {
      console.warn("[warmVignette0] live draw failed:", error);
    } finally {
      if (renderer?.shadowMap && prevNeeds != null) renderer.shadowMap.needsUpdate = prevNeeds;
    }
  });
  stage.renderer?.getContext()?.finish?.();
}

/** Pass K item 3 — 64×64 offscreen target with the composer input's format. */
let _tinyTarget = null;
function tinyTarget(stage) {
  const input = composerTarget(stage);
  if (!input) return null;
  const tex = input.texture;
  if (
    !_tinyTarget ||
    _tinyTarget.texture.type !== tex.type ||
    _tinyTarget.texture.format !== tex.format ||
    _tinyTarget.samples !== input.samples
  ) {
    _tinyTarget?.dispose();
    _tinyTarget = new THREE.WebGLRenderTarget(64, 64, {
      type: tex.type,
      format: tex.format,
      colorSpace: tex.colorSpace,
      depthBuffer: input.depthBuffer,
      stencilBuffer: input.stencilBuffer,
      samples: input.samples
    });
  }
  return _tinyTarget;
}

/**
 * One tiny beauty-only draw of `step.stop` at its live pose: variant 0 =
 * live state (+ its static shadow bake), 1 = authored opaque, 2 = hop fade.
 */
function drawLiveSceneTiny(stage, step, variant, face = null) {
  const renderer = stage.renderer;
  const target = tinyTarget(stage);
  if (!renderer || !stage.scene || !stage.camera || !target) return;
  withLivePose(stage, step, () => {
    const prevTarget = renderer.getRenderTarget();
    const prevNeeds = renderer.shadowMap.needsUpdate;
    let faceLight = null;
    if (variant === 0 && !step.hop) {
      renderer.shadowMap.needsUpdate = true;
      const light = stage.neon?.stopLights?.[step.stop]?.light;
      if (face != null && light?.castShadow && light.shadow?.isPointLightShadow) {
        faceLight = light;
        if (face === 0) {
          light.userData.shadowBakes = (light.userData.shadowBakes ?? 0) + 1;
          light.userData.shadowPrebaked = true;
          noteFlight("shadow-bake", { light: light.name, reason: "warm-face" });
        }
      } else if (light?.castShadow && light.shadow && !light.shadow.map) {
        light.shadow.needsUpdate = true;
        light.userData.shadowBakes = (light.userData.shadowBakes ?? 0) + 1;
        light.userData.shadowPrebaked = true;
        noteFlight("shadow-bake", { light: light.name, reason: "warm" });
      }
    }
    const group = stage.vignettes?.[step.stop]?.group;
    const render = () => renderer.render(stage.scene, stage.camera);
    const draw = faceLight ? () => withShadowFace(faceLight, face, render) : render;
    renderer.setRenderTarget(target);
    try {
      if (variant === 1) withAuthoredVariant(group, draw);
      else if (variant === 2) withFadeVariant(group, draw);
      else draw();
    } catch (error) {
      console.warn("[warmVignette0] tiny draw failed:", error);
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.shadowMap.needsUpdate = prevNeeds;
    }
  });
}

/**
 * Pass M — one tiny draw of a culled stop at its live pose: no shadow
 * update, no material variant (see StageExperience._touchCulledStops).
 */
export function warmTouchStop(stage, stop) {
  const renderer = stage.renderer;
  const target = tinyTarget(stage);
  if (!renderer || !stage.scene || !stage.camera || !target) return;
  withLivePose(stage, { kind: "scene", stop, hop: false, from: stop }, () => {
    const prev = renderer.getRenderTarget();
    const needs = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = false;
    renderer.setRenderTarget(target);
    try {
      renderer.render(stage.scene, stage.camera);
    } finally {
      renderer.setRenderTarget(prev);
      renderer.shadowMap.needsUpdate = needs;
    }
  });
}

/** Pass M M3 — a stop's static shadow still unbaked after land (or forced, for the compare). */
function faceBakeDue(stage, step) {
  if (step.hop || !(step.stop > 0)) return false;
  if (!stage._forceFaceBake && !(stage.introComplete && !stage._gapHold)) return false;
  const light = stage.neon?.stopLights?.[step.stop]?.light;
  if (!light?.castShadow || !light.shadow?.isPointLightShadow || light.shadow.map) return false;
  // On camera already: one-shot, as before (the face path is for culled stops).
  return stage._forceFaceBake || stage.vignettes?.[step.stop]?.group?.userData?._stopCulled !== false;
}

/**
 * DEV/Pass M M3 — bake `stop`'s cube shadow three ways at its live pose and
 * compare: one-shot (reference), six faces into a fresh map, and six faces
 * over a map pre-filled with 0 (proves each face's scissored clear + draw
 * covers its whole face). The light's real map is restored afterwards.
 */
export function debugFaceBakeCompare(stage, stop) {
  const renderer = stage.renderer;
  const light = stage.neon?.stopLights?.[stop]?.light;
  if (!renderer || !light?.shadow?.isPointLightShadow) return { error: "no point-light shadow", stop };
  const step = { kind: "scene", stop, hop: false, from: stop };
  const shadow = light.shadow;
  const saved = shadow.map;
  const read = () => {
    const m = shadow.map;
    const buf = new Uint8Array(m.width * m.height * 4);
    renderer.readRenderTargetPixels(m, 0, 0, m.width, m.height, buf);
    return buf;
  };
  const drop = () => {
    shadow.map?.dispose();
    shadow.map = null;
  };
  const faces = () => {
    for (let f = 0; f < SHADOW_CUBE_FACES; f += 1) drawLiveSceneTiny(stage, step, 0, f);
  };
  const diff = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) n += 1;
    return n;
  };
  shadow.map = null;
  try {
    drawLiveSceneTiny(stage, step, 0);
    const oneShot = read();
    const size = [shadow.map.width, shadow.map.height];
    drop();
    faces();
    const fresh = read();
    // Pre-fill with 0 (never a valid packed distance at the far plane).
    const prev = renderer.getRenderTarget();
    const clear = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(shadow.map);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.setRenderTarget(prev);
    renderer.setClearColor(clear, alpha);
    faces();
    const over = read();
    let written = 0;
    for (let i = 0; i < oneShot.length; i += 4) if (oneShot[i] !== 255 || oneShot[i + 1] !== 255 || oneShot[i + 2] !== 255) written += 1;
    // The 4x2 atlas has two cells no face uses (never written, never
    // sampled): split the pre-filled diff into face texels vs those cells.
    const w = shadow.mapSize.x;
    const h = shadow.mapSize.y;
    const inFace = new Uint8Array(size[0] * size[1]);
    for (let f = 0; f < SHADOW_CUBE_FACES; f += 1) {
      const v = shadow._viewports[f];
      for (let y = h * v.y; y < h * (v.y + v.w); y += 1) inFace.fill(1, y * size[0] + w * v.x, y * size[0] + w * (v.x + v.z));
    }
    let overFace = 0;
    let overUnused = 0;
    for (let i = 0; i < over.length; i += 1) {
      if (over[i] === oneShot[i]) continue;
      if (inFace[i >> 2]) overFace += 1;
      else overUnused += 1;
    }
    return {
      stop,
      light: light.name,
      size,
      texels: oneShot.length / 4,
      casterTexels: written,
      diffFresh: diff(oneShot, fresh),
      diffOverZeroFaces: overFace,
      diffOverZeroUnusedCells: overUnused
    };
  } finally {
    drop();
    shadow.map = saved;
    shadow.needsUpdate = false;
  }
}

function drawHoleFrame(stage) {
  if (!stage.post || !stage.scene || !stage.camera) return;
  try {
    presentOffscreen(stage, () => {
      stage.post.render(stage.scene, stage.camera, 0, { grainStrength: 0 });
    });
  } catch (error) {
    console.warn("[warmVignette0] hole warm failed:", error);
  }
  stage.renderer?.getContext()?.finish?.();
}

function presentOffscreen(stage, draw) {
  const passes = stage.post?.composer?.passes || [];
  const last = passes[passes.length - 1];
  const was = last?.renderToScreen;
  if (last) last.renderToScreen = false;
  try {
    draw();
  } finally {
    if (last) last.renderToScreen = was !== false;
  }
}

function warmEdgePass(stage, stop = 0) {
  const glitch = stage.edgeGlitch;
  const edge = glitch?.glitchPass?.uniforms;
  const was = edge?.uEnabled?.value;
  const pass = glitch?.glitchPass;
  const enabled = pass?.enabled;
  const pointerWas = glitch?._pointerLive;
  const root = stage._edgeGlitchRootForStop?.(stop);
  // Pass L — during the warm the glitch is still disabled / below its work-
  // quality gate, so update() returned before the silhouette SDF ever ran:
  // its mask + depth override programs then linked live on the land frame
  // (48 ms CPU, next frame 53 ms, a floor notch). Open both gates for this
  // one offscreen call.
  const enabledWas = glitch?.enabled;
  const qualityWas = glitch?._workQuality;
  if (glitch) {
    glitch.enabled = true;
    if (typeof glitch._workQuality === "number") glitch._workQuality = Math.max(glitch._workQuality, 1);
  }
  if (edge?.uEnabled) edge.uEnabled.value = 1;
  if (pass) pass.enabled = true;
  if (glitch) {
    glitch.stage = Math.max(3, glitch.stage || 0);
    glitch._pointerNdc?.set?.(0.15, -0.05);
    glitch._pointerLive = true;
  }
  try {
    if (glitch && root) {
      glitch.update({
        activeIndex: stop,
        activeRoot: root,
        bustReady: true,
        time: 1
      });
    }
    presentOffscreen(stage, () => {
      stage.post?.render(stage.scene, stage.camera, 0, { grainStrength: 0 });
    });
  } catch (error) {
    console.warn("[warmVignette0] edge warm failed:", error);
  }
  if (glitch) {
    glitch._pointerLive = pointerWas;
    if (enabledWas != null) glitch.enabled = enabledWas;
    if (qualityWas != null) glitch._workQuality = qualityWas;
  }
  if (edge?.uEnabled && was != null) edge.uEnabled.value = was;
  if (pass) pass.enabled = enabled;
  stage.renderer?.getContext()?.finish?.();
}

function smaaReady(stage) {
  return Boolean(stage.post?.smaaEffect?.weightsMaterial?.searchTexture);
}

function warmSmaa(stage) {
  try {
    stage.post?.setRestAntialias?.();
    presentOffscreen(stage, () => {
      stage.post?.render(stage.scene, stage.camera, 0, { grainStrength: 0 });
    });
  } catch (error) {
    console.warn("[warmVignette0] smaa warm failed:", error);
  }
}

function warmLens(stage) {
  const renderer = stage.renderer;
  const hole = stage.blackHole?.group;
  const camera = stage.camera;
  const scene = stage.scene;
  const target = composerTarget(stage);
  if (!renderer || !hole || !camera || !scene || !target) return;
  const prev = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    renderer.compile(hole, camera, scene);
  } catch (error) {
    console.warn("[warmVignette0] lens warm failed:", error);
  }
  renderer.setRenderTarget(prev);
}

function warmTier(stage, notch) {
  const { w, h } = stage._viewportCssSize();
  const area = Math.max(1, w * h);
  const cap = (stage._fullPixelRatio || 1) * (stage._renderScale || 1);
  const ratio = Math.max(0.2, Math.min(cap, Math.sqrt((notch * 1e6) / area)));
  const dw = Math.max(1, Math.round(w * ratio));
  const dh = Math.max(1, Math.round(h * ratio));
  // Real size to restore to below — the actual current CSS size * live DPR,
  // same formula restoreSequenceSize uses for the final "restore" step.
  const realRatio = (stage._fullPixelRatio || 1) * (stage._renderScale || 1);
  const realW = Math.max(1, Math.round(w * realRatio));
  const realH = Math.max(1, Math.round(h * realRatio));
  stage.post?.setDrawSize(dw, dh);
  const renderer = stage.renderer;
  const input = stage.post?.composer?.inputBuffer;
  const output = stage.post?.composer?.outputBuffer;
  const prev = renderer?.getRenderTarget?.() ?? null;
  try {
    if (renderer && input) renderer.setRenderTarget(input);
    if (renderer && output) renderer.setRenderTarget(output);
    presentOffscreen(stage, () => {
      stage.post?.render(stage.scene, stage.camera, 0, { grainStrength: 0 });
    });
  } catch (error) {
    console.warn("[warmVignette0] tier warm failed:", error);
  }
  renderer?.setRenderTarget(prev);
  renderer?.getContext?.()?.finish?.();
  // One "tier" step runs per tick across several notches before the final
  // "restore" step ever runs — every notch but the last used to leave the
  // composer sized for its own offscreen warm-render until then. With the
  // live-phase beauty render no longer unconditionally skipped post-land
  // (see the _skipBeauty fix above), that stale small size was rendering as
  // a real, visible, wrongly-sized (near-black) frame on every intervening
  // tick. Restore immediately — this function owns the resize, so it owns
  // undoing it before any other code can render at the wrong size.
  stage.post?.setDrawSize(realW, realH);
}

function restoreSequenceSize(stage) {
  try {
    stage.post?.setSequenceAntialias?.();
  } catch (error) {
    console.warn("[warmVignette0] sequence aa restore failed:", error);
  }
  const { w, h } = stage._viewportCssSize();
  const ratio = (stage._fullPixelRatio || 1) * (stage._renderScale || 1);
  stage.post?.setDrawSize(
    Math.max(1, Math.round(w * ratio)),
    Math.max(1, Math.round(h * ratio))
  );
}

function bustMounted(stage) {
  const bust = stage.vignettes?.[0]?.instance;
  const light = stage.neon?.stopLights?.[0]?.light;
  return Boolean(bust?._modelLoadSettled && bust?.group && light);
}

function collectMeshes(stage) {
  const meshes = [];
  const seen = new Set();
  const add = (root) => {
    root?.traverse?.((obj) => {
      if (!obj.isMesh || seen.has(obj) || !obj.material) return;
      seen.add(obj);
      meshes.push(obj);
    });
  };
  const vignettes = stage.vignettes || [];
  for (let i = 0; i < vignettes.length; i += 1) add(vignettes[i]?.group);
  add(stage.wetFloor?.floorMesh);
  return meshes;
}

function collectTextures(stage) {
  const found = [];
  const seen = new Set();
  const push = (tex) => {
    if (!tex?.isTexture || seen.has(tex)) return;
    seen.add(tex);
    found.push(tex);
  };
  const fromMaterial = (mat) => {
    if (!mat) return;
    for (const key of TEXTURE_KEYS) push(mat[key]);
    const uniforms = mat.uniforms;
    if (uniforms) {
      for (const uniform of Object.values(uniforms)) push(uniform?.value);
    }
  };
  const fromRoot = (root) => {
    root?.traverse?.((obj) => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) fromMaterial(mat);
    });
  };
  const vignettes = stage.vignettes || [];
  for (let i = 0; i < vignettes.length; i += 1) fromRoot(vignettes[i]?.group);
  fromMaterial(stage.wetFloor?.material);
  push(stage.vignettes?.[1]?.instance?.mySpace?.texture);
  return found;
}

function compileMesh(stage, mesh) {
  const renderer = stage.renderer;
  const camera = stage.camera;
  const scene = stage.scene;
  if (!renderer || !camera || !scene || !mesh) return Promise.resolve();
  const lights = shadowLights(stage);
  const shown = showVignette0(stage);
  for (const entry of lights) entry.light.castShadow = true;
  const prevTarget = renderer.getRenderTarget();
  let pending = Promise.resolve();
  withInactiveLayer(camera, () => {
    try {
      // Match the composer pass (render target → linear, no tone map).
      renderer.setRenderTarget(_bakeTarget);
      pending = renderer.compileAsync(mesh, camera, scene);
    } catch (error) {
      console.warn("[warmVignette0] compile failed:", error);
    }
  });
  renderer.setRenderTarget(prevTarget);
  restoreShown(shown);
  for (const entry of lights) entry.light.castShadow = entry.castWas;
  return pending;
}

function collectDuoMeshes(duo) {
  const meshes = [];
  duo.model?.traverse?.((obj) => {
    if (obj.isMesh && obj.material) meshes.push(obj);
  });
  return meshes;
}

function compileDuoMesh(stage, mesh) {
  const renderer = stage.renderer;
  const duo = stage.duoFab;
  if (!renderer || !duo?.hudScene || !duo.hudCamera || !mesh) return Promise.resolve();
  const rootWas = duo.root?.visible;
  if (duo.root) duo.root.visible = true;
  const prevTarget = renderer.getRenderTarget();
  let pending = Promise.resolve();
  try {
    renderer.setRenderTarget(_screenTarget);
    pending = renderer.compileAsync(mesh, duo.hudCamera, duo.hudScene);
  } catch (error) {
    console.warn("[warmVignette0] duo compile failed:", error);
  }
  renderer.setRenderTarget(prevTarget);
  if (duo.root) duo.root.visible = rootWas;
  return pending;
}

function showVignette0(stage) {
  const world = stage.world;
  const content = stage.neon?.entries?.[0]?.contentRoot ?? null;
  const tube = stage.neon?.entries?.[0]?.tube ?? null;
  const hole = stage.blackHole?.group ?? null;
  const shown = {
    world,
    worldWas: world?.visible,
    content,
    contentWas: content?.visible,
    tube,
    tubeWas: tube?.visible,
    hole,
    holeWas: hole?.visible
  };
  if (world) world.visible = true;
  if (content) content.visible = true;
  if (tube) tube.visible = true;
  if (hole) hole.visible = false;
  return shown;
}

function restoreShown(shown) {
  if (!shown) return;
  if (shown.world) shown.world.visible = shown.worldWas;
  if (shown.content) shown.content.visible = shown.contentWas;
  if (shown.tube) shown.tube.visible = shown.tubeWas;
  if (shown.hole) shown.hole.visible = shown.holeWas;
}

function silenceGrassShadows(stage) {
  const meshes = [];
  const vignettes = stage.vignettes || [];
  for (let i = 0; i < vignettes.length; i += 1) {
    const mesh = vignettes[i]?.instance?.grassEngine?.mesh;
    if (!mesh?.castShadow) continue;
    meshes.push(mesh);
    mesh.castShadow = false;
  }
  return meshes;
}

function restoreGrassShadows(meshes) {
  for (let i = 0; i < meshes.length; i += 1) meshes[i].castShadow = true;
}

function shadowLights(stage) {
  const lights = [];
  const lantern = stage.neon?.stopLights?.[0]?.light ?? null;
  const spot = stage.spotLight ?? null;
  if (lantern) lights.push({ light: lantern, castWas: lantern.castShadow });
  if (spot && spot !== lantern) lights.push({ light: spot, castWas: spot.castShadow });
  return lights;
}

/**
 * One beauty draw from the stop-0 rest pose so the land frame is not the
 * first use of those programs. Off the canvas.
 * @returns {number}
 */
function drawRestPose(stage) {
  const renderer = stage.renderer;
  const scene = stage.scene;
  const rig = stage.cameraRig;
  const stop = stage.ring?.[0];
  if (!renderer || !scene || !rig || !stop) return 0;

  const lights = shadowLights(stage);
  const shown = showVignette0(stage);
  const prevTarget = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  const prevShadowAuto = renderer.shadowMap.autoUpdate;
  const prevShadowNeeds = renderer.shadowMap.needsUpdate;

  for (const entry of lights) entry.light.castShadow = true;

  const center = rig.center ?? [0, 0, 0];
  const pos = pointOnRing(stop.angle, rig.restRadius, rig.restHeight, center);
  _warmCam.fov = stage.camera?.fov ?? 42;
  _warmCam.aspect = stage.camera?.aspect ?? 1;
  _warmCam.near = stage.camera?.near ?? 0.1;
  _warmCam.far = stage.camera?.far ?? 220;
  _warmCam.position.set(pos.x, pos.y, pos.z);
  _warmLook.copy(stop.focusPoint ?? stop.lookAt ?? _warmLook.set(0, rig.lookAtHeight ?? 2, 0));
  _warmCam.lookAt(_warmLook);
  _warmCam.layers.mask = stage.camera?.layers?.mask ?? 1;
  _warmCam.layers.disable(INACTIVE_VIGNETTE_LAYER);
  _warmCam.updateProjectionMatrix();
  _warmCam.updateMatrixWorld();

  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = false;
  const callsBefore = renderer.info?.render?.calls ?? 0;
  try {
    renderer.setRenderTarget(_bakeTarget);
    renderer.autoClear = true;
    renderer.render(scene, _warmCam);
  } catch (error) {
    console.warn("[warmVignette0] rest draw failed:", error);
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    renderer.shadowMap.needsUpdate = prevShadowNeeds;
    restoreShown(shown);
    for (const entry of lights) entry.light.castShadow = entry.castWas;
  }
  return Math.max(0, (renderer.info?.render?.calls ?? 0) - callsBefore);
}

/**
 * First beauty draw of one mesh, off the canvas, with the land-frame lights.
 * Shadow maps stay as the bake left them.
 */
function warmDuoHud(stage) {
  const duo = stage.duoFab;
  const renderer = stage.renderer;
  if (!duo?.hudScene || !duo?.hudCamera || !renderer || !duo.ready) return;
  const rootWas = duo.root?.visible;
  const entranceWas = duo._entrance;
  const holoWas = duo._holoOpen;
  const stateWas = duo.state;
  const entranceOpacityWas = duo._entranceOpacity ?? 1;
  if (duo.root) duo.root.visible = true;
  if (duo.ready) duo._entrance = "live";
  duo._holoOpen = false;
  try {
    duo.setState?.("idle");
    duo._applyScreenPower?.(0);
    duo.render(renderer);
    duo._holoOpen = true;
    duo.setState?.("mail");
    duo._applyScreenPower?.(1);
    duo.render(renderer);
    duo.setState?.("caseStudy");
    duo._applyScreenPower?.(1);
    duo.render(renderer);
    // Pass K — the entrance fade (land frame). Mid-fade every Duo material is
    // transparent, so three draws each DoubleSide mesh in two passes
    // (BackSide → flipSided, then FrontSide) with `opaque` off: four `duo`
    // programs + `screen` + a depth program that the opaque draws above
    // never build — measured linking live on the land frame (91 ms of
    // duo-render, a 129 ms frame after it).
    duo._holoOpen = false;
    duo.setState?.("idle");
    duo._applyScreenPower?.(0);
    duo._setEntranceOpacity?.(0.5);
    duo.render(renderer);
  } catch (error) {
    console.warn("[warmVignette0] duo warm failed:", error);
  } finally {
    duo._setEntranceOpacity?.(entranceOpacityWas);
    duo.setState?.(stateWas || "idle");
    duo._applyScreenPower?.(0);
    duo._holoOpen = holoWas;
    if (entranceWas != null) duo._entrance = entranceWas;
    if (duo.root) duo.root.visible = rootWas;
  }
  renderer.getContext()?.finish?.();
}

function warmEdgeGlitch(stage) {
  const edge = stage.edgeGlitch;
  const camera = stage.camera;
  if (!edge?.update || !camera) return;
  const world = stage.world;
  const content = stage.neon?.entries?.[0]?.contentRoot ?? null;
  const worldWas = world?.visible;
  const contentWas = content?.visible;
  const pos = camera.position.clone();
  const quat = camera.quaternion.clone();
  if (world) world.visible = true;
  if (content) content.visible = true;
  try {
    const rig = stage.cameraRig;
    const stop = stage.ring?.[0];
    if (rig && stop) {
      const center = rig.center ?? [0, 0, 0];
      const at = pointOnRing(stop.angle, rig.restRadius, rig.restHeight, center);
      camera.position.set(at.x, at.y, at.z);
      camera.lookAt(stop.focusPoint ?? stop.lookAt ?? _warmLook.set(0, rig.lookAtHeight ?? 2, 0));
      camera.updateMatrixWorld();
    }
    const root = stage._edgeGlitchRootForStop?.(0);
    edge.update({
      activeIndex: 0,
      activeRoot: root,
      bustReady: Boolean(root),
      time: 0
    });
  } catch (error) {
    console.warn("[warmVignette0] edge warm failed:", error);
  } finally {
    camera.position.copy(pos);
    camera.quaternion.copy(quat);
    camera.updateMatrixWorld();
    if (edge._overlay) edge._overlay.visible = false;
    const passU = edge.glitchPass?.uniforms;
    if (passU?.uEnabled) passU.uEnabled.value = 0;
    if (world) world.visible = worldWas;
    if (content) content.visible = contentWas;
  }
}

function warmWetProbe(stage) {
  const wet = stage.wetFloor;
  if (!wet?.update) return;
  const world = stage.world;
  const content = stage.neon?.entries?.[0]?.contentRoot ?? null;
  const hole = stage.blackHole?.group ?? null;
  const worldWas = world?.visible;
  const contentWas = content?.visible;
  const holeWas = hole?.visible;
  const lights = shadowLights(stage);
  if (world) world.visible = true;
  if (content) content.visible = true;
  if (hole) hole.visible = false;
  for (const entry of lights) entry.light.castShadow = true;
  try {
    const bust = stage.vignettes?.[0]?.instance;
    const hideExtra = [];
    if (bust?.grassRoot) hideExtra.push(bust.grassRoot);
    if (bust?.grassEngine?.root) hideExtra.push(bust.grassEngine.root);
    const every = wet.effectiveProbeEveryN?.() ?? 1;
    wet._frame = every - 1;
    wet.update(0, {
      probeWorld: stage.neon?.stopLights?.[0]?.light?.position ?? null,
      hideExtra
    });
  } catch (error) {
    console.warn("[warmVignette0] wet probe failed:", error);
  } finally {
    if (world) world.visible = worldWas;
    if (content) content.visible = contentWas;
    if (hole) hole.visible = holeWas;
    for (const entry of lights) {
      entry.light.castShadow = true;
      if (entry.light.shadow) entry.light.shadow.intensity = 0;
    }
  }
}

function drawMeshOffscreen(stage, mesh, shadows = true) {
  const renderer = stage.renderer;
  const scene = stage.scene;
  if (!renderer || !scene || !mesh) return;

  const lights = shadowLights(stage);
  const hidden = [];
  const shown = [];
  const prevTarget = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  const prevShadowAuto = renderer.shadowMap.autoUpdate;
  const prevShadowNeeds = renderer.shadowMap.needsUpdate;
  const meshVisible = mesh.visible;
  const layerMask = mesh.layers.mask;
  const frustumCulled = mesh.frustumCulled;

  scene.traverse((obj) => {
    if (!obj.isMesh || obj === mesh || !obj.visible) return;
    obj.visible = false;
    hidden.push(obj);
  });
  let node = mesh;
  while (node) {
    if (!node.visible) {
      shown.push(node);
      node.visible = true;
    }
    node = node.parent;
  }
  mesh.layers.enable(0);
  mesh.frustumCulled = false;
  for (const entry of lights) entry.light.castShadow = shadows;

  mesh.updateWorldMatrix(true, false);
  mesh.getWorldPosition(_warmLook);
  _warmPos.copy(_warmLook);
  _warmPos.y += 0.35;
  _warmPos.z += 2.8;
  _warmCam.position.copy(_warmPos);
  _warmCam.lookAt(_warmLook);
  _warmCam.layers.mask = stage.camera?.layers?.mask ?? 1;
  _warmCam.layers.disable(INACTIVE_VIGNETTE_LAYER);
  _warmCam.updateMatrixWorld();

  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = false;
  const callsBefore = renderer.info?.render?.calls ?? 0;
  try {
    renderer.setRenderTarget(_bakeTarget);
    renderer.autoClear = true;
    renderer.render(scene, _warmCam);
  } catch (error) {
    console.warn("[warmVignette0] draw failed:", error);
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    renderer.shadowMap.needsUpdate = prevShadowNeeds;
    for (const obj of hidden) obj.visible = true;
    for (const obj of shown) obj.visible = false;
    mesh.visible = meshVisible;
    mesh.layers.mask = layerMask;
    mesh.frustumCulled = frustumCulled;
    for (const entry of lights) entry.light.castShadow = entry.castWas;
  }
  return Math.max(0, (renderer.info?.render?.calls ?? 0) - callsBefore);
}

/**
 * One cube bake for the first arrival. Later hops still bake on settle.
 * @returns {boolean}
 */
function bakeLanternShadow(stage) {
  const renderer = stage.renderer;
  const camera = stage.camera;
  const scene = stage.scene;
  const light = stage.neon?.stopLights?.[0]?.light;
  if (!renderer || !camera || !scene || !light?.shadow) return false;

  const world = stage.world;
  const content = stage.neon?.entries?.[0]?.contentRoot ?? null;
  const worldWas = world?.visible;
  const contentWas = content?.visible;
  const lights = shadowLights(stage);
  const prevTarget = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;

  if (world) world.visible = true;
  if (content) content.visible = true;
  const hiddenGroups = [];
  const vignettes = stage.vignettes || [];
  for (let i = 1; i < vignettes.length; i += 1) {
    const group = vignettes[i]?.group;
    if (group?.visible) {
      hiddenGroups.push(group);
      group.visible = false;
    }
  }
  for (const entry of lights) {
    entry.light.castShadow = true;
    if (entry.light.shadow) entry.light.shadow.needsUpdate = true;
  }
  scene.updateMatrixWorld(true);
  const grass = silenceGrassShadows(stage);

  let baked = false;
  withInactiveLayer(camera, () => {
    try {
      renderer.setRenderTarget(_bakeTarget);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      baked = light.shadow.map != null;
    } catch (error) {
      console.warn("[warmVignette0] shadow bake failed:", error);
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.autoClear = prevAutoClear;
    }
  });

  if (world) world.visible = worldWas;
  if (content) content.visible = contentWas;
  for (const group of hiddenGroups) group.visible = true;
  restoreGrassShadows(grass);
  for (const entry of lights) {
    entry.light.castShadow = true;
    if (entry.light.shadow) {
      entry.light.shadow.autoUpdate = false;
      entry.light.shadow.intensity = 0;
    }
  }
  if (baked) {
    light.userData.shadowPrebaked = true;
    light.userData.shadowBakes = Math.max(1, light.userData.shadowBakes ?? 0);
    light.userData.shadowCasting = false;
  }
  return baked;
}

function withInactiveLayer(camera, fn) {
  if (!camera) return fn();
  const mask = camera.layers.mask;
  camera.layers.enable(INACTIVE_VIGNETTE_LAYER);
  try {
    return fn();
  } finally {
    camera.layers.mask = mask;
  }
}
