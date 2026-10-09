import * as THREE from "three";
import { tagFrame } from "./frameBudget.js";
import { noteFlight } from "./flightRecorder.js";

/**
 * Set uniform opacity on every mesh under a vignette root (for silent mount + fade-in).
 * Preserves each material's authored transparent / depthWrite / alphaTest when the
 * fade completes — clobbering those (e.g. forcing opaque) kills Sidekick keyboard
 * label decals that need cutout / non-depth-writing blend.
 * @param {THREE.Object3D} root
 * @param {number} opacity
 */
export function setGroupRenderOpacity(root, opacity) {
  if (!root) return;
  const o = THREE.MathUtils.clamp(opacity, 0, 1);

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach((mat) => {
      if (!mat) return;
      // Keypad plastic is pinned opaque. Never snapshot phong3's alpha-0 MASK
      // as the fade restore target or the keys vanish after intro.
      if (mat.userData.sidekickKeypadProtected || mat.userData.sidekickFusedButtonProtected) {
        mat.userData.__revealAuthored = {
          transparent: false,
          depthWrite: true,
          depthTest: true,
          opacity: 1,
          alphaTest: 0
        };
      } else if (!mat.userData.__revealAuthored) {
        mat.userData.__revealAuthored = {
          transparent: Boolean(mat.transparent),
          depthWrite: mat.depthWrite !== false,
          depthTest: mat.depthTest !== false,
          opacity: Number.isFinite(mat.opacity) ? mat.opacity : 1,
          alphaTest: Number.isFinite(mat.alphaTest) ? mat.alphaTest : 0
        };
      }
      const auth = mat.userData.__revealAuthored;

      if (o >= 0.999) {
        const modeChanged =
          mat.transparent !== auth.transparent ||
          mat.depthWrite !== auth.depthWrite ||
          mat.depthTest !== auth.depthTest ||
          mat.alphaTest !== auth.alphaTest;
        mat.transparent = auth.transparent;
        mat.depthWrite = auth.depthWrite;
        mat.depthTest = auth.depthTest;
        mat.alphaTest = auth.alphaTest;
        mat.opacity = auth.opacity;
        if (modeChanged) mat.needsUpdate = true;
        return;
      }

      // Mid-fade: must be transparent; suppress depth writes until nearly opaque.
      const nextTransparent = true;
      const nextDepthWrite = o > 0.92 ? auth.depthWrite : false;
      const nextOpacity = auth.opacity * o;
      const modeChanged =
        mat.transparent !== nextTransparent || mat.depthWrite !== nextDepthWrite;
      mat.transparent = nextTransparent;
      mat.depthWrite = nextDepthWrite;
      mat.opacity = nextOpacity;
      if (modeChanged) mat.needsUpdate = true;
    });
  });
}

/**
 * @param {THREE.Object3D} root
 */
export function hideGroupForReveal(root) {
  setGroupRenderOpacity(root, 0);
}

/**
 * Frame-rate independent opacity ramp.
 * @param {THREE.Object3D} root
 * @param {number} start — 0→1
 * @param {number} end — 0→1
 * @param {number} dt — seconds
 * @param {number} [duration=1.35]
 * @returns {number} current opacity
 */
export function stepGroupReveal(root, start, end, dt, duration = 1.35) {
  const span = Math.max(duration, 0.001);
  const next = start + (end - start) * Math.min(1, dt / span);
  const opacity = end > start ? Math.min(next, end) : Math.max(next, end);
  setGroupRenderOpacity(root, opacity);
  return opacity;
}

/**
 * Off the beauty and fog-depth cameras until `compileHeldRoot` runs.
 *
 * Pass J: this was 3 — the same number as WET_FLOOR_LAYER, which the main
 * camera enables to see the wet floor. Every "held" root was therefore on
 * the beauty camera the whole time it was held, drawing (and building
 * programs/pipelines) live: measured +491k triangles on settled Bust frames
 * from PC/Sidekick roots at stop fade 0, with 109–351 ms beauty frames.
 * Layer 8 is used by nothing else; no live camera enables it.
 */
export const GPU_HOLD_LAYER = 8;

