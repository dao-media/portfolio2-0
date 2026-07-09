import * as THREE from "three";

/**
 * Emissive "softbox" planes that exist only in the env-map virtual scene —
 * never in the main render. Product-photo style monitor reflections.
 *
 * Intensities stay below bloom thresholds; these only feed the cube env capture.
 */
export class MonitorReflectionRig {
  /**
   * @param {THREE.Scene} virtualScene LiveStageEnvironment.virtualScene
   */
  constructor(virtualScene) {
    this.virtualScene = virtualScene;
    /** @type {THREE.Mesh[]} */
    this.formers = [];
    this._built = false;

    this._localPos = new THREE.Vector3();
    this._worldQuat = new THREE.Quaternion();
    this._parentQuat = new THREE.Quaternion();
    this._localQuat = new THREE.Quaternion();
  }

  _addFormer(width, height, color, intensity, localPosition, localRotation) {
    const material = new THREE.MeshBasicMaterial({
      color,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    material.color.multiplyScalar(intensity);

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.userData.localPosition = localPosition.clone();
    mesh.userData.localRotation = localRotation.clone();
    this.virtualScene.add(mesh);
    this.formers.push(mesh);
    return mesh;
  }

  _buildFormers() {
    if (this._built) return;

    // Key softbox — camera-side strip; this IS the monitor glare in product photos.
    this._addFormer(
      0.58,
      0.36,
      0xfff2e6,
      42,
      new THREE.Vector3(0, 0.04, 0.36),
      new THREE.Euler(0, Math.PI, 0)
    );

    // Secondary warm fill — broad milky smear across upper glass.
    this._addFormer(
      0.68,
      0.38,
      0xfff8f0,
      11,
      new THREE.Vector3(0.03, 0.16, 0.3),
      new THREE.Euler(-0.18, Math.PI, 0)
    );

    // Cool rim from stage left — thin edge kick.
    this._addFormer(
      0.16,
      0.52,
      0xb8ccff,
      6,
      new THREE.Vector3(-0.32, 0.02, 0.22),
      new THREE.Euler(0, Math.PI * 0.62, 0)
    );

    // Overhead ceiling bounce — very subtle.
    this._addFormer(
      0.55,
      0.34,
      0xfff8f2,
      2.4,
      new THREE.Vector3(0, 0.34, 0.12),
      new THREE.Euler(-Math.PI / 2, 0, 0)
    );

    this._built = true;
  }

  /**
   * Reposition formers in world space to follow the CRT as the lazy Susan turns.
   * @param {THREE.Object3D} screenMesh
   */
  sync(screenMesh) {
    if (!screenMesh) return;
    this._buildFormers();
    screenMesh.updateMatrixWorld(true);
    screenMesh.getWorldQuaternion(this._parentQuat);

    for (const mesh of this.formers) {
      this._localPos.copy(mesh.userData.localPosition);
      screenMesh.localToWorld(this._localPos);
      mesh.position.copy(this._localPos);

      this._localQuat.setFromEuler(mesh.userData.localRotation);
      this._worldQuat.copy(this._parentQuat).multiply(this._localQuat);
      mesh.quaternion.copy(this._worldQuat);
    }
  }

  dispose() {
    for (const mesh of this.formers) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.removeFromParent();
    }
    this.formers = [];
    this._built = false;
  }
}
