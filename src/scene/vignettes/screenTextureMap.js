import * as THREE from "three";

/**
 * pc-from-source.glb CRT face — matches production retropc-scene (CanvasTexture flipY: false).
 * Canvas row 0 (top) maps to low mesh V at the top of the monitor.
 */
export const SCREEN_MAP_CRT = {
  flipY: false,
  repeatX: 1,
  repeatY: 1,
  offsetX: 0,
  offsetY: 0
};

/** Legacy pc-textured.glb — inverted V on the screen atlas. */
export const SCREEN_MAP_CRT_LEGACY = {
  flipY: false,
  repeatX: 1,
  repeatY: -1,
  offsetX: 0,
  offsetY: 1
};

/** Authored splash rotation inside the hollow window (frame stays upright). */
export const SIDEKICK_SPLASH_ROTATION_DEG = 0;

/** Sidekick SCREENIMAGE — use mesh UVs directly on the square frame atlas. */
export const SIDEKICK_SCREEN_FLIP_Y = false;

/** Sidekick SCREENIMAGE — locked map; authored mesh UVs on the square frame atlas. */
export const SIDEKICK_SCREEN_MAP = {
  flipY: SIDEKICK_SCREEN_FLIP_Y,
  center: 0.5,
  rotation: 0,
  repeatX: 1,
  repeatY: 1,
  offsetX: 0,
  offsetY: 0
};

/** Blockout monitor plane. */
export const SCREEN_MAP_PLANE = {
  flipY: false,
  repeatX: 1,
  repeatY: 1,
  offsetX: 0,
  offsetY: 0
};

export function applyScreenMapSettings(texture, map = SCREEN_MAP_CRT) {
  texture.flipY = map.flipY;
  texture.center.set(0, 0);
  texture.rotation = 0;
  texture.repeat.set(map.repeatX, map.repeatY);
  texture.offset.set(map.offsetX, map.offsetY);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
}

function whenTextureImageReady(image) {
  if (!image) return Promise.reject(new Error("Sidekick screen texture has no image"));
  if (image.width > 0 && image.height > 0) return Promise.resolve();
  if (typeof image.complete === "boolean" && image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onDone = () => resolve();
    const onFail = () => reject(new Error("Sidekick screen texture failed to load"));
    if (typeof image.addEventListener === "function") {
      image.addEventListener("load", onDone, { once: true });
      image.addEventListener("error", onFail, { once: true });
    } else {
      reject(new Error("Sidekick screen texture image is not ready"));
    }
  });
}

/**
 * Crop the authored atlas island (mesh UV bounds) into a dedicated 0–1 texture.
 * @param {THREE.Texture} sourceTexture
 * @param {{ uMin: number, uMax: number, vMin: number, vMax: number }} bounds
 */
export function cropSidekickScreenAtlas(sourceTexture, bounds) {
  const image = sourceTexture.image;
  const width = image.width ?? image.naturalWidth;
  const height = image.height ?? image.naturalHeight;
  const uSpan = bounds.uMax - bounds.uMin || 1;
  const vSpan = bounds.vMax - bounds.vMin || 1;

  const cropW = Math.max(1, Math.round(uSpan * width));
  const cropH = Math.max(1, Math.round(vSpan * height));
  const srcX = bounds.uMin * width;
  // flipY:false — GL V=0 is the bottom of the image; canvas Y=0 is the top.
  const srcY = (1 - bounds.vMax) * height;

  const canvas = document.createElement("canvas");
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");

  const rotationRad = SIDEKICK_SCREEN_MAP.rotation;
  if (rotationRad !== 0) {
    ctx.translate(cropW * 0.5, cropH * 0.5);
    ctx.rotate(rotationRad);
    ctx.drawImage(
      image,
      srcX,
      srcY,
      uSpan * width,
      vSpan * height,
      -cropW * 0.5,
      -cropH * 0.5,
      cropW,
      cropH
    );
  } else {
    ctx.drawImage(image, srcX, srcY, uSpan * width, vSpan * height, 0, 0, cropW, cropH);
  }

  const cropped = new THREE.CanvasTexture(canvas);
  cropped.colorSpace = sourceTexture.colorSpace ?? THREE.SRGBColorSpace;
  cropped.flipY = SIDEKICK_SCREEN_FLIP_Y;
  cropped.wrapS = THREE.ClampToEdgeWrapping;
  cropped.wrapT = THREE.ClampToEdgeWrapping;
  cropped.matrixAutoUpdate = false;
  cropped.updateMatrix();
  cropped.needsUpdate = true;
  return cropped;
}

function remapGeometryUvToUnitSquare(geometry, bounds) {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;

  const uSpan = bounds.uMax - bounds.uMin || 1;
  const vSpan = bounds.vMax - bounds.vMin || 1;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(
      i,
      (uv.getX(i) - bounds.uMin) / uSpan,
      (uv.getY(i) - bounds.vMin) / vSpan
    );
  }
  uv.needsUpdate = true;
  return geometry;
}

const SIDEKICK_UV_ZERO_EPS = 1e-3;

export function isSidekickDegenerateUv(u, v) {
  return Math.abs(u) < SIDEKICK_UV_ZERO_EPS && Math.abs(v) < SIDEKICK_UV_ZERO_EPS;
}

/** UV bounds from verts that index the screen island — ignores (0,0) fillers. */
export function computeSidekickValidUvBounds(geometry) {
  const uv = geometry.attributes?.uv;
  if (!uv) return null;

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  let found = false;

  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (isSidekickDegenerateUv(u, v)) continue;
    found = true;
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
  }

  if (!found) return computeScreenUvBounds({ geometry });
  return { uMin, uMax, vMin, vMax };
}

