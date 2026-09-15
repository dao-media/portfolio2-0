import * as THREE from "three";
import { STAGE_LABEL_RADIUS } from "./constants.js";

/** @deprecated Use BUST_HEIGHT — kept for any leftover imports. */
export const BUST_ORB_DIAMETER = 4;
/** @deprecated Use BUST_ORB_DIAMETER */
export const MONOLITH_ORB_DIAMETER = BUST_ORB_DIAMETER;

export function addDegreeLabels(world) {
  for (let d = 0; d < 360; d += 15) {
    const angle = THREE.MathUtils.degToRad(d);
    const major = d % 90 === 0;
    const label = makeDegreeLabel(`${d}°`);
    label.position.set(Math.sin(angle) * STAGE_LABEL_RADIUS, 0.02, Math.cos(angle) * STAGE_LABEL_RADIUS);
    label.rotation.order = "YXZ";
    label.rotation.y = angle;
    label.rotation.x = -Math.PI / 2;
    if (major) label.material.color.setHex(0xfff2c0);
    world.add(label);
  }
}

function makeDegreeLabel(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "600 32px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 32);
  const texture = new THREE.CanvasTexture(canvas);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.75),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  );
}
