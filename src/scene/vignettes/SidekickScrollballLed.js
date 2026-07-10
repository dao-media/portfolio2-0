import * as THREE from "three";

/** Authored GLB node + material for the trackball dome. */
export const SCROLLBALL_NODE_NAME = "scrollButton";
export const SCROLLBALL_MATERIAL_NAME = "lambert5";

/** Warm resin body sampled from Sidekick3.glb baseColorFactor. */
const RESIN_COLOR = new THREE.Color(0xd4c8a8);
const RESIN_OPACITY = 0.94;

/** Green LED filtered through the resin shell. */
const GLOW_COLOR = new THREE.Color(0x42ff58);
const ATTENUATION_COLOR = new THREE.Color(0x168832);

const IDLE_GLOW = 0.1;
const PEAK_GLOW = 2.85;

/** Full double-blink cycle (seconds). */
const CYCLE_S = 3.9;
const PULSE1_START = 0;
const PULSE2_START = 0.16;
const PULSE_DURATION = 0.075;
const PULSE_ATTACK = 0.22;

/**
 * Classic notification double-blink — quick on/off/on/off, then a long rest.
 * @param {number} time Scene elapsed seconds
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {number} Emissive intensity
 */
export function computeScrollballGlow(time, { reducedMotion = false } = {}) {
  if (reducedMotion) {
    return IDLE_GLOW * 1.35;
  }

  const t = ((time % CYCLE_S) + CYCLE_S) % CYCLE_S;
  const pulse1 = _pulseEnvelope(t, PULSE1_START, PULSE_DURATION);
  const pulse2 = _pulseEnvelope(t, PULSE2_START, PULSE_DURATION);
  const peak = Math.max(pulse1, pulse2);

  return IDLE_GLOW + peak * (PEAK_GLOW - IDLE_GLOW);
}

/** @param {number} t @param {number} start @param {number} duration */
function _pulseEnvelope(t, start, duration) {
  if (t < start || t >= start + duration) return 0;
  const u = (t - start) / duration;
  if (u < PULSE_ATTACK) {
    return u / PULSE_ATTACK;
  }
  const decay = (u - PULSE_ATTACK) / (1 - PULSE_ATTACK);
  return 1 - decay * decay;
}

/**
 * Resin-like physical material — semi-opaque body with transmission/attenuation
 * so the green LED reads as filtered from inside, not painted on the surface.
 * @param {THREE.Material | null | undefined} source
 * @returns {THREE.MeshPhysicalMaterial}
 */
export function createScrollballResinMaterial(source = null) {
  const color = RESIN_COLOR.clone();
  if (source?.color?.isColor) {
    color.copy(source.color);
  }

  const opacity =
    typeof source?.opacity === "number" && source.opacity > 0 ? source.opacity : RESIN_OPACITY;

  const mat = new THREE.MeshPhysicalMaterial({
    name: "sidekick_scrollball_resin",
    color,
    transparent: true,
    opacity,
    transmission: 0.8,
    thickness: 0.48,
    roughness: 0.34,
    metalness: 0,
    ior: 1.47,
    attenuationColor: ATTENUATION_COLOR.clone(),
    attenuationDistance: 0.36,
    emissive: GLOW_COLOR.clone(),
    emissiveIntensity: IDLE_GLOW,
    clearcoat: 0.72,
    clearcoatRoughness: 0.18,
    specularIntensity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: true,
    toneMapped: false
  });

  _installResinGlowShader(mat);
  return mat;
}

/** Extra inner-core bloom — light pooling inside the dome, not just surface emissive. */
function _installResinGlowShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uScrollGlow = { value: IDLE_GLOW };

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      /* glsl */ `
        #include <emissivemap_fragment>
        float resinView = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float resinFilter = pow(resinView, 0.55) * 0.72 + pow(1.0 - resinView, 2.4) * 0.28;
        totalEmissiveRadiance += emissive * uScrollGlow * resinFilter * 0.55;
      `
    );

    material.userData.scrollGlowUniform = shader.uniforms.uScrollGlow;
  };

  material.customProgramCacheKey = () => "sidekick_scrollball_resin_v1";
}

/**
 * Drives the Sidekick trackball notification LED (double-blink through resin).
 */
export class SidekickScrollballLed {
  /**
   * @param {THREE.Mesh} mesh
   * @param {THREE.MeshPhysicalMaterial} material
   * @param {{ reducedMotion?: boolean }} [options]
   */
  constructor(mesh, material, options = {}) {
    this.mesh = mesh;
    this.material = material;
    this.reducedMotion = options.reducedMotion ?? false;
  }

  /**
   * @param {THREE.Object3D | null} phoneRoot
   * @param {{ reducedMotion?: boolean }} [options]
   * @returns {SidekickScrollballLed | null}
   */
  static attach(phoneRoot, options = {}) {
    if (!phoneRoot) return null;

    /** @type {THREE.Mesh | null} */
    let mesh = phoneRoot.getObjectByName(SCROLLBALL_NODE_NAME) ?? null;
    if (!mesh?.isMesh) {
      phoneRoot.traverse((obj) => {
        if (mesh || !obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        if (mats.some((mat) => mat?.name === SCROLLBALL_MATERIAL_NAME)) {
          mesh = obj;
        }
      });
    }

    if (!mesh?.isMesh) {
      console.warn("[SidekickScrollballLed] scrollButton mesh not found.");
      return null;
    }

    const source = mesh.material;
    const resin = createScrollballResinMaterial(
      Array.isArray(source) ? source[0] : source
    );

    if (source && source !== resin) {
      const toDispose = Array.isArray(source) ? source : [source];
      toDispose.forEach((mat) => mat.dispose?.());
    }

    mesh.material = resin;
    mesh.renderOrder = 6;

    return new SidekickScrollballLed(mesh, resin, options);
  }

  /** @param {number} time Scene elapsed seconds */
  update(time) {
    const glow = computeScrollballGlow(time, { reducedMotion: this.reducedMotion });
    this.material.emissiveIntensity = glow;

    const atten = 0.34 + glow * 0.06;
    this.material.attenuationDistance = atten;

    const uniform = this.material.userData.scrollGlowUniform;
    if (uniform) {
      uniform.value = glow;
    }
  }
}
