/**
 * Headless smoke: boot the real WebGL stage, assert no console/page errors
 * through the load gate, a non-blank canvas, and key meshes after a hop cycle.
 *
 * Not visual regression — only "the real thing renders without error."
 */
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5174;
const BOOT_MS = 90_000;
const HOP_MS = 20_000;

function isIgnorableConsoleError(text) {
  // Browser noise that is not a stage failure.
  return /Failed to load resource:.*favicon/i.test(text);
}

function isFatalWebglConsole(text) {
  return /GL_INVALID_FRAMEBUFFER|Framebuffer is incomplete|Attachment has zero size/i.test(
    text
  );
}

async function canvasLooksLit(page) {
  const png = await page.locator("#scene-canvas").screenshot({ type: "png" });
  const stats = await page.evaluate(() => {
    const canvas = document.getElementById("scene-canvas");
    const stage = window.__stage;
    if (!canvas) return { ok: false, reason: "missing canvas" };
    const w = canvas.width;
    const h = canvas.height;
    if (w < 8 || h < 8) return { ok: false, reason: `tiny ${w}x${h}` };
    const triangles = stage?.renderer?.info?.render?.triangles ?? 0;
    return { ok: triangles > 0, w, h, triangles };
  });
  return Boolean(stats.ok && png.length > 4000);
}

async function waitForStageReady(page) {
  await page.waitForFunction(
    () => {
      const stage = window.__stage;
      return Boolean(
        stage &&
          stage.introComplete &&
          !stage.locked &&
          stage.cameraRig?.state?.isSettled &&
          stage.vignettes?.[1]?.instance?.pcRoot
      );
    },
    { timeout: BOOT_MS }
  );
}

async function hop(page) {
  await page.evaluate(() => window.__stage.advance(1));
  await page.waitForFunction(
    () => Boolean(window.__stage?.cameraRig?.state?.isSettled),
    { timeout: HOP_MS }
  );
}

const errors = [];
const pageErrors = [];
const webglFbErrors = [];

const server = await createServer({
  root: process.cwd(),
  server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false }
});
await server.listen();
const origin = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 50; i += 1) {
  try {
    const res = await fetch(origin);
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
    if (i === 49) throw new Error(`Vite did not accept connections on ${origin}`);
  }
}

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(BOOT_MS);

// Catch WebGL incomplete-FB even when Chrome only emits a warning / silent getError.
await page.addInitScript(() => {
  const wrap = (proto) => {
    const orig = proto.getContext;
    proto.getContext = function (type, attrs) {
      const ctx = orig.call(this, type, attrs);
      if (!ctx || this.__glFbHooked) return ctx;
      if (type !== "webgl" && type !== "webgl2") return ctx;
      this.__glFbHooked = true;
      const log = (window.__glFbIncomplete = []);
      const enumName = (e) => {
        if (e === ctx.INVALID_FRAMEBUFFER_OPERATION) return "INVALID_FRAMEBUFFER_OPERATION";
        if (e === ctx.INVALID_OPERATION) return "INVALID_OPERATION";
        if (e === ctx.INVALID_VALUE) return "INVALID_VALUE";
        return String(e);
      };
      const check = (label) => {
        const e = ctx.getError();
        if (!e) return;
        if (e === ctx.INVALID_FRAMEBUFFER_OPERATION) {
          log.push(`GL_${enumName(e)} via ${label}`);
        }
      };
      for (const name of ["clear", "drawArrays", "drawElements", "blitFramebuffer"]) {
        if (typeof ctx[name] !== "function") continue;
        const fn = ctx[name].bind(ctx);
        ctx[name] = function (...args) {
          const r = fn(...args);
          check(name);
          return r;
        };
      }
      return ctx;
    };
  };
  wrap(HTMLCanvasElement.prototype);
});

page.on("pageerror", (err) => {
  pageErrors.push(String(err?.message || err));
});
page.on("console", (msg) => {
  const text = msg.text();
  if (isFatalWebglConsole(text)) {
    webglFbErrors.push(text);
    return;
  }
  if (msg.type() !== "error") return;
  if (isIgnorableConsoleError(text)) return;
  errors.push(text);
});

let failed = false;
const fail = (message) => {
  failed = true;
  console.error(`✗ ${message}`);
};

