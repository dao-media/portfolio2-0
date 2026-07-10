import * as THREE from "three";
import { springTo, springVec3To } from "./spring.js";
import { TWO_PI, mod, shortestAngleDelta } from "./ringLayout.js";
import { createScrollAdvance } from "./scrollAdvance.js";
import { createParallax } from "./parallax.js";

const SETTLE_VALUE_EPS = 1.5e-3;
const SETTLE_VELOCITY_EPS = 1e-3;

const _parallaxOffset = new THREE.Vector3();
const _viewDir = new THREE.Vector3();

/**
 * Turntable ring camera — matches the original stage travel model:
 * - Camera stays on a fixed POV outside the ring (facing +Z / LOOK)
 * - The world group rotates so vignettes travel around the circular path
 * - Pageload = height spring; zoom = pull along the view axis toward LOOK
 *
 * `theta` is the stage angle of the active vignette (0 at +Z). World Y rotation
 * is `-theta`, same as the old vignetteAnchorRotation convention.
 */
export class CameraRig {
  constructor(
    camera,
    ring,
    {
      world,
      lookAt = new THREE.Vector3(0, 2.35, 18),
      restPosition = new THREE.Vector3(0, 2.85, 28),
      pageloadHeight,
      zoomDistance = 4.2,
      zoomHeight,
      startIndex = 0,
      omegaTheta = 4.5,
      omegaRadius = 3.0,
      omegaHeight = 2.5,
      omegaLookAt = 5.5,
      parallax
    } = {}
  ) {
    this.camera = camera;
    this.ring = ring;
    this.world = world;
    this.enabled = true;

    this.lookAtRest = lookAt.clone();
    this.restPosition = restPosition.clone();
    this.zoomDistance = zoomDistance;
    this.zoomHeight = zoomHeight ?? restPosition.y - 0.7;

    this.omegaTheta = omegaTheta;
    this.omegaRadius = omegaRadius;
    this.omegaHeight = omegaHeight;
    this.omegaLookAt = omegaLookAt;

    const start = ring[startIndex];
    // Stage angle of vignette i — world.rotation.y = -theta brings it to +Z.
    const startTheta = start.angle;

    this.state = {
      theta: startTheta,
      thetaVelocity: 0,
      thetaTarget: startTheta,

      // 0 at rest; negative pulls the camera toward LOOK (zoom in).
      radialOffset: 0,
      radialOffsetVelocity: 0,
      radialOffsetTarget: 0,

      height: pageloadHeight ?? restPosition.y,
      heightVelocity: 0,
      heightTarget: restPosition.y,

      lookAt: this.lookAtRest.clone(),
      lookAtVelocity: new THREE.Vector3(),
      lookAtTarget: this.lookAtRest.clone(),

      index: startIndex,
      isZoomed: false,
      isSettled: false
    };

    // Pageload: freeze orientation at the resting look; only height animates.
    const introPos = this.restPosition.clone();
    introPos.y = this.state.heightTarget;
    const introMatrix = new THREE.Matrix4().lookAt(introPos, this.lookAtRest, camera.up);
    this._introQuaternion = new THREE.Quaternion().setFromRotationMatrix(introMatrix);
    this._introActive = true;

    this.scrollAdvance = createScrollAdvance({ onAdvance: (dir) => this.advance(dir) });
    this.parallax = createParallax(parallax);
    this._scrollEl = null;
    this._pointerEl = null;

    if (this.world) {
      this.world.rotation.y = -this.state.theta;
    }
  }

  attachScroll(el) {
    this._scrollEl = el;
    this.scrollAdvance.attach(el);
  }

  attachPointer(el) {
    this._pointerEl = el;
    this.parallax.attach(el);
  }

  dispose() {
    if (this._scrollEl) this.scrollAdvance.detach(this._scrollEl);
    if (this._pointerEl) this.parallax.detach(this._pointerEl);
  }

