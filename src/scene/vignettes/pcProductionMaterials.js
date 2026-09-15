import * as THREE from "three";
import { tagFrame } from "../stage/frameBudget.js";

export const SCREEN_MATERIAL_NAME = "pc_3";
const TEXTURE_DIR = "/assets/models/pc-source/";

/** Shared with the stage load gate so PC maps count toward boot progress. */
let textureLoadingManager = null;

/** @param {THREE.LoadingManager | null} manager */
export function setPcTextureLoadingManager(manager) {
  textureLoadingManager = manager;
}

/** Curled cords share the black cable texture set with the main power cord. */
const MATERIAL_ALIASES = {
  cable: "cable_black"
};

const MATERIAL_TEXTURE_SETS = {
  pc_1: {
    map: "pc_albedo1.png",
    normalMap: "pc_normal1.png",
    roughnessMap: "pc_roughness1.png"
  },
  pc_2: {
    map: "pc_albedo2.png",
    normalMap: "pc_normal2.png",
    roughnessMap: "pc_roughness2.png"
  },
  cable_black: {
    map: "pc_cables_black_albedo.png",
    normalMap: "pc_cables_normal.png",
    roughnessMap: "pc_cables_roughness.png"
  }
};

const MATERIAL_TINT = {
  pc_1: 0xc8ccd0,
  pc_2: 0xbec2c6,
  cable_black: 0x161618
};

const MATERIAL_PBR = {
  pc_1: { roughness: 0.58, metalness: 0.02 },
  pc_2: { roughness: 0.52, metalness: 0.03 },
  cable_black: { roughness: 0.45, metalness: 0.06 }
};

/** Full-strength 4K normals shimmer under POV spot (no MSAA on HalfFloat composer). */
const MATERIAL_NORMAL_SCALE = {
  pc_1: 0.28,
  pc_2: 0.45,
  cable_black: 0.65
};

/** Raise mapped roughness so grille/speaker microfacets stop crawling. */
const MATERIAL_ROUGHNESS_FLOOR = {
  pc_1: 0.42,
  pc_2: 0.32,
  cable_black: 0.38
};

/** Extra normal-map LOD bias (speaker grille / desk weave). Higher = softer, less crawl. */
const MATERIAL_NORMAL_MIP_BIAS = {
  pc_1: 1.25,
  pc_2: 0.75,
  cable_black: 0.5
};

/** Soften high-frequency albedo weave (grille holes) — same crawl class as normals. */
const MATERIAL_MAP_MIP_BIAS = {
  pc_1: 0.85,
  pc_2: 0.35,
  cable_black: 0.25
};

const MATERIAL_ENV_INTENSITY = {
  pc_1: 0.38,
  pc_2: 0.4,
  cable_black: 0.12
};

const MATERIAL_CLEARCOAT = {
  pc_1: { clearcoat: 0, clearcoatRoughness: 1 },
  pc_2: { clearcoat: 0.02, clearcoatRoughness: 0.82 },
  cable_black: { clearcoat: 0.02, clearcoatRoughness: 0.85 }
};

const MATERIAL_RENDER = {
  pc_1: { renderOrder: 0 },
  pc_2: { renderOrder: 2, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 },
  pc_3: { renderOrder: 10, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 },
  cable_black: { renderOrder: 5 }
};

const EMISSIVE_CONFIG = {
  pc_1: { map: "pc_emission1.png", color: 0x66ff55, intensity: 2.4 },
  pc_2: { map: "pc_emission2.png", color: 0xffffff, intensity: 2.8 }
};

/** Emissive maps reserved for PcPowerLed — start dark until boot drives them. */
const POWER_LED_MATERIALS = new Set(["pc_1", "pc_2"]);

const textureCache = new Map();
const materialCache = new Map();
let texturesReady = false;

function resolveMaterialName(matName) {
  return MATERIAL_ALIASES[matName] ?? matName;
}

function getMaterialEnvIntensity(matName) {
  return MATERIAL_ENV_INTENSITY[resolveMaterialName(matName)] ?? 0.35;
}

function getMaterialClearcoat(matName) {
  return MATERIAL_CLEARCOAT[resolveMaterialName(matName)] ?? { clearcoat: 0, clearcoatRoughness: 0.5 };
}

