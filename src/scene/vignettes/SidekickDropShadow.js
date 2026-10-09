import * as THREE from "three";

/**
 * Pass O O1 — Sidekick drop shadow. The neon light sits below the floating
 * phone, so no light can cast its shadow on the floor (§20 11l); this drives
 * the Sidekick group's own `contact-shadow-neon` pad as a soft radial shadow
 * directly under the phone instead.
 *
 * Each frame (only while the stop is on camera) the phone's world bounds give
 * the pad's centre (XZ under the phone), its footprint (XZ extent, so the
 * lid-open swivel widens it) and the phone's bottom height. Height above the
 * phone's rest bottom drives the shadow: lower → smaller, darker, tighter;
 * higher → wider, fainter, softer (per-metre gains; the idle bob is ±2.8 cm).
 * Opacity also rides the stop fade; the pad lives in the Sidekick group, so
 * the stop cull hides it. Alpha-blended, colour near black (a dark neon
 * tint), so it only darkens — far under the bloom threshold.
 *
 * Drawn after the ground fog (the floor there is near black; the fog glow is
 * what reads). At the rest view the floor under the phone is at the bottom
 * edge of the frame (pad centre ≈ 94% down), so the upper half shows.
 *
 * Live tuning: Shift+K panel, "Drop shadow" group (`setSidekickDropShadow`).
 */
export const DROP_SHADOW_DEFAULTS = Object.freeze({
  /** Opacity at the phone's rest height. */
  peak: 0.6,
  /** Pad span ÷ phone XZ footprint at rest height. */
  size: 1.35,
  /** Radial falloff exponent at rest (higher = tighter core). */
  tight: 1.6,
  /** Span growth per metre above rest (fraction). */
  sizePerM: 3.5,
  /** Opacity falloff per metre above rest (exp rate). */
  fadePerM: 9,
  /** Falloff exponent change per metre above rest (negative = softer when higher). */
  tightPerM: -10,
  /** Neon colour mixed into the shadow (0 = pure black). */
  tint: 0.08
});

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTight;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float a = pow(clamp(1.0 - r, 0.0, 1.0), uTight) * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;

const _box = new THREE.Box3();
const _c = new THREE.Vector3();
const _s = new THREE.Vector3();
const _local = new THREE.Vector3();

export class SidekickDropShadow {
  /**
   * @param {THREE.Mesh} pad the Sidekick group's contact-shadow-neon pad
   */
  constructor(pad) {
    this.pad = pad;
    this.params = { ...DROP_SHADOW_DEFAULTS };
    this.material = new THREE.ShaderMaterial({
      name: "sidekick-drop-shadow",
      uniforms: {
        uColor: { value: new THREE.Color(0, 0, 0) },
        uOpacity: { value: 0 },
        uTight: { value: this.params.tight }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    pad.material?.dispose?.();
    pad.material = this.material;
    // After the ground fog (renderOrder 2): the floor there is near black and
    // the fog glow is what reads — a shadow under the fog was invisible even
    // at opacity 1.
    pad.renderOrder = 3;
    this._restBottom = null;
    this.last = null;
  }

  /** @param {Partial<typeof DROP_SHADOW_DEFAULTS>} patch */
  setParams(patch = {}) {
    for (const [k, v] of Object.entries(patch)) if (k in this.params && Number.isFinite(Number(v))) this.params[k] = Number(v);
    return { ...this.params };
  }

  /**
   * @param {{ phone: THREE.Object3D | null, group: THREE.Object3D, floorY: number, fade: number, neonColor?: THREE.Color | null, resting?: boolean }} o
   */
  update({ phone, group, floorY, fade, neonColor = null, resting = false }) {
    const pad = this.pad;
    if (!phone || !(fade > 1e-3)) {
      pad.visible = false;
      this.material.uniforms.uOpacity.value = 0;
      return;
    }
    _box.makeEmpty();
    phone.updateMatrixWorld(true);
    phone.traverseVisible((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      _box.union(_boxOf(o));
    });
    if (_box.isEmpty()) {
      pad.visible = false;
      return;
    }
    _box.getCenter(_c);
    _box.getSize(_s);
    const bottom = _box.min.y;
    // Rest bottom: the closed phone's centre of bob, tracked slowly while
    // resting so the bob reads as ± around it (and a re-seat re-centres it).
    if (this._restBottom == null) this._restBottom = bottom;
    else if (resting) this._restBottom += (bottom - this._restBottom) * 0.02;
    const h = bottom - this._restBottom;
    const p = this.params;
    const footprint = Math.max(_s.x, _s.z, 0.05);
    const span = footprint * p.size * Math.max(0.2, 1 + p.sizePerM * h);
    const opacity = Math.min(1, p.peak * Math.exp(-p.fadePerM * h)) * fade;
    const tight = Math.max(0.6, p.tight + p.tightPerM * h);

    _local.set(_c.x, 0, _c.z);
    group.worldToLocal(_local);
    pad.position.set(_local.x, floorY, _local.z);
    pad.scale.set(span, span, 1);
    const u = this.material.uniforms;
    u.uOpacity.value = opacity;
    u.uTight.value = tight;
    if (neonColor) u.uColor.value.setRGB(neonColor.r * p.tint, neonColor.g * p.tint, neonColor.b * p.tint);
    else u.uColor.value.setRGB(0, 0, 0);
    pad.visible = opacity > 1e-4;
    this.last = { h: +h.toFixed(4), span: +span.toFixed(3), opacity: +opacity.toFixed(3), tight: +tight.toFixed(2), footprint: +footprint.toFixed(3), bottom: +bottom.toFixed(3) };
  }

  dispose() {
    this.material.dispose();
  }
}

const _tmpBox = new THREE.Box3();
function _boxOf(mesh) {
  return _tmpBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
}
