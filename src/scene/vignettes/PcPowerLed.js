import * as THREE from "three";

/** Materials whose emissive maps include tower/speaker (pc_1) or monitor (pc_2) LEDs. */
export const POWER_LED_MATERIAL_NAMES = new Set(["pc_1", "pc_2"]);

/** Manic orange for the cylinder / HDD activity LED only. */
const ACTIVITY_ON = { color: new THREE.Color(0xff7a18), intensity: 3.4 };
const ACTIVITY_DIM = { color: new THREE.Color(0xff5a10), intensity: 0.45 };

/** Solid green for speaker (and any other non-activity) islands on pc_1. */
const SPEAKER_SOLID = { color: new THREE.Color(0x66ff55), intensity: 2.4 };

/** Monitor bezel power LED — solid green when CRT is on. */
const MONITOR_LED_ON = { color: 0x66ff55, intensity: 2.8 };

const LED_OFF = { color: 0x000000, intensity: 0 };

/** @param {THREE.Object3D} pcRoot @returns {THREE.MeshPhysicalMaterial[]} */
function collectPowerLedMaterials(pcRoot) {
  /** @type {THREE.MeshPhysicalMaterial[]} */
  const materials = [];
  pcRoot.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (!POWER_LED_MATERIAL_NAMES.has(mat.name)) return;
      if (!materials.includes(mat)) materials.push(mat);
    });
  });
  return materials;
}

/**
 * Split pc_1 emissive into:
 *  - manic orange HDD / activity blink (red island on pc_emission1)
 *  - solid green for speakers (green island on the same atlas)
 * pc_2 (monitor) stays a simple solid on/off — never blinks.
 */
export class PcPowerLed {
  /**
   * @param {THREE.MeshPhysicalMaterial[]} materials
   * @param {{ reducedMotion?: boolean }} [options]
   */
  constructor(materials, options = {}) {
    this.materials = materials;
    this.towerMaterials = materials.filter((mat) => mat.name === "pc_1");
    this.monitorMaterials = materials.filter((mat) => mat.name === "pc_2");
    this.reducedMotion = options.reducedMotion ?? false;
    /** @type {'off' | 'on'} */
    this.mode = "off";
    this._activityLit = false;
    this._nextActivityFlipAt = -1;
    this._burstFlipsLeft = 0;
    /** @type {{ uActivity: { value: number }, uSolid: { value: number }, uActivityColor: { value: THREE.Color }, uSolidColor: { value: THREE.Color } } | null} */
    this._towerUniforms = null;

    this._installTowerShader();
    this.setIdle();
  }

  /**
   * @param {THREE.Object3D | null} pcRoot
   * @param {{ reducedMotion?: boolean }} [options]
   * @returns {PcPowerLed | null}
   */
  static attach(pcRoot, options = {}) {
    if (!pcRoot) return null;

    const materials = collectPowerLedMaterials(pcRoot);
    if (!materials.length) return null;
    return new PcPowerLed(materials, options);
  }

  /** True when this instance still references the materials on the live PC meshes. */
  isLiveOnRoot(pcRoot) {
    if (!pcRoot || !this.materials.length) return false;
    const live = collectPowerLedMaterials(pcRoot);
    if (live.length !== this.materials.length) return false;
    return this.materials.every((mat) => live.includes(mat));
  }

  get isMonitorOn() {
    return this.mode === "on";
  }

  /** Powered down — all LEDs off, no activity blink. */
  setIdle() {
    this.mode = "off";
    this._nextActivityFlipAt = -1;
    this._burstFlipsLeft = 0;
    this._activityLit = false;
    this._setTowerGlow(0, 0, ACTIVITY_ON.color);
    this._applyMonitor(LED_OFF);
  }

  setOff() {
    this.setIdle();
  }

  setStandby() {
    this.setIdle();
  }

  setMonitorOff() {
    this.setIdle();
  }

  /** CRT on — solid monitor + speaker greens; HDD activity starts manic orange blink. */
  setMonitorOn() {
    const wasOff = this.mode === "off";
    this.mode = "on";
    this._setTowerGlow(0, SPEAKER_SOLID.intensity, SPEAKER_SOLID.color);
    this._applyMonitor(MONITOR_LED_ON);
    if (wasOff) {
      this._activityLit = true;
      this._applyActivityState(true);
      this._nextActivityFlipAt = -1;
    }
  }

  /** @param {number} time Scene elapsed seconds */
  update(time) {
    if (this.mode !== "on" || !this.towerMaterials.length) return;

    if (this._nextActivityFlipAt < 0) {
      this._scheduleActivityFlip(time, true);
      return;
    }

    if (time < this._nextActivityFlipAt) return;

    if (this._burstFlipsLeft > 0) {
      this._burstFlipsLeft -= 1;
      this._activityLit = !this._activityLit;
      this._applyActivityState(this._activityLit);
      this._nextActivityFlipAt = time + this._activityBurstDelay();
      return;
    }

    const roll = Math.random();
    if (roll < 0.24) {
      this._activityLit = true;
      this._applyActivityState(true);
      this._burstFlipsLeft = 3 + Math.floor(Math.random() * 6);
      this._nextActivityFlipAt = time + this._activityBurstDelay();
      return;
    }

    if (roll < 0.34) {
      this._activityLit = false;
      this._applyActivityState(false);
      this._nextActivityFlipAt = time + this._activityRestDelay();
      return;
    }

    this._activityLit = !this._activityLit;
    this._applyActivityState(this._activityLit);
    this._scheduleActivityFlip(time, false);
  }