function loadTextureFile(filename) {
  if (textureCache.has(filename)) return textureCache.get(filename);

  const promise = new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader(textureLoadingManager ?? undefined);
    loader.load(
      `${TEXTURE_DIR}${filename}`,
      (tex) => {
        tex.flipY = false;
        resolve(tex);
      },
      undefined,
      reject
    );
  });

  textureCache.set(filename, promise);
  return promise;
}

export function preloadPcTextures() {
  if (texturesReady) return Promise.resolve();

  const files = new Set();
  Object.values(MATERIAL_TEXTURE_SETS).forEach((set) => {
    Object.values(set).forEach((file) => files.add(file));
  });
  Object.values(EMISSIVE_CONFIG).forEach((cfg) => files.add(cfg.map));

  return Promise.all(
    [...files].map((file) =>
      loadTextureFile(file).catch((err) => {
        console.warn("[pcProductionMaterials] Texture missing:", file, err);
        return null;
      })
    )
  ).then(() => {
    texturesReady = true;
  });
}

/**
 * After preload, upload decoded maps to the GPU so commit doesn't stall on first use.
 * @param {THREE.WebGLRenderer} [renderer]
 */
export async function warmPcTexturesOnGpu(renderer, yieldFrame) {
  await preloadPcTextures();
  if (!renderer) return;
  let n = 0;
  for (const entry of textureCache.values()) {
    try {
      const tex = entry?.then ? await entry : entry;
      if (tex?.isTexture) {
        const t0 = performance.now();
        renderer.initTexture(tex);
        tagFrame(`tex-upload:${Math.round(performance.now() - t0)}ms`);
      }
    } catch {
      /* skip missing */
    }
    n += 1;
    if (yieldFrame && n % 4 === 0) await yieldFrame();
  }
}

function getMaterialNormalScale(matName) {
  return MATERIAL_NORMAL_SCALE[resolveMaterialName(matName)] ?? 0.5;
}

function getMaterialRoughnessFloor(matName) {
  return MATERIAL_ROUGHNESS_FLOOR[resolveMaterialName(matName)] ?? 0.28;
}

function getMaterialNormalMipBias(matName) {
  return MATERIAL_NORMAL_MIP_BIAS[resolveMaterialName(matName)] ?? 0;
}

function getMaterialMapMipBias(matName) {
  return MATERIAL_MAP_MIP_BIAS[resolveMaterialName(matName)] ?? 0;
}

function configurePcTexture(tex, slot, maxAniso) {
  if (!tex) return;
  tex.anisotropy = maxAniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  if (slot === "map") {
    tex.colorSpace = THREE.SRGBColorSpace;
  } else {
    tex.colorSpace = THREE.NoColorSpace;
  }
  tex.needsUpdate = true;
}

function buildPbrMaterial(params, matName) {
  const cc = getMaterialClearcoat(matName);
  params.envMapIntensity = getMaterialEnvIntensity(matName);
  params.clearcoat = cc.clearcoat;
  params.clearcoatRoughness = cc.clearcoatRoughness;

  const mat = new THREE.MeshPhysicalMaterial(params);
  mat.name = matName;
  const n = getMaterialNormalScale(matName);
  if (mat.normalMap) mat.normalScale.set(n, n);
  applyPcMaterialShaders(mat, matName);
  return mat;
}

