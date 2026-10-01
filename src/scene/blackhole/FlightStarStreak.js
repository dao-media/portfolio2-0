import * as THREE from "three";

/**
 * Flight-only near layer: stars close enough to the camera to stream past
 * during the black-hole approach, kept as a separate layer from the far sky
 * (StarField.js) so recycling this layer's real, close world positions can
 * never balloon a point into a soft orb the way the old nebula clouds did.
 */

export const STREAK_COUNT = 900;
/** Annulus around the flight axis, meters — the inner radius keeps a clear tube directly ahead. */
export const STREAK_TUBE_INNER_RADIUS = 3.5;
export const STREAK_TUBE_OUTER_RADIUS = 26;
/** Depth ahead of / behind the camera a star can occupy before recycling, meters. */
export const STREAK_SPAWN_AHEAD = 90;
export const STREAK_RECYCLE_BEHIND = 6;
/** Stars fade out inside this distance from the camera so nothing balloons up close. */
export const STREAK_NEAR_FADE_DISTANCE = 2;
/** Nominal (far) point size range, CSS px before the pixelRatio multiply — matches StarField.js's scale so this near layer doesn't read larger than the far sky it streams in front of. */
export const STREAK_MAX_SIZE_PX = 1.5;
export const STREAK_MIN_SIZE_PX = 0.5;
/** Sprite falloff, same meaning as StarField.js's STAR_FIELD_SPRITE_SOFTNESS. */
export const STREAK_SPRITE_SOFTNESS = 0.16;
/** Same anti-pop floor as StarField.js's STAR_FIELD_MIN_RENDER_PX. */
export const STREAK_MIN_RENDER_PX = 2;

const StreakShader = {
  uniforms: {
    uPixelRatio: { value: 1 },
    uNearFadeDistance: { value: STREAK_NEAR_FADE_DISTANCE },
    uMaxBrightness: { value: 0.85 },
    uLayerFade: { value: 0 },
    uSpriteSoftness: { value: STREAK_SPRITE_SOFTNESS },
    uMinRenderPx: { value: STREAK_MIN_RENDER_PX }
  },
  vertexShader: /* glsl */ `
    uniform float uPixelRatio;
    uniform float uNearFadeDistance;
    uniform float uMinRenderPx;
    attribute float aSize;
    attribute float aBright;
    attribute vec3 aColor;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vMag;
    void main() {
      vColor = aColor;
      vMag = aBright;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      float camDist = length(mvPosition.xyz);
      float nearFade = smoothstep(0.0, max(uNearFadeDistance, 0.01), camDist);
      // Perspective size falloff, then clamp — never lets a close star swell.
      float size = (aSize * 40.0) / max(-mvPosition.z, 0.4);
      float intendedPx = max(min(size, aSize) * uPixelRatio, 0.01);
      // Same anti-pop treatment as StarField.js: never render sub-pixel —
      // scale alpha down instead, so a far, "small" streak star stays small
      // and dim without aliasing as the camera moves.
      float renderedPx = max(intendedPx, uMinRenderPx);
      gl_PointSize = renderedPx;
      float sizeRatio = intendedPx / renderedPx;
      vAlpha = nearFade * sizeRatio * sizeRatio;
      gl_Position = projectionMatrix * mvPosition;
      // Same far-plane pin as StarField.js and the reveal field, so all
      // three sky layers sit at the same depth and none can be clipped.
      gl_Position.z = gl_Position.w * 0.99999;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uMaxBrightness;
    uniform float uLayerFade;
    uniform float uSpriteSoftness;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vMag;
    void main() {
      // Same hard-core/soft-edge sprite as StarField.js.
      float r = length(gl_PointCoord - vec2(0.5));
      float edge0 = max(0.0, 0.5 - uSpriteSoftness);
      float core = 1.0 - smoothstep(edge0, 0.5, r);
      if (core < 0.02) discard;
      float alpha = core * vAlpha * uLayerFade;
      if (alpha < 0.003) discard;
      gl_FragColor = vec4(vColor * uMaxBrightness * vMag, alpha);
    }
  `
};

