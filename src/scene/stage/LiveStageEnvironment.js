import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CAM_Z, STAGE_BG, STAGE_RADIUS } from "./constants.js";
import { MonitorReflectionRig } from "./MonitorReflectionRig.js";

/**
 * Live cube envmap built from emissive "light former" planes (vanilla port of the
 * Building live envmaps / drei Environment pattern).
 * @see https://lwo219.csb.app/
 */
export class LiveStageEnvironment {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{ resolution?: number }} [options]
   */
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.resolution = options.resolution ?? 768;
    this.virtualScene = new THREE.Scene();
    this.position = new THREE.Vector3(0, 3.2, STAGE_RADIUS);

    this.target = new THREE.WebGLCubeRenderTarget(this.resolution, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter
    });

    this.cubeCamera = new THREE.CubeCamera(0.1, 60, this.target);
    this.monitorRig = new MonitorReflectionRig(this.virtualScene);
    this._pmrem = new THREE.PMREMGenerator(renderer);
    this._pmrem.compileCubemapShader();
    /** PMREM-processed env — MeshPhysicalMaterial needs CUBE_UV, not raw cubemap faces. */
    this._pmremTarget = null;
    this._buildLightformers();
    this._addDarkRoomBase();
  }

  _addFormer(geometry, color, intensity, position, rotation = [0, 0, 0]) {
    const material = new THREE.MeshBasicMaterial({
      color,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    material.color.multiplyScalar(intensity);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    this.virtualScene.add(mesh);
    return mesh;
  }

  /** Dim RoomEnvironment fill — dark room still has ceiling/wall bounce to reflect. */
  _addDarkRoomBase() {
    const roomScene = new RoomEnvironment();
    this._roomEnvTexture = this._pmrem.fromScene(roomScene, 0.012).texture;

    const roomMat = new THREE.MeshBasicMaterial({
      map: this._roomEnvTexture,
      toneMapped: false,
      side: THREE.BackSide,
      depthWrite: false
    });

    this._roomSphere = new THREE.Mesh(new THREE.SphereGeometry(28, 32, 16), roomMat);
    this._roomSphere.position.copy(this.position);
    this.virtualScene.add(this._roomSphere);
  }

  _buildLightformers() {
    // Dark-room stage fill — dim so CRT glass reads against black but isn't empty.
    this._addFormer(
      new THREE.PlaneGeometry(14, 14),
      0xfff6ea,
      1.1,
      new THREE.Vector3(0, 9, 4),
      [-Math.PI / 2, 0, 0]
    );

    this._addFormer(
      new THREE.PlaneGeometry(7, 10),
      0xfff0d8,
      1.4,
      new THREE.Vector3(0, 6.5, CAM_Z - 2.2),
      [0, Math.PI, 0]
    );

    this._addFormer(
      new THREE.PlaneGeometry(5, 12),
      0xb8ccff,
      1.8,
      new THREE.Vector3(-STAGE_RADIUS, 4.5, 2),
      [0, Math.PI / 2, 0]
    );

    this._addFormer(
      new THREE.PlaneGeometry(5, 12),
      0xffc896,
      1.5,
      new THREE.Vector3(STAGE_RADIUS, 3.5, 2),
      [0, -Math.PI / 2, 0]
    );

    this._addFormer(
      new THREE.CircleGeometry(STAGE_RADIUS * (16 / 9), 32),
      STAGE_BG,
      0.35,
      new THREE.Vector3(0, 0.02, STAGE_RADIUS),
      [-Math.PI / 2, 0, 0]
    );
  }

  /** @returns {THREE.Texture} PMREM env map for CRT glass / scene.environment. */
  getTexture() {
    return this._pmremTarget?.texture ?? this.target.texture;
  }

  /**
   * Move monitor-local softboxes with the CRT before env capture.
   * @param {THREE.Object3D} screenMesh
   */
  syncMonitorReflections(screenMesh) {
    this.monitorRig.sync(screenMesh);
  }

  /**
   * @param {THREE.Scene | null} scene
   * @param {THREE.Vector3} [position] Cube capture origin (defaults to stage center)
   * @param {{ applyToScene?: boolean }} [options]
   */
  update(scene, position = this.position, options = {}) {
    // Default false — CRT / glass captures must not recolor stage MeshStandard materials.
    const { applyToScene = false } = options;
    if (this._roomSphere) {
      this._roomSphere.position.copy(position);
    }
    this.cubeCamera.position.copy(position);
    this.cubeCamera.update(this.renderer, this.virtualScene);

    this._pmremTarget = this._pmrem.fromCubemap(this.target.texture, this._pmremTarget);
    const envTex = this._pmremTarget.texture;
    if (applyToScene && scene) {
      scene.environment = envTex;
      scene.environmentIntensity = 1.15;
    }
    return envTex;
  }

  dispose() {
    this.monitorRig.dispose();
    this._pmremTarget?.dispose();
    this._roomEnvTexture?.dispose?.();
    this._pmrem.dispose();
    this.target.dispose();
    this.virtualScene.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        if (obj.material?.map) obj.material.map.dispose?.();
        obj.material.dispose();
      }
    });
  }
}
