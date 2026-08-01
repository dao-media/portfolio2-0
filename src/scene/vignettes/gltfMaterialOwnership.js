import * as THREE from "three";

/**
 * GLTF materials/textures are often shared across meshes. Mutating or disposing
 * a shared resource (e.g. transparentCover + Buttons both use phong3) silently
 * wrecks other parts of the model.
 *
 * Rule: before any write to a loaded material/texture, call these helpers so the
 * mesh owns a private copy. Never dispose the abandoned shared resource — other
 * meshes may still reference it.
 */

/**
 * Ensure `mesh.material` is exclusively owned by this mesh (cloned if shared
 * or if a write is about to happen).
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
  const clone = material.clone();
  // Textures are referenced, not deep-cloned by Material.clone() — leave maps
  // shared for reads; callers that mutate map pixels must ownTexture() first.
  return clone;
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

/**
 * Dev/runtime guard — logs once if chassis buttons still share the cover material.
 * @param {THREE.Object3D | null | undefined} phoneRoot
 */
export function assertSidekickChassisMaterials(phoneRoot) {
  if (!phoneRoot || assertSidekickChassisMaterials._warned) return;

  const buttons = phoneRoot.getObjectByName("Buttons");
  const cover = phoneRoot.getObjectByName("transparentCover");
  const sideButtons = phoneRoot.getObjectByName("sideButtons");
  const keyboard = phoneRoot.getObjectByName("KeyboardText");

  const problems = [];

  if (buttons?.material && cover?.material && buttons.material === cover.material) {
    problems.push("Buttons still shares material with transparentCover (phong3)");
  }

  if (buttons?.isMesh) {
    const mat = Array.isArray(buttons.material) ? buttons.material[0] : buttons.material;
    if (mat?.transparent && mat.depthWrite === false) {
      problems.push("Buttons material is transparent+depthWrite:false (cover settings leaked)");
    }
    if (!buttons.visible) {
      problems.push("Buttons mesh is hidden");
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
