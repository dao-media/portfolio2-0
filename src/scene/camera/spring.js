// Closed-form critically-damped spring (ζ = 1) — frame-rate independent and
// unconditionally stable at any dt, unlike a naive Euler-integrated spring.
// Retargeting mid-flight is a single field write (just pass a new `target`)
// because value/velocity fully describe the system — there's no separate
// "restart from stale start value" step the way a tween needs, which is
// what makes this safe to interrupt every frame without a seam.
export function springTo(value, velocity, target, omega, dt) {
  const ex = Math.exp(-omega * dt);
  const c1 = value - target;
  const c2 = velocity + omega * c1;
  const newValue = target + (c1 + c2 * dt) * ex;
  const newVelocity = (velocity - omega * c2 * dt) * ex;
  return [newValue, newVelocity];
}

// In-place Vector3 convenience — avoids per-frame allocation in hot paths.
export function springVec3To(current, velocity, target, omega, dt) {
  let nx, nvx, ny, nvy, nz, nvz;
  [nx, nvx] = springTo(current.x, velocity.x, target.x, omega, dt);
  [ny, nvy] = springTo(current.y, velocity.y, target.y, omega, dt);
  [nz, nvz] = springTo(current.z, velocity.z, target.z, omega, dt);
  current.set(nx, ny, nz);
  velocity.set(nvx, nvy, nvz);
}
