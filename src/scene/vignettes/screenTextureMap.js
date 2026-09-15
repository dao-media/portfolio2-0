import * as THREE from "three";

/**
 * pc-from-source.glb CRT face — matches production retropc-scene (CanvasTexture flipY: false).
 * Canvas row 0 (top) maps to low mesh V at the top of the monitor.
 */
export const SCREEN_MAP_CRT = {
  flipY: false,
  repeatX: 1,
  repeatY: 1,
  offsetX: 0,
  offsetY: 0
};

/** Legacy pc-textured.glb — inverted V on the screen atlas. */
export const SCREEN_MAP_CRT_LEGACY = {
  flipY: false,
  repeatX: 1,
  repeatY: -1,
  offsetX: 0,
  offsetY: 1
};

/** Authored splash rotation inside the hollow window (frame stays upright). */
export const SIDEKICK_SPLASH_ROTATION_DEG = 0;

/** Sidekick SCREENIMAGE — use mesh UVs directly on the square frame atlas. */
export const SIDEKICK_SCREEN_FLIP_Y = false;

/** Sidekick SCREENIMAGE — locked map; authored mesh UVs on the square frame atlas. */
export const SIDEKICK_SCREEN_MAP = {
  flipY: SIDEKICK_SCREEN_FLIP_Y,
  center: 0.5,
  rotation: 0,
  repeatX: 1,
  repeatY: 1,
  offsetX: 0,
  offsetY: 0
};

/** Blockout monitor plane. */
export const SCREEN_MAP_PLANE = {
  flipY: false,
  repeatX: 1,
  repeatY: 1,
  offsetX: 0,
  offsetY: 0
};

/**
 * Flat CRT content quad (`PlaneGeometry`). V=0 is the bottom of the plane;
 * flipY:true puts canvas row 0 (top) at the top of the bezel opening.
 */
export const SCREEN_MAP_CRT_QUAD = {
  flipY: true,
  repeatX: 1,
  repeatY: 1,
  offsetX: 0,
  offsetY: 0
};

/** Bezel plastic that frames the CRT hole (`pc_2`). */
export const CRT_BEZEL_MESH_NAME = "pc-Mesh_1";

/** Shrink content slightly so it does not z-fight the plastic lip. */
export const CRT_CONTENT_QUAD_INSET = 0.002;

/**
 * Place the content quad just in front of the flattened phosphor plane and
 * behind the glass shell (`shellOffset` 0.006).
 */
export const CRT_CONTENT_QUAD_DEPTH = 0.0015;

export function applyScreenMapSettings(texture, map = SCREEN_MAP_CRT) {
  texture.flipY = map.flipY;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.center.set(0, 0);
  texture.rotation = 0;
  texture.repeat.set(map.repeatX, map.repeatY);
  texture.offset.set(map.offsetX, map.offsetY);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
}

function whenTextureImageReady(image) {
  if (!image) return Promise.reject(new Error("Sidekick screen texture has no image"));
  if (image.width > 0 && image.height > 0) return Promise.resolve();
  if (typeof image.complete === "boolean" && image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onDone = () => resolve();
    const onFail = () => reject(new Error("Sidekick screen texture failed to load"));
    if (typeof image.addEventListener === "function") {
      image.addEventListener("load", onDone, { once: true });
      image.addEventListener("error", onFail, { once: true });
    } else {
      reject(new Error("Sidekick screen texture image is not ready"));
    }
  });
}

/**
 * Crop the authored atlas island (mesh UV bounds) into a dedicated 0–1 texture.
 * @param {THREE.Texture} sourceTexture
 * @param {{ uMin: number, uMax: number, vMin: number, vMax: number }} bounds
 */
