import { runWaterCursorStressTest } from "../src/cursor/waterCursorStressTest.js";
import { WATER_CURSOR_VERSION } from "../src/cursor/waterCursorConfig.js";

const { passed, failed, results } = runWaterCursorStressTest();

for (const result of results) {
  const mark = result.ok ? "✓" : "✗";
  console.log(`${mark} ${result.name}${result.error ? ` — ${result.error}` : ""}`);
}

console.log("");
console.log(`WaterCursor v${WATER_CURSOR_VERSION} stress: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