export function holdRootOffCamera(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.userData._gpuHoldMask == null) obj.userData._gpuHoldMask = obj.layers.mask;
    obj.layers.set(GPU_HOLD_LAYER);
  });
}

export function releaseRootToCamera(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const prev = obj.userData._gpuHoldMask;
    if (prev == null) obj.layers.set(0);
    else obj.layers.mask = prev;
    delete obj.userData._gpuHoldMask;
  });
}

/**
 * Compile programs for a held root before it is shown. One pass, not one
 * compile per mesh inside the live fog-depth + beauty frame.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 */
const _compileTarget = new THREE.WebGLRenderTarget(16, 16);

/**
 * Pass G — dedicated compile camera, masked to ONLY {@link GPU_HOLD_LAYER}.
 * Replaces `hideSceneExcept` (below, kept only for anything else still
 * calling it) as `compileHeldRoot`'s way of rendering just the held root:
 * since this camera's layer mask never includes layer 0, three's own
 * layer-test during scene traversal already skips every live object for
 * free — no `.visible` toggle on anything, ever, so a live frame that
 * happens to render while this is mid-flight sees exactly what it would
 * have seen anyway. Transform is copied from the real camera on each call
 * so the held root (wherever it actually sits) stays in frustum.
 */
const _compileCamera = new THREE.PerspectiveCamera();
_compileCamera.layers.set(GPU_HOLD_LAYER);

/**
 * `renderer.compile` skips shadow-depth variants. Draw only the held root
 * into an offscreen target (not the canvas) so the first beauty frame does
 * not compile them — and do not re-render the rest of the stage to do it.
 *
 * Pass G: this used to borrow the real, shared live camera (temporarily
 * widening its layer mask to GPU_HOLD_LAYER + layer 0, then calling
 * `hideSceneExcept` to blind it to everything on layer 0 it could now see)
 * — real visibility toggles on live scene objects, for the duration of an
 * `await` (`compileAsync`). The flight recorder's HOLD-phase BLINK trigger
 * (hole + disk vanishing for single frames while stars survive, since
 * StarField alone re-asserts `visible` every frame) is this exact
 * mechanism: any real frame that renders between the hide and its restore
 * — including one from a concurrent `compileHeldRoot` call for a different
 * root, since `onPropMounted` fires these without awaiting each other —
 * presents with those objects missing. The dedicated `_compileCamera` above
 * needs none of that: its mask never includes layer 0, so it already can't
 * see live scene content, with zero mutation of anything the live camera's
 * own frame depends on.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {THREE.Object3D} [root]
 */
export async function compileHeldRoot(renderer, scene, camera, root, wrap = (fn) => fn()) {
  if (!renderer || !scene || !camera) return;
  noteFlight("compileHeldRoot-start", { root: root?.name || "(unnamed)" });
  const prevTarget = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  const lights = [];

  _compileCamera.position.copy(camera.position);
  _compileCamera.quaternion.copy(camera.quaternion);
  if (camera.isPerspectiveCamera) {
    _compileCamera.fov = camera.fov;
    _compileCamera.aspect = camera.aspect;
    _compileCamera.near = camera.near;
    _compileCamera.far = camera.far;
    _compileCamera.updateProjectionMatrix();
  }
  _compileCamera.updateMatrixWorld(true);

  scene.traverse((obj) => {
    if (!obj.isLight || obj.layers.isEnabled(GPU_HOLD_LAYER)) return;
    lights.push(obj);
    obj.layers.enable(GPU_HOLD_LAYER);
  });

  renderer.shadowMap.needsUpdate = true;
  // Bind a target before compile. A null target compiles the ACES tone-mapped
  // variant; the composer beauty pass compiles NoToneMapping. Those are
  // different program keys, and the ACES ones showed up as hop 0→3 leaks.
  renderer.setRenderTarget(_compileTarget);
  renderer.autoClear = true;
  // `wrap` (Pass J): run compile + draw with `root` in a given material
  // state — withAuthoredVariant / withFadeVariant — restored synchronously.
  const linked = wrap(() => renderer.compileAsync(scene, _compileCamera));
  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAutoClear;
  for (const light of lights) light.layers.disable(GPU_HOLD_LAYER);
  noteFlight("compileHeldRoot-await", { root: root?.name || "(unnamed)" });
  await linked;
  noteFlight("compileHeldRoot-resumed", { root: root?.name || "(unnamed)" });
  for (const light of lights) light.layers.enable(GPU_HOLD_LAYER);
  renderer.shadowMap.needsUpdate = true;
  renderer.setRenderTarget(_compileTarget);
  renderer.autoClear = true;
  wrap(() => renderer.render(scene, _compileCamera));

  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAutoClear;
  for (const light of lights) light.layers.disable(GPU_HOLD_LAYER);
  noteFlight("compileHeldRoot-done", { root: root?.name || "(unnamed)" });
}

