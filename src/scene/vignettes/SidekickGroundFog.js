import * as THREE from "three";

/**
 * Pass J item 7 — low ground fog around the Sidekick.
 *
 * Soft camera-facing sprites that hug the floor in a disc around the phone,
 * tinted by the stop's violet neon and kept under the bloom threshold. One
 * draw (all sprites in one BufferGeometry), procedural (no texture fetch).
 *
 * Soft "depth" fade without a depth texture: the stage has no scene-depth
 * texture available inside the beauty pass, so the two surfaces a sprite can
 * cut through are handled analytically — alpha goes to 0 approaching the
 * floor plane and approaching the phone's live world AABB (signed box
 * distance), so a quad crossing either never shows a hard intersection line.
 * A near-camera fade keeps a sprite from filling the lens on zoom.
 *
 * Lives inside the Sidekick vignette group, so the Pass J stop fade (via
 * `material.opacity`), the layer cull at fade 0, and the warm-time compile
 * of the stop all cover it with no extra wiring.
 */

export const GROUND_FOG_DEFAULTS = Object.freeze({
  /** Sprite count (rebuilds geometry). */
  count: 22,
  /** Disc radius around the phone, m. */
  radius: 2.1,
  /** Sprite size range, m. */
  sizeMin: 1.1,
  sizeMax: 2.3,
  /** Vertical squash of each sprite (flat bank, not balls). */
  squash: 0.5,
  /** Sprite center height range above the floor, m. */
  heightMin: 0.08,
  heightMax: 0.3,
  /** Top of the bank — alpha is 0 by here, m above floor. */
  top: 0.75,
  /** Alpha ramp from the floor plane, m (no hard line where quads cut it). */
  floorFeather: 0.16,
  /** Alpha ramp from the phone's AABB, m. */
  propSoft: 0.14,
  /** Peak per-sprite alpha. */
  density: 0.16,
  /** Linear brightness of the fog color (bloom threshold is 1.0). */
  brightness: 0.42,
  /** 0 = neutral grey-violet, 1 = pure neon hue. */
  tintMix: 0.62,
  /** Drift speed multiplier. */
  speed: 1
});

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uSquash;
  attribute vec3 aCenter;
  attribute vec2 aCorner;
  attribute float aSize;
  attribute float aSeed;
  varying vec2 vCorner;
  varying vec3 vWorld;
  varying float vSeed;

  void main() {
    float t = uTime * uSpeed;
    vec3 drift = vec3(
      sin(t * 0.07 + aSeed * 6.2831) * 0.28,
      sin(t * 0.11 + aSeed * 12.1) * 0.025,
      cos(t * 0.05 + aSeed * 3.917) * 0.28
    );
    vec3 center = (modelMatrix * vec4(aCenter + drift, 1.0)).xyz;
    // Camera right / up from the view matrix rows.
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = center
      + right * aCorner.x * aSize
      + up * aCorner.y * aSize * uSquash;
    vCorner = aCorner;
    vWorld = world;
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uFloorY;
  uniform float uTop;
  uniform float uFloorFeather;
  uniform float uPropSoft;
  uniform float uDensity;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform vec3 uBoxCenter;
  uniform vec3 uBoxHalf;
  uniform float uBoxOn;
  varying vec2 vCorner;
  varying vec3 vWorld;
  varying float vSeed;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  }

  void main() {
    // Soft gaussian footprint.
    // Gaussian that is exactly 0 by the inscribed circle — the quad edge
    // must never carry alpha (it read as hard rectangles at 0.11).
    float r = length(vCorner) * 2.0;
    float base = exp(-r * r * 2.6) * (1.0 - smoothstep(0.62, 1.0, r));
    if (base < 0.004) discard;
    // Low-frequency drifting noise in world XZ — breaks the sprite shapes.
    float t = uTime * uSpeed;
    vec2 q = vWorld.xz * 1.15 + vec2(t * 0.035, -t * 0.025) + vSeed * 7.0;
    float n = 0.55 + 0.45 * (0.6 * vnoise(q) + 0.4 * vnoise(q * 2.3 + 4.1));
    // Analytic soft-depth: floor plane and the phone's box.
    float h = vWorld.y - uFloorY;
    float floorFade = smoothstep(0.0, uFloorFeather, h) * (1.0 - smoothstep(uTop * 0.55, uTop, h));
    float propFade = 1.0;
    if (uBoxOn > 0.5) {
      propFade = smoothstep(0.0, uPropSoft, sdBox(vWorld - uBoxCenter, uBoxHalf));
    }
    float camDist = length(vWorld - cameraPosition);
    float nearFade = smoothstep(0.6, 2.2, camDist);
    float a = base * n * floorFade * propFade * nearFade * uDensity * uOpacity;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const _BOX = new THREE.Box3();
const _LOCAL = new THREE.Vector3();
const _MESH_BOX = new THREE.Box3();
const _SIZE = new THREE.Vector3();
const _NEUTRAL = new THREE.Color(0.55, 0.5, 0.66);
const _TINT = new THREE.Color();

/**
 * World AABB of the phone from its visible, phone-sized meshes only.
 * `Box3.setFromObject(sidekickRoot)` measured ~1.7 km across — the root also
 * holds hidden / far helper meshes — which made the prop fade and the bank
 * centre meaningless.
 * @param {THREE.Object3D} root
 * @param {THREE.Box3} out
 */
function phoneBounds(root, out) {
  out.makeEmpty();
  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    for (let p = obj; p; p = p.parent) if (p.visible === false) return;
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    _MESH_BOX.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
    if (_MESH_BOX.isEmpty() || _MESH_BOX.getSize(_SIZE).length() > 4) return;
    out.union(_MESH_BOX);
  });
  return out;
}

