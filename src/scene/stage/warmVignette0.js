import * as THREE from "three";
import { pointOnRing } from "../camera/ringLayout.js";
import { FLOOR_MP_NOTCHES, INACTIVE_VIGNETTE_LAYER, VIGNETTE0_WARM_TEXTURES_PER_FRAME, VIGNETTE0_WARM_MOUNT_WAIT_MS } from "./constants.js";

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
    if (state._liveAt === (state._bustStepCount ?? 0)) state.bustReady = true;
    // liveModelsReady needs the other three stops mounted — real dependencies
    // for their own steps below, but not for Bust's own step above, which
    // runs (and can finish) without waiting on them at all.
    if (pastBust) {
      if (!state._modelsWait) state._modelsWait = performance.now();
      if (!liveModelsReady(stage) && performance.now() - state._modelsWait < 25000) {
        return state;
      }
    }
    if (state._liveAt >= steps.length) {
      state.phase = "extra-textures";
      return state;
    }
    const step = steps[state._liveAt];
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
    if (step.kind === "scene") stage._frameCause = "compile";
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
      if (!state._liveReady) {
        compileLiveScene(stage, step);
        state._liveReady = true;
        return state;
      }
      drawLiveScene(stage, step);
      state._liveReady = false;
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
  const deferred = [{ kind: "env" }];
  for (let stop = 1; stop < 4; stop += 1) {
    deferred.push({ kind: "scene", stop, hop: false, from: stop });
  }
  for (let from = 0; from < 4; from += 1) {
    for (let to = 0; to < 4; to += 1) {
      if (from === to) continue;
      deferred.push({ kind: "scene", stop: to, hop: true, from });
    }
  }
  deferred.push({ kind: "hole" }, { kind: "smaa" });
  for (let stop = 0; stop < 4; stop += 1) deferred.push({ kind: "edge", stop });
  deferred.push({ kind: "duo" }, { kind: "lens" });
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
  });
  renderer.setRenderTarget(prev);
  return pending;
}

function liveModelsReady(stage) {
  const desktop = stage.vignettes?.[1]?.instance;
  const sidekick = stage.vignettes?.[2]?.instance;
  const arch = stage.vignettes?.[3]?.instance;
  const deskOk = Boolean(desktop?._pcSceneReady || desktop?.pcRoot);
  const sideOk = Boolean(sidekick?._modelLoadSettled);
  const archOk = Boolean(arch?._modelLoadSettled);
  const spill = Boolean(desktop?.screenLightRig?.spill && desktop?.screenLightRig?.glow);
  const led = Boolean(sidekick?.scrollballLed?.light);
  return deskOk && sideOk && archOk && spill && led && warmMaterialsReady(stage);
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
    try {
      presentOffscreen(stage, () => {
        stage.post.render(stage.scene, stage.camera, 0, { grainStrength: 0 });
      });
    } catch (error) {
      console.warn("[warmVignette0] live draw failed:", error);
    } finally {
      if (renderer?.shadowMap && prevNeeds != null) renderer.shadowMap.needsUpdate = prevNeeds;
    }
  });
  stage.renderer?.getContext()?.finish?.();
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
  if (glitch) glitch._pointerLive = pointerWas;
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
  } catch (error) {
    console.warn("[warmVignette0] duo warm failed:", error);
  } finally {
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