function createTexturedMaterial(matName, renderer) {
  const resolved = resolveMaterialName(matName);
  if (materialCache.has(resolved)) return materialCache.get(resolved);

  const set = MATERIAL_TEXTURE_SETS[resolved];
  const pbr = MATERIAL_PBR[resolved] ?? MATERIAL_PBR.pc_1;

  if (!set) {
    const fallback = Promise.resolve(
      buildPbrMaterial(
        {
          color: MATERIAL_TINT[resolved] ?? 0xc0c6cc,
          roughness: pbr.roughness,
          metalness: pbr.metalness
        },
        resolved
      )
    );
    materialCache.set(resolved, fallback);
    return fallback;
  }

  const promise = Promise.all(
    Object.entries(set).map(([slot, filename]) =>
      loadTextureFile(filename).then((tex) => ({ slot, tex }))
    )
  ).then((entries) => {
    const params = {
      color: new THREE.Color(MATERIAL_TINT[resolved] ?? 0xc0c6cc),
      side: THREE.FrontSide,
      depthWrite: true,
      depthTest: true
    };

    let hasColor = false;
    const maxAniso = renderer
      ? Math.min(8, renderer.capabilities.getMaxAnisotropy())
      : 4;

    entries.forEach(({ slot, tex }) => {
      if (!tex) return;
      params[slot] = tex;
      configurePcTexture(tex, slot, maxAniso);
      if (slot === "map") hasColor = true;
    });

    params.roughness = params.roughnessMap ? 1 : pbr.roughness;
    params.metalness = params.metalnessMap ? 1 : pbr.metalness;

    if (!hasColor) {
      params.roughness = pbr.roughness;
      params.metalness = pbr.metalness;
    }

    return buildPbrMaterial(params, resolved);
  });

  materialCache.set(resolved, promise);
  return promise;
}

