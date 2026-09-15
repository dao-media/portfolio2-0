import * as THREE from "three";
import {
  CONTACT_SHADOW_NEON_OFFSET,
  CONTACT_SHADOW_NEON_OPACITY,
  CONTACT_SHADOW_NEON_SCALE,
  CONTACT_SHADOW_SPOT_OFFSET,
  CONTACT_SHADOW_SPOT_OPACITY,
  CONTACT_SHADOW_SPOT_SCALE,
  CONTACT_SHADOW_Y
} from "./constants.js";
import { STAGE_FLOOR_Y } from "../vignettes/pcSceneBlockout.js";

const _BOX = new THREE.Box3();
const _SIZE = new THREE.Vector3();
const _CENTER = new THREE.Vector3();
const _CAM = new THREE.Vector3();
const _NEON = new THREE.Vector3();
const _DIR = new THREE.Vector3();
const _CONTENT_WORLD = new THREE.Vector3();
const _HIT_WORLD = new THREE.Vector3();
const _HIT_LOCAL = new THREE.Vector3();

let _map = null;

/** Soft radial — black core, long feather. */
function getContactShadowMap() {
  if (_map) return _map;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const cx = size * 0.5;
  const cy = size * 0.5;
  const maxR = size * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5 - cx) / maxR;
      const dy = (y + 0.5 - cy) / maxR;
      const r = Math.sqrt(dx * dx + dy * dy);
      const t = Math.min(1, Math.max(0, r));
      const a = Math.pow(1 - t, 2.15);
      const i = (y * size + x) * 4;
      const v = Math.round(a * 255);
      img.data[i] = 0;
      img.data[i + 1] = 0;
      img.data[i + 2] = 0;
      img.data[i + 3] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
  _map = new THREE.CanvasTexture(canvas);
  _map.needsUpdate = true;
  return _map;
}

