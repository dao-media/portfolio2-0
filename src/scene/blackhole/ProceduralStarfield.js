import * as THREE from "three";
import { BLACK_HOLE_CENTER } from "../camera/BlackHoleCameraSequence.js";
import { blackHoleLensFromCamera, RING_BAND_ELEV, SKY_DOME_RADIUS, SKY_HORIZON_HIGH } from "./MilkyWayNebulaShader.js";

/**
 * This module now serves the cursor hover star trail only (see
 * CursorStarTrail.js) — the far-sky field it used to also generate
 * (createProceduralStarfield / createFlightStarMirror) has been replaced by
 * StarField.js, a single object shared by the ring and the black-hole
 * flight. Do not add the far-sky field back here; wire it through
 * StarField.js instead.
 */

/** Distant shell radius for the reveal-trail's own field, meters. */
const MILKY_WAY_DISTANCE = 24000;
/** Meters a trail star jumps ahead when it falls behind the camera. */
const STARFIELD_WRAP_DEPTH = 250;
/** Draw distance for the trail's points — a shell around the camera. */
const SKY_POINT_DISTANCE = 170;

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
    uLensInner: { value: 0 },
    uLensOuter: { value: 0 },
    uLensStrength: { value: 0 },
    uCamZ: { value: 0 },
    uWrap: { value: 0 },
    uMirror: { value: 0 },
    uHorizonFade: { value: 1 },
    uPixelRatio: { value: 1 },
    uDropPitch: { value: 0 },
    uDropAxis: { value: new THREE.Vector3(1, 0, 0) },
    uWorldDome: { value: 0 },
    uReveal: { value: 0 },
    uMaskGain: { value: 0 },
    uCursorPx: { value: new THREE.Vector2() },
    uHeading: { value: new THREE.Vector2(1, 0) },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uTrailLength: { value: 80 },
    uTrailHalf: { value: 24 }
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uCameraPos;
    uniform vec3 uBlackHolePos;
    uniform float uLensInner;
    uniform float uLensOuter;
    uniform float uLensStrength;
    uniform float uCamZ;
    uniform float uWrap;
    uniform float uMirror;
    uniform float uHorizonFade;
    uniform float uPixelRatio;
    uniform float uDropPitch;
    uniform vec3 uDropAxis;
    uniform float uWorldDome;
    uniform float uReveal;
    uniform float uMaskGain;
    uniform vec2 uCursorPx;
    uniform vec2 uHeading;
    uniform vec2 uViewport;
    uniform float uTrailLength;
    uniform float uTrailHalf;

    attribute float aSize;
    attribute vec3 aColor;
    attribute float aPhase;
    attribute float aBand;

    varying vec3 vColor;
    varying float vAlpha;
    varying float vBright;

    void main() {
      vColor = aColor;
      vec3 worldPos = position;
      // The flight copy fills the downhill view with field stars. The belt
      // stays on its own arc so it is not drawn twice.
      if (uMirror > 0.5 && aBand > 0.5) {
        vBright = 0.0;
        vAlpha = 0.0;
        gl_PointSize = 0.0;
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
      }
      if (uMirror > 0.5) worldPos.y = -worldPos.y;
      float skyR = length(worldPos);
      // Celestial direction. The flight draws it on a shell around the
      // camera. The ring draws it on the world dome.
      vec3 skyDir = normalize(worldPos);
      // Belt stars are a cloud in both skies. On the ring they sit on a
      // full circle at RING_BAND_ELEV so the band crosses every stop.
      if (aBand > 0.5) {
        float h1 = fract(sin(aPhase * 127.1 + aSize * 311.7) * 43758.5453);
        float h2 = fract(sin(aPhase * 269.5 + aSize * 183.3) * 12578.1459);
        if (uWorldDome > 0.5) {
          float elev = ${RING_BAND_ELEV.toFixed(3)} + (h1 - 0.5) * 0.1;
          float ring = sqrt(max(0.0, 1.0 - elev * elev));
          skyDir = vec3(cos(aPhase) * ring, elev, sin(aPhase) * ring);
        }
        vec3 axis = abs(skyDir.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(-skyDir.z, 0.0, skyDir.x);
        axis = normalize(axis);
        vec3 side = normalize(cross(skyDir, axis));
        skyDir = normalize(skyDir + side * (h1 - 0.5) * 0.28 + axis * (h2 - 0.5) * 0.1);
      }
      // Aerial drop only, and only while the sky is glued to the camera.
      // On the ring the shell is world-fixed, so the drop shifts it by itself.
      if (uWorldDome < 0.5 && abs(uDropPitch) > 0.0001) {
        float c = cos(uDropPitch);
        float s = sin(uDropPitch);
        skyDir = normalize(skyDir * c + cross(uDropAxis, skyDir) * s + uDropAxis * dot(uDropAxis, skyDir) * (1.0 - c));
      }
      worldPos = uWorldDome > 0.5
        ? skyDir * ${SKY_DOME_RADIUS.toFixed(1)}
        : uCameraPos + skyDir * ${SKY_POINT_DISTANCE.toFixed(1)};

      // Flight-only recycle for nearby stars. The galactic belt sits at
      // MILKY_WAY_DISTANCE and must not wrap — that would smear the band.
      if (uWrap > 0.5 && skyR < 2000.0 && worldPos.y > 8.0 && worldPos.z > uCamZ + 10.0) {
        worldPos.z -= ${STARFIELD_WRAP_DEPTH.toFixed(1)};
      }

      // Annulus: outside the event horizon, tight to the ring. Bend uses
      // strength, which stays shut until halfway in.
      if (uLensOuter > 0.002 && uLensStrength > 0.001) {
        vec3 camToStar = worldPos - uCameraPos;
        vec3 camToHole = uBlackHolePos - uCameraPos;
        float holeDist = length(camToHole);
        float starDist = length(camToStar);
        if (holeDist > 0.5 && starDist > 0.5 && dot(camToStar, camToHole) > holeDist * holeDist * 0.9) {
          vec3 holeDir = camToHole / holeDist;
          vec3 starDir = camToStar / starDist;
          float cosA = clamp(dot(starDir, holeDir), -1.0, 1.0);
          float ang = acos(cosA);
          if (ang > uLensInner && ang < uLensOuter) {
            float u = (ang - uLensInner) / max(uLensOuter - uLensInner, 1e-4);
            float onset = smoothstep(0.0, 0.08, u);
            float tight = smoothstep(1.0, 0.9, u);
            float bend = onset * tight * uLensStrength * 0.053;
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

      vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
      float camDist = length(mvPosition.xyz);
      // Brightness shimmer only. Size stays put so stars don't blink in and out.
      vBright = 0.78 + 0.22 * sin(uTime * 5.5 + aPhase);
      float size = (aSize * 120.0) / max(-mvPosition.z, 0.4);
      gl_PointSize = clamp(size * uPixelRatio, 0.0, 9.0);

      float nearFade = smoothstep(0.4, 2.5, camDist);
      float elev = skyDir.y;
      float horizonFade = mix(1.0, smoothstep(0.0, ${SKY_HORIZON_HIGH.toFixed(3)}, elev), uHorizonFade);
      vAlpha = nearFade * horizonFade;
      gl_Position = projectionMatrix * mvPosition;

      // Hidden field. Same stars as the sky; a soft teardrop uncovers them.
      // The mask moves. The star directions do not.
      if (uReveal > 0.5) {
        if (gl_Position.w <= 0.0 || uMaskGain < 0.001) {
          vAlpha = 0.0;
          gl_PointSize = 0.0;
        } else {
          vec2 ndc = gl_Position.xy / gl_Position.w;
          vec2 starPx = vec2(
            (ndc.x * 0.5 + 0.5) * uViewport.x,
            (0.5 - ndc.y * 0.5) * uViewport.y
          );
          vec2 delta = starPx - uCursorPx;
          vec2 side = vec2(-uHeading.y, uHeading.x);
          float along = dot(delta, -uHeading);
          float across = abs(dot(delta, side));
          float u = along / max(uTrailLength, 1.0);
          float neck = clamp(u / 0.07, 0.0, 1.0);
          float prof = neck * pow(clamp(1.0 - u, 0.0, 1.0), 1.25);
          float halfW = max(uTrailHalf * prof, 0.001);
          float d = across / halfW;
          float smudge = exp(-d * d * 1.35);
          smudge *= smoothstep(-0.06, 0.14, u) * smoothstep(1.25, 0.42, u);
          vAlpha *= smudge * uMaskGain;
          if (vAlpha < 0.025) gl_PointSize = 0.0;
        }
      }
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;
    varying float vBright;

    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = dot(coord, coord);
      float core = exp(-dist * 18.0);
      if (core < 0.04) discard;
      gl_FragColor = vec4(vColor * vBright, core * vAlpha);
    }
  `
};

/** Lowest star elevation. The horizon fade hides them before this meets the ground. */
const SKY_ELEV_MIN = (1 * Math.PI) / 180;

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
 * Denser copy of the field stars, same shader and palette. Drawn only
 * where the cursor smudge is open. Directions stay fixed.
 * @param {number} [starCount]
 */
export function createRevealStarfield(starCount = 24000) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const phases = new Float32Array(starCount);
  const bands = new Float32Array(starCount);

  for (let i = 0; i < starCount; i += 1) {
    const i3 = i * 3;
    writeUpperSky(positions, i);
    const colIndex = Math.floor(Math.pow(Math.random(), 1.8) * STAR_PALETTE.length);
    const col = STAR_PALETTE[Math.min(colIndex, STAR_PALETTE.length - 1)];
    colors[i3] = col.r;
    colors[i3 + 1] = col.g;
    colors[i3 + 2] = col.b;
    sizes[i] = Math.pow(Math.random(), 2) * 2.2 + 0.55;
    phases[i] = Math.random() * Math.PI * 2;
    bands[i] = 0;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aBand", new THREE.BufferAttribute(bands, 1));

  const material = new THREE.ShaderMaterial({
    name: "RevealStarfield",
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
  material.uniforms.uReveal.value = 1;
  material.uniforms.uMaskGain.value = 0;

  const stars = new THREE.Points(geometry, material);
  stars.name = "cursor-star-reveal";
  stars.frustumCulled = false;
  stars.renderOrder = 1;
  stars.visible = false;
  return stars;
}

/**
 * Uniform tick. Wrap is a shader flag (1 during the black-hole flight only).
 * @param {THREE.Points} starfield
 * @param {THREE.Camera} camera
 * @param {number} time
 * @param {{ wrap?: boolean, horizonFade?: boolean, pixelRatio?: number, dropPitch?: number, dropAxis?: THREE.Vector3, worldDome?: boolean }} [opts]
 */
export function updateStarfield(starfield, camera, time, opts = {}) {
  const uniforms = starfield?.material?.uniforms;
  if (!uniforms) return;
  uniforms.uTime.value = time;
  uniforms.uCameraPos.value.copy(camera.position);
  uniforms.uCamZ.value = camera.position.z;
  uniforms.uWrap.value = opts.wrap ? 1 : 0;
  uniforms.uDropPitch.value = opts.dropPitch || 0;
  if (opts.dropAxis) uniforms.uDropAxis.value.copy(opts.dropAxis);
  if (opts.worldDome != null && uniforms.uWorldDome) {
    uniforms.uWorldDome.value = opts.worldDome ? 1 : 0;
  }
  if (opts.horizonFade != null && uniforms.uMirror.value < 0.5) {
    uniforms.uHorizonFade.value = opts.horizonFade ? 1 : 0;
  }
  const lens = opts.wrap
    ? blackHoleLensFromCamera(camera, uniforms.uBlackHolePos.value)
    : null;
  uniforms.uLensInner.value = lens ? lens.innerAngular : 0;
  uniforms.uLensOuter.value = lens ? lens.outerAngular : 0;
  uniforms.uLensStrength.value = lens ? lens.strength : 0;
  if (Number.isFinite(opts.pixelRatio)) {
    uniforms.uPixelRatio.value = opts.pixelRatio;
  }
}
