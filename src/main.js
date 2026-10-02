import { HUDController } from "./ui/HUDController.js";
import { startStageHost } from "./stage/stageHost.js";

function boot() {
  const canvas = document.getElementById("scene-canvas");
  if (!canvas) return;
  const hud = new HUDController();
  if (import.meta.env.DEV) window.__hud = hud;
  startStageHost(canvas, { hud });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