export function cropSidekickScreenAtlas(sourceTexture, bounds) {
  const image = sourceTexture.image;
  const width = image.width ?? image.naturalWidth;
  const height = image.height ?? image.naturalHeight;
  const uSpan = bounds.uMax - bounds.uMin || 1;
  const vSpan = bounds.vMax - bounds.vMin || 1;

  const cropW = Math.max(1, Math.round(uSpan * width));
  const cropH = Math.max(1, Math.round(vSpan * height));
  const srcX = bounds.uMin * width;
  // flipY:false — GL V=0 is the bottom of the image; canvas Y=0 is the top.
  const srcY = (1 - bounds.vMax) * height;

  const canvas = document.createElement("canvas");
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");

  const rotationRad = SIDEKICK_SCREEN_MAP.rotation;
  if (rotationRad !== 0) {
    ctx.translate(cropW * 0.5, cropH * 0.5);
    ctx.rotate(rotationRad);
    ctx.drawImage(
      image,
      srcX,
      srcY,
      uSpan * width,
      vSpan * height,
      -cropW * 0.5,
      -cropH * 0.5,
      cropW,
      cropH
    );
  } else {
    ctx.drawImage(image, srcX, srcY, uSpan * width, vSpan * height, 0, 0, cropW, cropH);
  }

  const cropped = new THREE.CanvasTexture(canvas);
  cropped.colorSpace = sourceTexture.colorSpace ?? THREE.SRGBColorSpace;
  cropped.flipY = SIDEKICK_SCREEN_FLIP_Y;
  cropped.wrapS = THREE.ClampToEdgeWrapping;
  cropped.wrapT = THREE.ClampToEdgeWrapping;
  cropped.matrixAutoUpdate = false;
  cropped.updateMatrix();
  cropped.needsUpdate = true;
  return cropped;
}

function remapGeometryUvToUnitSquare(geometry, bounds) {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;

  const uSpan = bounds.uMax - bounds.uMin || 1;
  const vSpan = bounds.vMax - bounds.vMin || 1;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(
      i,
      (uv.getX(i) - bounds.uMin) / uSpan,
      (uv.getY(i) - bounds.vMin) / vSpan
    );
  }
  uv.needsUpdate = true;
  return geometry;
}

const SIDEKICK_UV_ZERO_EPS = 1e-3;

export function isSidekickDegenerateUv(u, v) {
  return Math.abs(u) < SIDEKICK_UV_ZERO_EPS && Math.abs(v) < SIDEKICK_UV_ZERO_EPS;
}

/** UV bounds from verts that index the screen island — ignores (0,0) fillers. */
export function computeSidekickValidUvBounds(geometry) {
  const uv = geometry.attributes?.uv;
  if (!uv) return null;

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  let found = false;

  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (isSidekickDegenerateUv(u, v)) continue;
    found = true;
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
  }

  if (!found) return computeScreenUvBounds({ geometry });
  return { uMin, uMax, vMin, vMax };
}

/** Remap authored Sidekick UV island to 0–1; park filler verts at the island center. */
export function remapSidekickScreenUvs(geometry, bounds = null) {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;

  const island = bounds ?? computeSidekickValidUvBounds(geometry);
  if (!island) return geometry;

  const uSpan = island.uMax - island.uMin || 1;
  const vSpan = island.vMax - island.vMin || 1;

  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (isSidekickDegenerateUv(u, v)) {
      uv.setXY(i, 0.5, 0.5);
      continue;
    }
    uv.setXY(i, (u - island.uMin) / uSpan, (v - island.vMin) / vSpan);
  }

  uv.needsUpdate = true;
  return geometry;
}

export function applySidekickScreenMapSettings(texture, map = SIDEKICK_SCREEN_MAP) {
  applySidekickDisplayOrientation(texture, map);
}

/**
 * Lock the LCD atlas to authored mesh UVs — the screen rig handles swivel orientation.
 * @param {THREE.Texture} texture
 * @param {typeof SIDEKICK_SCREEN_MAP} [map]
 * @param {{ rotation?: number }} [orientation] — extra atlas spin (e.g. closed rolodex flip)
 */
