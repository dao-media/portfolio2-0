import { PortfolioExperience } from "./scene/PortfolioExperience.js";

const canvas = document.getElementById("scene-canvas");
if (!canvas) {
  throw new Error("Missing #scene-canvas element");
}

new PortfolioExperience(canvas);