/** Remap authored Sidekick UV island to 0–1; park filler verts at the island center. */
export function remapSidekickScreenUvs(geometry, bounds = null) {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;

  const island = bounds ?? computeSidekickValidUvBounds(geometry);
  if (!island) return geometry;

  const uSpan = island.uMax - island.uMin || 1;
  const vSpan = island.vMax - island.vMin || 1;

  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (isSidekickDegenerateUv(u, v)) {
      uv.setXY(i, 0.5, 0.5);
      continue;
    }
    uv.setXY(i, (u - island.uMin) / uSpan, (v - island.vMin) / vSpan);
  }

  uv.needsUpdate = true;
  return geometry;
}

export function applySidekickScreenMapSettings(texture, map = SIDEKICK_SCREEN_MAP) {
  applySidekickDisplayOrientation(texture, map);
}

/**
 * Lock the LCD atlas to authored mesh UVs — the screen rig handles swivel orientation.
 * @param {THREE.Texture} texture
 * @param {typeof SIDEKICK_SCREEN_MAP} [map]
 * @param {{ rotation?: number }} [orientation] — extra atlas spin (e.g. closed rolodex flip)
 */
export function applySidekickDisplayOrientation(
  texture,
  map = SIDEKICK_SCREEN_MAP,
  orientation = null
) {
  const center = map.center ?? 0.5;
  texture.flipY = map.flipY;
  texture.center.set(center, center);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.matrixAutoUpdate = false;
  texture.rotation = orientation?.rotation ?? map.rotation;
  texture.repeat.set(map.repeatX, map.repeatY);
  texture.offset.set(map.offsetX, map.offsetY);
  texture.updateMatrix();
  texture.needsUpdate = true;
}

/** @deprecated Use applySidekickScreenTexture from sidekickScreenTexture.js */
export { applySidekickScreenTexture as alignSidekickScreenTexture } from "./sidekickScreenTexture.js";

/** @deprecated Use ensureSidekickScreenMapLocked from sidekickScreenTexture.js */
export { ensureSidekickScreenMapLocked as lockSidekickScreenTexture } from "./sidekickScreenTexture.js";

/** UV bounds of the CRT face on the loaded GLB (not a full 0–1 atlas). */
export function computeScreenUvBounds(mesh) {
  const uv = mesh.geometry?.attributes?.uv;
  if (!uv) return null;

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;

  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
  }

  return { uMin, uMax, vMin, vMax };
}

/**
 * Pixel rect on the canvas texture that maps to the visible CRT face.
 * MySpace interior padding is measured from this window — not UV zoom.
 */
export function computeScreenWindowRect(width, height, bounds = null, map = SCREEN_MAP_PLANE) {
  if (!bounds) {
    return { x: 0, y: 0, w: width, h: height };
  }

  const corners = [
    { x: bounds.uMin, y: bounds.vMin },
    { x: bounds.uMax, y: bounds.vMin },
    { x: bounds.uMax, y: bounds.vMax },
    { x: bounds.uMin, y: bounds.vMax }
  ].map((uv) => screenUvToCanvas(uv, width, height, bounds, map));

  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);

  return {
    x: x0,
    y: y0,
    w: Math.max(1, x1 - x0),
    h: Math.max(1, y1 - y0)
  };
}

/**
 * Pick the screen texture map for a loaded monitor mesh.
 * pc-from-source uses standard UVs + flipY:false (production path).
 */
export function deriveCrtScreenMap(mesh) {
  const bounds = computeScreenUvBounds(mesh);
  if (!bounds) return SCREEN_MAP_CRT;

  const pos = mesh.geometry?.attributes?.position;
  const uv = mesh.geometry?.attributes?.uv;
  if (!pos || !uv) return SCREEN_MAP_CRT;

  let topV = null;
  let bottomV = null;
  let topY = -Infinity;
  let bottomY = Infinity;

  for (let i = 0; i < uv.count; i += 1) {
    const y = pos.getY(i);
    const v = uv.getY(i);
    if (y > topY) {
      topY = y;
      topV = v;
    }
    if (y < bottomY) {
      bottomY = y;
      bottomV = v;
    }
  }

  if (topV === null || bottomV === null) return SCREEN_MAP_CRT;
  return topV < bottomV ? SCREEN_MAP_CRT : SCREEN_MAP_CRT_LEGACY;
}

/**
 * Map raycast UV on the monitor mesh to canvas pixel coordinates (Canvas2D space, origin top-left).
 */
export function screenUvToCanvas(uv, width, height, bounds = null, map = SCREEN_MAP_PLANE) {
  let u = uv.x;
  let v = uv.y;

  if (bounds) {
    const uSpan = bounds.uMax - bounds.uMin || 1;
    const vSpan = bounds.vMax - bounds.vMin || 1;
    u = (uv.x - bounds.uMin) / uSpan;
    v = (uv.y - bounds.vMin) / vSpan;
  }

  const sampleU = map.offsetX + map.repeatX * u;
  let sampleV = map.offsetY + map.repeatY * v;

  if (map.repeatY < 0) {
    sampleV = map.offsetY + map.repeatY * v;
    return {
      x: sampleU * width,
      y: sampleV * height
    };
  }

  if (map.flipY === false) {
    return {
      x: sampleU * width,
      y: sampleV * height
    };
  }

  return {
    x: sampleU * width,
    y: (1 - sampleV) * height
  };
}