export class SidekickGroundFog {
  constructor() {
    this.params = { ...GROUND_FOG_DEFAULTS };
    this.material = new THREE.ShaderMaterial({
      name: "sidekick-ground-fog",
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: this.params.speed },
        uSquash: { value: this.params.squash },
        uFloorY: { value: 0 },
        uTop: { value: this.params.top },
        uFloorFeather: { value: this.params.floorFeather },
        uPropSoft: { value: this.params.propSoft },
        uDensity: { value: this.params.density },
        uOpacity: { value: 1 },
        uColor: { value: new THREE.Color() },
        uBoxCenter: { value: new THREE.Vector3() },
        uBoxHalf: { value: new THREE.Vector3(0.01, 0.01, 0.01) },
        uBoxOn: { value: 0 }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: true,
      fog: false
    });
    this.mesh = new THREE.Mesh(this._buildGeometry(), this.material);
    this.mesh.name = "sidekick-ground-fog";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // Never a pick / DOF / click target.
    this.mesh.raycast = () => {};
    this._boxFrame = 0;
  }

  _buildGeometry() {
    const p = this.params;
    const n = Math.max(1, Math.round(p.count));
    const centers = new Float32Array(n * 4 * 3);
    const corners = new Float32Array(n * 4 * 2);
    const sizes = new Float32Array(n * 4);
    const seeds = new Float32Array(n * 4);
    const index = [];
    // Deterministic scatter (golden-angle disc), so tuning is repeatable.
    for (let i = 0; i < n; i += 1) {
      const u = (i + 0.5) / n;
      const r = p.radius * Math.sqrt(u);
      const a = i * 2.39996323;
      const seed = (Math.sin(i * 91.7) * 43758.5453) % 1;
      const s = Math.abs(seed);
      const y = p.heightMin + (p.heightMax - p.heightMin) * ((i * 0.618) % 1);
      const size = p.sizeMin + (p.sizeMax - p.sizeMin) * s;
      const cs = [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5]
      ];
      for (let k = 0; k < 4; k += 1) {
        const v = i * 4 + k;
        centers.set([Math.cos(a) * r, y, Math.sin(a) * r], v * 3);
        corners.set(cs[k], v * 2);
        sizes[v] = size;
        seeds[v] = s;
      }
      const b = i * 4;
      index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    // `position` is required by three; the shader builds positions itself.
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
    g.setAttribute("aCenter", new THREE.BufferAttribute(centers, 3));
    g.setAttribute("aCorner", new THREE.BufferAttribute(corners, 2));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    g.setIndex(index);
    return g;
  }

  /**
   * @param {Partial<typeof GROUND_FOG_DEFAULTS>} partial
   */
  setParams(partial = {}) {
    const rebuild = ["count", "radius", "sizeMin", "sizeMax", "heightMin", "heightMax"].some(
      (k) => k in partial && partial[k] !== this.params[k]
    );
    for (const [k, v] of Object.entries(partial)) {
      if (k in GROUND_FOG_DEFAULTS && Number.isFinite(v)) this.params[k] = v;
    }
    if (rebuild) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = this._buildGeometry();
    }
    return this.getParams();
  }

  getParams() {
    return { ...this.params };
  }

  /**
   * @param {{
   *   time: number,
   *   floorY: number,
   *   neonColor: THREE.Color | null,
   *   neonLevel: number,
   *   phoneRoot: THREE.Object3D | null
   * }} s
   */
  update(s) {
    const u = this.material.uniforms;
    const p = this.params;
    u.uTime.value = s.time;
    u.uSpeed.value = p.speed;
    u.uSquash.value = p.squash;
    u.uFloorY.value = s.floorY;
    u.uTop.value = p.top;
    u.uFloorFeather.value = p.floorFeather;
    u.uPropSoft.value = p.propSoft;
    u.uDensity.value = p.density;
    // The stop fade writes material.opacity (setGroupRenderOpacity).
    u.uOpacity.value = this.material.opacity;
    _TINT.copy(_NEUTRAL);
    if (s.neonColor) _TINT.lerp(s.neonColor, p.tintMix);
    const lvl = 0.35 + 0.65 * THREE.MathUtils.clamp(s.neonLevel, 0, 1);
    u.uColor.value.copy(_TINT).multiplyScalar(p.brightness * lvl);
    // The phone's box moves when the lid swivels; refresh a few times a sec.
    if (s.phoneRoot && (this._boxFrame++ % 12 === 0 || u.uBoxOn.value < 0.5)) {
      phoneBounds(s.phoneRoot, _BOX);
      if (!_BOX.isEmpty()) {
        _BOX.getCenter(u.uBoxCenter.value);
        _BOX.getSize(u.uBoxHalf.value).multiplyScalar(0.5);
        u.uBoxOn.value = 1;
        // Centre the bank under the phone (group origin is not the phone).
        const parent = this.mesh.parent;
        if (parent) {
          _LOCAL.copy(u.uBoxCenter.value);
          parent.worldToLocal(_LOCAL);
          this.mesh.position.set(_LOCAL.x, 0, _LOCAL.z);
        }
      }
    }
  }
}
