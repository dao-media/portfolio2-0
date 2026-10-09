/**
 * Pass O O2 — VRAM census (DEV, `?vram=1`). Wraps the WebGL2 calls that
 * allocate GPU memory (texStorage / texImage / compressedTexImage,
 * renderbufferStorage[Multisample], bufferData) and frees on delete*, so the
 * live total is exact for what this context asked the driver for (padding
 * and driver-internal copies excluded). Objects are labelled afterwards by
 * mapping three's textures / render targets back to their GL handles.
 */

const BPP = new Map([
  [0x8058, 4], // RGBA8
  [0x8c43, 4], // SRGB8_ALPHA8
  [0x8051, 4], // RGB8 (stored padded)
  [0x881a, 8], // RGBA16F
  [0x8814, 16], // RGBA32F
  [0x881b, 8], // RGB16F (padded)
  [0x8815, 16], // RGB32F (padded)
  [0x8229, 1], // R8
  [0x822b, 2], // RG8
  [0x822d, 2], // R16F
  [0x822f, 4], // RG16F
  [0x822e, 4], // R32F
  [0x8230, 8], // RG32F
  [0x88f0, 4], // DEPTH24_STENCIL8
  [0x81a6, 4], // DEPTH_COMPONENT24
  [0x81a5, 2], // DEPTH_COMPONENT16
  [0x8cac, 4], // DEPTH_COMPONENT32F
  [0x8cad, 8], // DEPTH32F_STENCIL8
  [0x8d48, 1], // STENCIL_INDEX8
  [0x8c3a, 4], // R11F_G11F_B10F
  [0x8059, 4] // RGB10_A2
]);
const UNSIZED_TYPE_BPP = new Map([
  [0x1401, 4], // UNSIGNED_BYTE (RGBA)
  [0x1406, 16], // FLOAT
  [0x140b, 8], // HALF_FLOAT
  [0x8d61, 8] // HALF_FLOAT_OES
]);

function bppOf(internalformat, type) {
  return BPP.get(internalformat) ?? UNSIZED_TYPE_BPP.get(type) ?? 4;
}

function dims(args, sourceIndex) {
  const src = args[sourceIndex];
  return [src?.width ?? src?.videoWidth ?? 0, src?.height ?? src?.videoHeight ?? 0];
}

/**
 * @param {WebGL2RenderingContext} gl
 */
