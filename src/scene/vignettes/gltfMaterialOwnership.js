import * as THREE from "three";

/**
 * GLTF materials/textures are often shared across meshes. Mutating or disposing
 * a shared resource silently wrecks other parts of the model.
 *
 * Sidekick landmine (Sidekick3.glb): `Buttons` and `transparentCover` both
 * author as `phong3` with baseColorFactor alpha 0 + alphaMode MASK. The cover
 * is meant to be invisible, so the keypad vanishes unless we split them and
 * give the keys their own opaque chassis plastic.
 *
 * Rule: before any write to a loaded material/texture, own a private copy.
 * Never dispose the abandoned shared resource — other meshes may still use it.
 */

export const SIDEKICK_KEYPAD_MESH_NAMES = ["Buttons"];
export const SIDEKICK_COVER_MESH_NAMES = ["transparentCover"];
export const SIDEKICK_KEYPAD_DONOR_NAMES = [
  "buttonsFace",
  "bottonsSide",
  "curvedFace",
  "middlePlastic"
];
export const SIDEKICK_KEYPAD_MATERIAL_NAME = "sidekick_keypad_opaque";
export const SIDEKICK_COVER_MATERIAL_NAME = "sidekick_cover_mask";
const INVISIBLE_COVER_SOURCE_NAME = "phong3";

/**
 * Ensure `mesh.material` is exclusively owned by this mesh.
 * @param {THREE.Mesh} mesh
 * @returns {THREE.Material | THREE.Material[]}
 */
export function ownMeshMaterial(mesh) {
  if (!mesh?.isMesh || !mesh.material) return mesh?.material;

  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((mat) => cloneMaterialSafe(mat));
  } else {
    mesh.material = cloneMaterialSafe(mesh.material);
  }
  return mesh.material;
}

/**
 * @param {THREE.Material | null | undefined} material
 * @returns {THREE.Material | null | undefined}
 */
export function cloneMaterialSafe(material) {
  if (!material) return material;
  return material.clone();
}

/**
 * Clone a texture before mutating its image / filters / transforms.
 * @param {THREE.Texture | null | undefined} texture
 * @returns {THREE.Texture | null | undefined}
 */
export function ownTexture(texture) {
  if (!texture) return texture;
  const clone = texture.clone();
  clone.colorSpace = texture.colorSpace;
  return clone;
}

/** @param {THREE.Material | null | undefined} mat */
export function isInvisibleCoverMaterial(mat) {
  if (!mat) return false;
  if (mat.name === INVISIBLE_COVER_SOURCE_NAME) return true;
  if (mat.name === SIDEKICK_COVER_MATERIAL_NAME) return true;
  const opacity = Number.isFinite(mat.opacity) ? mat.opacity : 1;
  const alphaTest = Number.isFinite(mat.alphaTest) ? mat.alphaTest : 0;
  return alphaTest > 0 && opacity < 0.05;
}

/**
 * Keypad is healthy when it owns the opaque pinned plastic — ignore mid-fade
 * opacity on that same material (intro reveal animates it).
 * @param {THREE.Mesh | null | undefined} mesh
 */
export function isSidekickKeypadMeshHealthy(mesh) {
  if (!mesh?.isMesh || mesh.visible === false) return false;
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!mat) return false;
  if (isInvisibleCoverMaterial(mat)) return false;
  if (mat.userData?.sidekickKeypadProtected && mat.name === SIDEKICK_KEYPAD_MATERIAL_NAME) {
    return true;
  }
  return false;
}

/**
 * Split the Sidekick keypad off the invisible shared cover material.
 * Idempotent. Call as soon as `phoneRoot` exists, then again after any later
 * material pass (reveal fade, label swap). `ensureSidekickKeypadMaterials`
 * re-runs this if something assigns phong3 back onto the keys.
 * @param {THREE.Object3D | null | undefined} phoneRoot
 */
