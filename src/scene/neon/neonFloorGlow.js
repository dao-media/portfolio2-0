import * as THREE from "three";
import {
  DESKTOP_TOWER_FOOTPRINT,
  DESKTOP_TOWER_FOOTPRINT_FEATHER,
  NEON_FLOOR_GLOW_CONE_HEIGHT,
  NEON_FLOOR_GLOW_CONE_OPACITY,
  NEON_FLOOR_GLOW_CONE_RADIUS,
  NEON_FLOOR_GLOW_DESKTOP_POOL_OFFSET_X,
  NEON_FLOOR_GLOW_DESKTOP_POOL_OPACITY,
  NEON_FLOOR_GLOW_DESKTOP_POOL_SCALE,
  NEON_FLOOR_GLOW_POOL,
  NEON_FLOOR_GLOW_POOL_OPACITY,
  NEON_FLOOR_GLOW_Y,
  NEON_FOG_LAYER
} from "../stage/constants.js";
import { STAGE_FLOOR_Y } from "../vignettes/pcSceneBlockout.js";

/** Soft radial for the floor pool — long feather, hot core. */
let _poolMap = null;
/** Vertical strip: bright at v=0 (floor), fades to 0 at v=1 (up the cone). */
let _coneMap = null;

const _groupInv = new THREE.Matrix4();

function getPoolMap() {
  if (_poolMap) return _poolMap;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cx = size * 0.5;
  const cy = size * 0.5;
  const maxR = size * 0.5;
  // Hot core under the tube foot + soft outer halo. Dead outer margin so
  // grazing foreshortening doesn’t leave a hard front/rear chord.
  const softEnd = 0.72;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5 - cx) / maxR;
      const dy = (y + 0.5 - cy) / maxR;
      const r = Math.sqrt(dx * dx + dy * dy);
      const t = Math.min(1, Math.max(0, r / softEnd));
      // Core stays bright; outer falloff is a long feather (halo, not a disc rim).
      const a = Math.pow(1 - t, 2.8) * (0.55 + 0.45 * Math.pow(1 - t, 5.5));
      const i = (y * size + x) * 4;
      const v = Math.round(Math.min(1, a) * 255);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
  _poolMap = new THREE.CanvasTexture(canvas);
  _poolMap.colorSpace = THREE.SRGBColorSpace;
  // No mipmaps — avoid a hard ring where the radial hits zero mid-mip.
  _poolMap.generateMipmaps = false;
  _poolMap.minFilter = THREE.LinearFilter;
  _poolMap.magFilter = THREE.LinearFilter;
  _poolMap.needsUpdate = true;
  return _poolMap;
}

function getConeMap() {
  if (_coneMap) return _coneMap;
  const w = 64;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    // Canvas y=0 is top; with flipY (default) that samples at the mesh TOP.
    // Bright at the FLOOR → put energy at the bottom of the canvas (high y).
    const fromFloor = y / (h - 1);
    // Soft floor hug — long vertical feather, no hard lid.
    // Floor-biased: most energy in the lowest ~35%, then dies before stump top.
    const heightFade = Math.pow(fromFloor, 3.2);
    for (let x = 0; x < w; x += 1) {
      const u = (x + 0.5) / w;
      // Wide gaussian-ish edge so the silhouette doesn’t read as a solid cone.
      const radial = Math.abs(u - 0.5) * 2;
      const edge = Math.pow(Math.max(0, 1 - radial), 2.8);
      const a = heightFade * edge;
      const i = (y * w + x) * 4;
      const c = Math.round(a * 255);
      img.data[i] = c;
      img.data[i + 1] = c;
      img.data[i + 2] = c;
      img.data[i + 3] = c;
    }
  }
  ctx.putImageData(img, 0, 0);
  _coneMap = new THREE.CanvasTexture(canvas);
  _coneMap.colorSpace = THREE.SRGBColorSpace;
  _coneMap.needsUpdate = true;
  return _coneMap;
}

/**
 * Soft radial for the floor pool — long feather, hot core.
 * Desktop: world-space tower AABB kill (full footprint), not a single UV half.
 */
function makePoolMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: getPoolMap() },
      uColor: { value: color.clone() },
      uOpacity: { value: 0 },
      /** Tower footprint in vignette-group local XZ (avoids ring-rotation AABB bugs). */
      uTowerMinXZ: { value: new THREE.Vector2(0, 0) },
      uTowerMaxXZ: { value: new THREE.Vector2(0, 0) },
      uTowerFeather: { value: 0 },
      uTowerClip: { value: 0 },
      uGroupWorldInverse: { value: new THREE.Matrix4() }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D map;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform vec2 uTowerMinXZ;
      uniform vec2 uTowerMaxXZ;
      uniform float uTowerFeather;
      uniform float uTowerClip;
      uniform mat4 uGroupWorldInverse;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      void main() {
        float dens = texture2D(map, vUv).r;
        // Full tower footprint in GROUP LOCAL XZ — rotation-safe (ring stops).
        if (uTowerClip > 0.5) {
          vec3 groupPos = (uGroupWorldInverse * vec4(vWorldPos, 1.0)).xyz;
          float dx = max(uTowerMinXZ.x - groupPos.x, groupPos.x - uTowerMaxXZ.x);
          float dz = max(uTowerMinXZ.y - groupPos.z, groupPos.z - uTowerMaxXZ.y);
          float outside = max(dx, dz);
          float towerMask = smoothstep(-uTowerFeather * 0.25, uTowerFeather, outside);
          dens *= towerMask;
        }
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float ndv = abs(dot(normalize(vWorldNormal), viewDir));
        float facing = smoothstep(0.05, 0.28, ndv);
        float a = dens * uOpacity * facing;
        if (a < 1e-4) discard;
        vec3 col = uColor * (a * 1.35);
        gl_FragColor = vec4(col, 0.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    side: THREE.FrontSide,
    toneMapped: false
  });
}

function tagGlowLayer(obj) {
  obj.layers.set(NEON_FOG_LAYER);
  obj.frustumCulled = false;
  obj.renderOrder = 2;
  obj.castShadow = false;
  obj.receiveShadow = false;
}

/**
 * Soft pool + low cone at the tube foot — light “bounces” on the floor and
 * lifts a short conical haze without a MeshStandard apron.
 * @param {THREE.Color} color
 * @returns {THREE.Group}
 */
