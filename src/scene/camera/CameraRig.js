import * as THREE from "three";
import { springTo, springVec3To } from "./spring.js";
import { TWO_PI, mod, pointOnRing, shortestAngleDelta } from "./ringLayout.js";
import { createScrollAdvance } from "./scrollAdvance.js";
import { createParallax } from "./parallax.js";

const SETTLE_VALUE_EPS = 1.5e-3;
const SETTLE_VELOCITY_EPS = 1e-3;

const _parallaxOffset = new THREE.Vector3();
const _lookScratch = new THREE.Vector3();

/**
 * Orbital ring camera — vignettes stay fixed; only the camera moves.
 *
 * Camera orbits outside the vignette ring. During travel, look-at is pinned to
 * the vignette ring at the *current* theta so the first lap (and every lap)
 * stays circular — destination look-at springs cut a chord through center and
 * make the first Monolith→Desktop hop feel broken.
 */
export class CameraRig {
  constructor(
    camera,
    ring,
    {
      center = [0, 0, 0],
      restRadius,
      restHeight,
      pageloadHeight,
      zoomRadius,
      zoomHeight,
      lookAtHeight,
      vignetteRadius,
      startIndex = 0,
      // Snappier ring hops — old 4.5 felt like the wheel did nothing.
      omegaTheta = 6.2,
      omegaRadius = 4.0,
      omegaHeight = 3.6,
      omegaLookAt = 6.0,
      parallax
    } = {}
  ) {
    this.camera = camera;
    this.ring = ring;
    this.center = center;
    this.enabled = true;

    this.restRadius = restRadius;
    this.restHeight = restHeight;
    this.zoomRadius = zoomRadius;
    this.zoomHeight = zoomHeight;
    this.lookAtHeight = lookAtHeight ?? ring[startIndex]?.lookAt?.y ?? restHeight - 0.5;
    const measuredRadius = ring.reduce(
      (max, stop) => Math.max(max, stop.horizontalRadius ?? 0),
      0
    );
    this.vignetteRadius = vignetteRadius ?? (measuredRadius || restRadius * 0.65);

    this.omegaTheta = omegaTheta;
    this.omegaRadius = omegaRadius;
    this.omegaHeight = omegaHeight;
    this.omegaLookAt = omegaLookAt;

    const start = ring[startIndex];
    const startLook = this._lookOnRing(start.angle);

    this.state = {
      theta: start.angle,
      thetaVelocity: 0,
      thetaTarget: start.angle,

      radius: restRadius,
      radiusVelocity: 0,
      radiusTarget: restRadius,

      radialOffset: 0,
      radialOffsetVelocity: 0,
      radialOffsetTarget: 0,

      height: pageloadHeight ?? restHeight,
      heightVelocity: 0,
      // Hold at aerial height until StageExperience arms the descent spring.
      heightTarget: pageloadHeight ?? restHeight,

      lookAt: startLook.clone(),
      lookAtVelocity: new THREE.Vector3(),
      lookAtTarget: startLook.clone(),

      index: startIndex,
      isZoomed: false,
      isSettled: false
    };

    // Pageload is a pure vertical dolly: lock the resting look for the entire
    // drop. Live lookAt while descending pitches the camera upward as height
    // falls — that is the tilt we must never do.
    const introPos = pointOnRing(start.angle, restRadius, this.restHeight, center);
    const savedPos = camera.position.clone();
    const savedQuat = camera.quaternion.clone();
    camera.position.copy(introPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(startLook);
    this._introQuaternion = camera.quaternion.clone();
    camera.position.copy(savedPos);
    camera.quaternion.copy(savedQuat);
    this._introActive = true;
    /** Spring look-at back to the ring after zoom-out instead of snapping. */
    this._zoomLookRecovering = false;

    this.scrollAdvance = createScrollAdvance({
      onAdvance: (dir) => this.advance(dir),
      isSettled: () => Boolean(this.state.isSettled)
    });
    this.parallax = createParallax(parallax);
    this._scrollEl = null;
    this._pointerEl = null;
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

  _lookOnRing(theta, out = _lookScratch) {
    return out.copy(
      pointOnRing(theta, this.vignetteRadius, this.lookAtHeight, this.center)
    );
  }

  /**
   * Pageload freezes orientation until height settles. Only interrupt that
   * freeze here — never snap height/look after intro, or zoom-out jumps.
   */
  _beginTravelFromIntro() {
    if (!this._introActive) return;
    const s = this.state;
    this._introActive = false;
    // Don't compound the first ring hop with leftover pageload height spring.
    s.height = this.restHeight;
    s.heightVelocity = 0;
    s.heightTarget = this.restHeight;
    this._lookOnRing(s.theta, s.lookAt);
    s.lookAtTarget.copy(s.lookAt);
    s.lookAtVelocity.set(0, 0, 0);
  }

  advance(direction) {
    const s = this.state;
    if (!s.isSettled) return;
    const n = this.ring.length;
    const nextIndex = mod(s.index + direction, n);
    // Step by the signed scroll direction, not shortest-path — first lap and
    // later laps must keep the same ring sense (no reverse "shortcut" hop).
    const step = (TWO_PI / n) * direction;
    this._beginTravelFromIntro();
    s.thetaTarget += step;
    s.index = nextIndex;
    this._lookOnRing(s.thetaTarget, s.lookAtTarget);
    s.isSettled = false;
    if (s.isZoomed) {
      s.radialOffsetTarget = 0;
      s.heightTarget = this.restHeight;
      s.isZoomed = false;
      this._zoomLookRecovering = true;
    }
  }

  goToIndex(index) {
    const n = this.ring.length;
    const target = mod(index, n);
    const s = this.state;
    if (target === s.index && !s.isZoomed) return;

    const delta = shortestAngleDelta(mod(s.thetaTarget, TWO_PI), this.ring[target].angle);
    this._beginTravelFromIntro();
    s.thetaTarget += delta;
    s.index = target;
    this._lookOnRing(s.thetaTarget, s.lookAtTarget);
    s.isSettled = false;
    if (s.isZoomed) {
      s.radialOffsetTarget = 0;
      s.heightTarget = this.restHeight;
      s.isZoomed = false;
      this._zoomLookRecovering = true;
    }
  }

  /** Begin the pageload height spring (call after the aerial hold). */
  armIntroDescent() {
    this.state.heightTarget = this.restHeight;
    this.state.isSettled = false;
  }

  zoomIn(index) {
    const s = this.state;
    if (s.isZoomed) return;
    this._beginTravelFromIntro();
    this._zoomLookRecovering = false;
    s.radialOffsetTarget = this.zoomRadius - this.restRadius;
    s.heightTarget = this.zoomHeight;
    s.lookAtTarget.copy(this.ring[index].focusPoint);
    s.isZoomed = true;
    s.isSettled = false;
  }

  zoomOut() {
    const s = this.state;
    if (!s.isZoomed) return;
    this._beginTravelFromIntro();
    s.radialOffsetTarget = 0;
    s.heightTarget = this.restHeight;
    this._lookOnRing(s.thetaTarget, s.lookAtTarget);
    s.isZoomed = false;
    this._zoomLookRecovering = true;
    s.isSettled = false;
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
    [s.radius, s.radiusVelocity] = springTo(
      s.radius,
      s.radiusVelocity,
      s.radiusTarget,
      this.omegaRadius,
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

    if (s.isZoomed) {
      springVec3To(s.lookAt, s.lookAtVelocity, s.lookAtTarget, this.omegaLookAt, dt);
    } else if (this._zoomLookRecovering) {
      // Leave zoom by springing aim back to the ring — pinning instantly here
      // was the Sidekick zoom-out framing jump.
      this._lookOnRing(s.theta, s.lookAtTarget);
      springVec3To(s.lookAt, s.lookAtVelocity, s.lookAtTarget, this.omegaLookAt, dt);
      if (
        s.lookAt.distanceToSquared(s.lookAtTarget) < 1e-4 &&
        s.lookAtVelocity.lengthSq() < 1e-4
      ) {
        this._zoomLookRecovering = false;
        s.lookAt.copy(s.lookAtTarget);
        s.lookAtVelocity.set(0, 0, 0);
      }
    } else {
      // Pin look-at to the ring at current theta — same path every lap.
      this._lookOnRing(s.theta, s.lookAtTarget);
      s.lookAt.copy(s.lookAtTarget);
      s.lookAtVelocity.set(0, 0, 0);
    }

    const effectiveRadius = s.radius + s.radialOffset;
    this.camera.position.set(
      this.center[0] + effectiveRadius * Math.sin(s.theta),
      s.height,
      this.center[2] + effectiveRadius * Math.cos(s.theta)
    );

    s.isSettled =
      Math.abs(s.thetaVelocity) < SETTLE_VELOCITY_EPS &&
      Math.abs(s.theta - s.thetaTarget) < SETTLE_VALUE_EPS &&
      Math.abs(s.radiusVelocity) < SETTLE_VELOCITY_EPS &&
      Math.abs(s.radius - s.radiusTarget) < SETTLE_VALUE_EPS &&
      Math.abs(s.radialOffsetVelocity) < SETTLE_VELOCITY_EPS &&
      Math.abs(s.radialOffset - s.radialOffsetTarget) < SETTLE_VALUE_EPS &&
      Math.abs(s.heightVelocity) < SETTLE_VELOCITY_EPS &&
      Math.abs(s.height - s.heightTarget) < SETTLE_VALUE_EPS;

    // Unlock only after the descent has landed at rest height. During the
    // aerial hold the rig is also "settled" (height == pageload target) — if
    // we unlock then, lookAt runs for the whole drop and pitches upward.
    const landedAtRest =
      s.isSettled && Math.abs(s.heightTarget - this.restHeight) < SETTLE_VALUE_EPS;
    if (this._introActive && landedAtRest) {
      this._introActive = false;
      this._lookOnRing(s.theta, s.lookAt);
      s.lookAtTarget.copy(s.lookAt);
      s.lookAtVelocity.set(0, 0, 0);
    }

    if (this._introActive) {
      this.camera.up.set(0, 1, 0);
      this.camera.quaternion.copy(this._introQuaternion);
    } else {
      this.camera.lookAt(s.lookAt);
    }

    this.camera.updateMatrixWorld();
    this.parallax.update(dt);
    // Parallax stays live during pageload — translation only on the locked
    // intro quat (never lookAt), so aim doesn't pitch while height falls.
    this.parallax.getOffset(this.camera, _parallaxOffset);
    this.camera.position.add(_parallaxOffset);

    if (s.isSettled) {
      this.scrollAdvance?.notifySettled?.();
    }
  }
}
