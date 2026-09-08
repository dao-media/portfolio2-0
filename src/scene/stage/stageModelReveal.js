import * as THREE from "three";
import { tagFrame } from "./frameBudget.js";

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
 * Hide siblings of the held root's ancestor chain so a compile render does not
 * redraw the already-shown stage. Never hide the root, its parents, cameras,
 * or lights (the POV spot lives on the camera).
 * @param {THREE.Scene} scene
 * @param {THREE.Object3D} root
 * @returns {() => void}
 */
export function hideSceneExcept(scene, root) {
  const keep = new Set();
  let node = root;
  while (node) {
    keep.add(node);
    node = node.parent;
  }
  const hidden = [];
  const underRoot = (obj) => {
    let node = obj;
    while (node) {
      if (node === root) return true;
      node = node.parent;
    }
    return false;
  };
  scene.traverse((obj) => {
    if (obj === scene || keep.has(obj) || underRoot(obj)) return;
    if (obj.isLight || obj.isCamera) return;
    if (!obj.parent || !keep.has(obj.parent) || !obj.visible) return;
    obj.visible = false;
    hidden.push(obj);
  });
  return () => {
    for (const obj of hidden) obj.visible = true;
  };
}

/**
 * `renderer.compile` skips shadow-depth variants. Draw only the held root
 * into an offscreen target (not the canvas) so the first beauty frame does
 * not compile them — and do not re-render the rest of the stage to do it.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {THREE.Object3D} [root]
 */
export function compileHeldRoot(renderer, scene, camera, root) {
  if (!renderer || !scene || !camera) return;
  const mask = camera.layers.mask;
  const prevTarget = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  const lights = [];

  camera.layers.enable(GPU_HOLD_LAYER);
  scene.traverse((obj) => {
    if (!obj.isLight || obj.layers.isEnabled(GPU_HOLD_LAYER)) return;
    lights.push(obj);
    obj.layers.enable(GPU_HOLD_LAYER);
  });

  renderer.compile(scene, camera);

  const restore = root ? hideSceneExcept(scene, root) : null;
  renderer.shadowMap.needsUpdate = true;
  renderer.setRenderTarget(_compileTarget);
  renderer.autoClear = true;
  renderer.render(scene, camera);
  if (restore) restore();

  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAutoClear;
  camera.layers.mask = mask;
  for (const light of lights) light.layers.disable(GPU_HOLD_LAYER);
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
 * Upload material maps 1-mesh-per-batch so first hop to a deferred vignette
 * does not compile/upload on the click frame. Same cadence as Desktop's
 * INTRO_MATERIAL_BATCH_SIZE path.
 * @param {THREE.Object3D | null | undefined} root
 * @param {THREE.WebGLRenderer | null | undefined} renderer
 * @param {(frames?: number) => Promise<void>} [yieldFrame]
 * @param {number} [batchSize=1]
 */
export async function warmMeshesChunked(root, renderer, yieldFrame, batchSize = 1) {
  if (!root || !renderer) return;
  const meshes = [];
  root.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });
  const n = Math.max(1, batchSize | 0);
  for (let i = 0; i < meshes.length; i += 1) {
    const mats = Array.isArray(meshes[i].material)
      ? meshes[i].material
      : [meshes[i].material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const key of GPU_TEXTURE_KEYS) {
        const tex = mat[key];
        if (tex?.isTexture) renderer.initTexture(tex);
      }
    }
    tagFrame("material-warm");
    // Do not yield into the live fog-depth + beauty frame per mesh — that
    // compiled each new program inside a >1s present and stretched ~45s.
  }
}
