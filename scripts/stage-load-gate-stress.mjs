/**
 * Load-gate commit-once: a late LoadingManager.onLoad (deferred GLB) must not
 * re-compile or fire onReady a second time.
 */
import { createStageLoadGate } from "../src/scene/stage/StageLoadGate.js";

if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

let passed = 0;
let failed = 0;

function assert(cond, name) {
  if (cond) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failed += 1;
    console.log(`✗ ${name}`);
  }
}

function makeHarness({ bootMinMs = 0 } = {}) {
  let compileCount = 0;
  let readyCount = 0;
  let dismissCount = 0;
  const manager = { itemsTotal: 0, itemsLoaded: 0 };
  const bootSequence = {
    setProgress() {},
    dismiss() {
      dismissCount += 1;
    }
  };
  const renderer = {
    compile() {
      compileCount += 1;
    }
  };
  const post = { warm() {}, _scene: {} };
  const gate = createStageLoadGate({
    manager,
    bootSequence,
    renderer,
    scene: {},
    camera: {},
    post,
    bootMinMs,
    onReady: () => {
      readyCount += 1;
    }
  });
  return {
    manager,
    gate,
    counts: () => ({ compileCount, readyCount, dismissCount })
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const empty = makeHarness({ bootMinMs: 0 });
empty.gate.finishSeeding();
await wait(5);
assert(empty.counts().compileCount === 1, "empty gating set compiles once");
assert(empty.counts().readyCount === 1, "empty gating set unlocks once");
empty.manager.onLoad();
empty.manager.onLoad();
await wait(5);
assert(empty.counts().compileCount === 1, "late onLoad does not re-compile");
assert(empty.counts().readyCount === 1, "late onLoad does not re-unlock");
assert(empty.counts().dismissCount === 1, "fader dismisses once");

const pending = makeHarness({ bootMinMs: 40 });
pending.manager.itemsTotal = 2;
pending.manager.itemsLoaded = 1;
pending.gate.finishSeeding();
assert(pending.counts().compileCount === 0, "partial gating set does not finalize");
pending.manager.itemsLoaded = 2;
pending.manager.onLoad();
pending.manager.onLoad();
await wait(60);
assert(pending.counts().compileCount === 1, "gating onLoad commits once during min-boot wait");
assert(pending.counts().readyCount === 1, "gating onLoad unlocks once after min-boot");

console.log(`\nStage load gate stress: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
