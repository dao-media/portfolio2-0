import { StageExperience } from "./scene/StageExperience.js";
import { AudioToggleFab } from "./ui/AudioToggleFab.js";

const canvas = document.getElementById("scene-canvas");
if (!canvas) {
  throw new Error("Missing #scene-canvas element");
}

new AudioToggleFab();
new StageExperience(canvas);
