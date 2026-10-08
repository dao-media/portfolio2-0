import * as THREE from "three";

/**
 * Pass K K3 — ground fog around the Sidekick, rewritten.
 *
 * Pass J's version was ~22 additive, same-tint gaussian sprites over a
 * phone-sized disc: no breakup, so it read as one blurry blob (and softer
 * still once the governor lowered the resolution). This one is a bounded,
 * low-step raymarch through a ground box — chosen over 3–4 stacked slabs
 * because slabs read as stacked planes at the Sidekick's viewing angle and
 * cost about the same:
 *
 *  - Shape: density = exp(-h / H) over the floor, H a fraction of the
 *    phone's size, spread over EXTENT× the phone's footprint radius, going
 *    to exactly 0 before the box walls and top (no visible border).
 *  - Breakup: 3 octaves of tileable value noise from one baked 32³ texture
 *    (3 fetches per step, not ~80 hashes), each octave at its own scale and
 *    drift, shaped into wisps; the edge radius itself is noise-modulated.
 *  - March: STEPS (10) samples from the box entry to the box exit or the
 *    floor plane, whichever is first, stopping inside the phone's AABB;
 *    start offset by a static interleaved-gradient-noise jitter (spatial
 *    only — a time-varying dither crawls; README landmine 9e3).
 *  - Light: near-black base, lit by the stop's neon point lights (position,
 *    colour, level as uniforms) with distance falloff — brighter and tinted
 *    near the tube, dark away from it; kept under the bloom threshold.
 *  - Blend: premultiplied normal alpha (fog occludes slightly), not additive.
 *  - Kept: analytic soft fade at the floor and the phone, near-camera fade,
 *    the stop fade via material.opacity, layer cull at fade 0 (it lives in
 *    the Sidekick group), Shift+K tuner.
 */

export const GROUND_FOG_DEFAULTS = Object.freeze({
  /** Extinction per metre at the floor. */
  density: 2.4,
  /** H as a fraction of the phone's largest bbox extent (density exp(-h/H)). */
  height: 0.22,
  /** Footprint radius as a multiple of the phone's own footprint radius. */
  extent: 3.6,
  /** Noise cycles per metre (base octave). */
  noiseScale: 1.7,
  /** Drift speed multiplier. */
  speed: 1,
  /** Fraction of the radius over which the edge fades (noise-wobbled). */
  edgeSoft: 0.5,
  /** Neon light contribution gain. */
  lightGain: 1,
  /** Alpha ramp from the phone's AABB, m. */
  propSoft: 0.12,
  /** Ray-march steps (8–12). */
  steps: 10
});

const MAX_LIGHTS = 2;
const NOISE_SIZE = 32;

const VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  precision highp sampler3D;
  #define MAX_STEPS 12
  #define MAX_LIGHTS ${MAX_LIGHTS}
  uniform sampler3D uNoise;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uFloorY;
  uniform float uH;
  uniform float uTop;
  uniform float uDensity;
  uniform float uNoiseScale;
  uniform float uRadius;
  uniform float uEdgeSoft;
  uniform float uPropSoft;
  uniform float uOpacity;
  uniform float uLightGain;
  uniform int uSteps;
  uniform vec3 uCenter;
  uniform vec3 uBoxMin;
  uniform vec3 uBoxMax;
  uniform vec3 uPhoneCenter;
  uniform vec3 uPhoneHalf;
  uniform float uPhoneOn;
  uniform vec3 uBase;
  uniform vec3 uLightPos[MAX_LIGHTS];
  uniform vec3 uLightColor[MAX_LIGHTS];
  varying vec3 vWorld;

  float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  }

  vec2 hitBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
    vec3 inv = 1.0 / rd;
    vec3 t0 = (bmin - ro) * inv;
    vec3 t1 = (bmax - ro) * inv;
    vec3 tn = min(t0, t1);
    vec3 tf = max(t0, t1);
    return vec2(max(max(tn.x, tn.y), tn.z), min(min(tf.x, tf.y), tf.z));
  }

  // Interleaved gradient noise — static per pixel (no time term).
  float ign(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }

  float noise3(vec3 p) {
    return texture(uNoise, p).r;
  }

  float density(vec3 p, float t) {
    float h = p.y - uFloorY;
    if (h < 0.0) return 0.0;
    // Soft floor contact (no hard line where the bank meets the floor) and
    // exactly 0 before the box top.
    float hf = exp(-h / uH) * smoothstep(0.0, 0.025, h) * (1.0 - smoothstep(0.65 * uTop, uTop, h));
    vec2 d2 = p.xz - uCenter.xz;
    float r = length(d2) / uRadius;
    if (r >= 1.0) return 0.0;
    vec3 q = p * uNoiseScale;
    float n1 = noise3(q * 0.23 + vec3(t * 0.021, t * 0.004, t * 0.015));
    float n2 = noise3(q * 0.51 + vec3(-t * 0.034, t * 0.009, t * 0.027) + 0.37);
    float n3 = noise3(q * 1.13 + vec3(t * 0.052, -t * 0.013, -t * 0.041) + 0.71);
    float fbm = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
    float wisps = smoothstep(0.32, 0.78, fbm);
    // Edge: noise-wobbled radius, reaching exactly 0 by r = 0.97.
    float er = r + (n2 - 0.5) * 0.35 * uEdgeSoft;
    float edge = 1.0 - smoothstep(1.0 - uEdgeSoft, 0.97, er);
    edge *= 1.0 - smoothstep(0.9, 0.97, r);
    float prop = 1.0;
    if (uPhoneOn > 0.5) prop = smoothstep(0.0, uPropSoft, sdBox(p - uPhoneCenter, uPhoneHalf));
    return uDensity * hf * wisps * edge * prop;
  }

  vec3 lightAt(vec3 p) {
    vec3 c = uBase;
    for (int i = 0; i < MAX_LIGHTS; i++) {
      vec3 d = uLightPos[i] - p;
      float dist2 = dot(d, d);
      c += uLightColor[i] * (uLightGain / (1.0 + 1.6 * dist2));
    }
    return min(c, vec3(0.85));
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - cameraPosition);
    vec2 tb = hitBox(ro, rd, uBoxMin, uBoxMax);
    float t0 = max(tb.x, 0.0);
    float t1 = tb.y;
    if (rd.y < -1e-4) t1 = min(t1, (uFloorY - ro.y) / rd.y);
    if (t1 <= t0) discard;
    float steps = float(uSteps);
    float dt = (t1 - t0) / steps;
    float jitter = ign(gl_FragCoord.xy);
    float t = uTime * uSpeed;
    vec3 col = vec3(0.0);
    float T = 1.0;
    for (int i = 0; i < MAX_STEPS; i++) {
      if (i >= uSteps) break;
      float s = t0 + (float(i) + jitter) * dt;
      vec3 p = ro + rd * s;
      if (uPhoneOn > 0.5 && sdBox(p - uPhoneCenter, uPhoneHalf) < 0.0) break;
      float d = density(p, t) * smoothstep(0.4, 1.6, s);
      if (d > 1e-4) {
        float a = 1.0 - exp(-d * dt);
        col += T * a * lightAt(p);
        T *= 1.0 - a;
      }
    }
    float alpha = (1.0 - T) * uOpacity;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col * uOpacity, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Tileable value noise, smooth-interpolated from an 8³ lattice into 32³. */
