/**
 * Grassworks-class finite meadow for Bust stop (WebGL InstancedMesh path).
 *
 * Patch size → placement radius (more blades, same blade scale).
 * Blade length → mesh Y scale + spacing density (rebuild).
 * Root XZ scale stays 1 so size ≠ blade scale.
 */

import * as THREE from "three";
import {
  GRASS_BASE_RADIUS,
  GRASS_BLADE_HEIGHT,
  GRASS_BLADE_SEGMENTS,
  GRASS_GROUND_COLOR,
  GRASS_INITIAL_CAPACITY,
  GRASS_MAX_INSTANCES
} from "./GrassConfig.js";
import { createBladeGeometry } from "./createBladeGeometry.js";
import { buildGrassInstances } from "./buildInstances.js";
import { createGrassMaterial, setGrassTime } from "./createGrassMaterial.js";
import { sampleCoverageOutline } from "./lawnCoverage.js";

/**
 * @typedef {{
 *   coverageNoiseScale: number,
 *   edgeFalloff: number,
 *   stragglerDensity: number,
 *   shapeDistortion: number
 * }} LawnCoverageParams
 *
 * @typedef {{
 *   bustLocal: { x: number, z: number },
 *   treeLocal: { x: number, z: number },
 *   tubeLocal: { x: number, z: number },
 *   bustHalfX: number,
 *   bustHalfZ: number,
 *   bustYaw: number,
 *   bustLipMin: number,
 *   bustLipJitter: number,
 *   bustClear: number,
 *   bustClearFeather: number,
 *   bustPeak: number,
 *   bustOuter: number,
 *   treeInner: number,
 *   treeOuter: number,
 *   tubeClear: number,
 *   tubeInner: number,
 *   tubeOuter: number
 * }} GrassLayout
 */

const _restMatrix = new THREE.Matrix4();
const _restPos = new THREE.Vector3();
const _restTop = new THREE.Vector3();
const _restQuat = new THREE.Quaternion();
const _restScale = new THREE.Vector3();
const _restView = new THREE.Matrix4();

export class GrassEngine {
  /**
   * @param {{
 *   radius?: number,
 *   bladeLength?: number,
 *   bladeDensity?: number,
 *   tuftAmount?: number,
 *   coverage: LawnCoverageParams,
 *   layout: GrassLayout
 * }} opts
   */
  constructor(opts) {
    this.radius = opts.radius ?? GRASS_BASE_RADIUS;
    this.bladeLength = Math.max(opts.bladeLength ?? 1, 0.05);
    this.bladeDensity = Math.max(0.2, opts.bladeDensity ?? 1);
    this.tuftAmount = Math.min(1, Math.max(0, opts.tuftAmount ?? 0.4));
    this.coverage = { ...opts.coverage };
    this.layout = opts.layout;
    this._capacity = GRASS_INITIAL_CAPACITY;
    this._restActive = false;
    this._restCompacted = false;
    /** @type {Float32Array | null} */
    this._restBackupM = null;
    /** @type {Float32Array | null} */
    this._restBackupBlade = null;
    /** @type {Float32Array | null} */
    this._restBackupPhase = null;
    this._restFullCount = 0;
    this._restStats = null;

    this.root = new THREE.Group();
    this.root.name = "lawn-grass-stump";

    this._bladeGeo = createBladeGeometry({ segments: GRASS_BLADE_SEGMENTS });
    this._material = createGrassMaterial();
    this._createMesh(this._capacity);

    // Soft ground disc — neon contact plane; hole punched under bust (rebuild).
    this._groundMat = new THREE.MeshStandardMaterial({
      color: GRASS_GROUND_COLOR,
      roughness: 0.94,
      metalness: 0,
      envMapIntensity: 0,
      side: THREE.FrontSide
    });
    this._groundMat.polygonOffset = true;
    this._groundMat.polygonOffsetFactor = 1;
    this._groundMat.polygonOffsetUnits = 1;
    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      this._groundMat
    );
    this.ground.name = "Grass_ground";
    this.ground.receiveShadow = true;
    this.ground.castShadow = false;
    this.ground.renderOrder = -2;
    // Sit under the stage apron so the silhouette edge never reads as a
    // raised dirt "coin" around the tree / lawn (Meshy pad is buried separately).
    this.ground.position.y = -0.06;
    this.root.add(this.ground);

