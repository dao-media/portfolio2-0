import * as THREE from "three";
import { SPOT_ANGLE, SPOT_DISTANCE, SPOT_PENUMBRA } from "../stage/constants.js";

/** Spotlight-gated Fresnel glass — softbox env streak only inside the POV pool. */
export const CRT_GLASS = {
  roughness: 0.1,
  envMapIntensity: 2.65,
  directGlare: 0.22,
  shellOffset: 0.006,
  shellScale: 1.014,
  renderOrder: 12,
  fresnelPower: 2.35,
  baseGlare: 0.15,
  fresnelGlare: 3.4
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
  uniform vec3 uSpotColor;

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
    if (cosAngle <= cos(uSpotAngle)) return 0.0;

    float cosOuter = cos(uSpotAngle);
    float cosInner = cos(uSpotAngle * (1.0 - uSpotPenumbra * uSpotPenumbraScale));
    float spot = smoothstep(cosOuter - uSpotEdgeWidth, cosInner, cosAngle);
    spot = pow(clamp(spot, 0.0, 1.0), uSpotSharpness);

    float distFade = 1.0 - smoothstep(uSpotDistance * 0.82, uSpotDistance, dist);
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

    vec4 envSample = textureCubeUV(envMap, envMapRotation * reflectVec, uRoughness);
    vec4 streakSample = textureCubeUV(envMap, envMapRotation * streakVec, uRoughness + 0.05);
    float reflectMix = uBaseGlare + fresnel * uFresnelGlare;
    vec3 envGlare =
      (envSample.rgb * reflectMix + streakSample.rgb * (uBaseGlare * 1.25 + fresnel * 0.75)) *
      envMapIntensity;

    // Broad POV-spot streak — keeps glare visible when env samples are dark.
    vec3 lightDir = normalize(uSpotOrigin - vWorldPosition);
    vec3 halfVec = normalize(lightDir + viewDir);
    float lamp = pow(max(dot(normal, lightDir), 0.0), 2.2);
    float spec = pow(max(dot(normal, halfVec), 0.0), mix(4.0, 14.0, uRoughness));
    vec3 directGlare = uSpotColor * uDirectGlare * (lamp * 0.55 + spec * 0.45);

    vec3 glare = (envGlare + directGlare) * spotMask;

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
      uSpotSharpness: { value: 1.6 },
      uSpotEdgeWidth: { value: 0.012 },
      uSpotPenumbraScale: { value: 0.45 },
      uFresnelPower: { value: CRT_GLASS.fresnelPower },
      uBaseGlare: { value: CRT_GLASS.baseGlare },
      uFresnelGlare: { value: CRT_GLASS.fresnelGlare },
      uRoughness: { value: CRT_GLASS.roughness },
      uDirectGlare: { value: CRT_GLASS.directGlare },
      uSpotColor: { value: new THREE.Color(0xfff2e0) }
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

  if (envMap) {
    material.envMap = envMap;
  }

  return material;
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
  material.envMap = envMap;
  material.uniforms.envMap.value = envMap;
  material.uniforms.envMapIntensity.value =
    CRT_GLASS.envMapIntensity * (material.userData._focusGlareScale ?? 1);
  material.needsUpdate = true;
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