  /**
   * pc_emission1 already encodes LED roles by color (red = HDD, green = speakers).
   * Mask on that so only the red island gets the manic orange blink.
   */
  _installTowerShader() {
    if (!this.towerMaterials.length) return;

    const uniforms = {
      uActivity: { value: 0 },
      uSolid: { value: 0 },
      uActivityColor: { value: ACTIVITY_ON.color.clone() },
      uSolidColor: { value: SPEAKER_SOLID.color.clone() }
    };
    this._towerUniforms = uniforms;

    for (const mat of this.towerMaterials) {
      mat.emissive.setHex(0xffffff);
      mat.emissiveIntensity = 1;
      mat.toneMapped = false;
      mat.userData.pcTowerLeds = true;

      const prev = mat.onBeforeCompile;
      mat.onBeforeCompile = (shader, renderer) => {
        prev?.(shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            /* glsl */ `
            #include <common>
            uniform float uActivity;
            uniform float uSolid;
            uniform vec3 uActivityColor;
            uniform vec3 uSolidColor;
            `
          )
          .replace(
            "#include <emissivemap_fragment>",
            /* glsl */ `
            #ifdef USE_EMISSIVEMAP
              vec4 pcLedTexel = texture2D( emissiveMap, vEmissiveMapUv );
              float pcLedLum = max( pcLedTexel.r, max( pcLedTexel.g, pcLedTexel.b ) );
              float pcActivityMask = smoothstep( 0.2, 0.45, pcLedTexel.r - max( pcLedTexel.g, pcLedTexel.b ) );
              float pcSolidMask = smoothstep( 0.2, 0.45, pcLedTexel.g - max( pcLedTexel.r, pcLedTexel.b ) );
              pcActivityMask *= step( 0.04, pcLedLum );
              pcSolidMask *= step( 0.04, pcLedLum );
              totalEmissiveRadiance =
                uActivityColor * uActivity * pcActivityMask
                + uSolidColor * uSolid * pcSolidMask;
            #endif
            `
          );
      };
      const priorKeyFn = mat.customProgramCacheKey?.bind(mat);
      mat.customProgramCacheKey = () =>
        `${priorKeyFn?.() ?? "pc_1"}|pc-tower-led-split-v2`;
      mat.needsUpdate = true;
    }
  }

  /**
   * @param {number} activityIntensity
   * @param {number} solidIntensity
   * @param {THREE.Color} [activityColor]
   */
  _setTowerGlow(activityIntensity, solidIntensity, activityColor) {
    if (!this._towerUniforms) return;
    this._towerUniforms.uActivity.value = activityIntensity;
    this._towerUniforms.uSolid.value = solidIntensity;
    if (activityColor) {
      this._towerUniforms.uActivityColor.value.copy(activityColor);
    }
  }

  /** @param {boolean} lit */
  _applyActivityState(lit) {
    const solid = this.mode === "on" ? SPEAKER_SOLID.intensity : 0;
    if (!lit && Math.random() < 0.2) {
      this._setTowerGlow(ACTIVITY_DIM.intensity, solid, ACTIVITY_DIM.color);
      return;
    }
    this._setTowerGlow(lit ? ACTIVITY_ON.intensity : 0, solid, ACTIVITY_ON.color);
  }

  /** @param {number} time @param {boolean} initial */
  _scheduleActivityFlip(time, initial) {
    this._nextActivityFlipAt = time + (initial ? Math.random() * 0.1 : this._activityFlipDelay());
  }

  _activityBurstDelay() {
    if (this.reducedMotion) return 0.1 + Math.random() * 0.16;
    return 0.018 + Math.random() * 0.048;
  }

  _activityFlipDelay() {
    if (this.reducedMotion) {
      return 0.2 + Math.random() * 0.55;
    }
    const roll = Math.random();
    if (roll < 0.5) return 0.028 + Math.random() * 0.07;
    if (roll < 0.82) return 0.07 + Math.random() * 0.14;
    return 0.12 + Math.random() * 0.26;
  }

  _activityRestDelay() {
    if (this.reducedMotion) return 0.4 + Math.random() * 0.85;
    return 0.06 + Math.random() * 0.28;
  }

  /** @param {{ color: number, intensity: number }} cfg */
  _applyMonitor(cfg) {
    for (const mat of this.monitorMaterials) {
      mat.emissive.setHex(cfg.color);
      mat.emissiveIntensity = cfg.intensity;
      mat.toneMapped = false;
      mat.needsUpdate = true;
    }
  }
}
