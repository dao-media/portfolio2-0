import * as THREE from "three";

export function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function wrapAngle(radians) {
  const tau = Math.PI * 2;
  return ((radians % tau) + tau) % tau;
}

export function shortestAngleDelta(from, to) {
  let delta = wrapAngle(to) - wrapAngle(from);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function createLabelSprite(text, options = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = options.fontSize ?? 42;
  const padding = options.padding ?? 24;

  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  canvas.width = Math.ceil(metrics.width + padding * 2);
  canvas.height = fontSize + padding * 2;

  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = "rgba(7, 8, 12, 0.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = options.color ?? "#f2f0ea";
  ctx.textBaseline = "middle";
  ctx.fillText(text, padding, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  const scale = options.scale ?? 1.4;
  sprite.scale.set((canvas.width / canvas.height) * scale, scale, 1);
  return sprite;
}