export function applySidekickDisplayOrientation(
  texture,
  map = SIDEKICK_SCREEN_MAP,
  orientation = null
) {
  const center = map.center ?? 0.5;
  const nextRotation = orientation?.rotation ?? map.rotation;
  const nextFlipY = map.flipY;
  const nextRepeatX = map.repeatX;
  const nextRepeatY = map.repeatY;
  const nextOffsetX = map.offsetX;
  const nextOffsetY = map.offsetY;

  const unchanged =
    texture.flipY === nextFlipY &&
    texture.rotation === nextRotation &&
    texture.center.x === center &&
    texture.center.y === center &&
    texture.repeat.x === nextRepeatX &&
    texture.repeat.y === nextRepeatY &&
    texture.offset.x === nextOffsetX &&
    texture.offset.y === nextOffsetY;

  texture.flipY = nextFlipY;
  texture.center.set(center, center);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.matrixAutoUpdate = false;
  texture.rotation = nextRotation;
  texture.repeat.set(nextRepeatX, nextRepeatY);
  texture.offset.set(nextOffsetX, nextOffsetY);
  texture.updateMatrix();

  // Avoid forced GPU re-uploads when the map transform didn't change.
  if (!unchanged) texture.needsUpdate = true;
}

/** @deprecated Use applySidekickScreenTexture from sidekickScreenTexture.js */
export { applySidekickScreenTexture as alignSidekickScreenTexture } from "./sidekickScreenTexture.js";

/** @deprecated Use ensureSidekickScreenMapLocked from sidekickScreenTexture.js */
export { ensureSidekickScreenMapLocked as lockSidekickScreenTexture } from "./sidekickScreenTexture.js";

/** UV bounds of the CRT face on the loaded GLB (not a full 0–1 atlas). */
export function computeScreenUvBounds(mesh) {
  const uv = mesh.geometry?.attributes?.uv;
  if (!uv) return null;

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;

  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
  }

  return { uMin, uMax, vMin, vMax };
}

/**
 * CRT glass/phosphor face metrics from `pc-from-source.glb` (`pc-Mesh_2` / `pc_3`).
 * UVs are a near-unit island (Path 1). Canvas size follows face aspect so a
 * square in the texture reads square on the glass.
 * @param {THREE.Mesh} mesh
 */
export function measureCrtScreenGeometry(mesh) {
  const geo = mesh?.geometry;
  const uv = geo?.attributes?.uv;
  const pos = geo?.attributes?.position;
  const nrm = geo?.attributes?.normal;
  if (!uv || !pos) {
    return { hasUv: false, usable: false, name: mesh?.name ?? null };
  }

  const bounds = computeScreenUvBounds(mesh);
  let topI = 0;
  let botI = 0;
  let leftI = 0;
  let rightI = 0;
  let topY = -Infinity;
  let botY = Infinity;
  let leftX = Infinity;
  let rightX = -Infinity;
  let nx = 0;
  let ny = 0;
  let nz = 0;

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    if (y > topY) {
      topY = y;
      topI = i;
    }
    if (y < botY) {
      botY = y;
      botI = i;
    }
    if (x < leftX) {
      leftX = x;
      leftI = i;
    }
    if (x > rightX) {
      rightX = x;
      rightI = i;
    }
    if (nrm) {
      nx += nrm.getX(i);
      ny += nrm.getY(i);
      nz += nrm.getZ(i);
    }
  }

  const width = Math.hypot(
    pos.getX(rightI) - pos.getX(leftI),
    pos.getY(rightI) - pos.getY(leftI),
    pos.getZ(rightI) - pos.getZ(leftI)
  );
  const height = Math.hypot(
    pos.getX(topI) - pos.getX(botI),
    pos.getY(topI) - pos.getY(botI),
    pos.getZ(topI) - pos.getZ(botI)
  );
  const aspect = width / Math.max(height, 1e-8);
  const inv = 1 / Math.max(pos.count, 1);
  const avgNormal = nrm
    ? new THREE.Vector3(nx * inv, ny * inv, nz * inv).normalize()
    : null;
  const uSpan = bounds.uMax - bounds.uMin;
  const vSpan = bounds.vMax - bounds.vMin;
  const unitLike =
    bounds.uMin > -0.02 &&
    bounds.vMin > -0.02 &&
    bounds.uMax < 1.02 &&
    bounds.vMax < 1.02 &&
    uSpan > 0.85 &&
    vSpan > 0.85;
  const canvasWidth = 1024;
  const canvasHeight = Math.max(1, Math.round(canvasWidth / aspect));

  return {
    hasUv: true,
    usable: unitLike,
    name: mesh.name,
    vertCount: pos.count,
    bounds,
    width,
    height,
    aspect,
    canvasWidth,
    canvasHeight,
    avgNormal,
    uvAtTop: [uv.getX(topI), uv.getY(topI)],
    uvAtBottom: [uv.getX(botI), uv.getY(botI)]
  };
}

