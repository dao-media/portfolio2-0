# Portfolio 2.0

Cinematic, scroll-driven Three.js stage. One WebGL canvas, four vignettes on a **fixed** ring, orbital camera on critically damped springs, live UI painted onto model screens, neon tubes (fog renderers parked in `src/fog-aside`, not in the frame loop), Windows-XP-styled load gate, Phase-1 perf governor (motion DPR + adaptive step-down).

**Last verified:** 1 October 2026 (`test:smoke` rewritten and passing end-to-end, CRT-boot state-sync fix, click-zoom fix, bust-only drop gate, Sidekick screen tone-mapping fix, material audit, star anti-pop + twinkle, chunked-texture fix, unified star field, star field at infinity, chunk-upload time budget, star scale).

Proof of concept — not production-hosted yet. Dev entry: `src/main.js` → `HUDController` on the page, `startStageHost()` → `StageExperience` inside `src/stage/stage.worker.js`. The worker owns the canvas, ring, vignettes, camera rig, lighting, `PostPass`, `DuoFabSystem`, and `WaterCursor`. The page owns captions, dots, the XP fader, the black-hole enter button, the MySpace CRT, the Sidekick SMS form, and the Duo Mail / case-study overlays. Those screens are copied to the worker as `ImageBitmap`s.

### Latest changes

Newest first. Rows older than 3 days live in [CHANGELOG.md](CHANGELOG.md). Prepend here whenever you change the stage or this README (see [§22](#22-keeping-this-document-current)).

| Date | Change |
| --- | --- |
| 1 Oct 2026 | **`test:smoke` was silently broken since the worker architecture shipped — rewritten, and it immediately found the real reason the Desktop/CRT screen never turned on.** The old suite drove the stage through `window.__stage.xxx` direct property/method access; that global is only ever set inside the Worker's own scope (`import.meta.env.DEV && !this._inWorker`, and `_inWorker` is always `true` for the real worker-hosted stage) — `window.__stage` has never existed on the page in any real build, so the suite had been silently doing nothing since the OffscreenCanvas/worker architecture was introduced, unrelated to this pass's regressions. Rewritten to drive everything through `window.__stageDebug(method, ...args)`, the same worker-RPC bridge the real app and every other dev probe use, with 5 new debug methods (`debugCanvasStats`, `debugVignetteProps`, `debugCrtBootState`, `debugRenderTargetStats`, `debugChunkReadbackSample`) added to expose what the direct-access version needed. Getting the rewritten suite to actually reach stage-ready surfaced two real app bugs and one harness-only bug: (1) `_enableInteraction`'s automation auto-trigger for the black-hole spiral checks `navigator.webdriver`, which reads `true` on the page but `undefined` inside the dedicated Worker (confirmed directly) — so no automated run had ever gotten past the approach phase; the harness now performs a real click to trigger the spiral, the same relayed canvas-click path a real user's click takes (`handleHostPointerDown` → `_onBlackHolePointerDown` → `_triggerBlackHoleSpiral`). (2) The actual "PC screen never turns on" regression: every one of `XpBootMonitor.js`'s internal paint functions (`_onPowerPress`'s CRT power-on callback, `_captureToScreen`, `_paintCaptureFallback`, `_paintBootFrame`, `_paintWelcomeFrame` — 6 sites) set `screen.texture.needsUpdate = true` directly but never called `screen._emitFrame()`, the hook `stageHost.js` listens on to bitmap-capture the CRT canvas and post `{ bitmap, state }` back to the worker. The boot genuinely started on the host (`XpBootMonitor._runBoot` sets `active`/`_bootStarted` synchronously, confirmed via trace) and painted every frame, but the worker's mirrored `isPoweredOn`/`isMonitorBooting`/`canStartBoot` froze at its pre-boot snapshot forever and the worker's own CRT texture never received a single boot-animation frame — so the screen the user actually sees genuinely never changed. Fixed by adding `screen._emitFrame?.()` after each of the 6 sites, matching the pairing `MySpaceScreen.js` already uses everywhere else (`texture.needsUpdate = true` immediately followed by `_emitFrame()`). Verified via trace: `isMonitorBooting` now flips `true` within 500 ms of the click. (3) Harness-only: the suite's own CRT-boot navigation (`advance(page, -3)`, assumed to jump back 3 ring stops) was landing on the wrong vignette — `StageExperience.advance(steps)` always moves exactly one ring position (`Math.sign(steps)`, by design: "no reverse shortcut hop"), so `advance(-3)` is identical to `advance(-1)`. Replaced with `hopToIndex()`, which single-steps like a real user until it actually lands on the target stop. Also fixed in passing: the favicon-404 console-ignore filter matched on `msg.text()`, which Chrome's auto-generated message never includes the URL in — now matches `msg.location().url`; and the canvas-lit check now retries past a single legitimate 0-triangle frame (a background warm-compile step can land one) instead of failing on it. `npm run test:smoke` now passes end-to-end: real GPU context, spiral-end→drop-start **153 ms**, canvas lit after the gate, click-zoom on Bust, CRT boot after zooming Desktop, all 13 Desktop/Sidekick/Archaeology meshes present after a hop cycle, chunk queue fully drained with real (non-uniform) mip-0 data, no un-allowlisted `toneMapped:false` + bright-emissive materials, zero console/page/GL errors, render targets correctly sized. |
| 1 Oct 2026 | **The drop to Bust no longer waits on the other three stops, the Sidekick screen stopped blowing out, and a material audit came back mostly clean.** Drop gap: `liveModelsReady` (desktop/sidekick/archaeology mount + prelight) and the "env" live-step's CRT-glass wait gated `warmVignette0`'s *entire* 32-step "live" phase, including Bust's own step — neither is a Bust dependency, so an early click (which skips straight past the natural `#bh-enter` wait) stacked both timeouts into a 30+ s black screen before the drop could arm. `liveSteps()` now puts Bust's own step first and runs it without that gate; a new `state.bustReady` flag (set once that one step finishes) replaces `.done` everywhere that actually gates the drop (`_onBlackHoleSpiralComplete`, `_tickIntroFromCameraRig`, `_maybeShowEnter`) — `.done` still means every stop's live warm has finished, and `_tickIntroFromCameraRig` now keeps draining it in the background post-land so the other steps still complete, just without blocking landing. Also: `_frameCause = "compile"` inside the live phase is now set only for `"scene"` steps (the one kind with real synchronous compile cost) instead of unconditionally every tick, so the chunk-texture queue isn't starved by cheap bookkeeping steps either. Measured on both entry paths: button-click spiral-end→drop-start **504 ms** (unchanged, already under target), early-click **105 ms** with `worldVisible: true` immediately at spiral-end (was 30+ s black screen). Sidekick screen: `configureSidekickScreenMaterial` explicitly set `toneMapped = false` on the LCD material (`emissive: white`, `emissiveIntensity: 0.9`) to make it readable in the dark — bypassing the renderer's tone-mapping entirely means its raw, uncompressed output skips the HDR rolloff every other material in the scene gets before bloom/display, clipping hard to white instead. Removed that line; the material's own metalness fix (0 instead of the GLB's authored 1) already makes the screen read bright enough without needing to bypass tone mapping. Material audit: extended `debugMaterialAudit()` with `isUnlit`, `toneMapped`, per-slot colorSpace, and emissive fields and ran it across all 99 materials in the four vignettes. Clean except the Sidekick screen above and one cosmetically-irrelevant colorSpace tag on a 1×1 placeholder texture (`carkey1`'s normal-map slot, Sidekick) — every other `toneMapped: false` material is a custom `ShaderMaterial` handling its own output curve or an explicitly intentional glow/label/decal. Cuneiform tablet ("pixelated static"): GPU-read its color map (`model_material`) at mip levels 0–6 — every level is clean and correctly downsampled (corresponding texel positions across levels agree to within a few sRGB steps), ruling out the chunk queue entirely for this texture, which is 1024×1024 and never gets chunked (`CHUNK_TEXTURE_EDGE` is 2048). No fix applied — the stated hypotheses (early mipmap generation, a mid-upload restart, wrong row stride) don't apply to an unchunked texture, and I didn't find a replacement cause. Ptolemy/pharaoh ("washed out"): mounts fine on a longer wait — Archaeology loads ~10 separate GLBs asynchronously and 8 s wasn't enough; found by a new `debugFindRoot(vignetteIndex, rootName)` (looks up a named root child directly instead of searching by mesh/material name, which doesn't work for GLBs with generic internal names like this one's `Object_4`/`material_0`). Its one real mesh has sane values — `metalness` **0.02**, `roughness` **0.88**, `envMapIntensity` **0.35** (the same `forceLit` treatment every other Archaeology prop gets), `toneMapped: true`, a real 1024×1024 map, no emissive. Nothing here is a material misconfiguration; the washed-out look (if real) isn't one this audit can explain — more likely lighting/distance at its shelf position or the source texture itself, neither of which is a renderer bug. |
| 1 Oct 2026 | **Click-zoom was broken on every vignette (and the Desktop/CRT never booted as a result) — fixed — plus stars no longer pop in and out.** `vignetteClick.js`'s `handleClick` read `e.currentTarget.getBoundingClientRect()`, but every real click reaches it through `StageExperience._hostPointerEvent()` — a plain object relayed from the page-side canvas listener (the worker's OffscreenCanvas never dispatches a native event of its own) — which never carries a `currentTarget`. Every click threw before raycasting ever ran; confirmed via a real-Chrome repro against a clean checkout (bisect candidate: the crash predates this session by months, so "worked on 29 Sep" doesn't line up with when this line was introduced — flagged, not fully resolved). Fixed by passing `getRect: () => this._getCanvasRect()` into `createVignetteClick` — the same worker-safe rect helper `_updatePointerFromClient` already used — instead of trusting the event. Verified: click now raycasts correctly and calls `zoomIn()` (`cameraZoomed` flips `true`) once the scene has actually loaded. Star anti-pop: the previous pass's 0.5–1.5 px stars went sub-pixel at render time, and a point sprite under ~1 device px covers a pixel inconsistently frame to frame as the camera rotates — reading as flicker, not a steady dim star. Stars now never render smaller than `minRenderPx` **2** device px; alpha is scaled by the squared ratio of intended to rendered size instead, so a "small" star still reads small and dim through reduced coverage, not sub-pixel geometry. Added real twinkle on top (previously a fixed-rate, non-tunable shimmer): each star gets its own random rate (`aFreq`, 0.3–1.5 Hz) and phase, `vBright = 1 + twinkleAmount·sin(...)`, amplitude **±12%**, never reaching zero; `twinkleAmount` **0** disables it. Applied to `StarField.js`, the cursor-trail field (`ProceduralStarfield.js`), and `FlightStarStreak.js`. Live knobs `minRenderPx`, `twinkleAmount`, `twinkleSpeed` via `setStarFieldParams` / Shift+S. Verified by tracking 20 star blobs across a 10 s capture during a cursor sweep on the ring: none hit nonzero-to-zero (minimum observed brightness never below the sensor floor), confirming no star fully vanishes between frames. |
| 1 Oct 2026 | **Stars are ~1 device px instead of 6–8 px discs, and the chunk-texture queue no longer starves on the black-hole handoff.** Star scale: `StarField.js` / `ProceduralStarfield.js` (cursor-trail field) / `FlightStarStreak.js` all moved from a 1–8 CSS px size range to **0.5–1.5** (power-law `sizeExponent` **6**, so most land near the floor), clamped to ≥1 device px same as before. A new per-star `aBright` attribute (power-law, floor `minBright` **0.3**) carries the star-to-star variance that size used to — "brightness carries the variation, not size." Sprite falloff changed from a gaussian (`exp(-dist·18)`, which reads as a soft disc at any size over a couple of px) to a flat core with a thin feather only in the outer `spriteSoftness` **0.16** of the point's radius. Measured on a 3440×1232 capture: 93% of rendered star blobs are exactly 1px, 4.6% are 2px, and the two outliers over 100px are the disk and its glow ring, not stars. Live knobs on the existing tuner: `minSizePx`, `maxSizePx`, `sizeExponent`, `spriteSoftness`, `minBright` via `setStarFieldParams` / Shift+S (StarField only — the cursor-trail field shares the same constants but isn't independently rebuilt by the tuner). Chunk queue: diagnosed via a real-Chrome timeline (`debugUploadTimeline`) rather than assumed — `_chunkUploadsAllowed()`'s main upload path did one `CHUNK_TEXTURE_ROWS` (8-row) strip per frame, a row-count budget, not a time one, and froze completely for 30+ s in one repro because `warmVignette0`'s own "live" step sequence sets `_frameCause = "compile"` on every tick it runs, which every upload branch (including the 4 ms late-claim safety net) treats as "don't touch this frame." Uploads are now budgeted by time (`_chunkUploadBudgetMs()`: 4 ms fader/approach, 6 ms hold, **40 ms** during the post-spiral black screen specifically — nothing is visible there, so drain as fast as the frame affords), and the new black-screen branch ignores the `_frameCause` guard outright since it has nothing to protect. Caveat: in this session's actual repro the dominant 30+ s cause was not the chunk queue at all — it was two sequential hardcoded readiness timeouts (`liveModelsReady` ~25 s, then the "env" live-step's `glassMesh`/`liveEnv` wait ~8 s) stacking when Enter is triggered very early (any click or Enter/Space during the approach fires the spiral immediately, before `#bh-enter` itself ever shows — a documented, apparently intentional "impatient skip"). Clicking the real `#bh-enter` button the instant it appears already met the "<1 s spiral-end to drop-start" target before this change (measured ~505 ms); this pass's time-budget fix is real and shipped, but confirmed as a secondary factor in testing, not the primary one — flagged for the next pass if the gap recurs on a slower machine or larger asset set. |
| 30 Sep 2026 | **Star field rendered at infinity — zero parallax under any camera translation — and the cursor trail is path-sampled instead of a fixed profile.** The sky visibly sliding during the aerial drop ("stars whoosh past as the camera descends") traced to two things, not a clipping bug: `StarField.js`/`ProceduralStarfield.js` re-centered their shell on `camera.position` every frame (a real star that far away should show no such motion under an **11 m** translation), and a synthetic `introSkyDropPitch` in `MilkyWayNebulaShader.js` pitched the sky in sync with descent height specifically because "the intro quaternion is frozen, so a pure height change does not turn the camera" — i.e. it manufactured sky motion to compensate for a camera that doesn't rotate. Fix: both star shaders now store direction only and project with `mat3(viewMatrix) * skyDir` — camera position never enters the math — and the drop-pitch hack is deleted outright, along with the dead `uWorldDome`/`aBand`/`uMirror`/`uWrap` branches left over from `ProceduralStarfield.js`'s old dual-mode field (none were reachable from the current caller). Verified by cross-correlating real star patches between frames rather than judging a screenshot: the full **13.85 m → 2.85 m** drop moves 8 tracked stars **0–1.4 px**; a ring hop shows a small, perfectly *uniform* ~**5.7 px** shift across every star (the signature of real camera rotation at the stop, not translation parallax, which would vary by star); a cursor sweep on the ring is ~**0 px**. A central hole reported at the hold was not reproducible in this pass, with or without cursor movement, at the reporter's own window size (1837×1222 @ DSF 2) or at 3440×1232 — numerically ruled out as far-plane clipping (`STAR_FIELD_RADIUS` **170** `< CAM_FAR` **220**, always) or frustum culling (`frustumCulled` confirmed `false` throughout). Separately, the cursor star trail (`CursorStarTrail.js`) no longer uses a fixed candle-flame profile with a synthetic `uBend` angular-velocity term; it keeps a **16**-sample ring buffer of recent cursor positions over a **0.3 s** window, each sample a soft circle of radius `headRadius·(1−age/maxAge)^p` (head **30 px**, taper `p` **1.6**) unioned in the shader — the shape comes from wherever the cursor actually went (fast = long, slow = short, turning = curved), with the path span clamped to **336 px** (× pixel ratio) by trimming the oldest samples. Live knobs: `timeWindow`, `headRadius`, `taperExponent`, `maxLength` via `setCursorTrailParams` / Shift+S. |
| 30 Sep 2026 | **Cursor star trail bends with the cursor's turn, and the far sky no longer vanishes or double-renders.** The "2 skies" during the black-hole sequence was the cursor-hover reveal field (`CursorStarTrail.js`) still using `NormalBlending` against the new `StarField.js`'s additive sky — same positions, visibly different look, read as a second sky. It's additive now (also the "increase intensity" ask). Flame length was already speed-driven (`momentum`); it's now genuinely trajectory-driven too — signed angular velocity of the cursor heading drives a `uBend` uniform that arcs the tail progressively from wick to tip (`pow(u,1.3)`) and flares its width on a sharp turn, instead of a rigid straight taper. Tail length doubled. The candle-flame body profile (`sqrt(u)·exp(-ku)`) stays. Stars vanishing when the black hole settles: `hideSceneExcept` (every `warmVignette0` compile pass) hides every scene child outside the held root, including `StarField.js` — its parent is `scene`, which is always in that pass's "keep" ancestor set, so every one of those (many, across the whole hold) hide/restore cycles touched it. Its own tick now unconditionally re-asserts `visible = true` every frame, after `_tickBlackHole` (which drives those compiles) has already run. Stars covering the scene / unrealistic movement during the flight-to-ring handoff: `FlightStarStreak.js`'s near layer now hard-cuts to invisible the instant `_blackHoleActive` goes false (was a multi-second fade tail, still visibly recycling stars close to the camera while the ring settles) — separately, `StarField.js` / `FlightStarStreak.js` / `CursorStarTrail.js` moved off layer 0 onto a new `SKY_LAYER` (**7**, main camera only), so the wet-floor `CubeCamera` (bake is infrequent, `restFidelity.js`; the sky re-centers every frame) can't hold a stale reflected copy that visibly drifts from the live sky. |
| 30 Sep 2026 | **ColorSpace settles before a texture is ever chunked, chunk queues drain on hop, and a real composerSizePool depth bug is fixed.** `pcProductionMaterials.js` now sets `texture.colorSpace` at load time (before `warmPcTexturesOnGpu` ever calls `renderer.initTexture`) instead of after — chunked color maps were allocating the wrong GL internal format (`RGBA8` instead of `SRGB8_ALPHA8`) because `configurePcTexture` used to set it only once the texture had already been claimed and allocated. `chunkedTextureUpload.js`'s `syncParams` also re-applies filter/anisotropy (not just wrap) and restarts a job from its still-known source bitmap if colorSpace changes after the fact. Mipmap timing now brackets the one-time calibration with `gl.finish()` for real GPU-completion time (confirmed **0 ms** on the bust's 4096² map, measured properly this time). A hop can land on a vignette whose own large textures were claimed only moments ago (measured up to **~8 s** unattended); `advance()` now prioritizes the destination vignette's own chunk-queue jobs to the front, and the render loop spends a small (**1.5 ms**) budget on hop frames specifically for them (was: wait for the hop to end and the frame to "settle," like everywhere else this queue drains) — cut real-world completion from ~8s to ~2s. `composerSizePool.js`'s `GL_KEYS` never tracked `__webglDepthRenderbuffer` (the multisampled framebuffer's own depth renderbuffer, separate from `__webglDepthbuffer` on the resolved framebuffer) — every pooled resize left it stale, eventually pairing mismatched depth-stencil attachments during three's own resolve blit (`GL_INVALID_OPERATION: Read and write depth stencil attachments cannot be the same image`). Tracking it, and matching `postprocessing`'s own dispose-based multisampling setter instead of a custom stash/restore, cut that warning from ~150 to ~9 per boot; the residual ~9 trace to `PostPass.setMultisampling`'s own render-target switch on a freshly-recreated multisampled target, outside this file, not chased further. |
| 30 Sep 2026 | **Ring and flight share one star field; the grey band and the colored orbs are gone.** `StarField.js` replaces `ProceduralStarfield.js`'s ring/flight dual-mode field and `MilkyWayNebulaShader.js`'s dome: one `THREE.Points`, additive, re-centered on the camera every frame with a fixed world orientation, so the same instance crosses the flight-to-ring handoff with no branch to fall out of sync. Base **6,000** points uniform over the sphere, plus a band at **2.5×** (**15,000**) on a **60°**-tilted great circle, gaussian latitude **σ 8°**, a core density swell, brightness skewed dim by a power law, peak brightness **0.92** (under bloom threshold **1.0**). `milky-way-dome` (a `toneMapped:false` procedural haze sphere) and `nebula-clouds` (4 additive cyan/purple/orange billboards — the reported orbs) are deleted, not hidden. `FlightStarStreak.js` is a flight-only near layer with real recycling world positions (a true streaming-past effect), point size clamped, near-camera fade, and a fade-to-0 before arrival. `ProceduralStarfield.js` now serves only the cursor hover star trail (`CursorStarTrail.js`, unchanged). **Shift+S** logs live tuning to console; `setStarFieldParams` / `setFlightStreakParams` (via `window.__stageDebug`) rebuild geometry in place, nothing written to constants. |
| 30 Sep 2026 | **Chunked textures finish, get real mipmaps, and can't be corrupted by unrelated code.** PC / Sidekick / Archaeology's large maps were claimed by `warmMeshesChunked` after the black-hole intro's drain window closes (`_chunkUploadsAllowed` requires the APPROACH phase, which ends at Enter), so they sat stuck at the 1×1 placeholder forever. A late-claim safety net now drains them on settled, non-hop, non-reveal frames with a small time budget (start **4 ms**), gated on the previous frame being at or under `FLOOR_RECOVER_MS` **26**. The actual corrupting mechanism: unrelated material setup (`pcProductionMaterials.js`'s `configurePcTexture`) bumped `texture.needsUpdate` to apply wrap / colorSpace / filters on an already chunk-owned texture, letting three's real upload path recreate the GL object via immutable `texStorage2D` and revert or corrupt a finished upload. `renderer.initTexture`'s override now permanently owns a chunk-claimed texture — three's real path is never invoked on it again; only the wrap mode is re-applied directly. Finished chunked textures also get a real `gl.generateMipmap` chain (measured **0 ms** on the bust's 4096² map, well under an **8 ms** defer-to-settled-frame budget) instead of base-level-only `LINEAR` sampling forever. |
| 30 Sep 2026 | **Bust and tree read as chrome because the chunk queue could never finish an upload.** `ChunkedTextureQueue.claim()` routed the 1×1 placeholder through three's normal `initTexture()`, which allocates immutable storage (`texStorage2D`) in WebGL2 — the queue's own resize-to-real-size step then failed every time (`GL_INVALID_OPERATION: Texture is immutable`), leaving every texture ≥ `CHUNK_TEXTURE_EDGE` **2048px** stuck at its flat placeholder fill, verified by direct GPU pixel readback. `claim()` now creates the placeholder as a mutable texture itself, never through three's path. Also fixed: `texture.dispose()` was a silent no-op for chunk-owned textures, since three only attaches its own GL-freeing listener inside the upload path this bypasses. |

