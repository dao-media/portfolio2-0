/**
 * WaterCursor v1 — WebGL overlay integration snippet.
 *
 * Drop into a site-wide embed after the Three.js app creates `renderer` and
 * before/inside the render loop. Uses the same canvas — no second renderer.
 */
import gsap from "gsap";
import { WaterCursor, WATER_CURSOR_VERSION } from "../src/cursor/index.js";

// --- after renderer exists ---
const cursor = WaterCursor.tryCreate({
  renderer,
  ticker: gsap.ticker
});

if (cursor) {
  console.info(`[WaterCursor] v${WATER_CURSOR_VERSION} active`);
}

// --- each frame, AFTER main scene + post (order matters) ---
function renderFrame() {
  post.render(mainScene, mainCamera, elapsed);
  cursor?.render();
  requestAnimationFrame(renderFrame);
}

// --- raycaster hover (existing handler) ---
function onPointerMove(clientX, clientY) {
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.intersectObjects(interactiveMeshes, true)[0];
  cursor?.setHover(Boolean(hit));
}

// --- press state (existing pointerdown/up on canvas) ---
canvas.addEventListener("pointerdown", () => {
  if (isOverInteractive) cursor?.setPressed(true);
});
canvas.addEventListener("pointerup", () => cursor?.setPressed(false));

// --- resize ---
window.addEventListener("resize", () => {
  cursor?.resize(window.innerWidth, window.innerHeight);
});

// --- teardown ---
// cursor?.dispose();