export function repairSidekickKeypadMaterials(phoneRoot) {
  if (!phoneRoot) return [];

  const donor = SIDEKICK_KEYPAD_DONOR_NAMES.map((name) => phoneRoot.getObjectByName(name)).find(
    (obj) => obj?.isMesh
  );
  const donorMat = donor?.isMesh
    ? Array.isArray(donor.material)
      ? donor.material[0]
      : donor.material
    : null;

  const cover = SIDEKICK_COVER_MESH_NAMES.map((name) => phoneRoot.getObjectByName(name)).find(
    (obj) => obj?.isMesh
  );
  const coverMats = new Set();
  if (cover?.isMesh) {
    const mats = Array.isArray(cover.material) ? cover.material : [cover.material];
    mats.forEach((mat) => {
      if (mat) coverMats.add(mat);
    });
  }

  const keypadMeshes = [];
  phoneRoot.traverse((obj) => {
    if (!obj.isMesh) return;
    if (SIDEKICK_COVER_MESH_NAMES.includes(obj.name)) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const namedKeypad = SIDEKICK_KEYPAD_MESH_NAMES.includes(obj.name);
    const onCoverMat = mats.some((mat) => mat && (coverMats.has(mat) || isInvisibleCoverMaterial(mat)));
    if (namedKeypad || onCoverMat) keypadMeshes.push(obj);
  });

  for (const mesh of keypadMeshes) {
    const pinned = mesh.userData.sidekickKeypadMaterial;
    if (pinned && pinned.name === SIDEKICK_KEYPAD_MATERIAL_NAME && mesh.material === pinned) {
      continue;
    }
    const keypad = pinned?.name === SIDEKICK_KEYPAD_MATERIAL_NAME ? pinned : createKeypadMaterial(donorMat);
    pinKeypadMaterial(mesh, keypad);
  }

  if (cover?.isMesh) isolateCoverMaterial(cover);

  return keypadMeshes;
}

/**
 * Cheap watchdog — restore the keypad if anything reassigned phong3 / cover mat.
 * Safe to call every frame.
 * @param {THREE.Object3D | null | undefined} phoneRoot
 * @returns {boolean} true when every keypad mesh is healthy
 */
export function ensureSidekickKeypadMaterials(phoneRoot) {
  if (!phoneRoot) return false;

  let needsRepair = false;
  phoneRoot.traverse((obj) => {
    if (!obj.isMesh) return;
    const pinned = obj.userData.sidekickKeypadMaterial;
    if (pinned && obj.material !== pinned) {
      const current = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (isInvisibleCoverMaterial(current) || current?.name === INVISIBLE_COVER_SOURCE_NAME) {
        obj.material = pinned;
        obj.visible = true;
        return;
      }
    }
    if (SIDEKICK_KEYPAD_MESH_NAMES.includes(obj.name) && !isSidekickKeypadMeshHealthy(obj)) {
      needsRepair = true;
    }
    if (!SIDEKICK_COVER_MESH_NAMES.includes(obj.name) && isInvisibleCoverMaterial(
      Array.isArray(obj.material) ? obj.material[0] : obj.material
    )) {
      needsRepair = true;
    }
  });

  if (needsRepair) repairSidekickKeypadMaterials(phoneRoot);

  const named = SIDEKICK_KEYPAD_MESH_NAMES.map((name) => phoneRoot.getObjectByName(name)).filter(
    (obj) => obj?.isMesh
  );
  return named.length > 0 && named.every(isSidekickKeypadMeshHealthy);
}

/**
 * @param {THREE.Object3D | null | undefined} phoneRoot
 */
export function debugSidekickKeypad(phoneRoot) {
  const buttons = phoneRoot?.getObjectByName?.("Buttons");
  const cover = phoneRoot?.getObjectByName?.("transparentCover");
  const buttonMat = buttons?.isMesh
    ? Array.isArray(buttons.material)
      ? buttons.material[0]
      : buttons.material
    : null;
  const coverMat = cover?.isMesh
    ? Array.isArray(cover.material)
      ? cover.material[0]
      : cover.material
    : null;

  return {
    buttonsFound: Boolean(buttons?.isMesh),
    buttonsVisible: Boolean(buttons?.visible),
    buttonsMaterial: buttonMat?.name ?? null,
    buttonsOpacity: buttonMat?.opacity ?? null,
    buttonsTransparent: Boolean(buttonMat?.transparent),
    buttonsAlphaTest: buttonMat?.alphaTest ?? null,
    buttonsProtected: Boolean(buttonMat?.userData?.sidekickKeypadProtected),
    sharesCoverMaterial: Boolean(buttonMat && coverMat && buttonMat === coverMat),
    healthy: isSidekickKeypadMeshHealthy(buttons)
  };
}

