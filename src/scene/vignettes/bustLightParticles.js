/**
 * Sidelined — not wired to BustVignette.
 * Codrops-style GPGPU surface particles (MeshSurfaceSampler + GPUComputationRenderer).
 * Reuse for another stop/experiment when needed; do not re-enable on Bust without a look pass.
 */
import * as THREE from "three";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Square GPGPU grid — kept for future reuse. */
export const BUST_PARTICLE_GRID = 80;
/** Screen-space point size at 1× DPR / 1080p reference (scaled in setSize). */
export const BUST_PARTICLE_SIZE = 0.95;

const SIM_POSITION = /* glsl */ `
uniform float uTime;
uniform float uDelta;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 position = texture2D(uCurrentPosition, uv).xyz;
  vec3 velocity = texture2D(uCurrentVelocity, uv).xyz;
  position += velocity * clamp(uDelta * 60.0, 0.0, 2.0);
  gl_FragColor = vec4(position, 1.0);
}
`;

const SIM_VELOCITY = /* glsl */ `
uniform sampler2D uOriginalPosition;
uniform float uTime;
uniform float uDelta;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 position = texture2D(uCurrentPosition, uv).xyz;
  vec3 original = texture2D(uOriginalPosition, uv).xyz;
  vec3 velocity = texture2D(uCurrentVelocity, uv).xyz;

  // Strong spring — particles stay on the sculpted surface (readable features).
  vec3 toRest = (original - position) * 0.14;
  float t = uTime * 0.22;
  vec3 turb = vec3(
    hash(uv + t) - 0.5,
    hash(uv * 1.7 - t) - 0.5,
    hash(uv.yx + t * 0.6) - 0.5
  ) * 0.00115;

  velocity = velocity * 0.88 + toRest + turb;
  float speed = length(velocity);
  if (speed > 0.035) velocity *= 0.035 / speed;

  gl_FragColor = vec4(velocity, 1.0);
}
`;

const POINT_VERT = /* glsl */ `
uniform sampler2D uPositionTexture;
uniform float uParticleSize;
uniform vec2 uResolution;

attribute vec3 aNormal;

varying vec2 vUv;
varying float vShade;
varying float vLit;

void main() {
  vUv = uv;
  vec3 pos = texture2D(uPositionTexture, uv).xyz;
  vShade = uv.x * 0.4 + uv.y * 0.6;

  vec3 nWorld = normalize(mat3(modelMatrix) * aNormal);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vec3 viewDir = normalize(-mv.xyz);
  // Contour: facing planes brighter, grazing edges softer — reads nose / hand / folds.
  float ndv = abs(dot(normalize(mat3(modelViewMatrix) * aNormal), viewDir));
  vLit = mix(0.35, 1.0, pow(ndv, 0.85));

  gl_Position = projectionMatrix * mv;

  float dist = max(0.001, -mv.z);
  float px = uParticleSize * (uResolution.y / 1080.0);
  // Slightly larger on lit faces so features densify, not edges.
  gl_PointSize = clamp(px * (100.0 / dist) * mix(0.9, 1.08, vLit), 0.9, 5.5);
}
`;

const POINT_FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uBrightness;
uniform sampler2D uVelocityTexture;

