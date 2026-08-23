import * as THREE from "three";

/**
 * Tall strip so CylinderGeometry UVs run the gradient along V (length),
 * not around U (the tube).
 * @param {string[]} colors
 * @returns {THREE.CanvasTexture}
 */
export function neonGradientTexture(colors) {
  const stops = colors?.length ? colors : ["#ffffff"];
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  const n = stops.length;
  stops.forEach((col, i) => {
    gradient.addColorStop(n === 1 ? 0 : i / (n - 1), col);
  });
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
