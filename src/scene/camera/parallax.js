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
export function createParallax({ maxOffset = 0.245, omega = 7 } = {}) {
  const raw = { x: 0, y: 0 };
  const smoothed = { x: 0, y: 0, vx: 0, vy: 0 };
  /** External multiplier (e.g. damp zones) — applied relative to an entry anchor. */
  let strength = 1;
  /** Parallax field position captured when damp engages — preserves framing. */
  let anchorX = 0;
  let anchorY = 0;

  function handlePointerMove(e) {
    raw.x = (e.clientX / window.innerWidth) * 2 - 1;
    raw.y = (e.clientY / window.innerHeight) * 2 - 1;
  }

  function setPointerNdc(x, y) {
    raw.x = x;
    raw.y = y;
  }

  /**
   * 0–1+ parallax strength. Scaling is anchor-relative so entering a damp zone
   * holds the current field position instead of yanking toward center.
   * @param {number} value
   */
  function setStrength(value) {
    const next = Number.isFinite(value) ? Math.max(0, value) : 1;
    // Crossing into damp — lock where the user currently sits in the field.
    if (strength >= 0.999 && next < 0.999) {
      anchorX = smoothed.x;
      anchorY = smoothed.y;
    }
    strength = next;
  }

  function update(dt) {
    [smoothed.x, smoothed.vx] = springTo(smoothed.x, smoothed.vx, raw.x, omega, dt);
    [smoothed.y, smoothed.vy] = springTo(smoothed.y, smoothed.vy, raw.y, omega, dt);
  }

  function getOffset(camera, out) {
    // strength=1 → full cursor; strength=0.2 → hold anchor + 20% of further motion.
    const lx = anchorX + (smoothed.x - anchorX) * strength;
    const ly = anchorY + (smoothed.y - anchorY) * strength;
    const amp = maxOffset;
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    _up.setFromMatrixColumn(camera.matrixWorld, 1);
    return out
      .copy(_right)
      .multiplyScalar(lx * amp)
      .addScaledVector(_up, -ly * amp);
  }

  return {
    attach(el) {
      el.addEventListener("pointermove", handlePointerMove);
    },
    detach(el) {
      el.removeEventListener("pointermove", handlePointerMove);
    },
    setPointerNdc,
    setStrength,
    update,
    getOffset,
    get strength() {
      return strength;
    }
  };
}
