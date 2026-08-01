import * as THREE from "three";

/** Authored GLB node + material for the trackball dome. */
export const SCROLLBALL_NODE_NAME = "scrollButton";
export const SCROLLBALL_MATERIAL_NAME = "lambert5";

/** Warm resin body — Sidekick3.glb lambert5 base. */
const RESIN_COLOR = new THREE.Color(0xebe5d4);
/** Green LED filtered through the resin. */
const GLOW_COLOR = new THREE.Color(0x3dff6a);
/** Alert / message-sent red. */
const ALERT_COLOR = new THREE.Color(0xff2a2a);
const ATTENUATION_COLOR = new THREE.Color(0x1a6b2e);
const ATTENUATION_ALERT = new THREE.Color(0x6b1a1a);

const IDLE_GLOW = 0.18;
const PEAK_GLOW = 5.2;
const CORE_IDLE = 0.35;
const CORE_PEAK = 8.5;
const LIGHT_IDLE = 0.04;
const LIGHT_PEAK = 0.55;

/** Full double-blink cycle (seconds). */
const CYCLE_S = 3.6;
const PULSE1_START = 0;
const PULSE2_START = 0.18;
const PULSE_DURATION = 0.11;
const PULSE_ATTACK = 0.28;

/**
 * Classic notification double-blink — quick on/off/on/off, then a long rest.
 * @param {number} time Scene elapsed seconds
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {number} 0–1 pulse amount (idle sits above this via mix)
 */
export function computeScrollballPulse(time, { reducedMotion = false } = {}) {
  if (reducedMotion) return 0.22;

  const t = ((time % CYCLE_S) + CYCLE_S) % CYCLE_S;
  return Math.max(
    _pulseEnvelope(t, PULSE1_START, PULSE_DURATION),
    _pulseEnvelope(t, PULSE2_START, PULSE_DURATION)
  );
}

/** @deprecated Use computeScrollballPulse + mix with IDLE/PEAK. */
export function computeScrollballGlow(time, options = {}) {
  const pulse = computeScrollballPulse(time, options);
  return IDLE_GLOW + pulse * (PEAK_GLOW - IDLE_GLOW);
}

/** @param {number} t @param {number} start @param {number} duration */
function _pulseEnvelope(t, start, duration) {
  if (t < start || t >= start + duration) return 0;
  const u = (t - start) / duration;
  if (u < PULSE_ATTACK) return u / PULSE_ATTACK;
  const decay = (u - PULSE_ATTACK) / (1 - PULSE_ATTACK);
  return 1 - decay * decay;
}

/**
 * Semi-opaque resin shell — light reads as filtered from inside the dome.
 * @param {THREE.Material | null | undefined} source
 * @returns {THREE.MeshPhysicalMaterial}
 */
export function createScrollballResinMaterial(source = null) {
  const color = RESIN_COLOR.clone();
  if (source?.color?.isColor) color.copy(source.color);

  const opacity =
    typeof source?.opacity === "number" && source.opacity > 0
      ? Math.min(source.opacity, 0.82)
      : 0.78;

  const mat = new THREE.MeshPhysicalMaterial({
    name: "sidekick_scrollball_resin",
    color,
    transparent: true,
    opacity,
    transmission: 0.38,
    thickness: 0.55,
    roughness: 0.34,
    metalness: 0,
    ior: 1.49,
    attenuationColor: ATTENUATION_COLOR.clone(),
    attenuationDistance: 0.22,
    emissive: GLOW_COLOR.clone(),
    emissiveIntensity: IDLE_GLOW,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    specularIntensity: 0.75,
    side: THREE.FrontSide,
    depthWrite: false,
    toneMapped: false
  });

  _installResinGlowShader(mat);
  return mat;
}

/** View-dependent inner bloom — brighter through the dome center, softer at grazing. */
function _installResinGlowShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uScrollGlow = { value: IDLE_GLOW };

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      /* glsl */ `
        #include <emissivemap_fragment>
        float resinView = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        // Thick-center glow: LED pools in the middle, thins at the rim.
        float corePool = pow(resinView, 1.35);
        float rimFilter = pow(1.0 - resinView, 2.8) * 0.18;
        float resinFilter = corePool * 0.92 + rimFilter;
        totalEmissiveRadiance += emissive * uScrollGlow * resinFilter;
      `
    );

    material.userData.scrollGlowUniform = shader.uniforms.uScrollGlow;
  };

  material.customProgramCacheKey = () => "sidekick_scrollball_resin_v3";
}

function createLedCoreMaterial() {
  return new THREE.MeshStandardMaterial({
    name: "sidekick_scrollball_led_core",
    color: new THREE.Color(0x041208),
    emissive: GLOW_COLOR.clone(),
    emissiveIntensity: CORE_IDLE,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    toneMapped: false
  });
}

/**
 * Drives the Sidekick trackball notification LED — green double-blink
 * glowing through a semi-opaque resin dome.
 */