  advance(direction) {
    const s = this.state;
    const n = this.ring.length;
    const nextIndex = mod(s.index + direction, n);
    const delta = shortestAngleDelta(mod(s.thetaTarget, TWO_PI), this.ring[nextIndex].angle);
    s.thetaTarget += delta;
    s.index = nextIndex;
    s.lookAtTarget.copy(this.lookAtRest);
    if (s.isZoomed) {
      s.radialOffsetTarget = 0;
      s.heightTarget = this.restPosition.y;
      s.isZoomed = false;
    }
  }

  goToIndex(index) {
    const n = this.ring.length;
    const target = mod(index, n);
    const s = this.state;
    if (target === s.index && !s.isZoomed) return;

    const delta = shortestAngleDelta(mod(s.thetaTarget, TWO_PI), this.ring[target].angle);
    s.thetaTarget += delta;
    s.index = target;
    s.lookAtTarget.copy(this.lookAtRest);
    if (s.isZoomed) {
      s.radialOffsetTarget = 0;
      s.heightTarget = this.restPosition.y;
      s.isZoomed = false;
    }
  }

  zoomIn(_index) {
    const s = this.state;
    if (s.isZoomed) return;
    // Pull toward LOOK along the rest view axis (active vignette is at +Z).
    s.radialOffsetTarget = -this.zoomDistance;
    s.heightTarget = this.zoomHeight;
    s.lookAtTarget.copy(this.lookAtRest);
    s.isZoomed = true;
  }

  zoomOut() {
    const s = this.state;
    if (!s.isZoomed) return;
    s.radialOffsetTarget = 0;
    s.heightTarget = this.restPosition.y;
    s.lookAtTarget.copy(this.lookAtRest);
    s.isZoomed = false;
  }

  update(delta) {
    if (!this.enabled) return;

    const s = this.state;
    const dt = Math.min(Math.max(delta, 0), 0.05);

    [s.theta, s.thetaVelocity] = springTo(
      s.theta,
      s.thetaVelocity,
      s.thetaTarget,
      this.omegaTheta,
      dt
    );
    [s.radialOffset, s.radialOffsetVelocity] = springTo(
      s.radialOffset,
      s.radialOffsetVelocity,
      s.radialOffsetTarget,
      this.omegaRadius,
      dt
    );
    [s.height, s.heightVelocity] = springTo(
      s.height,
      s.heightVelocity,
      s.heightTarget,
      this.omegaHeight,
      dt
    );
    springVec3To(s.lookAt, s.lookAtVelocity, s.lookAtTarget, this.omegaLookAt, dt);

    // Turntable: vignettes travel the ring; camera stays on the fixed POV.
    if (this.world) {
      this.world.rotation.y = -s.theta;
    }

    // Rest pose on +Z outside the ring; zoom pulls horizontally toward LOOK.
    _viewDir.subVectors(this.lookAtRest, this.restPosition);
    _viewDir.y = 0;
    if (_viewDir.lengthSq() > 1e-8) _viewDir.normalize();
    this.camera.position.set(
      this.restPosition.x + _viewDir.x * s.radialOffset,
      s.height,
      this.restPosition.z + _viewDir.z * s.radialOffset
    );

    s.isSettled =
      Math.abs(s.thetaVelocity) < SETTLE_VELOCITY_EPS &&
      Math.abs(s.theta - s.thetaTarget) < SETTLE_VALUE_EPS &&
      Math.abs(s.radialOffsetVelocity) < SETTLE_VELOCITY_EPS &&
      Math.abs(s.radialOffset - s.radialOffsetTarget) < SETTLE_VALUE_EPS &&
      Math.abs(s.heightVelocity) < SETTLE_VELOCITY_EPS &&
      Math.abs(s.height - s.heightTarget) < SETTLE_VALUE_EPS;

    if (this._introActive) {
      this.camera.quaternion.copy(this._introQuaternion);
      if (s.isSettled) this._introActive = false;
    } else {
      this.camera.lookAt(s.lookAt);
    }

    this.camera.updateMatrixWorld();
    this.parallax.update(dt);
    this.parallax.getOffset(this.camera, _parallaxOffset);
    this.camera.position.add(_parallaxOffset);
  }
}
