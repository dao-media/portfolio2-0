/**
 * Archaeology stop light — a floating, self-lit daytime Earth instead of a
 * neon tube: daylight all the way round, as if the globe makes its own light.
 *
 * The day map (clouds baked in) drives both `map` and `emissiveMap` just
 * under the bloom threshold, so the whole sphere reads lit from within with
 * no terminator, and a blue fresnel atmosphere rim blooms slightly into a
 * halo. The stop's existing PointLight sits at the globe's centre (same
 * intensity rules as the tube's), tinted daylight white. Earth's real axial
 * tilt (23.44°), west-to-east spin.
 *
 * Runtime texture: `public/assets/models/globe/runtime/earth-day.jpg`
 * (from masters/Globe/…/Earth OBJ/Earth_Diffuse.png via
 * `scripts/rebuild-globe-runtime.sh`). The master mesh is a plain 1,800-face
 * UV sphere, so the sphere is built here.
 */

import * as THREE from "three";
export const GLOBE_URL = "/assets/models/globe/runtime/earth-day.jpg";

export const GLOBE = Object.freeze({
  /** Globe radius (m) — 3.2 m across; 0.5 m clear of the shelf's side (shelf AABB measured). */
  radius: 1.6,
  /** Centre height above the floor (m): floats ~0.25 m off the floor. */
  centerY: 1.85,
  /** Light tint: cool daylight white (no clash with Bust's amber lantern next on the ring). */
  light: 0xe8f0ff,
  /** Day-map emissive at full stop fade — just under the bloom threshold (1.0), so white clouds glow without washing out. */
  emissiveIntensity: 0.92,
  /** Atmosphere colour; halo peak at the limb and inner-scattering peak. Kept low: a wide band over the bloom threshold washed the whole disc blue. */
  rim: 0x6aa6ff,
  rimPeak: 0.55,
  innerPeak: 0.28,
  /** Floor pool scale vs a tube's (the globe is ~3.6x the old one). */
  poolScale: 3.4,
  /** Seconds per revolution. */
  spinSec: 140,
  /** Earth's axial tilt, 23.44° (rad). */
  tilt: (23.44 * Math.PI) / 180
});

/*
 * Atmosphere, two parts that meet without a seam (a single thin fresnel
 * shell read as a drawn outline):
 *  - halo: a back-faced shell out to HALO_SCALE x R. For each view ray, its
 *    closest approach to the globe's centre (impact distance p) sets the glow:
 *    full at the limb (p = R), fading smoothly to 0 at the shell (p = R_h).
 *  - inner scattering: a front-faced shell hugging the surface whose fresnel
 *    term rises toward the limb and hands off into the halo there.
 */
const HALO_SCALE = 1.28;

const ATMO_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vCenter;
  varying vec3 vN;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const HALO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLevel;
  uniform float uOpacity;
  uniform float uR;
  uniform float uRH;
  varying vec3 vWorld;
  varying vec3 vCenter;
  void main() {
    vec3 V = normalize(vWorld - cameraPosition);
    vec3 CP = vCenter - cameraPosition;
    float p = length(CP - V * dot(CP, V));
    float x = clamp((p - uR) / (uRH - uR), 0.0, 1.0);
    float g = pow(1.0 - x, 2.6);
    float a = g * uLevel * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const INNER_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLevel;
  uniform float uOpacity;
  varying vec3 vWorld;
  varying vec3 vN;
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float f = 1.0 - clamp(dot(normalize(vN), V), 0.0, 1.0);
    float a = pow(f, 4.5) * uLevel * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
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
    name: "globe-day",
    map: tex,
    emissiveMap: tex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0,
    roughness: 0.6,
    metalness: 0
  });
  const tiltPivot = new THREE.Group();
  tiltPivot.position.y = GLOBE.centerY;
  tiltPivot.rotation.z = GLOBE.tilt;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(GLOBE.radius, 96, 48), mat);
  sphere.name = "globe";
  // The stop light sits inside it: the globe must never shadow its own light.
  sphere.castShadow = false;
  sphere.receiveShadow = false;
  tiltPivot.add(sphere);

  const atmoMat = (fragmentShader, side, peak, extra = {}) =>
    new THREE.ShaderMaterial({
      name: "globe-atmosphere",
      uniforms: {
        uColor: { value: new THREE.Color(GLOBE.rim).multiplyScalar(peak) },
        uLevel: { value: 0 },
        uOpacity: { value: 1 },
        ...extra
      },
      vertexShader: ATMO_VERT,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side,
      blending: THREE.AdditiveBlending,
      toneMapped: true
    });
  const haloMat = atmoMat(HALO_FRAG, THREE.BackSide, GLOBE.rimPeak, {
    uR: { value: GLOBE.radius },
    uRH: { value: GLOBE.radius * HALO_SCALE }
  });
  const innerMat = atmoMat(INNER_FRAG, THREE.FrontSide, GLOBE.innerPeak);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(GLOBE.radius * HALO_SCALE, 96, 48), haloMat);
  halo.name = "globe-atmosphere-halo";
  const inner = new THREE.Mesh(new THREE.SphereGeometry(GLOBE.radius * 1.004, 96, 48), innerMat);
  inner.name = "globe-atmosphere-inner";
  for (const m of [halo, inner]) {
    m.castShadow = false;
    m.receiveShadow = false;
    m.raycast = () => {};
    tiltPivot.add(m);
  }
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
    for (const m of [haloMat, innerMat]) {
      m.uniforms.uLevel.value = displayLevel;
      m.uniforms.uOpacity.value = mat.opacity;
    }
    if (!reducedMotion) sphere.rotation.y = (timeSec / GLOBE.spinSec) * Math.PI * 2;
  };

  return root;
}