export class SidekickScrollballLed {
  /**
   * @param {THREE.Mesh} mesh
   * @param {THREE.MeshPhysicalMaterial} material
   * @param {{
   *   reducedMotion?: boolean,
   *   core?: THREE.Mesh,
   *   light?: THREE.PointLight
   * }} [options]
   */
  constructor(mesh, material, options = {}) {
    this.mesh = mesh;
    this.material = material;
    this.core = options.core ?? null;
    this.light = options.light ?? null;
    this.reducedMotion = options.reducedMotion ?? false;
    /** @type {{ until: number, pulses: number[] } | null} */
    this._alert = null;
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

    // Never dispose the GLTF material — even if lambert5 looks unique today,
    // disposing shared resources is what made Sidekick buttons vanish before.
    mesh.material = resin;
    mesh.renderOrder = 6;

    // Inner LED die — sits inside the dome so the blink filters through resin.
    mesh.geometry.computeBoundingSphere();
    const radius = mesh.geometry.boundingSphere?.radius ?? 0.7;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.38, 16, 12),
      createLedCoreMaterial()
    );
    core.name = "scrollballLedCore";
    core.renderOrder = 5;
    core.position.copy(mesh.geometry.boundingSphere?.center ?? new THREE.Vector3());
    mesh.add(core);

    const light = new THREE.PointLight(GLOW_COLOR.getHex(), LIGHT_IDLE, radius * 6, 2);
    light.name = "scrollballLedLight";
    light.position.copy(core.position);
    mesh.add(light);

    return new SidekickScrollballLed(mesh, resin, {
      ...options,
      core,
      light
    });
  }

  /**
   * Message-sent alert — two red flashes ~150ms apart.
   * @param {{ gapMs?: number, pulseMs?: number }} [options]
   * @returns {Promise<void>}
   */
  flashAlertRed(options = {}) {
    const gapMs = options.gapMs ?? 150;
    const pulseMs = options.pulseMs ?? 90;
    const now = performance.now();
    const pulses = [now, now + gapMs];
    const until = pulses[pulses.length - 1] + pulseMs + 40;
    this._alert = { until, pulses, pulseMs };

    return new Promise((resolve) => {
      const wait = until - now + 30;
      window.setTimeout(resolve, Math.max(wait, gapMs + pulseMs));
    });
  }

  /** @param {number} time Scene elapsed seconds */
  update(time) {
    const now = performance.now();
    const alertPulse = this._alertPulse(now);

    if (this._alert && now > this._alert.until) {
      this._alert = null;
      this._setLedColor(GLOW_COLOR, ATTENUATION_COLOR);
    }

    if (alertPulse > 0) {
      this._setLedColor(ALERT_COLOR, ATTENUATION_ALERT);
      this._applyGlow(alertPulse, {
        idleShell: 0.08,
        peakShell: 6.2,
        idleCore: 0.2,
        peakCore: 10,
        idleLight: 0.02,
        peakLight: 0.7
      });
      return;
    }

    const pulse = computeScrollballPulse(time, { reducedMotion: this.reducedMotion });
    this._setLedColor(GLOW_COLOR, ATTENUATION_COLOR);
    this._applyGlow(pulse, {
      idleShell: IDLE_GLOW,
      peakShell: PEAK_GLOW,
      idleCore: CORE_IDLE,
      peakCore: CORE_PEAK,
      idleLight: LIGHT_IDLE,
      peakLight: LIGHT_PEAK
    });
  }

  /**
   * @param {number} now
   * @returns {number} 0–1
   */
  _alertPulse(now) {
    if (!this._alert) return 0;
    const { pulses, pulseMs } = this._alert;
    let peak = 0;
    for (const start of pulses) {
      if (now < start || now > start + pulseMs) continue;
      const u = (now - start) / pulseMs;
      const env = u < 0.35 ? u / 0.35 : 1 - ((u - 0.35) / 0.65) ** 2;
      peak = Math.max(peak, env);
    }
    return peak;
  }

  /**
   * @param {THREE.Color} emissive
   * @param {THREE.Color} attenuation
   */
  _setLedColor(emissive, attenuation) {
    this.material.emissive.copy(emissive);
    this.material.attenuationColor.copy(attenuation);
    if (this.core?.material?.emissive) {
      this.core.material.emissive.copy(emissive);
    }
    if (this.light) {
      this.light.color.copy(emissive);
    }
  }

  /**
   * @param {number} pulse
   * @param {{ idleShell: number, peakShell: number, idleCore: number, peakCore: number, idleLight: number, peakLight: number }} levels
   */
  _applyGlow(pulse, levels) {
    const shellGlow = levels.idleShell + pulse * (levels.peakShell - levels.idleShell);
    const coreGlow = levels.idleCore + pulse * (levels.peakCore - levels.idleCore);

    this.material.emissiveIntensity = shellGlow;
    this.material.attenuationDistance = 0.18 + pulse * 0.2;
    this.material.opacity = 0.72 + pulse * 0.06;

    const uniform = this.material.userData.scrollGlowUniform;
    if (uniform) uniform.value = shellGlow;

    if (this.core?.material) {
      this.core.material.emissiveIntensity = coreGlow;
      this.core.material.opacity = 0.7 + pulse * 0.28;
    }

    if (this.light) {
      this.light.intensity = levels.idleLight + pulse * (levels.peakLight - levels.idleLight);
    }
  }
}