    this.rebuild();
  }

  /**
   * Meadow floor matching blade coverage silhouette (not a hard circle) so
   * dirt does not stick out past lobed grass edges. Ellipse hole under bust.
   */
  _rebuildGround() {
    const r = Math.max(this.radius, 1e-3);
    const L = this.layout;
    const hx = Math.max((L.bustHalfX ?? 0.98) * (L.bustLipMin ?? 1.18), 0.2);
    const hz = Math.max((L.bustHalfZ ?? 0.88) * (L.bustLipMin ?? 1.18), 0.2);
    const yaw = L.bustYaw ?? 0;
    const bx = L.bustLocal?.x ?? 0;
    const bz = L.bustLocal?.z ?? 0;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    const outline = sampleCoverageOutline(
      {
        radius: r,
        coverageNoiseScale: this.coverage.coverageNoiseScale,
        edgeFalloff: this.coverage.edgeFalloff,
        stragglerDensity: this.coverage.stragglerDensity,
        shapeDistortion: this.coverage.shapeDistortion
      },
      { segments: 96, shrink: 0.94 }
    );

    const shape = new THREE.Shape();
    if (outline.length > 2) {
      shape.moveTo(outline[0].x, outline[0].z);
      for (let i = 1; i < outline.length; i++) {
        shape.lineTo(outline[i].x, outline[i].z);
      }
      shape.closePath();
    } else {
      shape.absarc(0, 0, r * 0.94, 0, Math.PI * 2, false);
    }

    const hole = new THREE.Path();
    const N = 64;
    for (let i = N; i >= 0; i--) {
      const a = (i / N) * Math.PI * 2;
      const lx = Math.cos(a) * hx;
      const lz = Math.sin(a) * hz;
      const wx = bx + lx * cosY - lz * sinY;
      const wz = bz + lx * sinY + lz * cosY;
      if (i === N) hole.moveTo(wx, wz);
      else hole.lineTo(wx, wz);
    }
    shape.holes.push(hole);

    // Second hole under the apple trunk so the dark dirt plate does not read
    // as a Meshy-style grass-coin around the roots.
    const tx = L.treeLocal?.x ?? 0;
    const tz = L.treeLocal?.z ?? 0;
    const treeR = Math.max(L.treeInner ?? 0.35, 0.55) * 1.85;
    if (Number.isFinite(tx) && Number.isFinite(tz) && treeR > 0.05) {
      const treeHole = new THREE.Path();
      for (let i = N; i >= 0; i--) {
        const a = (i / N) * Math.PI * 2;
        const wx = tx + Math.cos(a) * treeR;
        const wz = tz + Math.sin(a) * treeR;
        if (i === N) treeHole.moveTo(wx, wz);
        else treeHole.lineTo(wx, wz);
      }
      shape.holes.push(treeHole);
    }

    // Third hole under the lantern foot (solid base — blades must not clip).
    const ux = L.tubeLocal?.x ?? 0;
    const uz = L.tubeLocal?.z ?? 0;
    const tubeR = Math.max(L.tubeClear ?? 0.55, 0.35);
    if (Number.isFinite(ux) && Number.isFinite(uz) && tubeR > 0.05) {
      const tubeHole = new THREE.Path();
      for (let i = N; i >= 0; i--) {
        const a = (i / N) * Math.PI * 2;
        const wx = ux + Math.cos(a) * tubeR;
        const wz = uz + Math.sin(a) * tubeR;
        if (i === N) tubeHole.moveTo(wx, wz);
        else tubeHole.lineTo(wx, wz);
      }
      shape.holes.push(tubeHole);
    }

    const geo = new THREE.ShapeGeometry(shape, 2);
    geo.rotateX(-Math.PI / 2);
    this.ground.geometry.dispose();
    this.ground.geometry = geo;
    this.ground.scale.set(1, 1, 1);
  }

  /** @param {number} capacity */
  _createMesh(capacity) {
    if (this.mesh) {
      this.root.remove(this.mesh);
      // geometry attrs owned on _bladeGeo — don't dispose geo
    }
    this._capacity = capacity;
    this._aBlade = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 4),
      4
    );
    this._aPhase = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 2),
      2
    );
    this._bladeGeo.setAttribute("aBlade", this._aBlade);
    this._bladeGeo.setAttribute("aPhase", this._aPhase);

    this.mesh = new THREE.InstancedMesh(
      this._bladeGeo,
      this._material,
      capacity
    );
    this.mesh.name = "lawn-grass-blades";
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Wind must match beauty for both spot (depth) and neon point (distance) shadows.
    this.mesh.customDepthMaterial = this._material.userData.depthMaterial;
    this.mesh.customDistanceMaterial = this._material.userData.distanceMaterial;
    this.mesh.scale.y = this.bladeLength;
    this.root.add(this.mesh);

    if (this.depthMesh) {
      this.root.remove(this.depthMesh);
      this.depthMesh = null;
    }
    const prepass = this._material.userData.prepassMaterial;
    if (prepass) {
      this.depthMesh = new THREE.InstancedMesh(this._bladeGeo, prepass, capacity);
      this.depthMesh.name = "lawn-grass-depth";
      this.depthMesh.castShadow = false;
      this.depthMesh.receiveShadow = false;
      this.depthMesh.frustumCulled = false;
      this.depthMesh.renderOrder = -3;
      this._bladeGeo.setAttribute("instanceMatrix", this.mesh.instanceMatrix);
      this.depthMesh.instanceMatrix = this.mesh.instanceMatrix;
      this.root.add(this.depthMesh);
      this._bindDepthMesh();
    }
  }

  _bindDepthMesh() {
    const mesh = this.mesh;
    const depth = this.depthMesh;
    if (!mesh || !depth) return;
    depth.count = mesh.count;
    depth.instanceMatrix = mesh.instanceMatrix;
    depth.scale.copy(mesh.scale);
    depth.visible = mesh.visible;
    depth.position.copy(mesh.position);
    depth.quaternion.copy(mesh.quaternion);
  }

  /**
   * Breeze only (no placement rebuild).
   * @param {{ breezeStrength?: number, breezeSpeed?: number }} feel
   */
  setBreeze(feel = {}) {
    const u = this._material?.userData?.grassUniforms;
    if (!u) return;
    if (typeof feel.breezeStrength === "number" && Number.isFinite(feel.breezeStrength)) {
      u.uWindStrength.value = Math.max(0, feel.breezeStrength);
    }
    if (typeof feel.breezeSpeed === "number" && Number.isFinite(feel.breezeSpeed)) {
      u.uWindSpeed.value = Math.max(0, feel.breezeSpeed);
    }
  }

  /**
   * @deprecated Use setBreeze + setParams({ bladeLength }) — length rebuilds density.
   * @param {{ bladeLength?: number, breezeStrength?: number, breezeSpeed?: number }} feel
   */
  setFeel(feel = {}) {
    if (typeof feel.bladeLength === "number" && Number.isFinite(feel.bladeLength)) {
      this.bladeLength = Math.max(0.05, feel.bladeLength);
      if (this.mesh) this.mesh.scale.y = this.bladeLength;
    }
    this.setBreeze(feel);
  }

  /**
   * @param {{
   *   coverage?: Partial<LawnCoverageParams>,
   *   layout?: GrassLayout,
   *   radius?: number,
   *   bladeLength?: number,
   *   bladeDensity?: number,
   *   tuftAmount?: number,
   *   breezeStrength?: number,
   *   breezeSpeed?: number
   * }} [partial]
   */
  setParams(partial = {}) {
    let rebuild = false;
    if (partial.coverage) {
      const c = { ...this.coverage, ...partial.coverage };
      if (
        c.coverageNoiseScale !== this.coverage.coverageNoiseScale ||
        c.edgeFalloff !== this.coverage.edgeFalloff ||
        c.stragglerDensity !== this.coverage.stragglerDensity ||
        c.shapeDistortion !== this.coverage.shapeDistortion
      ) {
        this.coverage = c;
        rebuild = true;
      }
    }
    if (partial.layout) {
      this.layout = partial.layout;
      rebuild = true;
    }
    if (typeof partial.radius === "number" && partial.radius !== this.radius) {
      this.radius = partial.radius;
      rebuild = true;
    }
    if (
      typeof partial.bladeLength === "number" &&
      Number.isFinite(partial.bladeLength) &&
      Math.abs(partial.bladeLength - this.bladeLength) > 1e-6
    ) {
      this.bladeLength = Math.max(0.05, partial.bladeLength);
      rebuild = true;
    }
    if (
      typeof partial.bladeDensity === "number" &&
      Number.isFinite(partial.bladeDensity) &&
      Math.abs(partial.bladeDensity - this.bladeDensity) > 1e-6
    ) {
      this.bladeDensity = Math.max(0.2, partial.bladeDensity);
      rebuild = true;
    }
    if (
      typeof partial.tuftAmount === "number" &&
      Number.isFinite(partial.tuftAmount) &&
      Math.abs(partial.tuftAmount - this.tuftAmount) > 1e-6
    ) {
      this.tuftAmount = Math.min(1, Math.max(0, partial.tuftAmount));
      rebuild = true;
    }
    if (rebuild) this.rebuild();
    else if (this.mesh) this.mesh.scale.y = this.bladeLength;
    this.setBreeze({
      breezeStrength: partial.breezeStrength,
      breezeSpeed: partial.breezeSpeed
    });
  }

  rebuild() {
    this.clearRestCull();
    const built = buildGrassInstances({
      radius: this.radius,
      bladeLength: this.bladeLength,
      bladeDensity: this.bladeDensity,
      tuftAmount: this.tuftAmount,
      coverage: this.coverage,
      layout: {
        bustX: this.layout.bustLocal.x,
        bustZ: this.layout.bustLocal.z,
        bustHalfX: this.layout.bustHalfX,
        bustHalfZ: this.layout.bustHalfZ,
        bustYaw: this.layout.bustYaw,
        bustLipMin: this.layout.bustLipMin,
        bustLipJitter: this.layout.bustLipJitter,
        bustPeak: this.layout.bustPeak,
        bustOuter: this.layout.bustOuter,
        tubeX: this.layout.tubeLocal.x,
        tubeZ: this.layout.tubeLocal.z,
        tubeClear: this.layout.tubeClear,
        tubeInner: this.layout.tubeInner,
        tubeOuter: this.layout.tubeOuter,
        treeX: this.layout.treeLocal.x,
        treeZ: this.layout.treeLocal.z,
        treeInner: this.layout.treeInner,
        treeOuter: this.layout.treeOuter
      },
      maxInstances: GRASS_MAX_INSTANCES
    });

    const count = built.count;
    const need = Math.min(
      GRASS_MAX_INSTANCES,
      Math.max(this._capacity, count + 64, built.gridRes)
    );
    if (need > this._capacity) {
      this._createMesh(need);
    }

    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, built.matrices[i]);
      this._aBlade.setXYZW(
        i,
        built.bladeAttrs[i * 4],
        built.bladeAttrs[i * 4 + 1],
        built.bladeAttrs[i * 4 + 2],
        built.bladeAttrs[i * 4 + 3]
      );
      this._aPhase.setXY(i, built.phases[i * 2], built.phases[i * 2 + 1]);
    }
    const identity = new THREE.Matrix4();
    for (let i = count; i < this._capacity; i++) {
      this.mesh.setMatrixAt(i, identity);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this._aBlade.needsUpdate = true;
    this._aPhase.needsUpdate = true;
    this.mesh.scale.y = this.bladeLength;
    this._bindDepthMesh();

    this._rebuildGround();
    this.ground.position.y = -0.06;
  }

  /** @param {number} timeSec */
  update(timeSec) {
    setGrassTime(this._material, timeSec);
    this._bindDepthMesh();
  }

  /**
   * Settled view: drop instances outside the camera, or shorter than one pixel.
   * The placement count is unchanged — motion restores every blade.
   * @param {THREE.Camera} camera
   * @param {{ subpixelPx?: number, ndcMargin?: number }} [opts]
   */
  applyRestCull(camera, opts = {}) {
    if (!this.mesh || !camera || this._restActive) return this._restStats;
    camera.updateMatrixWorld();
    const subpixelPx = opts.subpixelPx ?? 1;
    const ndcMargin = opts.ndcMargin ?? 0.12;
    const limit = 1 + Math.max(0, ndcMargin);
    const count = this.mesh.count;
    this.mesh.updateMatrixWorld(true);
    _restView.copy(camera.matrixWorldInverse);
    const ve = _restView.elements;
    const drawW = typeof window !== "undefined" ? window.innerWidth : 1;
    const drawH = typeof window !== "undefined" ? window.innerHeight : 1;
    /** @type {number[]} */
    const keep = [];
    let offscreen = 0;
    let subpixel = 0;
    for (let i = 0; i < count; i += 1) {
      this.mesh.getMatrixAt(i, _restMatrix);
      _restMatrix.premultiply(this.mesh.matrixWorld);
      _restMatrix.decompose(_restPos, _restQuat, _restScale);
      const worldH = GRASS_BLADE_HEIGHT * Math.abs(_restScale.y);
      const vz =
        ve[2] * _restPos.x +
        ve[6] * _restPos.y +
        ve[10] * _restPos.z +
        ve[14];
      if (vz > -camera.near) {
        offscreen += 1;
        continue;
      }
      _restTop.copy(_restPos);
      _restTop.y += worldH;
      _restTop.project(camera);
      const tipX = _restTop.x;
      const tipY = _restTop.y;
      const tipZ = _restTop.z;
      _restPos.project(camera);
      const inRoot =
        _restPos.z >= -1 &&
        _restPos.z <= 1 &&
        Math.abs(_restPos.x) <= limit &&
        Math.abs(_restPos.y) <= limit;
      const inTip =
        tipZ >= -1 &&
        tipZ <= 1 &&
        Math.abs(tipX) <= limit &&
        Math.abs(tipY) <= limit;
      if (!inRoot && !inTip) {
        offscreen += 1;
        continue;
      }
      const px = Math.hypot(
        (tipX - _restPos.x) * drawW * 0.5,
        (tipY - _restPos.y) * drawH * 0.5
      );
      if (px < subpixelPx) {
        subpixel += 1;
        continue;
      }
      keep.push(i);
    }

    this._restFullCount = count;
    this._restActive = true;
    this._restStats = {
      full: count,
      kept: keep.length,
      offscreen,
      subpixel
    };
    if (keep.length >= count) return this._restStats;

    const matrix = this.mesh.instanceMatrix.array;
    const blade = this._aBlade.array;
    const phase = this._aPhase.array;
    this._restBackupM = new Float32Array(matrix);
    this._restBackupBlade = new Float32Array(blade);
    this._restBackupPhase = new Float32Array(phase);
    for (let k = 0; k < keep.length; k += 1) {
      const src = keep[k] * 16;
      matrix.set(this._restBackupM.subarray(src, src + 16), k * 16);
      const b = keep[k] * 4;
      blade.set(this._restBackupBlade.subarray(b, b + 4), k * 4);
      const p = keep[k] * 2;
      phase.set(this._restBackupPhase.subarray(p, p + 2), k * 2);
    }
    this.mesh.count = keep.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this._bindDepthMesh();
    this._aBlade.needsUpdate = true;
    this._aPhase.needsUpdate = true;
    this._restCompacted = true;
    return this._restStats;
  }

  /** Hop: draw the full meadow again. */
  clearRestCull() {
    if (this._restCompacted && this.mesh && this._restBackupM) {
      this.mesh.instanceMatrix.array.set(this._restBackupM);
      this._aBlade.array.set(this._restBackupBlade);
      this._aPhase.array.set(this._restBackupPhase);
      this.mesh.count = this._restFullCount;
      this.mesh.instanceMatrix.needsUpdate = true;
      this._bindDepthMesh();
      this._aBlade.needsUpdate = true;
      this._aPhase.needsUpdate = true;
    }
    this._restCompacted = false;
    this._restBackupM = null;
    this._restBackupBlade = null;
    this._restBackupPhase = null;
    this._restActive = false;
    this._restStats = null;
  }

  /**
   * Rest drops the per-blade noise sample. The sine gust stays.
   * @param {boolean} full
   */
  setWindDetail(full) {
    const u = this._material?.userData?.grassUniforms;
    if (u?.uWindDetail) u.uWindDetail.value = full ? 1 : 0;
  }

  dispose() {
    this._bladeGeo.dispose();
    this._material.dispose();
    this._material.userData.depthMaterial?.dispose?.();
    this._material.userData.prepassMaterial?.dispose?.();
    if (this.depthMesh) this.root.remove(this.depthMesh);
    this._groundMat.dispose();
    this.ground.geometry.dispose();
    this.root.remove(this.mesh);
    this.root.remove(this.ground);
  }
}
