import * as THREE from "three";

export const SCREEN_MATERIAL_NAME = "pc_3";
const TEXTURE_DIR = "/assets/models/pc-source/";

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
  pc_1: { roughness: 0.52, metalness: 0.02 },
  pc_2: { roughness: 0.46, metalness: 0.03 },
  cable_black: { roughness: 0.4, metalness: 0.06 }
};

const MATERIAL_ENV_INTENSITY = {
  pc_1: 0.58,
  pc_2: 0.52,
  cable_black: 0.12
};

const MATERIAL_CLEARCOAT = {
  pc_1: { clearcoat: 0.11, clearcoatRoughness: 0.42 },
  pc_2: { clearcoat: 0.11, clearcoatRoughness: 0.42 },
  cable_black: { clearcoat: 0.04, clearcoatRoughness: 0.48 }
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
    const loader = new THREE.TextureLoader();
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

function buildPbrMaterial(params, matName) {
  const cc = getMaterialClearcoat(matName);
  params.envMapIntensity = getMaterialEnvIntensity(matName);
  params.clearcoat = cc.clearcoat;
  params.clearcoatRoughness = cc.clearcoatRoughness;

  const mat = new THREE.MeshPhysicalMaterial(params);
  mat.name = matName;
  if (mat.normalMap) mat.normalScale.set(1, 1);
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
      tex.anisotropy = maxAniso;
      if (slot === "map") {
        tex.colorSpace = THREE.SRGBColorSpace;
        hasColor = true;
      } else {
        tex.colorSpace = THREE.NoColorSpace;
      }
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

function applyPlasticColorGrade(mat) {
  if (!mat.map || mat.name === SCREEN_MATERIAL_NAME || resolveMaterialName(mat.name) === "cable_black") return;

  mat.onBeforeCompile = (shader) => {
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

  mat.customProgramCacheKey = () => "plastic-color-grade-v2";
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
  if (mat.normalMap) mat.normalScale.set(1, 1);
  mat.envMapIntensity = getMaterialEnvIntensity(matName);

  const cc = getMaterialClearcoat(matName);
  mat.clearcoat = cc.clearcoat;
  mat.clearcoatRoughness = cc.clearcoatRoughness;

  applyPlasticColorGrade(mat);

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
  batchSize = 2
) {
  await preloadPcTextures();

  const meshes = [];
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.frustumCulled = false;
    meshes.push(obj);
  });

  for (let i = 0; i < meshes.length; i += 1) {
    await enhanceMeshMaterial(meshes[i], renderer);
    if ((i + 1) % batchSize === 0) {
      await yieldFrame();
    }
  }
}