---

## Contents

1. [Latest changes](#latest-changes)
2. [Direction](#1-direction)
3. [Run locally](#2-run-locally)
4. [Tech stack and tools](#3-tech-stack-and-tools)
5. [What you see](#4-what-you-see)
6. [Layout](#5-layout)
7. [HTML chrome](#6-html-chrome)
8. [Coordinate system, ring, proportions](#7-coordinate-system-ring-proportions)
9. [Camera](#8-camera)
10. [Intro, load gate, XP boot](#9-intro-load-gate-xp-boot)
11. [Lighting](#10-lighting)
12. [Post: bloom (grain off)](#11-post-bloom-grain-off)
13. [Neon tubes + fog](#12-neon-tubes--fog)
14. [Vignettes](#13-vignettes)
15. [Screen pipelines](#14-screen-pipelines)
16. [Cursor, audio, HUD](#15-cursor-audio-hud)
17. [Assets and scripts](#16-assets-and-scripts)
18. [Frame loop](#17-frame-loop)
19. [Tests](#18-tests)
20. [Dev probes](#19-dev-probes)
21. [Landmines](#20-landmines)
22. [What not to do](#21-what-not-to-do)
23. [Keeping this document current](#22-keeping-this-document-current)

---

## 1. Direction

The site is a **stage**, not a page scroller. Vignettes sit still on a ring. The camera orbits, drops in from altitude, hops stop-to-stop, and click-zooms.

Product rules that drive the architecture:

- **One canvas, one rAF loop, one `EffectComposer`.** Grain is last so it is not bloomed.
- **Travel is camera motion, never `world.rotation.y`.** Nothing writes world-Y; the old per-frame clamp was a guard for a deleted turntable.
- **Hops always add `±2π / n`.** Never shortest-path (that reversed the first lap and cut a chord through the arena).
- **Look-at during travel stays on the ring at current theta**, not the destination, so the path stays circular.
- **Neon identity is per-stop, but the fog is one ring.** Each stop owns a tube + a static PointLight. Dominants (`neonColors[0]`) sit evenly around the hue wheel so overlap arcs stay chromatic, not grey. The fog light is never an average you author by hand — adjacent lights mix in the band.
- **XP boot on the CRT is content**, not the page preloader. The page gate is `#fader` + `StageLoadGate`.
- **Masters are sacred.** Copy out of `masters/`; never optimize or overwrite in place.
- **Vanilla Three.** No React, no R3F, no physics, no Lenis, no ScrollTrigger.

---

## 2. Run locally

```bash
npm install
npx playwright install chromium   # once — required for test:smoke
npm run dev          # Vite, http://localhost:5173 (opens automatically)
npm run build
npm run preview
npm run test:motion  # Node: cursor + scroll + parallax + Sidekick keypad + load gate
npm run test:smoke   # Playwright: real canvas through load + hop cycle
```

Git LFS is required for `.glb` and model PNGs under `public/assets/models/` (see `.gitattributes`).

Vite pages (`vite.config.js`):

| URL | File | Purpose |
| --- | --- | --- |
| `/` | `index.html` | Live stage (`#scene-canvas`) |
| `/sidekick-sms.html` | `sidekick-sms.html` | Standalone SMS form for LCD development |
| `/fog-lab.html` | `fog-lab.html` | Isolated volumetric-fog lab (no live stage wiring). Entry `src/fog-lab/main.js` |

---

## 3. Tech stack and tools

| Layer | Choice | Notes |
| --- | --- | --- |
| Bundler | Vite `^6.3` | HMR, multi-page (`index` + `sidekick-sms` + `fog-lab`), port **5173**, `open: true` |
| 3D | Three.js `^0.172` (vanilla) | One rAF loop. **No React, no R3F** |
| Camera | Custom springs (`springTo`, ζ = 1) | Interruptible; retarget is a field write |
| Prop motion | GSAP `^3.15` | Sidekick swivel, capture blend, delayed SFX |
| Post | `postprocessing` `^6.39` | One `EffectComposer`: RenderPass → **EdgeGlitchPass** → bloom → grain (grain amount **0**). Cursor depth of field is in the chain but **parked** (`CURSOR_DOF.enabled` **false**). Fog is not in the chain. |
| Glitch (parked) | `glitch-gl` `^1.0.6` ([naughtyduk/glitchGL](https://github.com/naughtyduk/glitchGL)) | Installed for eventual DOM / screen effects. **Not** in the live stage loop |
| Fog shader | `three-custom-shader-material` `^6.4` | Wraps `MeshStandardMaterial`; write `csm_DiffuseColor`, never `csm_FragColor` |
| Screen UI | Offscreen DOM + Canvas 2D | MySpace / XP / SMS on meshes |
| DOM → texture | `html-to-image` | Static frames only (login, SMS LCD) |
| Audio | `HTMLAudioElement` + session mute | XP + Sidekick SFX |
| Tests | Node ESM scripts + Playwright smoke | `test:motion` is Node-only; `test:smoke` boots the real canvas |
| Archaeology GLB (legacy pack/rex) | Blender (`bpy`) via `scripts/export-travel-runtime.py` | Then gltf-transform **resize → webp → meshopt** (never `optimize`) |
| Binaries | Git LFS | `*.glb` and `public/assets/models/**/*.png` |

**Not used:** physics, ScrollTrigger, Lenis, a second composer, world-Y rotation for travel, Draco. Geometry compression is **meshopt** (`EXT_meshopt_compression`) with `MeshoptDecoder` on the runtime `GLTFLoader`.

**`glitch-gl` (parked):** `npm install glitch-gl` → `import glitchGL from "glitch-gl"`. Pixelation / CRT / glitch on DOM targets (images, text, video, GLTF). Free for personal portfolios; commercial use needs a NaughtyDuk licence. It spins its **own** Three.js renderer + rAF (and pulls nested `three@^0.178`), so it must **not** be dropped into `StageExperience`’s composer or stage rAF. When we wire it, keep it on a separate DOM surface (e.g. overlay / screen prototype page), or extract shaders only into the existing `postprocessing` stack.

Renderer (live): ACES Filmic, exposure **1.18** (`EXPOSURE`), PCF soft shadows, output sRGB. Device DPR cap **1.75** (fine pointer) / **1.5** (coarse). Off the black-hole flight, the drawing buffer is capped at **`REST_PIXEL_BUDGET_MP` 2.3** (`_pixelRatioForBudget`: `sqrt(budget / cssWidth / cssHeight)`, never above that device cap). A frame at **`FLOOR_DROP_MS` 35** walks **`FLOOR_MP_NOTCHES`** down one step, to **`FLOOR_MIN_MP` 0.7**. Frames at or under **`FLOOR_RECOVER_MS` 26** for **`FLOOR_RECOVER_SEC` 1** walk one step back up. Motion can only go lower (`effectiveDprMul`). While `_blackHoleActive` and the floor has not dropped, the sequence owns DPR at **`BLACK_HOLE_DPR` 1** and the composer is **`BLACK_HOLE_MSAA` 8** with SMAA off. A floor drop caps the sequence the same way until frames recover. Handoff returns SMAA and the megapixel cap. One owner per state. Governor steps during rest do not resize the canvas or the shadow maps. The first land is pre-sized when `warmVignette0` finishes; later arrivals resize one frame after `isSettled`. That step calls `post.setSize` with `setPixelRatio`. **Shift+P** opens the live megapixel slider. **Shift+?** cycles **1.6 / 2.3 / 3.2**. Screens/canvases stay full res. Background **`#070709`** (`STAGE_BG`). Camera near **0.1** (`CAM_NEAR`), far **220** (`CAM_FAR` — clears studio shell walls ~180 m), FOV **42°** (`CAM_FOV`). Antialias on, `powerPreference: "high-performance"`.

While building, `?work` / `?work=1` / `?quality=0.6` boots meshes at **60%** of that DPR cap and scales the POV shadow map the same way. `?work=0` / `false` / `off` forces full. Bloom and the XP / MySpace / Sidekick SMS canvases stay full — only the object raster shrinks. `setWorkQuality` clamps to **0.35–1**; `setWorkQuality(1)` restores. **Adaptive governor** (`src/scene/stage/stagePerfGovernor.js`): EMA frame ms vs **`PERF_GOVERNOR_BUDGET_MS` ~20**; step-down order DPR → shadow map → wet-floor probe cadence (**edge glitch is never disabled**). That **20 ms** budget owns **motion**, and it cannot exceed the megapixel cap. Settled sharpness is **`REST_PIXEL_BUDGET_MP` 2.3**, not a climb from level 3 to 1. The wet cube no longer uses a cadence: `wet-floor-probe` is **bake-once** at **64** (`restFidelity.js`). Probe: `window.__pixelBudget` on the page (`targetMp`, `pixelRatio`, `drawW` / `drawH`, `smaa` / `msaa`).

---

## 4. What you see

Four stops on a ring of radius **18 m**, inward-facing props, camera **outside** the ring. After the aerial drop, scroll lands on **Bust**. Wheel / arrows / dots hop ±1 stop. Click the active stop to zoom.

| Index | Angle | Stop | Neon dominant | Interaction |
| --- | --- | --- | --- | --- |
| 0 | 0° (+Z) | **Bust** | `#ffa45a` (warm lantern) | Bust **4 m** + apple **10.07 m** yaw **−335°** at `(3.17, -3.25)` on short lawn; lantern **2.48 m** at `(2.2, 0.85)` |
| 1 | 90° (+X) | **Retro Desktop** | `#00e5ff` (~187°) | PC GLB. Click CRT → zoom → XP boot → MySpace. Wheel on zoomed CRT scrolls the page |
| 2 | 180° (−Z) | **Sidekick** | `#8c2dff` (~266°) | Phone GLB. Closed rest bobs **0.028 m** and sways **0.01 m**. Click toggles zoom **and** lid swivel. Open LCD is a live SMS form |
| 3 | 270° (−X) | **Archaeology** | `#ff3d1a` (~7°) | Shelf finds under neon. Click to zoom |

Desktop group is scaled in toward center by **5%** (`position.xz *= 0.95`) so the CRT reads larger at rest without changing ring angle.

Caption / dots / `STAGE ddd.d°` readout follow the camera’s orbital angle, not a spinning world.

---

## 5. Layout

```
src/
  main.js                           StageExperience + audio FAB
  content/
    caseStudies.js                  Duo Mail / case-study catalog (5 slugs)
  scene/
    StageExperience.js              Owner: renderer, intro, input, lighting, loop, Duo gate
    camera/
      CameraRig.js                  Theta / radius / height / zoom / lookAt springs
      BlackHoleCameraSequence.js    Pre-drop approach + event-horizon spiral
      spring.js                     Closed-form critically damped ζ=1 (`springTo`)
      scrollAdvance.js              Discrete wheel → ±1 hop
      parallax.js                   Pointer offset after rig pose
      ringLayout.js                 Stops from vignette world positions
      vignetteClick.js              Click to zoom the active stop
      parallaxDampZones.js          Soften parallax over CRT (~20% travel)
    blackhole/
      BlackHoleModel.js             Animated GLB (Take 001), disk pitch −8°
      MilkyWayNebulaShader.js       Black-hole lensing math only (the dome and the aerial-drop sky pitch it used to carry are both gone)
      StarField.js                  One far-sky field for the ring and the flight — 6k base + 15k band, stars at infinity (rotation-only projection, no camera-position dependence), Shift+S tuner
      FlightStarStreak.js           Flight-only near layer, 900 pts, real recycling positions, clamped size, fades before arrival — the one star layer with intentional parallax
      ProceduralStarfield.js        Shader/generator for the cursor hover star trail only (see CursorStarTrail.js) — not the far sky; stars at infinity, same rotation-only projection as StarField.js
      CursorStarTrail.js            16k hidden sky stars across the hold view, uncovered by a path-sampled trail (16-sample ring buffer of cursor positions)
    duo/
      DuoFabSystem.js               Camera-parented iPhone Duo FAB + open springs
      duoExteriorScreen.js          Closed cover lock wallpaper + live clock
      duoProjectsScreen.js          Open insight PROJECTS hologram canvas
      duoIdleMotion.js              Idle bob / yaw springs
      duoConstants.js               Seat, scale, hover +90°, open knobs
      duoHudBloom.js                HUD UnrealBloom for open insight
    loaders/
      createGltfLoader.js           GLTFLoader + MeshoptDecoder
    neon/
      NeonSystem.js                 Tubes + 4 static lights (no fog depth pass)
      makeNeonTube.js               Standard sleeve + bloom-compensated core (no shell)
      makeNeonLantern.js            Bust-stop lantern GLB + bloom core (neonProp)
      neonGradientTexture.js        Tall 4×256 V-strip; loop-closed stops; no mipmaps (scroll seam)
    fog-aside/                      Not in the stage frame loop. fog-lab may still import the pass.
      FogDepthCapture.js            Former layer-0 depth pre-pass
      FogDebugOverlay.js            DEV camera quad
      VolumetricFogPass.js          Screen-space raymarch
      VideoFogSystem.js             Alpha VideoTexture planes
      videoFogConfig.js             Video fog height / soft distance / opacity
    accent/
      AccentLightSystem.js          Rim Spots + sweep Point + fog shaft Spot (stop 0)
      accentConfig.js               Accent knobs (Shift+A FINALIZE)
    floor/
      WetFloorSystem.js             CubeCamera probe + wet MeshStandard knobs
      wetFloorConfig.js             Wet-floor knobs (Shift+W FINALIZE)
    fog/
      fogConfig.js                  Canonical volumetric knobs (lab + stage)
      volumetricFogPinned.js        Pre-video-fog trial snapshot (rollback)
    stage/
      constants.js                  Radii, lights, neon, intro, scroll, STAGE_FOG_ENABLED
      stagePerfGovernor.js          Motion DPR ramp + adaptive quality ladder
      restFidelity.js               Settled-only resources per vignette (lantern bake, grass, wet probe)
      warmVignette0.js              Bust shader, texture, and lantern-shadow prewarm during the black-hole hold
      PostPass.js                   Live composer: RenderPass → (fog?) → EdgeGlitchPass → depth of field (parked) → bloom → grain
      CursorDepthOfField.js         Cursor focus raycast for the ring depth-of-field pass (idle while parked)
      FilmGrainEffect.js            Custom postprocessing Effect
      StageLoadGate.js              Gating LoadingManager + bake + min boot ms
      LiveStageEnvironment.js       PMREM for glass / PBR
      StageStudioRoom.js            Studio shell
      StageFloor.js                 Floor disc
      VignetteContactShadows.js     Soft dual contact pads (POV spot + neon)
      StageScrollCapture.js         Wheel → CRT / DOM
      stageCameraTrack.js           INTRO_TRACK_DESCENT + legacy sampler (tests)
      frameBudget.js                DEV post-land slow-frame tags (__stage.frameBudget.dump)
      ScreenLightRig.js             CRT spill tint from the 2D canvas (no GL readback)
      attachScreenLightRig.js       Presets `pc` (interval 2) and `sidekick` (interval 4)
    vignettes/
      BustVignette.js               Arrival bust + apple + procedural lawn
    grass/                          Grassworks-class WebGL meadow (InstancedMesh)
      bustLightParticles.js         Sidelined GPGPU particle kit (not on Bust)
      DesktopVignette.js            Retro PC + CRT
      SidekickVignette.js           T-Mobile Sidekick + SMS LCD
      ArchaeologyVignette.js         Stele + shelf + finds
      BaseVignette.js               Shared vignette helpers
      gltfMaterialOwnership.js      Shared-GLTF material safety
      pcSceneBlockout.js            PC_SETUP_TARGET_HEIGHT + floor snap (excludes neon/cables/contact-shadow)
  ui/
    HUDController.js                Caption, dots, readout, MySpace panel
    MySpaceScreen.js                IE chrome + MySpace + XP boot on CRT
    DuoMailOverlay.js               Apple Mail two-column (case study inbox)
    DuoCaseStudyOverlay.js          Full-screen case study modal
    releaseCaptureCanvas.js         Zero html-to-image canvases after copy
    AudioToggleFab.js               Mute FAB (top-right)
    FogTuner.js                     Live fog tuning panel (Shift+F to toggle)
    EdgeGlitchTuner.js              Live subject-dissolve panel (Shift+G to toggle)
    AccentTuner.js                  Live accent rim/sweep/shaft panel (Shift+A)
    WetFloorTuner.js                Live wet-floor reflection panel (Shift+W)
    WaterCursorRimTuner.js          Live cursor-rim RESPONSE panel (Shift+C)
    LawnEdgeTuner.js                Live bust-lawn edge panel (Shift+L)
    EnvLightTuner.js                Live env / ambient / hemi / exposure (Shift+E)
    xpBoot/
      StageBootSequence.js          Fader gate API (`setProgress` / `dismiss`)
      XpBootMonitor.js              CRT XP sequence (content, not page gate)
      config.js                     CRT boot timings + asset URLs
    sidekickSms/                    SMS compose atlas
  cursor/                           Water-blob overlay (same WebGLRenderer)
  audio/siteAudio.js
  content/myspace-content.js
  styles/                           main, myspace, xp-boot, crt-power-on, sms, duo-mail, duo-case-study
public/assets/models/               Vendored runtime (Git LFS); Archaeology GLBs are meshopt
public/assets/case-studies/         Featured webps for Duo Mail (scraped)
masters/                            Untouched source (never edit in place)
scripts/                            Node stress + Playwright smoke + Blender export
                                    + rebuild-iphone-duo-runtime / fetch-case-study-images
```

**Dead / not in the live loop** (kept from the first POC):

- Much of `stageParallaxMotion.js` / `stageCameraTrack.js` — still imported for **tests** and `INTRO_TRACK_DESCENT`. Live drop is the height spring, not the old keyframe sampler
- `vignetteAnchorRotation` / `TRANSITION_DURATION` and friends — leftovers from world-Y travel; **not** what hops the camera. Still used by Node scroll tests.
- Removed (were unreferenced): `SpotlightBloomPass`, `PovSpotlightBeam`, Orbit/Cube placeholder defs, `DESKTOP_FOCUS_CAM_PULL` / `SIDEKICK_FOCUS_CAM_PULL`, `DesktopVignette.ensureRestAnchorBaked` / `applyRestAnchorBlend` / `_tickDesktopRestAnchor`, and the per-frame `world.rotation.y = 0` clamp. `CAM_REST_OFFSET_X` and `DESKTOP_REST_EXTRA_BACK` stay — legacy intro-track sampler / tests.
- Also removed from the live tree: root `src/scene/CameraRig.js` / `ScrollController.js` / `PortfolioExperience.js` (camera lives under `src/scene/camera/`); `neon/createFogPlane.js` / `createFogRing.js` / `createFogMaterial.js` / `bakeFogAtlas.js` (atmosphere is `VolumetricFogPass` only — no sheet/haze compare path).

---

## 6. HTML chrome

| Id | Role |
| --- | --- |
| `#scene-canvas` | WebGL target |
| `#readout` | `STAGE 000.0°` |
| `#fps` | Smoothed FPS (top center) |
| `#caption` | Stop copy wrapper |
| `#capIndex` | Stop index |
| `#capName` | Stop name |
| `#capDesc` | Stop description |
| `#dots` | Stop tabs |
| `#myspace-panel` | Narrow-viewport MySpace overlay |
| `#myspace-close` | Overlay close |
| `#myspace-panel-body` | Overlay body |
| `#myspace-crt-host` | Offscreen CRT DOM |
| `#sidekick-sms-host` | Offscreen SMS DOM |
| `#fader` | Page-load gate (XP bar chrome, `.is-gating`) |
| `#audio-toggle-root` | Mute FAB mount (**top-right**) |
| `#duo-fab-root` | Duo Mail / case-study overlay host |
| `#duo-mail-overlay` | Apple Mail two-column panel (aligned to Duo screen) |
| `#duo-case-study-overlay` | Full-screen case study modal |
| `#crt-power-on-root` | CRT phosphor warm-up, captured to texture |

---

## 7. Coordinate system, ring, proportions

Three.js: **+Y up**, right-handed. Stage floor **Y = 0**.

Vignettes are placed by `placeOnStage` in `constants.js`:

```text
angle = index × (2π / n)
x = sin(angle) × 18
z = cos(angle) × 18
rotation.y = angle          → local +Z points outward (toward the orbiting camera)
```

The comment on `placeOnStage` that says “facing the center” is stale. `rotation.y = angle` faces **out**.

| Quantity | Value | Where |
| --- | --- | --- |
| Vignette ring radius | **18 m** | `STAGE_RADIUS` |
| Floor disc radius | `18 × 70/9` ≈ **140 m** | `STAGE_FLOOR_RADIUS` |
| Degree-label radius | `18 × 11.8/9` ≈ **23.6 m** | `STAGE_LABEL_RADIUS` |
| Camera rest radius | `CAM_Z + CAM_REST_BACK` ≈ **28.16 m** | `CAM_BACKOFF = 8.6×1.04`, rest back **4 ft** |
| Camera rest height | **2.85 m** | `CAM_Y` |
| Pageload aerial height | `2.85 + 11` = **13.85 m** | `INTRO_TRACK_DESCENT` |
| Rest look-at height | **2.35 m** | `LOOK.y` — same for every stop so a tall PC and a short phone share an eye line |
| Zoom pull-in | **3.99 m** (`4.2 × 0.95`) | `CAMERA_ZOOM_DISTANCE` in `StageExperience` |
| Zoom height | **2.15 m** | `CAMERA_ZOOM_HEIGHT` |
| PC blockout target height | **5.2 m** | `PC_SETUP_TARGET_HEIGHT` |
| Archaeology shelf height | **≈4.30 m** | `SHELF_REAL_HEIGHT_M` **1.842** × CRT×**0.5** × `SHELF_EXTRA_SCALE` **0.75** (~**2.33×**) |
| Venus height | **≈0.35 m** | Real **11.1 cm** × shelf scale × `VENUS_EXTRA_SCALE` **1.33** |
| Olive wood boat height | **≈0.48 m** | Real **18 cm** × shelf scale × `OLIVE_BOAT_EXTRA_SCALE` **1.15**; same deck as Venus (**0.924 m**), side **−0.2 m** |
| Trojan Horse height | **≈0.41 m** | Real **22 cm** × **4/5** × CRT×0.5; `tipStand` −X π/2 × **+Z 85°**; deck **1.312 m** |
| Olmec Head height | **≈0.43 m** | Real **24 cm** × **0.935** × CRT×0.5; deck **1.312 m** (next to Trojan) |
| Cuneiform tablet | **≈0.37 m** standing | Real **16 cm** × **1.15** × CRT×0.5; deck **0.553 m** under olive boat; easel lean **14°** |
| Lucy height | **≈0.48 m** | Real **17 cm** × **1.2** × CRT×0.5; spine stand **10 cm** (pin into foramen, engage **0.52**); face **−75°** yaw |
| Antikythera height | **parked** | Runtime on disk; not loaded |
| Stone arch height | **4.83 m** | **4.2 × 1.15**; pos **(2.2, 0.85)** yaw **3π/4** |
| Stele | **retired** | Runtime kept under `stele/runtime/` for rollback; not loaded |
| Neon tube | **solid sleeve** r **0.058 m** + opaque bloom glow skin r **0.068 m** (`NEON_CORE_MAX` **1.85** luminance target, per-hue boost — **no** Additive volume shell). **Bust** replaces the cylinder with the lantern GLB (`neonProp: "lantern"`, height **2.48 m**, same XZ). | Default local XZ **`(2.2, 0.85)`**; Desktop **`(3.65, 1.15)`**. Glow is UnrealBloom on the outer skin (threshold **1.0** unchanged); Additive shell removed to kill the dark “light vacuum” cylinder |
| Volumetric fog | steps **64** / ray **32 m** (0.5 m/step); dist fade **24→32 m**; noise warp **1.5** | `fogConfig.js` / `VolumetricFogPass` |

`CAM_REST_OFFSET_X` (**3 ft**) still exists and is used by the **legacy** intro track sampler / tests. The live `CameraRig` look-at is the ring point at `LOOK.y` with **no** X bias.

**Direction of travel:** `advance(+1)` always adds `+(2π / n)` to `thetaTarget` (never shortest-path). Hop order: Bust → Desktop → Sidekick → Archaeology → Bust.

The world does **not** rotate. Nothing writes `world.rotation.y` (the rest-anchor bake that used to touch it is gone), so there is no per-frame clamp.

---

## 8. Camera

Owner: `src/scene/camera/CameraRig.js`. Springs: `src/scene/camera/spring.js`.

### Channels

| Channel | Rest | Travel | Zoom |
| --- | --- | --- | --- |
| `theta` | Stop angle | `thetaTarget += ±2π/n` | Unchanged |
| `radius` | Rest radius | Held | Held |
| `radialOffset` | 0 | 0 | Negative (`zoomRadius − restRadius`) |
| `height` | 2.85 m | Held | 2.15 m |
| `lookAt` | Point on the **vignette ring** at current theta | **Pinned to the ring** (not the destination) so hops stay circular | Springs toward the stop `focusPoint` |

Spring omegas (1/s): theta **6.2**, radius **4.0**, height **3.6**, lookAt **6.0**.

Closed-form critically damped (`ζ = 1`):

```js
export function springTo(value, velocity, target, omega, dt) {
  const ex = Math.exp(-omega * dt);
  const c1 = value - target;
  const c2 = velocity + omega * c1;
  return [
    target + (c1 + c2 * dt) * ex,
    (velocity - omega * c2 * dt) * ex
  ];
}
```

Settled when every channel is within **1.5e-3** of target (`SETTLE_VALUE_EPS`) and velocity **&lt; 1e-3** (`SETTLE_VELOCITY_EPS`).

### Scroll (discrete, not a scrub)

`createScrollAdvance`: accumulate wheel, fire `±1` past threshold **28**, then disarm until **settled** and **110 ms** quiet (`quietMs`). Mid-travel wheel does **not** queue a hop (that skipped Sidekick). `notifySettled` must run on the **false → true** edge only — calling it every settled frame reset the quiet timer and froze hops after the first.

Keys: arrows. Escape: zoom out. Touch: swipe.

### Parallax

Applied **after** the rig writes pose. Default `maxOffset` **0.245 m**, omega **7**. Damp zones (CRT) scale to **20%** travel (`PARALLAX_DAMP_INSIDE_SCALE`); taper omega **3.2**. Entering a zone **anchors** the field so the view does not yank to center. Reduced motion: `maxOffset = 0`.

### Zoom

Clicking the **active** stop: `radialOffset` pull-in, lower height, lookAt → `focusPoint`. Zoom-out springs lookAt **back to the ring**. Scroll-away while zoomed also zooms out. Sidekick zoom and lid swivel are **one toggle**.

`DESKTOP_REST_EXTRA_BACK` is a leftover focus-blend knob still used by the **legacy** intro track sampler / tests. Live zoom distance is `CAMERA_ZOOM_DISTANCE`. `CAM_REST_OFFSET_X` (**3 ft**) is the same: legacy sampler only.

---

## 9. Intro, load gate, XP boot

Two clocks that must not be confused. The black-hole flight runs before both.

### Black-hole approach (before the drop)

1. On load the stage group is hidden, the POV spot is off, and `CameraRig.poseSuspended` is true so the ring pose cannot overwrite the flight. The sky is one `StarField.js` instance shared by the flight and the ring: **6,000** base points uniform over the sphere plus a **2.5×** band (**15,000**) on a **60°**-tilted great circle. Every star is a fixed world direction, transformed in the vertex shader by the camera's rotation only (`mat3(viewMatrix) * skyDir`) — camera position never enters the projection, so the field shows zero parallax under any translation (approach dolly, aerial drop, ring hop, cursor shear). The horizon fade (`SKY_HORIZON_LOW` **−0.03** to `SKY_HORIZON_HIGH` **0.2**) is on for the ring and off during the flight. The empty sky is black, matching the hole's central mass. The fader is transparent (XP bar still gates clicks) so the sky is visible during boot.
2. Camera eases from **108 m** out on the hold sightline — about **(0, 40.35, −45.54)** — toward hold **z −133**, **y 11.2**, looking at the hole **(0, 6.2, −148)** (`BLACK_HOLE_APPROACH_EASE` **0.65**). That ray is the rest view (~**18°** down onto the disk), so the disk's angle does not change as it grows. At the hold, cursor parallax matches the vignettes (`maxOffset` **0.245**): it fades in from **0.85 m** out and is full by **0.2 m** (`restParallaxBlend`). The spiral clears that offset. The hole is the animated GLB, fit to **7.2 m**, accretion disk horizontal and pitched **−8°** on X (`BLACK_HOLE_DISK_PITCH`). The sky is the same `StarField.js` instance as the ring, lensed: the gravitational warp bends star directions (never removes them, and operates on angle-to-hole only, since a star at infinity has no distance for the bend math to use) in an annulus from just outside the event horizon to just past the disk, drawn at **20%** of that size (`BLACK_HOLE_LENS_SIZE_SCALE` **0.2**) so the circle does not eat the starfield. Strength is **0** from the **108 m** start until **54 m**, then eases to **1** at the hold and can climb to **2.4** inside the spiral. `AnimationMixer` plays Take 001 while the flight is active.
3. After the load gate, **Click to enter** / Enter / Space calls `triggerSpiral`. The close keeps the hold elevation and orbits the hole at **2.6 rad/s** while distance `r = r0·e^(−1.15 t)`. It ends at radius **≤ 0.42** or at **2.45 s**. Once the hold has settled (`restParallaxBlend` **≥ 0.98**), moving the cursor across the sky opens a trail that uncovers a hidden field of **16,000** stars (`CursorStarTrail.js`, same rotation-only projection as `StarField.js`): a **16**-sample ring buffer of recent cursor positions over a **0.3 s** window, each sample a soft circle of radius `headRadius·(1−age/maxAge)^p` (head **30 px**, taper `p` **1.6**) unioned in the shader, so the shape comes from wherever the cursor actually went — fast = long, slow = short, turning = curved — not a synthetic bend term. Path span is clamped to **336 px** (× pixel ratio) by trimming the oldest samples; the trail closes as samples age out once the cursor stops. Live knobs (`timeWindow`, `headRadius`, `taperExponent`, `maxLength`) via `setCursorTrailParams` / Shift+S. It does not open while the pointer is over the disk (out to **1.08×** the disk radius) or once the spiral starts. A pointer that rests inside **0.72** of the disk radius sucks the blob onto one orbit (`BLACK_HOLE_ORBIT_FRAC` **0.56** at **1.85 rad/s**, `samplePointerShear`, strength **0.78**). On that orbit the blob shears to about **1.7×** along the flow and **0.75×** across. It keeps looping until the pointer moves **16 px**, which drops the guide and yanks the blob back to the cursor. On the far side of that orbit the blob is clipped where the dark core covers it (`BLACK_HOLE_HORIZON_FRAC` **0.38**); the near side draws on top.
4. While the hold is idle, `warmVignette0()` compiles each Bust mesh into a **4×4** render target (the composer program: linear output, no tone map, lantern and POV spot both casting). Maps with an edge of **`CHUNK_TEXTURE_EDGE` 2048** or more are claimed there and stripped across later idle frames in **`CHUNK_TEXTURE_ROWS` 8**-row strips, a frame draining as many strips as fit in its time budget (`_chunkUploadBudgetMs()`: **4 ms** fader/approach, **6 ms** hold, **40 ms** during the post-spiral black screen) rather than one strip per frame. Smaller maps still upload one per frame. The pass bakes the lantern cube once, bakes the wet-floor **64** cube once (`markPrebaked`, so the land frame does not render it again), draws the stop from the rest pose, and runs the edge-glitch mask once. When that pass finishes it applies **`REST_PIXEL_BUDGET_MP` 2.3** so the reveal frame is not the resize. The Duo HUD then compiles one mesh per frame into a second **4×4** target that matches the on-screen HUD (sRGB + tone map); the phone root is visible only for that offscreen draw. None of it is presented in the flight. A click before it finishes keeps stepping through the spiral.
5. Handoff hides the model, shows the stage, restores the spot, snaps the rig to aerial height **13.85 m** with the frozen intro quaternion, and calls `armIntroDescent()` once the warm has finished. The drop does not turn the camera, and the sky does not move either: `StarField.js` projects by camera rotation only, so the **11 m** vertical fall (13.85 m → 2.85 m) produces no visible star motion (cross-correlated star patches measure **0–1.4 px** across the full drop). An earlier `introSkyDropPitch` pitched the sky in sync with descent height to fake a response from a camera that does not rotate during the fall — that hack is deleted; real stars that far away would not move under this translation at all.

`?blackhole=0` skips the flight (`poseSuspended` stays false) and runs `warmVignette0` during the aerial hold instead. `prefers-reduced-motion` skips the flight and the drop, and waits for that same warm before the first settle. Playwright (`navigator.webdriver`) fires the spiral when the gate unlocks so probes still reach `introComplete`.

### Aerial drop (visual intro)

1. After the black-hole handoff (or immediately, if that flight was skipped), the camera is at rest radius, height **13.85 m**. Quaternion **frozen** so look-at does not pitch as height falls.
2. **240 ms** hold (`INTRO_SPRING_HOLD_MS`) unless the black-hole spiral just handed off with `warmVignette0` already done. `?blackhole=0` stays at the apex until that warm finishes, then drops. The hold is what keeps the first land from compiling shaders.
3. Height spring to **2.85 m**. Progress is derived from height, not a sampled curve.
4. On land: `introComplete = true`, then staggered work (gating fetch and deferred GLB fetch already started in `_initLoadGate`; warm and cursor delayed).

`prefers-reduced-motion`: no aerial drop (camera starts at rest height **2.85 m**), intro arms immediately, bloom off, `BOOT_MIN_MS` **400**.

Post-land delays (`constants.js`): warm **900 ms** (`INTRO_POST_LAND_WARM_MS`), cursor **720 ms**, settle grace **1200 ms**, integration delay **500 ms**, heavy effects **2000 ms**, Sidekick screen bake **4500 ms**, handoff **680 ms** (`INTRO_HANDOFF_MS`), idle warm timeout **5000 ms** (`INTRO_DEFERRED_IDLE_TIMEOUT_MS`). Deferred GLB fetch starts in `_initLoadGate` with the desktop fetch (not the boot manager) so meshopt parse overlaps the fader instead of post-land frames. Decode is serial: Sidekick first, then Archaeology / stele after Sidekick settles (one meshopt decode at a time).

GLB **commit** still waits on the intro gate so GPU upload does not hitch the ease-out. **Gating fetch** (Desktop PC GLB + PC maps) starts in `_initLoadGate` so the load gate can count those items. **Deferred fetch** (Sidekick, Archaeology shelf / finds / stele) starts there too, not on the boot manager.

### Page-load gate (interaction lock)

`createStageLoadGate` + `StageBootSequence` + `#fader`:

**Gating set** (blocks `locked = false`): Bust GLB + apple-tree GLB + Desktop PC GLB + PC PBR maps on the shared `THREE.LoadingManager` (procedural Bust lawn is sync — not a gate item); `renderer.compile`; min boot.

**Deferred set** (does **not** block the gate): Sidekick GLB, Archaeology shelf / Venus / Olive Wood Boat / Lucy / Trojan Horse / Olmec Head GLBs (Antikythera parked). They use a default loader (not the boot manager). Bytes start in `_initLoadGate` with the desktop fetch so meshopt parse does not run after land. Materials are assigned while the root sits on `GPU_HOLD_LAYER` (**3**). `INTRO_MATERIAL_BATCH_SIZE` is **1** and `INTRO_MATERIAL_YIELD_FRAMES` is **2** — that yield is only safe because the meshes are off the live cameras. Do not warm **1 mesh/frame** onto layer 0; that compiled each new program inside fog-depth + beauty and stretched sub-1 fps for the mesh count (~40–50 s). `compileHeldRoot` then compiles once. Shadow-depth variants are drawn for **that root only** into a 16×16 offscreen target (`renderer.compile` skips them; a full-scene shadow render recompiles the stage and costs ~1 s). Then `compileHeldFogDepth` warms `MeshDepthMaterial` for held roots into the fog depth RT (not the beauty frame). CRT glass CubeUV / PMREM (`LiveStageEnvironment` cube **768**) is captured once in that same held window, not again when heavy effects unlock. A late deferred `onLoad` cannot re-bake or unlock — finalize commits once.

1. Shared `THREE.LoadingManager` on the **Desktop** GLTF loader and PC `TextureLoader` only.
2. Progress → fader `--boot-progress` (XP bar chrome reused from `xp-boot.css`).
3. On gating load: `renderer.compile`, one throwaway composed frame.
4. Wait `max(0, BOOT_MIN_MS − elapsed)` — **2600 ms** (**400 ms** if `prefers-reduced-motion`).
5. Dismiss fader, `locked = false`. Water cursor may init once the post-land cursor delay has elapsed — skipped for `prefers-reduced-motion` or coarse pointer (`pointer: coarse`).

Until then: wheel / click / `goTo` / `advance` no-op. Fader has `pointer-events: auto` while `.is-gating`.

CRT **XP boot** (`XpBootMonitor`) is a **separate** content beat when you zoom the desktop, not the page preloader. Timings in `src/ui/xpBoot/config.js`:

| Phase | ms |
| --- | --- |
| CRT warm (`crtPowerOnMs`) | **1150** |
| Boot screen | **4000** (fade **400**) |
| Welcome | **2500** |
| Login load | **1200** |
| IE open delay | **800** |
| Reserved desktop beat | **3200** (not an auto-login timeout) |

---

## 10. Lighting

Studio IBL is the fill. Ambient is near off. POV spot stays a **focused** secondary key (not the old **118** blast). Neon and stop-0 accents are unchanged. **Shift+E** tunes env / ambient / hemi / exposure and logs each change.

| Light | Intensity / role |
| --- | --- |
| Ambient | **0.03** (`AMBIENT_INTENSITY`) — flat fill, near off. Live **Shift+E**. |
| Hemisphere | **0.08** (`HEMI_INTENSITY`) — sky `0xd8dce8` / ground `STAGE_BG`. Live **Shift+E**. |
| Fill | **0** (`FILL_INTENSITY`) |
| POV `SpotLight` | **On** — intensity **18**, angle **π/9** (~20°), penumbra **0.45**, decay **1.45**, distance **52**. Layer **0** only. |
| Contact shadows | Soft pads per stop. Spot pad opacity **0** (spot off); neon pad opacity **0.18** × neon level. Y **0.008**. |
| Neon `PointLight` ×4 | Focus-only. Peak **28**, distance **2.75**, decay **3.5**. Layers **{0, 2, 3}**. Active stop (`displayLevel` **>0.08**, not reduced-motion) **`castShadow: true`** (`NEON_SHADOW` — **1024**² cubemap); others off. **Bust lantern** bakes that cube once on settle (`shadow.autoUpdate` **false**). Inactive stops intensity **0** + content hidden. Arrive / flicker as before. See [§12](#12-neon-tubes--fog) |
| Wet arena floor | MeshStandard wet concrete (layer **3** only). Roughness map = puddles; CubeCamera env **0.03**; albedo gain **0.12**; UV repeat **32**. Soft **bubble mask** tracks active neon (radius ≈ light distance) so apron outside the pool is void-black. **Not** lit by POV spot. |
| Accent rim ×1–2 | Stop **0** cyan SpotLight ×**1** — behind + shadow-side, aimed through subject toward camera. Intensity **14**, distance **3.4**, decay **2.6**, angle **0.25**, penumbra **0.72**, side **1.55 m**, back **0.85 m**, height **+0.05 m**, cam bias **0.2**. |
| Accent sweep ×1 | Slow orbiting PointLight (uTime / neon clock). Intensity **1.45**, radius **2.35 m**, speed **0.11**. Frozen when `prefers-reduced-motion`; dropped when `workQuality < 0.4`. |
| Accent shaft ×1 | Tight Spot into fog in-scatter only (mesh intensity **0.35**, fog boost **×6.5**, angle **0.18**). Near-tube density boost **×2.35** / radius **0.9 m** while accents live. |
| Scene IBL | `RoomEnvironment` PMREM, **`STAGE_ENV_INTENSITY` 0.6** starting point (Shift+E, range **0–2**). No color tint on the map. CRT cube on glass only — never `scene.environment` |
| Studio shell | `MeshBasicMaterial` `STAGE_BG` BackSide — **unlit**. Floor = wet MeshStandard on layer **3** (see wet arena floor); neon foot = additive `neon-floor-glow`. |

`LiveStageEnvironment` captures a second PMREM for CRT glass; refresh is deferred until models are visible. `applyToScene` defaults **false**.

---

## 11. Post: bloom, cursor depth of field (grain off)

**One** composer (`PostPass`). Do not add a second.

```text
RenderPass → EdgeGlitchPass → EffectPass(DepthOfFieldEffect) [disabled] → EffectPass(BloomEffect) → EffectPass(FilmGrainEffect)  // grain = 0
```

**Cursor depth of field is parked** (`CURSOR_DOF.enabled` **false**). The `DepthOfFieldEffect` pass stays `enabled` false, and `_tickCursorDof` returns before the raycast, so the bokeh chain does not run. When `enabled` is flipped true it comes back only after the black-hole flight (`_blackHoleActive` false) and with reduced motion off: a raycast of the active vignette (skipping instanced grass) plus the wet floor eases into `dofEffect.target` (`follow` **8** /s). A miss eases toward the vignette anchor. `focusRange` **1.6** m, `bokehScale` **5**, `resolutionScale` **0.5**. Do not read the depth buffer to pick the focus.

**Fog is not in this pipeline.** The renderers sit in `src/fog-aside/` and the stage does not import them. There is no `FogDepthCapture` scene pass, no volumetric march, and no video-fog sheets. `STAGE_FOG_ENABLED` stays **`false`**. `FogTuner` / `debugFog` stay no-ops. Edge glitch still draws its subject SDF; `uHasSceneDepth` stays **0**, so it does not pay for a second full-scene depth render.

**Intro bloom return (fog-independent):** land sets bloom intensity **0** + `_bloomReturnT = 0`; `_tickIntroBloomReturn` soft-returns to `NEON_BLOOM.intensity` over ~**180** ms after intro (fog ticks only *hold* bloom at 0 while opacity ramps when fog is live). With fog parked, bloom still restores after land — verify neon bloom is present.

The composer does not sample a fog depth target. Edge glitch occlusion against other geometry is off with the depth pre-pass.

Bloom (`NEON_BLOOM`): `mipmapBlur` **false** (Kawase/mipmap path intermittently outputs a full-black frame when stop-0 parallax translates the camera; kernel blur is stable), `luminanceThreshold` **1.0**, smoothing **0.2**, intensity **1.2**, radius **0.95**, `resolutionScale` **0.5** (half-res bloom internals — soft glow hides the scale; try **0.66** before reverting if edges stair-step). `kernelSize` `KernelSize.LARGE`. Half-float buffers (`HalfFloatType`). Rest AA is **SMAA** (`SMAAPreset.HIGH`, after edge glitch, before depth of field) with composer multisampling **0**. The black-hole flight disables that pass and sets **`BLACK_HOLE_MSAA` 8** (`PostPass.setSequenceAntialias`, once per handoff; clamped to `GL_MAX_SAMPLES`). While samples are above 0, `RenderPass.needsDepthBlit` is off — a multisampled depth blit into the single-sample composer depth texture is `GL_INVALID_OPERATION`. At rest the blit is on so SMAA can read depth. DOF is disabled. Edge glitch keeps its own depth target. Reduced motion: bloom intensity **0**. Do not re-enable `mipmapBlur` without a move-cursor zero-frame probe at stop 0.

**Film grain is off** (amount **0**, normal and reduced-motion). At stage darkness (`STAGE_BG` `#070709`) it read as sensor noise and crushed fog gradients. The `FilmGrainEffect` pass remains last in the chain so a future re-enable is one constant away — do not bloom it.

Tubes use `toneMapped: false` and peak emissive **3** so they clear the threshold after ACES on the rest of the scene. CRT phosphor max **0.72** (`CRT_SCREEN_GLOW_MAX`) — stays under the line.

---

## 12. Neon tubes + fog

Owner: `src/scene/neon/` (+ `src/fog/`). **Fog is parked** behind `STAGE_FOG_ENABLED` **`false`** — systems are not constructed; flip **`true`** + `STAGE_FOG_MODE` (`volumetric` / `video` / `off`) to restore. Files kept: `VolumetricFogPass`, `VideoFogSystem`, `fogConfig`, `volumetricFogPinned`, `FogTuner`. Pin/rollback: `src/fog/volumetricFogPinned.js`. **Video fog** remains a retired trial path when MODE=`video`. Legacy fog ring / haze cards / atlas bake are **deleted**.

Four PointLights stay pinned at the tubes (layers **{0, 2, 3}**). The **settled active** stop casts a soft point shadow (`NEON_SHADOW`; cubemap **1024**²) — `castShadow` is **off during hops** and for inactive stops. The **Bust lantern** is the first `restFidelity` entry (`lantern-shadow-bake` on stop 0): `shadow.autoUpdate` stays **false**. The first cube is baked during `warmVignette0` (`userData.shadowPrebaked`) so the land frame does not render it. Shadow-map resizes wait until three settled frames have used that map, so the governor cannot discard it on the way down. Later arrivals still set `needsUpdate` for a single frame (`userData.shadowBakes`). Grass wind and cursor parallax leave the map frozen. Lantern flicker still changes intensity at sample time. **Focus-only lighting:** only the camera’s target stop (`CameraRig.state.index`) is lit — every other tube/light is intensity **0**. As theta enters `NEON_ARRIVE_RAD` **0.55** rad of that stop, light + emissive fade up; the neon **flickers** once when remaining hop arc ≤ `NEON_FLICKER_TRAVEL_FRAC` **0.07** of a stop step (last ~7% of travel — not on settle), for `NEON_FLICKER_SEC` **0.48** s, then holds. Tube `emissiveMap` scrolls on V (`NEON_GRADIENT_SCROLL` **0.18** loops/s) through that stop’s `neonColors`; the PointLight **always** samples the **live** tube mid-UV (same `map.offset.y` / `_gradientPhase` as the emissive) — glow and cast light cannot diverge. Deprecated `NEON_LIGHT_COLOR_SCROLL` / `NEON_LIGHT_COLOR_MAX_RATE` (no longer applied). **Unlit stops hide their 3D content** under `neon-lit-content` (IBL/ambient/POV spill would otherwise silhouette them) — neon tubes stay for the ring cue. That group tracks the **pre-flicker arrive** level with on/off hysteresis (**ON > 0.08** / **OFF ≤ 0.02** — ON must sit above OFF); once `_arriveLatchedIndex` matches the stop, content follows the **latch only** (not envelope noise). Flicker keys that hit 0 only dim lights/emissive, they must not hide meshes (that was the hard black/normal strobe). **Load-rest latch:** stop 0 is never traveled into on intro land — once the active stop is settled inside `NEON_ARRIVE_RAD`, arrive latches at **1** until the camera leaves that window (`_arriveLatchedIndex`), so a dead-still cursor cannot leave `neon-lit-content` dark. Flicker arms only after leaving the strike band (`_flickerEligible`) — intro land already sits inside it, so it must not strike on a still arrival. Flicker re-arms only after `activeDist > NEON_ARRIVE_RAD`. Reduced motion: no flicker / no scroll — snap on. Aerial intro keeps the other stops' neon off until first settle. The Bust lantern is the exception: `prelightStop(0)` holds arrive at **1** from the end of `warmVignette0`, so the light is already full when the world appears. Adjacent chord is ~25.5 m vs light distance **8** / decay **2**. Probe: `__stage.debugNeon()` → `stops[].contentVisible` / `arriveLatchedIndex` / `flickerEligible`. Fog level / haze (when restored) use **arrive only** (`getArriveLevel` / `light.userData.fogIntensity`) — never the strike flicker.

**Inactive-stop cull:** vignette content (not tubes / floor glow) is moved to **`INACTIVE_VIGNETTE_LAYER` 6** so beauty + neon shadow cameras (layer **0**) skip traversal. Hop **from** + **destination** stay on layer 0 during travel to avoid pop-in.

**Wet-floor CubeCamera:** bubble center still tracks during hops. The cube itself renders once when the camera settles on a stop (**64**, `wet-floor-probe` `rest: "bake-once"`), then stays frozen. Hops do not render it. The black-hole warm bakes the first cube; the first Bust settle consumes that bake. Later arrivals render once. Governor `wetProbeEveryN` does not restart the cadence.

**Edge glitch cost:** subject SDF + beauty tears when settled + stop 0–3 + cursor near subject AABB (NDC pad). **Never** governor-disabled — fixed feature. Scene-depth occlusion is off (`uHasSceneDepth` **0**); there is no fog-depth pass. Probe: `__stage.debugEdgeGlitch().gates`. frameBudget tags `edge-sdf` and `beauty`. Otherwise `uEnabled = 0`.

**Duo HUD bloom:** `DuoHudBloom` only while the insight hologram is open (`holoOn`) — not every Duo frame.

**Volumetric fog (parked — restore with `STAGE_FOG_ENABLED` + `STAGE_FOG_MODE` `volumetric`):** continuous density field — **banding-proof by construction** (no sheet edges). Stage wiring: `useComposerDepth: false`, `depthPacked: true`, depth from `FogDepthCapture` when fog/glitch need it; pass inserted **before bloom**. In-scatter feeds up to **6** lights (4 neon PointLights + optional accent shaft Spot). Soft luminance cap: fill **`FOG_IN_SCATTER_FILL_CAP` 0.88**. Reduced motion: freeze `uTime` / noise movement.

**Scattered depth (noise, not layers):** denser pockets / thinner gaps come from 3D noise — raise `noisePow` / lower `globalScale`. Live defaults: `noisePow` **3.55**, `globalScale` **1.05** (clumpier than Manual 1’s **3.15** / **1.45**). Dial by feel in Shift+F (**scatter (noise pow)** / **scatter size**).

**Subject wrap (volumetric):** `subjectWrapRadius` **4.2** / `subjectWrapBoost` **1.85** — XZ-distance density **multiplier** only near the active stop (bust/PC limbs). **`subjectWrapMaxY` is unused** (compat knob default **12**) — a Y smoothstep ceiling at **3.8** reintroduced density-locked grazing bands; do not restore a maxY on this multiplier. Continuous field; no hard radius shell.

**Live height / floor (banding-proof):** bank `heightFogExpK` **0.5** + **low ceiling** haze floor **0.05** / start **0.05** / range **1.8** (do not restore floor **0.55** / range **2.8** — full-screen wash), dens **0.65**, ambient **0.28**, wrap **2** (bust waterline = plane exclusion). Soft floor: `fogFloorFadeRangeY` **1.2** applied **after** vignette dens (`dens *= fl²`). Dist fade **24→32**. Exp path skips all `clipYSlab` Y clamps.

**Pinned Manual 1 look** (rollback via `PINNED_FOG_PARAMS` / `setVolumetricParams`): low cloud lid (`heightFogHazeStartY` **0.12**, `heightFogHazeRangeY` **0.5**, `heightFogHazeFloor` **0.1**) + `heightFogExpK` **0.55**; `fogDensityMultiplier` **0.4**, `noisePow` **3.15**, `globalScale` **1.45**, `heightFogFactor` **0.54**, `heightFogStartY` **-1**, `fogFloorFadeRangeY` **1.35**, `fogMinY` **-0.1**, `fogMaxY` **12.8**, `baseMaxRayLength` **32** / `baseRaymarchStepCount` **64** (0.5 m/step — keep ≤**0.7 m/step**). **Stable adaptive steps:** fixed world spacing + step count **quantized to buckets of 8**. `noiseBias` **0.22**, `noiseSpeed` **7.95**, wind XZ **0.06 / 0.06**, `noiseYScroll` **-0.019**, `outputDither` **0.02** (spatial-only Bayer), `falloffNoiseWarp` **1.85**, `falloffCeilingJitter` **0.95**, `fogDistFadeStart` **12** / `fogDistFadeEnd` **18**, `fogNearFadeStart` **0.35** / `fogNearFadeEnd` **3.5**. Fog-only neon reach **6.5** / decay **1.85**.

**Video fog (retired trial — `debugFog('video')` only):** `VideoFogSystem` + `cloud-loop.{webm,mp4}`. Flat sheets at grazing = horizontal banding + ~12 FPS. Kept wired for A/B; **not** the live path. Knobs: `videoFogConfig.js`. Probe: `__stage.debugVideoFog()`.

**Atmosphere toggle:** `__stage.debugFog('volumetric'|'video'|'off')` — **no-op** while `STAGE_FOG_ENABLED` is **false** (returns `{ ok: false, reason: ... }`). Hardware TODOs in `fogConfig.js` for steps **16 vs 12** and coarse fog reduced-vs-OFF remain open.

**Live fog tuner** (`src/ui/FogTuner.js`): **Shift+F**. Wired but **no-op** while fog is parked (no `volumetricFog` instance). When restored: Priority: **scatter (noise pow)**, **scatter size (↓=bigger)**, **noise bias**, density, **subject wrap** knobs, then dist fade / haze. Sliders → `__stage.setVolumetricParams()`. **FINALIZE** → `POST /__fog_finalize` patches `fogConfig.js`. CLI: `node scripts/fog-tuner-finalize.mjs`. Pin archive: `public/debug/fog-tuner-manual-1.json`. `window.__fogTuner`.

**Live environment tuner** (`src/ui/EnvLightTuner.js`): press **Shift+E** (toggle top-right, under the lawn tuner). Sliders: `environmentIntensity` **0–2** (start **0.6**), ambient (start **0.03**), hemisphere (start **0.08**), ACES `toneMappingExposure` (start **1.18**). Each change logs `[EnvLightTuner]`. Sliders → `__stage.setEnvLightParams()`. Probe: `__stage.debugEnvLight()` / `window.__envLightTuner`. No env-map tint (the PMREM has no color multiply). Does not move the POV spot, neon, or accents. r172 writes `scene.environmentIntensity` into the shader only when `material.envMap` is null; a material that brings its own map uses `envMapIntensity` instead.

**Live accent tuner** (`src/ui/AccentTuner.js`): press **Shift+A**. Rim / sweep / shaft only — does **not** raise ambient/hemi/IBL. Sliders → `__stage.setAccentParams()`. **FINALIZE** → `POST /__accent_finalize` patches `src/scene/accent/accentConfig.js`. CLI: `node scripts/accent-tuner-finalize.mjs <json>`. Probe: `__stage.debugAccent()` / `window.__accentTuner`. Verify: `node scripts/verify-accent-bust.mjs` → `public/debug/accent-bust-rim-shaft.png`. **Landmine:** rim Y must be subject-center offset (`rimHeight`), never `box.min.y + tall` (that buried the light under the pedestal). Aim through the bust toward camera for silhouette graze — aiming at center alone makes chest speculars.

**Live wet-floor tuner** (`src/ui/WetFloorTuner.js`): press **Shift+W**. Reflection strength / roughness influence / UV / probe size — does **not** put the POV spot on the floor. Sliders → `__stage.setWetFloorParams()`. **FINALIZE** → `POST /__wet_floor_finalize` patches `src/scene/floor/wetFloorConfig.js`. CLI: `node scripts/wet-floor-tuner-finalize.mjs <json>`. Probe: `__stage.debugWetFloor()` / `window.__wetFloorTuner`. Verify: `node scripts/verify-wet-floor.mjs`. **Landmine:** floor must stay on `WET_FLOOR_LAYER` **3** (neon enables 3; spot stays 0) or the §10 round disc returns. Keep `envStrength` low (~**0.12**) — neon PointLight speculars own the near-tube pools; a hot env washes cyan/green puddles across the whole apron. The live cube is **64** and **bake-once** on settle (config still lists **128** / every **3**; `update()` ignores that cadence). Hops skip the render. Measure before considering planar `Reflector`.

**Live edge-glitch tuner** (`src/ui/EdgeGlitchTuner.js`): press **Shift+G** (panel top-left; fog stays top-right). **Restored 9/15–9/16 look** — beauty-buffer horizontal tears + RGB split (`EdgeGlitchPass`) on an L1 diamond at the CROSS POINT. Knobs: **`glitchArmOuter`** (**0.06**), **`liquidArmOuter`** (**0.15** — water-cursor rim only), diamond **`spanAlong`** (**0.028**) / **`spanOut`** (**0.016**) / **`spanIn`** (**0.016**), **`intensity`** (**0.16**), **`rgbSplit`** (**0.042**), **`tearBands`** (**88**). Soft occ via FogDepthCapture **only while glitch cost is live**. Sliders → `window.__stage.setEdgeGlitchParams()`. **FINALIZE** → `POST /__edge_glitch_finalize`. Probe: `__stage.debugEdgeGlitch()` (includes `gates` + `hasSceneDepth`). Verify: `node scripts/verify-edge-glitch.mjs`. **Subjects:** Bust / Desktop / Sidekick / Archaeology. Water-cursor rim couple remains stop **0**. Reduced-motion / workQuality **&lt;0.55** → off.

**Live water-cursor rim tuner** (`src/ui/WaterCursorRimTuner.js`): press **Shift+C** (panel top-center). Blob **RESPONSE** only — does **not** touch the glitch pass / `ARM_OUTER`. Sliders: **`blowExponent`** (surface-tension ease-in), **`neckPinch`**, **`recoilPushPx`**, **`slurpBand`**, **`snapThreshold`**. Live via `__stage.setWaterCursorRimParams()`. **FINALIZE** → `POST /__water_cursor_rim_finalize` patches `src/cursor/waterCursorRimConfig.js` + `public/debug/water-cursor-rim-tuner-finalize.json`. CLI: `node scripts/water-cursor-rim-tuner-finalize.mjs <json>`. Probe: `window.__waterCursorRimTuner`.

**Live lawn-edge tuner** (`src/ui/LawnEdgeTuner.js`): press **Shift+L**. Bust grass only — fog / glitch / bust mesh untouched. Sliders: **`patchScale`** (footprint — adds blades, uncapped), **`bladeLength`** (height **0.05→∞** soft-max), **`bladeDensity`** (spacing fill, default **1**), **`tuftAmount`** (random taller clumps, default **0.4**), **`breezeStrength`**, **`breezeSpeed`**, coverage knobs. Ground dirt plate follows the coverage silhouette (not a hard circle — fixes edge “distortion”). Live via `__stage.setLawnEdgeParams()`. **FINALIZE** → `POST /__lawn_edge_finalize` patches `src/scene/vignettes/lawnEdgeConfig.js`.

**Tubes (Option 1 — bloom glow, no Additive shell):** length **4 m**. Dark **MeshStandard** sleeve (r **0.058 m**) + opaque glow skin **ShaderMaterial** (r **0.068 m**, just outside the sleeve — must be outer or bloom never sees it; `toneMapped: false`): peak-normalizes the scrolling gradient, then scales by **Rec.709 luminance inverse** so every hue hits **`NEON_CORE_MAX` 1.85** (clears **`NEON_BLOOM.luminanceThreshold` 1.0** ~equally). **No** Additive volume shell — that mesh was the dark “light vacuum” cylinder over maple/bust. Glow halo = UnrealBloom (`intensity` **1.2**, `radius` **0.95**, threshold **1.0** unchanged). Gradient strip closes the loop and uses **no mipmaps**. Skin tracks the focus-gate arrive envelope. Do **not** reintroduce an Additive shell volume to “fix” glow. Do **not** raise global bloom threshold (Sidekick/CRT share it).

**Soft-contact / plane exclusion:** `fogSoftContactRange` **2.0** m — march stops short of FogDepthCapture hits (clearGap ~45%) with a dens fade into that gap so fog never sits on the bust/apple depth plane. Fog remains in front of the subject and on miss rays behind/around; `fogEdgeSoft` **0.9** bleeds behind-fog onto the near silhouette. Bank: `heightFogExpK` **0.5**, haze floor **0.05** / start **0.05** / range **1.8**, wrap boost **2**, density **0.65**, ambient **0.28**. Soft floor: `fogFloorFadeRangeY` **1.2**. See [§20](#20-landmines).

**“Second layer”** is not a reflection pass. Floor apron is wet MeshStandard on **`WET_FLOOR_LAYER` 3** — POV spot stays layer **0** so it cannot paint a soft round disc. Neon tubes also get a soft floor **halo** + short **cone** (`neon-floor-glow`, layer **2**): pool diameter **0.92 m** / opacity **0.48**, cone radius **0.11 m** × height **0.22 m** / opacity **0.1** — planted foot on `#070709`. Desktop pool ×**0.34** centered on the tube foot (offset **0** — sideways bias orphaned a floating glow); tower footprint AABB clip on the case only; cone off. Bust/others: full pool under tube, cone on.

| Knob | Value | Notes |
| --- | --- | --- |
| Light height | **1.0 m** | Spread vs grey hotspot / CRT spec bloom |
| `falloffNoiseWarp` | **1.5** | Domain warp — churns blobs (was 0) |
| `fogDistFadeStart` / `End` | **24** / **32 m** | Fade before ray limit; kills far hard band |
| `fogNearFadeStart` / `End` | **0.5** / **6 m** | Thin fog near camera — stop-0 bust/maple readable |
| `baseMaxRayLength` / steps | **32** / **64** | 0.5 m/step budget; steps **quantized ×8** + fixed spacing |
| `noisePow` | **3** | Drop toward **2.5** only if vertical columns remain |
| `NEON_ARRIVE_RAD` | **0.55** | Fade window into focused stop |
| `NEON_FLICKER_TRAVEL_FRAC` | **0.07** | Flicker starts in last ~7% of hop arc |
| `NEON_FLICKER_SEC` | **0.48** | Strike duration once travel window hits |
| `NEON_GRADIENT_SCROLL` | **0.18** | Tube gradient loops / second |
| `NEON_FLOOR_GLOW_POOL` | **0.92 m** | Soft foot-halo diameter |
| `NEON_FLOOR_GLOW_CONE_RADIUS` / `HEIGHT` | **0.11** / **0.22 m** | Diffuse bounce stump |
| `NEON_FLOOR_GLOW_POOL_OPACITY` / `CONE` | **0.38** / **0.07** | Peak × neon level; tint = tube-foot map texel |
| `NEON_CORE_MAX` | **1.85** | Per-hue luminance target for core bloom (clears threshold **1.0**) |
| `NEON_SHELL_INTENSITY` / `RADIUS` | **deprecated** | Shell mesh removed (Option 1) |
| `NEON_MAX_EMISSIVE` | **3.0** | Legacy / non-tube probes |
| `NEON_MAX_LIGHT` | **28.0** | Hot core; pair with short distance — do not raise alone |
| `NEON_LIGHT_DISTANCE` | **2.75** | Vignette bubble — apron beyond dies to black (was 3.8 / 6.5 / 14) |
| `NEON_LIGHT_DECAY` | **3.5** | Steep falloff |
| `NEON_CORE_MAX` | **1.85** | Tube core clears bloom threshold 1.0 (white-hot extract) |
| Light distance / decay | **8** / **2** | Does not reach the next stop (~25 m); does not light MeshBasic walls |

Neon lights occupy **{0, 2, 3}** so they stain props + the wet floor (not the MeshBasic studio shell). POV spot stays layer **0** only — share no layer bit with fog in-scatter or you get a grey hotspot; share no bit with `WET_FLOOR_LAYER` **3** or the round disc returns. Studio shell (`stage-studio-room`) is MeshBasic and never takes neon.

`renderer.antialias` does nothing on the HalfFloat composer path. Rest edges are **SMAA** (`SMAAPreset.HIGH`). The black-hole flight is **`BLACK_HOLE_MSAA` 8** with SMAA off. Do not turn MSAA back on for the ring.

Per-stop colors (dominant = `neonColors[0]` → that stop’s PointLight; secondaries = tube gradient only, never mixed across stops):

| Stop | Hue (dom) | Colors |
| --- | --- | --- |
| Bust | ~92° | `#9dff1a`, `#00e5ff` |
| Desktop | ~187° | `#00e5ff`, `#9dff1a` |
| Sidekick | ~266° | `#8c2dff`, `#ff2d95`, `#00e5ff` |
| Archaeology | ~7° | `#ff3d1a`, `#ffc14a` |

Dominants must stay evenly spaced on the wheel **in ring order**. Lime (`#9dff1a`) is brighter than violet (`#8c2dff`); if the band pulses light/dark, darken lime or lift violet — do not rotate hues.

`prefers-reduced-motion`: freeze volumetric `uTime` / noise movement (bloom is already 0).

---

## 13. Vignettes

### Desktop (`DesktopVignette.js`)

- Runtime: `/assets/models/pc-source/pc-from-source.glb` + PBR maps in the same folder.
- Neon tube local XZ **`(3.65, 1.15)`** (`neonTubeXZ`) — default `(2.2, 0.85)` sat inside the tower; shifted away from the CRT.
- Fallback: blockout desk if the GLB fails.
- CRT: live `CanvasTexture` is the `emissiveMap` on a flat **bezel content plane** (`crt-content-quad`) — Blender-measured from `pc-from-source.glb` (`scripts/crt-bezel-blender-measure2.py`). Opening ≈ phosphor AABB + **1.5 cm**; content is that opening inset **1 mm** with corner radius **2 mm** (`CRT_CONTENT_PLANE` in `crtBezelOpening.js`, aspect ~**1.26**, canvas **1024×813**). Spec also exports `public/assets/models/pc-source/crt-content-plane.glb` + `tmp/crt-bezel/crt-bezel-content.blend` (working copies — not masters). `pc-Mesh_2` stays a dark cavity + glass host; phosphor still flattens before the plane mounts. Steady glow ≤ **0.72**; power-on warm-up peaks **`CRT_SCREEN_GLOW_BLOOM_PEAK` 1.35** (clears bloom threshold) then settles. Glass shell adds **neon PointLight** specular (spot may be off). Map: `SCREEN_MAP_CRT_QUAD` (`flipY: true`).
- Glass: cloned shell from the **authored bulge** before flatten, **normal offset 0.006**, **scale 1**. Primary glare is a **faint flat fresnel wash** + tiny CubeUV hint (`envMapIntensity` **0.22**, `fresnelGlare` **0.45**, `baseGlare` **0.035**, roughness **0.42** — was ~2.35/2.6 and read as a gray radial disc on dark stage IBL). Soft POV-spot mask (`spotEdgeWidth` **0.12**) × **fresnel only** (no center fill). Direct glare **0.06**. Neon PointLight specular is a **rim pin glint** (`neonSpecPower` **180**, `neonGlare` **0.28**, fresnel², NH tip-gate, RGB cap **0.28** so bloom cannot re-disc it; no N·L fill) — a broad neon lobe reintroduced the §20.20 disc. Do **not** raise `envMapIntensity` / `STAGE_ENV_INTENSITY` or set CRT cube `applyToScene: true` to “fix” glass. Glass does not occlude the image.
- Click zoom starts XP → MySpace.
- **Screen spill** (`ScreenLightRig`): RectAreaLight in front of the CRT plus a bezel PointLight. Tint is the average of the live 2D canvas, taken when the texture `version` changes (at most every `sampleInterval` **2** frames). Settled frames do not read it. Near-neutral pages get the warm phosphor fallback (HSL **0.12 / 0.12 / 0.58**). Do not put `readRenderTargetPixels` back in `update()`.
- Materials are upgraded while the PC root is on `GPU_HOLD_LAYER` (`INTRO_MATERIAL_BATCH_SIZE` **1**, yield **2** frames), then compiled once before show, including an offscreen shadow pass. Gate `renderer.compile` still warms blockout/uncommitted programs. Do not put the PBR swap back on a live 1-mesh present cadence.
- **Speaker / desk shimmer** is specular aliasing, not a missing sample count (the ring uses SMAA). Speakers share `pc_1` with 4K normals. Harden in `pcProductionMaterials.js`: `pc_1` normalScale **0.28**, clearcoat **0**, env **0.38**, roughness floor **0.62**, `specularIntensity` **0.18**, normal mip bias **1.25** / map mip bias **0.85**, neon PointLight × **0.16** via inlined `ShaderChunk.lights_fragment_begin` (see §20.18b). Neon PointLight hue tracks the live tube mid-UV (same phase as the gradient scroll). **Never** set `pc_1`/`pc_2` `toneMapped = false` to “fix” LED brightness — that untone-maps neon speculars on the tower edge into a second neon bar.

### Sidekick (`SidekickVignette.js`)

- Runtime: `/assets/models/sidekick/Sidekick3.glb`.
- Prop scale matches a real **Sidekick II** (**130 mm** closed height) against the Desktop CRT (blockout monitor vs typical **17″** chassis **416 mm**): `targetH = 0.130 × (sceneMonitorHeightM() / 0.416)`. Rest and zoom share that scale — close-up is camera dolly only. Zoom and lid swivel are one toggle. Open LCD: live SMS (`SidekickSmsScreen`). Send: scrollball red blink, then close.
- Open SFX leads the swivel by **`OPEN_SFX_LEAD` 0.05 s**. Close leads by **`CLOSE_SFX_LEAD` 0.14 s**. Clips play at **1.2×**.
- **Keypad:** GLB authors `Buttons` + cover on shared `phong3` (MASK, alpha 0). Initial repair on GLB load / `integrateAfterIntro`; re-ensure every `update()` after intro + align. Repair clones opaque DoubleSide plastic onto the **QWERTY key plastic only** (`Buttons`). `KeyboardText` (`TmobileKeyboard`) is a separate glyph cutout and stays denylisted. `sideButtons` (`TmobileButtons`) is **one fused atlas** — CALL/END/D-pad body and print on the same mesh. It stays denylisted (identity by mesh name) and is forced **opaque DoubleSide** with the atlas kept; a luminance cutout punched the plastic out and left only the glyphs. Cover detection is identity-only (`phong3` / `sidekick_cover_mask` / shared cover instance), never opacity+alphaTest. See [§20](#20-landmines).

### Archaeology (`ArchaeologyVignette.js`)

- Live: `/assets/models/shelving-unit/runtime/shelving-unit.glb`, `/assets/models/venus-willendorf/runtime/venus-willendorf.glb`, `/assets/models/olive-wood-boat/runtime/olive-wood-boat.glb`, `/assets/models/cuneiform-tablet/runtime/cuneiform-tablet.glb`, `/assets/models/ishtar-gate/runtime/ishtar-gate.glb`, `/assets/models/lucy/runtime/lucy.glb`, `/assets/models/divje-babe-flute/runtime/divje-babe-flute.glb`, `/assets/models/neanderthal/runtime/neanderthal.glb`, `/assets/models/trojan-horse/runtime/trojan-horse.glb`, `/assets/models/olmec-head/runtime/olmec-head.glb`, `/assets/models/ptolemy/runtime/ptolemy.glb`, `/assets/models/antikythera/runtime/antikythera.glb` — meshopt where applicable. Masters under `masters/Shelving Unit/`, `masters/Venus of Willendorf/`, `masters/Olive Wood Boat/`, `masters/Cuneiform Tablet/`, `masters/Lucy/`, `masters/Divje Babe Flute/`, `masters/Homo neanderthalensis/`, `masters/Trojan Horse/`, `masters/Olmec Head/`, `masters/Ptolemy/`, `masters/Antikythera Mechanism/` stay untouched. Stone arch / Giza portal / desert / Egypt sky runtimes kept on disk for rollback but **not loaded**. Legacy `stele/runtime/` + `t-rex/runtime/` also kept.
- **Stele / arch / portal retired.** Shelf at `SHELF_SIDE` **−0.9** / `SHELF_FORWARD` **0.305** (arch-era seat), yaw **π/4**, scale CRT×**0.5**×**0.75**. Venus on deck **0.924 m**; olive wood boat on the same deck opposite Venus (**18 cm** × **1.15** × CRT×0.5, side **−0.2 m**, back **+0.04 m**); cuneiform tablet on **0.553 m** under the boat (easel lean **14°**, face toward camera, **16 cm** × **1.15**); Ishtar Gate same deck (side **0.16**, face **+70°**, **22 cm** × **0.935**); Lucy on bottom **0.163 m** under Venus as the **right** find (side **0.18**, back **+0.12**, upright / face **−75°** yaw, **17 cm** × **1.2** × CRT×0.5, on spine stand **10 cm** into foramen); Divje Babe flute mid-board (side **0.02**, back **+0.10**, diameter **3.5 cm** × **1.15**, yaw **π/2−75°**); Neanderthal skull left (side **−0.16**, back **+0.10**, face **π** yaw, jaw-down **−20°** on Sketchfab after Rx−90, **20 cm** × **0.969**, on spine stand **10 cm** into foramen); Trojan Horse on **1.312 m** (side **0.14**, face **+35°** yaw, **22 cm** × **4/5** × CRT×0.5, `tipStand` −X **π/2** × **+Z 85°**); Olmec Head same deck (side **−0.12**, face **−20°** yaw, **24 cm** × **0.935** × CRT×0.5); Ptolemy bust on top deck **1.697 m** (side **0.08**, back **−0.06**, **22 cm** × **1.05** × CRT×0.5 — pedestal stripped in `rebuild-ptolemy-runtime.mjs` at glTF **Y 0.805**, `forceLit` like Olmec); **Antikythera parked** (not loaded — runtime kept). Boat rebuild: `scripts/rebuild-olive-wood-boat-runtime.mjs`. Lucy rebuild: `scripts/rebuild-lucy-runtime.mjs`. Olmec rebuild: `scripts/rebuild-olmec-head-runtime.mjs`. Ptolemy rebuild: `scripts/rebuild-ptolemy-runtime.mjs`. Flute rebuild: `scripts/rebuild-divje-babe-flute-runtime.mjs`. Neanderthal rebuild: `scripts/rebuild-neanderthal-runtime.mjs`. Stop-3 **neon** is the key light again. Click still zooms.
- Floor: `skipFloorSnap` + local `fitHeightOnFloor` (group Y stays **0**). Fit wraps an **`archaeology-floor-pivot`** that centers the AABB bottom on the root — required for Sketchfab Antikythera (mesh ~**226** units off origin). Do **not** `snapGroupToFloor` after those fits.
- Lit by neon plus the scene IBL (`STAGE_ENV_INTENSITY` **0.6**). Meshes stay **DoubleSide**. `polishMesh` caps metalness, raises roughness, strips bad normal maps. **Venus** ships `KHR_materials_unlit` — polish **`forceLit`** converts MeshBasic → MeshStandard (rough **0.88** / metal **0.02** / env **0.35**) so she is not full-albedo unlit.

### Bust

`BustVignette.js`: loads `/assets/models/bust/runtime/bust.glb` (master: `masters/bust/Bust_lowpoly.glb`), `/assets/models/apple-tree/runtime/apple-tree.glb` (**trial:** Meshy fruit tree from `masters/apple-tree/Fruit_bearing_tree_with_orange_fruits_Meshy_Resize_d76462cb.glb`; pin/rollback `runtime/apple-tree.prev.glb`; prior OBJ export `scripts/export-apple-tree-runtime.py` — Blender Y-up OBJ ≈**meters**), and a **procedural meadow** via `src/grass/GrassEngine.js` (Grassworks-class WebGL: InstancedMesh tapered blades **`castShadow` true** with wind-matched `customDepthMaterial` + `customDistanceMaterial` for POV spot + active neon point shadows, deterministic hash placement, tip-weighted wind (rest drops the noise sample, sine gust stays), MeshStandard tip/base color — **not** the old `lawn-grass-stump.glb`; masters under `masters/lawn-grass-stump/` kept untouched). **Key light prop:** lantern GLB (`neonProp: "lantern"`, `/assets/models/lantern/runtime/lantern.glb` from `masters/Lantern/lantern.glb`, height **`BUST_LANTERN_HEIGHT_M` 2.48**, XZ **`(2.2, 0.85)`**) with **semi-opaque frosted panes** (opacity **0.72**, roughness **0.88**, emissive flicker) + soft chamber glow (no fake flame mesh) and PointLight **`#ffa45a`** / intensity **110** / distance **9** / decay **1.75** (cage `castShadow` false so spill isn’t self-occluded) — not the 4 m neon cylinder or lime/cyan scroll. Bust: **`BUST_HEIGHT` 4 m**, yaw **`BUST_YAW_DEG` +12°**; polish clamps metalness ≤**0.12** (GLB ships metalness 1). GPGPU light-particle kit lives in **`bustLightParticles.js`** but is **not mounted** (sidelined for later reuse). Apple: **`APPLE_HEIGHT` 10.07 m** at **`APPLE_POS` `(3.17, -3.25)`**, yaw **`APPLE_YAW_DEG` −335°** (trunk-foot pivot; dirt-coin buried via wide-lower-band **max** Y × **`root.scale.y`** + `APPLE_BASE_SINK` **0.02**; apple meshes excluded from `snapGroupToFloor` so bury is not undone; `MAPLE_*` aliases kept). Lawn `Grass_ground` at **−0.06** m (`GRASS_GROUND_COLOR` **0x2a5224**, receives neon + blade shadows) with bust + tree holes so the dirt plate never reads as a raised coin. Lawn (Bust stop only): **`GRASS_POS`** centroid of bust+neon+apple **`(1.79, -0.8)`**, **`GRASS_Y` 0.006**, **`GRASS_RADIUS` ~4.16 m** at **`LAWN_PATCH_SCALE` 1** (covers all three + **1.35 m** margin); edge = noise coverage at placement; tip wind via `BustVignette.update(t)`. Tune live **Shift+L**. Apple leaf lighting: **`LEAF_LIGHT_DISTANCE` 4.8** + Beer-lambert self-shadow under neon **28** / distance **6.5**. Bust pedestal: grass **displaces** only under the stone ellipse (`bustHalfX` **0.98** / `bustHalfZ` **0.88**, `bustLipMin` **1** / jitter **0**, yaw **+12°**); under-bust samples shove to that footprint; ground disc has a matching hole. Lantern foot: hard cull + ground hole **`GRASS_TUBE_CLEAR_M` 0.55 m**.

### Duo FAB (`DuoFabSystem.js`)

HUD overlay — **not** a ring stop and **not** parented to the stage camera. Own `hudScene` + **orthographic** camera (`DUO_ORTHO_NEAR` **0.1** / `FAR` **20**) + key/fill/rim/hemi lights; rendered after the beauty composer with `clearDepth`. **Basis lock** (one-time tipStand): tallest GLB axis → HUD **+Y**, exterior/camera-island → **+Z** toward cam. `iso` closed `DUO_ISO_CLOSED` **(−0.16, 0, 0)**; hover/Mail → **measured** open quat (plane PCA: insight normal→+Y, short edge→+Z, then **Ry(π)** so the hardware bottom is nearest, long edge→+X) + tip **`DUO_ISO_OPEN_TIP` 0.22**. Hierarchy `root(container seat)→pop(center corr)→pivot(bob)→iso→spin(yaw)→basis`. **Container:** bottom-right inset **`DUO_SCREEN_MARGIN_PX` 85**; half-extents = max(closed, open) AABB; closed + open stay centered (`pop` negates visual center). Shared seat scale **`DUO_IDLE_SCALE` 0.288** (−20% vs prior **0.36**); Z **`DUO_SEAT_Z` −3**. Fold: `ArmatureAction` closed **2.5 s** / open **0.042 s**, scrubbed by stiffness **40.5** / damping **9.75** toward a hover ramp of **`DUO_HOVER_SPIN_SEC` 0.28** (1.5× the previous 18 / 6.5 / 0.42).

**Screens:** closed → exterior **`screen_xm`** lock wallpaper + live clock (`duoExteriorScreen.js`, `/assets/duo/exterior-lock.jpg`, emissive **1.05** — date above time as `Thur Apr 21`, time **no AM/PM**, text-only overlay; time font **0.2** / date **0.055**); open → large insight **`screen_lg`** only after fold ≥ **`DUO_HOVER_OPEN_AT` 0.72**, soft cyan emissive **0.35** / **`0x5a8fa8`** (no PROJECTS map on glass) + HUD bloom (**0.42**, threshold **0.4**) + **coplanar holo volume** (armed at **`DUO_HOLO_OPEN_AT` 0.88**, delay **0.14 s**): wash + **6** slabs along screen normal + billboard PROJECTS (**Normal** blend, `LABEL_T` **0.14**, font **0.175**, label scale **0.86**, glow **0.32**) + traveling energy disc (`PULSE_MAX_T` **0.62**, opacity **0.54**, scale **1.05→0.42**, darker teal wash — no glyph invert, **0.55 s**). **Mail:** Duo click toggles DOM overlay (idle seat/scale unchanged); far-edge tip **`DUO_ISO_MAIL_FACE` 0.52** + faint Mail UI on insight (**0.92**, capture rotated **π**); outside / ✕ / Esc dismiss. No DOM tooltip. **Hover:** spin halts → face yaw **0** + flat iso; bob continues. **Unhover** (`DUO_UNHOVER_STAGGER_SEC` **0.1**): PROJECTS glitch-out → clearing pulse wipes holo → fold close; then spin resumes (`DUO_SPIN` **0.48**). Knobs: `src/scene/duo/duoConstants.js`.

**Entrance:** **`entering`** heavy rise **−1.15** (power4 + **4%** overshoot plant) over **`DUO_ENTRANCE_SEC` 0.8 s**; settle in last **`DUO_ENTRANCE_SETTLE_FRAC` 0.14**; **`holding`** skipped (`DUO_IDLE_HOLD_SEC` **0**); **`live`** bob-in **0.85 s**, spin delayed **0.35 s** then fade **1.1 s**. Tick dt capped at **`DUO_TICK_DT_MAX` 1/20** (uncapped hitch dt blew idle springs at hold→live). Console: `[DuoFab] entrance phase → …`. Probe `debugDuo().handoffLog` / `entrance` / `bobIn` / `spinIn`. Verify: `node scripts/verify-duo-handoff.mjs`.

---

## 14. Screen pipelines

| Surface | Method | Rule |
| --- | --- | --- |
| CRT canvas | Authored at **content-plane aspect** (~**1.28**, 1024×799) | Rounded-rect UVs are 0–1. Do not window the canvas to a UV AABB. Never non-uniform-scale the plane — resize the canvas instead |
| XP boot / login | Canvas 2D blit onto `CanvasTexture` | CSS overflow does not clip the CRT — use `clip()` for the meter |
| MySpace hover | Cached bitmap + overlay | Never `html-to-image` on pointermove (hitch + WebGL taint) |
| MySpace login still | `html-to-image` **once**, then cache | Superseded capture canvases are zeroed (`releaseCaptureCanvas`). Permanent **`DOM_CAPTURE_EDGE_PAD_PX` 40** on MySpace `.ms-viewport` and XP `.xp-crt__page` (stage wrapper so absolute phases respect inset) — not UV/texture scale. |
| SMS LCD compose | `html-to-image` for form frames | Splash is a locked UV atlas; flip is a texture swap. Same edge pad on LCD capture. Prior capture canvases released on replace |
| CRT power-on | Canvas 2D (`renderCrtPowerOnFrame`) | Not html-to-image — that would taint the WebGL canvas |
| CRT phosphor / content | `emissiveMap` on `crt-content-quad`, intensity ≤ 0.72 | `SCREEN_MAP_CRT_QUAD`: `flipY: true`, `SRGBColorSpace`, `ClampToEdgeWrapping`. Rounded `pc-Mesh_2` is dark only |
| Duo exterior cover | CanvasTexture lock screen (`duoExteriorScreen.js`) | Desert wallpaper + text-only `Thur Apr 21` / `7:16` overlay (time **0.2** / date **0.055**); **`screen_xm`** while closed; emissive **1.05** |
| Duo insight hologram | Additive wash + stack + pulse disc + billboard PROJECTS (`duoProjectsScreen.js`) | Coplanar with `screen_lg`; pulse disc travels along normal and shrinks (`SCALE` **1.05** → **0.42**); disc is a darker teal of the wash (no glyph invert). Mail open: PROJECTS + pulse off; **soft wash stays** (`MAIL_WASH` **0.28**) over faint Mail UI on insight emissive (**0.32**, bloom ×**0.18**) |
| Duo Mail / case study | DOM overlays (`DuoMailOverlay` / `DuoCaseStudyOverlay`) | Mail: hologram entrance + edge GlitchQL. Case study: **full-bleed** editorial sheet (responsive; Fraunces/Outfit) that scrolls in `.duo-cs__scroll`; water cursor hidden over chrome with **native cursor restored**. |

---

## 15. Cursor, audio, HUD

**Water cursor** (`src/cursor/`): same `WebGLRenderer` as the stage (not a second WebGL context). Extra ortho scene drawn after the beauty pass with `autoClear = false`. Default diameter **22.4 px**, follow rate **10 /s**, color `#e8f4ff` (`waterCursorConfig.js`). Init **after** intro land, load gate unlock, and the post-land cursor delay (**720 ms**). Not created for `prefers-reduced-motion` or coarse pointer (`pointer: coarse`). **Rim couple** (stop **0**, camera settled, pointer live, `workQuality` **≥0.55**, reduced-motion off): GPU SDF taps in `waterCursorRimResolveShader` (ε **1.5 / `EDGE_GLITCH_SDF_SIZE` 256**), smoothed into a **2×1** float target, then the blob shader elongates / pinches / pushes (`blowExponent` **2.8**, `neckPinch` **0.72**, `recoilPushPx` **8**, `slurpBand` **0.032**, `snapThreshold` **0.012**, `rimFieldSmooth` **16**). No per-frame `readPixels`. Tune live with **Shift+C**. Glitch / `liquidArmOuter` **0.15** untouched. No refraction yet.

**Audio** (`siteAudio.js`): mute FAB (**top-right**), XP startup/login, Sidekick open/close. Open SFX leads the swivel by **`OPEN_SFX_LEAD` 0.05 s**. Close leads by **`CLOSE_SFX_LEAD` 0.14 s**. Sidekick clips play at **1.2×** so they finish with the swivel.

**HUD:** top bar (wordmark · FPS · stage readout · scroll hint · mute FAB + tuner toggles top-right), bottom caption left, **vignette dots centered** on the page (`#dots` absolute mid-bottom), Duo FAB owns bottom-right. Optional MySpace overlay panel on narrow viewports (`max-width: 900px`).

---

## 16. Assets and scripts

### Runtime vs masters

| Path | Role |
| --- | --- |
| `public/assets/models/` | What the stage loads (Git LFS for glb/png) |
| `masters/` | Canonical originals — **never** overwrite, delete, or optimize in place |
| `scripts/setup-assets.sh` | Legacy helper: copy/sparse-clone PC assets from `daneoleary-webflow`. Live models are already vendored; do not re-symlink to Webflow |

Runtime folders (from `public/assets/models/README.md`): `sidekick/`, `pc-source/`, `bust/runtime/`, `apple-tree/runtime/`, `lawn-grass-stump/runtime/`, `maple-tree/runtime/` (legacy), `travel-pack/runtime/` (legacy), `t-rex/runtime/` (legacy), `stele/runtime/`, `shelving-unit/runtime/`, `stone-arch/runtime/`, `desert-giza/runtime/`, `giza-pyramids/runtime/`, `venus-willendorf/runtime/`, `olive-wood-boat/runtime/`, `lucy/runtime/`, `divje-babe-flute/runtime/`, `neanderthal/runtime/`, `trojan-horse/runtime/`, `olmec-head/runtime/`, `ptolemy/runtime/`, `antikythera/runtime/`, `skybox-night/runtime/`, `iphone-duo/runtime/`. Day sky: `public/assets/textures/skybox-day/equirect.webp`. Case study featured images: `public/assets/case-studies/*.webp` (`scripts/fetch-case-study-images.mjs`).

### npm

| Command | Script |
| --- | --- |
| `npm run dev` | Vite |
| `npm run build` / `preview` | Production |
| `npm run test:cursor` | `scripts/water-cursor-stress.mjs` |
| `npm run test:scroll` | `scripts/stage-scroll-stress.mjs` |
| `npm run test:parallax` | `scripts/stage-parallax-stress.mjs` |
| `npm run test:sidekick` | `scripts/sidekick-keypad-stress.mjs` |
| `npm run test:gate` | `scripts/stage-load-gate-stress.mjs` |
| `npm run test:motion` | All five Node suites |
| `npm run test:smoke` | `scripts/stage-canvas-smoke.mjs` — Playwright Chromium, Vite on **5174**, load gate + full hop cycle |
| `node scripts/post-land-frame-budget.mjs` | Playwright ANGLE, Vite **5176**. Cost matrix A/B/C/D → `public/debug/post-land-frame-budget.json`. **Relative** fog-on vs fog-off only — not mid-GPU absolute |
| `node scripts/vol-fog-soft-contact.mjs` | Playwright, Vite **5177**. Soft-contact captures + near/far check |
| `node scripts/vol-fog-band-diagnose.mjs` | Banding a/b/c (HalfFloat / Bayer / height falloff) → `public/debug/vol-fog-band-*.png` |
| `node scripts/vol-fog-mach-band.mjs` | Mach-band step0 + lever1/2 A/B → `public/debug/vol-fog-mach-*.png` |
| `node scripts/vol-fog-trigger-a.mjs` | Fade-in vs deferred-GLB trigger captures |
| `node scripts/vol-fog-lever3.mjs` | Lever-3 Y-slice A/B + cost → `public/debug/vol-fog-lever3*.png` |
| `node scripts/vol-fog-exp-falloff.mjs` | Option-1 exp height falloff A/B (rest + pitch) → `public/debug/vol-fog-exp-*.png` |
| `node scripts/vol-fog-ceiling-jitter.mjs` | Option-3 ceiling jitter A/B → `public/debug/vol-fog-ceiling-*.png` |
| `node scripts/fog-tuner-finalize.mjs <json>` | Patch `src/fog/fogConfig.js` schema defaults from a tuner snapshot (same as in-page **FINALIZE**) |
| `node scripts/accent-tuner-finalize.mjs <json>` | Patch `src/scene/accent/accentConfig.js` (same as **Shift+A FINALIZE**) |
| `node scripts/wet-floor-tuner-finalize.mjs <json>` | Patch `src/scene/floor/wetFloorConfig.js` (same as **Shift+W FINALIZE**) |
| `node scripts/verify-accent-bust.mjs` | Bust capture: rim silhouette + fog shaft → `public/debug/accent-bust-rim-shaft.png` |
| `node scripts/verify-wet-floor.mjs` | Wet floor + probe ms delta → `public/debug/wet-floor-neon-puddles.png` |
| `node scripts/edge-glitch-tuner-finalize.mjs <json>` | Patch `src/scene/edgeGlitch/constants.js` exports + schema defaults (same as **Shift+G FINALIZE**) |
| `node scripts/verify-subject-dissolve.mjs` | Bust shoulder + Desktop — dying-transmission dissolve + frame-ms (`subject-dissolve-*.png`) |
| `node scripts/verify-edge-glitch-diamond.mjs` | Bust capture — L1 diamond at CROSS POINT (`public/debug/edge-glitch-diamond-shoulder.png`) |
| `node scripts/verify-edge-glitch-loud.mjs` | Bust — LOUD rgb/tearAmp + bonus 0 vs 2 frame-ms (`edge-glitch-loud-shoulder.png`) |
| `node scripts/verify-edge-glitch-fringe.mjs` | Dark-shoulder — block datamosh + dropout, no band comb (`edge-glitch-fringe-dark-shoulder.png`) |
| `node scripts/verify-edge-glitch-bonus.mjs` | Archaeology — `hasSceneDepth` probe + no-bleed / bonus captures (`edge-glitch-arch-*.png`) |
| `node scripts/vol-fog-lidfix-verify.mjs` | All-rows fog slab-edge metric → `public/debug/vol-fog-lidfix-verify.json` |

CRT diagnostics (manual): `node scripts/crt-bezel-opening-offline.mjs`, `node scripts/crt-screen-diagnose.mjs`. Bezel content plane (Blender): `scripts/crt-bezel-blender-measure2.py` → `crtBezelOpening.js` + `public/assets/models/pc-source/crt-content-plane.glb` + `tmp/crt-bezel/crt-bezel-content.blend`. Neon spill tune (TEMP): `node scripts/neon-spill-tune-sweep.mjs` → `public/debug/neon-spill-*.png` + live `__stage.setNeon({ height, maxLight })`. Fog soft fade: `node scripts/fog-soft-diagnose.mjs`. Fog horizontal bands (flat-sheet collapse): `node scripts/fog-band-diagnose.mjs` → `public/debug/fog-band-*.png` + `fog-band-diagnose.json`. Sidekick materials: `node scripts/sidekick-material-diagnose.mjs` / `sidekick-material-diagnose2.mjs` (Playwright, Vite on **5176**).

### Python / Blender (legacy travel-pack / rex)

| Script | Role |
| --- | --- |
| `scripts/export-travel-runtime.py` | Blender: read masters OBJ/PNG → `public/assets/models/**/runtime/*.glb`. Pack tex **2048**, rex **1024**, cm→m (`CM_TO_M = 0.01`). Then resize → webp → **meshopt** via gltf-transform — **never** `optimize` (it `simplify`s meshes away). Runtime `GLTFLoader` registers `MeshoptDecoder` (`src/scene/loaders/createGltfLoader.js`) |
| `scripts/rebuild-trojan-horse-runtime.mjs` | Unzip `masters/Trojan Horse/` → Blender OBJ→GLB → resize→webp→meshopt → `trojan-horse/runtime/trojan-horse.glb` |
| `scripts/rebuild-cuneiform-tablet-runtime.mjs` | Copy `masters/Cuneiform Tablet/` GLB → simplify→resize→webp→meshopt → `cuneiform-tablet/runtime/` |
| `scripts/rebuild-ishtar-gate-runtime.mjs` | Copy `masters/Ishtar Gate/` GLB → resize→webp→meshopt → `ishtar-gate/runtime/` |
| `scripts/rebuild-olmec-head-runtime.mjs` | Copy `masters/Olmec Head/` GLB → resize→webp→meshopt → `olmec-head/runtime/olmec-head.glb` |
| `scripts/rebuild-lucy-runtime.mjs` | Copy `masters/Lucy/` GLB → resize→webp→meshopt → `lucy/runtime/lucy.glb` |
| `scripts/rebuild-divje-babe-flute-runtime.mjs` | Copy `masters/Divje Babe Flute/` GLB → resize→webp→meshopt → `divje-babe-flute/runtime/` |
| `scripts/rebuild-neanderthal-runtime.mjs` | Copy `masters/Homo neanderthalensis/` GLB → simplify→resize→webp→meshopt → `neanderthal/runtime/` |
| `scripts/rebuild-ptolemy-runtime.mjs` | Blender trim pedestal on `masters/Ptolemy/` GLB → resize→webp→meshopt → `ptolemy/runtime/ptolemy.glb` |
| `scripts/export-apple-tree-runtime.py` | Blender: `masters/apple-tree` OBJ → `public/assets/models/apple-tree/runtime/apple-tree.glb` (meters, seated at origin; temp MTL wires map_Kd) |
| `scripts/export-lawn-grass-stump-runtime.py` | Blender: `masters/lawn-grass-stump` → circular `lawn-grass-stump/runtime/` (cm→m, 12 m disc, decimate **0.55**, Bust stop only) |
| `scripts/export-maple-tree-runtime.py` | Legacy: `masters/maple-tree` OBJ → `maple-tree/runtime/` (not loaded by Bust stop) |
| `scripts/export-japanese-maple-runtime.py` | Legacy: `masters/japanese-maple` → `japanese-maple/runtime/` (not loaded by Bust stop) |
| `scripts/inspect-travel-assets.py` | Inspect source trees without writing |

Post-export (from the script header):

```bash
npx @gltf-transform/cli resize runtime.glb resized.glb --width 1024 --height 1024
npx @gltf-transform/cli webp resized.glb runtime.glb --quality 86
npx @gltf-transform/cli meshopt runtime.glb runtime.glb
```

---

## 17. Frame loop

`StageExperience._animate` (single rAF):

1. PC power LED once the Desktop model is ready; CRT spill when the CRT is lit or `_shouldRunIntroHeavyEffects()`; CRT glass env only under that heavy-effects gate
2. Placeholder anim fns
3. Parallax damp zones → `parallax.setStrength`
4. `cameraRig.update(dt)`
5. Intro tick, index/zoom sync, POV spot aim
6. Vignette `update` (after intro)
7. Model reveal fade, **neon + fog `uTime`** (grain stays off)
8. **`neon.captureFogDepth`** (opaque layer-0 depth → fog soft fade; neon tubes on layer 0 feather via soft fade). Live pass: layer **0** only — meshes on `GPU_HOLD_LAYER` **3** are skipped. Pre-show: `compileHeldRoot` + `compileHeldFogDepth` (same `MeshDepthMaterial` override into the depth RT, hold layer included), then release.
9. `post.render` then water cursor (same WebGLRenderer, `autoClear = false`)

Do not add a second `requestAnimationFrame` for scene motion. GSAP must not write `camera.position`.

---

## 18. Tests

Node-only for math/state (`test:motion`). If you change Sidekick materials or `setGroupRenderOpacity`, run `test:sidekick`. That suite asserts `Buttons` stay repaired, `KeyboardText` keeps its cutout atlas, and the fused `sideButtons` CALL/END/D-pad body stays opaque (map kept, `alphaTest` 0, not keypad plastic) through `setGroupRenderOpacity(0)→(1)` + `ensure`. If you change `scrollAdvance` / `CameraRig` settle, add a case — “stuck after the first hop” was a one-line timer reset with no test (`notifySettled` is covered as false→true only; mid-travel wheel must not auto-fire). If you change the boot gate vs deferred GLB split, run `test:gate`.

`npm run test:smoke` (`scripts/stage-canvas-smoke.mjs`) boots the real Vite stage in a **headed** real-GPU Chromium (headless throttles `requestAnimationFrame` via `document.visibilityState`, the exact pitfall `verify-real-chrome.mjs` documents) and drives it entirely through `window.__stageDebug(method, ...args)` — the worker-RPC bridge, the only thing that actually exists on the page (`window.__stage` lives inside the Worker's own scope and is never exposed to the page in a real build). It performs a real canvas click to trigger the black-hole spiral itself (`navigator.webdriver` reads `true` on the page but `undefined` inside the dedicated Worker, so `_enableInteraction`'s automation auto-trigger never fires there), asserts the spiral-end→drop-start gap, no thrown/console errors through load (**fails on `GL_INVALID_FRAMEBUFFER` / "Framebuffer is incomplete"**), canvas non-blank after the gate, click-zoom on Bust via a real synthetic click, CRT boot after zooming Desktop (navigating one hop at a time — `advance(steps)` only ever moves one ring position, never a jump), all 13 Desktop/Sidekick/Archaeology meshes present after a full hop cycle, the chunk-texture queue fully drained with a real (non-uniform) mip-0 GPU readback, and a structural scan for `toneMapped:false` + bright-emissive materials outside an explicit allowlist (the shape that blew out the Sidekick screen). It is the only suite that can catch shared-GLTF-material / alpha-0-snapshot / WebGL-taint / CubeUV-shader / zero-size RT classes. Requires `npx playwright install chromium` once.

---

## 19. Dev probes

Probes exist only in dev builds (`import.meta.env.DEV`). `window.__stage` is not set while the worker host owns the canvas.

```js
window.__stage.debugPerf()           // Phase-1: DPR / effectiveDpr / motionDprActive / governor / EMA / gates
window.__stage.frameBudget.dump()    // passes.{fog-depth,edge-sdf,beauty}.avgMs (every frame) + slow tags
window.__stage.frameBudget.reset()   // clear before a near/far cost matrix
window.__stage.debugEdgeGlitch()     // includes gates.* + costActive + hasSceneDepth
window.__stage.debugFloorHeights()
window.__stage.debugResnapAll()
window.__stage.debugSidekick()       // keypad health + hardware graph (body vs label)
window.__stage.debugNeon()            // lights + TEMP live knobs (height, maxLight)
window.__stage.debugFogCapture()      // depth RT size, nearest, live near/far, packed samples
window.__stage.debugFogVis("both")    // camera quad: packed depth + soft ramp (off | depth | soft | both)
window.__stage.debugFogIsolate({ floor })  // floor neon stain isolate
window.__stage.debugFog("volumetric") // no-op while STAGE_FOG_ENABLED=false; else live raymarch on
window.__stage.debugFog("off")        // volumetric off
window.__stage.debugFogPixelate(1)    // digital-noise fog (0 = soft)
window.__stage.debugFogPixelate(1, 0.2) // coarser voxels
window.__stage.setVolumetricEnabled(true|false) // alias → debugFog
window.__stage.setVolumetricParams({ /* fogConfig keys */ })
window.__stage.debugVolumetricFog()
window.__stage.setNeon({ height, maxLight })  // TEMP hot-tune; remove after bake
window.__stage.debugEdgeGlitch()     // edge-glitch SDF / L1 diamond / beauty tear knobs
window.__stage.setEdgeGlitchParams({ glitchArmOuter, intensity, rgbSplit, tearBands, … })
window.__stage.getEdgeGlitchParams()
window.__edgeGlitchTuner             // Shift+G panel API
window.__stage.setAccentParams({ ... })
window.__stage.getAccentParams()
window.__stage.debugAccent()
window.__accentTuner                    // Shift+A accent rim/sweep/shaft
window.__stage.setWetFloorParams({ envStrength, colorGain, uvRepeat, probeEveryN })
window.__stage.getWetFloorParams()
window.__stage.debugWetFloor()
window.__wetFloorTuner                  // Shift+W wet concrete / CubeCamera probe
window.__stage.setWaterCursorRimParams({ blowExponent, neckPinch, recoilPushPx, slurpBand, snapThreshold })
window.__stage.getWaterCursorRimParams()
window.__waterCursorRimTuner         // Shift+C panel API (blob response only)
window.__stage.setLawnEdgeParams({ patchScale, bladeLength, bladeDensity, tuftAmount, breezeStrength, breezeSpeed, coverageNoiseScale, edgeFalloff, stragglerDensity, shapeDistortion })
window.__stage.getLawnEdgeParams()
window.__lawnEdgeTuner               // Shift+L panel API (lawn coverage only)
window.__stage.setWorkQuality(0.6)   // object raster only; screens stay; fog step-scale later
window.__stage.setWorkQuality(1)      // restore full DPR cap
window.__stage.debugWorkQuality()
window.__stage.debugScrollCapture()   // capture blend, parallax damp, focus phase, camera settled
window.__stage.debugCrtAlign()        // square + crosshair on CRT bezel content quad
window.__stage.debugDuo()             // Duo FAB entrance / fit / seat / client rect
window.__stage.debugFrameBudget()     // post-land slow frames: fog-depth / beauty / html-to-image / compile
```

---

## 20. Landmines

These are why the repo has “weird” helpers. Full narrative history lived in an older `docs/PROJECT.md`; the rules below are what still matter.

1. **Shared GLTF materials (Sidekick keys / labels).** `Buttons` and the transparent cover share `phong3` (MASK, alpha 0). Clone-then-mutate the cover is not enough. Repair keys onto pinned opaque DoubleSide plastic; re-ensure every update; never `dispose()` a GLTF material another mesh still holds; intro fade must not snapshot alpha 0 as authored keypad state. **Cover heuristic must be identity-only** (`phong3` / `sidekick_cover_mask` / shared cover instance) — never `opacity < 0.05 && alphaTest > 0`. `KeyboardText` is a separate glyph cutout (`alphaTest` 0.08). `sideButtons` is a **fused** CALL/END/D-pad atlas (`phong4` + `TmobileButtons`) — denylist it by mesh name and force the atlas opaque; a cutout leaves the print and deletes the plastic. Do not pave it with untextured keypad plastic.
2. **`notifySettled` every settled frame** disarms scroll forever after hop 1.
3. **Queued hop on land** skips a stop. Mid-travel wheel re-arms after land but does not auto-fire.
4. **Heavy GPU work on the land frame** hitch the height ease-out — stagger it. After land, do not warm deferred meshes 1-per-present: each new program compiled inside `captureFogDepth` + beauty and frames sat over 1 s for the mesh count. Hold on layer **3**, compile once, then show.
5. **html-to-image on a canvas used by WebGL taints** the context.
6. **Look-at aimed at the destination during a hop** cuts a chord through the arena. Rest look-at stays on the ring at **current** theta.
7. **Do not rotate `world` to change stops.**
8. **POV spot + fog in-scatter on the same layer** → grey fog with a white hotspot. Spot stays layer 0 only. Neon lights are {0, 2}.
9. **Volumetric soft-contact + far-band fade.** Soft-contact ends the march at FogDepthCapture depth (`packed` undo + live near/far). Far horizontal band was the ray hard-stop at `baseMaxRayLength` **32** while the far arc sits ~**42–50 m** — density now ramps to 0 via `fogDistFadeStart` **24** / `fogDistFadeEnd` **32**. Wet floor is MeshStandard on layer **3** — do **not** put it on layer **0** with the POV spot (soft round ground pool). Tube floor spill is additive `neon-floor-glow` on layer **2**, plus wet-apron neon speculars.
9b. **~~Volumetric grazing horizon bands (hard slab top + bottom)~~ — FIXED (re-closed 16 Sep 2026).** Top lid = density-independent hard ceiling (`heightFogEndY` + `fogMaxY` / `clipYSlab` upper). Bottom edge = floor-depth hard stop. **Relapse this session:** (1) `subjectWrapMaxY` **3.8** Y ceiling on the wrap multiplier — removed (XZ-only); (2) Manual 1 haze **range 0.5** too tight — keep live range **≥1.8** when gate is on; live ceiling is haze floor **0.05** / start **0.05** / range **1.8** (`heightFogExpK` **0.5**, dens **0.65**) — **never** restore haze floor **0.55** / range **2.8** (full-screen wash when bank was “restored”); (3) vignette `dens = puff * hEnv * vMask` **wiped** `fogFloorFadeRangeY` before return — soft floor now runs **after** replace and is **squared** (`fl²`); live fade **1.2**; (4) do not FINALIZE Manual 1 dist fade **12→18** (intersects Bust floor hits ~10–16 m) — live **24→32**. Exp path skips **all** `clipYSlab` Y clamps. Metric: all-rows max ±8 contrast, pass ≤**6**. Verify: `scripts/vol-fog-lidfix-verify.mjs`. Do not let pin/FINALIZE lose the post-vignette soft-floor again.
9b2. **Fog on bust depth plane = waterline / “liquid shelf”.** Prefer plane exclusion: `fogSoftContactRange` **~2** (clearGap + fade) so dens never sits on FogDepthCapture hits — fog stays in front and on miss rays behind. Pair with `fogEdgeSoft` bleed so the silhouette is not a dark cutout. Do not raise subject height kScale to “wrap” the figure (paints the shelf onto the mesh). ClearGap-only without edge bleed → dark halo.
9c. **Volumetric composite must be premultiplied.** March writes `accum` (T-weighted in-scatter) + `a = 1−T`. Composite is `scene * (1−a) + fog.rgb` — **never** `mix(scene, fog.rgb, a)` (applies alpha twice and erases thin haze / near-tube glow).
9c. **Volumetric vertical columns = ray/step undersampling (or warp=0).** `baseMaxRayLength` / `baseRaymarchStepCount` must stay ≤~**0.7 m/step**. 32 m / 16 steps (~2 m) undersamples `falloffCeilingJitter` + `globalScale` into streaks. Live: **32 / 64** (0.5 m/step **budget**). Steps = quantized buckets of **8** from `rayLen` with **fixed** world spacing — near hits stay cheap (stop-0 bust); do **not** restore raw per-frame `ceil(rayLen/spacing)` (that pulsed fog under depth jitter → global flash / haze pop). `falloffNoiseWarp` **1.5** deforms falloff so blobs churn; if columns remain after warp, drop `noisePow` toward **2.5**. Lab and stage both load `FOG_DEFAULTS` from `fogConfig.js` — do not hand-tune one side; prod FogTuner + FINALIZE is the source of truth.
9d. **Stop-0 black / 7–12 FPS with a still cursor = fog near-field cost + occlusion, not neon.** A 4 m bust + maple fill near depth; fixed 64-step marches against every near pixel + dense fog in front of the subject read as black (mouse-move “flash” was FPS briefly recovering). Fix: quantized adaptive steps (§9c) + `fogNearFadeStart`/`End` **0.5→6** (thin fog within ~6 m of camera). Do not re-tune NeonSystem arrive-latch for this symptom. Neon was already `contentVisible` while pixels were fog-black.
9e. **Global continuous flashing / gray haze popping with a dead-still cursor = unstable march step count.** Same root as raw per-pixel `ceil(rayLen/spacing)`: depth micro-jitter flips the integer step count → density oscillates. Fix is §9c quantization + fixed spacing — not fog density / near-fade retunes.
9e2. **Fog edge vignette flash on land = bloom extracting the opacity fade (C05), not the opacity fade alone.** Density stays **full**; **`uCompositeOpacity`** fades **0→1** over **400 ms** at **`introComplete`/land** (not heavy-effects **2000 ms**). Hold bloom intensity at **0** across that ramp; restore at full so bloom never sees mid-fade frames. Distinct from §9e step-count flash and from the older density/in-scatter crossing.
9e3. **Settled edge/vignette strobe (dead-still cursor) = animated fog composite Bayer dither — FIXED spatial-only.** `outputDither` **0.02** must sample `bayer4(gl_FragCoord.xy)` only. A `uTime` offset made the 4×4 grid crawl at soft fog α edges (stripMae ~**1.45** → ~**0** when phase pinned). Do **not** set `outputDither` **0** (Mach banding). Regional-mean luminance and `test:smoke` cannot see this — prove with `scripts/edge-strobe-dither-bisect.mjs`. Distinct from §9e2 (land bloom) and §9e (step count).
9f. **Neon tubes as hologram / light-shaft with no body = Additive-only core+halo.** Keep a **MeshStandard sleeve** + bloom core (Option 1). Do **not** reintroduce an Additive shell volume.
9g. **Traveling bright blob on the tube = bloom extracting uneven hues.** Core uses **per-hue luminance compensation** (`NEON_CORE_MAX` **1.85**) so all colors clear threshold **1.0** ~equally. Do **not** raise global bloom threshold (Sidekick/CRT share it).
9i. **Dark cylinder / “light vacuum” around neon = Additive shell volume** (even One/One + α=0 still reads as a hard wash over maple). **Fix: drop the shell** (Option 1) — glow from bloom on the compensated core only. Do not ship a 4th shell blend patch.
9e. **Stop-0 lit when still, flashes black the instant the cursor moves = bloom `mipmapBlur`, not neon/fog.** Post-beauty `readPixels` shows intermittent mean≈0 frames under parallax; freezing parallax or disabling bloom removes them; RenderPass+Grain is clean; RenderPass+Bloom with `mipmapBlur: true` is not. Fix: `PostPass` bloom uses `mipmapBlur: false` + `KernelSize.LARGE`. Neon arrive-latch stays fine.
10. **ANGLE Playwright ≠ mid-GPU absolute.** `post-land-frame-budget.mjs` uses `--use-gl=angle --ignore-gpu-blocklist` as a **relative** fog-on vs fog-off regression gate only. Absolute “runs on mid hardware” is a separate manual check on real integrated GPU / low-power emulation — do not let the ANGLE number stand in for that.
11. **Zero-size framebuffer / incomplete attachment.** `EffectComposer.addPass` / early `setSize` can see a **0×0** drawing buffer before the canvas is ready; if `PostPass.setSize` early-outs on CSS size alone after a DPR/`?work` change, composer or `VolumetricFogPass.fogTarget` can stick at 0×0 and flood `GL_INVALID_FRAMEBUFFER_OPERATION: Attachment has zero size` every frame (looks like free fog + banding garbage). Fix: refuse `setSize(0,0)`, sync from drawing buffer (not CSS-only early-out), `ensureSizeFromRenderer` each volumetric render, skip march until `_hasValidSize`. `test:smoke` fails on incomplete-FB. Do not tune fog look while this fires.

11b. **Right-edge black gutter = stale canvas CSS width.** `renderer.setSize(w,h)` defaults to writing **inline** `width/height` px, which overrides `#scene-canvas { width:100% }`. If the window/panel grows without a resize sync, body `#070709` shows beside a short canvas while fixed HUD still spans the full window. Live: `position:fixed; inset:0`, `setSize(w,h,false)`, `ResizeObserver` on `documentElement`, `debugWorkQuality().gapRight`. Related: WetFloor / LiveEnv must restore viewport with **`renderer.getSize` (CSS px)**, never drawing-buffer dims into `setViewport`.
12. **Neon dominants (`[0]`) must stay evenly spaced around the color wheel in ring order.** Do not set two adjacent stops to complementary hues or the overlap arc greys out. Mixing still happens in the band’s overlap — it stays clean only because the inputs are not complementary. The old cyan-vs-orange mud is retired, not relocated.
13. **Archaeology / stele / shelf props read as a black void without IBL, or with bad normal maps.** MeshStandard + no IBL + ambient **0.06** against `STAGE_BG` `#070709` is a silhouette, not a missing mesh. Assign the static RoomEnvironment PMREM (`getStudioEnvironment()`); never the CRT cube capture (`update(..., { applyToScene: false })`). Runtime stele/rex GLBs may bind bump/height atlases as `normalMap` and ship no usable TANGENT — **strip the normal map** at polish. Do not force `FrontSide` on the stele (GLB is doubleSided). Stamp reveal opacity on deferred roots that mount after the fade already hit 1. Strip Sketchfab `FLOOR` before shelf AABB fit. Archaeology uses `skipFloorSnap` — after local floor fits, do **not** `snapGroupToFloor` the vignette. **Antikythera (and similar Sketchfab exports) can sit hundreds of units off origin** — `fitHeightOnFloor` must pivot-center the mesh; writing only `root.position` to the shelf leaves the geometry elsewhere. **Flat chalk / white plate with a present baseColor map** usually means **TEXCOORD_0 all zeros** (Sketchfab CT) — meshopt decode is fine; rebuild UVs (`scripts/rebuild-antikythera-runtime.mjs` smart-project) and keep polish color **1** so albedo is not grey-multiplied.
14. **CRT glass ShaderMaterial + CubeUV.** `textureCubeUV` needs `CUBEUV_MAX_MIP` / texel defines. Bind a **PMREM** (`CubeUVReflectionMapping`) as `material.envMap` so `WebGLProgram` injects them once (`applyCrtGlassEnvMap`). Do **not** also stamp those defines on `material.defines` (redefinition fails the fragment compile). Never bind the raw cubemap (`getTexture()` must not fall back to `WebGLCubeRenderTarget.texture`).
15. **CRT content is a Blender-measured bezel plane, not `pc-Mesh_2` UVs.** The authored phosphor is a rounded radial island — it cannot fill the square bezel hole. Re-measure with `scripts/crt-bezel-blender-measure2.py` (writes `crtBezelOpening.js` + `crt-content-plane.glb`); content = opening inset **1 mm**, corner radius **2 mm** (was 1 cm / 1.2 cm — that curved-cropped MySpace/XP chrome). Do not “fix” edge crop with more `DOM_CAPTURE_EDGE_PAD` (wrong layer — pad stays **40**). Clone glass from the **bulge before** flatten; keep the content plane behind `shellOffset` **0.006**. Working blend: `tmp/crt-bezel/crt-bezel-content.blend` — never edit masters. Edge-cropped MySpace/XP/SMS text from capture = permanent inset on page parents (`DOM_CAPTURE_EDGE_PAD_PX` **40**); curved bezel crop = content-plane geometry.
20. **CRT gray glare disc on dark stage.** Classic cause = glass `envMapIntensity` too high (C12) — keep **0.22**; do **not** raise `STAGE_ENV_INTENSITY` or set CRT cube `applyToScene: true`. Recurrence: broad **neon PointLight** specular (N·L fill / low `neonSpecPower`) — or a hot glint that **bloom** softens into a disc — keep a rim pin (`neonSpecPower` **≥180**, fresnel², RGB cap under bloom threshold); leave `envMapIntensity` alone.
16. **Floor snap must ignore neon tubes (and cables / glow / contact-shadows).** Each vignette group owns a `neon-tube` planted on `STAGE_FLOOR_Y`. If that mesh anchors `snapGroupToFloor`, the Desktop PC (and anything else aligned above the tube) floats ~0.5 m. `isFloorExcludedMesh` skips `neon` / `glow` / `contact-shadow` names and `cable*` materials — keep it that way.
17. **`glitch-gl` is parked, not stage post.** It owns a separate WebGL renderer + rAF and nests `three@^0.178`. Do not `import` it into `StageExperience` / `PostPass`. Cursor-proximity subject effect is **screen-space SDF + `EdgeGlitchPass`** (restored 9/15–9/16: beauty-buffer horizontal tears + RGB split on an L1 diamond — `intensity` **0.16**, `rgbSplit` **0.042**, `tearBands` **88**, spans **0.028 / 0.016 / 0.016**, `glitchArmOuter` **0.06**). **Not** SubjectDissolve / dying-transmission shear-to-black. **strength FIELD** = L1 diamond at CROSS POINT (`spanAlong` / `spanOut` / `spanIn`); **occlusion** = FogDepthCapture even when fog is **off** — allow outside tips on empty BG, reject foreign geometry via view-Z; do **not** reintroduce undilated subject-alpha hard-clip (kills outside half). Do **not** reintroduce dissolve shear / fade-to-black / dissolve-line / fringe flood / scanline diamond-fill / block-displacement / liquid/bulge/gooey / bonus zones / `revealBoost`. **Active-stop subject** via `setActiveRoot`. Tune with **Shift+G**. Read `glitch-gl` GLSL as a look reference only.
18. **PC speaker “shimmer” ≠ missing antialiasing.** The composer is HalfFloat. The ring uses **SMAA**. The black-hole flight uses **`BLACK_HOLE_MSAA` 8**. Speaker crawl is still specular aliasing from high-frequency normals under a scrolling neon light. Fix materials (`pc_1` normalScale / clearcoat off / roughness floor / normal mip bias). PointLight hue **must** track the live tube mid-UV on every stop (no rate-cap lag). Do not chase shimmer by raising the pixel budget or by decoupling light color from the tube.
18b. **PC tower edge = second neon bar.** Root cause is the Desktop neon PointLight (Y ≈ **1**, intensity **28**) minting a mid-height specular on the front-right tower edge — height matches the light, not the full tube. Contributing landmines: (1) `toneMapped = false` on `pc_1`/`pc_2` (LEDs OR `applyEmissiveMaterial`) lets that specular skip ACES into bloom; (2) a `directLight.color *=` patch that searches for `RE_Direct` inside `onBeforeCompile` is a **silent no-op** because includes are not expanded yet — must replace `#include <lights_fragment_begin>` with a patched `ShaderChunk.lights_fragment_begin`. Keep tone-mapped; punch LEDs via intensity; `pc_1` roughness floor ≥ **0.62**, `specularIntensity` ≤ **0.18**, point-light mul ≤ **0.16**.
19. **Neon load-rest / arrive latch (stop 0).** Content under `neon-lit-content` must track the **pre-flicker arrive** envelope with hysteresis — never the flickered light value (zeros hide the whole stop → black⇄lit strobe). **Once `_arriveLatchedIndex` matches the active stop, content visibility follows the latch only** (ignore envelope micro-noise). Archaeology arrive hysteresis: ON **> 0.08**, OFF **≤ 0.02** (ON must sit above OFF — the old **1e-3 / 0.02** pair turned content on then immediately off in the gap → C04 chatter). Stop 0 is the load-rest stop: latch arrive on the **intro→first-settle handoff** via `neon.armArriveForActiveStop(index)`. **`allowNeon` is `introComplete` only** — do **not** OR with `CameraRig.isSettled` (aerial hold is also “settled” at pageload height → stop-0 flash on → drop blackout → land pop). Do not arm flicker until the camera has left the strike band (`_flickerEligible`) — intro land already sits inside it. Bust/maple mount on the boot gate (not the opacity reveal list); deferred-root reveal stamps (§13/§20.13) apply to PC/Sidekick/Travel, not the arrival bust.
9h. **Stop-0 global flash during aerial intro = `allowNeon = introComplete || isSettled`.** Aerial hold settles at pageload height → neon/content on; `armIntroDescent` unsettles → off; land settles → on. Fix: gate `allowNeon` on `introComplete` only; arm stop-0 arrive latch in `_completeIntroMotion`. Distinct from fog step-count flash (§9e) and from C04 arrive-edge content chatter (§19).
21. **Ambient/hemi + soft POV spot.** Ambient **0.03** / hemi **0.08** / scene IBL **0.6** (Shift+E starting point); POV spot **18** / angle **π/9** / penumbra **0.45** (not the old **118** key); neon **28** / distance **2.75** / decay **3.5**. Leaf canopy still spot×0 and kills indirect (`LEAF_INDIRECT_SCALE` **0**), so leaves do not pick up the env. Do not put spot on wet-floor layer **3**.

---

## 21. What not to do

- Do not scaffold a second app, scene, or `EffectComposer`.
- Do not drop `glitch-gl` into the stage rAF / composer (it is its own WebGL loop).
- Do not `gltf-transform optimize` (includes `simplify`). Resize → webp → meshopt. Register `MeshoptDecoder` on the loader. Do not wait on Draco.
- Do not apply Array modifiers on Blender export (`export_apply=False`).
- Do not mutate a GLTF material in place without `ownMeshMaterial`.
- Do not html-to-image every hover/boot frame.
- Do not let Sidekick hover capture stage wheel.
- Do not put `Buttons` back on `phong3`.
- Do not edit files under `masters/`.
- Do not put two adjacent neon dominants on complementary hues (the overlap arc greys out). Keep `[0]` evenly spaced on the wheel in ring order.
- Do not assign the CRT cube env to `scene.environment` (recolors every MeshStandard material). Use `getStudioEnvironment()` for stage IBL at modest `STAGE_ENV_INTENSITY` (**0.22**) — not 1.0 on top of spot **118**.
- Do not bind a raw cubemap into CRT glass, and do not hand-define `CUBEUV_*` alongside `material.envMap` (see §20.12).
- Do not raise neon PointLight intensity/distance to “fix” maple/apple fill (re-lights inactive stops / breaks focus-gate content-hide). Attenuate POV spot on leaf materials (`onBeforeCompile`), set leaf `envMapIntensity` to **0**, and use **leaf-only** `LEAF_LIGHT_DISTANCE` remap + fake self-shadow instead. Do not assume light `layers` selective-light under WebGLRenderer.
- Do not OR `allowNeon` with `CameraRig.isSettled` (C01 aerial flash). Do not revive `neonProximity` / `NEON_LIGHT_FALLOFF`. Do not enable POV spot on layer **2**. Do not reintroduce an Additive neon shell mesh (vacuum). Do not raise global `NEON_BLOOM.luminanceThreshold` (Sidekick/CRT share it).
- Do not retune **edge-glitch** knobs (`liquidArmOuter`, `glitchArmOuter`, `SPAN_*`, intensity, …) when adjusting water-cursor feel — blob RESPONSE lives in `waterCursorRimConfig.js` / **Shift+C** and is applied in `waterCursorRimResolveShader`. Glitch must stay visually identical across cursor-curve changes. Do not call `readRenderTargetPixels` / `sampleDistance` from `_tickWaterCursorRim` or `WaterCursor.render` (that was the **56.8%** `readPixels` stall). `sampleDistance` is an on-demand debug probe only. Do not call `readRenderTargetPixels` from `ScreenLightRig.update` — spill tint comes from the CRT canvas.
- No synchronous GPU readback in `_animate`. And no per-frame re-render of a static-scene shadow — the Bust lantern cube bakes once on settle (`shadow.autoUpdate` **false**). If the casters do not move, the shadow map is a static asset, not a per-frame render.
- Do **not** revive beauty-tear / `revealBoost` / RGB split / fringe flood, liquid/bulge/rim/gooey, block-displacement cells, scanline diamond-fill, or roaming bonus zones. Live look = **subject dissolve** (scan-slices → black + thin dissolve-line, cap **0.22**).

---

## 22. Keeping this document current

- **Canonical file:** this README. `docs/PROJECT.md` only points here.
- **Agent rule:** `.cursor/rules/keep-readme-current.mdc` (`alwaysApply`).
- When you change a tunable, copy the number from code, do not round from memory.
- When you add a vignette, update the stop table, `n` in hop math (`2π/n`), neon colors, and asset paths.
- When you add an npm script, add it to [§16](#16-assets-and-scripts) and [§18](#18-tests) if it is a test.
- If you rename a file or constant, grep this README and fix every mention.
- Bump **Last verified** at the top on every README edit.
- **Prepend a row** to [Latest changes](#latest-changes) (newest first) summarizing what changed — knobs, paths, landmines, or behavior. Keep rows short; details stay in the numbered sections. When a row's date is more than 3 days old, move it to [CHANGELOG.md](CHANGELOG.md) (newest first) and leave it out of the README.
