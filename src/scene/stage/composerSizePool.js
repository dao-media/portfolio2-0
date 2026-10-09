import * as THREE from "three";

const MIN_EDGE = 64;
/** Pass O — sizes kept per target (6 floor notches + rest + snapped motion sizes); LRU beyond, freed. */
const POOL_MAX = 12;

const GL_KEYS = [
  "__webglFramebuffer",
  "__webglMultisampledFramebuffer",
  "__webglDepthbuffer",
  // The multisampled framebuffer's OWN depth renderbuffer — a separate GL
  // object from __webglDepthbuffer (which belongs to the resolved
  // framebuffer). WebGLTextures.js's setupRenderTarget creates this one via
  // renderbufferStorageMultisample, sized to the target's CURRENT
  // width/height, and attaches it only to __webglMultisampledFramebuffer.
  // Leaving it out of GL_KEYS meant every pooled resize/restore left it
  // stale relative to whichever framebuffer pair got stashed or restored —
  // eventually landing a __webglMultisampledFramebuffer (read side of
  // three's internal MSAA resolve blit) and a __webglDepthbuffer (write
  // side) that pointed at the same underlying image, which is exactly
  // "GL_INVALID_OPERATION: Read and write depth stencil attachments cannot
  // be the same image."
  "__webglDepthRenderbuffer",
  "__webglColorRenderbuffer",
  "__webglTexture",
  "__boundDepthTexture",
  "__hasExternalTextures",
  "__useDefaultFramebuffer"
];

/**
 * Pass O — the pool kept every size a target ever had. Motion DPR walks
 * ~20 one-pixel-apart sizes per hop, so each hop left a full set of post
 * targets behind: 8.7 GB live after one hop cycle (4x MSAA half-float at
 * full canvas size is 210 MB a buffer), and rare 0.5 s GPU stalls. The
 * owner now says whether the size being LEFT is a tier size (floor notch /
 * rest budget / sequence — pooled, the swap stays free) or a motion size
 * (its GL objects are deleted instead).
 */
let discardOutgoing = false;
/** DEV A/B (`?poolall=1`): the pre-Pass-O pool — every size kept forever. */
let legacy = false;
export function setPoolLegacy(on) {
  legacy = Boolean(on);
}

/** @param {boolean} on  true while resizing away from a non-tier (motion) size */
export function setPoolDiscardOutgoing(on) {
  discardOutgoing = Boolean(on);
}

/**
 * Keep composer (and pass) render targets alive across megapixel tiers.
 * EffectComposer.setSize disposes and reallocates; that stall is the floor
 * drop. A later setSize of a size we already allocated swaps the GL ids.
 * @param {THREE.WebGLRenderer} renderer
 * @param {import("postprocessing").EffectComposer} composer
 */
export function installComposerSizePool(renderer, composer) {
  const proto = THREE.WebGLRenderTarget.prototype;
  if (!proto.__floorSizePool) {
    const orig = proto.setSize;
    proto.setSize = function pooledSetSize(width, height, depth = 1) {
      const w = width | 0;
      const h = height | 0;
      if (w < MIN_EDGE || h < MIN_EDGE) return orig.call(this, width, height, depth);
      swapTargetSize(this, w, h, depth | 0 || 1, renderer);
    };
    proto.__floorSizePool = true;
  }
  patchSampleSwap(composer);
}

function poolFor(rt) {
  if (!rt.userData) rt.userData = {};
  if (!rt.userData._sizePool) rt.userData._sizePool = new Map();
  return rt.userData._sizePool;
}

function markMiss(rt, miss) {
  if (!rt.userData) rt.userData = {};
  rt.userData._poolMiss = miss;
}

function sizeKey(rt, w, h, samples) {
  return `${w}x${h}x${samples | 0}x${rt.texture?.type ?? 0}`;
}

function snapshot(bag) {
  if (!bag) return null;
  const out = {};
  for (let i = 0; i < GL_KEYS.length; i += 1) {
    const key = GL_KEYS[i];
    if (key in bag) out[key] = bag[key];
  }
  return out;
}

function restore(bag, snap) {
  if (!bag || !snap) return;
  const keys = Object.keys(snap);
  for (let i = 0; i < keys.length; i += 1) bag[keys[i]] = snap[keys[i]];
}

function clearGl(bag) {
  if (!bag) return;
  for (let i = 0; i < GL_KEYS.length; i += 1) {
    const key = GL_KEYS[i];
    if (key in bag) bag[key] = undefined;
  }
}

function bags(renderer, rt) {
  return {
    rt: renderer.properties.get(rt),
    tex: rt.texture ? renderer.properties.get(rt.texture) : null,
    depth: rt.depthTexture ? renderer.properties.get(rt.depthTexture) : null
  };
}

function stash(renderer, rt, samples) {
  const { rt: rtBag, tex, depth } = bags(renderer, rt);
  if (!rtBag?.__webglFramebuffer && !rtBag?.__webglMultisampledFramebuffer) return;
  const pool = poolFor(rt);
  const key = sizeKey(rt, rt.width, rt.height, samples);
  pool.delete(key); // re-insert = most recently used
  pool.set(key, {
    rt: snapshot(rtBag),
    tex: snapshot(tex),
    depth: snapshot(depth)
  });
  while (!legacy && pool.size > POOL_MAX) {
    const [oldKey, old] = pool.entries().next().value;
    pool.delete(oldKey);
    deleteSnapshot(renderer, old);
  }
}

