import * as THREE from "three";
import { BLACK_HOLE_CENTER } from "../camera/BlackHoleCameraSequence.js";
import {
  blackHoleLensFromCamera,
  GALACTIC_PLANE_N,
  MILKY_WAY_DISTANCE,
  SKY_HORIZON_HIGH
} from "./MilkyWayNebulaShader.js";

/** One draw call. Sizing, twinkle, and lensing stay in the vertex shader. */
export const STARFIELD_COUNT = 6000;
/** Meters a star jumps ahead when it falls behind the camera during the flight. */
export const STARFIELD_WRAP_DEPTH = 250;

const STAR_PALETTE = [
  new THREE.Color(0x9bb0ff),
  new THREE.Color(0xaabfff),
  new THREE.Color(0xcad8ff),
  new THREE.Color(0xfff4ea),
  new THREE.Color(0xffd2a1),
  new THREE.Color(0xffa1a1)
];

const StarfieldShader = {
  uniforms: {
    uTime: { value: 0 },
    uCameraPos: { value: new THREE.Vector3() },
    uBlackHolePos: { value: BLACK_HOLE_CENTER.clone() },
    uLensAngular: { value: 0 },
    uCamZ: { value: 0 },
    uWrap: { value: 0 },
    uPixelRatio: { value: 1 }
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uCameraPos;
    uniform vec3 uBlackHolePos;
    uniform float uLensAngular;
    uniform float uCamZ;
    uniform float uWrap;
    uniform float uPixelRatio;

    attribute float aSize;
    attribute vec3 aColor;
    attribute float aPhase;

    varying vec3 vColor;
    varying float vAlpha;
    varying float vBright;

    void main() {
      vColor = aColor;
      vec3 worldPos = position;
      float skyR = length(worldPos);

      // Flight-only recycle for nearby stars. The galactic belt sits at
      // MILKY_WAY_DISTANCE and must not wrap — that would smear the band.
      if (uWrap > 0.5 && skyR < 2000.0 && worldPos.y > 8.0 && worldPos.z > uCamZ + 10.0) {
        worldPos.z -= ${STARFIELD_WRAP_DEPTH.toFixed(1)};
      }

      // Bend background stars around the hole. The affected angle is the
      // hole's angular size, so the warp shrinks when the camera is far.
      if (uLensAngular > 0.002) {
        vec3 camToStar = worldPos - uCameraPos;
        vec3 camToHole = uBlackHolePos - uCameraPos;
        float holeDist = length(camToHole);
        float starDist = length(camToStar);
        if (holeDist > 0.5 && starDist > 0.5 && dot(camToStar, camToHole) > holeDist * holeDist * 0.9) {
          vec3 holeDir = camToHole / holeDist;
          vec3 starDir = camToStar / starDist;
          float cosA = clamp(dot(starDir, holeDir), -1.0, 1.0);
          float ang = acos(cosA);
          float reach = uLensAngular * 2.4;
          if (ang < reach) {
            float inside = smoothstep(reach, uLensAngular * 0.2, ang);
            float bend = inside * uLensAngular * 0.9;
            vec3 tangent = starDir - holeDir * cosA;
            float tLen = length(tangent);
            if (tLen > 1e-5) {
              vec3 outDir = tangent / tLen;
              float newAng = ang + bend;
              vec3 bent = normalize(holeDir * cos(newAng) + outDir * sin(newAng));
              worldPos = uCameraPos + bent * starDist;
            }
          }
        }
      }

      skyR = length(worldPos);
      vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
      float camDist = length(mvPosition.xyz);
      // Brightness shimmer only. Size stays put so stars don't blink in and out.
      vBright = 0.78 + 0.22 * sin(uTime * 5.5 + aPhase);
      // Belt stars are kilometers out. Size them as if they sat at 170 m,
      // or perspective would shrink them to nothing.
      float size = skyR > 2000.0
        ? aSize * (120.0 / 170.0)
        : (aSize * 120.0) / max(-mvPosition.z, 0.4);
      gl_PointSize = clamp(size * uPixelRatio, 0.0, 9.0);

      float nearFade = smoothstep(0.4, 2.5, camDist);
      float farFade = 1.0 - smoothstep(180.0, 300.0, camDist);
      float elev = worldPos.y / max(skyR, 0.001);
      float horizonFade = smoothstep(0.0, ${SKY_HORIZON_HIGH.toFixed(3)}, elev);
      vAlpha = nearFade * mix(farFade, 1.0, step(2000.0, skyR)) * horizonFade;
      gl_Position = projectionMatrix * mvPosition;
      if (skyR > 2000.0 && gl_Position.w > 0.0) {
        gl_Position.z = gl_Position.w * 0.999;
      }
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;
    varying float vBright;

    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = length(coord);
      if (dist > 0.5) discard;

      float core = pow(smoothstep(0.5, 0.02, dist), 1.35);
      gl_FragColor = vec4(vColor * vBright, core * vAlpha);
    }
  `
};

const _UP = new THREE.Vector3(0, 1, 0);
const BAND_TANGENT = new THREE.Vector3().crossVectors(GALACTIC_PLANE_N, _UP).normalize();
const BAND_BITANGENT = new THREE.Vector3().crossVectors(GALACTIC_PLANE_N, BAND_TANGENT).normalize();
const _bandDir = new THREE.Vector3();
/** Lowest star elevation. The horizon fade hides them before this meets the ground. */
const SKY_ELEV_MIN = (1 * Math.PI) / 180;

/**
 * Brighter stars on the galactic filaments, only the arc above the horizon.
 * The plane dips through the ground; that half is folded to the sky side.
 * @param {Float32Array} positions
 * @param {number} index
 */
function writeGalacticBand(positions, index) {
  const i3 = index * 3;
  const filament = Math.floor(Math.random() * 6);
  let along = (filament / 6) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
  const spread = 0.012 + (filament % 3) * 0.008;
  const across = (Math.random() - 0.5) * spread * 2;
  const radius = MILKY_WAY_DISTANCE * (0.985 + Math.random() * 0.03);
  const yMin = Math.sin(SKY_ELEV_MIN);
  for (let n = 0; n < 2; n += 1) {
    _bandDir
      .copy(BAND_TANGENT)
      .multiplyScalar(Math.cos(along))
      .addScaledVector(BAND_BITANGENT, Math.sin(along))
      .addScaledVector(GALACTIC_PLANE_N, across)
      .normalize();
    if (_bandDir.y >= yMin) break;
    along += Math.PI;
  }
  if (_bandDir.y < yMin) {
    _bandDir.y = yMin;
    _bandDir.normalize();
  }
  _bandDir.multiplyScalar(radius);
  positions[i3] = _bandDir.x;
  positions[i3 + 1] = _bandDir.y;
  positions[i3 + 2] = _bandDir.z;
}

/**
 * Upper sky only, on the same distant shell as the belt. Nothing at stage height.
 * @param {Float32Array} positions
 * @param {number} index
 */
function writeUpperSky(positions, index) {
  const i3 = index * 3;
  const theta = Math.random() * Math.PI * 2;
  const yMin = Math.sin(SKY_ELEV_MIN);
  const y = yMin + Math.random() * (1 - yMin);
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const radius = MILKY_WAY_DISTANCE * (0.985 + Math.random() * 0.03);
  positions[i3] = radius * ring * Math.cos(theta);
  positions[i3 + 1] = radius * y;
  positions[i3 + 2] = radius * ring * Math.sin(theta);
}

/**
 * All 6,000 points live on the distant sky. 60% fill the cap above the
 * horizon; 40% are the brighter galactic belt. No stage-height ring or box.
 * @param {number} [starCount]
 */
export function createProceduralStarfield(starCount = STARFIELD_COUNT) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const phases = new Float32Array(starCount);

  const bandStart = Math.floor(starCount * 0.6);

  for (let i = 0; i < starCount; i += 1) {
    const i3 = i * 3;
    const inBand = i >= bandStart;
    if (inBand) writeGalacticBand(positions, i);
    else writeUpperSky(positions, i);

    const colIndex = inBand
      ? 2 + Math.floor(Math.random() * (STAR_PALETTE.length - 2))
      : Math.floor(Math.pow(Math.random(), 1.8) * STAR_PALETTE.length);
    const col = STAR_PALETTE[Math.min(colIndex, STAR_PALETTE.length - 1)];
    colors[i3] = col.r;
    colors[i3 + 1] = col.g;
    colors[i3 + 2] = col.b;
    sizes[i] = inBand
      ? Math.pow(Math.random(), 2) * 2.4 + 0.7
      : Math.pow(Math.random(), 3) * 1.8 + 0.4;
    phases[i] = Math.random() * Math.PI * 2;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    name: "ProceduralStarfield",
    uniforms: THREE.UniformsUtils.clone(StarfieldShader.uniforms),
    vertexShader: StarfieldShader.vertexShader,
    fragmentShader: StarfieldShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: true,
    fog: false
  });

  const stars = new THREE.Points(geometry, material);
  stars.name = "procedural-starfield";
  stars.frustumCulled = false;
  stars.renderOrder = 1;
  return stars;
}

/**
 * Uniform tick. Wrap is a shader flag (1 during the black-hole flight only).
 * @param {THREE.Points} starfield
 * @param {THREE.Camera} camera
 * @param {number} time
 * @param {{ wrap?: boolean, pixelRatio?: number }} [opts]
 */
export function updateStarfield(starfield, camera, time, opts = {}) {
  const uniforms = starfield?.material?.uniforms;
  if (!uniforms) return;
  uniforms.uTime.value = time;
  uniforms.uCameraPos.value.copy(camera.position);
  uniforms.uCamZ.value = camera.position.z;
  uniforms.uWrap.value = opts.wrap ? 1 : 0;
  uniforms.uLensAngular.value = opts.wrap
    ? blackHoleLensFromCamera(camera, uniforms.uBlackHolePos.value).angular
    : 0;
  if (Number.isFinite(opts.pixelRatio)) {
    uniforms.uPixelRatio.value = opts.pixelRatio;
  }
}
