import * as THREE from "three";
import { springTo } from "./spring.js";

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

// Pointer position -> a small spring-smoothed offset vector. Reads the
// camera's already-derived basis vectors (right/up from matrixWorld) and
// never touches rig state directly — CameraRig adds the returned offset to
// camera.position strictly after setting the authoritative pose each frame,
// so parallax can't fight or feed back into the spring state driving theta/
// radius/height/lookAt.
export function createParallax({ maxOffset = 0.35, omega = 7 } = {}) {
  const raw = { x: 0, y: 0 };
  const smoothed = { x: 0, y: 0, vx: 0, vy: 0 };

  function handlePointerMove(e) {
    raw.x = (e.clientX / window.innerWidth) * 2 - 1;
    raw.y = (e.clientY / window.innerHeight) * 2 - 1;
  }

  function setPointerNdc(x, y) {
    raw.x = x;
    raw.y = y;
  }

  function update(dt) {
    [smoothed.x, smoothed.vx] = springTo(smoothed.x, smoothed.vx, raw.x, omega, dt);
    [smoothed.y, smoothed.vy] = springTo(smoothed.y, smoothed.vy, raw.y, omega, dt);
  }

  function getOffset(camera, out) {
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    _up.setFromMatrixColumn(camera.matrixWorld, 1);
    return out
      .copy(_right)
      .multiplyScalar(smoothed.x * maxOffset)
      .addScaledVector(_up, -smoothed.y * maxOffset);
  }

  return {
    attach(el) {
      el.addEventListener("pointermove", handlePointerMove);
    },
    detach(el) {
      el.removeEventListener("pointermove", handlePointerMove);
    },
    setPointerNdc,
    update,
    getOffset
  };
}