const _flattenN = new THREE.Vector3();
const _flattenP = new THREE.Vector3();
const _flattenRim = new THREE.Vector3();
const _flattenA = new THREE.Vector3();
const _flattenB = new THREE.Vector3();
const _flattenT = new THREE.Vector3();

/**
 * Project the CRT phosphor onto the plane of its UV rim.
 * Authored glass is a bulge (~7 cm at center, rim ~12 cm back). Off-axis that
 * reads as a clockwise / TL-overhang / BR-gap vs the flat bezel hole. Path 1
 * keeps mesh UVs; we only flatten positions. Clone the curved shell first
 * (`attachCrtGlassShell`) so fresnel still follows the authored CRT.
 * @param {THREE.Mesh} mesh
 */
export function flattenCrtPhosphorToRimPlane(mesh) {
  const geo = mesh?.geometry;
  const pos = geo?.attributes?.position;
  if (!pos) return false;

  const uv = geo.attributes.uv;
  const nrm = geo.attributes.normal;
  _flattenN.set(0, 0, 0);
  if (nrm) {
    for (let i = 0; i < nrm.count; i += 1) {
      _flattenN.x += nrm.getX(i);
      _flattenN.y += nrm.getY(i);
      _flattenN.z += nrm.getZ(i);
    }
    _flattenN.multiplyScalar(1 / Math.max(nrm.count, 1)).normalize();
  } else {
    geo.computeVertexNormals();
    return flattenCrtPhosphorToRimPlane(mesh);
  }

  _flattenRim.set(0, 0, 0);
  let rimCount = 0;
  const rimUv = 0.07;
  if (uv) {
    for (let i = 0; i < pos.count; i += 1) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (u < rimUv || u > 1 - rimUv || v < rimUv || v > 1 - rimUv) {
        _flattenRim.x += pos.getX(i);
        _flattenRim.y += pos.getY(i);
        _flattenRim.z += pos.getZ(i);
        rimCount += 1;
      }
    }
  }
  if (rimCount < 8) {
    _flattenRim.set(0, 0, 0);
    for (let i = 0; i < pos.count; i += 1) {
      _flattenRim.x += pos.getX(i);
      _flattenRim.y += pos.getY(i);
      _flattenRim.z += pos.getZ(i);
    }
    rimCount = pos.count;
  }
  _flattenRim.multiplyScalar(1 / Math.max(rimCount, 1));

  // Plane normal from the rim itself (not the bulge's average vertex
  // normal) so the phosphor sits in the bezel opening, not the CRT curve.
  let bestA = 0;
  for (let i = 0; i < pos.count; i += 1) {
    if (uv) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (!(u < rimUv || u > 1 - rimUv || v < rimUv || v > 1 - rimUv)) continue;
    }
    _flattenP.set(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(_flattenRim);
    const d = _flattenP.lengthSq();
    if (d > bestA) {
      bestA = d;
      _flattenA.copy(_flattenP);
    }
  }
  let bestB = 0;
  for (let i = 0; i < pos.count; i += 1) {
    if (uv) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (!(u < rimUv || u > 1 - rimUv || v < rimUv || v > 1 - rimUv)) continue;
    }
    _flattenP.set(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(_flattenRim);
    _flattenT.copy(_flattenA).cross(_flattenP);
    const area = _flattenT.lengthSq();
    if (area > bestB) {
      bestB = area;
      _flattenB.copy(_flattenP);
    }
  }
  if (bestA > 1e-12 && bestB > 1e-12) {
    _flattenN.copy(_flattenA).cross(_flattenB);
    if (_flattenN.lengthSq() > 1e-12) {
      _flattenN.normalize();
      if (nrm) {
        _flattenT.set(0, 0, 0);
        for (let i = 0; i < nrm.count; i += 1) {
          _flattenT.x += nrm.getX(i);
          _flattenT.y += nrm.getY(i);
          _flattenT.z += nrm.getZ(i);
        }
        if (_flattenT.dot(_flattenN) < 0) _flattenN.multiplyScalar(-1);
      }
    }
  }

  for (let i = 0; i < pos.count; i += 1) {
    _flattenP.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const depth = _flattenP.sub(_flattenRim).dot(_flattenN);
    _flattenP.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    _flattenP.addScaledVector(_flattenN, -depth);
    pos.setXYZ(i, _flattenP.x, _flattenP.y, _flattenP.z);
    nrm.setXYZ(i, _flattenN.x, _flattenN.y, _flattenN.z);
  }

  pos.needsUpdate = true;
  nrm.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return true;
}

