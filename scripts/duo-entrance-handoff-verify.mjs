/**
 * Duo entrance phases: rising → holding → live (bob then spin).
 * Usage: node scripts/duo-entrance-handoff-verify.mjs
 */
import { DuoIdleMotion } from "../src/scene/duo/duoIdleMotion.js";
import {
  DUO_ENTRANCE_SEC,
  DUO_ENTRANCE_FROM_Y,
  DUO_ENTRANCE_BACK,
  DUO_IDLE_HOLD_SEC,
  DUO_IDLE_BOB_IN_SEC,
  DUO_IDLE_SPIN_DELAY_SEC,
  DUO_IDLE_SPIN_IN_SEC
} from "../src/scene/duo/duoConstants.js";

function power2Out(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 2;
}

function backOut(t, s = 1.45) {
  const x = Math.min(1, Math.max(0, t));
  const x1 = x - 1;
  return 1 + (s + 1) * x1 * x1 * x1 + s * x1 * x1;
}

const dt = 1 / 60;
const idle = new DuoIdleMotion().reset();
let bobIn = 0;
let spinIn = 0;
let liveElapsed = 0;
let idleHoldT = 0;
let entranceElapsed = 0;
let entranceY = DUO_ENTRANCE_FROM_Y;
let phase = "entering";
const frames = [];

function sample(tag) {
  const pivotY = phase === "entering" ? entranceY : idle.y;
  const spin =
    phase === "entering" || phase === "holding"
      ? [0, 0, 0]
      : [idle.pitch, idle.spinYaw, idle.roll];
  const prev = frames[frames.length - 1];
  const row = {
    tag,
    phase,
    entranceY: +entranceY.toFixed(5),
    bobIn: +bobIn.toFixed(3),
    spinIn: +spinIn.toFixed(3),
    pivotY: +pivotY.toFixed(5),
    spinY: +spin[1].toFixed(5)
  };
  if (prev) {
    row.dPivotY = +(row.pivotY - prev.pivotY).toFixed(5);
    row.dSpinY = +(row.spinY - prev.spinY).toFixed(5);
  }
  frames.push(row);
}

const nEnter = Math.ceil(DUO_ENTRANCE_SEC / dt);
let maxY = -Infinity;
for (let i = 0; i < nEnter; i++) {
  entranceElapsed += dt;
  const t = Math.min(1, entranceElapsed / DUO_ENTRANCE_SEC);
  entranceY = DUO_ENTRANCE_FROM_Y * (1 - backOut(t, DUO_ENTRANCE_BACK));
  maxY = Math.max(maxY, entranceY);
  if (entranceElapsed >= DUO_ENTRANCE_SEC - 2 * dt) sample("entering");
}

entranceY = 0;
phase = "holding";
idle.reset();
idleHoldT = DUO_IDLE_HOLD_SEC;
sample("hold-start");

const nHold = Math.ceil(DUO_IDLE_HOLD_SEC / dt);
for (let i = 0; i < nHold; i++) {
  idleHoldT = Math.max(0, idleHoldT - dt);
  if (i === 0 || i === nHold - 1) sample("holding");
}

phase = "live";
bobIn = 0;
spinIn = 0;
liveElapsed = 0;
idle.reset();
sample("live-start");

for (let i = 0; i < 90; i++) {
  liveElapsed += dt;
  bobIn = Math.min(1, bobIn + dt / DUO_IDLE_BOB_IN_SEC);
  if (liveElapsed >= DUO_IDLE_SPIN_DELAY_SEC) {
    spinIn = Math.min(1, spinIn + dt / DUO_IDLE_SPIN_IN_SEC);
  }
  const bob = power2Out(bobIn);
  const spin = power2Out(spinIn);
  idle.tick(dt, liveElapsed, {
    bob,
    spin,
    wobble: spin,
    faceYaw: null
  });
  if (
    i === 0 ||
    i === 10 ||
    Math.abs(liveElapsed - DUO_IDLE_SPIN_DELAY_SEC) < dt ||
    i === 40 ||
    i === 89
  ) {
    sample("live");
  }
}

console.log("Duo phased entrance:");
console.table(
  frames.map((f) => ({
    tag: f.tag,
    phase: f.phase,
    entranceY: f.entranceY,
    bobIn: f.bobIn,
    spinIn: f.spinIn,
    pivotY: f.pivotY,
    dPivotY: f.dPivotY ?? "—",
    spinY: f.spinY,
    dSpinY: f.dSpinY ?? "—"
  }))
);

console.log(`\nOvershoot peak Y=${maxY.toFixed(4)} (want > 0.05)`);
console.log(
  `Hold ${DUO_IDLE_HOLD_SEC}s · bob-in ${DUO_IDLE_BOB_IN_SEC}s · spin delay ${DUO_IDLE_SPIN_DELAY_SEC}s`
);

let failed = false;
if (maxY < 0.05) {
  console.error("FAIL: overshoot too small to see");
  failed = true;
}
const holdStart = frames.find((f) => f.tag === "hold-start");
const liveStart = frames.find((f) => f.tag === "live-start");
if (holdStart && (holdStart.bobIn !== 0 || holdStart.spinIn !== 0)) {
  console.error("FAIL: idle during hold");
  failed = true;
}
if (liveStart && liveStart.spinY !== 0) {
  console.error("FAIL: spin at live-start");
  failed = true;
}
const liveRows = frames.filter((f) => f.tag === "live");
const early = liveRows[0];
const mid = liveRows.find((f) => f.spinIn > 0 && f.spinIn < 0.5);
if (early && early.spinIn > 0) {
  console.error("FAIL: spin started with bob (no stagger)");
  failed = true;
}
if (!mid) {
  console.log("(spin mid sample optional)");
}

if (failed) process.exit(1);
console.log("\nOK — rising → holding → bob → spin (staggered).");