/**
 * Pass K item 1 — every variant of a held root in one batch: all
 * `compileAsync` calls are issued together (KHR_parallel_shader_compile links
 * them off the main thread; three polls completion, nothing forces a link
 * mid-frame) and awaited, then each variant gets one small held draw — one
 * per `yieldFrame` — for the shadow-depth programs and the ANGLE/Metal
 * pipeline objects `compile` does not build. The old path ran three full
 * compile+draw passes per root back to back, and with `onPropMounted`
 * firing ~13 Archaeology roots unawaited they all resolved in one gap
 * (380 ms, no frame presented).
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {THREE.Object3D} root
 * @param {{ wraps?: Array<(fn: () => any) => any>, yieldFrame?: () => Promise<void> }} [opts]
 */
export async function compileHeldRootVariants(renderer, scene, camera, root, opts = {}) {
  if (!renderer || !scene || !camera) return;
  const wraps = opts.wraps ?? [(fn) => fn()];
  const yieldFrame = opts.yieldFrame ?? (async () => {});
  const name = root?.name || "(unnamed)";
  // Pass K item 4 — one variant's compile batch per frame slot, awaited
  // (KHR_parallel_shader_compile links off the main thread; three polls).
  for (const wrap of wraps) {
    await yieldFrame();
    const shown = showAncestors(root);
    syncCompileCamera(camera);
    const lights = enableLightsOnHoldLayer(scene);
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.setRenderTarget(_compileTarget);
    renderer.autoClear = true;
    let pending = null;
    try {
      pending = wrap(() => renderer.compileAsync(scene, _compileCamera));
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.autoClear = prevAutoClear;
      for (const light of lights) light.layers.disable(GPU_HOLD_LAYER);
      shown();
    }
    await pending;
  }
  noteFlight("compileHeldRoot-done", { root: name, variants: wraps.length });
  for (const wrap of wraps) {
    await yieldFrame();
    const shownDraw = showAncestors(root);
    syncCompileCamera(camera);
    const held = enableLightsOnHoldLayer(scene);
    const target = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    const prevNeeds = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(_compileTarget);
    renderer.autoClear = true;
    try {
      wrap(() => renderer.render(scene, _compileCamera));
    } finally {
      renderer.setRenderTarget(target);
      renderer.autoClear = autoClear;
      renderer.shadowMap.needsUpdate = prevNeeds;
      for (const light of held) light.layers.disable(GPU_HOLD_LAYER);
      shownDraw();
    }
  }
}

/**
 * Pass M — three's compile / render skip hidden subtrees, and the world
 * group is hidden through the hold and the black gap: make the held root's
 * ancestors visible for the synchronous compile / draw, then restore.
 * Live cameras cannot see the root (GPU_HOLD_LAYER only), so nothing shows.
 * @param {THREE.Object3D | null | undefined} root
 * @returns {() => void} restore
 */
function showAncestors(root) {
  const flipped = [];
  for (let p = root?.parent; p; p = p.parent) {
    if (!p.visible) {
      p.visible = true;
      flipped.push(p);
    }
  }
  return () => {
    for (const p of flipped) p.visible = false;
  };
}

function syncCompileCamera(camera) {
  _compileCamera.position.copy(camera.position);
  _compileCamera.quaternion.copy(camera.quaternion);
  if (camera.isPerspectiveCamera) {
    _compileCamera.fov = camera.fov;
    _compileCamera.aspect = camera.aspect;
    _compileCamera.near = camera.near;
    _compileCamera.far = camera.far;
    _compileCamera.updateProjectionMatrix();
  }
  _compileCamera.updateMatrixWorld(true);
}

