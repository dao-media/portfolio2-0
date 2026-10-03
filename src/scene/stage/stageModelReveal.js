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

/** Off the beauty and fog-depth cameras until `compileHeldRoot` runs. */
export const GPU_HOLD_LAYER = 3;

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
export async function compileHeldRoot(renderer, scene, camera, root) {
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
  const linked = renderer.compileAsync(scene, _compileCamera);
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
  renderer.render(scene, _compileCamera);

  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAutoClear;
  for (const light of lights) light.layers.disable(GPU_HOLD_LAYER);
  noteFlight("compileHeldRoot-done", { root: root?.name || "(unnamed)" });
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
        // One texture per step — do not yield into the live fog-depth +
        // beauty frame here (that compiled each new program inside a >1s
        // present and stretched ~45s), just cap the cost per iteration.
      }
    }
  }
  return { uploaded, skipped, ms: Math.round((performance.now() - t00) * 10) / 10 };
}
