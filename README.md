# Portfolio 2.0

Cinematic, scroll-driven Three.js stage. One WebGL canvas, four vignettes on a **fixed** ring, orbital camera on critically damped springs, live UI painted onto model screens, neon tubes + a single connective fog ring (four static lights), Windows-XP-styled load gate.

**Last verified:** 10 September 2026 (GATE 4 — volumetric slab soft top+bottom; grazing bands fixed). This file is the source of truth. Agents must update it in the same change as the code (see `.cursor/rules/keep-readme-current.mdc`).

Proof of concept — not production-hosted yet. Dev entry: `src/main.js` → `StageExperience`. In development the instance is `window.__stage`.

---

## Contents

1. [Direction](#1-direction)
2. [Run locally](#2-run-locally)
3. [Tech stack and tools](#3-tech-stack-and-tools)
4. [What you see](#4-what-you-see)
5. [Layout](#5-layout)
6. [HTML chrome](#6-html-chrome)
7. [Coordinate system, ring, proportions](#7-coordinate-system-ring-proportions)
8. [Camera](#8-camera)
9. [Intro, load gate, XP boot](#9-intro-load-gate-xp-boot)
10. [Lighting](#10-lighting)
11. [Post: bloom (grain off)](#11-post-bloom-grain-off)
12. [Neon tubes + fog](#12-neon-tubes--fog)
13. [Vignettes](#13-vignettes)
14. [Screen pipelines](#14-screen-pipelines)
15. [Cursor, audio, HUD](#15-cursor-audio-hud)
16. [Assets and scripts](#16-assets-and-scripts)
17. [Frame loop](#17-frame-loop)
18. [Tests](#18-tests)
19. [Dev probes](#19-dev-probes)
20. [Landmines](#20-landmines)
21. [What not to do](#21-what-not-to-do)
22. [Keeping this document current](#22-keeping-this-document-current)

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
| Post | `postprocessing` `^6.39` | One `EffectComposer`: RenderPass → **VolumetricFogPass** → bloom → grain (grain amount **0**) |
| Glitch (parked) | `glitch-gl` `^1.0.6` ([naughtyduk/glitchGL](https://github.com/naughtyduk/glitchGL)) | Installed for eventual DOM / screen effects. **Not** in the live stage loop |
| Fog shader | `three-custom-shader-material` `^6.4` | Wraps `MeshStandardMaterial`; write `csm_DiffuseColor`, never `csm_FragColor` |
| Screen UI | Offscreen DOM + Canvas 2D | MySpace / XP / SMS on meshes |
| DOM → texture | `html-to-image` | Static frames only (login, SMS LCD) |
| Audio | `HTMLAudioElement` + session mute | XP + Sidekick SFX |
| Tests | Node ESM scripts + Playwright smoke | `test:motion` is Node-only; `test:smoke` boots the real canvas |
| Travel GLB | Blender (`bpy`) via `scripts/export-travel-runtime.py` | Then gltf-transform **resize → webp → meshopt** (never `optimize`) |
| Binaries | Git LFS | `*.glb` and `public/assets/models/**/*.png` |

**Not used:** physics, ScrollTrigger, Lenis, a second composer, world-Y rotation for travel, Draco. Geometry compression is **meshopt** (`EXT_meshopt_compression`) with `MeshoptDecoder` on the runtime `GLTFLoader`.

**`glitch-gl` (parked):** `npm install glitch-gl` → `import glitchGL from "glitch-gl"`. Pixelation / CRT / glitch on DOM targets (images, text, video, GLTF). Free for personal portfolios; commercial use needs a NaughtyDuk licence. It spins its **own** Three.js renderer + rAF (and pulls nested `three@^0.178`), so it must **not** be dropped into `StageExperience`’s composer or stage rAF. When we wire it, keep it on a separate DOM surface (e.g. overlay / screen prototype page), or extract shaders only into the existing `postprocessing` stack.

Renderer (live): ACES Filmic, exposure **1.18** (`EXPOSURE`), PCF soft shadows, output sRGB. DPR cap **1.75** (fine pointer) / **1.5** (coarse). Background **`#141414`** (`STAGE_BG`). Camera near **0.1**, far **120**, FOV **42°** (`CAM_FOV`). Antialias on, `powerPreference: "high-performance"`.

While building, `?work` / `?work=1` / `?quality=0.6` boots meshes at **60%** of that DPR cap and scales the POV shadow map the same way. `?work=0` / `false` / `off` forces full. Bloom, fog, and the XP / MySpace / Sidekick SMS canvases stay full — only the object raster shrinks. `setWorkQuality` clamps to **0.35–1**; `setWorkQuality(1)` restores.

---

## 4. What you see

Four stops on a ring of radius **18 m**, inward-facing props, camera **outside** the ring. After the aerial drop, scroll lands on **Monolith**. Wheel / arrows / dots hop ±1 stop. Click the active stop to zoom.

| Index | Angle | Stop | Neon dominant | Interaction |
| --- | --- | --- | --- | --- |
| 0 | 0° (+Z) | **Monolith** | `#9dff1a` (~92°) | Placeholder PC blockout |
| 1 | 90° (+X) | **Retro Desktop** | `#00e5ff` (~187°) | PC GLB. Click CRT → zoom → XP boot → MySpace. Wheel on zoomed CRT scrolls the page |
| 2 | 180° (−Z) | **Sidekick** | `#8c2dff` (~266°) | Phone GLB. Click toggles zoom **and** lid swivel. Open LCD is a live SMS form |
| 3 | 270° (−X) | **Travel Pack** | `#ff3d1a` (~7°) | Pack + T-rex GLBs. Click pack to open; bones can twitch |

Desktop group is scaled in toward center by **5%** (`position.xz *= 0.95`) so the CRT reads larger at rest without changing ring angle.

Caption / dots / `STAGE ddd.d°` readout follow the camera’s orbital angle, not a spinning world.

---

## 5. Layout

```
src/
  main.js                           StageExperience + audio FAB
  scene/
    StageExperience.js              Owner: renderer, intro, input, lighting, loop
    camera/
      CameraRig.js                  Theta / radius / height / zoom / lookAt springs
      spring.js                     Closed-form critically damped ζ=1 (`springTo`)
      scrollAdvance.js              Discrete wheel → ±1 hop
      parallax.js                   Pointer offset after rig pose
      ringLayout.js                 Stops from vignette world positions
      vignetteClick.js              Click to zoom the active stop
      parallaxDampZones.js          Soften parallax over CRT (~20% travel)
    loaders/
      createGltfLoader.js           GLTFLoader + MeshoptDecoder
    neon/
      NeonSystem.js                 Tubes + 4 static lights + fog ring + haze + depth soft fade
      makeNeonTube.js               Cylinder + emissive gradient map
      neonGradientTexture.js        Tall 4×256 canvas strip (gradient on V)
      bakeFogAtlas.js               One-shot FBM flipbook (load gate only)
      createFogMaterial.js          Lit grey CSM; world-XZ sample; uSceneDepth soft fade
      createFogRing.js              RingGeometry annulus (~14–22 m)
      FogDepthCapture.js            Opaque layer-0 depth pre-pass (sheet soft fade + volumetric)
      FogDebugOverlay.js            DEV camera quad: packed depth + soft ramp
      VolumetricFogPass.js          Screen-space raymarch (shared with fog-lab)
    fog/
      fogConfig.js                  Canonical volumetric knobs (lab + stage)
    stage/
      constants.js                  Radii, lights, neon, intro, scroll
      PostPass.js                   Live composer: RenderPass → volumetric → bloom → grain
      FilmGrainEffect.js            Custom postprocessing Effect
      StageLoadGate.js              Gating LoadingManager + bake + min boot ms
      LiveStageEnvironment.js       PMREM for glass / PBR
      StageStudioRoom.js            Studio shell
      StageFloor.js                 Floor disc
      StageScrollCapture.js         Wheel → CRT / DOM
      placeholderVignettes.js       Monolith
      stageCameraTrack.js           INTRO_TRACK_DESCENT + legacy sampler (tests)
      frameBudget.js                DEV post-land slow-frame tags
    vignettes/
      DesktopVignette.js            Retro PC + CRT
      SidekickVignette.js           T-Mobile Sidekick + SMS LCD
      TravelVignette.js             Pack + T-rex
      BaseVignette.js               Shared vignette helpers
      gltfMaterialOwnership.js      Shared-GLTF material safety
      pcSceneBlockout.js            PC_SETUP_TARGET_HEIGHT + floor snap (excludes neon/cables)
  ui/
    HUDController.js                Caption, dots, readout, MySpace panel
    MySpaceScreen.js                IE chrome + MySpace + XP boot on CRT
    releaseCaptureCanvas.js         Zero html-to-image canvases after copy
    AudioToggleFab.js               Mute FAB
    xpBoot/
      StageBootSequence.js          Fader gate API (`setProgress` / `dismiss`)
      XpBootMonitor.js              CRT XP sequence (content, not page gate)
      config.js                     CRT boot timings + asset URLs
    sidekickSms/                    SMS compose atlas
  cursor/                           Water-blob overlay (same WebGLRenderer)
  audio/siteAudio.js
  content/myspace-content.js
  styles/                           main, myspace, xp-boot, crt-power-on, sms
public/assets/models/               Vendored runtime (Git LFS); travel GLBs are meshopt
masters/                            Untouched source (never edit in place)
scripts/                            Node stress + Playwright smoke + Blender export
```

**Dead / not in the live loop** (kept from the first POC):

- Much of `stageParallaxMotion.js` / `stageCameraTrack.js` — still imported for **tests** and `INTRO_TRACK_DESCENT`. Live drop is the height spring, not the old keyframe sampler
- `vignetteAnchorRotation` / `TRANSITION_DURATION` and friends — leftovers from world-Y travel; **not** what hops the camera. Still used by Node scroll tests.
- Removed (were unreferenced): `SpotlightBloomPass`, `PovSpotlightBeam`, Orbit/Cube placeholder defs, `DESKTOP_FOCUS_CAM_PULL` / `SIDEKICK_FOCUS_CAM_PULL`, `DesktopVignette.ensureRestAnchorBaked` / `applyRestAnchorBlend` / `_tickDesktopRestAnchor`, and the per-frame `world.rotation.y = 0` clamp. `CAM_REST_OFFSET_X` and `DESKTOP_REST_EXTRA_BACK` stay — legacy intro-track sampler / tests.
- Also removed from the live tree: root `src/scene/CameraRig.js` / `ScrollController.js` / `PortfolioExperience.js` (camera lives under `src/scene/camera/`), and `neon/createFogPlane.js` (fog is `createFogRing.js`).

---

## 6. HTML chrome

| Id | Role |
| --- | --- |
| `#scene-canvas` | WebGL target |
| `#readout` | `STAGE 000.0°` |
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
| `#audio-toggle-root` | Mute FAB mount |
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
| Travel pack height | **1.68 m** | `TravelVignette` `PACK_HEIGHT` |
| T-rex height | **3.35 m** | `REX_HEIGHT` |
| Neon tube | radius **0.06 m**, length **4 m** (all four identical) | `makeNeonTube` local XZ `(2.2, 0.85)`; local Y = `length/2 − group.y` so world bottom stays on **Y = 0** after floor snap (`NeonSystem.seatTubesOnFloor`) |
| Fog ring | r **14–22 m**, Y **0.05 m**, 128×4 segments | `NEON_FOG.rInner` / `rOuter` / `y` |
| Haze cards | **20** / **12** coarse (`hazeCount`); **5×6 m**, r **18 m**, opacity **0.2** | Atmosphere — layer **2**, additive, `raycast` no-op |

`CAM_REST_OFFSET_X` (**3 ft**) still exists and is used by the **legacy** intro track sampler / tests. The live `CameraRig` look-at is the ring point at `LOOK.y` with **no** X bias.

**Direction of travel:** `advance(+1)` always adds `+(2π / n)` to `thetaTarget` (never shortest-path). Hop order: Monolith → Desktop → Sidekick → Travel → Monolith.

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

Two clocks that must not be confused:

### Aerial drop (visual intro)

1. Camera starts at rest radius, height **13.85 m**. Quaternion **frozen** so look-at does not pitch as height falls.
2. **240 ms** hold (`INTRO_SPRING_HOLD_MS`) — first-frame shader compile cannot hitch the drop.
3. Height spring to **2.85 m**. Progress is derived from height, not a sampled curve.
4. On land: `introComplete = true`, then staggered work (gating fetch and deferred GLB fetch already started in `_initLoadGate`; warm and cursor delayed).

`prefers-reduced-motion`: no aerial drop (camera starts at rest height **2.85 m**), intro arms immediately, bloom off, `BOOT_MIN_MS` **400**.

Post-land delays (`constants.js`): warm **900 ms** (`INTRO_POST_LAND_WARM_MS`), cursor **720 ms**, settle grace **1200 ms**, integration delay **500 ms**, heavy effects **2000 ms**, Sidekick screen bake **4500 ms**, handoff **680 ms** (`INTRO_HANDOFF_MS`), idle warm timeout **5000 ms** (`INTRO_DEFERRED_IDLE_TIMEOUT_MS`). Deferred GLB fetch starts in `_initLoadGate` with the desktop fetch (not the boot manager) so meshopt parse overlaps the fader instead of post-land frames. Decode is serial: Sidekick first, then Travel / T-rex after Sidekick settles (one meshopt decode at a time).

GLB **commit** still waits on the intro gate so GPU upload does not hitch the ease-out. **Gating fetch** (Desktop PC GLB + PC maps) starts in `_initLoadGate` so the load gate can count those items. **Deferred fetch** (Sidekick, Travel pack, T-rex) starts there too, not on the boot manager.

### Page-load gate (interaction lock)

`createStageLoadGate` + `StageBootSequence` + `#fader`:

**Gating set** (blocks `locked = false`): Monolith has no GLB; Desktop PC GLB + PC PBR maps on the shared `THREE.LoadingManager`; fog atlas bake; `renderer.compile`; min boot.

**Deferred set** (does **not** block the gate): Sidekick GLB, Travel pack GLB, T-rex GLB. They use a default loader (not the boot manager). Bytes start in `_initLoadGate` with the desktop fetch so meshopt parse does not run after land. Materials are assigned while the root sits on `GPU_HOLD_LAYER` (**3**). `INTRO_MATERIAL_BATCH_SIZE` is **1** and `INTRO_MATERIAL_YIELD_FRAMES` is **2** — that yield is only safe because the meshes are off the live cameras. Do not warm **1 mesh/frame** onto layer 0; that compiled each new program inside fog-depth + beauty and stretched sub-1 fps for the mesh count (~40–50 s). `compileHeldRoot` then compiles once. Shadow-depth variants are drawn for **that root only** into a 16×16 offscreen target (`renderer.compile` skips them; a full-scene shadow render recompiles the stage and costs ~1 s). Then `compileHeldFogDepth` warms `MeshDepthMaterial` for held roots into the fog depth RT (not the beauty frame). CRT glass CubeUV / PMREM (`LiveStageEnvironment` cube **768**) is captured once in that same held window, not again when heavy effects unlock. A late deferred `onLoad` cannot re-bake or unlock — finalize commits once.

1. Shared `THREE.LoadingManager` on the **Desktop** GLTF loader and PC `TextureLoader` only.
2. Progress → fader `--boot-progress` (XP bar chrome reused from `xp-boot.css`).
3. On gating load: bake fog atlas, `renderer.compile`, one throwaway composed frame.
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

Keep **scene ambient modest** so neon can own fog color.

| Light | Intensity / role |
| --- | --- |
| Ambient | **0.06** (`AMBIENT_INTENSITY`) |
| Hemisphere | **0.04**, sky `0xd8dce8` (`HEMI_INTENSITY`) |
| Fill | **0** |
| POV `SpotLight` | Parent of camera, **10 ft** above viewer (`SPOT_HEIGHT_M`), intensity **118**, angle `π/5.2`, penumbra **0.52**, distance **52**, decay **1.35**. Aimed at rig lookAt each frame. Shadow map **2048**, near **0.35**, bias **−6e-5**, normalBias **0.028**, radius **2.4** |
| Neon `PointLight` ×4 | One pinned at each tube. Layers **{0, 2}**, `castShadow: false`, distance **8**, decay **2**, peak **10**. Intensity = angular proximity of that stop to camera theta (`NEON_LIGHT_FALLOFF` = π). See [§12](#12-neon-tubes--fog) |
| Scene IBL | Static `RoomEnvironment` PMREM from `liveEnv.getStudioEnvironment()`, intensity **0.22** (`STAGE_ENV_INTENSITY`). Modest fill so travel pack / T-rex are not black silhouettes; POV spot stays the key. CRT cube capture stays on glass only — never `scene.environment` (and `applyToScene` defaults **false**) |
| Studio shell | `MeshBasicMaterial` `STAGE_BG` BackSide — **unlit**. Neon PointLights do not tint it (the old “purple wall slabs” were haze cards; see [§12](#12-neon-tubes--fog)) |

`LiveStageEnvironment` captures a second PMREM for CRT glass; refresh is deferred until models are visible. `applyToScene` defaults **false**.

---

## 11. Post: bloom (grain off)

**One** composer (`PostPass`). Do not add a second.

```text
[opaque depth pre-pass]   // NeonSystem.captureFogDepth → FogDepthCapture (not a composer)
RenderPass → VolumetricFogPass → EffectPass(BloomEffect) → EffectPass(FilmGrainEffect)  // grain = 0
```

`VolumetricFogPass` sits in the composer **always** so gate `post.warm()` compiles march+composite (density scale **0** during the throwaway frame — do not reopen the §9/§20 compile hitch). **Default live atmosphere is volumetric** (haze cards + fog ring hidden; code paths kept). The march waits on `_shouldRunIntroHeavyEffects()` (**2000 ms** post-land) then fades density over **`FOG_HEAVY_FADE_IN_MS` 400**. Legacy compare: `?fog=haze` / `__stage.debugFog('haze')`.

`FogDepthCapture` runs a **layer-0** scene pass with `MeshDepthMaterial` into a dedicated **nearest-filtered color** target (Three `BasicDepthPacking`: `.r = 1.0 - windowZ`, sized to `renderer.getDrawingBufferSize()` including the **1.75 / 1.5** DPR cap). The volumetric pass reads it via `setSceneDepth(..., { packed: true })` and undoes the invert (`1.0 - .r`) with live camera near/far **0.1 / 120**. The legacy ring sheet still samples the same RT for soft-particle fade. Depth material is `toneMapped: false` / `NoToneMapping` so ACES cannot warp packed `.r`. Fog/haze (layer 2) are skipped on the depth pass. Still **one** `EffectComposer`; the pre-pass is not a second beauty pipeline.

Bloom (`NEON_BLOOM`): `mipmapBlur`, `luminanceThreshold` **1.0**, smoothing **0.2**, intensity **1.2**, radius **0.7**, `resolutionScale` **0.5** (half-res bloom internals — soft glow hides the scale; try **0.66** before reverting if edges stair-step). `kernelSize` `KernelSize.LARGE`. Half-float buffers (`HalfFloatType`), no MSAA. Reduced motion: bloom intensity **0**.

**Film grain is off** (amount **0**, normal and reduced-motion). At stage darkness (`STAGE_BG` `#141414`) it read as sensor noise and crushed fog gradients. The `FilmGrainEffect` pass remains last in the chain so a future re-enable is one constant away — do not bloom it.

Tubes use `toneMapped: false` and peak emissive **3** so they clear the threshold after ACES on the rest of the scene. CRT phosphor max **0.72** (`CRT_SCREEN_GLOW_MAX`) — stays under the line.

---

## 12. Neon tubes + fog

Owner: `src/scene/neon/`. Ring/haze knobs in `constants.js`. **Volumetric knobs** live only in `src/fog/fogConfig.js` (do not dual-maintain tables).

The fog **ring** and **haze** cards are legacy paths — **hidden** while volumetric is the live default (`?fog=haze` restores them). Four static PointLights stay pinned at the tubes (layers **{0, 2}**, `castShadow: false`). Each light’s intensity is `neonProximity(camTheta, stopTheta)` — GLSL-style `smoothstep(NEON_LIGHT_FALLOFF, 0, angularDistance)` with **FALLOFF = π**. All four are always on; the near stop is brightest, the far arc is dim. Adjacent chord is ~25.5 m vs light distance **8** / decay **2**, so neighbour props stay dark.

**Volumetric fog (GATE 4 — live default on `/`):** Shared `VolumetricFogPass` (`src/scene/neon/VolumetricFogPass.js`) + `src/fog/fogConfig.js`. Lab re-exports the same pass. Stage wiring: `useComposerDepth: false`, `depthPacked: true`, depth from `FogDepthCapture` each frame; pass inserted **before bloom**. In-scatter feeds all **4** live neon PointLights. Soft luminance cap: fill **`FOG_IN_SCATTER_FILL_CAP` 0.88**, core keep **`FOG_IN_SCATTER_CORE_KEEP` 0.22**. Reduced motion: freeze `uTime` / noise movement. Haze + ring **hidden** (paths kept). **Height falloff is exponential** (`heightFogExpK` **0.18**): `amp * exp(-(y − start) * k)` — no binary top lid. **Soft floor** (`fogFloorFadeRangeY` **1.2**): `density *= smoothstep(fogMinY, fogMinY+range, y)` — no binary bottom edge where the march hits the floor. **`heightFogEndY` 8** (legacy only; unused while exp is on). **`fogMaxY` 16** / **`fogMinY` −0.2** (legacy hard slab only — exp path skips **all** `clipYSlab` Y clamps). **`falloffCeilingJitter` 0**, **`noiseSpeed` 1**. Fog-lab opens **`noiseSpeed` 3** and labels **travel speed** / wind X / wind Z at the top of the slider list so roil is obvious. Fill-side knobs stay **0**: **`outputDither`**, **`falloffNoiseWarp`**, **`noiseYSlice`**, **`noiseYScroll`**. Grazing bands: top = hard height gate (fixed); bottom = floor-depth hard stop (fixed). Metric = all-rows max contrast (not row 315 alone). Note: quarter-density “studio horizon” (shell/floor seam) is separate — do not chase with fog knobs. Diagnose: `vol-fog-lidfix-verify.mjs`, `vol-fog-edge-probes.mjs`.

**Atmosphere toggle:** default volumetric. `?fog=haze` or `__stage.debugFog('haze')` restores sheet+haze for compare. Hardware TODOs in `fogConfig.js` for steps **16 vs 12** and coarse fog reduced-vs-OFF remain open.

**Tubes:** all four are length **4 m**, radius **0.06 m**, local XZ `(2.2, 0.85)`. Local Y is `length/2 − group.position.y` so the **world-space bottom sits on Y = 0** even after vignette floor snap (Desktop may shift `group.y`; Travel/Sidekick keep group Y at **0**). `NeonSystem.seatTubesOnFloor()` re-runs after every floor snap and refreshes PointLight XZ. Uneven “stub vs full bar” was that floor-snap offset (plus proximity dimming on neighbours) — not different authored lengths.

World-XZ sampling (`vWorld.xz + uWorldDrift`, mapped through a **44 m** footprint, **no `fract`**) closes the ring with no UV seam. Radial band: outer feather **2.5 m** (`uFeather`); inner feather **6.0 m** (`uFeatherInner`) so the hole edge is a gradient, not a hard strip — **do not** lower `rInner` / fill the disc. `uWorldDrift` is a looping sway (`sin(t·0.15)·4`, `cos(t·0.11)·4`); freeze it when `prefers-reduced-motion`.

**Camera-XZ distance fade:** `uDistFadeStart` **20** / `uDistFadeEnd` **36** (meters, world-XZ to camera). At rest the near arc is ~**6–14 m** and the far arc ~**42–50 m**; the fade sits in that dead gap so the far/horizon band dies while the near pool stays full. Multiplies `csm_DiffuseColor` alpha — never `csm_FragColor`. Do **not** raise `uSoftFade` for banding.

**Scene-depth soft fade (legacy ring):** the ring also multiplies alpha by a soft-particle term from opaque depth (`uSceneDepth`, `uResolution`, `uCameraNear` / `uCameraFar` copied from the **live** camera **0.1 / 120**, `uSoftFade` **2.0**). Fog uses `depthTest: false` so fragments behind props still run. Keep writing `csm_DiffuseColor`. Volumetric soft-contact is depth-clamped ray end (GATE 4 step 3) — see [§20](#20-landmines).

**“Second layer”** is not a reflection pass. `stage-floor` is `MeshStandard` (`STAGE_BG`, roughness **0.94**) and takes neon PointLights. Hiding it (`debugFogIsolate({ floor: false })`) removes the lower glow; zeroing feather only tightens the radial band.

**Haze:** `hazeCount` **20** / `hazeCountCoarse` **12**, `hazeOpacity` **0.2**, size **5×6 m**, radius **18 m**. Additive `ShaderMaterial`, layer **2**, `raycast` no-op (no CRT/phone click theft). Studio shell (`stage-studio-room`) is MeshBasic and never takes neon — do not confuse haze cards with lit walls.

| Knob | Value | Tune order |
| --- | --- | --- |
| Light height | **1.0 m** | 1 — spread vs grey hotspot / CRT spec bloom |
| `NEON_FOG.uLoopRadius` | **1.5** | 2 — churn (too high orbits, too low freezes) |
| Atlas `N` | **64** | 3 — raise before `TILE` if the loop pulses |
| Bake `uScale` | **0.7** | 4 — feature size over the 44 m footprint (old 3.0 × 10/44) |
| Drift amplitude | **4.0** | 5 — too high and the field orbits; too low and it boils in place |
| `uSoftFade` | **2.0 m** | View-Z fade width. Do not raise to hide grazing cuts or bands |
| `distFadeStart` / `distFadeEnd` | **20** / **36 m** | Kill far arc; leave near pool |
| `feather` / `featherInner` | **2.5** / **6.0 m** | Outer edge vs softened hole |
| `NEON_MAX_EMISSIVE` | **3.0** | Must stay above bloom threshold |
| `NEON_MAX_LIGHT` | **10.0** | If CRT glass spec blooms: lower this before the bloom threshold |
| Light distance / decay | **8** / **2** | Does not reach the next stop (~25 m); does not light MeshBasic walls |
| Fog albedo | **0.75** grey | Never a hue — hue = the four lights |
| Fog opacity | **0.32** | Ground-glow; haze carries atmosphere |
| Haze count | **20** / **12** coarse | Atmosphere cards |

Fog + haze are **layer 2** (`NEON_FOG_LAYER`); POV spot stays layer 0 only. Neon lights occupy **{0, 2}** so they stain props and fog (not the MeshBasic studio shell). Camera enables layer 2. Fog/haze `raycast` is a no-op so they do not steal CRT/phone clicks. Spot and fog share **no** layer bit — grey hotspot stays solved.

Atlas bake (load gate only): 8×8 tiles (`FOG_ATLAS`), **256²** each, **2048²** RGBA (~16 MB). After `readRenderTargetPixels`, the bake render target, quad geometry, and bake material are **disposed**; only the returned `DataTexture` is kept. Seamless time via circular offset `uTheta ∈ [0, 2π)` is unchanged. Spatial scale is **0.7**. Runtime mixes two cells; no `snoise` at runtime. If the 44 m field looks soft (~5.8 px/m), raise `TILE` to **512** before anything else.

`renderer.antialias` does nothing on the HalfFloat composer path. If the ring’s inner/outer edge looks crunchy, add `SMAAEffect` **before grain** — do not trust the renderer flag.

Per-stop colors (dominant = `neonColors[0]` → that stop’s PointLight; secondaries = tube gradient only, never mixed across stops):

| Stop | Hue (dom) | Colors |
| --- | --- | --- |
| Monolith | ~92° | `#9dff1a`, `#00e5ff` |
| Desktop | ~187° | `#00e5ff`, `#9dff1a` |
| Sidekick | ~266° | `#8c2dff`, `#ff2d95`, `#00e5ff` |
| Travel | ~7° | `#ff3d1a`, `#ffc14a` |

Dominants must stay evenly spaced on the wheel **in ring order**. Lime (`#9dff1a`) is brighter than violet (`#8c2dff`); if the band pulses light/dark, darken lime or lift violet — do not rotate hues.

`prefers-reduced-motion`: freeze `uWorldDrift` and `uTime`; haze alpha is static (bloom is already 0).

---

## 13. Vignettes

### Desktop (`DesktopVignette.js`)

- Runtime: `/assets/models/pc-source/pc-from-source.glb` + PBR maps in the same folder.
- Fallback: blockout desk if the GLB fails.
- CRT: live `CanvasTexture` is the `emissiveMap` on a flat **bezel content plane** (`crt-content-quad`) — Blender-measured from `pc-from-source.glb` (`scripts/crt-bezel-blender-measure2.py`). Opening ≈ phosphor AABB + **1.5 cm**; content is that opening inset **1 cm** with corner radius **1.2 cm** (`CRT_CONTENT_PLANE` in `crtBezelOpening.js`, aspect ~**1.28**, canvas **1024×799**). Spec also exports `public/assets/models/pc-source/crt-content-plane.glb` + `tmp/crt-bezel/crt-bezel-content.blend` (working copies — not masters). `pc-Mesh_2` stays a dark cavity + glass host; phosphor still flattens before the plane mounts. Glow ≤ **0.72**. Map: `SCREEN_MAP_CRT_QUAD` (`flipY: true`).
- Glass: cloned shell from the **authored bulge** before flatten, **normal offset 0.006**, **scale 1**. Additive fresnel + **PMREM CubeUV** env, gated by a **soft** POV-spot mask (`spotEdgeWidth` **0.06**, `spotSharpness` **1.05**, `spotPenumbraScale` **0.9**, roughness **0.22**) so the pool does not read as a hard circle on the CRT. Direct glare **0.14**. Glass does not occlude the image.
- Click zoom starts XP → MySpace.
- Materials are upgraded while the PC root is on `GPU_HOLD_LAYER` (`INTRO_MATERIAL_BATCH_SIZE` **1**, yield **2** frames), then compiled once before show, including an offscreen shadow pass. Gate `renderer.compile` still warms blockout/uncommitted programs. Do not put the PBR swap back on a live 1-mesh present cadence.

### Sidekick (`SidekickVignette.js`)

- Runtime: `/assets/models/sidekick/Sidekick3.glb`.
- Prop scale matches a real **Sidekick II** (**130 mm** closed height) against the Desktop CRT (blockout monitor vs typical **17″** chassis **416 mm**): `targetH = 0.130 × (sceneMonitorHeightM() / 0.416)`. Rest and zoom share that scale — close-up is camera dolly only. Zoom and lid swivel are one toggle. Open LCD: live SMS (`SidekickSmsScreen`). Send: scrollball red blink, then close.
- Open SFX leads motion by **0.2 s** (`OPEN_SFX_LEAD`).
- **Keypad:** GLB authors `Buttons` + cover on shared `phong3` (MASK, alpha 0). Initial repair on GLB load / `integrateAfterIntro`; re-ensure every `update()` after intro + align. Repair clones opaque DoubleSide plastic onto the **QWERTY key plastic only** (`Buttons`). `KeyboardText` (`TmobileKeyboard`) is a separate glyph cutout and stays denylisted. `sideButtons` (`TmobileButtons`) is **one fused atlas** — CALL/END/D-pad body and print on the same mesh. It stays denylisted (identity by mesh name) and is forced **opaque DoubleSide** with the atlas kept; a luminance cutout punched the plastic out and left only the glyphs. Cover detection is identity-only (`phong3` / `sidekick_cover_mask` / shared cover instance), never opacity+alphaTest. See [§20](#20-landmines).

### Travel (`TravelVignette.js`)

- `/assets/models/travel-pack/runtime/travel-pack.glb`, `/assets/models/t-rex/runtime/t-rex.glb` — both require `EXT_meshopt_compression` (loaded via `createGltfLoader`).
- Pack morph open; rex bone twitch. Derived GLBs only — do not edit OBJ/PNG extras in `public/` as if they were masters.
- Floor: `skipFloorSnap` + local `fitMorphedHeightOnFloor` / `fitHeightOnFloor` (group Y stays **0**). Do **not** `snapGroupToFloor` after those fits — rest-pose `Box3.setFromObject` ignores lid morphs and was lifting the group ~2.7 m so the rex floated.
- Lit by scene IBL (`STAGE_ENV_INTENSITY` **0.22**) plus the POV spot. Meshes stay **DoubleSide** (GLB `doubleSided`). Rex **does not receive shadows** (thin bones self-shadow to black). `polishMesh` caps metalness at **0.22** and **strips normal maps** (runtime GLBs bind bump/height atlases without usable tangents — they black out MeshStandard lighting). Fit the pack using morphed bounds; `Box3.setFromObject` ignores morph targets and leaves the closed bag ankle-high.

### Monolith

`placeholderVignettes.js` PC blockout. Blockout meshes named `blockout-*` hide unless that stop is active.

---

## 14. Screen pipelines

| Surface | Method | Rule |
| --- | --- | --- |
| CRT canvas | Authored at **content-plane aspect** (~**1.28**, 1024×799) | Rounded-rect UVs are 0–1. Do not window the canvas to a UV AABB. Never non-uniform-scale the plane — resize the canvas instead |
| XP boot / login | Canvas 2D blit onto `CanvasTexture` | CSS overflow does not clip the CRT — use `clip()` for the meter |
| MySpace hover | Cached bitmap + overlay | Never `html-to-image` on pointermove (hitch + WebGL taint) |
| MySpace login still | `html-to-image` **once**, then cache | Superseded capture canvases are zeroed (`releaseCaptureCanvas`) |
| SMS LCD compose | `html-to-image` for form frames | Splash is a locked UV atlas; flip is a texture swap. Prior capture canvases released on replace |
| CRT power-on | Canvas 2D (`renderCrtPowerOnFrame`) | Not html-to-image — that would taint the WebGL canvas |
| CRT phosphor / content | `emissiveMap` on `crt-content-quad`, intensity ≤ 0.72 | `SCREEN_MAP_CRT_QUAD`: `flipY: true`, `SRGBColorSpace`, `ClampToEdgeWrapping`. Rounded `pc-Mesh_2` is dark only |

---

## 15. Cursor, audio, HUD

**Water cursor** (`src/cursor/`): same `WebGLRenderer` as the stage (not a second WebGL context). Extra ortho scene drawn after the beauty pass with `autoClear = false`. Default diameter **22.4 px**, follow rate **10 /s**, color `#e8f4ff` (`waterCursorConfig.js`). Init **after** intro land, load gate unlock, and the post-land cursor delay (**720 ms**). Not created for `prefers-reduced-motion` or coarse pointer (`pointer: coarse`).

**Audio** (`siteAudio.js`): mute FAB, XP startup/login, Sidekick open/close. SFX leads Sidekick motion (`OPEN_SFX_LEAD` **0.2 s**).

**HUD:** caption, dots, readout, optional MySpace overlay panel on narrow viewports (`max-width: 900px`).

---

## 16. Assets and scripts

### Runtime vs masters

| Path | Role |
| --- | --- |
| `public/assets/models/` | What the stage loads (Git LFS for glb/png) |
| `masters/` | Canonical originals — **never** overwrite, delete, or optimize in place |
| `scripts/setup-assets.sh` | Legacy helper: copy/sparse-clone PC assets from `daneoleary-webflow`. Live models are already vendored; do not re-symlink to Webflow |

Runtime folders (from `public/assets/models/README.md`): `sidekick/`, `pc-source/`, `travel-pack/runtime/`, `t-rex/runtime/`.

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
| `node scripts/vol-fog-soft-contact.mjs` | Playwright, Vite **5177**. Isolates volumetric (ring/haze off); soft-contact captures + near/far check |
| `node scripts/vol-fog-band-diagnose.mjs` | Banding a/b/c (HalfFloat / Bayer / height falloff) → `public/debug/vol-fog-band-*.png` |
| `node scripts/vol-fog-mach-band.mjs` | Mach-band step0 + lever1/2 A/B → `public/debug/vol-fog-mach-*.png` |
| `node scripts/vol-fog-trigger-a.mjs` | Fade-in vs deferred-GLB trigger captures |
| `node scripts/vol-fog-lever3.mjs` | Lever-3 Y-slice A/B + cost → `public/debug/vol-fog-lever3*.png` |
| `node scripts/vol-fog-exp-falloff.mjs` | Option-1 exp height falloff A/B (rest + pitch) → `public/debug/vol-fog-exp-*.png` |
| `node scripts/vol-fog-ceiling-jitter.mjs` | Option-3 ceiling jitter A/B → `public/debug/vol-fog-ceiling-*.png` |

CRT diagnostics (manual): `node scripts/crt-bezel-opening-offline.mjs`, `node scripts/crt-screen-diagnose.mjs`. Bezel content plane (Blender): `scripts/crt-bezel-blender-measure2.py` → `crtBezelOpening.js` + `public/assets/models/pc-source/crt-content-plane.glb` + `tmp/crt-bezel/crt-bezel-content.blend`. Neon spill tune (TEMP): `node scripts/neon-spill-tune-sweep.mjs` → `public/debug/neon-spill-*.png` + live `__stage.setNeon({ height, maxLight })`. Fog soft fade: `node scripts/fog-soft-diagnose.mjs`. Fog horizontal bands (flat-sheet collapse): `node scripts/fog-band-diagnose.mjs` → `public/debug/fog-band-*.png` + `fog-band-diagnose.json`. Sidekick materials: `node scripts/sidekick-material-diagnose.mjs` / `sidekick-material-diagnose2.mjs` (Playwright, Vite on **5176**).

### Python / Blender (travel)

| Script | Role |
| --- | --- |
| `scripts/export-travel-runtime.py` | Blender: read masters OBJ/PNG → `public/assets/models/**/runtime/*.glb`. Pack tex **2048**, rex **1024**, cm→m (`CM_TO_M = 0.01`). Then resize → webp → **meshopt** via gltf-transform — **never** `optimize` (it `simplify`s meshes away). Runtime `GLTFLoader` registers `MeshoptDecoder` (`src/scene/loaders/createGltfLoader.js`) |
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

`npm run test:smoke` (`scripts/stage-canvas-smoke.mjs`) boots the real Vite stage in Playwright Chromium: no thrown/console errors through load, **fails on `GL_INVALID_FRAMEBUFFER` / “Framebuffer is incomplete”** (hooked `getError` + console), canvas non-blank after the gate, Desktop CRT / Sidekick `Buttons` / Travel pack present after a full hop cycle (Monolith → Desktop → Sidekick → Travel → Monolith). It is the only suite that can catch shared-GLTF-material / alpha-0-snapshot / WebGL-taint / CubeUV-shader / zero-size RT classes. Requires `npx playwright install chromium` once.

---

## 19. Dev probes

Probes exist only in dev builds (`import.meta.env.DEV`).

```js
window.__stage.debugFloorHeights()
window.__stage.debugResnapAll()
window.__stage.debugSidekick()       // keypad health + hardware graph (body vs label)
window.__stage.debugNeon()            // lights + TEMP live knobs (height, maxLight)
window.__stage.debugFogCapture()      // depth RT size, nearest, live near/far, packed samples
window.__stage.debugFogVis("both")    // camera quad: packed depth + soft ramp (off | depth | soft | both)
window.__stage.debugFogIsolate({ floor, feather, fog, haze })  // floor / ring / haze isolate
window.__stage.debugFog("volumetric") // default: live raymarch on, haze+ring off
window.__stage.debugFog("haze")       // legacy sheet+haze compare (or ?fog=haze)
window.__stage.setVolumetricEnabled(true|false) // alias → debugFog
window.__stage.setVolumetricParams({ /* fogConfig keys */ })
window.__stage.debugVolumetricFog()
window.__stage.setNeon({ height, maxLight })  // TEMP hot-tune; remove after bake
window.__stage.setWorkQuality(0.6)   // object raster only; screens stay; fog step-scale later
window.__stage.setWorkQuality(1)      // restore full DPR cap
window.__stage.debugWorkQuality()
window.__stage.debugScrollCapture()   // capture blend, parallax damp, focus phase, camera settled
window.__stage.debugCrtAlign()        // square + crosshair on CRT bezel content quad
window.__stage.debugFrameBudget()     // post-land slow frames: fog-depth / beauty / html-to-image / compile
```

---

## 20. Landmines

These are why the repo has “weird” helpers. Full narrative history lived in an older `docs/PROJECT.md`; the rules below are what still matter.

1. **Shared GLTF materials (Sidekick keys / labels).** `Buttons` and the transparent cover share `phong3` (MASK, alpha 0). Clone-then-mutate the cover is not enough. Repair keys onto pinned opaque DoubleSide plastic; re-ensure every update; never `dispose()` a GLTF material another mesh still holds; intro fade must not snapshot alpha 0 as authored keypad state. **Cover heuristic must be identity-only** (`phong3` / `sidekick_cover_mask` / shared cover instance) — never `opacity < 0.05 && alphaTest > 0`. `KeyboardText` is a separate glyph cutout (`alphaTest` 0.08). `sideButtons` is a **fused** CALL/END/D-pad atlas (`phong4` + `TmobileButtons`) — denylist it by mesh name and force the atlas opaque; a cutout leaves the print and deletes the plastic. Do not pave it with untextured keypad plastic.
2. **`notifySettled` every settled frame** disarms scroll forever after hop 1.
3. **Queued hop on land** skips a stop. Mid-travel wheel re-arms after land but does not auto-fire.
4. **Heavy GPU work on the land frame** hitch the height ease-out — stagger it. After land, do not warm deferred meshes 1-per-present: each new program compiled inside `captureFogDepth` + beauty and frames sat over 1 s for the mesh count. Hold on layer **3**, compile once, then show. Fog atlas `readRenderTargetPixels` stays a one-shot at the gate.
5. **html-to-image on a canvas used by WebGL taints** the context.
6. **Look-at aimed at the destination during a hop** cuts a chord through the arena. Rest look-at stays on the ring at **current** theta.
7. **Do not rotate `world` to change stops.**
8. **Fog + POV spot on the same layer** → grey fog with a white hotspot. Fog and haze stay layer 2; spot stays layer 0 only. Neon lights are {0, 2}.
9. **Fog ring vs soft-contact (two issues).** (a) **Banding / flat annulus:** at rest grazing the sheet at **Y = 0.05** (`rInner` **14** / `rOuter` **22**) projected near arc, hole, and far arc as stacked horizontal strips — confirmed by `scripts/fog-band-diagnose.mjs`. Mitigated by camera-XZ distance fade (**20 → 36 m**), wider inner feather (**6.0 m**), ring opacity **0.32** (ground-glow), and haze (**20** / **12**, opacity **0.2**). Do **not** fill `rInner→0`. Ring retention after volumetric lands is a **bright-line** decision at grazing (GATE 4 step 6) — keep only if volumetric cannot produce crisp near-tube stain. (b) **Soft-contact:** flat sheet had near-zero view-Z gradient at grazing; volumetric ends the march at FogDepthCapture depth (`packed` undo + live near/far). Verify with `scripts/vol-fog-soft-contact.mjs` / `public/debug/vol-fog-soft-contact-*.png`. Always write `csm_DiffuseColor`, never `csm_FragColor`. No floor reflection pass; lower glow is neon on `stage-floor`.
9b. **~~Volumetric grazing horizon bands (hard slab top + bottom)~~ — FIXED.** Top lid = density-independent hard ceiling (`heightFogEndY` + `fogMaxY` / `clipYSlab` upper) — probe 1 vs 2/3. Bottom edge = floor-depth hard stop (not `heightFogStartY`; startY/−20 and fogMinY/−20 did not move it) — soften with `fogFloorFadeRangeY` smoothstep into the floor; exp path skips **all** `clipYSlab` Y clamps. Metric must scan **all rows** (row 315 only saw the top). Live: `heightFogExpK` **0.18**, `fogFloorFadeRangeY` **1.2**. Quarter-density studio horizon (shell/floor seam) is a separate non-fog issue — do not chase. Verify: `scripts/vol-fog-lidfix-verify.mjs`.
10. **ANGLE Playwright ≠ mid-GPU absolute.** `post-land-frame-budget.mjs` uses `--use-gl=angle --ignore-gpu-blocklist` as a **relative** fog-on vs fog-off regression gate only. Absolute “runs on mid hardware” is a separate manual check on real integrated GPU / low-power emulation — do not let the ANGLE number stand in for that.
11. **Zero-size framebuffer / incomplete attachment.** `EffectComposer.addPass` / early `setSize` can see a **0×0** drawing buffer before the canvas is ready; if `PostPass.setSize` early-outs on CSS size alone after a DPR/`?work` change, composer or `VolumetricFogPass.fogTarget` can stick at 0×0 and flood `GL_INVALID_FRAMEBUFFER_OPERATION: Attachment has zero size` every frame (looks like free fog + banding garbage). Fix: refuse `setSize(0,0)`, sync from drawing buffer (not CSS-only early-out), `ensureSizeFromRenderer` each volumetric render, skip march until `_hasValidSize`. `test:smoke` fails on incomplete-FB. Do not tune fog look while this fires.
12. **Neon dominants (`[0]`) must stay evenly spaced around the color wheel in ring order.** Do not set two adjacent stops to complementary hues or the overlap arc greys out. Mixing still happens in the band’s overlap — it stays clean only because the inputs are not complementary. The old cyan-vs-orange mud is retired, not relocated.
13. **Travel pack / T-rex read as a black void without IBL, or with their runtime normal maps.** MeshStandard + no IBL + ambient **0.06** against `STAGE_BG` `#141414` is a silhouette, not a missing mesh. Assign the static RoomEnvironment PMREM (`getStudioEnvironment()`); never the CRT cube capture (`update(..., { applyToScene: false })`). Runtime pack/rex GLBs bind bump/height atlases as `normalMap` and ship no usable TANGENT — **strip the normal map** at polish (computed tangents are not enough). Do not force `FrontSide` on the rex (GLB is doubleSided). Stamp reveal opacity on deferred roots that mount after the fade already hit 1. Fit the pack using morphed bounds; `Box3.setFromObject` ignores morph targets and leaves the closed bag ankle-high. Travel uses `skipFloorSnap` — after local floor fits, do **not** `snapGroupToFloor` the vignette (rest-pose AABB under the closed morph lifts the group and floats the rex).
14. **CRT glass ShaderMaterial + CubeUV.** `textureCubeUV` needs `CUBEUV_MAX_MIP` / texel defines. Bind a **PMREM** (`CubeUVReflectionMapping`) as `material.envMap` so `WebGLProgram` injects them once (`applyCrtGlassEnvMap`). Do **not** also stamp those defines on `material.defines` (redefinition fails the fragment compile). Never bind the raw cubemap (`getTexture()` must not fall back to `WebGLCubeRenderTarget.texture`).
15. **CRT content is a Blender-measured bezel plane, not `pc-Mesh_2` UVs.** The authored phosphor is a rounded radial island — it cannot fill the square bezel hole. Re-measure with `scripts/crt-bezel-blender-measure2.py` (writes `crtBezelOpening.js` + `crt-content-plane.glb`); content = opening inset **1 cm**, corner radius **1.2 cm**. Do not “fix” corner gaps by remapping phosphor UVs. Clone glass from the **bulge before** flatten; keep the content plane behind `shellOffset` **0.006**. Working blend: `tmp/crt-bezel/crt-bezel-content.blend` — never edit masters.
16. **Floor snap must ignore neon tubes (and cables / glow).** Each vignette group owns a `neon-tube` planted on `STAGE_FLOOR_Y`. If that mesh anchors `snapGroupToFloor`, the Desktop PC (and anything else aligned above the tube) floats ~0.5 m. `isFloorExcludedMesh` skips `neon` / `glow` names and `cable*` materials — keep it that way.
17. **`glitch-gl` is parked, not stage post.** It owns a separate WebGL renderer + rAF and nests `three@^0.178`. Do not `import` it into `StageExperience` / `PostPass`. Keep it on a DOM surface or port shaders into the existing composer later.

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

---

## 22. Keeping this document current

- **Canonical file:** this README. `docs/PROJECT.md` only points here.
- **Agent rule:** `.cursor/rules/keep-readme-current.mdc` (`alwaysApply`).
- When you change a tunable, copy the number from code, do not round from memory.
- When you add a vignette, update the stop table, `n` in hop math (`2π/n`), neon colors, and asset paths.
- When you add an npm script, add it to [§16](#16-assets-and-scripts) and [§18](#18-tests) if it is a test.
- If you rename a file or constant, grep this README and fix every mention.
- Bump **Last verified** at the top on every README edit.
