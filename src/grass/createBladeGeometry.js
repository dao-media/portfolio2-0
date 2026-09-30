/**
 * Tapered multi-segment grass blade (shared geo for InstancedMesh).
 * UV.y = height fraction — drives wind tip weight + tip color.
 * @param {{ segments?: number, width?: number, height?: number }} [opts]
 * @returns {import("three").BufferGeometry}
 */
import * as THREE from "three";
import {
  GRASS_BLADE_HEIGHT,
  GRASS_BLADE_SEGMENTS,
  GRASS_BLADE_TIP_WIDTH_FRAC,
  GRASS_BLADE_WIDTH
} from "./GrassConfig.js";

export function createBladeGeometry(opts = {}) {
  const segments = Math.max(1, opts.segments ?? GRASS_BLADE_SEGMENTS);
  const width = opts.width ?? GRASS_BLADE_WIDTH;
  const height = opts.height ?? GRASS_BLADE_HEIGHT;
  const tipFrac = Math.max(
    0.08,
    Math.min(1, opts.tipWidthFrac ?? GRASS_BLADE_TIP_WIDTH_FRAC)
  );

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const v = i / segments;
    const y = v * height;
    // Keep tip above ~1 px at typical bust framing (HalfFloat composer = no MSAA).
    const taper = 1 - v * (1 - tipFrac);
    const halfW = width * 0.5 * taper;
    const bend = Math.pow(v, 2) * 0.12;
    // left, center, right — slight +Z thickness for silhouette
    positions.push(-halfW, y, bend, 0, y, bend + 0.01, halfW, y, bend);
    uvs.push(0, v, 0.5, v, 1, v);
    if (i < segments) {
      const a = i * 3;
      indices.push(
        a,
        a + 3,
        a + 1,
        a + 1,
        a + 3,
        a + 4,
        a + 1,
        a + 4,
        a + 2,
        a + 2,
        a + 4,
        a + 5
      );
    }
  }

  // Second winding so FrontSide still shows the back of a blade.
  // DoubleSide disables early-Z and shades both faces.
  const flipped = [];
  for (let i = 0; i < indices.length; i += 3) {
    flipped.push(indices[i], indices[i + 2], indices[i + 1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices.concat(flipped));
  geo.computeVertexNormals();
  return geo;
}
