import * as THREE from "three";

// Raycasts clicks against tagged vignette meshes and toggles CameraRig's
// zoom state via zoomIn()/zoomOut() — never writes the camera transform
// itself, keeping CameraRig the sole owner of that. Lives outside CameraRig
// because it needs the scene's mesh list for raycasting, a dependency
// CameraRig otherwise has no reason to carry.
export function createVignetteClick({ camera, meshes, cameraRig }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function resolveVignetteIndex(object) {
    let node = object;
    while (node) {
      if (Number.isFinite(node.userData?.vignetteIndex)) {
        return node.userData.vignetteIndex;
      }
      node = node.parent;
    }
    return null;
  }

  function handleClick(e) {
    const s = cameraRig.state;

    const rect = e.currentTarget.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    const hits = raycaster.intersectObjects(meshes, true);
    const hitIndex = hits.length ? resolveVignetteIndex(hits[0].object) : null;

    // No isSettled gate: clicking the vignette currently being approached
    // (hitIndex === s.index) redirects the in-flight motion straight to its
    // zoom anchor — see CameraRig.zoomIn().
    if (hitIndex === s.index) {
      if (s.isZoomed) cameraRig.zoomOut();
      else cameraRig.zoomIn(hitIndex);
      return;
    }

    if (s.isZoomed) {
      // Background or a non-active vignette: pull out, no index change.
      cameraRig.zoomOut();
    }
  }

  return {
    attach(el) {
      el.addEventListener("click", handleClick);
    },
    detach(el) {
      el.removeEventListener("click", handleClick);
    },
    handleClick
  };
}
