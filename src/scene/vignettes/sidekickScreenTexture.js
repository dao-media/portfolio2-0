import * as THREE from "three";
import {
  applySidekickDisplayOrientation,
  applySidekickScreenMapSettings
} from "./screenTextureMap.js";

/** Bump to force re-snapshot of authored GLB geometry (never remaps UVs). */
export const SIDEKICK_SCREEN_UV_VERSION = 6;

/** Bezel frame with alpha cutout for live screen content. */
export const SIDEKICK_FRAME_URL = "/assets/models/sidekick/T-Mobile_Screenframe.png";

/** Default splash shown through the frame window. */
export const SIDEKICK_SPLASH_URL = "/assets/models/sidekick/branding-splash.svg";

/** Authored SVG viewBox — do not rely on `<img>` naturalWidth/Height for SVG. */
export const SIDEKICK_SPLASH_SIZE = { w: 1080, h: 360 };

/** Authored frame atlas size (px). */
export const SIDEKICK_FRAME_SIZE = 2360;

/** Fit splash inside the hollow window without cropping past the frame cutout. */
export const SIDEKICK_SPLASH_FIT = "letterbox";

/** Darken authored SVG grays so tagline survives minification on the closed phone. */
export const SIDEKICK_SPLASH_GRAY_REMAP = [
  ["#9a9c9f", "#3d4044"],
  ["#a1a1a1", "#454545"]
];

/** Splash rotation inside the hollow window (frame drawn unrotated on top). */
export const SIDEKICK_SPLASH_ROTATION_DEG = 0;

/** Background behind splash content in the hollow window. */
export const SIDEKICK_SPLASH_BG = "#ffffff";

/**
 * Transparent window in T-Mobile_Screenframe.png (alpha channel), px space.
 * Origin top-left; matches ImageMagick trim on alpha extract.
 */
export const SIDEKICK_SCREEN_WINDOW = {
  x: 363,
  y: 721,
  w: 1550,
  h: 1030
};

/**
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Sidekick screen asset failed to load: ${url}`));
    img.src = url;
  });
}

/**
 * Rasterize the splash SVG at its authored pixel size.
 * @returns {Promise<HTMLCanvasElement>}
 */
