import * as THREE from "three";

/** Materials whose emissive maps include the tower/monitor power LED. */
export const POWER_LED_MATERIAL_NAMES = new Set(["pc_1", "pc_2"]);

/** Monitor on — matches pc_1 emissive in pcProductionMaterials. */
const GREEN = 0x66ff55;
const BASE_INTENSITY = 2.4;

/**
 * Drives the CRT / tower power-button LED (pc_1 + pc_2 emissive maps).
 * Off while monitor is off; solid green after CRT power-on completes.
 */
export class PcPowerLed {
  /**
   * @param {THREE.MeshPhysicalMaterial[]} materials
   */
  constructor(materials) {
    this.materials = materials;
    /** @type {'off' | 'on'} */
    this.mode = "off";
    this.setOff();
  }

  /**
   * @param {THREE.Object3D | null} pcRoot
   * @returns {PcPowerLed | null}
   */
  static attach(pcRoot) {
    if (!pcRoot) return null;

    /** @type {THREE.MeshPhysicalMaterial[]} */
    const materials = [];
    pcRoot.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        if (!POWER_LED_MATERIAL_NAMES.has(mat.name)) return;
        if (!mat.emissiveMap) return;
        if (!materials.includes(mat)) materials.push(mat);
      });
    });

    if (!materials.length) return null;
    return new PcPowerLed(materials);
  }

  get isMonitorOn() {
    return this.mode === "on";
  }

  setOff() {
    this.mode = "off";
    this._apply(0x000000, 0);
  }

  /** Off state — no breathe/pulse. */
  setStandby() {
    this.setOff();
  }

  setMonitorOn() {
    this.mode = "on";
    this._apply(GREEN, BASE_INTENSITY);
  }

  /** @param {number} _time — scene elapsed seconds */
  update(_time) {}

  /**
   * @param {number} color
   * @param {number} intensity
   */
  _apply(color, intensity) {
    for (const mat of this.materials) {
      mat.emissive.setHex(color);
      mat.emissiveIntensity = intensity;
      mat.toneMapped = false;
      mat.needsUpdate = true;
    }
  }
}