function pinKeypadMaterial(mesh, material) {
  mesh.material = material;
  mesh.visible = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.userData.sidekickKeypadRepaired = true;
  mesh.userData.sidekickKeypadMaterial = material;
  mesh.userData.sidekickKeypadProtected = true;
}

function isolateCoverMaterial(cover) {
  const owned = ownMeshMaterial(cover);
  const mat = Array.isArray(owned) ? owned[0] : owned;
  if (!mat) return;
  mat.name = SIDEKICK_COVER_MATERIAL_NAME;
  mat.color?.setRGB?.(0, 0, 0);
  mat.opacity = 0;
  mat.transparent = false;
  mat.alphaTest = 0.5;
  mat.depthWrite = false;
  mat.depthTest = true;
  mat.needsUpdate = true;
}

/**
 * Opaque rubber/plastic for the face keypad — cloned from nearby chassis
 * (buttonsFace / blinn1) so color matches, then forced visible + DoubleSide
 * (the GLB authors phong3 as doubleSided; FrontSide hid inverted key normals).
 * @param {THREE.Material | null | undefined} donor
 */
function createKeypadMaterial(donor) {
  const mat = donor ? cloneMaterialSafe(donor) : new THREE.MeshStandardMaterial();
  mat.name = SIDEKICK_KEYPAD_MATERIAL_NAME;
  if (!mat.color?.isColor) mat.color = new THREE.Color(0x1a1a1c);
  else if (!donor?.color?.isColor) mat.color.setHex(0x1a1a1c);

  mat.transparent = false;
  mat.opacity = 1;
  mat.alphaTest = 0;
  mat.alphaMap = null;
  mat.depthWrite = true;
  mat.depthTest = true;
  mat.side = THREE.DoubleSide;
  mat.metalness = Math.min(typeof mat.metalness === "number" ? mat.metalness : 0.08, 0.12);
  mat.roughness = typeof mat.roughness === "number" ? mat.roughness : 0.62;
  mat.envMapIntensity = typeof mat.envMapIntensity === "number" ? mat.envMapIntensity : 0.85;
  mat.userData.sidekickKeypadProtected = true;
  mat.needsUpdate = true;
  return mat;
}

/**
 * Dev/runtime guard — repairs if needed, then logs remaining failures once.
 * @param {THREE.Object3D | null | undefined} phoneRoot
 */
export function assertSidekickChassisMaterials(phoneRoot) {
  if (!phoneRoot) return;

  ensureSidekickKeypadMaterials(phoneRoot);

  if (assertSidekickChassisMaterials._warned) return;

  const buttons = phoneRoot.getObjectByName("Buttons");
  const cover = phoneRoot.getObjectByName("transparentCover");
  const sideButtons = phoneRoot.getObjectByName("sideButtons");
  const keyboard = phoneRoot.getObjectByName("KeyboardText");

  const problems = [];

  if (!buttons?.isMesh) {
    problems.push("Buttons mesh missing from phoneRoot");
  } else {
    const mat = Array.isArray(buttons.material) ? buttons.material[0] : buttons.material;
    if (cover?.material && buttons.material === cover.material) {
      problems.push("Buttons still shares material with transparentCover (phong3)");
    }
    if (!isSidekickKeypadMeshHealthy(buttons)) {
      problems.push(
        `Buttons not healthy (mat=${mat?.name}, opacity=${mat?.opacity}, alphaTest=${mat?.alphaTest}, visible=${buttons.visible})`
      );
    }
  }

  for (const decal of [sideButtons, keyboard]) {
    if (!decal?.isMesh) continue;
    const mat = Array.isArray(decal.material) ? decal.material[0] : decal.material;
    if (!mat?.map) problems.push(`${decal.name} missing map`);
  }

  if (problems.length) {
    assertSidekickChassisMaterials._warned = true;
    console.error(
      "[Sidekick] Chassis material integrity failed — buttons/decals will look wrong:\n - " +
        problems.join("\n - ")
    );
  }
}

assertSidekickChassisMaterials._warned = false;