try {
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await waitForStageReady(page);

  if (!(await canvasLooksLit(page))) {
    fail("canvas missing or too small after gate");
  } else {
    console.log("✓ canvas present after load gate");
  }

  // Full hop cycle: Bust → Desktop → Sidekick → Travel → Bust.
  for (let i = 0; i < 4; i += 1) {
    await hop(page);
  }

  await page.waitForFunction(
    () => {
      const stage = window.__stage;
      const desktop = stage?.vignettes?.[1]?.instance;
      const sidekick = stage?.vignettes?.[2]?.instance;
      const travel = stage?.vignettes?.[3]?.instance;
      const buttons = sidekick?.sidekickRoot?.getObjectByName?.("Buttons");
      return Boolean(
        desktop?.pcRoot &&
          desktop?.screenMesh &&
          buttons &&
          travel?.packRoot
      );
    },
    { timeout: BOOT_MS }
  );

  const meshes = await page.evaluate(() => {
    const stage = window.__stage;
    const desktop = stage.vignettes[1].instance;
    const sidekick = stage.vignettes[2].instance;
    const travel = stage.vignettes[3].instance;
    const buttons = sidekick.sidekickRoot.getObjectByName("Buttons");
    return {
      pcRoot: Boolean(desktop.pcRoot),
      screenMesh: Boolean(desktop.screenMesh),
      buttons: Boolean(buttons),
      packRoot: Boolean(travel.packRoot),
      rexRoot: Boolean(travel.rexRoot)
    };
  });

  if (!meshes.pcRoot || !meshes.screenMesh) fail("Desktop CRT / pcRoot missing after hop cycle");
  else console.log("✓ Desktop CRT present");
  if (!meshes.buttons) fail("Sidekick Buttons mesh missing after hop cycle");
  else console.log("✓ Sidekick Buttons present");
  if (!meshes.packRoot) fail("Travel pack missing after hop cycle");
  else console.log("✓ Travel pack present");

  if (pageErrors.length) {
    fail(`page errors:\n  ${pageErrors.join("\n  ")}`);
  } else {
    console.log("✓ no page errors");
  }
  if (errors.length) {
    fail(`console errors:\n  ${errors.join("\n  ")}`);
  } else {
    console.log("✓ no console errors");
  }

  const hooked = await page.evaluate(() => window.__glFbIncomplete ?? []);
  const allFb = [...webglFbErrors, ...hooked];
  if (allFb.length) {
    fail(
      `WebGL incomplete framebuffer (${allFb.length}):\n  ${[...new Set(allFb)].slice(0, 12).join("\n  ")}`
    );
  } else {
    console.log("✓ no GL_INVALID_FRAMEBUFFER / incomplete attachment");
  }

  // Sanity: volumetric / composer RTs must be non-zero after hop cycle.
  const rt = await page.evaluate(() => {
    const stage = window.__stage;
    const fog = stage?.volumetricFog?.fogTarget;
    const input = stage?.post?.composer?.inputBuffer;
    return {
      fog: fog ? { w: fog.width, h: fog.height } : null,
      input: input ? { w: input.width, h: input.height } : null,
      volSized: Boolean(stage?.volumetricFog?._hasValidSize)
    };
  });
  if (!rt.input || rt.input.w < 1 || rt.input.h < 1) {
    fail(`composer inputBuffer zero-size: ${JSON.stringify(rt.input)}`);
  } else if (rt.fog && (rt.fog.w < 1 || rt.fog.h < 1)) {
    fail(`volumetric fogTarget zero-size: ${JSON.stringify(rt.fog)}`);
  } else {
    console.log(`✓ RTs sized input=${rt.input.w}x${rt.input.h} fog=${rt.fog?.w}x${rt.fog?.h}`);
  }
} catch (error) {
  fail(error.stack || error.message || String(error));
  try {
    const snap = await page.evaluate(() => {
      const stage = window.__stage;
      const desktop = stage?.vignettes?.[1]?.instance;
      const sidekick = stage?.vignettes?.[2]?.instance;
      const travel = stage?.vignettes?.[3]?.instance;
      return {
        locked: stage?.locked,
        introComplete: stage?.introComplete,
        integration: stage?._introIntegrationActive,
        pcRoot: Boolean(desktop?.pcRoot),
        screenMesh: Boolean(desktop?.screenMesh),
        sidekickRoot: Boolean(sidekick?.sidekickRoot),
        packRoot: Boolean(travel?.packRoot),
        rexRoot: Boolean(travel?.rexRoot),
        sidekickSettled: sidekick?._modelLoadSettled,
        sidekickPending: Boolean(sidekick?._pendingScene),
        sidekickError: sidekick?._modelLoadError ?? null,
        travelSettled: travel?._modelLoadSettled,
        travelPending: Boolean(travel?._pendingPack || travel?._pendingRex),
        travelError: travel?._modelLoadError ?? null
      };
    });
    console.error("stage snap:", JSON.stringify(snap));
    if (pageErrors.length) console.error("page errors:", pageErrors.join("\n"));
    if (errors.length) console.error("console errors:", errors.join("\n"));
  } catch {
    /* page already gone */
  }
} finally {
  await browser.close();
  await server.close();
}

if (failed) {
  console.error("\nStage canvas smoke: failed");
  process.exit(1);
}

console.log("\nStage canvas smoke: passed");
