import * as THREE from "three";
import { ScreenLightRig } from "./ScreenLightRig.js";

/** @typedef {import("./ScreenLightRig.js").ScreenLightRig} ScreenLightRig */

/** Presets tuned per device — Sidekick uses the same helper when wired up. */
export const SCREEN_LIGHT_PRESETS = {
  pc: {
    maxSpillIntensity: 4.5,
    maxGlowIntensity: 0.45,
    sampleInterval: 4,
    smoothing: 0.08,
    saturationBoost: 1.35,
    forwardOffset: 0.012,
    glowDepth: 0.12,
    flipForward: false
  },
  sidekick: {
    maxSpillIntensity: 2.8,
    maxGlowIntensity: 0.32,
    sampleInterval: 4,
    smoothing: 0.1,
    saturationBoost: 1.4,
    forwardOffset: 0.008,
    glowDepth: 0.06,
    flipForward: false
  }
};

/**
 * Measure in-plane width/height from mesh geometry (local units).
 * Assumes the thinnest bounding-box axis is the screen normal.
 *
 * @param {THREE.Mesh} mesh
 * @returns {{ width: number, height: number }}
 */
export function measureScreenPlaneDimensions(mesh) {
  if (!mesh?.geometry) {
    return { width: 0.4, height: 0.3 };
  }

  if (!mesh.geometry.boundingBox) {
    mesh.geometry.computeBoundingBox();
  }

  const size = new THREE.Vector3();
  mesh.geometry.boundingBox.getSize(size);

  const dims = [size.x, size.y, size.z].sort((a, b) => b - a);
  return {
    width: Math.max(dims[0], 0.01),
    height: Math.max(dims[1], 0.01)
  };
}

/**
 * Attach a ScreenLightRig to any screen mesh in its local space (+Z toward viewer by default).
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Mesh} screenMesh
 * @param {THREE.Texture} screenTexture
 * @param {keyof typeof SCREEN_LIGHT_PRESETS | Partial<typeof SCREEN_LIGHT_PRESETS.pc>} [presetOrOptions]
 * @returns {ScreenLightRig | null}
 */
export function attachScreenLightRig(renderer, screenMesh, screenTexture, presetOrOptions = "pc") {
  if (!renderer || !screenMesh?.isMesh || !screenTexture) return null;

  const preset =
    typeof presetOrOptions === "string"
      ? (SCREEN_LIGHT_PRESETS[presetOrOptions] ?? SCREEN_LIGHT_PRESETS.pc)
      : {};
  const options = typeof presetOrOptions === "object" ? presetOrOptions : preset;
  const merged = { ...preset, ...options };

  const { width, height } = measureScreenPlaneDimensions(screenMesh);

  const rig = new ScreenLightRig(renderer, {
    screenTexture,
    screenWidth: merged.screenWidth ?? width,
    screenHeight: merged.screenHeight ?? height,
    maxSpillIntensity: merged.maxSpillIntensity,
    maxGlowIntensity: merged.maxGlowIntensity,
    sampleInterval: merged.sampleInterval,
    smoothing: merged.smoothing,
    saturationBoost: merged.saturationBoost,
    forwardOffset: merged.forwardOffset,
    glowDepth: merged.glowDepth,
    flipForward: merged.flipForward
  });

  screenMesh.add(rig.group);
  return rig;
}