function applyPcMaterialShaders(mat, matName) {
  if (!mat || mat.name === SCREEN_MATERIAL_NAME) return;
  const resolved = resolveMaterialName(matName ?? mat.name);
  const floor = getMaterialRoughnessFloor(resolved);
  const nBias = getMaterialNormalMipBias(resolved);
  const mapBias = getMaterialMapMipBias(resolved);

  const injectRoughnessFloor = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
roughnessFactor = max(roughnessFactor, ${floor.toFixed(3)});`
    );
  };

  const injectMipBiases = (shader) => {
    if (nBias > 0 && mat.normalMap) {
      const biased = `texture2D( normalMap, vNormalMapUv, ${nBias.toFixed(2)} )`;
      shader.fragmentShader = shader.fragmentShader
        .replaceAll("texture2D( normalMap, vNormalMapUv )", biased)
        .replaceAll("texture2D( normalMap, vNormalMapUv)", biased);
    }
    if (mapBias > 0 && mat.map) {
      const biased = `texture2D( map, vMapUv, ${mapBias.toFixed(2)} )`;
      shader.fragmentShader = shader.fragmentShader.replace(
        "texture2D( map, vMapUv )",
        biased
      );
    }
    if (mapBias > 0 && mat.roughnessMap) {
      const biased = `texture2D( roughnessMap, vRoughnessMapUv, ${mapBias.toFixed(2)} )`;
      shader.fragmentShader = shader.fragmentShader.replace(
        "texture2D( roughnessMap, vRoughnessMapUv )",
        biased
      );
    }
  };

  if (resolved === "cable_black") {
    mat.onBeforeCompile = (shader) => {
      injectRoughnessFloor(shader);
      injectMipBiases(shader);
    };
    mat.customProgramCacheKey = () =>
      `pc-spec-aa-v3-${resolved}-${floor}-${nBias}-${mapBias}`;
    return;
  }

  if (!mat.map) return;

  mat.onBeforeCompile = (shader) => {
    injectRoughnessFloor(shader);
    injectMipBiases(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      [
        "#include <color_fragment>",
        "{",
        "  float luma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
        "  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(luma), 0.42);",
        "  diffuseColor.r *= 0.88;",
        "  diffuseColor.g *= 0.93;",
        "  diffuseColor.b *= 1.02;",
        "}"
      ].join("\n")
    );
  };
  mat.customProgramCacheKey = () =>
    `pc-plastic-spec-aa-v3-${resolved}-${floor}-${nBias}-${mapBias}`;
}

function applyMaterialRenderSettings(mat, matName) {
  const cfg = MATERIAL_RENDER[resolveMaterialName(matName)] ?? { renderOrder: 0 };

  mat.side = THREE.FrontSide;
  mat.depthWrite = true;
  mat.depthTest = true;
  mat.polygonOffset = Boolean(cfg.polygonOffset);

  if (cfg.polygonOffset) {
    mat.polygonOffsetFactor = cfg.polygonOffsetFactor;
    mat.polygonOffsetUnits = cfg.polygonOffsetUnits;
  }
}

function polishLoadedMaterial(mat) {
  const matName = resolveMaterialName(mat.name);
  if (!matName || matName === SCREEN_MATERIAL_NAME) return mat;

  mat.emissive.setHex(0x000000);
  mat.emissiveIntensity = 0;
  mat.emissiveMap = null;

  const tint = MATERIAL_TINT[matName] ?? 0xc0c6cc;
  const pbr = MATERIAL_PBR[matName] ?? MATERIAL_PBR.pc_1;
  mat.color.setHex(tint);
  mat.roughness = mat.roughnessMap ? 1 : pbr.roughness;
  mat.metalness = mat.metalnessMap ? 1 : pbr.metalness;
  const n = getMaterialNormalScale(matName);
  if (mat.normalMap) mat.normalScale.set(n, n);
  mat.envMapIntensity = getMaterialEnvIntensity(matName);

  const cc = getMaterialClearcoat(matName);
  mat.clearcoat = cc.clearcoat;
  mat.clearcoatRoughness = cc.clearcoatRoughness;

  applyPcMaterialShaders(mat, matName);

  if (mat.transparent || mat.alphaMap || mat.alphaTest > 0) {
    mat.transparent = false;
    mat.alphaTest = 0.45;
    mat.depthWrite = true;
  }

  mat.shadowSide = THREE.FrontSide;
  applyMaterialRenderSettings(mat, matName);
  mat.needsUpdate = true;
  return mat;
}

async function applyEmissiveMaterial(mat, sourceMat) {
  const cfg = EMISSIVE_CONFIG[mat.name];
  if (!cfg) return mat;

  let tex = sourceMat?.emissiveMap ?? null;
  if (!tex) {
    try {
      tex = await loadTextureFile(cfg.map);
    } catch {
      return mat;
    }
  }

  if (tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    if (tex.flipY !== undefined) tex.flipY = false;
    mat.emissiveMap = tex;
  }

  if (POWER_LED_MATERIALS.has(mat.name)) {
    mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
  } else {
    mat.emissive.setHex(cfg.color);
    mat.emissiveIntensity = cfg.intensity;
  }
  mat.toneMapped = false;
  mat.needsUpdate = true;
  return mat;
}

async function enhanceMeshMaterial(mesh, renderer) {
  if (!mesh.isMesh || !mesh.material) return;

  const upgradeMaterial = async (sourceMat) => {
    if (sourceMat.name === SCREEN_MATERIAL_NAME) return sourceMat;

    const mat = await createTexturedMaterial(sourceMat.name, renderer);
    polishLoadedMaterial(mat);
    return applyEmissiveMaterial(mat, sourceMat);
  };

  if (Array.isArray(mesh.material)) {
    mesh.material = await Promise.all(mesh.material.map(upgradeMaterial));
    mesh.renderOrder = mesh.material.reduce((max, mat) => {
      const cfg = MATERIAL_RENDER[resolveMaterialName(mat.name)] ?? { renderOrder: 0 };
      return Math.max(max, cfg.renderOrder);
    }, 0);
    return;
  }

  if (mesh.material.name === SCREEN_MATERIAL_NAME) return;
  mesh.material = await upgradeMaterial(mesh.material);
}

/** Production texture pipeline — external maps from pc-source/, not GLB embeds. */
export async function preparePcModelMaterials(root, renderer) {
  await preparePcModelMaterialsChunked(root, renderer, async () => {});
}

/**
 * Upgrade PC materials in small batches with frame yields between groups.
 * @param {THREE.Object3D} root
 * @param {THREE.WebGLRenderer} renderer
 * @param {() => Promise<void>} yieldFrame
 * @param {number} [batchSize=2]
 */
export async function preparePcModelMaterialsChunked(
  root,
  renderer,
  yieldFrame,
  batchSize = 1
) {
  await preloadPcTextures();
  if (renderer) {
    await warmPcTexturesOnGpu(renderer, yieldFrame);
  }

  const meshes = [];
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    // Keep frustum culling on during intro; disable only after reveal if needed.
    obj.frustumCulled = true;
    meshes.push(obj);
  });

  for (let i = 0; i < meshes.length; i += 1) {
    await enhanceMeshMaterial(meshes[i], renderer);
    tagFrame("material-warm");
    if (yieldFrame && (i + 1) % Math.max(1, batchSize) === 0) {
      await yieldFrame();
    }
  }
}
