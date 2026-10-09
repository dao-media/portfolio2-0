/**
 * Headless smoke: boot the real WebGL stage, assert no console/page errors
 * through the load gate, a non-blank canvas, key meshes after a hop cycle,
 * click-zoom, CRT boot, the black-hole drop gap, chunk-texture completion,
 * and a structural check for the toneMapped+bright-emissive blowout shape.
 *
 * StageExperience runs inside its own Worker (src/stage/stage.worker.js,
 * OffscreenCanvas) in every real build — `window.__stage` is never exposed
 * on the page (only inside the worker's own global scope, and only when
 * `import.meta.env.DEV && !this._inWorker`, which is never true for the
 * worker instance). Every check below goes through the same bridge the real
 * app and this session's own diagnostics use:
 * `window.__stageDebug(method, ...args)` -> postMessage -> the worker calls
 * `stage[method](...args)` and resolves the Promise with the result.
 *
 * Not visual regression — only "the real thing renders without error."
 */
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 5174;
const BOOT_MS = 40_000;
const HOP_MS = 20_000;

function isIgnorableConsoleError(text, location) {
  // Browser noise that is not a stage failure. Chrome's auto-generated
  // "Failed to load resource" text never includes the URL — only
  // msg.location() does — so the favicon 404 has to be matched there.
  if (/favicon\.ico/i.test(location?.url ?? "")) return true;
  if (/Failed to load resource:.*favicon/i.test(text)) return true;
  // html-to-image tries to inline @font-face rules from every loaded
  // stylesheet (including cross-origin ones like Google Fonts) so a
  // captured page's fonts survive outside the live DOM; reading
  // `cssRules` off a cross-origin sheet throws per same-origin policy
  // even with the stylesheet's own `crossorigin` set correctly. A known,
  // long-standing html-to-image limitation (bonsaibrain/html-to-image#52,
  // and similar) — it catches the throw itself and continues the capture
  // without that font embedded; pre-existing noise, not something Pass C's
  // CRT live-DOM overlay introduced or that affects any rendered output.
  return /Failed to read the 'cssRules' property from 'CSSStyleSheet'/.test(text);
}

function isFatalWebglConsole(text) {
  return /GL_INVALID_FRAMEBUFFER|Framebuffer is incomplete|Attachment has zero size/i.test(
    text
  );
}

/** `window.__stageDebug(method, ...args)` -> the resolved value, or null if the bridge isn't up yet. */
async function dbg(page, method, ...args) {
  return page.evaluate(
    ([m, a]) => (window.__stageDebug ? window.__stageDebug(m, ...a) : null),
    [method, args]
  );
}