async function rasterizeSplashSvg() {
  const response = await fetch(SIDEKICK_SPLASH_URL);
  let svgText = await response.text();

  for (const [from, to] of SIDEKICK_SPLASH_GRAY_REMAP) {
    svgText = svgText.replaceAll(from, to);
    svgText = svgText.replaceAll(from.toUpperCase(), to);
  }

  if (!/\bwidth=/.test(svgText)) {
    svgText = svgText.replace(
      "<svg ",
      `<svg width="${SIDEKICK_SPLASH_SIZE.w}" height="${SIDEKICK_SPLASH_SIZE.h}" `
    );
  }

  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = await loadImage(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = SIDEKICK_SPLASH_SIZE.w;
    canvas.height = SIDEKICK_SPLASH_SIZE.h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = SIDEKICK_SPLASH_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Fit splash into the hollow window.
 * @param {"letterbox"|"cover"} [fit]
 */
export function fitContentInSidekickWindow(window, contentW, contentH, fit = SIDEKICK_SPLASH_FIT) {
  const windowAspect = window.w / window.h;
  const contentAspect = contentW / contentH;

  if (fit === "cover") {
    const scale = Math.max(window.w / contentW, window.h / contentH);
    const w = contentW * scale;
    const h = contentH * scale;
    return {
      x: window.x + (window.w - w) * 0.5,
      y: window.y + (window.h - h) * 0.5,
      w,
      h
    };
  }

  if (contentAspect >= windowAspect) {
    const w = window.w;
    const h = w / contentAspect;
    return {
      x: window.x,
      y: window.y + (window.h - h) * 0.5,
      w,
      h
    };
  }

  const h = window.h;
  const w = h * contentAspect;
  return {
    x: window.x + (window.w - w) * 0.5,
    y: window.y,
    w,
    h
  };
}

/**
 * Draw splash/content into the window (frame drawn separately).
 */
export function drawContentInSidekickWindow(
  ctx,
  content,
  contentW,
  contentH,
  window = SIDEKICK_SCREEN_WINDOW,
  rotationDeg = SIDEKICK_SPLASH_ROTATION_DEG
) {
  const dest = fitContentInSidekickWindow(window, contentW, contentH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(window.x, window.y, window.w, window.h);
  ctx.clip();
  ctx.translate(dest.x + dest.w * 0.5, dest.y + dest.h * 0.5);
  if (rotationDeg) {
    ctx.rotate((rotationDeg * Math.PI) / 180);
  }
  ctx.drawImage(content, -dest.w * 0.5, -dest.h * 0.5, dest.w, dest.h);
  ctx.restore();
}

/**
 * Composite splash content under the bezel frame.
 */
export function drawSidekickScreenComposite(
  ctx,
  frame,
  content,
  contentW,
  contentH,
  window = SIDEKICK_SCREEN_WINDOW
) {
  const size = SIDEKICK_FRAME_SIZE;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = SIDEKICK_SPLASH_BG;
  ctx.fillRect(window.x, window.y, window.w, window.h);

  drawContentInSidekickWindow(ctx, content, contentW, contentH, window);
  ctx.drawImage(frame, 0, 0, size, size);
}

/**
 * LCD readout — GLB exports SCREENIMAGE as fully metallic, which blacks out the
 * composite splash under stage lighting when the phone rests closed.
 * @param {THREE.Material} material
 */
export function configureSidekickScreenMaterial(material) {
  if (!material) return;

  material.metalness = 0;
  material.roughness = 0.38;
  material.color.setHex(0xffffff);
  material.emissive.setHex(0xffffff);
  material.emissiveIntensity = 0.9;
  if (material.map) {
    material.emissiveMap = material.map;
  }
  material.toneMapped = false;
  material.side = THREE.DoubleSide;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  material.depthWrite = true;
  material.visible = true;
}

/** Keep authored GLB UVs — only re-clone from the saved original when version bumps. */
function restoreAuthoredSidekickGeometry(screenMesh) {
  if (!screenMesh?.geometry) return screenMesh;

  if (!screenMesh.userData.sidekickOriginalGeometry) {
    screenMesh.userData.sidekickOriginalGeometry = screenMesh.geometry.clone();
  }

  if (screenMesh.userData.sidekickScreenUvVersion !== SIDEKICK_SCREEN_UV_VERSION) {
    screenMesh.geometry = screenMesh.userData.sidekickOriginalGeometry.clone();
    screenMesh.userData.sidekickScreenUvVersion = SIDEKICK_SCREEN_UV_VERSION;
  }

  return screenMesh;
}

/**
 * Re-apply SIDEKICK_SCREEN_MAP if anything touched the transform.
 * @param {THREE.Mesh} screenMesh
 */
export function ensureSidekickScreenMapLocked(screenMesh) {
  const material = Array.isArray(screenMesh?.material)
    ? screenMesh.material.find((mat) => mat?.name === "SCREENIMAGE" || mat?.map)
    : screenMesh?.material;
  if (!material?.map) return;
  applySidekickDisplayOrientation(material.map);
  configureSidekickScreenMaterial(material);
}

/**
 * Build the Sidekick SCREENIMAGE texture: splash in the hollow window + bezel frame.
 */
export async function buildSidekickScreenTexture(contentImage = null) {
  const [frame, splashCanvas] = await Promise.all([
    loadImage(SIDEKICK_FRAME_URL),
    contentImage ? Promise.resolve(contentImage) : rasterizeSplashSvg()
  ]);

  const contentW =
    contentImage?.width ?? contentImage?.naturalWidth ?? SIDEKICK_SPLASH_SIZE.w;
  const contentH =
    contentImage?.height ?? contentImage?.naturalHeight ?? SIDEKICK_SPLASH_SIZE.h;

  const canvas = document.createElement("canvas");
  canvas.width = SIDEKICK_FRAME_SIZE;
  canvas.height = SIDEKICK_FRAME_SIZE;
  const ctx = canvas.getContext("2d");
  drawSidekickScreenComposite(ctx, frame, splashCanvas, contentW, contentH);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  return { texture, canvas };
}

/**
 * Apply frame + splash texture. Authored UVs and SIDEKICK_SCREEN_MAP stay fixed.
 * @param {THREE.Mesh} screenMesh
 */
export async function applySidekickScreenTexture(screenMesh) {
  if (!screenMesh?.isMesh) return screenMesh;

  const material = Array.isArray(screenMesh.material)
    ? screenMesh.material.find((mat) => mat?.name === "SCREENIMAGE" || mat?.map)
    : screenMesh.material;
  if (!material) return screenMesh;

  restoreAuthoredSidekickGeometry(screenMesh);

  const { texture, canvas } = await buildSidekickScreenTexture();
  applySidekickScreenMapSettings(texture);

  material.map = texture;
  configureSidekickScreenMaterial(material);
  material.needsUpdate = true;

  screenMesh.userData.sidekickScreenTextureApplied = true;
  screenMesh.userData.sidekickScreenCanvas = canvas;
  screenMesh.userData.sidekickScreenAligned = true;

  return screenMesh;
}
