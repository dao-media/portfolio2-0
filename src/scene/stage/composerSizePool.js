import * as THREE from "three";

const MIN_EDGE = 64;

const GL_KEYS = [
  "__webglFramebuffer",
  "__webglMultisampledFramebuffer",
  "__webglDepthbuffer",
  "__webglColorRenderbuffer",
  "__webglTexture",
  "__boundDepthTexture",
  "__hasExternalTextures",
  "__useDefaultFramebuffer"
];

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
  patchSampleSwap(composer, renderer);
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
  poolFor(rt).set(sizeKey(rt, rt.width, rt.height, samples), {
    rt: snapshot(rtBag),
    tex: snapshot(tex),
    depth: snapshot(depth)
  });
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
  stash(renderer, rt, samples);
  const hit = poolFor(rt).get(sizeKey(rt, width, height, samples));
  writeSize(rt, width, height, depth);
  if (hit) {
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
 * The multisampling setter disposes both beauty targets. Stash the GL
 * objects under the old sample count and restore them on the way back.
 * @param {import("postprocessing").EffectComposer} composer
 * @param {THREE.WebGLRenderer} renderer
 */
function patchSampleSwap(composer, renderer) {
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
      stash(renderer, this.inputBuffer, prev);
      stash(renderer, this.outputBuffer, prev);
      this.inputBuffer.samples = value;
      this.outputBuffer.samples = value;
      restoreSamples(renderer, this.inputBuffer, value);
      restoreSamples(renderer, this.outputBuffer, value);
    }
  });
}

function restoreSamples(renderer, rt, samples) {
  const hit = poolFor(rt).get(sizeKey(rt, rt.width, rt.height, samples));
  if (hit) {
    applyHit(renderer, rt, hit);
    markMiss(rt, false);
    return;
  }
  const { rt: rtBag, tex, depth } = bags(renderer, rt);
  clearGl(rtBag);
  clearGl(tex);
  clearGl(depth);
  markMiss(rt, true);
}
