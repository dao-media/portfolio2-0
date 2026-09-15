import * as THREE from "three";
import { SPOT_ANGLE, SPOT_DISTANCE, SPOT_PENUMBRA } from "../stage/constants.js";

/** Spotlight-gated Fresnel glass + neon PointLight specular (single-source). */
export const CRT_GLASS = {
  roughness: 0.42,
  /**
   * Dark stage IBL through CubeUV reads as a gray radial disc when this is ~2+.
   * Keep low; glare is mostly the flat gradient (see fragment), not env.
   */
  envMapIntensity: 0.22,
  directGlare: 0.06,
  /**
   * Neon PointLight specular on glass — pin glint only (not a broad disc).
   * Must stay under bloom threshold ~1 or half-res bloom softens it back into a disc.
   * Do not raise neonGlare; do not reintroduce N·L fill.
   */
  neonGlare: 0.28,
  neonSpecPower: 180,
  neonDistance: 5.5,
  shellOffset: 0.006,
  /** Keep 1 — scaling the shell from the mesh origin shears it off the bezel. */
  shellScale: 1,
  renderOrder: 12,
  fresnelPower: 2.4,
  baseGlare: 0.035,
  fresnelGlare: 0.45,
  /** Spot-pool edge — lower sharpness / wider edge = no hard circle on the CRT. */
  spotSharpness: 1.0,
  spotEdgeWidth: 0.12,
  spotPenumbraScale: 1.0,
  /** Direct lamp+spec exponents (lower = softer hotspot). */
  lampPower: 1.6,
  specPowerMin: 2.5,
  specPowerMax: 5.0
};

const CRT_GLASS_VERT = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const CRT_GLASS_FRAG = /* glsl */ `
  #define ENVMAP_TYPE_CUBE_UV

  uniform sampler2D envMap;
  uniform float envMapIntensity;
  uniform mat3 envMapRotation;
  uniform vec3 uSpotOrigin;
  uniform vec3 uSpotDirection;
  uniform float uSpotAngle;
  uniform float uSpotPenumbra;
  uniform float uSpotDistance;
  uniform float uSpotSharpness;
  uniform float uSpotEdgeWidth;
  uniform float uSpotPenumbraScale;
  uniform float uFresnelPower;
  uniform float uBaseGlare;
  uniform float uFresnelGlare;
  uniform float uRoughness;
  uniform float uDirectGlare;
  uniform float uLampPower;
  uniform float uSpecPowerMin;
  uniform float uSpecPowerMax;
  uniform vec3 uSpotColor;
  uniform vec3 uNeonOrigin;
  uniform vec3 uNeonColor;
  uniform float uNeonIntensity;
  uniform float uNeonGlare;
  uniform float uNeonSpecPower;
  uniform float uNeonDistance;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  #include <common>
  #include <cube_uv_reflection_fragment>

  float spotlightMask(vec3 worldPos) {
    vec3 toPoint = worldPos - uSpotOrigin;
    float dist = length(toPoint);
    if (dist > uSpotDistance) return 0.0;

    vec3 L = toPoint / max(dist, 1e-5);
    float cosAngle = dot(L, uSpotDirection);
    float cosOuter = cos(uSpotAngle);
    if (cosAngle <= cosOuter) return 0.0;

    float cosInner = cos(uSpotAngle * (1.0 - uSpotPenumbra * uSpotPenumbraScale));
    // Wide smoothstep — feather the pool so the CRT does not read a hard disk edge.
    float spot = smoothstep(cosOuter - uSpotEdgeWidth, cosInner, cosAngle);
    spot = pow(clamp(spot, 0.0, 1.0), max(uSpotSharpness, 1.0));

    float distFade = 1.0 - smoothstep(uSpotDistance * 0.72, uSpotDistance, dist);
    return spot * distFade;
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float viewDot = clamp(abs(dot(normal, viewDir)), 0.0, 1.0);
    float fresnel = pow(1.0 - viewDot, uFresnelPower);
    float spotMask = spotlightMask(vWorldPosition);

    vec3 reflectVec = reflect(-viewDir, normal);
    reflectVec = normalize(mix(reflectVec, normal, uRoughness * uRoughness));
    reflectVec = inverseTransformDirection(reflectVec, viewMatrix);

    vec3 streakVec = inverseTransformDirection(
      normalize(viewDir + normal * 0.5),
      viewMatrix
    );

    // Flat fresnel wash only at the rim — center CubeUV+spot used to read as a gray disc.
    vec3 flatWash = vec3(0.62, 0.70, 0.82) * (uBaseGlare + fresnel * uFresnelGlare);
    vec4 envSample = textureCubeUV(envMap, envMapRotation * reflectVec, uRoughness);
    vec4 streakSample = textureCubeUV(envMap, envMapRotation * streakVec, uRoughness + 0.12);
    float reflectMix = uBaseGlare + fresnel * uFresnelGlare;
    vec3 envHint =
      (envSample.rgb * reflectMix + streakSample.rgb * (uBaseGlare + fresnel * 0.45)) *
      envMapIntensity *
      0.18;
    vec3 envGlare = flatWash + envHint;

    // Soft POV-spot wash — keep glare readable without a hard specular disk.
    vec3 lightDir = normalize(uSpotOrigin - vWorldPosition);
    vec3 halfVec = normalize(lightDir + viewDir);
    float lamp = pow(max(dot(normal, lightDir), 0.0), uLampPower);
    float specPow = mix(uSpecPowerMin, uSpecPowerMax, uRoughness);
    float spec = pow(max(dot(normal, halfVec), 0.0), specPow);
    vec3 directGlare = uSpotColor * uDirectGlare * (lamp * 0.4 + spec * 0.15);

    // Neon PointLight specular — pin Blinn tip only (single-source, spot may be 0).
    // No N·L fill. Hard NH gate + clamp keep bloom from re-softening into a disc.
    vec3 neonGlare = vec3(0.0);
    if (uNeonIntensity > 1e-4) {
      vec3 toNeon = uNeonOrigin - vWorldPosition;
      float neonDist = length(toNeon);
      float neonAtt = 1.0 - smoothstep(uNeonDistance * 0.28, uNeonDistance, neonDist);
      vec3 neonDir = toNeon / max(neonDist, 1e-5);
      vec3 neonHalf = normalize(neonDir + viewDir);
      float nh = max(dot(normal, neonHalf), 0.0);
      float neonSpec = pow(nh, uNeonSpecPower);
      neonSpec *= smoothstep(0.92, 0.995, nh);
      float neonLevel = clamp(uNeonIntensity / 28.0, 0.0, 1.5);
      neonGlare =
        uNeonColor *
        uNeonGlare *
        neonLevel *
        neonAtt *
        neonSpec *
        fresnel *
        fresnel;
      // Cap so half-res bloom cannot re-inflate a round wash (§20.20 recurrence).
      neonGlare = min(neonGlare, vec3(0.28));
    }

    // Rim env/spot under spot pool; neon glint is independent (spot may be 0).
    vec3 glare = (envGlare + directGlare) * (spotMask * fresnel) + neonGlare;

    gl_FragColor = vec4(glare, 1.0);
  }
`;

