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
const _occRay = new THREE.Vector3();
const _occHole = new THREE.Vector3();
const _limb = new THREE.Vector3();

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
/** Pointer inside this fraction of the disk radius can be captured. */
export const BLACK_HOLE_CAPTURE_FRAC = 0.72;
/** Orbit the blob settles onto after it is sucked in. */
export const BLACK_HOLE_ORBIT_FRAC = 0.56;
/** Constant orbit speed once captured, radians per second. */
export const BLACK_HOLE_ORBIT_RATE = 1.85;
/** How fast the radius eases onto the orbit (1/s). */
export const BLACK_HOLE_SUCK_RATE = 2.8;
/** Pointer slower than this (px/s) counts as resting. */
export const BLACK_HOLE_CAPTURE_SPEED = 70;
/** Rest this long inside the capture radius before the suck. */
export const BLACK_HOLE_CAPTURE_STILL_SEC = 0.06;
/** Pointer travel from the capture point that yanks the blob back. */
export const BLACK_HOLE_CAPTURE_RELEASE_PX = 16;
/** After a yank, ignore recapture for this long. */
export const BLACK_HOLE_CAPTURE_COOLDOWN = 0.28;
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

  let captured = false;
  let orbitAz = 0;
  let orbitR = 0;
  let captureX = 0;
  let captureY = 0;
  let stillSec = 0;
  let cooldown = 0;
  let lastPointerX = NaN;
  let lastPointerY = NaN;

  /**
   * Resting pointer inside the inner disk sucks the blob onto one orbit.
   * It loops there until the pointer moves, which drops the guide so the
   * blob returns to the cursor. Null while the blob should follow the pointer.
   * @param {THREE.Camera} camera
   * @param {number} clientX
   * @param {number} clientY
   * @param {number} width
   * @param {number} height
   * @param {number} _blobX
   * @param {number} _blobY
   * @param {number} dt seconds
   * @returns {{ strength: number, angle: number, guideX: number, guideY: number, curve: number, behind: number, holeX: number, holeY: number, holeRad: number } | null}
   */
  api.samplePointerShear = (camera, clientX, clientY, width, height, _blobX, _blobY, dt) => {
    api.pointerOverDisk = false;
    if (!api.ready || !group.visible || width < 1 || height < 1) {
      captured = false;
      stillSec = 0;
      lastPointerX = NaN;
      return null;
    }
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

    const diskR = BLACK_HOLE_WORLD_DIAMETER * 0.5;
    const horizon = diskR * BLACK_HOLE_HORIZON_FRAC;
    const stepDt = Math.min(Math.max(dt || 1 / 60, 0), 0.05);
    cooldown = Math.max(0, cooldown - stepDt);

    const pointerR = hitDisk(clientX, clientY, width, height, camera, _hit);
    const pointerAz =
      pointerR == null ? 0 : Math.atan2(_basisB.dot(_radial), _basisA.dot(_radial));
    const overDisk = pointerR != null && pointerR <= diskR * 1.08;
    api.pointerOverDisk = overDisk;
    const overCapture = pointerR != null && pointerR <= diskR * BLACK_HOLE_CAPTURE_FRAC;

    let pointerSpeed = 0;
    if (Number.isFinite(lastPointerX)) {
      pointerSpeed = Math.hypot(clientX - lastPointerX, clientY - lastPointerY) / stepDt;
    }
    lastPointerX = clientX;
    lastPointerY = clientY;

    const release = () => {
      captured = false;
      stillSec = 0;
      cooldown = BLACK_HOLE_CAPTURE_COOLDOWN;
      return null;
    };

    if (captured) {
      const moved = Math.hypot(clientX - captureX, clientY - captureY);
      if (!overDisk || moved > BLACK_HOLE_CAPTURE_RELEASE_PX) return release();
      orbitAz += BLACK_HOLE_ORBIT_RATE * stepDt;
      const targetR = diskR * BLACK_HOLE_ORBIT_FRAC;
      const suck = 1 - Math.exp(-BLACK_HOLE_SUCK_RATE * stepDt);
      orbitR += (targetR - orbitR) * suck;
      return poseOnDisk(orbitR, orbitAz);
    }

    if (!overCapture || cooldown > 0) {
      stillSec = 0;
      return null;
    }
    if (pointerSpeed < BLACK_HOLE_CAPTURE_SPEED) stillSec += stepDt;
    else stillSec = 0;
    if (stillSec < BLACK_HOLE_CAPTURE_STILL_SEC) return null;

    captured = true;
    captureX = clientX;
    captureY = clientY;
    orbitAz = pointerAz;
    orbitR = Math.max(pointerR, horizon);
    return poseOnDisk(orbitR, orbitAz);

    function poseOnDisk(radius, az) {
      const flowAz = az + 0.22;
      const flowR = Math.max(horizon, radius * (1 - BLACK_HOLE_SHEAR_INWARD * 0.22));
      pointOnDisk(radius, az, _p0);
      pointOnDisk(flowR, flowAz, _flow);
      const css0 = projectCss(_p0, camera, width, height);
      const css1 = projectCss(_flow, camera, width, height);
      if (css0.z < -1 || css0.z > 1) return null;
      const dx = css1.x - css0.x;
      const dy = css1.y - css0.y;
      const angle = dx * dx + dy * dy > 1e-4 ? Math.atan2(dy, dx) : az;

      const centerCss = projectCss(group.position, camera, width, height);
      const sideX = -Math.sin(angle);
      const sideY = Math.cos(angle);
      const bendSign = Math.sign((centerCss.x - css0.x) * sideX + (centerCss.y - css0.y) * sideY) || 1;
      const curve = bendSign * THREE.MathUtils.clamp(1.15 / Math.max(radius, 0.45), 0.4, 2.4);

      _occRay.copy(_p0).sub(camera.position);
      _occHole.copy(group.position).sub(camera.position);
      const seg2 = Math.max(_occRay.lengthSq(), 1e-6);
      const alongRay = _occHole.dot(_occRay) / seg2;
      let behind = 0;
      if (alongRay > 0.04 && alongRay < 0.98) {
        _occHole.copy(camera.position).addScaledVector(_occRay, alongRay);
        const miss = _occHole.distanceTo(group.position);
        behind = 1 - THREE.MathUtils.smoothstep(miss, horizon * 0.62, horizon * 1.15);
      }
      _limb.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(horizon);
      _limb.add(group.position);
      const limbCss = projectCss(_limb, camera, width, height);
      const holeRad = Math.hypot(limbCss.x - centerCss.x, limbCss.y - centerCss.y);

      return {
        strength: BLACK_HOLE_SHEAR_STRENGTH,
        angle,
        guideX: css0.x,
        guideY: css0.y,
        curve,
        behind,
        holeX: centerCss.x,
        holeY: centerCss.y,
        holeRad
      };
    }
  };

  return api;
}