function makePad(name, maxOpacity) {
  const mat = new THREE.MeshBasicMaterial({
    map: getContactShadowMap(),
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.name = name;
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.userData.maxOpacity = maxOpacity;
  return mesh;
}

function isContactExcluded(obj) {
  if (!obj.isMesh || !obj.visible) return true;
  if (!obj.geometry?.attributes?.position) return true;
  const n = obj.name || "";
  if (n.includes("neon") || n.includes("glow") || n.includes("contact-shadow")) return true;
  if (n.startsWith("blockout-ref")) return true;
  return false;
}

/**
 * Soft dual contact shadows under a vignette (POV spot + neon PointLight).
 * Floor stays MeshBasic — these pads fake contact without a lit apron pool.
 */
export class VignetteContactShadows {
  /**
   * @param {THREE.Group} group Vignette root
   */
  constructor(group) {
    this.group = group;
    this.root = new THREE.Group();
    this.root.name = "contact-shadows";
    this.spotPad = makePad("contact-shadow-spot", CONTACT_SHADOW_SPOT_OPACITY);
    this.neonPad = makePad("contact-shadow-neon", CONTACT_SHADOW_NEON_OPACITY);
    this.root.add(this.spotPad);
    this.root.add(this.neonPad);
    group.add(this.root);

    this._footprint = 2.4;
    this._cx = 0;
    this._cz = 0;
    this.refreshBounds();
  }

  /** Re-measure prop footprint (call after GLB mount / floor snap). */
  refreshBounds() {
    const group = this.group;
    group.updateMatrixWorld(true);
    _BOX.makeEmpty();
    let found = false;
    group.traverse((obj) => {
      if (isContactExcluded(obj)) return;
      const meshBox = new THREE.Box3().setFromObject(obj);
      if (meshBox.isEmpty()) return;
      if (!found) {
        _BOX.copy(meshBox);
        found = true;
      } else {
        _BOX.union(meshBox);
      }
    });
    if (!found || _BOX.isEmpty()) {
      this._footprint = 2.4;
      this._cx = 0;
      this._cz = 0;
      return;
    }
    _BOX.getCenter(_CENTER);
    _BOX.getSize(_SIZE);
    _HIT_LOCAL.copy(_CENTER);
    group.worldToLocal(_HIT_LOCAL);
    this._cx = _HIT_LOCAL.x;
    this._cz = _HIT_LOCAL.z;
    this._footprint = Math.max(_SIZE.x, _SIZE.z, 0.6);
  }

  /**
   * @param {{
   *   camera: THREE.Camera,
   *   neonWorld?: THREE.Vector3 | null,
   *   neonColor?: THREE.Color | null,
   *   neonLevel?: number,
   *   visible?: boolean
   * }} opts
   */
  update(opts) {
    const { camera, neonWorld = null, neonColor = null, neonLevel = 0, visible = true } = opts;
    this.root.visible = visible;
    if (!visible) return;

    const group = this.group;
    group.updateMatrixWorld(true);
    const floorY = STAGE_FLOOR_Y + CONTACT_SHADOW_Y - group.position.y;

    _CONTENT_WORLD.set(this._cx, 0, this._cz);
    group.localToWorld(_CONTENT_WORLD);
    _CONTENT_WORLD.y = 0;

    // POV spot ≈ camera — contact falls away from the viewer.
    camera.getWorldPosition(_CAM);
    _CAM.y = 0;
    _DIR.copy(_CONTENT_WORLD).sub(_CAM);
    _DIR.y = 0;
    if (_DIR.lengthSq() > 1e-8) _DIR.normalize().multiplyScalar(CONTACT_SHADOW_SPOT_OFFSET);
    else _DIR.set(0, 0, 0);
    _HIT_WORLD.copy(_CONTENT_WORLD).add(_DIR);
    group.worldToLocal(_HIT_LOCAL.copy(_HIT_WORLD));
    this.spotPad.position.set(_HIT_LOCAL.x, floorY, _HIT_LOCAL.z);
    const spotSpan = this._footprint * CONTACT_SHADOW_SPOT_SCALE;
    this.spotPad.scale.set(spotSpan, spotSpan, 1);
    this.spotPad.material.opacity = this.spotPad.userData.maxOpacity;
    this.spotPad.material.color.setHex(0x000000);
    this.spotPad.visible = this.spotPad.material.opacity > 1e-4;

    const neonU = Math.max(0, Math.min(1, neonLevel));
    if (!neonWorld || neonU < 1e-3) {
      this.neonPad.visible = false;
      this.neonPad.material.opacity = 0;
      return;
    }

    _NEON.copy(neonWorld);
    _NEON.y = 0;
    _DIR.copy(_CONTENT_WORLD).sub(_NEON);
    _DIR.y = 0;
    if (_DIR.lengthSq() > 1e-8) _DIR.normalize().multiplyScalar(CONTACT_SHADOW_NEON_OFFSET);
    else _DIR.set(0, 0, 0);
    _HIT_WORLD.copy(_CONTENT_WORLD).add(_DIR);
    group.worldToLocal(_HIT_LOCAL.copy(_HIT_WORLD));
    this.neonPad.position.set(_HIT_LOCAL.x, floorY, _HIT_LOCAL.z);
    const neonSpan = this._footprint * CONTACT_SHADOW_NEON_SCALE;
    this.neonPad.scale.set(neonSpan, neonSpan, 1);
    this.neonPad.material.opacity = this.neonPad.userData.maxOpacity * neonU;
    if (neonColor) {
      this.neonPad.material.color.setRGB(
        neonColor.r * 0.12,
        neonColor.g * 0.12,
        neonColor.b * 0.12
      );
    } else {
      this.neonPad.material.color.setHex(0x000000);
    }
    this.neonPad.visible = this.neonPad.material.opacity > 1e-4;
  }

  dispose() {
    for (const pad of [this.spotPad, this.neonPad]) {
      pad.geometry?.dispose?.();
      pad.material?.dispose?.();
    }
  }
}