/**
 * @param {THREE.Texture} [envMap]
 * @returns {THREE.ShaderMaterial}
 */
export function createCrtGlassMaterial(envMap = null) {
  const material = new THREE.ShaderMaterial({
    name: "crt_glass",
    defines: {
      ENVMAP_TYPE_CUBE_UV: ""
    },
    uniforms: {
      envMap: { value: envMap },
      envMapIntensity: { value: CRT_GLASS.envMapIntensity },
      envMapRotation: { value: new THREE.Matrix3() },
      uSpotOrigin: { value: new THREE.Vector3() },
      uSpotDirection: { value: new THREE.Vector3(0, -1, 0) },
      uSpotAngle: { value: SPOT_ANGLE },
      uSpotPenumbra: { value: SPOT_PENUMBRA },
      uSpotDistance: { value: SPOT_DISTANCE },
      uSpotSharpness: { value: CRT_GLASS.spotSharpness },
      uSpotEdgeWidth: { value: CRT_GLASS.spotEdgeWidth },
      uSpotPenumbraScale: { value: CRT_GLASS.spotPenumbraScale },
      uFresnelPower: { value: CRT_GLASS.fresnelPower },
      uBaseGlare: { value: CRT_GLASS.baseGlare },
      uFresnelGlare: { value: CRT_GLASS.fresnelGlare },
      uRoughness: { value: CRT_GLASS.roughness },
      uDirectGlare: { value: CRT_GLASS.directGlare },
      uLampPower: { value: CRT_GLASS.lampPower },
      uSpecPowerMin: { value: CRT_GLASS.specPowerMin },
      uSpecPowerMax: { value: CRT_GLASS.specPowerMax },
      uSpotColor: { value: new THREE.Color(0xfff2e0) },
      uNeonOrigin: { value: new THREE.Vector3() },
      uNeonColor: { value: new THREE.Color(0x00e5ff) },
      uNeonIntensity: { value: 0 },
      uNeonGlare: { value: CRT_GLASS.neonGlare },
      uNeonSpecPower: { value: CRT_GLASS.neonSpecPower },
      uNeonDistance: { value: CRT_GLASS.neonDistance }
    },
    vertexShader: CRT_GLASS_VERT,
    fragmentShader: CRT_GLASS_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });

  applyCrtGlassEnvMap(material, envMap);
  return material;
}

/**
 * ShaderMaterial does not get CubeUV size defines the way MeshStandardMaterial does.
 * Without them, `#include <cube_uv_reflection_fragment>` fails to compile.
 * @param {THREE.ShaderMaterial} material
 * @param {THREE.Texture | null | undefined} envMap
 */
function applyCrtGlassEnvMap(material, envMap) {
  if (!material || !envMap) return;
  if (envMap.mapping !== THREE.CubeUVReflectionMapping) return;

  // Bind as material.envMap so WebGLProgram injects CUBEUV_* once.
  // Do not also stamp those defines — redefinition fails the fragment compile.
  material.envMap = envMap;
  if (material.uniforms?.envMap) material.uniforms.envMap.value = envMap;
  material.needsUpdate = true;
}