const _openingCenter = new THREE.Vector3();
const _openingN = new THREE.Vector3();
const _openingR = new THREE.Vector3();
const _openingU = new THREE.Vector3();
const _openingP = new THREE.Vector3();
const _openingT = new THREE.Vector3();
const _bezelToScreen = new THREE.Matrix4();
const _screenInv = new THREE.Matrix4();

function _percentile(sortedOrRaw, q) {
  if (!sortedOrRaw.length) return null;
  const s = [...sortedOrRaw].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
}

/**
 * Measure the rectangular CRT bezel opening in screen-local space.
 * Call after `flattenCrtPhosphorToRimPlane` so the basis matches the live face.
 *
 * Asymmetric CRT cavity: L/R/B lips from `pc-Mesh_1` outside the phosphor AABB;
 * top brow is flush with the phosphor (no bezel verts above in the screen span).
 *
 * @param {THREE.Mesh} screenMesh `pc-Mesh_2`
 * @param {THREE.Mesh} bezelMesh `pc-Mesh_1`
 * @returns {null | {
 *   ok: true,
 *   method: string,
 *   width: number,
 *   height: number,
 *   aspect: number,
 *   uMin: number, uMax: number, vMin: number, vMax: number,
 *   centerU: number, centerV: number,
 *   center: THREE.Vector3,
 *   normal: THREE.Vector3,
 *   right: THREE.Vector3,
 *   up: THREE.Vector3,
 *   canvasWidth: number,
 *   canvasHeight: number,
 *   insetVsScreen: { left: number, right: number, bot: number, top: number },
 *   contentWidth: number,
 *   contentHeight: number
 * }}
 */