function enableLightsOnHoldLayer(scene) {
  const lights = [];
  scene.traverse((obj) => {
    if (!obj.isLight || obj.layers.isEnabled(GPU_HOLD_LAYER)) return;
    lights.push(obj);
    obj.layers.enable(GPU_HOLD_LAYER);
  });
  return lights;
}

const GPU_TEXTURE_KEYS = [
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

/**
 * Upload every material map under `root` that isn't already GPU-resident,
 * one texture per call so a single slow one (see `onSlowTexture`) cannot
 * stretch one warm step past budget. Checked against the renderer's own
 * texture properties first — an already-uploaded, version-matched texture
 * is skipped outright, not re-forced (see `debugSlowTextures` / the warm vs.
 * live-reveal timing check this was built to answer).
 * @param {THREE.Object3D | null | undefined} root
 * @param {THREE.WebGLRenderer | null | undefined} renderer
 * @param {(frames?: number) => Promise<void>} [yieldFrame]
 * @param {(info: { name: string, w: number, h: number, ms: number }) => void} [onSlowTexture]
 * @param {number} [slowMs=35]
 */
export async function warmMeshesChunked(root, renderer, yieldFrame, onSlowTexture, slowMs = 35) {
  if (!root || !renderer) return { uploaded: 0, skipped: 0, ms: 0 };
  const meshes = [];
  root.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });
  const seen = new Set();
  let uploaded = 0;
  let skipped = 0;
  const t00 = performance.now();
  for (let i = 0; i < meshes.length; i += 1) {
    const mats = Array.isArray(meshes[i].material)
      ? meshes[i].material
      : [meshes[i].material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const key of GPU_TEXTURE_KEYS) {
        const tex = mat[key];
        if (!tex?.isTexture || seen.has(tex)) continue;
        seen.add(tex);
        const props = renderer.properties.get(tex);
        const srcProps = tex.source ? renderer.properties.get(tex.source) : null;
        const alreadyResident =
          Boolean(props?.__webglTexture) && srcProps?.__version === tex.source?.version;
        if (alreadyResident) {
          skipped += 1;
          continue;
        }
        if (!tex.userData.__label) tex.userData.__label = `${root?.name || "root"}/${mat.name || "mat"}.${key}`;
        tex.needsUpdate = true;
        // DEV — separates GPU sync-point wait from actual upload cost for the
        // known-slow Ishtar Gate texture (diagnosis only; gl.finish() is not
        // called for any other texture, so this doesn't change normal timing).
        const isIshtarProbe = mat.name === "tripo_material_6baed76b-dead-4d56-ab5e-361c2228315d";
        let preFinishMs = 0;
        let postFinishMs = 0;
        const gl = isIshtarProbe ? renderer.getContext() : null;
        if (gl) {
          const tf0 = performance.now();
          gl.finish();
          preFinishMs = performance.now() - tf0;
        }
        const t0 = performance.now();
        renderer.initTexture(tex);
        const ms = performance.now() - t0;
        noteFlight("texture-upload", { root: root?.name || "(unnamed)", ms: Math.round(ms * 10) / 10 });
        if (gl) {
          const tf1 = performance.now();
          gl.finish();
          postFinishMs = performance.now() - tf1;
        }
        uploaded += 1;
        if (ms >= slowMs || isIshtarProbe) {
          onSlowTexture?.({
            name: mat.name ? `${mat.name}.${key}` : key,
            w: tex.image?.width ?? 0,
            h: tex.image?.height ?? 0,
            ms: Math.round(ms * 10) / 10,
            preFinishMs: isIshtarProbe ? Math.round(preFinishMs * 10) / 10 : undefined,
            postFinishMs: isIshtarProbe ? Math.round(postFinishMs * 10) / 10 : undefined
          });
        }
        tagFrame("material-warm");
        // Pass K item 1 — one texture per frame slot. Safe now that the root
        // is held on GPU_HOLD_LAYER while this runs (the old ">1 s present"
        // came from yielding with the root live on the beauty camera).
        if (yieldFrame) await yieldFrame();
      }
    }
  }
  return { uploaded, skipped, ms: Math.round((performance.now() - t00) * 10) / 10 };
}

