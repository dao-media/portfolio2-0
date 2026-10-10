/**
 * Pass R — version-agnostic material + lighting dump (DEV probe). Pure
 * read: takes the stage instance and a stop index, walks that stop's group
 * and reports every mesh's material fields plus the scene's lights,
 * environment and renderer output state. Kept free of imports so the same
 * file can be dropped into an old checkout and called from the page
 * (`import("/src/scene/stage/materialDump.js")`) for a commit-vs-HEAD diff.
 */

const TEX_SLOTS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap", "lightMap", "bumpMap", "displacementMap", "specularIntensityMap", "clearcoatMap"];
const SCALARS = ["roughness", "metalness", "emissiveIntensity", "envMapIntensity", "specularIntensity", "aoMapIntensity", "opacity", "transparent", "alphaTest", "depthWrite", "depthTest", "toneMapped", "side", "blending", "flatShading", "vertexColors", "fog", "clearcoat", "clearcoatRoughness", "ior", "transmission", "sheen", "reflectivity", "lightMapIntensity", "normalScale", "visible"];

const r4 = (v) => (typeof v === "number" ? +v.toFixed(4) : v);
const col = (c) => (c && typeof c.getHexString === "function" ? `#${c.getHexString()}` : null);

function texInfo(t) {
  if (!t) return null;
  const img = t.image ?? t.source?.data ?? null;
  return {
    name: t.name || null,
    uuid: t.uuid,
    size: img ? `${img.width ?? img.videoWidth ?? "?"}x${img.height ?? img.videoHeight ?? "?"}` : null,
    colorSpace: t.colorSpace ?? null,
    channel: t.channel ?? 0,
    flipY: t.flipY,
    anisotropy: t.anisotropy,
    isRenderTarget: Boolean(t.isRenderTargetTexture),
    // Chunked uploads record the GL internal format they allocated.
    chunkFormat: t.userData?.__chunkInternalFormat ?? null,
    mapping: t.mapping
  };
}

function matInfo(m) {
  const out = { type: m.type, name: m.name || null, uuid: m.uuid };
  for (const s of TEX_SLOTS) if (s in m) out[s] = texInfo(m[s]);
  out.color = col(m.color);
  out.emissive = col(m.emissive);
  out.specularColor = col(m.specularColor);
  for (const k of SCALARS) if (k in m) out[k] = k === "normalScale" ? (m[k] ? [r4(m[k].x), r4(m[k].y)] : null) : r4(m[k]);
  out.envMap = m.envMap ? { uuid: m.envMap.uuid, name: m.envMap.name || null, mapping: m.envMap.mapping } : null;
  out.envMapRotation = m.envMapRotation ? [r4(m.envMapRotation.x), r4(m.envMapRotation.y), r4(m.envMapRotation.z)] : null;
  const obc = m.onBeforeCompile;
  const src = typeof obc === "function" ? String(obc) : "";
  out.onBeforeCompile = src && !/^\s*(function\s*)?\(\)\s*\{\s*\}\s*$|onBeforeCompile\(\)\s*\{\s*\}/.test(src) ? src.slice(0, 160) : null;
  out.cacheKey = typeof m.customProgramCacheKey === "function" ? String(m.customProgramCacheKey()).slice(0, 120) : null;
  out.defines = m.defines ? { ...m.defines } : null;
  out.userData = m.userData && Object.keys(m.userData).length ? Object.keys(m.userData) : null;
  return out;
}

/**
 * @param {any} stage StageExperience instance
 * @param {number} stop vignette index
 */
export function dumpStopMaterials(stage, stop) {
  const v = stage.vignettes?.[stop];
  const root = v?.group;
  if (!root) return { error: `no stop ${stop}` };
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    meshes.push({
      mesh: o.name || o.type,
      path: pathOf(o, root),
      visible: o.visible,
      layers: o.layers?.mask,
      castShadow: o.castShadow,
      receiveShadow: o.receiveShadow,
      renderOrder: o.renderOrder,
      materials: mats.filter(Boolean).map(matInfo)
    });
  });
  return { stop, meshes, lighting: dumpLighting(stage) };
}

function pathOf(o, root) {
  const parts = [];
  for (let p = o; p && p !== root; p = p.parent) parts.push(p.name || p.type);
  return parts.reverse().join("/");
}

export function dumpLighting(stage) {
  const scene = stage.scene;
  const r = stage.renderer;
  const lights = [];
  scene?.traverse((o) => {
    if (!o.isLight) return;
    lights.push({
      type: o.type,
      name: o.name || null,
      visible: o.visible,
      color: col(o.color),
      groundColor: col(o.groundColor),
      intensity: r4(o.intensity),
      distance: r4(o.distance),
      decay: r4(o.decay),
      layers: o.layers?.mask,
      castShadow: o.castShadow,
      parent: o.parent?.name || o.parent?.type || null
    });
  });
  lights.sort((a, b) => `${a.type}${a.name}${a.parent}`.localeCompare(`${b.type}${b.name}${b.parent}`));
  const env = scene?.environment;
  return {
    lights,
    environment: env ? { uuid: env.uuid, name: env.name || null, size: env.image ? `${env.image.width}x${env.image.height}` : null, mapping: env.mapping } : null,
    environmentIntensity: r4(scene?.environmentIntensity),
    environmentRotation: scene?.environmentRotation ? [r4(scene.environmentRotation.x), r4(scene.environmentRotation.y), r4(scene.environmentRotation.z)] : null,
    background: scene?.background?.isColor ? col(scene.background) : scene?.background ? "texture" : null,
    toneMapping: r?.toneMapping,
    toneMappingExposure: r4(r?.toneMappingExposure),
    outputColorSpace: r?.outputColorSpace
  };
}