function buildNoiseTexture() {
  const N = NOISE_SIZE;
  const L = 8;
  const lattice = new Float32Array(L * L * L);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < lattice.length; i += 1) lattice[i] = rand();
  const at = (x, y, z) => lattice[((z % L) * L + (y % L)) * L + (x % L)];
  const fade = (f) => f * f * (3 - 2 * f);
  const data = new Uint8Array(N * N * N);
  for (let z = 0; z < N; z += 1) {
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        const fx = (x / N) * L;
        const fy = (y / N) * L;
        const fz = (z / N) * L;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const iz = Math.floor(fz);
        const ux = fade(fx - ix);
        const uy = fade(fy - iy);
        const uz = fade(fz - iz);
        const lerp = (a, b, k) => a + (b - a) * k;
        const v = lerp(
          lerp(lerp(at(ix, iy, iz), at(ix + 1, iy, iz), ux), lerp(at(ix, iy + 1, iz), at(ix + 1, iy + 1, iz), ux), uy),
          lerp(lerp(at(ix, iy, iz + 1), at(ix + 1, iy, iz + 1), ux), lerp(at(ix, iy + 1, iz + 1), at(ix + 1, iy + 1, iz + 1), ux), uy),
          uz
        );
        data[(z * N + y) * N + x] = Math.round(v * 255);
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

const _BOX = new THREE.Box3();
const _MESH_BOX = new THREE.Box3();
const _SIZE = new THREE.Vector3();
const _LOCAL = new THREE.Vector3();
const _BASE = new THREE.Color(0.006, 0.005, 0.009);

/**
 * World AABB of the phone from its visible, phone-sized meshes only (the
 * root also holds hidden / far helper meshes — setFromObject measured ~1.7 km).
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
    this._noise = buildNoiseTexture();
    this.material = new THREE.ShaderMaterial({
      name: "sidekick-ground-fog",
      uniforms: {
        uNoise: { value: this._noise },
        uTime: { value: 0 },
        uSpeed: { value: this.params.speed },
        uFloorY: { value: 0 },
        uH: { value: 0.1 },
        uTop: { value: 0.6 },
        uDensity: { value: this.params.density },
        uNoiseScale: { value: this.params.noiseScale },
        uRadius: { value: 2 },
        uEdgeSoft: { value: this.params.edgeSoft },
        uPropSoft: { value: this.params.propSoft },
        uOpacity: { value: 1 },
        uLightGain: { value: this.params.lightGain },
        uSteps: { value: this.params.steps },
        uCenter: { value: new THREE.Vector3() },
        uBoxMin: { value: new THREE.Vector3(-1, 0, -1) },
        uBoxMax: { value: new THREE.Vector3(1, 1, 1) },
        uPhoneCenter: { value: new THREE.Vector3() },
        uPhoneHalf: { value: new THREE.Vector3(0.01, 0.01, 0.01) },
        uPhoneOn: { value: 0 },
        uBase: { value: new THREE.Color().copy(_BASE) },
        uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(0, -1000, 0)) },
        uLightColor: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color(0, 0, 0)) }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      toneMapped: true,
      fog: false
    });
    // Unit box, y from 0 to 1; scaled to the fog volume in update().
    const geo = new THREE.BoxGeometry(2, 1, 2);
    geo.translate(0, 0.5, 0);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = "sidekick-ground-fog";
    this.mesh.renderOrder = 2;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    // Never a pick / DOF / click target.
    this.mesh.raycast = () => {};
    this._boxFrame = 0;
    this._footprint = 0.5;
    this._phoneSize = 0.5;
  }

  /** Footprint radius of the bank, m (world). */
  footprintRadius() {
    return this._footprint * this.params.extent;
  }

  /** @param {Partial<typeof GROUND_FOG_DEFAULTS>} partial */
  setParams(partial = {}) {
    for (const [k, v] of Object.entries(partial)) {
      if (k in GROUND_FOG_DEFAULTS && Number.isFinite(v)) this.params[k] = v;
    }
    this.params.steps = Math.max(4, Math.min(12, Math.round(this.params.steps)));
    return this.getParams();
  }

  getParams() {
    return { ...this.params };
  }

  /**
   * @param {{
   *   time: number,
   *   floorY: number,
   *   lights: Array<{ position: THREE.Vector3, color: THREE.Color, level: number }>,
   *   phoneRoot: THREE.Object3D | null
   * }} s
   */
  update(s) {
    const u = this.material.uniforms;
    const p = this.params;
    u.uTime.value = s.time;
    u.uSpeed.value = p.speed;
    u.uFloorY.value = s.floorY;
    u.uDensity.value = p.density;
    u.uNoiseScale.value = p.noiseScale;
    u.uEdgeSoft.value = p.edgeSoft;
    u.uPropSoft.value = p.propSoft;
    u.uLightGain.value = p.lightGain;
    u.uSteps.value = p.steps;
    // The stop fade writes material.opacity (setGroupRenderOpacity).
    u.uOpacity.value = this.material.opacity;
    for (let i = 0; i < MAX_LIGHTS; i += 1) {
      const L = s.lights?.[i];
      if (L) {
        u.uLightPos.value[i].copy(L.position);
        u.uLightColor.value[i].copy(L.color).multiplyScalar(Math.max(0, L.level));
      } else {
        u.uLightPos.value[i].set(0, -1000, 0);
        u.uLightColor.value[i].setRGB(0, 0, 0);
      }
    }
    // The phone's box moves when the lid swivels; refresh a few times a sec.
    if (s.phoneRoot && (this._boxFrame++ % 12 === 0 || u.uPhoneOn.value < 0.5)) {
      phoneBounds(s.phoneRoot, _BOX);
      if (!_BOX.isEmpty()) {
        _BOX.getCenter(u.uPhoneCenter.value);
        _BOX.getSize(_SIZE);
        u.uPhoneHalf.value.copy(_SIZE).multiplyScalar(0.5);
        u.uPhoneOn.value = 1;
        this._footprint = Math.max(_SIZE.x, _SIZE.z) * 0.5;
        this._phoneSize = Math.max(_SIZE.x, _SIZE.y, _SIZE.z);
      }
    }
    const R = this.footprintRadius();
    const H = Math.max(0.01, p.height * this._phoneSize);
    const top = H * 5;
    u.uRadius.value = R;
    u.uH.value = H;
    u.uTop.value = top;
    u.uCenter.value.set(u.uPhoneCenter.value.x, s.floorY, u.uPhoneCenter.value.z);
    u.uBoxMin.value.set(u.uCenter.value.x - R, s.floorY, u.uCenter.value.z - R);
    u.uBoxMax.value.set(u.uCenter.value.x + R, s.floorY + top, u.uCenter.value.z + R);
    // Place the proxy box (group-local) over the same volume.
    const parent = this.mesh.parent;
    if (parent) {
      _LOCAL.copy(u.uCenter.value);
      parent.worldToLocal(_LOCAL);
      this.mesh.position.copy(_LOCAL);
      parent.getWorldScale(_SIZE);
      // The group is rotated on the ring, so a group-local square of half R
      // does not cover the world-aligned volume the shader marches (a hard
      // straight edge showed where it clipped). √2 covers any yaw; density
      // itself still reaches 0 inside the circle.
      const cover = R * Math.SQRT2 * 1.02;
      this.mesh.scale.set(cover / Math.max(1e-6, _SIZE.x), top / Math.max(1e-6, _SIZE.y), cover / Math.max(1e-6, _SIZE.z));
    }
  }
}
