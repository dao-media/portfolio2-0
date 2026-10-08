/**
 * Archaeology stop light — a floating night-side Earth instead of a neon tube.
 *
 * The stop's existing PointLight sits at the globe's centre (same height,
 * `NEON_LIGHT_HEIGHT`, and same intensity as the tube's), tinted to the
 * globe's city-light amber. The globe itself is emissive: the night map
 * (cities bright, oceans near-black) drives both `map` and `emissiveMap`,
 * plus a faint blue fresnel atmosphere rim. It turns slowly on its axis.
 *
 * Runtime texture: `public/assets/models/globe/runtime/earth-night.jpg`
 * (from masters/Globe/…/Night Earth OBJ/Earth_Diffuse.png via
 * `scripts/rebuild-globe-runtime.sh`). The master mesh is a plain 1,800-face
 * UV sphere, so the sphere is built here.
 */

import * as THREE from "three";
import { NEON_LIGHT_HEIGHT } from "../stage/constants.js";

export const GLOBE_URL = "/assets/models/globe/runtime/earth-night.jpg";

export const GLOBE = Object.freeze({
  /** Globe radius (m). */
  radius: 0.45,
  /** Centre height above the floor (m) — where the tube's light already sat. */
  centerY: NEON_LIGHT_HEIGHT,
  /** Light tint: the night map's city lights sample #ffe4ad; a touch warmer so it reads amber under ACES. */
  light: 0xffd394,
  /** City-light emissive at full stop fade (bloom threshold is 1.0: the brightest cities bloom). */
  emissiveIntensity: 2.2,
  /** Atmosphere rim colour and peak (kept under the bloom threshold). */
  rim: 0x4f8dff,
  rimPeak: 0.55,
  /** Seconds per revolution. */
  spinSec: 140,
  /** Axial tilt (rad). */
  tilt: 0.41
});

const RIM_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const RIM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLevel;
  uniform float uOpacity;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
    float rim = pow(f, 3.0);
    gl_FragColor = vec4(uColor * rim * uLevel, rim * uLevel * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * @param {{
 *   neonTubeXZ?: [number, number],
 *   loadingManager?: THREE.LoadingManager | null
 * }} def
 * @returns {THREE.Group}
 */
export function makeNeonGlobe(def = {}) {
  const xz = def.neonTubeXZ ?? [2.2, 0.85];
  const root = new THREE.Group();
  root.name = "neon-tube";
  root.userData.neonProp = "globe";
  root.userData.seatOrigin = "bottom";
  root.userData.tubeLength = GLOBE.centerY + GLOBE.radius;
  root.userData.flameLocalY = GLOBE.centerY;
  root.userData.globeWarm = new THREE.Color(GLOBE.light);
  root.position.set(xz[0], 0, xz[1]);

  const tex = new THREE.TextureLoader(def.loadingManager ?? undefined).load(GLOBE_URL);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const mat = new THREE.MeshStandardMaterial({
    name: "globe-night",
    map: tex,
    emissiveMap: tex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0,
    roughness: 0.72,
    metalness: 0
  });
  const tiltPivot = new THREE.Group();
  tiltPivot.position.y = GLOBE.centerY;
  tiltPivot.rotation.z = GLOBE.tilt;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(GLOBE.radius, 64, 32), mat);
  sphere.name = "globe";
  // The stop light sits inside it: the globe must never shadow its own light.
  sphere.castShadow = false;
  sphere.receiveShadow = false;
  tiltPivot.add(sphere);

  const rimMat = new THREE.ShaderMaterial({
    name: "globe-atmosphere",
    uniforms: {
      uColor: { value: new THREE.Color(GLOBE.rim).multiplyScalar(GLOBE.rimPeak) },
      uLevel: { value: 0 },
      uOpacity: { value: 1 }
    },
    vertexShader: RIM_VERT,
    fragmentShader: RIM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: true
  });
  const rim = new THREE.Mesh(new THREE.SphereGeometry(GLOBE.radius * 1.045, 48, 24), rimMat);
  rim.name = "globe-atmosphere";
  rim.castShadow = false;
  rim.receiveShadow = false;
  rim.raycast = () => {};
  tiltPivot.add(rim);
  root.add(tiltPivot);

  // NeonSystem reads `.material` for the arrive level.
  Object.defineProperty(root, "material", {
    get: () => mat,
    set: () => {},
    configurable: true
  });
  root.userData.neonCoreMat = mat;
  root.userData.neonDriveMats = [mat];
  root.userData.neonGlassMats = [];

  /**
   * @param {number} timeSec
   * @param {number} displayLevel 0–1 (stop fade)
   * @param {boolean} reducedMotion
   */
  root.userData.tickGlobe = (timeSec, displayLevel, reducedMotion) => {
    mat.emissiveIntensity = displayLevel * GLOBE.emissiveIntensity;
    rimMat.uniforms.uLevel.value = displayLevel;
    rimMat.uniforms.uOpacity.value = mat.opacity;
    if (!reducedMotion) sphere.rotation.y = (timeSec / GLOBE.spinSec) * Math.PI * 2;
  };

  return root;
}