function deleteSnapshot(renderer, entry) {
  const gl = renderer.getContext();
  for (const snap of [entry.rt, entry.tex, entry.depth]) {
    for (const v of Object.values(snap ?? {})) {
      for (const o of [v].flat()) {
        if (o instanceof globalThis.WebGLFramebuffer) gl.deleteFramebuffer(o);
        else if (o instanceof globalThis.WebGLRenderbuffer) gl.deleteRenderbuffer(o);
        else if (o instanceof globalThis.WebGLTexture) gl.deleteTexture(o);
      }
    }
  }
}

function applyHit(renderer, rt, hit) {
  const { rt: rtBag, tex, depth } = bags(renderer, rt);
  restore(rtBag, hit.rt);
  restore(tex, hit.tex);
  restore(depth, hit.depth);
  if (tex && rt.texture) tex.__version = rt.texture.version;
  if (depth && rt.depthTexture) depth.__version = rt.depthTexture.version;
}

function writeSize(rt, width, height, depth) {
  rt.width = width;
  rt.height = height;
  rt.depth = depth;
  if (rt.texture?.image) {
    rt.texture.image.width = width;
    rt.texture.image.height = height;
  }
  if (rt.depthTexture?.image) {
    rt.depthTexture.image.width = width;
    rt.depthTexture.image.height = height;
  }
  rt.viewport.set(0, 0, width, height);
  rt.scissor.set(0, 0, width, height);
}

function swapTargetSize(rt, width, height, depth, renderer) {
  if (rt.width === width && rt.height === height && (rt.depth || 1) === depth) {
    rt.viewport.set(0, 0, width, height);
    rt.scissor.set(0, 0, width, height);
    markMiss(rt, false);
    return;
  }
  const samples = rt.samples | 0;
  if (discardOutgoing && !legacy) dropCurrent(renderer, rt);
  else stash(renderer, rt, samples);
  const hit = poolFor(rt).get(sizeKey(rt, width, height, samples));
  writeSize(rt, width, height, depth);
  if (hit) {
    if (!legacy) poolFor(rt).delete(sizeKey(rt, width, height, samples));
    applyHit(renderer, rt, hit);
    markMiss(rt, false);
    return;
  }
  const { rt: rtBag, tex, depth: depthBag } = bags(renderer, rt);
  clearGl(rtBag);
  clearGl(tex);
  clearGl(depthBag);
  markMiss(rt, true);
}

/**
 * The multisampling setter used to stash the GL objects under the old sample
 * count and restore them on the way back — the same pooling trick as
 * swapTargetSize, and vulnerable to the same gap: it never tracked
 * __webglDepthRenderbuffer (the multisampled framebuffer's own depth
 * renderbuffer, separate from __webglDepthbuffer on the resolved
 * framebuffer), which is what actually produced
 * "GL_INVALID_OPERATION: Read and write depth stencil attachments cannot be
 * the same image." during three's own resolve blit. This now matches
 * `postprocessing`'s own native multisampling setter — set `.samples`, then
 * `.dispose()` both buffers so three's normal setupRenderTarget path
 * recreates the multisampled framebuffer and its depth renderbuffer
 * together, consistently, instead of a partial pooled restore.
 * @param {import("postprocessing").EffectComposer} composer
 */
function patchSampleSwap(composer) {
  if (composer.__floorSampleSwap) return;
  composer.__floorSampleSwap = true;
  Object.defineProperty(composer, "multisampling", {
    configurable: true,
    get() {
      return this.inputBuffer.samples;
    },
    set(value) {
      const prev = this.inputBuffer.samples;
      if (prev === value) return;
      this.inputBuffer.samples = value;
      this.outputBuffer.samples = value;
      this.inputBuffer.dispose();
      this.outputBuffer.dispose();
      // setMultisampling() (PostPass.js) calls composer.setSize() right after
      // this setter to force reallocation at the new sample count — which
      // re-enters swapTargetSize's pooled setSize for these SAME two
      // targets. A stale pool entry from an earlier cycle at this exact
      // size+samples would restore GL object ids that dispose() just deleted
      // a moment ago. Drop each target's own pool so that reallocation is
      // always a clean miss → three creates fresh objects, never a restore
      // of just-freed ones.
      clearPool(this.inputBuffer);
      clearPool(this.outputBuffer);
    }
  });
}

/** Delete the target's current GL objects (what three's dispose would free). */
function dropCurrent(renderer, rt) {
  const gl = renderer.getContext();
  const { rt: rtBag, tex, depth } = bags(renderer, rt);
  const pooled = new Set();
  for (const entry of rt.userData?._sizePool?.values() ?? []) {
    for (const snap of [entry.rt, entry.tex, entry.depth]) for (const v of Object.values(snap ?? {})) [v].flat().forEach((o) => o && pooled.add(o));
  }
  for (const bag of [rtBag, tex, depth]) {
    if (!bag) continue;
    for (const key of GL_KEYS) {
      for (const o of [bag[key]].flat()) {
        if (!o || typeof o !== "object" || pooled.has(o)) continue;
        // is*() throws on the wrong type; instanceof does not.
        if (o instanceof globalThis.WebGLFramebuffer) gl.deleteFramebuffer(o);
        else if (o instanceof globalThis.WebGLRenderbuffer) gl.deleteRenderbuffer(o);
        else if (o instanceof globalThis.WebGLTexture) gl.deleteTexture(o);
      }
    }
  }
}

function clearPool(rt) {
  rt.userData?._sizePool?.clear();
}
