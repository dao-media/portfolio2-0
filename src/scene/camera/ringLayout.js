import * as THREE from "three";

export const TWO_PI = Math.PI * 2;

export const mod = (n, m) => ((n % m) + m) % m;

export function pointOnRing(angle, radius, y, center = [0, 0, 0]) {
  return new THREE.Vector3(
    center[0] + radius * Math.sin(angle),
    y,
    center[2] + radius * Math.cos(angle)
  );
}

// Reserved for a future absolute "jump to vignette N" interaction (e.g. nav
// dots), or as a drop-in upgrade to advance() below if your vignettes aren't
// perfectly evenly spaced — see the callout in CameraRig.advance().
export function shortestAngleDelta(from, to) {
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

// Builds camera-anchor data from your EXISTING vignette positions — this
// does not move or create anything in the scene.
//
// vignettes: array of { position: [x,y,z], focusPoint?: [x,y,z] }
//   - position: the vignette's current world position (required)
//   - focusPoint: optional distinct point for the camera to aim at when
//     zoomed in (e.g. a vignette's visual center if its origin/pivot is at
//     its base) — defaults to `position` if omitted.
//
// options.center: the shared point your vignettes are arranged around
// options.lookAtHeight: fixed eye-line height the RESTING camera aims at for
//   every vignette, so framing doesn't jump between a tall and a short
//   vignette — independent of each vignette's own height.
export function buildVignetteRing(vignettes, { center = [0, 0, 0], lookAtHeight }) {
  return vignettes.map((v, i) => {
    const position = new THREE.Vector3(...v.position);
    const dx = position.x - center[0];
    const dz = position.z - center[2];
    const angle = Math.atan2(dx, dz); // matches x = r·sin(θ), z = r·cos(θ) below
    const horizontalRadius = Math.hypot(dx, dz);

    return {
      index: i,
      angle,
      horizontalRadius,
      position,
      lookAt: pointOnRing(angle, horizontalRadius, lookAtHeight, center),
      focusPoint: v.focusPoint
        ? new THREE.Vector3(...v.focusPoint)
        : pointOnRing(angle, horizontalRadius, lookAtHeight, center)
    };
  });
}