export function measureCrtBezelOpening(screenMesh, bezelMesh) {
  const sPos = screenMesh?.geometry?.attributes?.position;
  const sNrm = screenMesh?.geometry?.attributes?.normal;
  const bPos = bezelMesh?.geometry?.attributes?.position;
  if (!sPos || !bPos || !screenMesh.isMesh || !bezelMesh.isMesh) return null;

  screenMesh.updateMatrixWorld(true);
  bezelMesh.updateMatrixWorld(true);

  _openingCenter.set(0, 0, 0);
  _openingN.set(0, 0, 0);
  for (let i = 0; i < sPos.count; i += 1) {
    _openingCenter.x += sPos.getX(i);
    _openingCenter.y += sPos.getY(i);
    _openingCenter.z += sPos.getZ(i);
    if (sNrm) {
      _openingN.x += sNrm.getX(i);
      _openingN.y += sNrm.getY(i);
      _openingN.z += sNrm.getZ(i);
    }
  }
  _openingCenter.multiplyScalar(1 / Math.max(sPos.count, 1));
  if (_openingN.lengthSq() < 1e-12) {
    screenMesh.geometry.computeVertexNormals();
    return measureCrtBezelOpening(screenMesh, bezelMesh);
  }
  _openingN.normalize();
  if (_openingN.z < 0) _openingN.multiplyScalar(-1);

  _openingT.set(0, 1, 0);
  _openingR.copy(_openingT).cross(_openingN);
  if (_openingR.lengthSq() < 1e-12) {
    _openingT.set(1, 0, 0);
    _openingR.copy(_openingT).cross(_openingN);
  }
  _openingR.normalize();
  _openingU.copy(_openingN).cross(_openingR).normalize();

  _screenInv.copy(screenMesh.matrixWorld).invert();
  _bezelToScreen.multiplyMatrices(_screenInv, bezelMesh.matrixWorld);

  let sUMin = Infinity;
  let sUMax = -Infinity;
  let sVMin = Infinity;
  let sVMax = -Infinity;
  let sDMax = -Infinity;
  for (let i = 0; i < sPos.count; i += 1) {
    _openingP.set(sPos.getX(i), sPos.getY(i), sPos.getZ(i)).sub(_openingCenter);
    const u = _openingP.dot(_openingR);
    const v = _openingP.dot(_openingU);
    const d = _openingP.dot(_openingN);
    sUMin = Math.min(sUMin, u);
    sUMax = Math.max(sUMax, u);
    sVMin = Math.min(sVMin, v);
    sVMax = Math.max(sVMax, v);
    sDMax = Math.max(sDMax, d);
  }

  const allPts = [];
  for (let i = 0; i < bPos.count; i += 1) {
    _openingP
      .set(bPos.getX(i), bPos.getY(i), bPos.getZ(i))
      .applyMatrix4(_bezelToScreen)
      .sub(_openingCenter);
    allPts.push({
      u: _openingP.dot(_openingR),
      v: _openingP.dot(_openingU),
      d: _openingP.dot(_openingN)
    });
  }

  const band = Math.max(sUMax - sUMin, sVMax - sVMin) * 0.7;
  const vSlack = (sVMax - sVMin) * 0.45;
  const uSlack = (sUMax - sUMin) * 0.45;
  const pool = allPts.filter((p) => p.d > sDMax - 0.02);
  const lipPool = pool.length > 100 ? pool : allPts;

  const right = lipPool.filter(
    (p) => p.u > sUMax && p.u < sUMax + band && p.v > sVMin - vSlack && p.v < sVMax + vSlack
  );
  const left = lipPool.filter(
    (p) => p.u < sUMin && p.u > sUMin - band && p.v > sVMin - vSlack && p.v < sVMax + vSlack
  );
  const bot = lipPool.filter(
    (p) => p.v < sVMin && p.v > sVMin - band && p.u > sUMin - uSlack && p.u < sUMax + uSlack
  );

  const rightU = _percentile(
    right.map((p) => p.u),
    0.08
  );
  const leftU = _percentile(
    left.map((p) => p.u),
    0.92
  );
  const botV = _percentile(
    bot.map((p) => p.v),
    0.92
  );
  if (rightU == null || leftU == null || botV == null) return null;

  const browSpan = allPts.filter(
    (p) => p.u >= leftU && p.u <= rightU && p.v > sVMax - 0.04 && p.d > -0.05
  );
  const topV = browSpan.length
    ? (_percentile(
        browSpan.map((p) => p.v),
        0.95
      ) ?? sVMax)
    : sVMax;

  const width = rightU - leftU;
  const height = topV - botV;
  const aspect = width / Math.max(height, 1e-8);
  const insetVsScreen = {
    left: sUMin - leftU,
    right: rightU - sUMax,
    bot: sVMin - botV,
    top: topV - sVMax
  };

  const ok =
    width > 0.2 &&
    height > 0.15 &&
    aspect > 1.15 &&
    aspect < 1.45 &&
    insetVsScreen.left > 0.01 &&
    insetVsScreen.right > 0.01 &&
    insetVsScreen.bot > 0.01 &&
    insetVsScreen.top > -0.005 &&
    right.length >= 8 &&
    left.length >= 8 &&
    bot.length >= 8;

  if (!ok) return null;

  const canvasWidth = 1024;
  const canvasHeight = Math.max(1, Math.round(canvasWidth / aspect));
  const contentWidth = Math.max(0.01, width - 2 * CRT_CONTENT_QUAD_INSET);
  const contentHeight = Math.max(0.01, height - 2 * CRT_CONTENT_QUAD_INSET);

  return {
    ok: true,
    method: "asymmetric-cavity-L/R/B-lips + top-brow-or-phosphor",
    width,
    height,
    aspect,
    uMin: leftU,
    uMax: rightU,
    vMin: botV,
    vMax: topV,
    centerU: (leftU + rightU) * 0.5,
    centerV: (botV + topV) * 0.5,
    center: _openingCenter.clone(),
    normal: _openingN.clone(),
    right: _openingR.clone(),
    up: _openingU.clone(),
    canvasWidth,
    canvasHeight,
    insetVsScreen,
    contentWidth,
    contentHeight,
    counts: { right: right.length, left: left.length, bot: bot.length, brow: browSpan.length }
  };
}

