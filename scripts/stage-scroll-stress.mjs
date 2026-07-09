import { runStageScrollStressTest } from "../src/scene/stage/stageScrollStressTest.js";

const { passed, failed, results } = runStageScrollStressTest();

for (const result of results) {
  const mark = result.ok ? "✓" : "✗";
  console.log(`${mark} ${result.name}${result.error ? ` — ${result.error}` : ""}`);
}

console.log("");
console.log(`Stage scroll stress: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
