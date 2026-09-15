import * as THREE from "three";

/**
 * Sample a neon gradient map at tube UV (u, v) after offset/repeat — same
 * texels the emissiveMap uses, so floor glow can match the tube foot.
 * @param {THREE.Texture} map
 * @param {number} u
 * @param {number} v  CylinderGeometry side: bottom = 0, top = 1
 * @param {THREE.Color} target
 * @returns {THREE.Color}
 */
export function sampleNeonMapUv(map, u, v, target, opts = {}) {
  const column = map?.userData?.column;
  const height = map?.userData?.columnHeight ?? 0;
  if (!column || height < 1) {
    return target.set(0xffffff);
  }
  const wrap = (x) => ((x % 1) + 1) % 1;
  const offsetY = opts.ignoreOffset ? 0 : (map.offset?.y ?? 0);
  const vv = wrap(v * (map.repeat?.y ?? 1) + offsetY);
  // CanvasTexture flipY (default true): GPU v=0 ↔ canvas bottom row.
  const py =
    map.flipY !== false
      ? Math.min(height - 1, Math.floor((1 - vv) * height))
      : Math.min(height - 1, Math.floor(vv * height));
  const i = py * 4;
  return target.setRGB(column[i] / 255, column[i + 1] / 255, column[i + 2] / 255, THREE.SRGBColorSpace);
}

/**
 * Tall strip so CylinderGeometry UVs run the gradient along V (length),
 * not around U (the tube). Repeat-wrapped so NeonSystem can scroll V.
 *
 * Seamlessness: loop color stops (…→ first), force first/last texels identical,
 * and **no mipmaps** — mip filtering across RepeatWrapping is what reads as the
 * traveling horizontal ring on the tube.
 * @param {string[]} colors
 * @returns {THREE.CanvasTexture}
 */
export function neonGradientTexture(colors) {
  const stops = colors?.length ? colors : ["#ffffff"];
  const w = 4;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // Close the loop: … → first stop, so wrap V lands on matching hues.
  const seq = stops.length === 1 ? [stops[0], stops[0]] : [...stops, stops[0]];
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  const m = seq.length;
  seq.forEach((col, i) => {
    gradient.addColorStop(i / (m - 1), col);
  });
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Byte-lock the wrap: last row === first row (canvas raster can drift).
  const img = ctx.getImageData(0, 0, w, h);
  const rowBytes = w * 4;
  for (let i = 0; i < rowBytes; i += 1) {
    img.data[(h - 1) * rowBytes + i] = img.data[i];
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Mipmaps across the V wrap = visible scrolling seam ring. Keep linear only.
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  // Cache one column for CPU foot sampling (matches canvas sRGB stops).
  const column = ctx.getImageData(0, 0, 1, h).data;
  tex.userData.column = new Uint8ClampedArray(column);
  tex.userData.columnHeight = h;
  return tex;
}