/**
 * Rounded-rect plane in XY (faces +Z). UVs 0–1 over the full rect.
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 * @param {number} [segments]
 */
export function createRoundedRectPlaneGeometry(width, height, radius, segments = 8) {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const r = Math.min(radius, hw * 0.45, hh * 0.45);
  const pts = [];

  const arc = (cx, cy, a0, a1) => {
    for (let i = 0; i <= segments; i += 1) {
      const t = a0 + (a1 - a0) * (i / segments);
      pts.push(new THREE.Vector2(cx + r * Math.cos(t), cy + r * Math.sin(t)));
    }
  };

  arc(-hw + r, -hh + r, Math.PI, Math.PI * 1.5);
  arc(hw - r, -hh + r, Math.PI * 1.5, Math.PI * 2);
  arc(hw - r, hh - r, 0, Math.PI * 0.5);
  arc(-hw + r, hh - r, Math.PI * 0.5, Math.PI);

  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) shape.lineTo(pts[i].x, pts[i].y);
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  // Remap UVs to full 0–1 over the rect (ShapeGeometry uses shape coords).
  const uv = geometry.attributes.uv;
  const pos = geometry.attributes.position;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, (pos.getX(i) + hw) / width, (pos.getY(i) + hh) / height);
  }
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Screen-local basis from the (flattened) phosphor mesh — matches Blender measure space.
 * @param {THREE.Mesh} screenMesh
 */
export function measureCrtScreenBasis(screenMesh) {
  const pos = screenMesh?.geometry?.attributes?.position;
  const nrm = screenMesh?.geometry?.attributes?.normal;
  if (!pos) return null;

  _openingCenter.set(0, 0, 0);
  _openingN.set(0, 0, 0);
  for (let i = 0; i < pos.count; i += 1) {
    _openingCenter.x += pos.getX(i);
    _openingCenter.y += pos.getY(i);
    _openingCenter.z += pos.getZ(i);
    if (nrm) {
      _openingN.x += nrm.getX(i);
      _openingN.y += nrm.getY(i);
      _openingN.z += nrm.getZ(i);
    }
  }
  _openingCenter.multiplyScalar(1 / Math.max(pos.count, 1));
  if (_openingN.lengthSq() < 1e-12) {
    screenMesh.geometry.computeVertexNormals();
    return measureCrtScreenBasis(screenMesh);
  }
  _openingN.normalize();
  if (_openingN.z < 0) _openingN.multiplyScalar(-1);

  _openingT.set(0, 1, 0);
  _openingR.copy(_openingT).cross(_openingN);
  if (_openingR.lengthSq() < 1e-12) {
    _openingT.set(1, 0, 0);
    _openingR.copy(_openingT).cross(_openingN);
  }
  _openingR.normalize();
  _openingU.copy(_openingN).cross(_openingR).normalize();

  return {
    center: _openingCenter.clone(),
    normal: _openingN.clone(),
    right: _openingR.clone(),
    up: _openingU.clone()
  };
}

/**
 * Build the Blender-authored bezel content plane (1 cm inset, rounded corners).
 * Parent under the phosphor mesh; pose from live screen basis + CRT_CONTENT_PLANE.
 *
 * @param {THREE.Mesh} screenMesh flattened phosphor
 * @param {THREE.Material} material
 * @param {typeof import('./crtBezelOpening.js').CRT_CONTENT_PLANE} [spec]
 * @returns {THREE.Mesh | null}
 */
export function createCrtContentQuadFromSpec(screenMesh, material, spec) {
  const basis = measureCrtScreenBasis(screenMesh);
  if (!basis || !spec) return null;

  const geometry = createRoundedRectPlaneGeometry(
    spec.width,
    spec.height,
    spec.cornerRadius ?? 0.012
  );
  const quad = new THREE.Mesh(geometry, material);
  quad.name = "crt-content-quad";
  quad.renderOrder = 2;
  quad.frustumCulled = false;

  _openingP
    .copy(basis.center)
    .addScaledVector(basis.right, spec.centerU)
    .addScaledVector(basis.up, spec.centerV)
    .addScaledVector(basis.normal, spec.depth ?? CRT_CONTENT_QUAD_DEPTH);
  quad.position.copy(_openingP);

  const m = new THREE.Matrix4().makeBasis(basis.right, basis.up, basis.normal);
  quad.quaternion.setFromRotationMatrix(m);
  return quad;
}

