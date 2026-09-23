/**
 * Deterministic hash-jittered instance placement for the Bust meadow disc.
 *
 * WORLD-FIXED lattice: cell (i,j) → stable XZ forever.
 * Growing patch radius only ADDS an outer ring of cells — existing blades
 * never slide apart (the old `-radius + i*cell` anchor did that).
 */

import * as THREE from "three";
import {
  GRASS_BASE_CELL,
  GRASS_MAX_INSTANCES,
  GRASS_MIN_CELL
} from "./GrassConfig.js";
import { lawnCoverageAlive, lawnFbm } from "./lawnCoverage.js";

function fract(x) {
  return x - Math.floor(x);
}

function hash2(i, j) {
  return fract(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
}

/**
 * Spacing from blade length + density, floored, then widened if the disc would
 * exceed budget so we never paint only one corner of the meadow.
 * @param {number} radius
 * @param {number} bladeLength
 * @param {number} density
 * @param {number} maxInstances
 */
function resolveCell(radius, bladeLength, density, maxInstances) {
  const dens = Math.max(0.2, density ?? 1);
  // Higher density → smaller cell. Floor scales with dens so 4× is still allowed.
  const minCell = GRASS_MIN_CELL / Math.min(dens, 2.5);
  let cell = Math.max(minCell, (GRASS_BASE_CELL * bladeLength) / dens);
  const est = Math.ceil(Math.PI * (radius / cell) ** 2 * 1.2);
  if (est > maxInstances) {
    cell = radius * Math.sqrt((Math.PI * 1.2) / maxInstances);
  }
  return cell;
}

/**
 * @param {{
 *   radius: number,
 *   bladeLength?: number,
 *   bladeDensity?: number,
 *   tuftAmount?: number,
 *   coverage: {
 *     coverageNoiseScale: number,
 *     edgeFalloff: number,
 *     stragglerDensity: number,
 *     shapeDistortion: number
 *   },
 *   layout: {
 *     bustX: number,
 *     bustZ: number,
 *     bustHalfX: number,
 *     bustHalfZ: number,
 *     bustYaw: number,
 *     bustLipMin?: number,
 *     bustLipJitter?: number,
 *     bustPeak?: number,
 *     bustOuter?: number,
 *     tubeX: number,
 *     tubeZ: number,
 *     tubeClear?: number,
 *     tubeInner: number,
 *     tubeOuter: number,
 *     treeX: number,
 *     treeZ: number,
 *     treeInner: number,
 *     treeOuter: number
 *   },
 *   maxInstances?: number
 * }} opts
 * @returns {{
 *   matrices: THREE.Matrix4[],
 *   bladeAttrs: Float32Array,
 *   phases: Float32Array,
 *   count: number,
 *   cell: number,
 *   gridRes: number
 * }}
 */
export function buildGrassInstances(opts) {
  const radius = Math.max(opts.radius, 1e-4);
  const bladeLength = Math.max(opts.bladeLength ?? 1, 0.05);
  const bladeDensity = Math.max(0.2, opts.bladeDensity ?? 1);
  const tuftAmount = Math.min(1, Math.max(0, opts.tuftAmount ?? 0));
  const maxInstances = opts.maxInstances ?? GRASS_MAX_INSTANCES;
  const cell = resolveCell(radius, bladeLength, bladeDensity, maxInstances);
  const coverage = {
    radius,
    ...opts.coverage
  };
  const layout = opts.layout;
  const halfX = Math.max(layout.bustHalfX ?? 0.98, 1e-4);
  const halfZ = Math.max(layout.bustHalfZ ?? 0.88, 1e-4);
  const yaw = layout.bustYaw ?? 0;
  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);
  const lipMin = layout.bustLipMin ?? 1.18;
  const lipJitter = layout.bustLipJitter ?? 0.42;

  // Integer lattice covering the disc — anchored at origin, NOT at -radius
  const iMin = Math.floor(-radius / cell) - 1;
  const iMax = Math.ceil(radius / cell) + 1;
  const gridRes = iMax - iMin + 1;

  /** @type {THREE.Matrix4[]} */
  const matrices = [];
  const bladeAttrs = [];
  const phases = [];
  const dummy = new THREE.Object3D();
  const r2 = radius * radius;
  // Low-freq field for tuft clumps (independent of coverage frequency)
  const tuftScale = 1.15 + tuftAmount * 0.85;

  for (let j = iMin; j <= iMax; j++) {
    for (let i = iMin; i <= iMax; i++) {
      if (matrices.length >= maxInstances) break;

      const h0 = hash2(i, j);
      const h1 = hash2(i + 19, j + 47);
      const h2 = hash2(i + 91, j + 13);
      const h3 = hash2(i + 3, j + 71);

      // Stable world position for cell (i,j) — independent of radius
      let x = (i + (h0 - 0.5) * 0.85) * cell;
      let z = (j + (h1 - 0.5) * 0.85) * cell;
      if (x * x + z * z > r2) continue;

      // Hard clear under lantern foot (solid base — no blades through the mesh).
      const tubeClear = layout.tubeClear ?? 0;
      if (tubeClear > 1e-4) {
        const dTube0 = Math.hypot(x - layout.tubeX, z - layout.tubeZ);
        if (dTube0 < tubeClear) continue;
      }

      // Ellipse-normalized distance to bust pedestal.
      const dx0 = x - layout.bustX;
      const dz0 = z - layout.bustZ;
      const lx = dx0 * cosY - dz0 * sinY;
      const lz = dx0 * sinY + dz0 * cosY;
      let nEll = Math.hypot(lx / halfX, lz / halfZ);
      const targetN = lipMin + h2 * lipJitter;
      const underBust = nEll < targetN;

      // Under the pedestal: always keep the sample and shove it to the lip
      // (builds a dense natural ring). Elsewhere: normal coverage cull.
      if (!underBust && !lawnCoverageAlive(x, z, coverage)) continue;

      let contact = 0;
      if (underBust) {
        const scale = targetN / Math.max(nEll, 1e-4);
        const nlx = lx * scale;
        const nlz = lz * scale;
        // local → grass XZ (undo -yaw)
        x = layout.bustX + nlx * cosY + nlz * sinY;
        z = layout.bustZ - nlx * sinY + nlz * cosY;
        contact = 1;
        nEll = targetN;
      } else {
        contact = smoothstep(targetN + 0.55, targetN, nEll);
      }
      if (x * x + z * z > r2) continue;

      // After bust lip shove, drop anything that landed in the lantern clear.
      const tubeD = Math.hypot(x - layout.tubeX, z - layout.tubeZ);
      if (tubeClear > 1e-4 && tubeD < tubeClear) continue;

      const tubeTuft = smoothstep(layout.tubeOuter, layout.tubeInner, tubeD);
      const treeD = Math.hypot(x - layout.treeX, z - layout.treeZ);
      const treeTuft = smoothstep(layout.treeOuter, layout.treeInner, treeD);
      // Tall blades hugging the pedestal lip
      const bustRing = contact * smoothstep(targetN + 0.65, targetN + 0.08, nEll);

      // Random taller meadow tufts — frequency rises with tuftAmount.
      let meadowTuft = 0;
      if (tuftAmount > 1e-4) {
        const tn = lawnFbm(x * tuftScale + 19.7, z * tuftScale + 4.2);
        const gateLo = 1 - tuftAmount * 0.72;
        const gateHi = 1 - tuftAmount * 0.18;
        meadowTuft = smoothstep(gateLo, gateHi, tn) * (0.55 + 0.45 * h3);
      }

      const heightScale =
        (0.78 + h2 * 0.4) *
        (1 +
          1.15 * bustRing +
          1.35 * tubeTuft * (0.65 + 0.35 * h3) +
          1.55 * treeTuft * (0.65 + 0.35 * h0) +
          (0.85 + 1.55 * tuftAmount) * meadowTuft);
      const widthScale = 0.75 + h3 * 0.55;
      const bladeYaw = h0 * Math.PI * 2;
      // Lean slightly away from the pedestal when hugging the lip
      const away = Math.atan2(z - layout.bustZ, x - layout.bustX);
      const bendBias = (h1 - 0.5) * 0.35 + contact * 0.28;

      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, bladeYaw * (1 - contact * 0.35) + away * contact * 0.35, 0);
      dummy.scale.set(widthScale, heightScale, widthScale);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());

      bladeAttrs.push(heightScale, widthScale, bendBias, h2);
      phases.push(h0 * Math.PI * 2, 0.55 + h1 * 0.9);
    }
  }

  return {
    matrices,
    bladeAttrs: new Float32Array(bladeAttrs),
    phases: new Float32Array(phases),
    count: matrices.length,
    cell,
    gridRes
  };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(
    1,
    Math.max(0, (x - edge0) / Math.max(edge1 - edge0, 1e-6))
  );
  return t * t * (3 - 2 * t);
}