const _spotOrigin = new THREE.Vector3();
const _spotTarget = new THREE.Vector3();
const _spotDirection = new THREE.Vector3();

/**
 * @param {THREE.ShaderMaterial} material
 * @param {THREE.SpotLight} spotLight
 * @param {THREE.Object3D} spotTarget
 */
export function setCrtGlassSpotlight(material, spotLight, spotTarget) {
  if (!material?.uniforms || !spotLight || !spotTarget) return;

  spotLight.getWorldPosition(_spotOrigin);
  spotTarget.getWorldPosition(_spotTarget);
  _spotDirection.subVectors(_spotTarget, _spotOrigin).normalize();

  material.uniforms.uSpotOrigin.value.copy(_spotOrigin);
  material.uniforms.uSpotDirection.value.copy(_spotDirection);
  material.uniforms.uSpotColor.value.copy(spotLight.color);
  material.uniforms.uSpotAngle.value = spotLight.angle;
  material.uniforms.uSpotPenumbra.value = spotLight.penumbra;
  material.uniforms.uSpotDistance.value = spotLight.distance;
}

/** @param {THREE.ShaderMaterial} material @param {THREE.Texture} envMap */
export function setCrtGlassEnvMap(material, envMap) {
  if (!material?.uniforms?.envMap || !envMap) return;
  applyCrtGlassEnvMap(material, envMap);
  material.uniforms.envMapIntensity.value =
    CRT_GLASS.envMapIntensity * (material.userData._focusGlareScale ?? 1);
}

/**
 * Damp additive glass glare when the camera dollies in — close-up reads as blowout
 * if env streak + spotlight spec stack on an already-bright CRT face.
 * @param {THREE.ShaderMaterial} material
 * @param {number} focusBlend 0 = stage view, 1 = fully focused on monitor
 */
export function setCrtGlassFocusScale(material, focusBlend) {
  if (!material?.uniforms) return;

  const focus = THREE.MathUtils.clamp(focusBlend, 0, 1);
  const eased = focus * focus;
  const scale = THREE.MathUtils.lerp(1, 0.32, eased);
  material.userData._focusGlareScale = scale;

  material.uniforms.envMapIntensity.value = CRT_GLASS.envMapIntensity * scale;
  material.uniforms.uDirectGlare.value = CRT_GLASS.directGlare * scale;
  material.uniforms.uFresnelGlare.value = CRT_GLASS.fresnelGlare * scale;
  material.uniforms.uBaseGlare.value = CRT_GLASS.baseGlare * scale;
  if (material.uniforms.uNeonGlare) {
    // Keep neon glints readable when dollied in — do not crush as hard as env wash.
    material.uniforms.uNeonGlare.value = CRT_GLASS.neonGlare * Math.max(0.55, scale);
  }
}

const _neonOrigin = new THREE.Vector3();

/**
 * Drive glass specular from the stop neon PointLight (works with POV spot off).
 * @param {THREE.ShaderMaterial} material
 * @param {THREE.PointLight | null | undefined} neonLight
 */
export function setCrtGlassNeonLight(material, neonLight) {
  if (!material?.uniforms?.uNeonOrigin) return;
  if (!neonLight || neonLight.intensity < 1e-4) {
    material.uniforms.uNeonIntensity.value = 0;
    return;
  }
  neonLight.getWorldPosition(_neonOrigin);
  material.uniforms.uNeonOrigin.value.copy(_neonOrigin);
  material.uniforms.uNeonColor.value.copy(neonLight.color);
  material.uniforms.uNeonIntensity.value = neonLight.intensity;
  if (neonLight.distance > 1e-3) {
    material.uniforms.uNeonDistance.value = neonLight.distance * 1.35;
  }
}

/**
 * @param {THREE.BufferGeometry} sourceGeometry
 * @param {number} [offset]
 */
export function createCrtGlassShellGeometry(sourceGeometry, offset = CRT_GLASS.shellOffset) {
  const geometry = sourceGeometry.clone();
  const pos = geometry.attributes.position;
  let norm = geometry.attributes.normal;
  if (!norm) {
    geometry.computeVertexNormals();
    norm = geometry.attributes.normal;
  }

  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(
      i,
      pos.getX(i) + norm.getX(i) * offset,
      pos.getY(i) + norm.getY(i) * offset,
      pos.getZ(i) + norm.getZ(i) * offset
    );
  }

  return geometry;
}

/**
 * @param {THREE.Mesh} screenMesh
 * @param {THREE.Texture} [envMap]
 * @returns {THREE.Mesh}
 */
export function attachCrtGlassShell(screenMesh, envMap = null) {
  const geometry = createCrtGlassShellGeometry(screenMesh.geometry);
  const material = createCrtGlassMaterial(envMap);
  const glass = new THREE.Mesh(geometry, material);
  glass.name = "crt-glass-shell";
  glass.scale.setScalar(CRT_GLASS.shellScale);
  glass.renderOrder = CRT_GLASS.renderOrder;
  glass.raycast = () => {};
  glass.frustumCulled = false;
  screenMesh.add(glass);
  return glass;
}