async function waitForStageReady(page) {
  const t0 = Date.now();
  let lastLog = 0;
  while (Date.now() - t0 < BOOT_MS) {
    const [scroll, props] = await Promise.all([
      dbg(page, "debugScrollCapture"),
      dbg(page, "debugVignetteProps")
    ]);
    if (scroll?.introComplete && !scroll.locked && scroll.cameraSettled && props?.pcRoot) {
      return;
    }
    if (Date.now() - lastLog > 5000) {
      lastLog = Date.now();
      console.log(
        `… waiting: introComplete=${scroll?.introComplete} locked=${scroll?.locked} cameraSettled=${scroll?.cameraSettled} pcRoot=${props?.pcRoot}`
      );
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`stage not ready after ${BOOT_MS}ms`);
}

async function canvasLooksLit(page) {
  const domSize = await page.evaluate(() => {
    const canvas = document.getElementById("scene-canvas");
    return canvas ? { w: canvas.width, h: canvas.height } : { w: 0, h: 0 };
  });
  if (domSize.w < 8 || domSize.h < 8) return { ok: false, reason: `tiny ${domSize.w}x${domSize.h}` };
  // renderer.info.render.triangles reflects only the most recent frame, and a
  // background warm-compile step (_skipBeauty) can land a 0-triangle frame
  // right when this sampled — retry briefly instead of failing on one frame.
  let stats = null;
  for (let i = 0; i < 10; i += 1) {
    stats = await dbg(page, "debugCanvasStats");
    if ((stats?.triangles ?? 0) > 0) break;
    await page.waitForTimeout(150);
  }
  const png = await page.locator("#scene-canvas").screenshot({ type: "png" });
  const ok = (stats?.triangles ?? 0) > 0 && png.length > 4000;
  return { ok, ...domSize, triangles: stats?.triangles };
}

async function hop(page) {
  await dbg(page, "advance", 1);
  const t0 = Date.now();
  while (Date.now() - t0 < HOP_MS) {
    const scroll = await dbg(page, "debugScrollCapture");
    if (scroll?.cameraSettled) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`hop did not settle within ${HOP_MS}ms`);
}

/**
 * StageExperience.advance(steps) only ever moves one ring position
 * (`Math.sign(steps)` — no reverse-shortcut hop, by design), so
 * `advance(-3)` is not "jump back 3 stops", it's identical to `advance(-1)`.
 * Navigate to a specific stop the same way a real user does: one hop at a
 * time, forward, until we land on it.
 */
async function hopToIndex(page, targetIndex, ringLength = 4) {
  for (let i = 0; i < ringLength; i += 1) {
    const scroll = await dbg(page, "debugScrollCapture");
    if (scroll?.current === targetIndex) return;
    await hop(page);
  }
  const finalScroll = await dbg(page, "debugScrollCapture");
  if (finalScroll?.current !== targetIndex) {
    throw new Error(
      `could not navigate to stop ${targetIndex}, stuck at ${finalScroll?.current}`
    );
  }
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

// Headed, not headless: headless Chromium can report document.visibilityState
// as "hidden" and throttle rAF-driven work (asset-load progress, the chunk
// queue, the whole render loop) to near-zero — the exact pitfall
// scripts/verify-real-chrome.mjs documents and was built to avoid. A smoke
// test that silently never finishes loading because of this would be far
// worse than one that's merely slow; needs a display (Xvfb in CI).
const browser = await chromium.launch({
  headless: false,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const context = page.context();
page.setDefaultTimeout(BOOT_MS);
await page.bringToFront();

function handleConsoleMsg(msg, label) {
  const text = label ? `${label}:${msg.text()}` : msg.text();
  if (/Failed to load resource/i.test(text)) {
    console.error(`[console ${label ?? "page"}] ${text} @ ${JSON.stringify(msg.location())}`);
  }
  if (isFatalWebglConsole(text)) {
    webglFbErrors.push(text);
    return;
  }
  if (msg.type() !== "error") return;
  if (isIgnorableConsoleError(text, msg.location())) return;
  errors.push(text);
}

context.on("requestfailed", (req) => {
  console.error(`request failed: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
});
context.on("response", (res) => {
  if (res.status() >= 400) {
    console.error(`HTTP ${res.status()}: ${res.url()}`);
  }
});
page.on("pageerror", (err) => {
  pageErrors.push(String(err?.message || err));
});
page.on("console", (msg) => handleConsoleMsg(msg, null));
// The actual GL context lives in the stage worker (OffscreenCanvas) — its
// own console.* calls (including real GL driver warnings surfaced only via
// CDP/worker console, same blind spot documented in
// scripts/verify-real-chrome.mjs) never reach page.on("console") above.
page.on("worker", (worker) => {
  worker.on("console", (msg) => handleConsoleMsg(msg, "worker"));
});

let failed = false;
const fail = (message) => {
  failed = true;
  console.error(`✗ ${message}`);
};

try {
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await page.bringToFront();

  // Real GPU, not SwiftShader: a software-rendered run can pass every check
  // below for the wrong reason (no real GL state, no real timing). This
  // probe context is created on the page, separate from the worker's own —
  // good enough to tell a real-GPU Chromium launch from a software one.
  const gpu = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { renderer: null };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return { renderer: String(renderer || "") };
  });
  if (!gpu.renderer || /swiftshader/i.test(gpu.renderer)) {
    fail(`not a real GPU context (renderer="${gpu.renderer}") — run with a headed browser or real-GPU flags, not default headless`);
  } else {
    console.log(`✓ real GPU context (${gpu.renderer})`);
  }

  // Drop-gap timing: StageExperience's own auto-trigger
  // (`_enableInteraction`'s `navigator.webdriver` check) only ever fires on
  // the main thread — StageExperience runs inside a dedicated Worker in
  // every real build, and that Worker's own WorkerNavigator does not inherit
  // the automation flag (confirmed: `navigator.webdriver` reads `true` on
  // the page, `undefined` inside the worker), so it never auto-starts the
  // spiral here. Real users trigger it with a click or Enter/Space, relayed
  // through the exact same canvas pointerdown -> postMessage -> worker path
  // as the click-zoom test below (handleHostPointerDown ->
  // _onBlackHolePointerDown -> _triggerBlackHoleSpiral) — so this harness
  // does the same: a real click once the bridge and the sequence exist.
  // Don't poll until then — a tight loop before that just competes with the
  // page's own JS thread during the most CPU-sensitive part of boot.
  let bridgeUp = false;
  for (let i = 0; i < 120; i += 1) {
    bridgeUp = Boolean(await dbg(page, "debugUploadTimeline"));
    if (bridgeUp) break;
    await page.waitForTimeout(500);
  }
  let spiralEndAt = null;
  let dropStartAt = null;
  if (bridgeUp) {
    // Wait for the load gate to actually unlock input (fader dismissed) —
    // clicking while still locked is a no-op in _triggerBlackHoleSpiral and
    // this harness gets no second chance at it.
    let unlockedAndActive = false;
    for (let i = 0; i < 120; i += 1) {
      const [s, scroll] = await Promise.all([
        dbg(page, "debugUploadTimeline"),
        dbg(page, "debugScrollCapture")
      ]);
      if (s?.blackHoleActive && scroll?.locked === false) {
        unlockedAndActive = true;
        break;
      }
      await page.waitForTimeout(250);
    }
    if (unlockedAndActive) {
      const box = await page.locator("#scene-canvas").boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
    }
    for (let i = 0; i < 150; i += 1) {
      const s = await dbg(page, "debugUploadTimeline");
      if (spiralEndAt == null && s?.blackHoleActive === false && s.rigHeight != null) {
        spiralEndAt = Date.now();
      }
      if (spiralEndAt != null && dropStartAt == null && s?.rigHeight != null && s.rigHeight < 13) {
        dropStartAt = Date.now();
        break;
      }
      await page.waitForTimeout(150);
    }
  }
  if (spiralEndAt == null || dropStartAt == null) {
    console.log("… drop-gap timing skipped (black-hole flight not observed — reducedMotion or ?blackhole=0)");
  } else {
    const gapMs = dropStartAt - spiralEndAt;
    // Pass M: the black gap may hold the drop up to GAP_HOLD_MAX_MS (3000)
    // on top of the old 2000 ms budget; past that it is a hang.
    const budget = 2000 + 3000;
    if (gapMs > budget) {
      fail(`spiral end -> drop start took ${gapMs}ms (budget: ${budget}ms)`);
    } else {
      console.log(`✓ spiral end -> drop start ${gapMs}ms`);
    }
  }

  await waitForStageReady(page);

  const lit = await canvasLooksLit(page);
  if (!lit.ok) {
    fail(`canvas missing or too small after gate (${lit.reason ?? JSON.stringify(lit)})`);
  } else {
    console.log(`✓ canvas present after load gate (${lit.w}x${lit.h}, ${lit.triangles} tris)`);
  }

  // Click-zoom: a real synthetic click dispatched the same way a user's
  // click reaches the stage (page-side canvas listener -> postMessage),
  // not a direct state mutation — this is the exact path that silently
  // broke (vignetteClick.js reading a currentTarget the relayed event never
  // carries). Click center canvas (Bust, stop 0) and expect isZoomed.
  const canvasBox = await page.locator("#scene-canvas").boundingBox();
  if (!canvasBox) {
    fail("scene-canvas has no bounding box for click-zoom test");
  } else {
    const cx = canvasBox.x + canvasBox.width / 2;
    const cy = canvasBox.y + canvasBox.height / 2;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(800);
    const zoomed = await dbg(page, "debugScrollCapture");
    if (!zoomed?.cameraZoomed) {
      fail("click on Bust did not zoom in (cameraZoomed stayed false)");
    } else {
      console.log("✓ click-zoom engaged on Bust");
    }
    // Zoom back out so the hop cycle below starts from a clean state.
    await page.mouse.click(10, 10);
    await page.waitForTimeout(800);
  }

  // Full hop cycle: Bust → Desktop → Sidekick → Archaeology → Bust.
  for (let i = 0; i < 4; i += 1) {
    await hop(page);
  }

  // CRT boot: zoom into Desktop and expect XP boot to actually start —
  // DesktopVignette auto-starts it once focus settles
  // (_focusBlend > 0.85 && xpBoot.canStartBoot), no power-button click needed.
  await hopToIndex(page, 1); // -> Desktop
  {
    const box = await page.locator("#scene-canvas").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    let booted = false;
    for (let i = 0; i < 100; i += 1) {
      const crt = await dbg(page, "debugCrtBootState");
      if (crt?.isPoweredOn || crt?.isMonitorBooting) {
        booted = true;
        break;
      }
      await page.waitForTimeout(200);
    }
    if (!booted) {
      fail("CRT did not reach XP boot after zooming the Desktop monitor");
    } else {
      console.log("✓ CRT reached XP boot after Desktop zoom");
    }

    // Pass C: finish the XP boot sequence — login needs a click on the
    // account tile, whose hit region is in CRT canvas-pixel space (raycast
    // target, re-derived from screen pixels each time the camera moves).
    // `window.__hud` (DEV-only, same gate as the worker's own `window.__stage`)
    // reaches the real host-side MySpaceScreen directly — far more reliable
    // here than re-deriving a screen-pixel click target for a canvas-drawn
    // hit region; `isMonitorBooting` also never clears once boot starts
    // (`xpBoot._bootStarted` latches), so `isPoweredOn` alone is the actual
    // "reached the desktop" signal.
    for (let i = 0; i < 50; i += 1) {
      const clicked = await page.evaluate(() => {
        const screen = window.__hud?.getMySpaceScreen?.();
        const region = screen?.hitRegions?.find((r) => r.id === "__login-admin");
        if (!region) return false;
        screen.xpBoot.handlePointer(region.x + region.w / 2, region.y + region.h / 2);
        return true;
      });
      if (clicked) break;
      await page.waitForTimeout(200);
    }
    let reachedDesktop = false;
    for (let i = 0; i < 150; i += 1) {
      const crt = await dbg(page, "debugCrtBootState");
      if (crt?.isPoweredOn) {
        reachedDesktop = true;
        break;
      }
      await page.waitForTimeout(200);
    }
    if (!reachedDesktop) {
      fail("XP boot never reached the MySpace desktop");
    } else {
      let live = false;
      for (let i = 0; i < 25; i += 1) {
        const state = await dbg(page, "debugCrtLiveState");
        if (state?.live) {
          live = true;
          break;
        }
        await page.waitForTimeout(200);
      }
      if (!live) {
        fail("CRT live DOM overlay never went live after reaching the MySpace desktop");
      } else {
        // The fade-in transition + first screenRect-driven matrix3d position.
        await page.waitForTimeout(300);
        const link = page.locator('#crt-live-root [data-ms-link]:not([data-ms-link="__back"])').first();
        const before = await link.count();
        if (before === 0) {
          fail("CRT live DOM overlay has no clickable links once live");
        } else {
          // Click accuracy: a real Playwright click computes its point from
          // the element's actual (matrix3d-transformed) bounding box, so
          // this only passes if the homography really lines the DOM up with
          // the quad the user is looking at.
          await link.click();
          await page.waitForTimeout(200);
          const back = await page.locator('#crt-live-root [data-ms-link="__back"]').count();
          if (back === 0) {
            fail("Clicking a live MySpace link did not navigate (no back link in detail view)");
          } else {
            console.log("✓ CRT live DOM overlay click navigated correctly");
          }
        }
      }
    }

    await page.mouse.click(10, 10);
    await page.waitForTimeout(400);
  }

  const meshes = await dbg(page, "debugVignetteProps");
  if (!meshes?.pcRoot || !meshes.screenMesh) fail("Desktop CRT / pcRoot missing after hop cycle");
  else console.log("✓ Desktop CRT present");
  if (!meshes?.buttons) fail("Sidekick Buttons mesh missing after hop cycle");
  else console.log("✓ Sidekick Buttons present");
  if (!meshes?.shelfRoot) fail("Archaeology shelving unit missing after hop cycle");
  else console.log("✓ Archaeology shelving present");
  if (!meshes?.venusRoot) fail("Archaeology Venus missing after hop cycle");
  else console.log("✓ Archaeology Venus present");
  if (!meshes?.lucyRoot) fail("Archaeology Lucy missing after hop cycle");
  else console.log("✓ Archaeology Lucy present");
  if (!meshes?.trojanHorseRoot) fail("Archaeology Trojan Horse missing after hop cycle");
  else console.log("✓ Archaeology Trojan Horse present");
  if (!meshes?.olmecHeadRoot) fail("Archaeology Olmec Head missing after hop cycle");
  else console.log("✓ Archaeology Olmec Head present");
  if (!meshes?.oliveBoatRoot) fail("Archaeology Olive Wood Boat missing after hop cycle");
  else console.log("✓ Archaeology Olive Wood Boat present");
  if (!meshes?.cuneiformRoot) fail("Archaeology Cuneiform Tablet missing after hop cycle");
  else console.log("✓ Archaeology Cuneiform Tablet present");
  if (!meshes?.ishtarGateRoot) fail("Archaeology Ishtar Gate missing after hop cycle");
  else console.log("✓ Archaeology Ishtar Gate present");
  if (!meshes?.ptolemyRoot) fail("Archaeology Ptolemy bust missing after hop cycle");
  else console.log("✓ Archaeology Ptolemy present");
  if (!meshes?.divjeBabeFluteRoot) fail("Archaeology Divje Babe Flute missing after hop cycle");
  else console.log("✓ Archaeology Divje Babe Flute present");
  if (!meshes?.neanderthalRoot) fail("Archaeology Neanderthal missing after hop cycle");
  else console.log("✓ Archaeology Neanderthal present");

  // Chunked textures: well over 10s has elapsed since land by this point
  // (load gate + a 4-stop hop cycle + the Desktop zoom). Every claimed job
  // should be fully drained, and a finished texture's mip 0 should hold
  // real image data, not a flat placeholder or garbage (the exact
  // regression class the immutable-texture / mid-upload-restart bugs
  // produced earlier this project).
  const chunkState = await dbg(page, "debugChunkReadbackSample");
  if ((chunkState?.pending ?? 0) > 0) {
    fail(`chunk-texture queue still has ${chunkState.pending} job(s) pending 10s+ after land`);
    const why = await dbg(page, "debugBgWhy");
    console.log("  background state:", JSON.stringify(why));
  } else {
    console.log("✓ chunk-texture queue fully drained");
  }
  if (chunkState?.sampleMaterial) {
    const rb = chunkState.readback;
    const samples = rb?.samples ?? [];
    const uniform =
      samples.length > 1 &&
      samples.every((s) => s.rgba && samples[0].rgba.every((v, i) => v === s.rgba[i]));
    if (!rb?.fbComplete) {
      fail(`chunked texture readback incomplete for "${chunkState.sampleMaterial}": ${JSON.stringify(rb)}`);
    } else if (uniform) {
      fail(`chunked texture "${chunkState.sampleMaterial}" reads as a uniform/flat placeholder, not real image data`);
    } else {
      console.log(`✓ chunked texture "${chunkState.sampleMaterial}" mip 0 readback looks like real image data`);
    }
  }

  // Luminance risk: a material with toneMapped === false and a non-trivial
  // emissive contribution skips the HDR rolloff every tone-mapped material
  // gets before bloom/display — this is the exact mechanism that blew out
  // the Sidekick screen. Flag any material matching that shape outside an
  // explicit, small allowlist of intentional glow/label/custom-shader cases.
  const TONEMAPPED_FALSE_ALLOWLIST = new Set([
    "lambert3", // Sidekick keyboard label cutouts (applySidekickLabelMaterial)
    "sidekick_scrollball_resin", // scrollball LED — a real intentional point glow
    "sidekick_scrollball_led_core",
    "crt_glass" // CrtGlassMaterial handles its own tone curve
  ]);
  const audit = await dbg(page, "debugMaterialAudit");
  const riskyRows = (audit?.rows ?? []).filter((r) => {
    if (r.toneMapped !== false) return false;
    if (r.type === "ShaderMaterial") return false; // custom shaders implement their own output curve
    if (TONEMAPPED_FALSE_ALLOWLIST.has(r.material)) return false;
    const emissiveBright = Array.isArray(r.emissive) && r.emissive.some((c) => c > 0.05);
    return emissiveBright && (r.emissiveIntensity ?? 0) > 0.1;
  });
  if (riskyRows.length) {
    fail(
      `materials with toneMapped:false and a bright, un-allowlisted emissive (risk of blown-out, un-rolled-off highlights):\n  ${riskyRows
        .map((r) => `${r.vignette}/${r.mesh}/${r.material}`)
        .join("\n  ")}`
    );
  } else {
    console.log("✓ no un-allowlisted toneMapped:false + bright-emissive materials");
  }

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

  if (webglFbErrors.length) {
    fail(
      `WebGL incomplete framebuffer (${webglFbErrors.length}):\n  ${[...new Set(webglFbErrors)].slice(0, 12).join("\n  ")}`
    );
  } else {
    console.log("✓ no GL_INVALID_FRAMEBUFFER / incomplete attachment");
  }

  // Sanity: volumetric / composer RTs must be non-zero after hop cycle.
  const rt = await dbg(page, "debugRenderTargetStats");
  if (!rt?.input || rt.input.w < 1 || rt.input.h < 1) {
    fail(`composer inputBuffer zero-size: ${JSON.stringify(rt?.input)}`);
  } else if (rt.fog && (rt.fog.w < 1 || rt.fog.h < 1)) {
    fail(`volumetric fogTarget zero-size: ${JSON.stringify(rt.fog)}`);
  } else {
    console.log(`✓ RTs sized input=${rt.input.w}x${rt.input.h} fog=${rt.fog?.w}x${rt.fog?.h}`);
  }
} catch (error) {
  fail(error.stack || error.message || String(error));
  try {
    const snap = await dbg(page, "debugVignetteProps");
    console.error("vignette props snap:", JSON.stringify(snap));
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
