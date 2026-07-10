import * as THREE from "three";

/** Materials whose emissive maps include the tower/monitor power LED. */
export const POWER_LED_MATERIAL_NAMES = new Set(["pc_1", "pc_2"]);

/** Tower HDD LED — orange through pc_emission1. */
const TOWER_LED_ON = { color: 0xff7a18, intensity: 3.1 };

/** Speaker LEDs — green through pc_emission1 (shared atlas with tower). */
const SPEAKER_LED_ON = { color: 0x66ff55, intensity: 2.4 };

/** Monitor bezel power ring — solid green in zoom/boot. */
const MONITOR_LED_ON = { color: 0x66ff55, intensity: 2.8 };

const LED_OFF = { color: 0x000000, intensity: 0 };

/** Speakers follow tower + monitor power by this delay (seconds). */
const SPEAKER_LED_DELAY_S = 1;

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
 * Drives the CRT / tower / speaker emissive LEDs (pc_1 + pc_2).
 * Solid states only while zoomed/booted — idle when zoomed out.
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
    /** @type {'idle' | 'active'} */
    this._phase = "idle";
    this._speakersOn = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._speakerTimer = null;
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

  /** Zoom-out / standby — all emissive islands off, no animation. */
  setIdle() {
    this._clearSpeakerTimer();
    this._phase = "idle";
    this._speakersOn = false;
    this.mode = "off";
    this._applyMonitor(LED_OFF);
    this._applyTowerMaterials(LED_OFF);
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

  /** Zoom/boot — solid monitor green, solid tower orange, speakers after delay. */
  setMonitorOn() {
    const wasActive = this._phase === "active" && this.mode === "on";

    this._phase = "active";
    this.mode = "on";
    this._applyMonitor(MONITOR_LED_ON);

    if (!wasActive) {
      this._speakersOn = false;
      this._applyTowerMaterials(TOWER_LED_ON);
      this._scheduleSpeakers();
      return;
    }

    this._applyTowerMaterials(this._speakersOn ? SPEAKER_LED_ON : TOWER_LED_ON);
  }

  /** @param {number} _time Scene elapsed seconds — reserved; LEDs are state-driven. */
  update(_time) {}

  _clearSpeakerTimer() {
    if (this._speakerTimer != null) {
      clearTimeout(this._speakerTimer);
      this._speakerTimer = null;
    }
  }

  _scheduleSpeakers() {
    this._clearSpeakerTimer();
    const delayMs = (this.reducedMotion ? 0.35 : SPEAKER_LED_DELAY_S) * 1000;
    this._speakerTimer = setTimeout(() => {
      this._speakerTimer = null;
      if (this._phase !== "active" || this.mode !== "on") return;
      this._speakersOn = true;
      this._applyTowerMaterials(SPEAKER_LED_ON);
    }, delayMs);
  }

  /** @param {{ color: number, intensity: number }} cfg */
  _applyTowerMaterials(cfg) {
    for (const mat of this.towerMaterials) {
      this._applyMaterial(mat, cfg);
    }
  }

  /** @param {{ color: number, intensity: number }} cfg */
  _applyMonitor(cfg) {
    for (const mat of this.monitorMaterials) {
      this._applyMaterial(mat, cfg);
    }
  }

  /** @param {THREE.MeshPhysicalMaterial} mat @param {{ color: number, intensity: number }} cfg */
  _applyMaterial(mat, cfg) {
    mat.emissive.setHex(cfg.color);
    mat.emissiveIntensity = cfg.intensity;
    mat.toneMapped = false;
    mat.needsUpdate = true;
  }
}
