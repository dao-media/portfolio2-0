import * as THREE from "three";
import { createGltfLoader } from "../loaders/createGltfLoader.js";
import { BLACK_HOLE_CENTER } from "../camera/BlackHoleCameraSequence.js";

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _normal = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _radial = new THREE.Vector3();
const _flow = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _basisA = new THREE.Vector3();
const _basisB = new THREE.Vector3();
const _ref = new THREE.Vector3();
const _guide = new THREE.Vector3();

/** Runtime copy. The master in `masters/Black Hole/` stays untouched. */
export const BLACK_HOLE_GLB_URL = "/assets/models/blackhole/runtime/blackhole.glb";
/** Fit diameter in meters. The authored mesh is ~391 units across. */
export const BLACK_HOLE_WORLD_DIAMETER = 7.2;
/** How hard the disk shears the cursor. Below 1 so the pointer still leads. */
export const BLACK_HOLE_SHEAR_STRENGTH = 0.78;
/** Inward share of the flow. The rest is the ring’s spin tangent. */
export const BLACK_HOLE_SHEAR_INWARD = 0.34;
/** Inner lane. The blob rides this circle instead of crossing the singularity. */
export const BLACK_HOLE_HORIZON_FRAC = 0.38;
/** Concentric lanes from the horizon out to the disk edge. */
export const BLACK_HOLE_TRACK_COUNT = 5;
/** How fast the blob slides along a lane (1/s). Higher than the radial rate so corners arc. */
export const BLACK_HOLE_TRACK_ANGULAR_RATE = 9;
/** How fast the blob changes lanes (1/s). */
export const BLACK_HOLE_TRACK_RADIAL_RATE = 3.5;
/**
 * Pitch the other way from the first 8° try. Disk stays nearly horizontal;
 * −8° on X squares the face to the approach.
 */
export const BLACK_HOLE_DISK_PITCH = (-8 * Math.PI) / 180;

/**
 * Animated Sketchfab black hole (Take 001, 10 s). The export’s disk lies in
 * the horizontal plane (thin axis is Y). A small −X pitch tips that face
 * toward the camera.
 * @param {THREE.Vector3} [center]
 */