export function makeNeonFloorGlow(color) {
  const root = new THREE.Group();
  root.name = "neon-floor-glow";

  const poolMat = makePoolMaterial(color);
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(NEON_FLOOR_GLOW_POOL, NEON_FLOOR_GLOW_POOL),
    poolMat
  );
  pool.name = "neon-floor-glow-pool";
  pool.rotation.x = -Math.PI / 2;
  pool.userData.maxOpacity = NEON_FLOOR_GLOW_POOL_OPACITY;
  tagGlowLayer(pool);
  root.add(pool);

  // Soft stump — wide at floor, mild taper (avoid a sharp needle silhouette).
  const coneGeo = new THREE.CylinderGeometry(
    NEON_FLOOR_GLOW_CONE_RADIUS * 0.45,
    NEON_FLOOR_GLOW_CONE_RADIUS,
    NEON_FLOOR_GLOW_CONE_HEIGHT,
    24,
    1,
    true
  );
  const coneMat = new THREE.MeshBasicMaterial({
    map: getConeMap(),
    color: color.clone(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.name = "neon-floor-glow-cone";
  cone.userData.maxOpacity = NEON_FLOOR_GLOW_CONE_OPACITY;
  tagGlowLayer(cone);
  root.add(cone);

  root.userData.pool = pool;
  root.userData.cone = cone;
  return root;
}

/**
 * Pin glow under the tube’s local XZ; cone sits on the floor.
 * @param {THREE.Group} glow
 * @param {THREE.Object3D} tube
 * @param {THREE.Object3D} group
 * @param {{ poolScale?: number, poolOffsetX?: number }} [opts]
 */
export function seatNeonFloorGlow(glow, tube, group, opts = {}) {
  if (!glow || !tube || !group) return;
  glow.position.x = tube.position.x;
  glow.position.z = tube.position.z;
  glow.position.y = STAGE_FLOOR_Y - group.position.y;

  const pool = glow.userData.pool;
  const cone = glow.userData.cone;
  const poolScale = opts.poolScale ?? glow.userData.poolScale ?? 1;
  const poolOffsetX = opts.poolOffsetX ?? glow.userData.poolOffsetX ?? 0;
  if (pool) {
    pool.scale.setScalar(poolScale);
    pool.position.set(poolOffsetX, NEON_FLOOR_GLOW_Y, 0);
  }
  if (cone) {
    cone.position.set(poolOffsetX * 0.5, NEON_FLOOR_GLOW_Y + NEON_FLOOR_GLOW_CONE_HEIGHT * 0.5, 0);
  }

  // Refresh world-space tower AABB after seating (Desktop only).
  if (glow.userData.desktopTowerClip && group) {
    syncDesktopTowerFootprintClip(glow, group);
  }
}

/**
 * Desktop: shrink pool (centered on tube foot) + clip against tower footprint.
 * Do not sideways-offset the pool — that orphaned a floating glow in open floor.
 * @param {THREE.Group} glow
 * @param {THREE.Object3D} [group] vignette group (for group-local AABB)
 */
export function applyDesktopFloorGlowClearance(glow, group = null) {
  if (!glow) return;
  glow.userData.poolScale = NEON_FLOOR_GLOW_DESKTOP_POOL_SCALE;
  glow.userData.poolOffsetX = NEON_FLOOR_GLOW_DESKTOP_POOL_OFFSET_X;
  glow.userData.desktopTowerClip = true;
  const pool = glow.userData.pool;
  const cone = glow.userData.cone;
  if (pool) {
    pool.scale.setScalar(NEON_FLOOR_GLOW_DESKTOP_POOL_SCALE);
    pool.position.set(NEON_FLOOR_GLOW_DESKTOP_POOL_OFFSET_X, NEON_FLOOR_GLOW_Y, 0);
    pool.userData.maxOpacity = NEON_FLOOR_GLOW_DESKTOP_POOL_OPACITY;
    if (pool.material?.uniforms?.uTowerClip) {
      pool.material.uniforms.uTowerClip.value = 1;
      pool.material.uniforms.uTowerFeather.value = DESKTOP_TOWER_FOOTPRINT_FEATHER;
    }
  }
  // Cone rises beside the tower silhouette — hide on Desktop (pool-only foot).
  if (cone) {
    cone.visible = false;
    cone.userData.maxOpacity = 0;
    cone.position.set(0, NEON_FLOOR_GLOW_Y + NEON_FLOOR_GLOW_CONE_HEIGHT * 0.5, 0);
  }
  if (group) syncDesktopTowerFootprintClip(glow, group);
}

/**
 * Push Desktop tower footprint (group-local) + groupWorldInverse for the pool shader.
 * Ring rotation makes world AABB from two corners wrong — clip in group space.
 * @param {THREE.Group} glow
 * @param {THREE.Object3D} group
 */
export function syncDesktopTowerFootprintClip(glow, group) {
  const pool = glow?.userData?.pool;
  const u = pool?.material?.uniforms;
  if (!u?.uTowerMinXZ || !u?.uGroupWorldInverse || !group) return;
  group.updateMatrixWorld(true);
  _groupInv.copy(group.matrixWorld).invert();
  u.uGroupWorldInverse.value.copy(_groupInv);
  const fp = DESKTOP_TOWER_FOOTPRINT;
  u.uTowerMinXZ.value.set(fp.minX, fp.minZ);
  u.uTowerMaxXZ.value.set(fp.maxX, fp.maxZ);
  u.uTowerClip.value = 1;
  u.uTowerFeather.value = DESKTOP_TOWER_FOOTPRINT_FEATHER;
}

/**
 * @param {THREE.Group} glow
 * @param {number} level 0–1 neon intensity
 * @param {THREE.Color} [color]
 */
export function setNeonFloorGlowLevel(glow, level, color) {
  if (!glow) return;
  const u = Math.max(0, Math.min(1, level));
  const pool = glow.userData.pool;
  const cone = glow.userData.cone;
  let any = false;
  for (const mesh of [pool, cone]) {
    if (!mesh?.material) continue;
    const max = mesh.userData.maxOpacity ?? 0.3;
    const opac = u * max;
    const mat = mesh.material;
    if (mat.uniforms?.uOpacity) {
      mat.uniforms.uOpacity.value = opac;
      if (color && mat.uniforms.uColor) mat.uniforms.uColor.value.copy(color);
    } else {
      mat.opacity = opac;
      if (color) mat.color.copy(color);
    }
    mesh.visible = opac > 1e-4;
    any = any || mesh.visible;
  }
  glow.visible = any;
}