/**
 * Pass J — put every opaque material under `root` into the mid-fade state
 * (transparent, no depth write, half opacity) for the duration of `fn`, then
 * restore each one exactly. Used to precompile *and* pre-draw the hop-fade
 * variant while the stop is off screen: three keeps each compiled variant in
 * the material's own program map for its lifetime, but on ANGLE/Metal the
 * blend state is part of the GPU pipeline object, so only a real draw with
 * blending on builds it (measured: 570–1520 ms on the first live fade of a
 * stop with zero new programs). Restoring synchronously means nothing — an
 * in-flight intro reveal included — ever observes the flip.
 * @template T
 * @param {THREE.Object3D | null | undefined} root
 * @param {() => T} fn
 * @returns {T}
 */
export function withFadeVariant(root, fn) {
  const saved = [];
  root?.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat || mat.transparent) continue;
      saved.push([mat, mat.depthWrite, mat.opacity]);
      mat.transparent = true;
      mat.depthWrite = false;
      mat.opacity = mat.opacity * 0.5;
      mat.needsUpdate = true;
    }
  });
  try {
    return fn();
  } finally {
    for (const [mat, depthWrite, opacity] of saved) {
      mat.transparent = false;
      mat.depthWrite = depthWrite;
      mat.opacity = opacity;
      mat.needsUpdate = true;
    }
    if (saved.length) noteFlight("fade-variants", { root: root?.name || "(unnamed)", materials: saved.length });
  }
}

/**
 * Pass J — the counterpart of {@link withFadeVariant}: put every material
 * under `root` that is mid-reveal (has a `__revealAuthored` snapshot from
 * {@link setGroupRenderOpacity}) back into its authored, final state for the
 * duration of `fn`. A stop whose warm step ran while the intro reveal had it
 * transparent otherwise never builds its opaque variant until the first hop
 * onto it (measured: pc_1 / pc_2 / cable_black / blinn1 / SCREENIMAGE
 * compiling live, `opaque:0>1`).
 * @template T
 * @param {THREE.Object3D | null | undefined} root
 * @param {() => T} fn
 * @returns {T}
 */
export function withAuthoredVariant(root, fn) {
  const saved = [];
  root?.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      const auth = mat?.userData?.__revealAuthored;
      if (!auth || (mat.transparent === auth.transparent && mat.depthWrite === auth.depthWrite)) continue;
      saved.push([mat, mat.transparent, mat.depthWrite, mat.opacity]);
      mat.transparent = auth.transparent;
      mat.depthWrite = auth.depthWrite;
      mat.opacity = auth.opacity;
      mat.needsUpdate = true;
    }
  });
  try {
    return fn();
  } finally {
    for (const [mat, transparent, depthWrite, opacity] of saved) {
      mat.transparent = transparent;
      mat.depthWrite = depthWrite;
      mat.opacity = opacity;
      mat.needsUpdate = true;
    }
  }
}

/**
 * Compile the hop-fade variant of everything under `root` (see
 * {@link withFadeVariant}). `compile` acquires programs before it returns.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Object3D} root
 * @param {THREE.Camera} camera
 * @param {THREE.Scene} scene  live scene (lights)
 * @param {THREE.WebGLRenderTarget | null} target  composer input (NoToneMapping key)
 * @returns {Promise<unknown>}
 */
export function compileFadeVariants(renderer, root, camera, scene, target) {
  if (!renderer || !root || !camera || !scene) return Promise.resolve();
  const prev = renderer.getRenderTarget();
  let pending = Promise.resolve();
  const compile = () => {
    try {
      if (target) renderer.setRenderTarget(target);
      return renderer.compileAsync(root, camera, scene);
    } catch (error) {
      console.warn("[stageModelReveal] fade-variant compile failed:", error);
      return Promise.resolve();
    } finally {
      renderer.setRenderTarget(prev);
    }
  };
  const authored = withAuthoredVariant(root, compile);
  pending = withFadeVariant(root, compile);
  return Promise.all([authored, pending]);
}