export function installVramTracker(gl) {
  if (gl.__vram) return gl.__vram;
  /** @type {Map<object, { kind: string, bytes: number, levels: Map<string, number>, w: number, h: number, fmt: number, samples?: number }>} */
  const live = new Map();
  const units = new Map();
  let unit = gl.TEXTURE0;
  const boundBuf = new Map();
  let boundRb = null;

  const entry = (obj, kind) => {
    let e = live.get(obj);
    if (!e) {
      e = { kind, bytes: 0, levels: new Map(), w: 0, h: 0, fmt: 0 };
      live.set(obj, e);
    }
    return e;
  };
  const texFor = (target) => {
    const t = target >= gl.TEXTURE_CUBE_MAP_POSITIVE_X && target <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z ? gl.TEXTURE_CUBE_MAP : target;
    return units.get(`${unit}:${t}`);
  };
  const setLevel = (obj, kind, key, bytes, w, h, fmt) => {
    if (!obj) return;
    const e = entry(obj, kind);
    e.bytes += bytes - (e.levels.get(key) ?? 0);
    e.levels.set(key, bytes);
    if (key.endsWith(":0") || key === "storage") {
      e.w = Math.max(e.w, w);
      e.h = Math.max(e.h, h);
      e.fmt = fmt;
    }
  };
  const wrap = (name, fn) => {
    const orig = gl[name].bind(gl);
    gl[name] = (...args) => {
      fn(...args);
      return orig(...args);
    };
  };

  wrap("activeTexture", (u) => {
    unit = u;
  });
  wrap("bindTexture", (target, tex) => {
    units.set(`${unit}:${target}`, tex);
  });
  wrap("texStorage2D", (target, levels, fmt, w, h) => {
    const faces = target === gl.TEXTURE_CUBE_MAP ? 6 : 1;
    let bytes = 0;
    for (let l = 0, lw = w, lh = h; l < levels; l += 1, lw = Math.max(1, lw >> 1), lh = Math.max(1, lh >> 1)) bytes += lw * lh * bppOf(fmt);
    setLevel(texFor(target), faces === 6 ? "cube" : "tex2d", "storage", bytes * faces, w, h, fmt);
  });
  wrap("texStorage3D", (target, levels, fmt, w, h, d) => {
    let bytes = 0;
    for (let l = 0, lw = w, lh = h; l < levels; l += 1, lw = Math.max(1, lw >> 1), lh = Math.max(1, lh >> 1)) bytes += lw * lh * d * bppOf(fmt);
    setLevel(texFor(target), "tex3d", "storage", bytes, w, h, fmt);
  });
  wrap("texImage2D", (...a) => {
    const [target, level, fmt] = a;
    let w;
    let h;
    let type;
    if (a.length >= 9 || (a.length === 8 && typeof a[3] === "number" && typeof a[4] === "number")) {
      [w, h] = [a[3], a[4]];
      type = a[7];
    } else {
      [w, h] = dims(a, 5);
      type = a[4];
    }
    const face = target - gl.TEXTURE_CUBE_MAP_POSITIVE_X;
    const key = face >= 0 && face < 6 ? `f${face}:${level}` : `l:${level}`;
    setLevel(texFor(target), face >= 0 && face < 6 ? "cube" : "tex2d", key, w * h * bppOf(fmt, type), w, h, fmt);
  });
  wrap("texImage3D", (target, level, fmt, w, h, d, _b, _f, type) => {
    setLevel(texFor(target), "tex3d", `l:${level}`, w * h * d * bppOf(fmt, type), w, h, fmt);
  });
  wrap("compressedTexImage2D", (target, level, fmt, w, h, _b, data) => {
    const face = target - gl.TEXTURE_CUBE_MAP_POSITIVE_X;
    const key = face >= 0 && face < 6 ? `f${face}:${level}` : `l:${level}`;
    setLevel(texFor(target), "compressed", key, data?.byteLength ?? 0, w, h, fmt);
  });
  wrap("deleteTexture", (tex) => live.delete(tex));
  wrap("bindRenderbuffer", (_t, rb) => {
    boundRb = rb;
  });
  wrap("renderbufferStorage", (_t, fmt, w, h) => setLevel(boundRb, "renderbuffer", "storage", w * h * bppOf(fmt), w, h, fmt));
  wrap("renderbufferStorageMultisample", (_t, samples, fmt, w, h) => {
    setLevel(boundRb, "renderbuffer", "storage", w * h * bppOf(fmt) * Math.max(1, samples), w, h, fmt);
    if (boundRb) live.get(boundRb).samples = samples;
  });
  wrap("deleteRenderbuffer", (rb) => live.delete(rb));
  wrap("bindBuffer", (target, buf) => boundBuf.set(target, buf));
  wrap("bufferData", (target, sizeOrData) => {
    const bytes = typeof sizeOrData === "number" ? sizeOrData : (sizeOrData?.byteLength ?? 0);
    setLevel(boundBuf.get(target), target === gl.ELEMENT_ARRAY_BUFFER ? "index" : target === gl.UNIFORM_BUFFER ? "ubo" : "buffer", "storage", bytes, 0, 0, 0);
  });
  wrap("deleteBuffer", (buf) => live.delete(buf));

  // Calls that round-trip to the GPU process (the worker waits for the GPU
  // main thread). Counted with one sample stack each (DEV probe only).
  const SYNC = ["getError", "checkFramebufferStatus", "getProgramParameter", "getShaderParameter", "getProgramInfoLog", "getShaderInfoLog", "clientWaitSync", "getSyncParameter", "getQueryParameter", "finish", "getBufferSubData", "getUniformLocation", "getAttribLocation", "getActiveUniform", "getActiveAttrib", "getUniformBlockIndex", "getParameter", "getFramebufferAttachmentParameter", "getInternalformatParameter"];
  const sync = { counts: {}, stacks: {} };
  for (const name of SYNC) {
    if (typeof gl[name] !== "function") continue;
    const orig = gl[name].bind(gl);
    gl[name] = (...args) => {
      const key = name === "getParameter" || name === "getProgramParameter" || name === "getQueryParameter" ? `${name}(0x${Number(args[args.length - 1]).toString(16)})` : name;
      sync.counts[key] = (sync.counts[key] ?? 0) + 1;
      if (!sync.stacks[key]) sync.stacks[key] = new Error().stack?.split("\n").slice(2, 7).map((l) => l.trim()).join(" | ");
      return orig(...args);
    };
  }
  gl.__vram = { live, sync };
  return gl.__vram;
}
