import * as THREE from "three";
import gsap from "gsap";

/** Monitor bezel mesh in pc-from-source.glb (pc_2). */
const BEZEL_MESH_NAME = "pc-Mesh_1";
/** pc_emission2 UV island — power LED + physical cap (bottom-left of atlas). */
const BUTTON_UV = { maxU: 0.22, maxV: 0.08, clusterRadius: 0.045 };
const PRESS_DEPTH = 0.0045;
const HIT_RADIUS = 0.034;
/** Depress along -Z in bezel local space (into the front face). */
const _PRESS_AXIS = new THREE.Vector3(0, 0, -1);
const _WORLD = new THREE.Vector3();
const _LOCAL = new THREE.Vector3();

/**
 * Depresses the authored power cap on pc-Mesh_1 — no proxy geometry.
 * Vertices are selected via the pc_2 emissive UV layout (LED / button island).
 */
export class PcPowerButton {
  /**
   * @param {THREE.Object3D | null} pcRoot
   * @returns {PcPowerButton | null}
   */
  static attach(pcRoot) {
    if (!pcRoot) return null;
    const bezel = pcRoot.getObjectByName(BEZEL_MESH_NAME);
    if (!bezel?.isMesh) return null;
    return new PcPowerButton(bezel);
  }

  /** @param {THREE.Mesh} bezelMesh */
  constructor(bezelMesh) {
    this.bezel = bezelMesh;
    this.geometry = bezelMesh.geometry;
    this._pressTween = null;
    this._vertIndices = this._collectButtonVertexIndices();
    this._restPositions = this._snapshotRestPositions();
    this._hitCenterLocal = this._computeHitCenterLocal();
    this._pressDepth = 0;

    if (!this.hasButtonGeometry) {
      console.warn(
        "[PcPowerButton] No power-cap vertices found on pc-Mesh_1 — press animation disabled."
      );
    }
  }

  get hasButtonGeometry() {
    return this._vertIndices.length > 0;
  }

  /** @param {THREE.Vector3} pointWorld */
  isHit(pointWorld) {
    if (!this.hasButtonGeometry || !pointWorld) return false;
    _LOCAL.copy(this._hitCenterLocal);
    this.bezel.localToWorld(_LOCAL);
    return _LOCAL.distanceTo(pointWorld) <= HIT_RADIUS;
  }

  /** @param {{ onComplete?: () => void }} [opts] */
  playPress(opts = {}) {
    if (!this.hasButtonGeometry) {
      opts.onComplete?.();
      return;
    }

    this._pressTween?.kill();
    const blend = { depth: this._pressDepth };

    this._pressTween = gsap
      .timeline({
        onComplete: () => {
          this._pressTween = null;
          opts.onComplete?.();
        }
      })
      .to(blend, {
        depth: PRESS_DEPTH,
        duration: 0.07,
        ease: "power2.in",
        onUpdate: () => this._applyDepth(blend.depth)
      })
      .to(blend, {
        depth: 0,
        duration: 0.38,
        ease: "elastic.out(1, 0.42)",
        onUpdate: () => this._applyDepth(blend.depth)
      });
  }

  dispose() {
    this._pressTween?.kill();
    this._applyDepth(0);
  }

  /** @returns {number[]} */
  _collectButtonVertexIndices() {
    const geometry = this.geometry;
    const uvAttr = geometry.attributes.uv;
    const index = geometry.index;
    if (!uvAttr || !index) return [];

    const seedTris = [];
    for (let t = 0; t < index.count / 3; t += 1) {
      const ia = index.getX(t * 3);
      const ib = index.getX(t * 3 + 1);
      const ic = index.getX(t * 3 + 2);
      const avgU = (uvAttr.getX(ia) + uvAttr.getX(ib) + uvAttr.getX(ic)) / 3;
      const avgV = (uvAttr.getY(ia) + uvAttr.getY(ib) + uvAttr.getY(ic)) / 3;
      if (avgU <= BUTTON_UV.maxU && avgV <= BUTTON_UV.maxV) {
        seedTris.push({ avgU, avgV, t });
      }
    }

    if (!seedTris.length) return [];

    const clusterU = seedTris.reduce((sum, tri) => sum + tri.avgU, 0) / seedTris.length;
    const clusterV = seedTris.reduce((sum, tri) => sum + tri.avgV, 0) / seedTris.length;

    const vertSet = new Set();
    for (const tri of seedTris) {
      if (Math.hypot(tri.avgU - clusterU, tri.avgV - clusterV) > BUTTON_UV.clusterRadius) {
        continue;
      }
      const t = tri.t;
      vertSet.add(index.getX(t * 3));
      vertSet.add(index.getX(t * 3 + 1));
      vertSet.add(index.getX(t * 3 + 2));
    }

    return [...vertSet];
  }

  /** @returns {{ x: number, y: number, z: number }[]} */
  _snapshotRestPositions() {
    const pos = this.geometry.attributes.position;
    return this._vertIndices.map((vi) => ({
      x: pos.getX(vi),
      y: pos.getY(vi),
      z: pos.getZ(vi)
    }));
  }

  _computeHitCenterLocal() {
    if (!this._restPositions.length) {
      return new THREE.Vector3();
    }

    const center = new THREE.Vector3();
    for (const rest of this._restPositions) {
      center.x += rest.x;
      center.y += rest.y;
      center.z += rest.z;
    }
    center.multiplyScalar(1 / this._restPositions.length);
    return center;
  }

  /** @param {number} depth */
  _applyDepth(depth) {
    this._pressDepth = depth;
    const pos = this.geometry.attributes.position;

    for (let i = 0; i < this._vertIndices.length; i += 1) {
      const vi = this._vertIndices[i];
      const rest = this._restPositions[i];
      pos.setXYZ(
        vi,
        rest.x + _PRESS_AXIS.x * depth,
        rest.y + _PRESS_AXIS.y * depth,
        rest.z + _PRESS_AXIS.z * depth
      );
    }

    pos.needsUpdate = true;
    if (this.geometry.attributes.normal) {
      this.geometry.computeVertexNormals();
    }
  }
}