/**
 * Build a flat content quad sized to a runtime-measured bezel opening.
 * @param {NonNullable<ReturnType<typeof measureCrtBezelOpening>>} opening
 * @param {THREE.Material} material
 * @returns {THREE.Mesh}
 */
export function createCrtContentQuad(opening, material) {
  const geometry = new THREE.PlaneGeometry(opening.contentWidth, opening.contentHeight);
  const quad = new THREE.Mesh(geometry, material);
  quad.name = "crt-content-quad";
  quad.renderOrder = 2;
  quad.frustumCulled = false;

  _openingP
    .copy(opening.center)
    .addScaledVector(opening.right, opening.centerU)
    .addScaledVector(opening.up, opening.centerV)
    .addScaledVector(opening.normal, CRT_CONTENT_QUAD_DEPTH);
  quad.position.copy(_openingP);

  const basis = new THREE.Matrix4().makeBasis(opening.right, opening.up, opening.normal);
  quad.quaternion.setFromRotationMatrix(basis);
  return quad;
}

/**
 * Pixel rect on the canvas texture that maps to the visible CRT face.
 * MySpace interior padding is measured from this window — not UV zoom.
 */
export function computeScreenWindowRect(width, height, bounds = null, map = SCREEN_MAP_PLANE) {
  if (!bounds) {
    return { x: 0, y: 0, w: width, h: height };
  }

  const corners = [
    { x: bounds.uMin, y: bounds.vMin },
    { x: bounds.uMax, y: bounds.vMin },
    { x: bounds.uMax, y: bounds.vMax },
    { x: bounds.uMin, y: bounds.vMax }
  ].map((uv) => screenUvToCanvas(uv, width, height, bounds, map));

  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);

  return {
    x: x0,
    y: y0,
    w: Math.max(1, x1 - x0),
    h: Math.max(1, y1 - y0)
  };
}

/**
 * Pick the screen texture map for a loaded monitor mesh.
 * pc-from-source uses standard UVs + flipY:false (production path).
 */
export function deriveCrtScreenMap(mesh) {
  const bounds = computeScreenUvBounds(mesh);
  if (!bounds) return SCREEN_MAP_CRT;

  const pos = mesh.geometry?.attributes?.position;
  const uv = mesh.geometry?.attributes?.uv;
  if (!pos || !uv) return SCREEN_MAP_CRT;

  let topV = null;
  let bottomV = null;
  let topY = -Infinity;
  let bottomY = Infinity;

  for (let i = 0; i < uv.count; i += 1) {
    const y = pos.getY(i);
    const v = uv.getY(i);
    if (y > topY) {
      topY = y;
      topV = v;
    }
    if (y < bottomY) {
      bottomY = y;
      bottomV = v;
    }
  }

  if (topV === null || bottomV === null) return SCREEN_MAP_CRT;
  return topV < bottomV ? SCREEN_MAP_CRT : SCREEN_MAP_CRT_LEGACY;
}

/**
 * Map raycast UV on the monitor mesh to canvas pixel coordinates (Canvas2D space, origin top-left).
 */
export function screenUvToCanvas(uv, width, height, bounds = null, map = SCREEN_MAP_PLANE) {
  let u = uv.x;
  let v = uv.y;

  if (bounds) {
    const uSpan = bounds.uMax - bounds.uMin || 1;
    const vSpan = bounds.vMax - bounds.vMin || 1;
    u = (uv.x - bounds.uMin) / uSpan;
    v = (uv.y - bounds.vMin) / vSpan;
  }

  const sampleU = map.offsetX + map.repeatX * u;
  let sampleV = map.offsetY + map.repeatY * v;

  if (map.repeatY < 0) {
    sampleV = map.offsetY + map.repeatY * v;
    return {
      x: sampleU * width,
      y: sampleV * height
    };
  }

  if (map.flipY === false) {
    return {
      x: sampleU * width,
      y: sampleV * height
    };
  }

  return {
    x: sampleU * width,
    y: (1 - sampleV) * height
  };
}