export function createBlackHoleModel(center = BLACK_HOLE_CENTER) {
  const group = new THREE.Group();
  group.name = "black-hole";
  group.position.copy(center);
  group.rotation.x = BLACK_HOLE_DISK_PITCH;
  group.frustumCulled = false;

  const api = {
    group,
    ready: false,
    /** @type {THREE.Object3D | null} */
    ring: null,
    /** @type {THREE.AnimationMixer | null} */
    mixer: null,
    /** @param {number} dt */
    update(dt) {
      if (group.visible) this.mixer?.update(dt);
    },
    hide() {
      group.visible = false;
    }
  };

  const loader = createGltfLoader();
  loader.load(BLACK_HOLE_GLB_URL, (gltf) => {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const mid = box.getCenter(new THREE.Vector3());
    root.position.sub(mid);
    const diameter = Math.max(size.x, size.y, size.z, 0.001);
    group.scale.setScalar(BLACK_HOLE_WORLD_DIAMETER / diameter);
    root.traverse((obj) => {
      obj.frustumCulled = false;
      obj.castShadow = false;
      obj.receiveShadow = false;
    });
    group.add(root);
    root.traverse((obj) => {
      if (obj.name === "Blackhole_ring") api.ring = obj;
    });
    const clip = gltf.animations?.[0];
    if (clip) {
      api.mixer = new THREE.AnimationMixer(root);
      api.mixer.clipAction(clip).play();
    }
    api.ready = true;
  });

  /**
   * Hit the disk plane. Returns the in-plane radius, or null on a miss.
   * @param {number} clientX
   * @param {number} clientY
   * @param {number} width
   * @param {number} height
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} out
   */
  const hitDisk = (clientX, clientY, width, height, camera, out) => {
    _ndc.set((clientX / width) * 2 - 1, -(clientY / height) * 2 + 1);
    _raycaster.setFromCamera(_ndc, camera);
    const origin = _raycaster.ray.origin;
    const dir = _raycaster.ray.direction;
    const denom = dir.dot(_axis);
    if (Math.abs(denom) < 1e-5) return null;
    const tHit = _ref.copy(group.position).sub(origin).dot(_axis) / denom;
    if (tHit < 0) return null;
    _raycaster.ray.at(tHit, out);
    _radial.copy(out).sub(group.position);
    _radial.addScaledVector(_axis, -_radial.dot(_axis));
    return _radial.length();
  };

  /** @param {number} radius @param {number} az @param {THREE.Vector3} out */
  const pointOnDisk = (radius, az, out) => {
    out.copy(group.position);
    out.addScaledVector(_basisA, Math.cos(az) * radius);
    out.addScaledVector(_basisB, Math.sin(az) * radius);
  };

  /** @param {THREE.Vector3} world @param {THREE.Camera} camera @param {number} width @param {number} height */
  const projectCss = (world, camera, width, height) => {
    _p1.copy(world).project(camera);
    return {
      x: (_p1.x * 0.5 + 0.5) * width,
      y: (0.5 - _p1.y * 0.5) * height,
      z: _p1.z
    };
  };

  /**
   * Pointer over the disk → flow heading plus a point on an invisible lane.
   * The lane is a circle (a spiral step inward), so the blob arcs instead of
   * cutting across the hole. Null when the ray misses the disk.
   * @param {THREE.Camera} camera
   * @param {number} clientX
   * @param {number} clientY
   * @param {number} width
   * @param {number} height
   * @param {number} blobX follower CSS x
   * @param {number} blobY follower CSS y
   * @param {number} dt seconds
   * @returns {{ strength: number, angle: number, guideX: number, guideY: number, curve: number } | null}
   */
  api.samplePointerShear = (camera, clientX, clientY, width, height, blobX, blobY, dt) => {
    if (!api.ready || !group.visible || width < 1 || height < 1) return null;
    group.updateMatrixWorld(true);
    const spinParent = api.ring?.parent ?? group;
    _axis.set(0, 1, 0).transformDirection(spinParent.matrixWorld);
    if (_axis.lengthSq() < 1e-8) return null;
    _axis.normalize();
    _ref.set(Math.abs(_axis.y) > 0.85 ? 1 : 0, Math.abs(_axis.y) > 0.85 ? 0 : 1, 0);
    _basisA.crossVectors(_ref, _axis);
    if (_basisA.lengthSq() < 1e-8) return null;
    _basisA.normalize();
    _basisB.crossVectors(_axis, _basisA).normalize();

    const pointerR = hitDisk(clientX, clientY, width, height, camera, _hit);
    if (pointerR == null) return null;
    const diskR = BLACK_HOLE_WORLD_DIAMETER * 0.5;
    if (pointerR > diskR) return null;

    const pointerAz = Math.atan2(_basisB.dot(_radial), _basisA.dot(_radial));
    const horizon = diskR * BLACK_HOLE_HORIZON_FRAC;
    const outer = diskR * 0.96;
    const span = Math.max(outer - horizon, 0.001);
    const laneT = Math.min(Math.max((pointerR - horizon) / span, 0), 1);
    const laneIndex = Math.round(laneT * (BLACK_HOLE_TRACK_COUNT - 1));
    const laneR = horizon + (laneIndex / (BLACK_HOLE_TRACK_COUNT - 1)) * span;

    let blobAz = pointerAz;
    let blobR = laneR;
    if (Number.isFinite(blobX) && Number.isFinite(blobY)) {
      const blobRadius = hitDisk(blobX, blobY, width, height, camera, _guide);
      if (blobRadius != null && blobRadius < diskR * 1.15) {
        blobAz = Math.atan2(_basisB.dot(_radial), _basisA.dot(_radial));
        blobR = Math.min(Math.max(blobRadius, horizon), outer);
      }
    }

    const stepDt = Math.min(Math.max(dt || 1 / 60, 0), 0.05);
    let dAz = pointerAz - blobAz;
    dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
    const nextAz = blobAz + dAz * (1 - Math.exp(-BLACK_HOLE_TRACK_ANGULAR_RATE * stepDt));
    const nextR = blobR + (laneR - blobR) * (1 - Math.exp(-BLACK_HOLE_TRACK_RADIAL_RATE * stepDt));

    const edge = Math.min(Math.max((pointerR - diskR * 0.86) / (diskR * 0.14), 0), 1);
    const strength = BLACK_HOLE_SHEAR_STRENGTH * (1 - edge * edge);

    const flowAz = nextAz + 0.22;
    const flowR = Math.max(horizon, nextR * (1 - BLACK_HOLE_SHEAR_INWARD * 0.22));
    pointOnDisk(nextR, nextAz, _p0);
    pointOnDisk(flowR, flowAz, _flow);
    const css0 = projectCss(_p0, camera, width, height);
    const css1 = projectCss(_flow, camera, width, height);
    if (css0.z < -1 || css0.z > 1) return null;
    const dx = css1.x - css0.x;
    const dy = css1.y - css0.y;
    const angle = dx * dx + dy * dy > 1e-4 ? Math.atan2(dy, dx) : pointerAz;

    const centerCss = projectCss(group.position, camera, width, height);
    const sideX = -Math.sin(angle);
    const sideY = Math.cos(angle);
    const bendSign = Math.sign((centerCss.x - css0.x) * sideX + (centerCss.y - css0.y) * sideY) || 1;
    const curve = bendSign * THREE.MathUtils.clamp(1.15 / Math.max(nextR, 0.45), 0.4, 2.4);

    return { strength, angle, guideX: css0.x, guideY: css0.y, curve };
  };

  return api;
}
