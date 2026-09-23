import { StageExperience } from "./scene/StageExperience.js";
import { AudioToggleFab } from "./ui/AudioToggleFab.js";
import { FogTuner } from "./ui/FogTuner.js";
import { EdgeGlitchTuner } from "./ui/EdgeGlitchTuner.js";
import { WaterCursorRimTuner } from "./ui/WaterCursorRimTuner.js";
import { LawnEdgeTuner } from "./ui/LawnEdgeTuner.js";
import { AccentTuner } from "./ui/AccentTuner.js";
import { WetFloorTuner } from "./ui/WetFloorTuner.js";

const canvas = document.getElementById("scene-canvas");
if (!canvas) {
  throw new Error("Missing #scene-canvas element");
}

new AudioToggleFab();
new StageExperience(canvas);

// Fog tuner — press Shift+F to open/close.
// Available in all environments (dev + prod preview) for tuning.
new FogTuner();

// Edge glitch tuner — press Shift+G to open/close.
new EdgeGlitchTuner();

// Water-cursor rim RESPONSE tuner — press Shift+C (glitch untouched).
new WaterCursorRimTuner();

// Bust lawn edge — press Shift+L (fog/glitch/bust mesh untouched).
new LawnEdgeTuner();

// Accent lights (rim / sweep / shaft) — press Shift+A.
new AccentTuner();

// Wet concrete floor (probe reflections) — press Shift+W.
new WetFloorTuner();
