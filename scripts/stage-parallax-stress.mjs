import { runStageParallaxHandoffStressTest } from "../src/scene/stage/stageParallaxMotion.js";

const { passed, failed, results } = runStageParallaxHandoffStressTest();

for (const result of results) {
  const mark = result.ok ? "✓" : "✗";
  console.log(`${mark} ${result.name}${result.error ? ` — ${result.error}` : ""}`);
}

console.log("");
console.log(`Stage parallax handoff stress: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
