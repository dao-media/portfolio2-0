# Portfolio 2.0

Cinematic, scroll-driven Three.js stage. One WebGL canvas, four vignettes on a **fixed** ring, orbital camera on critically damped springs, live UI painted onto model screens, neon tubes + baked ground fog, Windows-XP-styled load gate.

**Last verified:** 23 August 2026. This file is the source of truth. Agents must update it in the same change as the code (see `.cursor/rules/keep-readme-current.mdc`).

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
11. [Post: bloom + grain](#11-post-bloom--grain)
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
- **Travel is camera motion, never `world.rotation.y`.** The world is forced to `0` every frame.
- **Hops always add `±2π / n`.** Never shortest-path (that reversed the first lap and cut a chord through the arena).
- **Look-at during travel stays on the ring at current theta**, not the destination, so the path stays circular.
- **Neon identity is per-stop.** Fog light uses `neonColors[0]` only — never an average of opposite hues.
- **XP boot on the CRT is content**, not the page preloader. The page gate is `#fader` + `StageLoadGate`.
- **Masters are sacred.** Copy out of `masters/`; never optimize or overwrite in place.
- **Vanilla Three.** No React, no R3F, no physics, no Lenis, no ScrollTrigger.

---

## 2. Run locally

```bash
npm install
npm run dev          # Vite, http://localhost:5173 (opens automatically)
npm run build
npm run preview
npm run test:motion  # cursor + scroll + parallax + Sidekick keypad
```

Git LFS is required for `.glb` and model PNGs under `public/assets/models/` (see `.gitattributes`).

Vite pages (`vite.config.js`):

| URL | File | Purpose |
| --- | --- | --- |
| `/` | `index.html` | Live stage (`#scene-canvas`) |
| `/sidekick-sms.html` | `sidekick-sms.html` | Standalone SMS form for LCD development |

---

## 3. Tech stack and tools

| Layer | Choice | Notes |
| --- | --- | --- |
| Bundler | Vite `^6.3` | HMR, multi-page (`index` + `sidekick-sms`), port **5173**, `open: true` |
| 3D | Three.js `^0.172` (vanilla) | One rAF loop. **No React, no R3F** |
| Camera | Custom springs (`springTo`, ζ = 1) | Interruptible; retarget is a field write |
| Prop motion | GSAP `^3.15` | Sidekick swivel, capture blend, delayed SFX |
| Post | `postprocessing` `^6.39` | One `EffectComposer`: RenderPass → bloom → grain |
| Fog shader | `three-custom-shader-material` `^6.4` | Wraps `MeshStandardMaterial`; write `csm_DiffuseColor`, never `csm_FragColor` |
| Screen UI | Offscreen DOM + Canvas 2D | MySpace / XP / SMS on meshes |
| DOM → texture | `html-to-image` | Static frames only (login, SMS LCD) |
| Audio | `HTMLAudioElement` + session mute | XP + Sidekick SFX |
| Tests | Node ESM scripts | No browser runner |
| Travel GLB | Blender (`bpy`) via `scripts/export-travel-runtime.py` | Then gltf-transform **resize / webp only** |
| Binaries | Git LFS | `*.glb` and `public/assets/models/**/*.png` |

**Not used:** physics, ScrollTrigger, Lenis, a second composer, world-Y rotation for travel, Draco (no `DRACOLoader` yet).

Renderer (live): ACES Filmic, exposure **1.18** (`EXPOSURE`), PCF soft shadows, output sRGB. DPR cap **1.75** (fine pointer) / **1.5** (coarse). Background **`#141414`** (`STAGE_BG`). Camera near **0.1**, far **120**, FOV **42°** (`CAM_FOV`). Antialias on, `powerPreference: "high-performance"`.

---

## 4. What you see

Four stops on a ring of radius **18 m**, inward-facing props, camera **outside** the ring. After the aerial drop, scroll lands on **Monolith**. Wheel / arrows / dots hop ±1 stop. Click the active stop to zoom.

| Index | Angle | Stop | Interaction |
| --- | --- | --- | --- |
| 0 | 0° (+Z) | **Monolith** | Placeholder PC blockout |
| 1 | 90° (+X) | **Retro Desktop** | PC GLB. Click CRT → zoom → XP boot → MySpace. Wheel on zoomed CRT scrolls the page |
| 2 | 180° (−Z) | **Sidekick** | Phone GLB. Click toggles zoom **and** lid swivel. Open LCD is a live SMS form |
| 3 | 270° (−X) | **Travel Pack** | Pack + T-rex GLBs. Click pack to open; bones can twitch |

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
    neon/
      NeonSystem.js                 Tubes + fog cards + moving PointLight
      makeNeonTube.js               Cylinder + emissive gradient map
      neonGradientTexture.js        Tall 4×256 canvas strip (gradient on V)
      bakeFogAtlas.js               One-shot FBM flipbook (load gate only)
      createFogMaterial.js          Lit grey CSM material; samples atlas
      createFogPlane.js             1×1-segment ground card
    stage/
      constants.js                  Radii, lights, neon, intro, scroll
      PostPass.js                   Live composer (bloom then grain)
      FilmGrainEffect.js            Custom postprocessing Effect
      StageLoadGate.js              LoadingManager + bake + min boot ms
      LiveStageEnvironment.js       PMREM for glass / PBR
      StageStudioRoom.js            Studio shell
      StageFloor.js                 Floor disc
      StageScrollCapture.js         Wheel → CRT / DOM
      placeholderVignettes.js       Monolith (+ unused Orbit/Cube defs)
      stageCameraTrack.js           INTRO_TRACK_DESCENT + legacy sampler (tests)
    vignettes/
      DesktopVignette.js            Retro PC + CRT
      SidekickVignette.js           T-Mobile Sidekick + SMS LCD
      TravelVignette.js             Pack + T-rex
      BaseVignette.js               Shared vignette helpers
      gltfMaterialOwnership.js      Shared-GLTF material safety
      pcSceneBlockout.js            PC_SETUP_TARGET_HEIGHT + floor snap
  ui/
    HUDController.js                Caption, dots, readout, MySpace panel
    MySpaceScreen.js                IE chrome + MySpace + XP boot on CRT
    AudioToggleFab.js               Mute FAB
    xpBoot/
      StageBootSequence.js          Fader gate API (`setProgress` / `dismiss`)
      XpBootMonitor.js              CRT XP sequence (content, not page gate)
      config.js                     CRT boot timings + asset URLs
    sidekickSms/                    SMS compose atlas
  cursor/                           Water-blob WebGL overlay
  audio/siteAudio.js
  content/myspace-content.js
  styles/                           main, myspace, xp-boot, crt-power-on, sms
public/assets/models/               Vendored runtime (Git LFS)
masters/                            Untouched source (never edit in place)
scripts/                            Stress tests + Blender travel export
```

**Dead / not in the live loop** (kept from the first POC):

- `src/scene/PortfolioExperience.js`, `ScrollController.js`, `src/scene/CameraRig.js` (page-scroll carousel; live rig is `camera/CameraRig.js`)
- `SpotlightBloomPass.js` / `PovSpotlightBeam.js` — earmarked, **not** wired
- Much of `stageParallaxMotion.js` / `stageCameraTrack.js` — still imported for **tests** and `INTRO_TRACK_DESCENT`. Live drop is the height spring, not the old keyframe sampler
- `vignetteAnchorRotation` / `TRANSITION_DURATION` and friends — leftovers from world-Y travel; **not** what hops the camera

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
| Neon tube | radius **0.06 m**, length **4 m** default | `makeNeonTube` (local offset `2.2, length/2, 0.85`) |
| Fog card | **10 × 10 m**, Y **0.05 m**, 1×1 segments | `NEON_FOG.planeSize` / `NEON_FOG.y` |

`CAM_REST_OFFSET_X` (**3 ft**) still exists and is used by the **legacy** intro track sampler / tests. The live `CameraRig` look-at is the ring point at `LOOK.y` with **no** X bias.

**Direction of travel:** `advance(+1)` always adds `+(2π / n)` to `thetaTarget` (never shortest-path). Hop order: Monolith → Desktop → Sidekick → Travel → Monolith.

The world does **not** rotate. `world.rotation.y` is forced to `0` every frame.

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

`DESKTOP_FOCUS_CAM_PULL` / `SIDEKICK_FOCUS_CAM_PULL` / `DESKTOP_REST_EXTRA_BACK` are leftover focus-blend knobs. Live zoom distance is `CAMERA_ZOOM_DISTANCE`. `_tickDesktopRestAnchor` currently calls `applyRestAnchorBlend(0)` so extra rest-back does **not** shove the PC.

---

## 9. Intro, load gate, XP boot

Two clocks that must not be confused:

### Aerial drop (visual intro)

1. Camera starts at rest radius, height **13.85 m**. Quaternion **frozen** so look-at does not pitch as height falls.
2. **240 ms** hold (`INTRO_SPRING_HOLD_MS`) — first-frame shader compile cannot hitch the drop.
3. Height spring to **2.85 m**. Progress is derived from height, not a sampled curve.
4. On land: `introComplete = true`, then staggered work (fetch already started at construct; integrate / warm / cursor delayed).

Post-land delays (`constants.js`): fetch **420 ms**, warm **900 ms**, cursor **720 ms**, settle grace **1200 ms**, integration delay **500 ms**, heavy effects **2000 ms**, Sidekick screen bake **4500 ms**.

GLB **commit** still waits on the intro gate so GPU upload does not hitch the ease-out. **Fetch** starts immediately so the load gate can count items.

### Page-load gate (interaction lock)

`createStageLoadGate` + `StageBootSequence` + `#fader`:

1. Shared `THREE.LoadingManager` on GLTF loaders and PC `TextureLoader`.
2. Progress → fader `--boot-progress` (XP bar chrome reused from `xp-boot.css`).
3. On load: bake fog atlas, `renderer.compile`, one throwaway composed frame.
4. Wait `max(0, BOOT_MIN_MS − elapsed)` — **2600 ms** (**400 ms** if `prefers-reduced-motion`).
5. Dismiss fader, `locked = false`, cursor may init.

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
| Neon `PointLight` | See [§12](#12-neon-tubes--fog). Layer **2** only |

`LiveStageEnvironment` captures PMREM for CRT glass / PBR; refresh is deferred until models are visible.

---

## 11. Post: bloom + grain

**One** composer (`PostPass`). Do not add a second.

```text
RenderPass → EffectPass(BloomEffect) → EffectPass(FilmGrainEffect)
```

Bloom (`NEON_BLOOM`): `mipmapBlur`, `luminanceThreshold` **1.0**, smoothing **0.2**, intensity **1.2**, radius **0.7**. Half-float buffers (`HalfFloatType`), no MSAA. Reduced motion: bloom intensity **0**. Grain amount **0.05** (**0.03** reduced motion), ramped after intro. Grain stays **last** so it is not bloomed.

Tubes use `toneMapped: false` and peak emissive **3** so they clear the threshold after ACES on the rest of the scene. CRT phosphor max **0.72** (`CRT_SCREEN_GLOW_MAX`) — stays under the line.

`SpotlightBloomPass` (Three addons Unreal bloom, layer 1) is **not** in this stack.

---

## 12. Neon tubes + fog

Owner: `src/scene/neon/`. Knobs in `constants.js`.

**Assumption that does *not* hold:** vignettes do not rotate to a shared front. The camera travels. The single PointLight **follows** the front-most tube (`position.xz` from tube world position, **Y = 1.0 m** = `NEON_LIGHT_HEIGHT`).

| Knob | Value | Tune order |
| --- | --- | --- |
| Light height | **1.0 m** | 1 — spread vs grey hotspot |
| `NEON_FOG.uLoopRadius` | **1.5** | 2 — churn (too high orbits, too low freezes) |
| Atlas `N` | **64** | 3 — raise before `TILE` if the loop pulses |
| `NEON_MAX_EMISSIVE` | **3.0** | Must stay above bloom threshold |
| `NEON_MAX_LIGHT` | **10.0** | Physical units; if fog halos: raise height first, then lower this |
| Light distance / decay | **8** / **2** | Does not reach the next stop (~25 m) |
| Fog albedo | **0.75** grey | Never a hue — hue = light color |
| Fog opacity | **0.85** | Transparent, `depthWrite: false` |
| Bake `uScale` | **3.0** | Frozen into the atlas |

Fog is **layer 2** (`NEON_FOG_LAYER`); POV spot stays layer 0 so it cannot wash the pool grey. Camera enables layer 2. Fog `raycast` is a no-op so it does not steal CRT/phone clicks.

Atlas bake (load gate only): 8×8 tiles (`FOG_ATLAS`), **256²** each, **2048²** RGBA (~16 MB). Seamless time via circular offset `uTheta ∈ [0, 2π)`. Runtime mixes two cells; no `snoise` at runtime.

Per-stop colors (dominant = `neonColors[0]` → fog light):

| Stop | Colors |
| --- | --- |
| Monolith | `#ffb37a`, `#ff5c33` |
| Desktop | `#00e5ff`, `#7cff6b` |
| Sidekick | `#ff2d95`, `#7b2dff`, `#00e5ff` |
| Travel | `#ffc14a`, `#ff6b2d` |

`neonActiveAmount` uses smoothstep of angular distance; both stops sit near **0** at the hop midpoint so recolor is invisible.

---

## 13. Vignettes

### Desktop (`DesktopVignette.js`)

- Runtime: `/assets/models/pc-source/pc-from-source.glb` + PBR maps in the same folder.
- Fallback: blockout desk if the GLB fails.
- CRT: emissive map only (diffuse black). Glass: custom fresnel + env. Click zoom starts XP → MySpace.
- Materials upgraded **1 mesh / frame** during integrate (`INTRO_MATERIAL_BATCH_SIZE`).

### Sidekick (`SidekickVignette.js`)

- Runtime: `/assets/models/sidekick/Sidekick3.glb`.
- Zoom and lid swivel are one toggle. Open LCD: live SMS (`SidekickSmsScreen`). Send: scrollball red blink, then close.
- Open SFX leads motion by **0.2 s** (`OPEN_SFX_LEAD`).
- **Keypad:** GLB authors `Buttons` + cover on shared `phong3` (MASK, alpha 0). Repair clones opaque DoubleSide plastic onto the keys every `update()`. See [§20](#20-landmines).

### Travel (`TravelVignette.js`)

- `/assets/models/travel-pack/runtime/travel-pack.glb`, `/assets/models/t-rex/runtime/t-rex.glb`.
- Pack morph open; rex bone twitch. Derived GLBs only — do not edit OBJ/PNG extras in `public/` as if they were masters.

### Monolith

`placeholderVignettes.js` PC blockout. Blockout meshes named `blockout-*` hide unless that stop is active.

---

## 14. Screen pipelines

| Surface | Method | Rule |
| --- | --- | --- |
| XP boot / login | Canvas 2D blit onto `CanvasTexture` | CSS overflow does not clip the CRT — use `clip()` for the meter |
| MySpace hover | Cached bitmap + overlay | Never `html-to-image` on pointermove (hitch + WebGL taint) |
| MySpace login still | `html-to-image` **once**, then cache | |
| SMS LCD compose | `html-to-image` for form frames | Splash is a locked UV atlas; flip is a texture swap |
| CRT phosphor | `emissiveMap`, intensity ≤ 0.72 | |

---

## 15. Cursor, audio, HUD

**Water cursor** (`src/cursor/`): overlay WebGL after the beauty pass. Default diameter **22.4 px**, follow rate **10 /s**, color `#e8f4ff` (`waterCursorConfig.js`). Init **after** intro land **and** load gate. Reduced motion: skip deform.

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
| `npm run test:motion` | All four |

### Python / Blender (travel)

| Script | Role |
| --- | --- |
| `scripts/export-travel-runtime.py` | Blender: read masters OBJ/PNG → `public/assets/models/**/runtime/*.glb`. Pack tex **2048**, rex **1024**, cm→m (`CM_TO_M = 0.01`). Then resize/webp via gltf-transform — **never** `optimize` (it `simplify`s meshes away). Skip Draco until a `DRACOLoader` ships |
| `scripts/inspect-travel-assets.py` | Inspect source trees without writing |

Post-export (from the script header):

```bash
npx @gltf-transform/cli resize runtime.glb resized.glb --width 1024 --height 1024
npx @gltf-transform/cli webp resized.glb runtime.glb --quality 86
```

---

## 17. Frame loop

`StageExperience._animate` (single rAF):

1. Desktop LED / CRT spill (gated until intro + heavy-effects delay)
2. Placeholder anim fns
3. `world.rotation.y = 0`
4. Parallax damp zones → `parallax.setStrength`
5. `cameraRig.update(dt)`
6. Intro tick, index/zoom sync, POV spot aim
7. Vignette `update` (after intro), including `_tickDesktopRestAnchor`
8. Model reveal fade, grain ramp, **neon + fog `uTime`**
9. `post.render` then water cursor

Do not add a second `requestAnimationFrame` for scene motion. GSAP must not write `camera.position`.

---

## 18. Tests

Node-only. If you change Sidekick materials or `setGroupRenderOpacity`, run `test:sidekick`. If you change `scrollAdvance` / `CameraRig` settle, add a case — “stuck after the first hop” was a one-line timer reset with no test.

---

## 19. Dev probes

```js
window.__stage.debugFloorHeights()
window.__stage.debugResnapAll()
window.__stage.debugSidekick()
window.__stage.debugNeon()
window.__stage.debugScrollCapture()
```

---

## 20. Landmines

These are why the repo has “weird” helpers. Full narrative history lived in an older `docs/PROJECT.md`; the rules below are what still matter.

1. **Shared GLTF materials (Sidekick keys vanish).** `Buttons` and the transparent cover share `phong3` (MASK, alpha 0). Clone-then-mutate the cover is not enough. Repair keys onto pinned opaque DoubleSide plastic; re-ensure every update; never `dispose()` a GLTF material another mesh still holds; intro fade must not snapshot alpha 0 as authored keypad state.
2. **`notifySettled` every settled frame** disarms scroll forever after hop 1.
3. **Queued hop on land** skips a stop. Mid-travel wheel re-arms after land but does not auto-fire.
4. **Heavy GPU work on the land frame** hitch the height ease-out — stagger it.
5. **html-to-image on a canvas used by WebGL taints** the context.
6. **Look-at aimed at the destination during a hop** cuts a chord through the arena. Rest look-at stays on the ring at **current** theta.
7. **Do not rotate `world` to change stops.**
8. **Fog + POV spot on the same layer** → grey fog with a white hotspot. Fog is layer 2.
9. **Writing `csm_FragColor` on fog** bypasses lighting; neon never tints the pool. Use `csm_DiffuseColor`.

---

## 21. What not to do

- Do not scaffold a second app, scene, or `EffectComposer`.
- Do not `gltf-transform optimize` (includes `simplify`). Resize → webp → Draco last, only with a decoder.
- Do not apply Array modifiers on Blender export (`export_apply=False`).
- Do not mutate a GLTF material in place without `ownMeshMaterial`.
- Do not html-to-image every hover/boot frame.
- Do not let Sidekick hover capture stage wheel.
- Do not put `Buttons` back on `phong3`.
- Do not edit files under `masters/`.
- Do not average opposite neon hues for the fog light (cyan + magenta → grey). Use the dominant stop.

---

## 22. Keeping this document current

- **Canonical file:** this README. `docs/PROJECT.md` only points here.
- **Agent rule:** `.cursor/rules/keep-readme-current.mdc` (`alwaysApply`).
- When you change a tunable, copy the number from code, do not round from memory.
- When you add a vignette, update the stop table, `n` in hop math (`2π/n`), neon colors, and asset paths.
- When you add an npm script, add it to [§16](#16-assets-and-scripts) and [§18](#18-tests) if it is a test.
- If you rename a file or constant, grep this README and fix every mention.
- Bump **Last verified** at the top on every README edit.