const STAR_PALETTE = [
  new THREE.Color(0x9bb0ff),
  new THREE.Color(0xcad8ff),
  new THREE.Color(0xfff4ea),
  new THREE.Color(0xffd2a1)
];

function randomInAnnulus() {
  const r = Math.sqrt(
    STREAK_TUBE_INNER_RADIUS * STREAK_TUBE_INNER_RADIUS +
      Math.random() * (STREAK_TUBE_OUTER_RADIUS * STREAK_TUBE_OUTER_RADIUS - STREAK_TUBE_INNER_RADIUS * STREAK_TUBE_INNER_RADIUS)
  );
  const theta = Math.random() * Math.PI * 2;
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

export function createFlightStarStreak(count = STREAK_COUNT) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brights = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const { x, y } = randomInAnnulus();
    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = -Math.random() * STREAK_SPAWN_AHEAD;
    const col = STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)];
    colors[i3] = col.r;
    colors[i3 + 1] = col.g;
    colors[i3 + 2] = col.b;
    // Brightness carries the star-to-star variation, not size (see StarField.js).
    sizes[i] = STREAK_MIN_SIZE_PX + Math.pow(Math.random(), 6) * (STREAK_MAX_SIZE_PX - STREAK_MIN_SIZE_PX);
    brights[i] = 0.3 + Math.pow(Math.random(), 1.8) * 0.7;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aBright", new THREE.BufferAttribute(brights, 1));

  const material = new THREE.ShaderMaterial({
    name: "FlightStarStreak",
    uniforms: THREE.UniformsUtils.clone(StreakShader.uniforms),
    vertexShader: StreakShader.vertexShader,
    fragmentShader: StreakShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
    fog: false
  });

  const points = new THREE.Points(geometry, material);
  points.name = "flight-star-streak";
  points.frustumCulled = false;
  points.renderOrder = 1;
  points.visible = false;
  points.userData.layerFadeCurrent = 0;
  return points;
}

const _localPos = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

/**
 * Real, world-space recycling: each frame, any star that has fallen behind
 * the camera along its forward axis respawns ahead of it at a fresh annulus
 * offset — a true streaming-past effect, not a camera-locked shell like the
 * far sky.
 * @param {THREE.Points} streak
 * @param {THREE.Camera} camera
 * @param {number} pixelRatio
 * @param {number} layerFadeTarget 0..1 — 0 fades the whole layer out (e.g. before arrival)
 * @param {number} dt
 */
export function updateFlightStarStreak(streak, camera, pixelRatio, layerFadeTarget, dt) {
  if (!streak || !camera) return;
  const rate = Math.min(1, Math.max(0, dt || 0) * 3);
  streak.userData.layerFadeCurrent += (layerFadeTarget - streak.userData.layerFadeCurrent) * rate;
  streak.material.uniforms.uLayerFade.value = streak.userData.layerFadeCurrent;
  streak.visible = streak.userData.layerFadeCurrent > 0.003;
  if (!streak.visible) return;

  if (Number.isFinite(pixelRatio)) streak.material.uniforms.uPixelRatio.value = pixelRatio;

  camera.getWorldDirection(_forward);
  _camPos.copy(camera.position);
  streak.position.set(0, 0, 0);
  streak.quaternion.identity();
  _right.crossVectors(_forward, camera.up).normalize();
  _up.crossVectors(_right, _forward).normalize();

  const pos = streak.geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    _localPos.fromBufferAttribute(pos, i).sub(_camPos);
    const alongCam = _localPos.dot(_forward);
    if (alongCam < -STREAK_RECYCLE_BEHIND) {
      const { x, y } = randomInAnnulus();
      _localPos
        .copy(_camPos)
        .addScaledVector(_forward, STREAK_SPAWN_AHEAD)
        .addScaledVector(_right, x)
        .addScaledVector(_up, y);
      pos.setXYZ(i, _localPos.x, _localPos.y, _localPos.z);
    }
  }
  pos.needsUpdate = true;
}
