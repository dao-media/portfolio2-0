# Portfolio 2.0

Cinematic, scroll-driven Three.js stage. One WebGL canvas, four vignettes on a **fixed** ring, orbital camera on critically damped springs, live UI painted onto model screens, neon tubes + screen-space volumetric fog (four static lights), Windows-XP-styled load gate.

**Last verified:** 15 September 2026 (cursor basic rim squeeze/elongation).

Proof of concept — not production-hosted yet. Dev entry: `src/main.js` → `StageExperience`. In development the instance is `window.__stage`.

### Latest changes

Newest first. Prepend here whenever you change the stage or this README (see [§22](#22-keeping-this-document-current)).

| Date | Change |
| --- | --- |
| 15 Sep 2026 | **Cursor rim: basic squeeze/elongation** — dropped gate/soft-union. Axis elong + lateral squeeze only; rim curves/tuner/recoil kept. |
| 15 Sep 2026 | **Cursor compact fight:** axis = against glitch outward push (not oval/bulbs). Area-preserving elong ≤**1.12** (~10–15% flex); localized throat; no soft-union bulbs. Recoil default **10** px. |
| 15 Sep 2026 | **Cursor gate = soft-union bulbs:** replaced oval stretch with outside pile-up + through-gate tip soft-unioned across the alpha plane (localized throat). Round until couple builds (surface tension); one connected mass, not an ellipse / not two drops. |
| 15 Sep 2026 | **Cursor gate squeeze:** rim deform = one mass through an imaginary gate (anisotropic stretch/compress). Removed peanut/waist→0 (two-drop look). Tip axis rejects 180° flips. `neckPinch` **0.72** = lateral squeeze with connected floor. |
| 15 Sep 2026 | **Cursor rim flow (not spin):** removed heading→SDF-tip lock + froze motion heading during rim couple; tip angle only updates when gradient is trustworthy. Teardrop axis stays on the cross; blob flows through the alpha instead of rotating. |
| 15 Sep 2026 | **Cursor surface tension:** back-loaded blow (`blowExponent` **2.8**), waist **neck/pinch** at threshold (`neckPinch` **0.92**), positional **recoil** along SDF gradient (`recoilPushPx` **16**), snap-through (`snapThreshold` **0.01**). Glitch pass / `ARM_OUTER` **unchanged**. Live panel **Shift+C** → `__stage.setWaterCursorRimParams()`; **FINALIZE** → `waterCursorRimConfig.js`. |
| 15 Sep 2026 | **Cursor blow thin:** teardrop elongates / thins with rim proximity (closer to glitch = longer); handoff to slurp at the threshold. |
| 15 Sep 2026 | **Cursor blow teardrop:** tip anchored at pointer toward the glitch; heavy bulb furthest away (no mesh push). Shader offset + teardrop; refraction not yet. Ref: CodePen water-droplet mass. |
| 15 Sep 2026 | **Cursor rim motion:** blown back outside the alpha; on cross — round tip into the silhouette + body slurped behind (`uBlow` / `uSlurp`). Signed SDF couple; `rimPushPx` **22**, `rimSlurp` **0.62**. |
| 15 Sep 2026 | **Edge glitch arm:** `ARM_OUTER` **0.06** (2× prior **0.03**) — wider trigger / cursor-rim couple zone. |
| 15 Sep 2026 | **Cursor × rim (Phase A):** liquid cursor squeezes / polarity-pushes near bust alpha — `sampleRimField` (3× CPU SDF) → `WaterCursor.setRimField` (stretch + rimPress + push + follow damp + tangent blend). Same `ARM_OUTER` gate as glitch; stop **0** only. Knobs in `waterCursorConfig` (`rimSqueeze` **0.28**, `rimPushPx` **12**, …). |
| 15 Sep 2026 | **Edge glitch occlusion:** strength fades → **0** where bust rim meets an occluder (FogDepthCapture scene depth vs bust-only packed depth). Soft **`OCC_SOFT` 0.004** / **`OCC_BIAS` 0.0015**. Layer-2 leaves still absent from fog depth. |
| 15 Sep 2026 | **Ambient/hemi probe:** `SPOT_INTENSITY` **0** again. `AMBIENT_INTENSITY` **0.06**, `HEMI_INTENSITY` **0.04**. `STAGE_ENV` / `FILL` still **0**. Spot contact pad **0**. |
| 15 Sep 2026 | **POV spot back:** `SPOT_INTENSITY` **118** (was **0**). Ambient / hemi / `STAGE_ENV` / `FILL` stay **0**. Spot contact pad opacity **0.16**. Leaf canopy still spot×0. |
| 15 Sep 2026 | **Edge glitch arm gate:** `ARM_OUTER` is a hard cut — outside it, mix/width/split = **0** (removed far-cursor floor of ~35% that leaked subtle tears from screen corners). |
| 15 Sep 2026 | **Edge glitch scale:** `LOCAL_BASE` **0.032** (was **0.052**), `LOCAL_GROWTH` **0.042** (was **0.022**) — tighter idle strip, more growth when close. |
| 15 Sep 2026 | **Edge glitch tuner:** live panel **Shift+G** (`EdgeGlitchTuner`) — `ARM_OUTER`, `ARM_RAMP`, `LOCAL_BASE`, `LOCAL_GROWTH`, `INTENSITY`. Sliders → `__stage.setEdgeGlitchParams()`. **FINALIZE** → `POST /__edge_glitch_finalize` patches `constants.js`. Default `ARM_OUTER` **0.03** (was **0.06**). |
| 14 Sep 2026 | **Edge glitch arm:** `ARM_OUTER` **0.06** (was **0.12**) — trigger distance halved. |
| 14 Sep 2026 | **Edge glitch local:** fades from **edge-origin** (SDF-projected). Proximity boosts **width + intensity** more than scale (`LOCAL_BASE` **0.052**, `LOCAL_GROWTH` **0.022**). Beauty tears + RGB split. Intensity **0.16**, split **0.042**. |
| 14 Sep 2026 | **Edge glitch LOOK:** beauty-buffer resample + DigitalGlitch RGB split (no synthetic color). **WHERE** = full bilateral SDF silhouette rim; **HOW MUCH** = cursor→edge amp only (no blob spat). Irregular tear bands. Intensity **0.14**, split **0.038**, bands **88**. Stack: fog → **EdgeGlitchPass** → bloom → grain. |
| 14 Sep 2026 | **Edge glitch CMY:** spat on **SDF-projected alpha edge** (not cursor). No Manhattan/oval diamond — rough diamond from band taper only. Pipeline: stagger CMY plates → displace (`moveAmt` ∝ cursor→edge × \|y−edgeY\|). Split **0.055**, intensity **0.24**. |
| 14 Sep 2026 | **Edge glitch spat:** tighter **diamond** (`CURSOR_OUTER` **0.036**, rx **0.55×**); tear amp scales with diamond falloff so tips taper; intensity **0.12**. |
| 14 Sep 2026 | **Edge glitch bite:** bilateral rim + vertical spat; **hard gate** (no soft amt→glow); DigitalGlitch scanline shifts snap the alpha contour. After bloom. Intensity **0.28**, bands **140**. |
| 14 Sep 2026 | **Edge glitch localize:** fixed spat blob (`CURSOR_OUTER` **0.055**) — does not elongate along alpha. Closer to edge raises prominence only (`ARM_OUTER` **0.09** × tear/RGB amp). Camera/post transmute feel. |
| 14 Sep 2026 | **Edge glitch FIX:** deleted CSM material path (bust stays plain `MeshStandard`). Renamed `EdgeTubeGlitchPass` → **`EdgeGlitchPass`**; full-frame (no `uLocalRadius` / `uCenterRadius`). Mask = one-sided outside SDF band × cursor UV proximity (`EDGE_GLITCH_CURSOR_OUTER` **0.16**); hard cut inside alpha. Envato amp: intensity **0.22**, RGB split **0.055**, tear bands **64**, scanline dropout + data-mosh. Stack: fog → **EdgeGlitchPass** → bloom → grain. No `glitch-gl`. |
| 14 Sep 2026 | **Edge glitch:** horizontal tear amp peaks at cursor (`EDGE_GLITCH_CENTER_RADIUS` **0.055**, squared falloff); still follows bilateral alpha band; trigger ramp unchanged. |
| 14 Sep 2026 | **Edge glitch mask fix:** trigger ramp = cursor approach (hard cut inside); **tear straddles alpha line evenly** (`smoothstep(band,0,abs(d))` both sides). Envato visuals: `floor(y*bands)` stepped tear + RGB split in `EdgeTubeGlitchPass`. |
| 14 Sep 2026 | **Edge glitch Stage 3b:** real tube look — randomized rectangular scanline tears + chromatic RGB split (GlitchPass / CRT still). **Gate:** ramp outside→edge max, **hard cut when cursor goes inside** (`dCursor≤0`). Only outside alpha-edge band glitches. `EDGE_GLITCH_TEAR_BANDS` **56**, local radius **0.09**. |
| 14 Sep 2026 | **Edge glitch Stage 3:** local tube DigitalGlitch (three.js GlitchPass look) via `EdgeTubeGlitchPass` in the live composer — `band × edgeProx(|d|) × localRadius`; band/cursor falloff **½** (`0.0225` / `0.055`); `EDGE_GLITCH_LOCAL_RADIUS` **0.07**. Stack: bloom → edge tube → grain. No `glitch-gl`. Verify: `scripts/verify-edge-glitch-stage3.mjs`. |
| 14 Sep 2026 | **Edge glitch Stage 2:** outside band × `cursorGate` from SDF@pointer (`EDGE_GLITCH_CURSOR_OUTER` **0.11**) — far/inside = 0, near outside edge = on. Still debug ramp only. Verify: `scripts/verify-edge-glitch-stage2.mjs`. |
| 14 Sep 2026 | **Edge glitch Stage 1 (bust only):** screen-space silhouette JFA SDF + CSM on bust MeshStandard + outside-band debug overlay (cyan→yellow ramp). No chromatic look yet. No `glitch-gl` import. Probe: `__stage.debugEdgeGlitch()`. Capture: `scripts/verify-edge-glitch-stage1.mjs`. |
| 13 Sep 2026 | **Desktop floor glow:** pool re-centered on tube foot (offset **0**); clear tower by scale **0.34** only — sideways offset orphaned a floating green dot. Cone still off. Bust pool unchanged (already under tube). |
| 13 Sep 2026 | **CRT glass:** neon specular = rim pin glint (`neonSpecPower` **180**, fresnel², RGB cap **0.28**; `envMapIntensity` untouched). **Desktop floor glow:** group-local tower→tube AABB clip (ring-rotation broke world AABB) + opacity **0.22**. **Bust cast light:** live tube mid-UV sample (Δ≈0); Desktop keeps rate-cap. |
| 13 Sep 2026 | **Edge vignette strobe:** animated Bayer `outputDither` in fog composite was the crawl (`uTime` offset). Fix = **spatial-only** `bayer4(gl_FragCoord.xy)`; keep amp **0.02** (do not zero — Mach banding). Proof: `scripts/edge-strobe-dither-bisect.mjs` (stripMae, not smoke). |
| 13 Sep 2026 | **CRT clip (b):** confirmed curved UV mask (corner/mid **13×**); widened plane inset **1 mm** / corner **1 mm** (was 1 cm / 1.2 cm) — not more DOM pad. **Glass:** neon PointLight specular (unmasked). **Power-on:** emissive peaks **1.35** → **≤0.72**. **Floor glow:** opacity **0.48**; Desktop pool ×**0.52** + offset **+0.42** + tower UV kill; Desktop cone off. Bust grass tufts to tube foot. |
| 13 Sep 2026 | **Bloom-gated fog land:** hold bloom at 0 while `uCompositeOpacity` fades at `introComplete` (not heavy-effects 2000 ms); soft-return ~180 ms. **Cast light:** PointLight slow-lerps tube gradient (`NEON_LIGHT_COLOR_SCROLL` 0.028, rate-cap 0.12/s). **`STAGE_BG` `#070709`** on shell / floor / clear / CSS. |
| 13 Sep 2026 | **Single-source neon:** ambient/hemi/IBL **0**, spot **0**, neon **28** / dist **6.5** / decay **2.6**. Fog composite-opacity fade (density full). Bust grass clearance **1.75 m** + patchy rim. |

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
| Post | `postprocessing` `^6.39` | One `EffectComposer`: RenderPass → **VolumetricFogPass** → **EdgeGlitchPass** (Stage 3) → bloom → grain (grain amount **0**) |
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

Renderer (live): ACES Filmic, exposure **1.18** (`EXPOSURE`), PCF soft shadows, output sRGB. DPR cap **1.75** (fine pointer) / **1.5** (coarse). Background **`#070709`** (`STAGE_BG`). Camera near **0.1** (`CAM_NEAR`), far **220** (`CAM_FAR` — clears studio shell walls ~180 m), FOV **42°** (`CAM_FOV`). Antialias on, `powerPreference: "high-performance"`.

While building, `?work` / `?work=1` / `?quality=0.6` boots meshes at **60%** of that DPR cap and scales the POV shadow map the same way. `?work=0` / `false` / `off` forces full. Bloom, fog, and the XP / MySpace / Sidekick SMS canvases stay full — only the object raster shrinks. `setWorkQuality` clamps to **0.35–1**; `setWorkQuality(1)` restores.

---

## 4. What you see

Four stops on a ring of radius **18 m**, inward-facing props, camera **outside** the ring. After the aerial drop, scroll lands on **Bust**. Wheel / arrows / dots hop ±1 stop. Click the active stop to zoom.

| Index | Angle | Stop | Neon dominant | Interaction |
| --- | --- | --- | --- | --- |
| 0 | 0° (+Z) | **Bust** | `#9dff1a` (~92°) | Bust **4 m** + apple **11.44 m** yaw **+30°** at `(3.17, -3.25)` on short lawn |
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
      NeonSystem.js                 Tubes + 4 static lights + FogDepthCapture
      makeNeonTube.js               Standard sleeve + bloom-compensated core (no shell)
      neonGradientTexture.js        Tall 4×256 V-strip; loop-closed stops; no mipmaps (scroll seam)
      FogDepthCapture.js            Opaque layer-0 depth pre-pass for volumetric soft-contact
      FogDebugOverlay.js            DEV camera quad: packed depth + soft ramp
      VolumetricFogPass.js          Screen-space raymarch (shared with fog-lab)
    fog/
      fogConfig.js                  Canonical volumetric knobs (lab + stage)
    stage/
      constants.js                  Radii, lights, neon, intro, scroll
      PostPass.js                   Live composer: RenderPass → volumetric → EdgeGlitchPass → bloom → grain
      FilmGrainEffect.js            Custom postprocessing Effect
      StageLoadGate.js              Gating LoadingManager + bake + min boot ms
      LiveStageEnvironment.js       PMREM for glass / PBR
      StageStudioRoom.js            Studio shell
      StageFloor.js                 Floor disc
      VignetteContactShadows.js     Soft dual contact pads (POV spot + neon)
      StageScrollCapture.js         Wheel → CRT / DOM
      stageCameraTrack.js           INTRO_TRACK_DESCENT + legacy sampler (tests)
      frameBudget.js                DEV post-land slow-frame tags
    vignettes/
      BustVignette.js               Arrival bust + apple + lawn patch
      bustLightParticles.js         Sidelined GPGPU particle kit (not on Bust)
      DesktopVignette.js            Retro PC + CRT
      SidekickVignette.js           T-Mobile Sidekick + SMS LCD
      TravelVignette.js             Pack + T-rex
      BaseVignette.js               Shared vignette helpers
      gltfMaterialOwnership.js      Shared-GLTF material safety
      pcSceneBlockout.js            PC_SETUP_TARGET_HEIGHT + floor snap (excludes neon/cables/contact-shadow)
  ui/
    HUDController.js                Caption, dots, readout, MySpace panel
    MySpaceScreen.js                IE chrome + MySpace + XP boot on CRT
    releaseCaptureCanvas.js         Zero html-to-image canvases after copy
    AudioToggleFab.js               Mute FAB
    FogTuner.js                     Live fog tuning panel (Shift+F to toggle)
    EdgeGlitchTuner.js              Live edge-glitch panel (Shift+G to toggle)
    WaterCursorRimTuner.js          Live cursor-rim RESPONSE panel (Shift+C)
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
| Neon tube | **solid sleeve** r **0.058 m** + opaque bloom glow skin r **0.068 m** (`NEON_CORE_MAX` **1.85** luminance target, per-hue boost — **no** Additive volume shell) | Default local XZ **`(2.2, 0.85)`**; Desktop **`(3.65, 1.15)`**. Glow is UnrealBloom on the outer skin (threshold **1.0** unchanged); Additive shell removed to kill the dark “light vacuum” cylinder |
| Volumetric fog | steps **64** / ray **32 m** (0.5 m/step); dist fade **24→32 m**; noise warp **1.5** | `fogConfig.js` / `VolumetricFogPass` |

`CAM_REST_OFFSET_X` (**3 ft**) still exists and is used by the **legacy** intro track sampler / tests. The live `CameraRig` look-at is the ring point at `LOOK.y` with **no** X bias.

**Direction of travel:** `advance(+1)` always adds `+(2π / n)` to `thetaTarget` (never shortest-path). Hop order: Bust → Desktop → Sidekick → Travel → Bust.

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

**Gating set** (blocks `locked = false`): Bust GLB + apple-tree GLB + lawn-grass-stump GLB + Desktop PC GLB + PC PBR maps on the shared `THREE.LoadingManager`; `renderer.compile`; min boot.

**Deferred set** (does **not** block the gate): Sidekick GLB, Travel pack GLB, T-rex GLB. They use a default loader (not the boot manager). Bytes start in `_initLoadGate` with the desktop fetch so meshopt parse does not run after land. Materials are assigned while the root sits on `GPU_HOLD_LAYER` (**3**). `INTRO_MATERIAL_BATCH_SIZE` is **1** and `INTRO_MATERIAL_YIELD_FRAMES` is **2** — that yield is only safe because the meshes are off the live cameras. Do not warm **1 mesh/frame** onto layer 0; that compiled each new program inside fog-depth + beauty and stretched sub-1 fps for the mesh count (~40–50 s). `compileHeldRoot` then compiles once. Shadow-depth variants are drawn for **that root only** into a 16×16 offscreen target (`renderer.compile` skips them; a full-scene shadow render recompiles the stage and costs ~1 s). Then `compileHeldFogDepth` warms `MeshDepthMaterial` for held roots into the fog depth RT (not the beauty frame). CRT glass CubeUV / PMREM (`LiveStageEnvironment` cube **768**) is captured once in that same held window, not again when heavy effects unlock. A late deferred `onLoad` cannot re-bake or unlock — finalize commits once.

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

Keep **POV spot off** this pass — soft ambient/hemi fill + neon; IBL still **0**.

| Light | Intensity / role |
| --- | --- |
| Ambient | **0.06** (`AMBIENT_INTENSITY`) |
| Hemisphere | **0.04** (`HEMI_INTENSITY`) |
| Fill | **0** (`FILL_INTENSITY`) |
| POV `SpotLight` | **Off** (`SPOT_INTENSITY` **0**) |
| Contact shadows | Soft pads per stop. Spot pad opacity **0** (spot off); neon pad opacity **0.18** × neon level. Y **0.008**. |
| Neon `PointLight` ×4 | Focus-only. Peak **28**, distance **6.5**, decay **2.6**. Layers **{0, 2}**, `castShadow: false`. Inactive stops intensity **0** + content hidden. Arrive / flicker as before. See [§12](#12-neon-tubes--fog) |
| Scene IBL | `RoomEnvironment` PMREM, **`STAGE_ENV_INTENSITY` 0** (IBL still off this pass). CRT cube on glass only — never `scene.environment` |
| Studio shell | `MeshBasicMaterial` `STAGE_BG` BackSide — **unlit**. Floor = MeshBasic apron; neon foot = additive `neon-floor-glow`. |

`LiveStageEnvironment` captures a second PMREM for CRT glass; refresh is deferred until models are visible. `applyToScene` defaults **false**.

---

## 11. Post: bloom (grain off)

**One** composer (`PostPass`). Do not add a second.

```text
[opaque depth pre-pass]   // NeonSystem.captureFogDepth → FogDepthCapture (not a composer)
RenderPass → VolumetricFogPass → EdgeGlitchPass → EffectPass(BloomEffect) → EffectPass(FilmGrainEffect)  // grain = 0
```

`VolumetricFogPass` sits in the composer **always** so gate `post.warm()` compiles march+composite (density scale **0** / composite opacity **0** during the throwaway frame — do not reopen the §9/§20 compile hitch). Atmosphere is **volumetric only**. On intro land (`introComplete` — **not** `_shouldRunIntroHeavyEffects` / 2000 ms): density stays **full**; **`uCompositeOpacity`** fades **0→1** over **`FOG_HEAVY_FADE_IN_MS` 400**. Bloom intensity is held at **0** across that opacity ramp and soft-returns over **~180 ms** at full (C05 edge vignette — half-res bloom extracting the fading fog; density/in-scatter ramp was the prior fix). Near-tube density boost **×1.65** within ~**1.35 m** (volumetric halo). In-scatter hard-capped at **`FOG_IN_SCATTER_FILL_CAP` 0.88**. Toggle: `__stage.debugFog('volumetric'|'off')` / `setVolumetricEnabled`.

`FogDepthCapture` runs a **layer-0** scene pass with `MeshDepthMaterial` into a dedicated **nearest-filtered color** target (Three `BasicDepthPacking`: `.r = 1.0 - windowZ`, sized to `renderer.getDrawingBufferSize()` including the **1.75 / 1.5** DPR cap). The volumetric pass reads it via `setSceneDepth(..., { packed: true })` and undoes the invert (`1.0 - .r`) with live camera near/far **0.1 / 220**. Depth material is `toneMapped: false` / `NoToneMapping` so ACES cannot warp packed `.r`. Still **one** `EffectComposer`; the pre-pass is not a second beauty pipeline.

Bloom (`NEON_BLOOM`): `mipmapBlur` **false** (Kawase/mipmap path intermittently outputs a full-black frame when stop-0 parallax translates the camera; kernel blur is stable), `luminanceThreshold` **1.0**, smoothing **0.2**, intensity **1.2**, radius **0.95**, `resolutionScale` **0.5** (half-res bloom internals — soft glow hides the scale; try **0.66** before reverting if edges stair-step). `kernelSize` `KernelSize.LARGE`. Half-float buffers (`HalfFloatType`), no MSAA. Reduced motion: bloom intensity **0**. Do not re-enable `mipmapBlur` without a move-cursor zero-frame probe at stop 0.

**Film grain is off** (amount **0**, normal and reduced-motion). At stage darkness (`STAGE_BG` `#070709`) it read as sensor noise and crushed fog gradients. The `FilmGrainEffect` pass remains last in the chain so a future re-enable is one constant away — do not bloom it.

Tubes use `toneMapped: false` and peak emissive **3** so they clear the threshold after ACES on the rest of the scene. CRT phosphor max **0.72** (`CRT_SCREEN_GLOW_MAX`) — stays under the line.

---

## 12. Neon tubes + fog

Owner: `src/scene/neon/`. **All atmosphere knobs** live in `src/fog/fogConfig.js` (do not dual-maintain tables). Legacy fog ring / haze cards / atlas bake are **deleted** — volumetric is the only path.

Four PointLights stay pinned at the tubes (layers **{0, 2}**, `castShadow: false`). **Focus-only lighting:** only the camera’s target stop (`CameraRig.state.index`) is lit — every other tube/light is intensity **0**. As theta enters `NEON_ARRIVE_RAD` **0.55** rad of that stop, light + emissive fade up; the neon **flickers** once when remaining hop arc ≤ `NEON_FLICKER_TRAVEL_FRAC` **0.07** of a stop step (last ~7% of travel — not on settle), for `NEON_FLICKER_SEC` **0.48** s, then holds. Tube `emissiveMap` scrolls on V (`NEON_GRADIENT_SCROLL` **0.18** loops/s) through that stop’s `neonColors`; the PointLight tracks the same gradient — **Bust** samples the **live** tube phase (widest green↔cyan span; rate-cap lagged), other stops keep slow phase (`NEON_LIGHT_COLOR_SCROLL` **0.028**) + channel rate-cap **`NEON_LIGHT_COLOR_MAX_RATE` 0.12**/s so Desktop/canopy speculars do not crawl (§20.18). **Unlit stops hide their 3D content** under `neon-lit-content` (IBL/ambient/POV spill would otherwise silhouette them) — neon tubes stay for the ring/fog cue. That group tracks the **pre-flicker arrive** level with on/off hysteresis (**ON > 0.08** / **OFF ≤ 0.02** — ON must sit above OFF); once `_arriveLatchedIndex` matches the stop, content follows the **latch only** (not envelope noise). Flicker keys that hit 0 only dim lights/emissive, they must not hide meshes (that was the hard black/normal strobe). **Load-rest latch:** stop 0 is never traveled into on intro land — once the active stop is settled inside `NEON_ARRIVE_RAD`, arrive latches at **1** until the camera leaves that window (`_arriveLatchedIndex`), so a dead-still cursor cannot leave `neon-lit-content` dark. Flicker arms only after leaving the strike band (`_flickerEligible`) — intro land already sits inside it, so it must not strike on a still arrival. Flicker re-arms only after `activeDist > NEON_ARRIVE_RAD`. Reduced motion: no flicker / no scroll — snap on. Aerial intro keeps neon off until first settle. Adjacent chord is ~25.5 m vs light distance **8** / decay **2**. Probe: `__stage.debugNeon()` → `stops[].contentVisible` / `arriveLatchedIndex` / `flickerEligible`.

**Volumetric fog (GATE 4 — live on `/`):** `VolumetricFogPass` + `fogConfig.js`. Lab re-exports the same pass (opens on schema defaults — do not use the lab as source of truth; tune via FogTuner + FINALIZE). Stage wiring: `useComposerDepth: false`, `depthPacked: true`, depth from `FogDepthCapture` each frame; pass inserted **before bloom**. In-scatter feeds all **4** live neon PointLights. Soft luminance cap: fill **`FOG_IN_SCATTER_FILL_CAP` 0.88** hard-clamped (no coreKeep excess above fill — that flashed bloom during the land density ramp). `FOG_IN_SCATTER_CORE_KEEP` **0.22** remains for API/tuner compat only. Reduced motion: freeze `uTime` / noise movement.

**Live look (Manual 1 + look pass):** soft height veil (`heightFogHazeStartY` **0.5**, `heightFogHazeRangeY` **1.8**, `heightFogHazeFloor` **0.25**) + `heightFogExpK` **0.37**; `fogDensityMultiplier` **0.35**, `noisePow` **3**, `heightFogFactor` **0.54**, `heightFogStartY` **-1**, `fogFloorFadeRangeY` **2.05**, `fogMinY` **-0.1**, `fogMaxY` **12.8**, `baseMaxRayLength` **32** / `baseRaymarchStepCount` **64** (0.5 m/step budget — keep ≤**0.7 m/step**). **Stable adaptive steps:** fixed world spacing (`baseMaxRayLength / baseRaymarchStepCount`) + step count **quantized to buckets of 8** from `rayLen` (near screen-filling depth → **8–24** steps, far → up to **64**). Do **not** restore raw per-frame `ceil(rayLen/spacing)` — that pulsed fog under camera micro-jitter (global flash + haze pop). `globalScale` **3.25**, `noiseBias` **0.4**, `noiseSpeed` **7.95**, wind XZ **0.06 / 0.06**, `noiseYScroll` **-0.019**, `outputDither` **0.02** (**spatial-only** Bayer — do **not** animate with `uTime`; that was the edge/vignette strobe; do **not** zero amp or Mach banding returns), `falloffNoiseWarp` **1.5**, `falloffCeilingJitter` **1.2**, `fogDistFadeStart` **24** / `fogDistFadeEnd` **32**, `fogNearFadeStart` **0.5** / `fogNearFadeEnd` **6** (thin fog within ~6 m of camera so near subjects are not crushed; distant look past that range unchanged). Exp path: `amp * exp(-(y − start) * k)` × smoothstep height veil — no binary lid; skips **all** `clipYSlab` Y clamps. **`heightFogEndY` 0** (unused). Studio horizon: floor apron + shell `belowFloor` + `CAM_FAR` **220**. Diagnose: `vol-fog-lidfix-verify.mjs`, `vol-fog-edge-probes.mjs`; look captures: `public/debug/vol-fog-look-before-rest.png` / `vol-fog-look-after-rest.png`. Edge-strobe proof: `scripts/edge-strobe-dither-bisect.mjs` (fixed-pixel / stripMae — not regional mean, not `test:smoke`).

**Atmosphere toggle:** `__stage.debugFog('volumetric'|'off')` / `setVolumetricEnabled` — on/off only (no haze compare). Hardware TODOs in `fogConfig.js` for steps **16 vs 12** and coarse fog reduced-vs-OFF remain open.

**Live fog tuner** (`src/ui/FogTuner.js`): press **Shift+F** to open/close. Priority sliders include **noise warp**, **dist fade start**, **dist fade end**. Sliders apply live via `window.__stage.setVolumetricParams()`. **SAVE** / **UNDO** / **RESET** / **COPY** as before. **FINALIZE** (header or per-history-row) POSTs to Vite middleware `POST /__fog_finalize`, which patches `src/fog/fogConfig.js` schema defaults in place and writes `public/debug/fog-tuner-finalize.json`. Dev-server only — confirm dialog before write. Hard-refresh after finalize to reload module defaults. CLI: `node scripts/fog-tuner-finalize.mjs public/debug/fog-tuner-manual-1.json`. Snapshot archive: `public/debug/fog-tuner-manual-1.json`. `window.__fogTuner`.

**Live edge-glitch tuner** (`src/ui/EdgeGlitchTuner.js`): press **Shift+G** to open/close (panel top-left; fog stays top-right). Exposes the two sizes separately — **`armOuter`** (cursor→edge **trigger** distance; default **0.06**) vs **`localBase` / `localGrowth`** (glitched **strip width** once armed) plus **`armRamp`** (proximity = `pow(1 − d/arm, ramp)`) and **`intensity`**. Sliders apply live via `window.__stage.setEdgeGlitchParams()` (no rebuild). **FINALIZE** → `POST /__edge_glitch_finalize` patches named exports + schema defaults in `src/scene/edgeGlitch/constants.js` and writes `public/debug/edge-glitch-tuner-finalize.json`. CLI: `node scripts/edge-glitch-tuner-finalize.mjs <json>`. Probe: `__stage.debugEdgeGlitch()` / `window.__edgeGlitchTuner`.

**Live water-cursor rim tuner** (`src/ui/WaterCursorRimTuner.js`): press **Shift+C** (panel top-center). Blob **RESPONSE** only — does **not** touch the glitch pass / `ARM_OUTER`. Sliders: **`blowExponent`** (surface-tension ease-in), **`neckPinch`**, **`recoilPushPx`**, **`slurpBand`**, **`snapThreshold`**. Live via `__stage.setWaterCursorRimParams()`. **FINALIZE** → `POST /__water_cursor_rim_finalize` patches `src/cursor/waterCursorRimConfig.js` + `public/debug/water-cursor-rim-tuner-finalize.json`. CLI: `node scripts/water-cursor-rim-tuner-finalize.mjs <json>`. Probe: `window.__waterCursorRimTuner`.

**Tubes (Option 1 — bloom glow, no Additive shell):** length **4 m**. Dark **MeshStandard** sleeve (r **0.058 m**) + opaque glow skin **ShaderMaterial** (r **0.068 m**, just outside the sleeve — must be outer or bloom never sees it; `toneMapped: false`): peak-normalizes the scrolling gradient, then scales by **Rec.709 luminance inverse** so every hue hits **`NEON_CORE_MAX` 1.85** (clears **`NEON_BLOOM.luminanceThreshold` 1.0** ~equally). **No** Additive volume shell — that mesh was the dark “light vacuum” cylinder over maple/bust. Glow halo = UnrealBloom (`intensity` **1.2**, `radius` **0.95**, threshold **1.0** unchanged). Gradient strip closes the loop and uses **no mipmaps**. Skin tracks the focus-gate arrive envelope. Do **not** reintroduce an Additive shell volume to “fix” glow. Do **not** raise global bloom threshold (Sidekick/CRT share it).

**Soft-contact:** volumetric ends the march at FogDepthCapture depth (`packed` undo + live near/far). Soft floor ramp uses `fogFloorFadeRangeY`. See [§20](#20-landmines).

**“Second layer”** is not a reflection pass. Floor apron is MeshBasic (`STAGE_BG`) — it does **not** take the POV spot (avoids the soft round ground disc). Neon tubes get a soft floor **halo** + short **cone** (`neon-floor-glow`, layer **2**): pool diameter **0.92 m** / opacity **0.48**, cone radius **0.11 m** × height **0.22 m** / opacity **0.1** — planted foot on `#070709`. Desktop pool ×**0.34** centered on the tube foot (offset **0** — sideways bias orphaned a floating glow); tower footprint AABB clip on the case only; cone off. Bust/others: full pool under tube, cone on.

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
| `NEON_LIGHT_DISTANCE` | **6.5** | Steep falloff to black (was 14) |
| `NEON_LIGHT_DECAY` | **2.6** | |
| `NEON_CORE_MAX` | **1.85** | Tube core clears bloom threshold 1.0 (white-hot extract) |
| Light distance / decay | **8** / **2** | Does not reach the next stop (~25 m); does not light MeshBasic walls |

Neon lights occupy **{0, 2}** so they stain props (not the MeshBasic studio shell). POV spot stays layer **0** only — share no layer bit with fog in-scatter or you get a grey hotspot. Studio shell (`stage-studio-room`) is MeshBasic and never takes neon.

`renderer.antialias` does nothing on the HalfFloat composer path. If edges look crunchy, add `SMAAEffect` **before grain** — do not trust the renderer flag.

Per-stop colors (dominant = `neonColors[0]` → that stop’s PointLight; secondaries = tube gradient only, never mixed across stops):

| Stop | Hue (dom) | Colors |
| --- | --- | --- |
| Bust | ~92° | `#9dff1a`, `#00e5ff` |
| Desktop | ~187° | `#00e5ff`, `#9dff1a` |
| Sidekick | ~266° | `#8c2dff`, `#ff2d95`, `#00e5ff` |
| Travel | ~7° | `#ff3d1a`, `#ffc14a` |

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
- Materials are upgraded while the PC root is on `GPU_HOLD_LAYER` (`INTRO_MATERIAL_BATCH_SIZE` **1**, yield **2** frames), then compiled once before show, including an offscreen shadow pass. Gate `renderer.compile` still warms blockout/uncommitted programs. Do not put the PBR swap back on a live 1-mesh present cadence.
- **Speaker / desk shimmer** is specular aliasing, not MSAA (`PostPass` HalfFloat `multisampling: 0`). Speakers share `pc_1` with 4K normals. Harden in `pcProductionMaterials.js`: `pc_1` normalScale **0.28**, clearcoat **0**, env **0.38**, roughness floor **0.42**, normal mip bias **1.25** / map mip bias **0.85** via `onBeforeCompile`, mipmaps + aniso ≤ **8**. Neon PointLight hue is rate-capped (`NEON_LIGHT_COLOR_*`); tube gradient still scrolls.

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

### Bust

`BustVignette.js`: loads `/assets/models/bust/runtime/bust.glb` (master: `masters/bust/Bust_lowpoly.glb`), `/assets/models/apple-tree/runtime/apple-tree.glb` (master: `masters/apple-tree/`, export `scripts/export-apple-tree-runtime.py` — Blender Y-up OBJ ≈**meters**, seated on Blender Z → glTF Y-up; native height ≈**8.32 m**), and `/assets/models/lawn-grass-stump/runtime/lawn-grass-stump.glb` (master: `masters/lawn-grass-stump/`, export `scripts/export-lawn-grass-stump-runtime.py` — cm→m, **circular 12 m** patch, ground **96-seg disc**, blades circle-cropped + decimate **0.55**, **RGBA masks packed into baseColor A** / CLIP; compress with resize+meshopt **only** — do **not** webp or alpha is stripped → opaque square cards; runtime **`GRASS_HEIGHT_SCALE` 0.28** ≈**0.5 m** peak, edge height squash) on the boot `LoadingManager`. Bust: **`BUST_HEIGHT` 4 m**, yaw **`BUST_YAW_DEG` +12°**; polish clamps metalness ≤**0.12** (GLB ships metalness 1). GPGPU light-particle kit lives in **`bustLightParticles.js`** but is **not mounted** (sidelined for later reuse). Apple: **`APPLE_HEIGHT` 11.44 m** at **`APPLE_POS` `(3.17, -3.25)`**, yaw **`APPLE_YAW_DEG` +30°** (`MAPLE_*` aliases kept). Lawn (Bust stop only): **`GRASS_POS` `(1.55, -2.37)`**, **`GRASS_Y` 0.006**, soft edge **`GRASS_FADE_START`/`END` 0.72→1.05** with **noise-masked patchy rim**; bust footprint clearance **`GRASS_BUST_CLEAR_M` 1.75 m** (+ feather **0.35 m**) so blades do not clip the pedestal; **`GRASS_XZ_SCALE` 0.8**. Apple leaf lighting: **`LEAF_LIGHT_DISTANCE` 4.8** + Beer-lambert self-shadow under neon **28** / distance **6.5**.

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

---

## 15. Cursor, audio, HUD

**Water cursor** (`src/cursor/`): same `WebGLRenderer` as the stage (not a second WebGL context). Extra ortho scene drawn after the beauty pass with `autoClear = false`. Default diameter **22.4 px**, follow rate **10 /s**, color `#e8f4ff` (`waterCursorConfig.js`). Init **after** intro land, load gate unlock, and the post-land cursor delay (**720 ms**). Not created for `prefers-reduced-motion` or coarse pointer (`pointer: coarse`). **Rim couple** (stop **0** only; reduced-motion / `workQuality` gate / 3× SDF budget unchanged): signed `sampleRimField` → basic **elongate along tip / squeeze sideways** (`blowExponent` **2.8**, `neckPinch` **0.72**, `recoilPushPx` **10**, `snapThreshold` **0.01**). Tune live with **Shift+C**. Glitch / `ARM_OUTER` untouched. No refraction yet.

**Audio** (`siteAudio.js`): mute FAB, XP startup/login, Sidekick open/close. SFX leads Sidekick motion (`OPEN_SFX_LEAD` **0.2 s**).

**HUD:** top bar (wordmark · FPS · stage readout), bottom bar (caption · dots · scroll hint; mute FAB clears the hint). Optional MySpace overlay panel on narrow viewports (`max-width: 900px`).

---

## 16. Assets and scripts

### Runtime vs masters

| Path | Role |
| --- | --- |
| `public/assets/models/` | What the stage loads (Git LFS for glb/png) |
| `masters/` | Canonical originals — **never** overwrite, delete, or optimize in place |
| `scripts/setup-assets.sh` | Legacy helper: copy/sparse-clone PC assets from `daneoleary-webflow`. Live models are already vendored; do not re-symlink to Webflow |

Runtime folders (from `public/assets/models/README.md`): `sidekick/`, `pc-source/`, `bust/runtime/`, `apple-tree/runtime/`, `lawn-grass-stump/runtime/`, `maple-tree/runtime/` (legacy), `travel-pack/runtime/`, `t-rex/runtime/`.

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
| `node scripts/edge-glitch-tuner-finalize.mjs <json>` | Patch `src/scene/edgeGlitch/constants.js` exports + schema defaults (same as **Shift+G FINALIZE**) |
| `node scripts/vol-fog-lidfix-verify.mjs` | All-rows fog slab-edge metric → `public/debug/vol-fog-lidfix-verify.json` |

CRT diagnostics (manual): `node scripts/crt-bezel-opening-offline.mjs`, `node scripts/crt-screen-diagnose.mjs`. Bezel content plane (Blender): `scripts/crt-bezel-blender-measure2.py` → `crtBezelOpening.js` + `public/assets/models/pc-source/crt-content-plane.glb` + `tmp/crt-bezel/crt-bezel-content.blend`. Neon spill tune (TEMP): `node scripts/neon-spill-tune-sweep.mjs` → `public/debug/neon-spill-*.png` + live `__stage.setNeon({ height, maxLight })`. Fog soft fade: `node scripts/fog-soft-diagnose.mjs`. Fog horizontal bands (flat-sheet collapse): `node scripts/fog-band-diagnose.mjs` → `public/debug/fog-band-*.png` + `fog-band-diagnose.json`. Sidekick materials: `node scripts/sidekick-material-diagnose.mjs` / `sidekick-material-diagnose2.mjs` (Playwright, Vite on **5176**).

### Python / Blender (travel)

| Script | Role |
| --- | --- |
| `scripts/export-travel-runtime.py` | Blender: read masters OBJ/PNG → `public/assets/models/**/runtime/*.glb`. Pack tex **2048**, rex **1024**, cm→m (`CM_TO_M = 0.01`). Then resize → webp → **meshopt** via gltf-transform — **never** `optimize` (it `simplify`s meshes away). Runtime `GLTFLoader` registers `MeshoptDecoder` (`src/scene/loaders/createGltfLoader.js`) |
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

`npm run test:smoke` (`scripts/stage-canvas-smoke.mjs`) boots the real Vite stage in Playwright Chromium: no thrown/console errors through load, **fails on `GL_INVALID_FRAMEBUFFER` / “Framebuffer is incomplete”** (hooked `getError` + console), canvas non-blank after the gate, Desktop CRT / Sidekick `Buttons` / Travel pack present after a full hop cycle (Bust → Desktop → Sidekick → Travel → Bust). It is the only suite that can catch shared-GLTF-material / alpha-0-snapshot / WebGL-taint / CubeUV-shader / zero-size RT classes. Requires `npx playwright install chromium` once.

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
window.__stage.debugFogIsolate({ floor })  // floor neon stain isolate
window.__stage.debugFog("volumetric") // live raymarch on
window.__stage.debugFog("off")        // volumetric off
window.__stage.setVolumetricEnabled(true|false) // alias → debugFog
window.__stage.setVolumetricParams({ /* fogConfig keys */ })
window.__stage.debugVolumetricFog()
window.__stage.setNeon({ height, maxLight })  // TEMP hot-tune; remove after bake
window.__stage.debugEdgeGlitch()     // edge SDF / local rim debug + live knobs
window.__stage.setEdgeGlitchParams({ armOuter, armRamp, localBase, localGrowth, intensity })
window.__stage.getEdgeGlitchParams()
window.__edgeGlitchTuner             // Shift+G panel API
window.__stage.setWaterCursorRimParams({ blowExponent, neckPinch, recoilPushPx, slurpBand, snapThreshold })
window.__stage.getWaterCursorRimParams()
window.__waterCursorRimTuner         // Shift+C panel API (blob response only)
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
4. **Heavy GPU work on the land frame** hitch the height ease-out — stagger it. After land, do not warm deferred meshes 1-per-present: each new program compiled inside `captureFogDepth` + beauty and frames sat over 1 s for the mesh count. Hold on layer **3**, compile once, then show.
5. **html-to-image on a canvas used by WebGL taints** the context.
6. **Look-at aimed at the destination during a hop** cuts a chord through the arena. Rest look-at stays on the ring at **current** theta.
7. **Do not rotate `world` to change stops.**
8. **POV spot + fog in-scatter on the same layer** → grey fog with a white hotspot. Spot stays layer 0 only. Neon lights are {0, 2}.
9. **Volumetric soft-contact + far-band fade.** Soft-contact ends the march at FogDepthCapture depth (`packed` undo + live near/far). Far horizontal band was the ray hard-stop at `baseMaxRayLength` **32** while the far arc sits ~**42–50 m** — density now ramps to 0 via `fogDistFadeStart` **24** / `fogDistFadeEnd` **32**. Floor stays MeshBasic — do not reintroduce a MeshStandard lit disc (POV spot → soft round ground pool). Tube floor spill is additive `neon-floor-glow` on layer **2**, not a lit apron.
9b. **~~Volumetric grazing horizon bands (hard slab top + bottom)~~ — FIXED.** Top lid = density-independent hard ceiling (`heightFogEndY` + `fogMaxY` / `clipYSlab` upper) — probe 1 vs 2/3. Bottom edge = floor-depth hard stop — soften with `fogFloorFadeRangeY` smoothstep; exp path skips **all** `clipYSlab` Y clamps. Metric must scan **all rows**. Live: height veil start **0.5** / range **1.8** / floor **0.25**, `heightFogExpK` **0.37**, `fogDensityMultiplier` **0.35**, `heightFogFactor` **0.54**, `fogFloorFadeRangeY` **2.05**, `baseMaxRayLength` **32** / steps **64**, `noisePow` **3**, `falloffNoiseWarp` **1.5**, `falloffCeilingJitter` **1.2**, dist fade **24→32**. Floor apron + `CAM_FAR` **220**. Verify: `scripts/vol-fog-lidfix-verify.mjs`.
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
12. **Neon dominants (`[0]`) must stay evenly spaced around the color wheel in ring order.** Do not set two adjacent stops to complementary hues or the overlap arc greys out. Mixing still happens in the band’s overlap — it stays clean only because the inputs are not complementary. The old cyan-vs-orange mud is retired, not relocated.
13. **Travel pack / T-rex read as a black void without IBL, or with their runtime normal maps.** MeshStandard + no IBL + ambient **0.06** against `STAGE_BG` `#070709` is a silhouette, not a missing mesh. Assign the static RoomEnvironment PMREM (`getStudioEnvironment()`); never the CRT cube capture (`update(..., { applyToScene: false })`). Runtime pack/rex GLBs bind bump/height atlases as `normalMap` and ship no usable TANGENT — **strip the normal map** at polish (computed tangents are not enough). Do not force `FrontSide` on the rex (GLB is doubleSided). Stamp reveal opacity on deferred roots that mount after the fade already hit 1. Fit the pack using morphed bounds; `Box3.setFromObject` ignores morph targets and leaves the closed bag ankle-high. Travel uses `skipFloorSnap` — after local floor fits, do **not** `snapGroupToFloor` the vignette (rest-pose AABB under the closed morph lifts the group and floats the rex).
14. **CRT glass ShaderMaterial + CubeUV.** `textureCubeUV` needs `CUBEUV_MAX_MIP` / texel defines. Bind a **PMREM** (`CubeUVReflectionMapping`) as `material.envMap` so `WebGLProgram` injects them once (`applyCrtGlassEnvMap`). Do **not** also stamp those defines on `material.defines` (redefinition fails the fragment compile). Never bind the raw cubemap (`getTexture()` must not fall back to `WebGLCubeRenderTarget.texture`).
15. **CRT content is a Blender-measured bezel plane, not `pc-Mesh_2` UVs.** The authored phosphor is a rounded radial island — it cannot fill the square bezel hole. Re-measure with `scripts/crt-bezel-blender-measure2.py` (writes `crtBezelOpening.js` + `crt-content-plane.glb`); content = opening inset **1 mm**, corner radius **2 mm** (was 1 cm / 1.2 cm — that curved-cropped MySpace/XP chrome). Do not “fix” edge crop with more `DOM_CAPTURE_EDGE_PAD` (wrong layer — pad stays **40**). Clone glass from the **bulge before** flatten; keep the content plane behind `shellOffset` **0.006**. Working blend: `tmp/crt-bezel/crt-bezel-content.blend` — never edit masters. Edge-cropped MySpace/XP/SMS text from capture = permanent inset on page parents (`DOM_CAPTURE_EDGE_PAD_PX` **40**); curved bezel crop = content-plane geometry.
20. **CRT gray glare disc on dark stage.** Classic cause = glass `envMapIntensity` too high (C12) — keep **0.22**; do **not** raise `STAGE_ENV_INTENSITY` or set CRT cube `applyToScene: true`. Recurrence: broad **neon PointLight** specular (N·L fill / low `neonSpecPower`) — or a hot glint that **bloom** softens into a disc — keep a rim pin (`neonSpecPower` **≥180**, fresnel², RGB cap under bloom threshold); leave `envMapIntensity` alone.
16. **Floor snap must ignore neon tubes (and cables / glow / contact-shadows).** Each vignette group owns a `neon-tube` planted on `STAGE_FLOOR_Y`. If that mesh anchors `snapGroupToFloor`, the Desktop PC (and anything else aligned above the tube) floats ~0.5 m. `isFloorExcludedMesh` skips `neon` / `glow` / `contact-shadow` names and `cable*` materials — keep it that way.
17. **`glitch-gl` is parked, not stage post.** It owns a separate WebGL renderer + rAF and nests `three@^0.178`. Do not `import` it into `StageExperience` / `PostPass`. Cursor-proximity edge glitch is **screen-space SDF + `EdgeGlitchPass`** (beauty tears + RGB split, **local** to an SDF-projected edge-origin; proximity boosts width/intensity more than scale; **occlusion** = FogDepthCapture scene depth vs bust-only packed depth, strength → **0** at rim ∩ occluder) in `src/scene/edgeGlitch/` — same canvas / composer / rAF. No CSM. Layer-2 leaves are absent from fog depth (canopy may not mask). Tune trigger vs strip width live with **Shift+G**. Read `glitch-gl` GLSL as a look reference only.
18. **PC speaker “shimmer” ≠ missing antialiasing.** Composer is HalfFloat with `multisampling: 0`; raising `renderer.antialias` does nothing on that path. High-frequency normals + clearcoat under a fast-scrolling neon light color crawl as specular aliasing. Fix materials (`pc_1` normalScale / clearcoat off / roughness floor / normal mip bias) and keep **Desktop** PointLight hue **rate-capped** (`NEON_LIGHT_COLOR_SCROLL` / `NEON_LIGHT_COLOR_MAX_RATE`) — **Bust is exempt** (live tube phase; widest green↔cyan span lagged under the cap). Do not “fix” by enabling MSAA on the HalfFloat RT or by restoring full-speed light scroll on Desktop.
19. **Neon load-rest / arrive latch (stop 0).** Content under `neon-lit-content` must track the **pre-flicker arrive** envelope with hysteresis — never the flickered light value (zeros hide the whole stop → black⇄lit strobe). **Once `_arriveLatchedIndex` matches the active stop, content visibility follows the latch only** (ignore envelope micro-noise). Travel arrive hysteresis: ON **> 0.08**, OFF **≤ 0.02** (ON must sit above OFF — the old **1e-3 / 0.02** pair turned content on then immediately off in the gap → C04 chatter). Stop 0 is the load-rest stop: latch arrive on the **intro→first-settle handoff** via `neon.armArriveForActiveStop(index)`. **`allowNeon` is `introComplete` only** — do **not** OR with `CameraRig.isSettled` (aerial hold is also “settled” at pageload height → stop-0 flash on → drop blackout → land pop). Do not arm flicker until the camera has left the strike band (`_flickerEligible`) — intro land already sits inside it. Bust/maple mount on the boot gate (not the opacity reveal list); deferred-root reveal stamps (§13/§20.13) apply to PC/Sidekick/Travel, not the arrival bust.
9h. **Stop-0 global flash during aerial intro = `allowNeon = introComplete || isSettled`.** Aerial hold settles at pageload height → neon/content on; `armIntroDescent` unsettles → off; land settles → on. Fix: gate `allowNeon` on `introComplete` only; arm stop-0 arrive latch in `_completeIntroMotion`. Distinct from fog step-count flash (§9e) and from C04 arrive-edge content chatter (§19).
21. **Ambient/hemi probe (spot off).** Ambient **0.06** / hemi **0.04**; POV spot **0**; IBL **0**; neon **28** / distance **6.5** / decay **2.6**. Do **not** restore spot or raise `STAGE_ENV` without Dane. Leaf canopy still spot×0.

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
- Do not retune **edge-glitch** knobs (`ARM_OUTER`, `LOCAL_*`, intensity, …) when adjusting water-cursor feel — blob RESPONSE lives in `waterCursorRimConfig.js` / **Shift+C**. Glitch must stay visually identical across cursor-curve changes.

---

## 22. Keeping this document current

- **Canonical file:** this README. `docs/PROJECT.md` only points here.
- **Agent rule:** `.cursor/rules/keep-readme-current.mdc` (`alwaysApply`).
- When you change a tunable, copy the number from code, do not round from memory.
- When you add a vignette, update the stop table, `n` in hop math (`2π/n`), neon colors, and asset paths.
- When you add an npm script, add it to [§16](#16-assets-and-scripts) and [§18](#18-tests) if it is a test.
- If you rename a file or constant, grep this README and fix every mention.
- Bump **Last verified** at the top on every README edit.
- **Prepend a row** to [Latest changes](#latest-changes) (newest first) summarizing what changed — knobs, paths, landmines, or behavior. Keep rows short; details stay in the numbered sections.