varying vec2 vUv;
varying float vShade;
varying float vLit;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;

  float soft = pow(smoothstep(0.5, 0.08, d), 1.45);
  vec3 velocity = texture2D(uVelocityTexture, vUv).xyz;
  float motion = clamp(length(velocity) * 18.0, 0.78, 1.0);
  vec3 col = mix(uColorA, uColorB, vShade) * uBrightness * vLit * motion;
  // Additive sparkles over the emissive shell (shell carries the sculpture).
  gl_FragColor = vec4(col * soft, soft * 0.85);
}
`;

/**
 * Merge bust meshes into bustRoot-local space for surface sampling.
 * @param {THREE.Object3D} bustRoot
 * @returns {THREE.BufferGeometry | null}
 */
function mergeBustGeometryLocal(bustRoot) {
  bustRoot.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(bustRoot.matrixWorld).invert();
  /** @type {THREE.BufferGeometry[]} */
  const parts = [];
  bustRoot.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const geo = obj.geometry.index
      ? obj.geometry.clone()
      : obj.geometry.clone().toNonIndexed();
    if (!geo.getAttribute("position")) return;
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, obj.matrixWorld));
    parts.push(geo);
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (merged && !merged.getAttribute("normal")) merged.computeVertexNormals();
  return merged;
}

/**
 * Codrops-style GPGPU light particles sampled from the bust surface.
 * Additive points + tight return-to-rest so facial detail holds (stage owns parallax).
 *
 * @param {{
 *   bustRoot: THREE.Object3D,
 *   renderer: THREE.WebGLRenderer,
 *   reducedMotion?: boolean,
 *   colorA?: string,
 *   colorB?: string,
 *   grid?: number,
 *   particleSize?: number
 * }} opts
 */
export function createBustLightParticles({
  bustRoot,
  renderer,
  reducedMotion = false,
  colorA = "#9dff1a",
  colorB = "#00e5ff",
  grid = BUST_PARTICLE_GRID,
  particleSize = BUST_PARTICLE_SIZE
}) {
  const size = Math.max(8, Math.floor(grid));
  const count = size * size;

  const merged = mergeBustGeometryLocal(bustRoot);
  if (!merged) {
    console.warn("[bustLightParticles] No bust geometry to sample.");
    return null;
  }

  const sampleMesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial());
  const sampler = new MeshSurfaceSampler(sampleMesh).build();

  const posData = new Float32Array(count * 4);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const _p = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _c = new THREE.Color();

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const index = i * size + j;
      sampler.sample(_p, _n, _c);
      posData[index * 4] = _p.x;
      posData[index * 4 + 1] = _p.y;
      posData[index * 4 + 2] = _p.z;
      posData[index * 4 + 3] = 1;
      positions[index * 3] = _p.x;
      positions[index * 3 + 1] = _p.y;
      positions[index * 3 + 2] = _p.z;
      normals[index * 3] = _n.x;
      normals[index * 3 + 1] = _n.y;
      normals[index * 3 + 2] = _n.z;
      uvs[index * 2] = j / (size - 1);
      uvs[index * 2 + 1] = i / (size - 1);
    }
  }

  sampleMesh.geometry.dispose();
  sampleMesh.material.dispose();

  const positionTexture = new THREE.DataTexture(
    posData,
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  positionTexture.needsUpdate = true;

  const velocityData = new Float32Array(count * 4);
  const velocityTexture = new THREE.DataTexture(
    velocityData,
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  velocityTexture.needsUpdate = true;

  const gpgpu = new GPUComputationRenderer(size, size, renderer);
  const positionVariable = gpgpu.addVariable(
    "uCurrentPosition",
    SIM_POSITION,
    positionTexture
  );
  const velocityVariable = gpgpu.addVariable(
    "uCurrentVelocity",
    SIM_VELOCITY,
    velocityTexture
  );
  gpgpu.setVariableDependencies(positionVariable, [
    positionVariable,
    velocityVariable
  ]);
  gpgpu.setVariableDependencies(velocityVariable, [
    positionVariable,
    velocityVariable
  ]);

  positionVariable.material.uniforms.uTime = { value: 0 };
  positionVariable.material.uniforms.uDelta = { value: 1 / 60 };
  velocityVariable.material.uniforms.uTime = { value: 0 };
  velocityVariable.material.uniforms.uDelta = { value: 1 / 60 };
  velocityVariable.material.uniforms.uOriginalPosition = {
    value: positionTexture
  };

  const err = gpgpu.init();
  if (err) {
    console.warn("[bustLightParticles] GPUComputationRenderer init failed:", err);
    positionTexture.dispose();
    velocityTexture.dispose();
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aNormal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPositionTexture: {
        value: gpgpu.getCurrentRenderTarget(positionVariable).texture
      },
      uVelocityTexture: {
        value: gpgpu.getCurrentRenderTarget(velocityVariable).texture
      },
      uResolution: { value: new THREE.Vector2(1280, 800) },
      uParticleSize: { value: particleSize },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
      uBrightness: { value: 1.35 }
    },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });

  const points = new THREE.Points(geometry, material);
  points.name = "bust-light-particles";
  points.frustumCulled = false;
  points.castShadow = false;
  points.receiveShadow = false;
  points.renderOrder = 2;

  let lastT = 0;
  let disposed = false;

  return {
    points,
    reducedMotion: Boolean(reducedMotion),

    /**
     * @param {number} t elapsed seconds
     * @param {{ simulate?: boolean }} [opts]
     */
    update(t, { simulate = true } = {}) {
      if (disposed) return;
      const dt = lastT > 0 ? Math.min(0.05, Math.max(0, t - lastT)) : 1 / 60;
      lastT = t;

      const runSim = simulate && !this.reducedMotion;
      if (runSim) {
        positionVariable.material.uniforms.uTime.value = t;
        positionVariable.material.uniforms.uDelta.value = dt;
        velocityVariable.material.uniforms.uTime.value = t;
        velocityVariable.material.uniforms.uDelta.value = dt;
        gpgpu.compute();
      }

      material.uniforms.uPositionTexture.value = gpgpu.getCurrentRenderTarget(
        positionVariable
      ).texture;
      material.uniforms.uVelocityTexture.value = gpgpu.getCurrentRenderTarget(
        velocityVariable
      ).texture;
    },

    /**
     * @param {number} w
     * @param {number} h
     * @param {number} [dpr]
     */
    setSize(w, h, dpr = 1) {
      material.uniforms.uResolution.value.set(w * dpr, h * dpr);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      positionTexture.dispose();
      velocityTexture.dispose();
    }
  };
}

/**
 * Neon-emissive solid shell — holds sculptural face/hand detail; particles sparkle on top.
 * A pure point cloud (or near-black shell) erased the bust into a mist silhouette.
 * @param {THREE.Object3D} bustRoot
 * @param {{ colorA?: string, colorB?: string }} [opts]
 */
export function applyBustLightShell(bustRoot, opts = {}) {
  const accent = new THREE.Color(opts.colorB ?? "#00e5ff");
  const lime = new THREE.Color(opts.colorA ?? "#9dff1a");
  const base = accent.clone().lerp(lime, 0.2).multiplyScalar(0.38);
  bustRoot.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.visible = true;
    obj.castShadow = false;
    obj.receiveShadow = true;
    const prior = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const mat = new THREE.MeshStandardMaterial({
      color: base,
      emissive: accent,
      emissiveIntensity: 0.18,
      metalness: 0.08,
      roughness: 0.42,
      envMapIntensity: 0.4,
      toneMapped: true
    });
    mat.name = prior?.name ? `${prior.name}_lightShell` : "bust_light_shell";
    obj.material = mat;
    obj.renderOrder = 0;
  });
}

/**
 * @deprecated Prefer applyBustLightShell — solid hide kills sculptural detail.
 * @param {THREE.Object3D} bustRoot
 */
export function hideSolidBustMeshes(bustRoot) {
  applyBustLightShell(bustRoot);
}
