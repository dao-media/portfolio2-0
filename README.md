# Portfolio 2.0

Cinematic, scroll-driven Three.js stage. One WebGL canvas, four vignettes on a **fixed** ring, orbital camera on critically damped springs, live UI painted onto model screens, neon tubes + fog path (**parked** — `STAGE_FOG_ENABLED` **`false`**; files stay on disk), Windows-XP-styled load gate, Phase-1 perf governor (motion DPR + adaptive step-down).

**Last verified:** 22 September 2026 (sky fades into the horizon).

Proof of concept — not production-hosted yet. Dev entry: `src/main.js` → `StageExperience`. In development the instance is `window.__stage`.

### Latest changes

Newest first. Prepend here whenever you change the stage or this README (see [§22](#22-keeping-this-document-current)).

| Date | Change |
| --- | --- |
| 22 Sep 2026 | **Sky fades into the horizon:** night sky goes to black from just under the horizon (`SKY_HORIZON_LOW` **−0.03**) to full by **~11°** (`SKY_HORIZON_HIGH` **0.2**). Dome streaks and the **6,000** points fade across that same band. |
| 22 Sep 2026 | **Stars stay in the sky:** the near shell, approach box, and **20–30 m** ring are gone. All **6,000** points sit on the **24 km** shell, at least **4°** above the horizon, so the vignettes are clear when the drop lands. **40%** are still the galactic belt. |
| 22 Sep 2026 | **Milky Way is distant:** galaxy shell is **24,000 m** (`MILKY_WAY_DISTANCE`). The drawn dome is a **40 m** sphere on the camera so it stays inside `CAM_FAR` **220**. A **100 m** camera move shifts the belt by about **0.24°**. Belt point-stars sit on that same shell. |
| 22 Sep 2026 | **Black-hole cursor tracks:** over the disk the blob rides **5** invisible lanes (innermost at **0.38** of the disk radius) and bends with `uCurve`. A still pointer keeps the screen-space flow heading (`BLACK_HOLE_TRACK_ANGULAR_RATE` **9** /s, radial **3.5** /s) instead of coasting vertical. |
| 22 Sep 2026 | **Black-hole trigger spirals:** the close keeps the hold elevation (~**18°** down) and orbits at **2.6 rad/s** (`BLACK_HOLE_ANGULAR_SPEED`) while `r = r0·e^(−1.15 t)`. About one turn before the **2.45 s** cap. The approach is still a straight sightline. |
| 22 Sep 2026 | **Black-hole lens scales with distance:** warp radius is `atan(4.8 m / camera distance)` (`BLACK_HOLE_LENS_WORLD_RADIUS`). Strength is **1** at the hold (**15.81 m**) and about **0.15** at the **108 m** start. Dome and starfield both use it, and both are off after handoff. |
| 22 Sep 2026 | **Milky Way is a star band:** the dome no longer paints a tinted ribbon. Unresolved stars sit on three wavy filaments on the galactic plane, and **40%** of the **6,000** points are the brighter stars in those streaks. Empty sky stays `STAGE_BG`. |
| 22 Sep 2026 | **Black-hole sightline is constant:** approach starts **108 m** out on the hold ray (about **(0, 40.35, −45.54)**) and the spiral closes on that same ray. The disk stays at the rest viewing angle (~**18°** down) for the whole flight. |
| 22 Sep 2026 | **Black-hole rest parallax:** once the approach is within **0.85 m** of the hold, the vignette cursor offset (`maxOffset` **0.245**) fades in and is full by **0.2 m**. The spiral does not use it. |
| 22 Sep 2026 | **Sky haze pulled back:** empty sky matches `STAGE_BG` (**0x070709**). The galactic band is a thin ribbon about **14°** above the horizon. The **4** nebula wisps show only during the black-hole flight. |
| 22 Sep 2026 | **Cursor shears on the accretion disk:** over the disk the liquid cursor elongates along the ring’s +Y spin (plus a **0.34** inward spiral) at strength **0.78**. Fast pointer motion still steers the heading. Off the disk, and after handoff, shear is cleared. |
| 22 Sep 2026 | **Milky Way dome + nebula clouds:** `MilkyWayNebulaShader.js` sphere radius **200** (inside `CAM_FAR` **220**). Galactic band, dust lanes, Hα / OIII. Screen-space lensing strength **0.08** only while the hole is visible. **14** additive cloud planes along the −Z flight (`NebulaCloudCluster.js`). Star count stays **6,000**. |
| 22 Sep 2026 | **Disk pitch reversed:** `BLACK_HOLE_DISK_PITCH` is **−8°** on X. The earlier +8° opened the face the wrong way. |
| 22 Sep 2026 | **Accretion disk is horizontal:** removed the face-on +90° X tilt. Approach eases from **y 8.5** to hold **y 11.2**, looking down onto the disk at **(0, 6.2, −148)**. Spiral height starts at that offset and eases into the disk plane. |
| 22 Sep 2026 | **Animated black hole + quieter sky:** the accretion quad is gone. Runtime GLB `public/assets/models/blackhole/runtime/blackhole.glb` (master stays in `masters/Black Hole/blackhole.glb`, Sketchfab Take 001, **10 s**). Fit diameter **7.2 m**. Stars cut to **6,000**. Brightness twinkle **0.78–1.0** at **5.5 rad/s** (size does not pulse). Points are small (**×120**, clamp **9 px**), normal-blended, tone-mapped. **45%** sit on a full sphere (**48–170 m**), **15%** in the approach box (including below the horizon), and **40%** in a ring **20–30 m** out, **0.45–2.85 m** up, so the landed view under the horizon is not an empty black slab. |
| 22 Sep 2026 | **Procedural starfield replaces the night equirect:** **12,000** points, one draw (`ProceduralStarfield.js`). Shell **48–170 m** plus an approach box. Vertex shader does twinkle, distance size, lensing (`uLensingStrength` **1.8** at the hole), and the behind-camera wrap (**250 m**, flight only). Equirect installer stays on disk and is not mounted. |
| 22 Sep 2026 | **Black-hole intro before the aerial drop:** load on the night sky, ease from **(0, 4.2, −40)** toward hold **z −133** (hole at **(0, 6.2, −148)**), click / Enter spirals (**k 1.15**, **ω 2.8**, cap **2.45 s**), then the existing **13.85 → 2.85 m** height spring. `CameraRig.poseSuspended` while the sequence owns the camera. `?blackhole=0` and reduced motion skip it. |
| 22 Sep 2026 | **Water-cursor rim is GPU-only:** `readPixels` path removed (`sampleRimField` / per-frame `sampleDistance`). `waterCursorRimResolveShader` taps the edge SDF (ε **1.5/256**) and writes blow / slurp / neck / push / tip into a **2×1** float target (`NoBlending`). Blob shader applies the same curves (`blowExponent` **2.8**, `neckPinch` **0.72**, `recoilPushPx` **8**, `slurpBand` **0.032**, `snapThreshold` **0.012**, damp **16 /s**). Gate: stop **0**, settled, pointer live, `workQuality` **≥0.55**, reduced-motion off. Shift+C still sets those uniforms. Do not put a rim `readPixels` back in the frame loop. |
| 22 Sep 2026 | **Edge glitch restored (fixed feature):** removed from `StagePerfGovernor` ladder entirely (no `no-glitch` level). Cost gate = settled + stop 0–3 + cursor near **subject AABB** (was vignette-group NDC ball — missed bust shoulder). `debugEdgeGlitch().gates` logs each condition. FogDepthCapture still on when glitch live. Governor adjusts only DPR / shadow / wet probe. `debugPerf()` reports `motionDprActive` / `effectiveDpr` vs `settledFullDpr`; frameBudget tags `fog-depth` + `edge-sdf` separately. |
| 22 Sep 2026 | **Phase 1 perf + fog park:** `STAGE_FOG_ENABLED` **`false`** — do not construct `VolumetricFogPass` / `VideoFogSystem` (composer = Render → bloom → grain); fog *files* kept — flip **`true`** (+ `STAGE_FOG_MODE`) to restore. Intro bloom return moved to `_tickIntroBloomReturn` (not stuck at 0). `FogDepthCapture` only when edge-glitch cost is live (settled + stop 0–3 + cursor near subject) or fog re-enabled. Motion DPR **~1.0** while `!CameraRig.state.isSettled`, ramp **0.2 s** to full (**1.75** fine / **1.5** coarse) via `StagePerfGovernor` + `_applyRenderScale`. Inactive vignette content on layer **`INACTIVE_VIGNETTE_LAYER` 6** (from+dest stay on 0 during hops). Wet-floor CubeCamera settled-only; neon `castShadow` settled-active only; Duo HUD bloom already holo-gated. Adaptive governor EMA **~20 ms** → DPR → shadow → wet cadence (**not** glitch). Probe: `__stage.debugPerf()` / `frameBudget.dump()`. |
| 22 Sep 2026 | **Case study cursor + full-bleed layout:** UI-chrome suppress restores **system cursor** (water blob stays hidden); overlay is edge-to-edge editorial sheet (Fraunces/Outfit, hero bleed, meta\|lede, stats, responsive sections, More stories). |
| 22 Sep 2026 | **Mail-open glass stays lit:** holo wash kept on while Mail/caseStudy (`DUO_HOLO_MAIL_WASH_SCALE` **0.28**, emissive **0.32**, bloom ×**`DUO_HUD_BLOOM_MAIL_SCALE` 0.18**); PROJECTS/pulse still off — no white blowout. |
| 22 Sep 2026 | **Mail entrance polish:** beams ramp via `--mail-beams` (grow with tip); lead silhouette = exact Duo face → Mail square; panel reveals last (`smoothstep` **0.78→0.98**); `DUO_MAIL_ENTRANCE_SEC` **0.85→0.425** (2×). |
| 22 Sep 2026 | **Duo unhover stagger (100 ms):** leave → PROJECTS glitch-out → clearing holo pulse → fold close (`DUO_UNHOVER_STAGGER_SEC` **0.1**); re-hover cancels. |
| 22 Sep 2026 | **Mail pulse rides beam rails:** entrance echoes morph open Duo **face corners** → Mail **square** (same t on all 4 rails); panel materializes at center (no AABB slide); outline-forward shapes. |
| 22 Sep 2026 | **Mail hologram pulse + edge GlitchQL:** projection hero = Duo-style traveling silhouettes Duo→panel (`DUO_MAIL_PULSE_*`, same **1.6 / 0.55 s** cadence as hover disc); static beams dimmed; panel rim gets cursor-armed RGB/tear edge glitch (`DUO_MAIL_EDGE_GLITCH_*`). |
| 22 Sep 2026 | **Mail beam starts = insight-screen corners:** reverted panel tilt; `_projectInsightFaceCorners` now uses **skinned face-plane UV extents** (not world-AABB half-sizes on an arbitrary basis). Beams pin to the open tilted glass; panel stays flat. |
| 22 Sep 2026 | **Neanderthal jaw-down nod:** `NEANDERTHAL_PITCH` **−20°** on `Sketchfab_model` after Rx−90 (model space); root yaw stays **π** face-out — no root pitch (that banks the eyes). |
| 22 Sep 2026 | **Mail hologram echo alignment (C17):** beams/frustum/echoes share one Duo→panel **corner-pair** list; echoes are SVG quads lerped along those edges (no AABB left/top/width/height). Under face-tip, ghosts sit inside the beam fan. |
| 22 Sep 2026 | **Ishtar +20° CCW again:** `ISHTAR_GATE_YAW` **50→70°**. |
| 22 Sep 2026 | **Ishtar +20° CCW:** `ISHTAR_GATE_YAW` **30→50°**. |
| 22 Sep 2026 | **Neanderthal upright restored:** Sketchfab **Rx−90** required (identity = upside-down); no pitch; `NEANDERTHAL_YAW` **π** face-out; keep latest **×1.15** scale. |
| 22 Sep 2026 | **Neanderthal upright fix +15%:** probe showed runtime already **Y-up**; embedded `Sketchfab_model` **Rx−90** (+ pitch) banked it. Now `alignNeanderthalUpright()` zeroes that node; `NEANDERTHAL_YAW` **0** (face ahead); drop pitch; `EXTRA_SCALE` **×1.15** again. |
| 22 Sep 2026 | **Neander +15% / softer nod; Ishtar −15% + 30° CCW:** `NEANDERTHAL_EXTRA_SCALE` **×1.15**; `NEANDERTHAL_PITCH` **−20→−8°**; `ISHTAR_GATE_EXTRA_SCALE` **1.1→0.935**; `ISHTAR_GATE_YAW` **+30°**. |
| 22 Sep 2026 | **Ishtar Gate on shelf:** deck **0.553 m** next to cuneiform (side **0.16** / back **0.06**), height **22 cm** × **1.1** × CRT×0.5. Runtime `ishtar-gate/runtime/` via `scripts/rebuild-ishtar-gate-runtime.mjs` (resize→webp→meshopt; master untouched). |
| 22 Sep 2026 | **Mail hologram beams polish:** soft cyan core+halo shafts (`mix-blend: screen`), faint frustum fill; beams bind to **insight face corners** (not AABB); echoes = outline-only cyan ghosts (no solid cards). |
| 22 Sep 2026 | **Neanderthal pitch in model space:** nod **−20°** on `Sketchfab_model` after −90° upright (root-level pitch banked the eye line). |
| 22 Sep 2026 | **Neanderthal forward pitch −20°:** `NEANDERTHAL_PITCH` **−20°** (local −X nod after yaw). |
| 22 Sep 2026 | **Neanderthal stand visible + face flip:** `_compileThenShow` / `_tickModelReveal` include `neanderthalStandRoot` (was stuck on GPU hold); `NEANDERTHAL_YAW` **−40+180°** again. |
| 22 Sep 2026 | **Neanderthal −15% + spine stand:** `NEANDERTHAL_EXTRA_SCALE` **×0.85** (was **1.15×0.75**); same Lucy pawn stand (**10 cm**, engage **0.52**); upright face **`NEANDERTHAL_YAW` −40°** (dropped +180°). |
| 22 Sep 2026 | **Olmec Head −15%:** `OLMEC_HEAD_EXTRA_SCALE` **1.1→0.935** (24 cm × **0.935** × CRT×0.5). |
| 21 Sep 2026 | **Flute +45° CW:** `DIVJE_BABE_FLUTE_YAW` **π/2−75°** (was −30°). |
| 21 Sep 2026 | **Mail hologram beams + echo:** always **4** corner→corner Duo→panel beams (per-line `userSpaceOnUse` gradients); **3** frosted ghost slabs lerped in the frustum (blur + opacity ramp Duo→panel). |
| 21 Sep 2026 | **Water cursor vs overlays:** blob shrinks/hides (`setUiChromeSuppressed`) while pointer is over Mail panel or case-study modal; returns to blob on open stage. |
| 21 Sep 2026 | **Duo Mail chrome + sync:** title **Dane's Projects**; traffic lights **14px**, all three close (✕ removed); panel emerges from Duo → viewport center; glass capture upright (`texture.rotation` **0**), no debounce, MutationObserver/scroll keep glass locked. |
| 21 Sep 2026 | **Flute −30° CW; Neanderthal −25% + 180°:** `DIVJE_BABE_FLUTE_YAW` **π/2−30°**; `NEANDERTHAL_EXTRA_SCALE` **×0.75**; `NEANDERTHAL_YAW` **−40+180°**. |
| 21 Sep 2026 | **Duo Mail glass shows Mail UI:** live `.duo-mail` is **`position:fixed`** + holographic — html-to-image painted the panel into a corner of a light fill → white glass. Capture now uses an offscreen opaque in-flow clone; `DUO_SCREEN_EMISSIVE_MAIL` **0.28**; HUD bloom ×**0.15** while projecting; slight paper darken on capture. Live overlay unchanged. |
| 21 Sep 2026 | **Bottom shelf L→R Neander / flute / Lucy:** deck **0.163 m** — Neanderthal (side **−0.16**, **20 cm** × **1.15**, yaw **−40°**), Divje Babe flute (side **0.02**, diameter **3.5 cm** × **1.15**, yaw **π/2** along board), Lucy (side **0.18**, stand). Runtimes via `rebuild-neanderthal-runtime.mjs` (simplify→…) / `rebuild-divje-babe-flute-runtime.mjs`; masters untouched. |
| 21 Sep 2026 | **Lucy face 75° CW:** `LUCY_YAW` **−60→−75°** (+15° CW, shelf-relative). |
| 21 Sep 2026 | **Ptolemy seat + lighting:** side **0.08** / back **−0.06** (off front edge); drop special emissive/gray polish — same `forceLit` path as Olmec/Venus (scene neon only). |
| 21 Sep 2026 | **Ptolemy readability + mount fix:** Intro waits for archaeology load settle; props can commit after shelf; empty GLB warns + skips. Rebuild: `node scripts/rebuild-ptolemy-runtime.mjs`. |
| 21 Sep 2026 | **Ptolemy on top shelf:** black bust (pedestal stripped at export) on deck **1.697 m**, same lateral as Trojan Horse (side **0.14**); height **22 cm** × **1.05** × CRT×0.5. Runtime `ptolemy/runtime/ptolemy.glb` via `scripts/rebuild-ptolemy-runtime.mjs` (Blender trim **Y 0.805** → resize→webp→meshopt; master untouched). Zoom edge-glitch includes Ptolemy. |
| 21 Sep 2026 | **Cuneiform tablet under olive boat:** deck **0.553 m** (side **−0.2**); upright on procedural easel (lean **14°**), face toward camera (`tipTablet`). Runtime via `scripts/rebuild-cuneiform-tablet-runtime.mjs` (simplify→resize→webp→meshopt; master untouched). |
| 21 Sep 2026 | **Trojan face 35° CCW:** `TROJAN_YAW` **+35°** (shelf-relative). |
| 21 Sep 2026 | **Lucy spine-mount stand:** taller rod (**10 cm** × shelf scale) with pin tip into foramen; engage **0.52** (stem enters skull base — no hover). |
| 21 Sep 2026 | **Horse ↔ Olmec swap + Olmec face 20° CW:** Trojan side **0.14**, Olmec side **−0.12**; `OLMEC_YAW` **−20°**. |
| 21 Sep 2026 | **Olmec Head on shelf:** next to Trojan Horse on deck **1.312 m** (side **0.14**, height **24 cm** × **1.1** × CRT×0.5). Runtime `olmec-head/runtime/` via `scripts/rebuild-olmec-head-runtime.mjs` (resize→webp→meshopt; master untouched). |
| 21 Sep 2026 | **Lucy face 60° CW:** upright yaw **`LUCY_YAW` −60°** (shelf-relative). |
| 21 Sep 2026 | **Lucy upright on shelf axes:** drop Z-roll / extra yaw — head upright, yaw matches shelf (`SHELF_YAW` only). Still bottom deck under Venus. |
| 21 Sep 2026 | **Lucy → bottom shelf (under Venus); Antikythera parked:** Lucy on deck **0.163 m**, side **0.18** (Venus lateral), back **0.12**, Z-roll **−40°** (40° CW). Antikythera not loaded (runtime kept). |
| 21 Sep 2026 | **Duo Mail a11y type:** body/summary/CTA **16px**, list subject **16px**, meta/from/snippet/category **14px**, preview title **18px** (was 9–12px). Min panel height **480**. |
| 21 Sep 2026 | **Duo entrance 800 ms + heavy plant:** `DUO_ENTRANCE_SEC` **0.8**; power4 rise + **4%** momentum peak (`DUO_ENTRANCE_OVERSHOOT`) + hard settle (last **14%**) — replaces floaty back.out. |
| 21 Sep 2026 | **Duo entrance overshoot half + snappy settle:** `DUO_ENTRANCE_BACK` **1.45→0.725**; settle squeezed into last **`DUO_ENTRANCE_SETTLE_FRAC` 0.16** of the 1.4 s (no apex hang). |
| 21 Sep 2026 | **Duo entrance = 1400 ms end-to-end:** `DUO_ENTRANCE_SEC` **1.4** covers rise + overshoot settle to rest; `DUO_IDLE_HOLD_SEC` **0** (no pad). Bob/spin soft-fade still starts at `live`. |
| 21 Sep 2026 | **Edge glitch restore (9/15–9/16 beauty tears):** live pass is **`EdgeGlitchPass`** again — beauty-buffer horizontal tears + RGB split on L1 diamond (`intensity` **0.16**, `rgbSplit` **0.042**, `tearBands` **88**, spans **0.028 / 0.016 / 0.016**, `glitchArmOuter` **0.06**). Soft occ + proximity kept. `SubjectDissolvePass` retired (file kept, unused). Shift+G retitled **EDGE GLITCH**. |
| 21 Sep 2026 | **Dissolve outside trails back:** allow `spanOut` (**0.042**) fading scan-slices past the alpha edge (sample inward → fade to black). Inside stays darken-only. Narrow lag so trails stay a strip, not a solid tip. |
| 21 Sep 2026 | **PROJECTS glow readable:** label plane **Normal** blend (was Additive on Additive wash); canvas glow **0.95→0.32** / blur **0.08→0.028**; HUD bloom **0.7→0.42**, threshold **0.28→0.4**. |
| 21 Sep 2026 | **Lucy on shelf (above Antikythera):** A. afarensis cranium + mandible on board **0.553 m** (`SHELF_DECK_LUCY`). Height **17 cm** × **1.2** × CRT×0.5. Runtime `lucy/runtime/lucy.glb` via `scripts/rebuild-lucy-runtime.mjs` (resize→webp→meshopt; master untouched). Zoom edge-glitch includes Lucy. Capture `public/debug/archaeology-lucy-shelf.png`. |
| 21 Sep 2026 | **Dissolve no-triangle:** destructive only (darken / eat into subject). Soft strip field; never paint beauty into dilated depth/SDF void — that solid tip was the wedge. |
| 21 Sep 2026 | **Subject dissolve (dying transmission):** REPLACE pixel-corruption `EdgeGlitchPass` with **`SubjectDissolvePass`** — irregular horizontal scan-slices shear off + fade **TO BLACK**, sparse dropout + sync roll, one thin neon dissolve-line (`dissolveLine` **0.35**, cap **0.22**). Knobs: `shearPx` **28**, `fadeGain` **1.15**, `dropout` **0.08**, `syncRollPx` **4**, `bandCount` **42**, `glitchArmOuter` **0.07**. No `revealBoost` / RGB split / fringe flood. Soft strip + occ + proximity. Subjects: Bust / PC / Sidekick / Archaeology. Reduced-motion / workQuality **&lt;0.55** → off. Shift+G. Verify: `node scripts/verify-subject-dissolve.mjs`. |
| 21 Sep 2026 | **Olive boat forward:** `PROP_BACK_OLIVE_BOAT_M` **+0.04** (was Venus inset **−0.06**) — closer to shelf front. |
| 21 Sep 2026 | **Olive wood boat on shelf:** Archaeology Venus deck gets boat opposite Venus (`PROP_SIDE` **−0.2 m**, height **18 cm** × **1.15** × CRT×0.5). Runtime `olive-wood-boat/runtime/` via `scripts/rebuild-olive-wood-boat-runtime.mjs` (simplify **0.05** → resize → webp → meshopt; master untouched). |
| 21 Sep 2026 | **Apple yaw −335°:** `APPLE_YAW_DEG` **−332→−335** (−3°, top-down). |
| 21 Sep 2026 | **Apple yaw −332°:** `APPLE_YAW_DEG` **−325→−332** (−7°, top-down). |
| 21 Sep 2026 | **Apple yaw −325° CCW:** `APPLE_YAW_DEG` **−327→−325** (+2° CCW, top-down). |
| 21 Sep 2026 | **Apple yaw −327° CCW:** `APPLE_YAW_DEG` **−329→−327** (+2° CCW, top-down). |
| 21 Sep 2026 | **Apple yaw −329° CCW:** `APPLE_YAW_DEG` **−331→−329** (+2° CCW, top-down). |
| 21 Sep 2026 | **Lantern semi-opaque glass:** panes opacity **0.72** / roughness **0.88** (transparent frosted, not milk-opaque). |
| 21 Sep 2026 | **Lantern heavy frost:** glass opaque milk (`transparent` false, roughness **1**, warm albedo) — on-state = soft emissive wash, not see-through panes. |
| 21 Sep 2026 | **Lantern grass clear:** hard cull + ground hole under lantern foot **`GRASS_TUBE_CLEAR_M` 0.55 m** (was tall tufts into the thin neon tube). |
| 21 Sep 2026 | **Lantern frosted glass:** panes opacity **0.88** / roughness **0.82** (warm emissive flicker); procedural flame mesh hidden — soft chamber core/halo only. |
| 21 Sep 2026 | **Lantern −20% scale:** planted height **`BUST_LANTERN_HEIGHT_M` 2.48** (was 3.1). |
| 21 Sep 2026 | **Lantern key spill:** cage meshes `castShadow` **false** so the in-chamber PointLight isn’t self-occluded; intensity **110** / distance **9** / decay **1.75**; hotter glass emissive + stronger floor pool. |
| 21 Sep 2026 | **Lantern 2× + soft fire:** planted height was **3.1** (from 1.55); fire = camera-billboard teardrop SDF + ember core + halo. |
| 21 Sep 2026 | **Lantern warm fire glow:** Bust lantern drops neon scroll; warm PointLight **`#ffa45a`** seated in the flame chamber; glass emissive + floor pool track the flicker. |
| 21 Sep 2026 | **Bust neon → lantern:** stop 0 `neonProp: "lantern"` plants `public/assets/models/lantern/runtime/lantern.glb` (**2.48 m**, XZ **(2.2, 0.85)**) instead of the 4 m cylinder. Rebuild: `node scripts/rebuild-lantern-runtime.mjs` from `masters/Lantern/lantern.glb` (masters untouched). |
| 21 Sep 2026 | **Duo hold→live shoot-off:** handoffLog proved `root`/`pop`/`iso`/`scale` stable; first live frame exploded **pivot/spin** via uncapped clock `dt` (explicit-Euler idle springs). Cap tick at **`DUO_TICK_DT_MAX` 1/20**. Probe: `node scripts/verify-duo-handoff.mjs` → `public/debug/duo-handoff.json`. |
| 21 Sep 2026 | **Duo PROJECTS pad + dark pulse:** font **0.175** / label scale **0.86** / draw scale **0.92** so the end “S” clears the plane; pulse disc is a darker teal of the emissive wash (no hot white); glyph no longer inverts/darkens as the disc passes. |
| 21 Sep 2026 | **Duo fixed container (centered open/closed):** shared seat scale **0.288** (−20% from **0.36**); container bottom-right inset **`DUO_SCREEN_MARGIN_PX` 85**; closed + open stay centered via `pop` correction (max AABB half-extents). No idle→open NDC/scale jump. |
| 20 Sep 2026 | **Lawn blade contact shadows:** active-stop neon `PointLight` now `castShadow` (map **1024**, bias **−0.0008**, normalBias **0.035**, radius **1.8**, near **0.06**, far = `NEON_LIGHT_DISTANCE` **2.75**) — POV spot alone never lit the dirt under neon. Blades use wind-matched `customDistanceMaterial` (plus existing depth for the spot). `GRASS_GROUND_COLOR` **0x2a5224** (was near-black **0x081806**) so contact shade reads. |
| 20 Sep 2026 | **Bust grass casts shadows:** lawn blade `InstancedMesh` `castShadow` **true** (wind-matched `customDepthMaterial` + `shadowSide` DoubleSide) into the POV spot map; ground still receives. |
| 20 Sep 2026 | **Duo Mail glass readable + iPad proportions:** on-glass capture full-strength, emissive **0.72**, wash ×**0.18** while projecting (pulse off) so display clearly shows the Mail UI; overlay larger (~62–78% viewport H) with list/preview **32%/68%** (iPad Mail landscape ≈30/70). |
| 20 Sep 2026 | **Duo Mail holographic glow:** panel glass more translucent with cyan rim + outer emissive bloom (soft breathe); list/preview panes less opaque so it reads as projected light. |
| 20 Sep 2026 | **Duo Mail projection beams + glass cool-down:** panel sits clear of the phone (left/above) with 3 subtle cyan beams Duo→panel; insight Mail emissive **0.92→0.38**, capture dimmed, HUD bloom ×**0.45** while projecting. |
| 20 Sep 2026 | **Duo interior Mail = live overlay capture:** insight emissive is `html-to-image` of the DOM Mail panel (same pixels); exterior lock screen **not** rotated. Interior texture still **π** for UV. |
| 20 Sep 2026 | **Duo screen 180° + Mail 1.4∶1:** exterior + on-glass Mail textures rotate **π** (`center` 0.5); Mail overlay / facsimile load at **`DUO_MAIL_ASPECT` 1.4** (resize keeps aspect). |
| 20 Sep 2026 | **Duo Mail = overlay toggle (no seat move):** phone stays at idle NDC/scale when Mail opens; click Duo to open/close, click outside panel (or ✕ / Esc) to dismiss. Overlay panel alone captures pointer so Duo stays hittable. |
| 20 Sep 2026 | **Duo Mail face-tip + on-glass projection:** clicking PROJECTS tips far edge up (`DUO_ISO_MAIL_FACE` **0.52**) so insight faces POV; faint Mail UI on insight emissive (`duoMailScreen.js`, emissive **0.92**) under holo wash — reads as projecting the DOM overlay; PROJECTS label hides while Mail is open. |
| 20 Sep 2026 | **Duo Mail drag/resize + pulse shrink:** Mail panel **95%** opacity with cyan emission tint; drag chrome / edge-resize; stays put until backdrop/close (then Duo resumes spin). Pulse disc **~60%** subtler (`OPACITY` **0.54**, `SLAB_BOOST` **1.28**) and shrinks as it rises (`SCALE` **1.05** → `SCALE_END` **0.42**). |
| 20 Sep 2026 | **Duo pulse = traveling energy disc:** coplanar bright ring mesh rises along screen normal (`DUO_HOLO_PULSE_MAX_T` **0.62**, opacity **1.35**, scale **1.05**, **0.55 s** / **1.6 s** period); nearby slabs boost (`SLAB_BOOST` **1.7**). PROJECTS darkens when disc nears `LABEL_T` **0.14**. Restores visible pulse after opacity-only boost was invisible. |
| 20 Sep 2026 | **Duo pulse = volume boost (no fake band):** energy pulse only scales wash/slab opacity (`DUO_HOLO_PULSE_BOOST` **1.75**); canvas band removed. Glow toned down (wash **0.42**, softer stack, glass **0.35**, bloom **0.7**) so PROJECTS reads; glyph still darkens at pulse peak. |
| 20 Sep 2026 | **Duo PROJECTS readable + pulse/glitch:** label billboarded (coplanar was edge-on when flat); digital tear glitch restored; energy pulse every **1.6 s** (darkens glyph as band passes); Duo `root.visible=false` from construct until `reveal()`. |
| 20 Sep 2026 | **Duo holo coplanar (no billboard):** killed camera-facing plume (that floated as a separate card). Wash + **6** dense slabs + PROJECTS label all share the insight face basis and step out along the screen normal; skinned face measure for flush attach. |
| 20 Sep 2026 | **Duo holo volume stack:** coplanar full-face wash + **4** soft slabs along screen normal (fills depth out of the glass) + billboard PROJECTS plume. Reads as emerging from the whole display, not a floating card. |
| 20 Sep 2026 | **Duo holo flush to glass:** nest plume (`OFFSET` **−0.008**, rise **0.78**) + shorter height **1.15** + `depthTest` off so the base isn’t clipped into a floating gap; hotter/wider base glow merges with the screen. |
| 20 Sep 2026 | **Duo insight emissive cool-down:** open glass **`DUO_SCREEN_EMISSIVE_OPEN` 3.2 → 0.48** + softer cyan **`DUO_SCREEN_INSIGHT_COLOR` 0x5a8fa8** — flat map-less emissive at 3.2 was blowing the phone white/blue; plume + bloom keep the hologram. |
| 20 Sep 2026 | **Duo holo plume (no mirror):** sheet anchored at insight glass (geom y−0.5→0), rises HUD **+Y**; soft vertical fade + side vignette (no hard rect/scanlines). PROJECTS narrower (**font 0.13**, track **0.002**) near tip fade (`TEXT_Y` **0.22**). Insight glass drops PROJECTS emissiveMap (soft cyan only). FrontSide. Width **0.92** / height **1.85**. |
| 20 Sep 2026 | **Duo lock clock text-only:** dropped frosted panel — date/time overlay the wallpaper only. Type larger: time **`DUO_EXTERIOR_TIME_FONT` 0.2**, date **0.055**. |
| 20 Sep 2026 | **Duo open orientation — measured, not Euler:** stopped guessing `DUO_ISO_OPEN` Rx/Ry. At load, fold open + PCA `screen_lg` axes → bake quat mapping **normal→+Y**, **bottom→+Z**, **right→+X**, then tip **`DUO_ISO_OPEN_TIP` −0.18**. Root cause: basis locked for closed exterior; fold flips insight. No GLB re-export. Probe `debugDuo().openIsoDebug`. |
| 20 Sep 2026 | **Duo exterior lock clock:** date above time (`Thur Apr 21`), time **no AM/PM**, frosted overlay panel behind clock. Wallpaper still `/assets/duo/exterior-lock.jpg`. |
| 20 Sep 2026 | **Duo exterior lock screen:** closed **`screen_xm`** shows desert wallpaper (`/assets/duo/exterior-lock.jpg`) + live locale date/time (`duoExteriorScreen.js`, canvas **512×720**, emissive **`DUO_SCREEN_EMISSIVE_EXTERIOR` 1.05**). Open insight still PROJECTS hologram only. |
| 20 Sep 2026 | **Duo open project UP:** `DUO_ISO_OPEN` **Rx(+π/2+0.18) + Ry(−π/2)** — open insight faces opposite the closed exterior; prior −π/2 pitch projected **down**. Bottom edge still toward cam; L/R preserved. |
| 20 Sep 2026 | **Duo open bottom-to-cam:** `DUO_ISO_OPEN` **Rx(−π/2−0.18) + Ry(+π/2)** — flat screens UP, then 90° yaw so the **short bottom edge** aims at the camera (was long-side/tent facing away). |
| 20 Sep 2026 | **Duo 3-phase entrance (visible handover):** `entering` rise from **−1.15** with **back.out(1.45)** overshoot (**1.2 s**) → `holding` frozen **0.55 s** → `live` bob-in **0.85 s**, then spin-in after **0.35 s** delay (**1.1 s**). Console logs each phase. Verify `node scripts/duo-entrance-handoff-verify.mjs`. |
| 20 Sep 2026 | **Duo open projects UP again:** `DUO_ISO_OPEN.z` **π → π/2** (the extra +90° CCW had aimed the hologram cam-left). |
| 20 Sep 2026 | **Duo entrance→live handoff (no jerk):** rise Y uses **`power3.out`** (no back.out overshoot). Single dt `_idleIn` (`_advanceIdleIn`) in entering + live — no tween.progress fade. `finishEntrance` zeros `entranceY` without ticking idle; pivot always `entranceY+idle.y`. Probe `handoffLog`; verify `node scripts/duo-entrance-handoff-verify.mjs`. |
| 20 Sep 2026 | **Duo open Z +90° CCW:** `DUO_ISO_OPEN.z` **π/2 → π** (extra quarter-turn CCW in hover/open). |
| 20 Sep 2026 | **Duo drop Projects tooltip; bold hologram:** removed DOM `.duo-fab-tooltip`. PROJECTS canvas type is **800** weight at **`DUO_PROJECTS_FONT` 0.2** with dark+cyan stroke; sheet opacity **0.78**, scale **1.14**. |
| 20 Sep 2026 | **Duo open faces UP:** open insight at yaw 0 points cam-right (+X); iso now rolls **`DUO_ISO_OPEN` z π/2** (+X→+Y) with tip **x −0.22** (top recedes). Pitch-only open couldn’t lift a +X normal. |
| 20 Sep 2026 | **Duo flat tip-away + holo unmirror:** open iso **−π/2 − 0.2** (top edge recedes); **`DUO_HOVER_FACE_YAW` 0** (nonzero yaw was rolling the flat pitch on-edge). Holo billboard uses `makeBasis` (no lookAt+π) so PROJECTS isn’t mirrored. |
| 20 Sep 2026 | **Duo flat-open + holo sync:** open iso tilts back to nearly flat (`DUO_ISO_OPEN` x **−1.36**) so insight faces up and hologram projects UP. Emissive/holo gated on **fold** only (not hover ramp); insight at **`DUO_HOVER_OPEN_AT` 0.72**; hologram at **`DUO_HOLO_OPEN_AT` 0.88** + **`DUO_HOLO_DELAY_SEC` 0.14**. |
| 20 Sep 2026 | **Duo hologram billboard:** PROJECTS sheet rises along insight normal (`DUO_HOLO_SHEET_OFFSET` **0.055**) then faces the HUD camera (not coplanar with the glass) so text stays upright/legible. Opacity **0.42**, scale **1.08**. |
| 20 Sep 2026 | **Duo seamless idle-in + face yaw:** entrance no longer hard-cuts into spin — idle spin/bob fades in from **`DUO_IDLE_IN_AT` 0.48** of the rise tween (catch-up **`DUO_IDLE_IN_SEC` 0.55**). Open face hold uses **`DUO_HOVER_FACE_YAW` −π/2** (was 0 → screens faced cam-right). |
| 20 Sep 2026 | **Duo hover face-hold:** on hover, axial spin halts and eases to **`DUO_HOVER_FACE_YAW` 0**; iso opens toward camera (`DUO_ISO_OPEN`); bob continues. Unhover resumes spin. Z-roll pulse retired. |
| 20 Sep 2026 | **Duo hologram + rise entrance:** entrance rises from **`DUO_ENTRANCE_FROM_Y` −0.72** (off-screen below) with fade + `back.out(1.55)`. Open insight: HUD **UnrealBloom** (`duoHudBloom.js`, strength **0.9**) + additive projection sheet (`DUO_HOLO_SHEET_OPACITY` **0.2**). Closed screens stay dark. PROJECTS glitch still 3–7 s. |
| 20 Sep 2026 | **Duo screen power gate:** closed → only exterior **`screen_xm`** lit; open → only large insight **`screen_lg`** lit (`DUO_SCREEN_EXTERIOR` / `DUO_SCREEN_INSIGHT`). Other screen meshes stay off. |
| 20 Sep 2026 | **Duo drop+fade entrance:** vertical drop from **`DUO_ENTRANCE_DROP_Y` 0.62** with fade-in; GSAP **`back.out(1.55)`** overshoot then bob into rest over **0.95 s**. Orientation frozen; spin starts at `live`. Probe `entranceMovers` → `entranceY` + `entranceOpacity`. |
| 20 Sep 2026 | **Duo entrance = pure scale:** load bakes closed pose (`_bakeClosedPose`). `reveal()` never re-runs `_lockModelBasis`/`_fitClosedPose` (seated scale at `ENTRANCE_FROM` was &lt;0.01 → false “repair” twisted basis on frame 1). GSAP scales only; `__stage.debugDuo().entranceMovers` must show `modelScale` only. |
| 20 Sep 2026 | **Duo axial spin (not orbit):** hierarchy `pivot(bob)→iso(tilt)→spin(yaw)→basis`. Spin is under iso so Y = phone-local up. COM tracked via `_comLocal` so seat/entrance scale can’t drift the axis (`position = −com×scale`). Probe `__stage.debugDuo()` → `spinResidual` ≈ 0. |
| 20 Sep 2026 | **Duo Earth-spin + PROJECTS emissive:** pivot = phone COM (iterative basis center). Idle = axial `DUO_SPIN` **0.48** + bob + tiny nutation (no lean cone). Hover hysteresis enter **0.1**/leave **0.2** s + sticky pad **28** px. Spin stops when open. Open screens = strong emissive (`DUO_SCREEN_EMISSIVE_OPEN` **2.4**) + CanvasTexture **PROJECTS** with glitch every **3–7** s. |
| 20 Sep 2026 | **Duo on-screen seat:** fit/center now samples skinned verts in **basis** space (mesh-local×scale was yeeting the phone off-frustum). Idle NDC **0.72 / −0.55**, scale **0.36**. Probe `__stage.debugDuo()`. |
| 20 Sep 2026 | **Duo entrance freeze:** orientation locked (iso/pivot frozen) while GSAP `power3.out` scales `model` only (`DUO_ENTRANCE_FROM` **0.22** → 1 over **0.72 s**). No fold-mixer refresh mid-grow (was the jump/twitch). Orbit starts only after `live`. |
| 20 Sep 2026 | **Duo basis lock + GSAP grow/pop:** one-time `basis` tipStand (tallest→+Y, exterior→+Z); `iso` is pitch-only (no π yaw). Entrance = GSAP `back.out(1.7)` on `pop` scale only; orbit after `live`. Root scale stays **1** (skinned-mesh safe). |
| 20 Sep 2026 | **Duo cursor hit fix:** hit proxy was built at entrance scale **0** (degenerate AABB). Rebuild at unit scale; hover uses screen-space FAB bounds + **`DUO_HIT_PAD_PX` 14**. |
| 20 Sep 2026 | **Duo entrance = scale pop only:** lock closed pose during enter (no orbit/fold/hover). Grow from **`DUO_ENTRANCE_FROM` 0.12** → peak **1.1** → 1 over **0.72 s**, then orbit starts. Zero-scale skinning was flipping the mesh. |
| 20 Sep 2026 | **Duo orbit wobble + hover pulse + Projects tooltip:** idle pitch/roll nutate (`DUO_AMP_PITCH` **0.11**, `DUO_AMP_ROLL` **0.14`) + slow lean precession (`DUO_TILT_PRECESS` **0.55**, `DUO_TILT_LEAN` **0.14`). Hover pulse-spins **+90°** Z in **`DUO_HOVER_SPIN_SEC` 0.28** (ease-out back). Tooltip copy **Projects**. |
| 20 Sep 2026 | **Duo visible after intro:** Stage calls `duoFab.reveal()` when `introComplete` + GLB ready (`_tryRevealDuo`). Entrance grow/pop (`DUO_ENTRANCE_SEC` **0.68**, peak **1.16** @ **0.7**) then idle bob + `DUO_PLANET_SPIN` **0.42**. Root stays hidden until reveal; hit-test gated on `isLive`. |
| 20 Sep 2026 | **Dot nav page-centered:** `#dots` absolute `left: 50%` / `translateX(-50%)` at bottom (not grid cell next to caption). |
| 20 Sep 2026 | **Duo rigged fold (not Alternate demos):** runtime from `masters/iPhone Duo/iphone-duo_glb.zip` → `iphone_duo_rigged_animated.glb`. Idle scrubs `ArmatureAction` to **`DUO_FOLD_TIME_CLOSED` 2.5s** (`_folded`); hover/Mail → **`DUO_FOLD_TIME_OPEN` 0.042s** (`_opened`). Keeps `Armature` only (hides `_off`/`_screen`). Alternate Sketchfab roots were partial-open only. |
| 20 Sep 2026 | **Duo closed corner + top chrome:** ortho HUD (`DUO_IDLE_NDC` **0.92/−0.9**); idle = closed `_33` face-on exterior (`DUO_ISO_CLOSED` y **π**, screens hidden); hover = Z-spin + open `003_135` + screens; Scroll/Swipe + fog/edge/water/lawn tuners **top-right**. |
| 19 Sep 2026 | **Duo half-size + hover open:** idle/open scale **0.425 / 0.6** (½ prior). Closed by default (`003`); hover = **Z-spin + tent open** (`iphone-duo_33` at `DUO_HOVER_OPEN_AT` **0.35**); click still opens Mail. |
| 19 Sep 2026 | **Duo FAB polish:** closed default = `iphone-duo003_135`; idle + hover spin on **Z-roll** (`DUO_AMP_ROLL` **0.14**, `DUO_HOVER_ROLL` **+90°**); real `screen*` panels only get display emissive — camera-island `screen` mats neutralized (was wallpaper on lenses/interior). |
| 19 Sep 2026 | **Duo FAB HUD fix:** dedicated HUD scene + camera + key/fill/rim lights (drawn after composer via `clearDepth`); semi-isometric product pose; GLB fold variants — **closed only** (`iphone-duo_33`); mid/open roots stay hidden. Not parented to the stage camera anymore. |
| 19 Sep 2026 | **Duo FAB → Mail → case study:** screen-space iPhone Duo in bottom-right (`DuoFabSystem`, camera-parented). Idle bob + hover “See Projects” tooltip + +90° spin @ 2×. Click opens DOM Apple Mail (two-column) with 5 case studies; **Open Case Study** → full-screen modal (Back → Mail, Close → Idle). Mute FAB moved **top-right**. Runtime `public/assets/models/iphone-duo/runtime/iphone-duo.glb` from `masters/iPhone Duo/Alternate/` via `scripts/rebuild-iphone-duo-runtime.mjs`. Images via `scripts/fetch-case-study-images.mjs` → `public/assets/case-studies/*.webp`. Content: `src/content/caseStudies.js`. |
| 19 Sep 2026 | **Archaeology shelf seat restore:** put ladder back to arch-era `SHELF_SIDE` **−0.9** / `SHELF_FORWARD` **0.305** (had been moved to **−0.281 / 3.2** when arch was ditched). Neon stays on; arch/portal still gone. |
| 19 Sep 2026 | **Archaeology ditch arch + restore neon:** remove stone arch + Giza portal (`ArchPortal`) from stop 3. Stop-3 neon tube / PointLight / floor glow back on (no `setPortalReplacesNeon(3)`). Caption: shelf finds under neon. Capture `public/debug/archaeology-neon-restored.png`. |
| 19 Sep 2026 | **Egypt portal Sky 16 HDRI:** `masters/Sky's/20Sky-HDRI/Sky 16.hdr` → `public/assets/textures/skybox-egypt/equirect.webp` via `scripts/rebuild-skybox-egypt-runtime.mjs` (master untouched). Tunnel L/R/ceiling/back sample the equirect by **view direction** (`ArchPortalEgyptSkyMaterial`, gain **1.85**) so the aperture reads as one day sky. Capture `public/debug/archaeology-giza-portal.png`. |
| 19 Sep 2026 | **Giza portal full-aperture tunnel:** day-blue L/R walls + ceiling + back at the jambs so stop-3 can’t see the night stage through the opening (a distant sky card foreshortened into a center strip). Sand floor + lower banks; black shells **outside** the stone only. TipStand **+Z π/2**, ×**0.026** at **z 3.6**. Capture `public/debug/archaeology-giza-portal.png`. |
| 19 Sep 2026 | **Giza pyramids tipStand +Z π/2:** runtime GLB is tip-along-**X** (square bases faced the camera as vertical walls). `ArchPortal` tips **+Z π/2** onto +Y, then yaw **0.2π**, scale **×0.028** at **z 3.4**. Dropped L/R clip planes (they silhouetted as a vertical strip from stop-3); near/floor/top clips + exterior fins remain. Local Lambert sun/fill for face volume. Capture `public/debug/archaeology-giza-portal.png`. |
| 19 Sep 2026 | **Giza portal booth + pyramid tipStand:** Egypt in a black diorama booth (L/R/ceiling + exterior fins) so oblique stop-3 can’t see past the pillars. Giza GLB tipStand **−X π/2** (native short-Y/long-Z) + yaw on a pivot. Sand fills booth floor; L/R clips as backup. Capture `public/debug/archaeology-giza-portal.png`. |
| 19 Sep 2026 | **Giza portal Sand Dunes + arch floor spill:** desert runtime from `masters/Desert/Alternative/Sand Dunes` (`scripts/rebuild-desert-sand-dunes-runtime.mjs` → ~**36×9×36** m slab + `public/assets/textures/desert-sand/basecolor.webp`). Egypt in **arch-local meters** (no inverse-scale). Tight diorama behind doorway (oblique stop cam): sand plane **7×12**, pyramids ×**0.07** at **z 4.5**, day card at **z 7**. Floor pool = `ShapeGeometry` arch (bright at threshold via vertex colors). Local clipping retired (carved sky). Capture `public/debug/archaeology-giza-portal.png`. |
| 19 Sep 2026 | **Giza portal review follow-ups:** drop Egypt Ambient/Directional (MeshBasic corridor — they washed layer-0 props); hide `portalWorld`/`backplate` from FogDepthCapture; latch Spot/pool with neon content hysteresis (ON **>0.08** / OFF **≤0.02**). Edge-glitch already skips `arch-portal-*`. Stencil clear kept on composer for any future subpass. |
| 19 Sep 2026 | **Giza portal = clipped 3D corridor:** Egypt (desert + pyramids + day backdrop) lives under the arch in the beauty pass — shared main cam, real depth. Local clipping planes (portalWorld meters) keep the corridor inside the opening (stencil abandoned — unreliable with EffectComposer/ANGLE). Shelf **+4 ft** toward arch → `SHELF_SIDE` **−0.9** (from **−2.119**). Daylight Spot/pool unchanged. Capture `public/debug/archaeology-giza-portal.png`. |
| 19 Sep 2026 | **Giza portal = real depth window:** beauty `PortalAwareRenderPass` stamps stencil → depth-clears the opening → draws Egypt on `ARCH_PORTAL_LAYER` **5** (shared main cam). Fixed desert seat: near edge (`max.z`) **2.4 m** behind doorway (AABB-center Z had shoved dunes ~100 m in front → flat sand wall). Desert XZ ×**2.0** / Y ×**0.42** (flatten so dunes don’t fill the arch), pyramids ×**0.38** at **z −72**, sky r **280**. Inactive dark backplate. Shelf still **−2.119 / 0.305**. Capture `public/debug/archaeology-giza-portal.png`. |
| 19 Sep 2026 | **Giza portal = true 3D stencil window:** Egypt (desert + pyramids + day sky) lives in the main scene under the arch, masked by a stencil opening — shared main camera = real depth / horizon (no RT billboard). Shelf **+4 ft** toward arch → `SHELF_SIDE` **−2.119**, `SHELF_FORWARD` **0.305**. Daylight Spot/pool unchanged. Capture `public/debug/archaeology-giza-portal.png`. |
| 19 Sep 2026 | **Giza portal = matched mini-window:** portal cam copies main eye height + pitch, seated outside the doorway looking into Egypt (−Z) so horizons align. Shelf **+10 ft** away / **+10 ft** cam-left from (−0.281 / 3.2) → `SHELF_SIDE` **−3.329**, `SHELF_FORWARD` **0.152** (prior +SIDE/+FORWARD was the opposite on both axes). Daylight Spot/pool warmed (`#ffd089`, pool opacity **0.72**). Capture `public/debug/archaeology-giza-portal.png`. |
| 18 Sep 2026 | **Giza portal = Archaeology key light:** stone arch shows Egypt RT (day sky + desert + three pyramids). Stop-3 neon tube / PointLight / floor glow muted (`neon.setPortalReplacesNeon(3)`). Warm daylight **SpotLight** through the opening + additive floor pool (`ArchPortal.js`; pool opacity **0.62**). Runtimes from `masters/Desert/`, `masters/SkyBox Day/`, `masters/Pyramids/` via `scripts/rebuild-giza-portal-runtimes.mjs` (masters untouched). Capture `public/debug/archaeology-giza-portal.png`. |
| 18 Sep 2026 | **Edge-glitch outside tips:** remove undilated subject-alpha hard-clip (it killed `spanOut`). OccFade allows outside diamond tips on empty BG via signed SDF &lt; `spanOut`×1.35; still rejects foreign geometry via view-Z mismatch. Capture `edge-glitch-fringe-dark-shoulder.png`. |
| 18 Sep 2026 | **Edge-glitch louder restore (post-Fork-A fringe):** Fork A alone was too weak on dark bust. Restore beauty tear + thin emissive seam fringes (`fringeAmount` **0.55**, cap **0.42**, neon-tinted R/cyan) with `tearAmpPx` **54**, `revealBoost` **3.5**, `rgbSplitPx` **14**. Scanline **0** (brick panel). No block cells / liquid / bonus. Shift+G includes `fringeAmount`. Capture `edge-glitch-fringe-dark-shoulder.png`. Verify: `node scripts/verify-edge-glitch-fringe.mjs`. |
| 18 Sep 2026 | **Edge-glitch → Fork A restore:** retire post-Fork-A experiments (liquid / gooey / fringe / scanline / bands-comb / block displacement). Restore hyper-expose tear: `revealBoost` **3.5**, `rgbSplitPx` **14**, `tearAmpPx` **42**, `tearBands` **88**, L1 diamond + occ, `glitchArmOuter` **0.06**. Shift+G = Fork A knobs only (`liquidArmOuter` kept for water-cursor rim). Capture `edge-glitch-reveal-shoulder.png`. Verify: `node scripts/verify-edge-glitch-loud.mjs`. |
| 18 Sep 2026 | **Horse Z+85° CCW + ×2; star twinkle louder:** Trojan `tipStand` = −X π/2 × **+Z 85°**; `TROJAN_HORSE_EXTRA_SCALE` **4/5** (2× prior 2/5). Sky twinkle: lower luma gate, sharp pulse 0.08↔2.4×, hard blinks; `setTime` every rAF. |
| 18 Sep 2026 | **Trojan Horse stand + 2/5:** native glTF is short-Y / tall-Z (lies on side). `tipStand` −X **π/2** before height fit; `TROJAN_HORSE_EXTRA_SCALE` **2/5** → ≈**8.8 cm** × CRT×0.5. Capture `public/debug/archaeology-trojan-shelf.png`. |
| 18 Sep 2026 | **Night skybox polish:** sky stays **above** the apron (no floor punch-through — wet neon bubble opaque again). Load **4096×2048** `public/assets/textures/skybox-night/equirect.webp` (~1.8 MB; **no mipmaps**, `toneMapped` off). Soft elev fade into `STAGE_BG` only (`SKYBOX_HORIZON_LOW` **0.02** / `HIGH` **0.18`). Star **twinkle** on bright texels (`SKYBOX_TWINKLE` **0.55**, `HZ` **0.85`) via `nightSkybox.setTime`. Rebuild: `node scripts/rebuild-skybox-night-runtime.mjs`. Capture `public/debug/skybox-night-arena.png`. |
| 18 Sep 2026 | **Night skybox on arena:** Sketchfab night sky (`masters/SkyBox Night/` → `skybox-night/runtime/` + equirect webp) as an inverted equirect dome — **view-elevation** fade into `STAGE_BG` at the horizon (no GroundedSkybox crease). Studio shell hidden. *(floor alpha punch-through reverted — see polish row)* |
| 18 Sep 2026 | **Archaeology Trojan Horse:** wooden-block horse on the shelf board **above Venus** (`SHELF_DECK` **1.312 m**, height **22 cm** × shelf scale). Runtime from `masters/Trojan Horse/` zip via `scripts/rebuild-trojan-horse-runtime.mjs` (OBJ→GLB → resize→webp→meshopt; master untouched). Zoom edge-glitch includes horse. Capture `public/debug/archaeology-trojan-shelf.png`. |
| 18 Sep 2026 | **Edge-glitch BLOCK DISPLACEMENT (datamosh):** retire BANDED tears. Irregular 2D hash cells (varied W/H, `cellBasePx` **18**), sparse displace (`tearDensity` **0.22**, `tearAmpPx` **28**), RGB split on offset, sparse neon/white **dropout** flashes (`dropoutDensity` **0.06**), thin cell-edge fringe (`fringeAmount` **0.4**). Diamond / occ / `revealBoost` / `scanlineAmount` **0** / water-cursor rim unchanged. Bust shoulder verify OK — no band comb. Frame-ms median **~40** (playwright full composer). Capture `edge-glitch-fringe-dark-shoulder.png`. Verify: `node scripts/verify-edge-glitch-fringe.mjs`. |
| 18 Sep 2026 | **Edge-glitch brick/mortar CUT:** equal-height bands + fringe-every-boundary was the comb. Now **irregular** Y-warp bands (**36**), **`tearDensity` 0.12** sparse displace, fringes **only on real shift discontinuities** (no full-height vertical rip fill). `scanlineAmount` stays **0**. Shift+G. Capture `edge-glitch-fringe-dark-shoulder.png`. Verify: `node scripts/verify-edge-glitch-fringe.mjs`. *(superseded — block displacement)* |
| 18 Sep 2026 | **Edge-glitch scanline panel CUT:** diamond-fill scanlines read as a cyan/red brick grid. **`scanlineAmount` → 0** — dark-bust visibility from **emissive tear fringes alone**. Optional tear-band-only scan path remains if knob raised (no diamond hatch). Capture `edge-glitch-fringe-dark-shoulder.png`. Verify: `node scripts/verify-edge-glitch-fringe.mjs`. |
| 18 Sep 2026 | **Edge-glitch dark-bust visibility:** tears emit thin chromatic **seam fringes** (`fringeAmount` **0.55**, cap **0.42** — R trail / cyan lead, neon-tinted) + faint **scanline base** (`scanlineAmount` **0.1**, cap **0.11**). Beauty tear kept for lit regions. Thin lines only — not inject smear. Shift+G. Capture `edge-glitch-fringe-dark-shoulder.png`. Verify: `node scripts/verify-edge-glitch-fringe.mjs`. Liquid/gooey stay CUT. *(scanline later set to 0)* |
| 18 Sep 2026 | **Edge-glitch FINAL = tears only.** Decisive metaball gooey (`GooeyMetaballPass`: 2 soft blobs → blur → hard threshold) read as **two solid disks**, not a liquid neck (capture `edge-glitch-gooey-shoulder.png`; cost ~**+0.9 ms** median — budget OK, look not). **CUT** liquid/bulge/rim/gooey entirely. Keep Fork A tears (`revealBoost` / `tearAmpPx` / `rgbSplitPx`, `glitchArmOuter` **0.06**). `liquidArmOuter` **0.15** remains water-cursor rim gate only. No tenth iteration. Report: `public/debug/edge-glitch-gooey.json`. |
| 18 Sep 2026 | **Edge-glitch liquid LOCKED:** dark-bust invisible warp fixed — **neon proximity rim** (`edgeLightAmount` **0.35**, cap **0.4**, active-tube hue) + **liquidReveal** **3.0** on bulge samples. Bulge = **SDF-normal swell** toward cursor (`bulgeAmpPx` **14**), not curl. Dual arms: **`liquidArmOuter` 0.15** (bulge+rim) / **`glitchArmOuter` 0.06** (tears). Keep viscosity + surfaceTension. `bonusCount` **0**. Reduced-motion / workQuality **&lt;0.55** → edge light off. **No more liquid knobs.** Capture `edge-glitch-liquid-shoulder.png`. Verify: `node scripts/verify-edge-glitch-liquid.mjs`. *(superseded — CUT)* |
| 18 Sep 2026 | **Edge-glitch liquid Phase 2:** CPU **viscosity** (`bleedViscosity` **10**/s — amp + pull-cursor trail), **surfaceTension** **1.4** (outward bead / inward damp), **sample-UV fade** (diamond + undilated subject + occ at sample UV). Shift+G. Captures `edge-glitch-liquid-*.png`. Verify: `node scripts/verify-edge-glitch-liquid.mjs`. |
| 18 Sep 2026 | **Edge-glitch liquid Phase 1:** analytic **curl UV warp** in `edgeGlitchLiquid.glsl.js` before tear (main diamond only). Knob **`bleedAmpPx` 10** (0 = off; also ≤ **0.65·spanOut**). No viscosity / surface-tension yet (Phase 2). `bonusCount` stays **0**. Shift+G. Captures `edge-glitch-liquid-arch-on.png`, `edge-glitch-liquid-shoulder.png`. Verify: `node scripts/verify-edge-glitch-liquid.mjs`. |
| 18 Sep 2026 | **Archaeology shelf +4 ft from camera:** `SHELF_SIDE` **−1.5→−0.281** (+**1.219 m** along +X; stop looks +X). `SHELF_FORWARD` **3.2** unchanged. Venus/Antikythera ride the shelf. Capture `public/debug/archaeology-shelf-left-seat.png`. |
| 18 Sep 2026 | **Antikythera texturing:** Sketchfab CT master ships **TEXCOORD_0 all zeros** — baseColor never mapped (flat chalk). Rebuild runtime via Blender **smart UV project** + webp/meshopt (`scripts/rebuild-antikythera-runtime.mjs`). Polish: dielectric bronze (metal **0.06**, rough **0.88**, color **1**). Master untouched. Capture `public/debug/archaeology-antikythera-flat.png`. |
| 17 Sep 2026 | **Antikythera front-center:** `PROP_SIDE` **−0.14→0**, `PROP_BACK` **−0.06→+0.12** m — plate centered on bottom board; on yaw **π/4**, **+back** is the camera-near edge. Capture `public/debug/archaeology-antikythera-flat.png`. |
| 17 Sep 2026 | **Antikythera plate tip:** `tipFlat` was Euler XYZ `(-π/2, yaw, 0)` → stood on edge. Now world-Y yaw × local **+Z π/2** tip (native AABB thin in Z). Capture `public/debug/archaeology-antikythera-flat.png`. |
| 17 Sep 2026 | **Archaeology shelf → left-frame seat:** `SHELF_SIDE` **0.669→−1.5**, `SHELF_FORWARD` **3.4→3.2** — ladder fills the rest-frame edge-glitch diamond (left third), clear of neon/arch. Yaw **π/4** unchanged. |
| 17 Sep 2026 | **Edge-glitch Fork A (DONE):** retire additive inject (glowing smear). **`revealBoost` 3.5** hyper-exposes beauty before tear/RGB — shears real contrast. Keep **`rgbSplitPx` 14**, **`tearAmpPx` 42**, diamond/occ. **`bonusCount` 0**. Capture `public/debug/edge-glitch-reveal-shoulder.png`. Verify: `node scripts/verify-edge-glitch-loud.mjs`. |
| 17 Sep 2026 | **Edge-glitch LOUD look:** dark-bust pop via **`rgbSplitPx` 14**, **`injectAmount` 0.75** (additive neon/white in diamond + tear spikes), **`tearAmpPx` 42**. Split decoupled from intensity. Inject hue = active tube neon. **`bonusCount` default 0** (fill cost; ~+2–4 ms at count 2). Diamond/occ untouched. Tuner **Shift+G**. Capture `public/debug/edge-glitch-loud-shoulder.png`. Verify: `node scripts/verify-edge-glitch-loud.mjs`. |
| 17 Sep 2026 | **Edge-glitch bleed fix + bonus zones:** L1 diamond `across` uses UV-space edge normal (not global SDF — ladder rails re-zeroed SDF → unilateral scanline bands). Occlusion: FogDepthCapture still runs when fog is **off**; metric view-Z match + undilated subject hard-clip; displacement × strength (no tip smear). **Bonus** mirrors: `bonusCount` **2**, `bonusIntensity` **0.75**, `bonusRhythm` **16** snaps/sec (hash edge snaps on tear clock). Reduced-motion / work-quality **&lt;0.55** → bonus **0**. Tuner **Shift+G**. Captures: `edge-glitch-arch-no-bleed.png`, `edge-glitch-arch-bonus.png`. Verify: `node scripts/verify-edge-glitch-bonus.mjs`. |
| 17 Sep 2026 | **Stele removed; arch face + size; shelf back:** ditch Seibal stele load. Arch **4.2→4.83 m** (+15%), yaw **π/2→3π/4** (square opening to camera). Shelf **SHELF_SIDE −0.55→0.669** (+**4 ft** away from camera). |
| 17 Sep 2026 | **Arch demo layout:** stone arch at neon **(2.2, 0.85)** height **4.2 m** yaw **π/2** (`stone-arch/runtime/`). Ladder **SHELF_FORWARD 0.92→3.4** / **SHELF_SIDE −0.42→−0.55**, scale **×0.75**. Antikythera **tipFlat** on bottom deck; hide thin CT probe meshes. |
| 17 Sep 2026 | **Antikythera visible:** Sketchfab fragment AABB sits ~**(−4, 166, −226)** from origin; seat wrote root XZ and left the mesh hundreds of units away. `fitHeightOnFloor` now wraps an **`archaeology-floor-pivot`** that centers bottom-XZ on the root so shelf/stele positions stick. |
| 17 Sep 2026 | **Archaeology edge-glitch rest/zoom:** rest = neon tube + shelf + stele; zoom = stele + Venus + Antikythera (**not** the shelving unit). `EdgeGlitchSystem.setActiveRoot` accepts multi-root sets. |
| 17 Sep 2026 | **Venus scene lighting:** runtime GLB is `KHR_materials_unlit` (MeshBasic = full albedo). `polishMesh({ forceLit: true })` swaps to MeshStandard (rough **0.88**, metal **0.02**, `envMapIntensity` **0.35**, no emissive) so she takes neon / spot / ambient like the shelf. |
| 17 Sep 2026 | **Stele 5 ft own-left:** `STELE_POS` **(5.224, −5.915)→(4.146, −6.993)** — **5 ft** along stele local −X (facing −π/4 → world (−X,−Z)). |
| 17 Sep 2026 | **Antikythera → bottom shelf:** deck **0.542→0.163 m** (lowest Iona board top). Was mid shelf and easy to miss. Venus stays **0.924 m**. |
| 17 Sep 2026 | **Stele front-left (not right) + Venus ×1.33:** `STELE_POS` **(6.948, −7.639)→(5.224, −5.915)** — **8 ft** along front-left (−X,+Z); prior front-right nudge was wrong. `VENUS_EXTRA_SCALE` **1.33** → Venus ≈ **0.46 m**. |
| 17 Sep 2026 | **Stele front-right 8 ft:** `STELE_POS` **(6.948, −7.639)→(5.224, −9.363)** — **8 ft** (~**2.44 m**) along Archaeology front-right (−X,−Z). Yaw **−π/4**. *(superseded — wrong direction)* |
| 17 Sep 2026 | **Stele +12 ft again:** `STELE_POS` **(4.562, −4.867)→(6.948, −7.639)** — another **12 ft** (~**3.66 m**) along shelf→stele. Yaw **−π/4**. |
| 17 Sep 2026 | **Stele clear of shelf:** `STELE_POS` **(3.17, −3.25)→(4.562, −4.867)** — **+7 ft** (~**2.13 m**) along shelf→stele so the base no longer clips the Iona unit. Yaw unchanged **−π/4**. |
| 17 Sep 2026 | **Grass back + apple sink light:** lawn shader wrote `outgoingLight` before it existed (`lights_fragment_end`) → compile fail / no blades. Kept per-blade albedo + clump AO; dropped that wrap. `APPLE_BASE_SINK` **0.35→0.02** so only the dirt platform hides (roots show). |
| 17 Sep 2026 | **Archaeology: ditch T-rex, add stele.** Seibal Stela 14 at Bust `APPLE_POS` **(3.17, −3.25)**, yaw **−π/4** (front-left), height **3.2 m** × CRT×0.5 ≈ **10 m**. Runtime `stele/runtime/stele.glb`. Edge-glitch subject = `steleRoot`. |
| 17 Sep 2026 | **Lawn lighting less flat:** per-blade hue/value jitter, world clump AO, stronger root darkening, wider base→tip albedo (`0x12380e`→`0x56b82e`). (Tip-wrap patch later removed — broke compile.) |
| 17 Sep 2026 | **Apple yaw −331° CW:** `APPLE_YAW_DEG` **−329→−331** (+2° CW, top-down). |
| 17 Sep 2026 | **Archaeology shelf scale ×0.5:** CRT prop scale halved (~**3.11×**) — shelf ≈ **5.73 m**, Venus ≈ **0.35 m**, Antikythera ≈ **1.03 m**. |
| 17 Sep 2026 | **Archaeology shelf face + CRT scale:** `SHELF_YAW` **−3π/4→π/4** (+180°). Shelf / Venus / Antikythera use Sidekick’s CRT prop scale (`sceneMonitorHeightM / 0.416` ≈ **6.22×**) — shelf ≈ **11.46 m**, Venus ≈ **0.69 m**, Antikythera ≈ **2.05 m**. |
| 17 Sep 2026 | **Stop rename Travel → Archaeology:** `TravelVignette` → `ArchaeologyVignette`, meta name **Archaeology**, scroll-capture id `archaeology`. Camera-motion “travel” wording unchanged. |
| 17 Sep 2026 | **Archaeology stop: shelf + finds, pack gone.** Backpack removed. Iona shelving at old pack seat (`SHELF_SIDE` **−0.42** / `SHELF_FORWARD` **0.92**; yaw later flipped to **π/4**). Venus + Antikythera on shelf decks. Runtime GLBs from `masters/` (untouched) via simplify/webp/meshopt. |
| 17 Sep 2026 | **Haze off:** `STAGE_FOG_MODE` **`volumetric`→`off`** (fog path stays wired; toggle `__stage.debugFog('volumetric')`). |
| 17 Sep 2026 | **Apple yaw −329° CW:** `APPLE_YAW_DEG` **−327→−329** (+2° CW, top-down). |
| 17 Sep 2026 | **Apple yaw −327° CW:** `APPLE_YAW_DEG` **−323→−327** (+4° CW, top-down). |
| 17 Sep 2026 | **Apple yaw −323° CW:** `APPLE_YAW_DEG` **−303→−323** (+20° CW, top-down). |
| 17 Sep 2026 | **Apple yaw −303° CW:** `APPLE_YAW_DEG` **−293→−303** (+10° CW, top-down). |
| 17 Sep 2026 | **Haze −60%:** `heightFogHazeFloor` **0.12→0.05**, start **0.12→0.05** (range stays **1.8**). Ceiling still too high after prior pass. |
| 17 Sep 2026 | **Fog ceiling down (again):** restoring the bank had put haze floor **0.55** / start **0.35** / range **2.8** — residual dens filled the frame. Ceiling only: start **0.12**, range **1.8**, floor **0.12**. Bank dens/expK/plane exclusion untouched. |
| 17 Sep 2026 | **POV spot soft + focused:** `SPOT_INTENSITY` **0→18** (was **118** full key). Angle **π/5.2→π/9** (~20°), penumbra **0.45**, decay **1.45**. Spot contact pad **0.1**. Floor stays layer **3** (no disc). Leaf canopy still spot×0. |
| 17 Sep 2026 | **Apple yaw −293° CW:** `APPLE_YAW_DEG` **−281→−293** (+12° CW, top-down). |
| 17 Sep 2026 | **Fog back (keep plane exclusion):** bank was crushed (`heightFogExpK` **2.8** + `fogFloorFadeRangeY` **3.6** + dens max **0.4**) so haze read as void. Restored visible bank: `expK` **0.5**, floor fade **1.2**, dens **0.65**, ambient **0.28**, wrap **2**, haze **0.55**/start **0.35**/range **2.8**, `noisePow` **2.4**. Still `fogSoftContactRange` **2.0** + `fogEdgeSoft` **0.9** (dens off bust depth plane). |
| 17 Sep 2026 | **Bust grass = base only:** displacement lip was **1.18–1.60×** the pedestal ellipse. Now `bustLipMin` **1** / `bustLipJitter` **0** — clears only the **0.98×0.88 m** stone footprint (matching ground hole). |
| 17 Sep 2026 | **Apple yaw −281° CW:** `APPLE_YAW_DEG` **−275→−281** (+6° CW, top-down). |
| 17 Sep 2026 | **Apple coin actually under floor:** deck measure was pre-scale root-local (~0.65–0.84) but sink was applied in world units — with `_scaleSeat` **~1.68×** the Meshy grass-coin still sat ~**0.3–1.1 m** up. Sink is now **`deckTop × root.scale.y + APPLE_BASE_SINK`** (**0.35**), deck top = **max** of the wide lower band. `snapGroupToFloor` excludes `apple-tree*` **and** `Grass_ground` (buried verts were lifting the Bust group). Lawn dirt plate at **−0.06** with a hole under the trunk. |
| 17 Sep 2026 | **Apple coin buried:** dirt-pad top was still ~**0.24 m** above apron (deck mode measured mid-slab). Now sink by platform **p97** top + `APPLE_BASE_SINK` **0.08** so the Meshy grass-coin sits under the floor. |
| 17 Sep 2026 | **Fog off bust plane:** dens excluded at opaque depth — `fogSoftContactRange` **2.0** (clearGap ~45% + fade). Fog stays in front of the subject and on miss rays behind/around. `fogEdgeSoft` **0.9** bleeds behind-fog onto the silhouette. Wrap boost **0.6**. Low bank (`expK` **2.8**) kept. |
| 17 Sep 2026 | **Bust waterline chase:** lowered bank / killed haze gate / rejected subject kScale. Still disliked — switched to plane exclusion. |
| 16 Sep 2026 | **Visible fog/light pass:** composite `fogEdgeSoft` **0.9** bleeds background fog onto subject silhouettes (not a clearGap pullback). Soft-contact density fade **1.75** m. Ambient/hemi **0.12 / 0.08**. Accent rim **1×** at intensity **14** (was 72/2). Bilateral `uDepthSigma` **0.004**. |
| 16 Sep 2026 | **Fog halo + shoulder hotspot:** soft-contact drops clearGap — density fade only over `fogSoftContactRange` **1.75** m into opaque depth. Ambient/hemi restored **0.06 / 0.04**. Accent rim **72→34**, angle **0.25**, penumbra **0.72**, side **1.55**, camBias **0.2**, Rim B no shoulder aim. |
| 16 Sep 2026 | **Soft-contact = clear shell, not fuzzy mask:** `fogSoftContactRange` **0.85** m — outer half transparency ramp, inner half clear air gap against opaque depth (no 2 m silhouette blur). |
| 16 Sep 2026 | **Soft-contact subject blend:** `fogSoftContactRange` **2.0** m — density fades into opaque depth hits so fog doesn’t cut hard on bust/tree edges (far-arc caps skipped). |
| 16 Sep 2026 | **Fog ceiling down:** `heightFogHazeStartY` **0.5→0.12**, `heightFogHazeFloor` **0.55→0.18** (range stays **1.8** — no tight lid). Nothing else. |
| 16 Sep 2026 | **§20.9b bands again (metric PASS):** vignette dens replace had wiped `fogFloorFadeRangeY` (hard bottom shelf at row ~599 / world-Y ~0.75). Soft floor now applies **after** dens; ramp **squared**; live fade **3.6**. Subject wrap is **XZ-only** (no maxY). Dist fade live **24→32** (Manual 1 **12→18** hits Bust floor). Verify: `vol-fog-lidfix-verify.mjs` restFull maxContrast **≤6**. |
| 16 Sep 2026 | **Apple yaw −275° CW:** `APPLE_YAW_DEG` **−265→−275** (+10° CW). |
| 16 Sep 2026 | **Volumetric is the path:** `STAGE_FOG_MODE` **`volumetric`**. Video sheets retired behind `debugFog('video')` (flat-primitive banding). Scatter depth via density noise (`noisePow` **3.55**, `globalScale` **1.05**). Subject wrap = smooth density multiplier (not sheets). Pin restored in `volumetricFogPinned.js`. Shift+F: scatter + wrap knobs first. |
| 16 Sep 2026 | **Apple yaw −265° CW:** `APPLE_YAW_DEG` **−105→−265** (+160° CW, trunk-anchored pivot). |
| 16 Sep 2026 | **Digital fog off:** `digitalNoiseAmount` **0** (soft FBM again). Probe `__stage.debugFogPixelate(1)` still available to re-enable. |
| 16 Sep 2026 | **Subject fog wrap:** taller haze (**1.6** / **2.2**, floor **0.22**) + stop cylinder layers (`subjectWrapRadius` **4.2** / boost **1.85** / maxY **3.8**) so bust/PC limbs stay in fog. Near fade tightened (**0.2→2.2**); tube density boost applies after vignette dens (was wiped). |
| 16 Sep 2026 | **Digital-noise fog trial:** fog density = world hash voxels (`digitalNoiseCell` **0.14**, amount **1**) — scene stays sharp. Killed screen UV block pixelate (that mosaicked objects behind). Probe `__stage.debugFogPixelate(1)` / `(0)` off. |
| 16 Sep 2026 | **Apple yaw −105° CW:** `APPLE_YAW_DEG` **−90→−105** (trunk-anchored pivot). |
| 16 Sep 2026 | **Restored volumetric fog:** `STAGE_FOG_MODE` **`volumetric`** (pinned raymarch). Video fog trial stays wired for `__stage.debugFog('video')`. |
| 16 Sep 2026 | **Fog ignores neon flicker:** arrive envelope only (`getArriveLevel` / `light.userData.fogIntensity`). Video fog tint pulls toward live neon color near the tube (`NEON_COLOR_MIX` **0.85**) — luminosity/color rise smoothly, no strike strobe. |
| 16 Sep 2026 | **Video fog neon proximity:** opacity follows world-XZ distance to the stop tube — core **`NEON_RADIUS` 2.5** / feather **6** (`MIN` **0.18** → `MAX` **1.2**). Dense at the pillar, thin in the wings. |
| 16 Sep 2026 | **Video fog bottom fade:** apron dissolve on every layer (`VIDEO_FOG_BOTTOM_FEATHER` **0.62**, squared) — mask hits rgb+alpha so additive can't hold a ruler cut. |
| 16 Sep 2026 | **Video fog front ≈ window-wide:** front width = frustum / (1−2×feather) × **1.08** so soft edges still span the window (native aspect; deeper ×`GROWTH` **1.32**). |
| 16 Sep 2026 | **Video fog front scene-anchor + soft edges:** front bottom fixed at **`VIDEO_FOG_FRONT_Y` −1.2** (rest+max-parallax out-of-frame — not camera-tracked); edge feather **0.42** + smootherstep dissolve. |
| 16 Sep 2026 | **Video fog parallax-safe front + gradual fade:** front sheet bottom buried below worst-case frustum hit (`PARALLAX_MAX` **0.245** + pad **0.4**); arrive ease **pow 2.4** + stagger **0.36**; land fade **1200** ms. |
| 16 Sep 2026 | **Apple base platform flush:** deck measure was near-axis tips (~0) so only **2 cm** sank. Now uses densest Y mode of **wide** lower verts (~**0.24** m dirt-pad top) + `APPLE_BASE_SINK` **0.01** — platform top flush with floor. |
| 16 Sep 2026 | **Apple yaw −90° CW:** `APPLE_YAW_DEG` **−60→−90** (trunk-anchored pivot). |
| 16 Sep 2026 | **Video fog opacity −40% + arrive stagger:** `OPACITY` **0.42→0.252**; `ARRIVE_STAGGER` **0.28→0.44** (front starts ~**0.88** arrive — past mid-hop parallax so its flat edge stays hidden). |
| 16 Sep 2026 | **Video fog arrive grow:** layers expand + fade with neon arrive (no 0.35 floor). Back layer leads, front trails (`ARRIVE_STAGGER` **0.28**); scale from **0.18→1**, floor-pinned. |
| 16 Sep 2026 | **Video fog scene-anchor:** back on vignette XZ (not window); UV **edge feather** **0.22**; deeper layers **scale up** (`GROWTH` **1.32**) with floor-pinned bottoms; native aspect; front still thinner. |
| 16 Sep 2026 | **Video fog screen-bottom + depth:** camera-parented stack; native **1280∶720** aspect (no stretch); bottom edge locked to frustum floor; front layers thinner (`OPACITY` **0.42**, `FALLOFF` **0.5** → layer opacities ≈ **0.105 / 0.21 / 0.42**). |
| 16 Sep 2026 | **Video fog actually visible:** root cause = ctor set `this.videoFog = null` *after* `_mountNeonSystem()` (orphaned disabled meshes). Also: soft-contact vs apron zeroed ground-fog band; fixed with soft **0**, `depthTest` **false**, **AdditiveBlending**, `VIDEO_FOG_PULL` **1.65** m. Fog mode now inits before neon mount. |
| 16 Sep 2026 | **Apple base flush:** sink pivot so dirt/root-flare **deck** sits at floor (`APPLE_BASE_SINK` **0.02** m extra bury) — lowest tips below apron, no floating base lip. |
| 16 Sep 2026 | **Apple yaw −60° CW (trunk-anchored):** `APPLE_YAW_DEG` **−30→−60**; pivot = lowest-vertex-band XZ centroid so canopy asymmetry does not slide the trunk off `APPLE_POS`. |
| 16 Sep 2026 | **Video fog visible:** upright camera-facing sheets (was horizontal → edge-on + soft-contact vs floor ≈ 0). Web encode **bakes density into RGB** (`max(a,luma)` shader) so Chrome still sees fog when VideoTexture drops alpha. Opacity **1**, 3 layers, arrive floor **0.35**. Re-encode: `scripts/encode-video-fog.sh`. |
| 16 Sep 2026 | **Lawn edge + density/tufts:** ground disc now follows coverage silhouette (no round dirt past lobed grass). Shift+L: **grass length** range **0.05→∞** (soft-max), new **grass density** + **tufts** sliders (`LAWN_BLADE_DENSITY` / `LAWN_TUFT_AMOUNT`). |
| 16 Sep 2026 | **Apple yaw −60° CW:** `APPLE_YAW_DEG` **+30→−30** (Y-up, top-down CW). |
| 16 Sep 2026 | **Apple tree −12%:** `APPLE_HEIGHT` **11.44→10.07** m (`BustVignette` `_scaleSeat`). |
| 16 Sep 2026 | **Alpha video fog trial:** procedural volumetric **pinned** in `src/fog/volumetricFogPinned.js` (full `FOG_DEFAULTS` + vignette/ambient context). Live path `STAGE_FOG_MODE` **`video`**: per-stop horizontal VideoTexture planes (`VideoFogSystem`) with depth-faded soft contact vs FogDepthCapture (`depthWrite:false` / `depthTest:true`, layer **2**). Master `masters/video-fog/seamless-low-cloud-loop-with-alpha-channel.mov` → web `public/assets/video/fog/cloud-loop.{webm,mp4}` (VP9+alpha / HEVC+alpha). Toggle `__stage.debugFog('video'\|'volumetric'\|'off')`. Knobs: `videoFogConfig.js`. |
| 16 Sep 2026 | **Right-edge black gutter + cursor bootstrap:** canvas was pinned to stale inline `setSize` px while HUD stayed full-bleed (body `#070709` showed). Fix: `#scene-canvas` `position:fixed; inset:0`, `setSize(w,h,false)`, `ResizeObserver` on `documentElement`, WetFloor/LiveEnv `setViewport` uses **CSS** `getSize` (not drawing-buffer). Cursor blob no longer spawns at center — presence **0** until in-frame pointer (`appearAt` pop/recoil, or wait for enter). `debugWorkQuality().gapRight`. |
| 16 Sep 2026 | **Light bubble / oppressive dark:** neon distance **2.75** / decay **3.5**; ambient **0.008** / hemi **0.004**; wet albedo **0.12**, env **0.03**; floor **bubble mask** (radius ≈ neon distance + **1.15 m** feather) so apron beyond the pool is void-black. Fog hazeFloor **0.22**, dist fade **12→18**. |
| 16 Sep 2026 | **Wet floor UV 32 + fog back:** `WET_FLOOR_UV_REPEAT` **32**. Root cause of “missing” fog: composite used `mix(scene, fogRgb, a)` but march stores **premultiplied** in-scatter — alpha was applied twice and erased thin haze. Fix: `scene * (1−a) + fogRgb`. Also: `heightFogHazeFloor` **0.55**, `fogDensityMultiplier` **0.4**, `fogFloorFadeRangeY` **1.35**, `uAmbient` **0.055**; CubeCamera restores viewport after probe. |
| 16 Sep 2026 | **Wet floor scale:** `WET_FLOOR_UV_REPEAT` **12→20** — smaller concrete tiles across the apron (Shift+W still live-tunes). |
| 16 Sep 2026 | **PC tower “second neon” glare (real fix):** mid-edge cyan chunk = Desktop `neon-stop-light-1` PointLight (Y **1**, intensity **28**) specular on `pc_1`. Prior `directLight.color *=` inject was a **silent no-op** — `onBeforeCompile` still has `#include <lights_fragment_begin>`, not expanded `RE_Direct`. Fix: inline `ShaderChunk.lights_fragment_begin`, patch every `RE_Direct`, mul **0.16** (`pc_1`) / **0.22** (`pc_2`); `specularIntensity` **0.18** / **0.32**; roughness floor **0.62**; keep `toneMapped`; never set `toneMapped = false` in `applyEmissiveMaterial` for power-LED mats. Capture `public/debug/pc-tower-glare-after.png`. |
| 16 Sep 2026 | **PC tower edge glare:** `PcPowerLed` had set `pc_1`/`pc_2` **`toneMapped = false`** so LEDs stayed hot — neon PointLight speculars on the tower corner also skipped ACES and bloomed into a second neon chunk. Fix: keep tone-mapped; punch LEDs via intensity; tighten green solid mask; raise `pc_1` roughness floor **0.42→0.55**. |
| 16 Sep 2026 | **Wet concrete floor:** MeshStandard apron (Concrete_6 → `public/assets/textures/concrete-wet/` 1024) + roughness puddles + **CubeCamera** probe (128² / every **3** frames). Floor on **`WET_FLOOR_LAYER` 3** (neon lights that layer; POV spot stays layer **0** — no disc). Env strength **0.12** (neon specular drives pools). Tuner **Shift+W**. Probe Δ within headless noise — **do not** escalate to planar Reflector. Capture `public/debug/wet-floor-neon-puddles.png`. |
| 16 Sep 2026 | **Accent rim dialed:** Spot rims at **subject-center Y** (not `box.min` — that lit the pedestal), behind + shadow-side, aimed **through** the bust toward camera. Defaults: intensity **72**, angle **0.32**, side **1.35 m**, back **0.85 m**. Capture `public/debug/accent-bust-rim-shaft.png` shows cyan left silhouette + shaft; `cornerLuma` **0**. |
| 16 Sep 2026 | **Accent lights (stop 0):** cyan **rim** SpotLights + slow **sweep** Point orbit + tight **fog shaft** Spot into volumetric in-scatter (max lights **6**, spot cones). No ambient/hemi/IBL fill. Tuner **Shift+A** → FINALIZE `accentConfig.js`. Work-quality drops rim/sweep. |
| 16 Sep 2026 | **Neon light = tube:** every stop PointLight samples the **live** tube mid-UV (same phase as emissive). Removed slow `NEON_LIGHT_COLOR_SCROLL` / rate-cap lag that left Desktop/Sidekick/Archaeology mismatched. |
| 16 Sep 2026 | **Edge glitch multi-stop:** same cursor-proximity SDF tears on **Desktop PC**, **Sidekick**, and **stele** (active-stop subject). Bust unchanged. Water-cursor rim still stop **0** only. |
| 15 Sep 2026 | **Lawn bust lip (v2):** pedestal ellipse **0.98×0.88 m**, lip **≥1.18**; under-bust samples shove to a dense rim; ground disc punched with matching hole (fixes clip + invisible prior pass). |
| 15 Sep 2026 | **Lawn bust lip:** blades displace around the pedestal ellipse (**0.70×0.56 m**, yaw **+12°**) to an irregular lip — grow around the base, no clip / no hard hole. |
| 15 Sep 2026 | **Lawn no bust hole:** removed the **1.75 m** pedestal clearance cull — grass grows up to the bust (same as tube foot). |
| 15 Sep 2026 | **Lawn trio cover:** patch origin = centroid of bust + neon + apple; radius at scale **1** covers all three (+ **1.35 m** margin, ≈**4.16 m**). Default `LAWN_PATCH_SCALE` **1**. |
| 15 Sep 2026 | **Lawn fill-in fix:** placement is a **world-fixed** cell lattice — growing patch size only adds an outer ring of blades (no more sliding/stretching the same set apart). |
| 15 Sep 2026 | **Lawn size ≠ blade scale:** patch size expands placement radius and **adds blades** (fixed spacing); grass length only changes blade height + density. Root XZ no longer squashed. |
| 15 Sep 2026 | **Lawn feel knobs:** Shift+L adds **grass length** (`bladeLength`) + **breeze strength/speed**. **Patch size** has no upper clamp (slider soft-max auto-extends). |
| 15 Sep 2026 | **Procedural Bust lawn:** replaced `lawn-grass-stump.glb` with Grassworks-class WebGL meadow (`src/grass/` — InstancedMesh blades, hash placement, tip wind, MeshStandard). Coverage / patch size / Shift+L tuner kept. No stump GLB on load gate. Capture `public/debug/grass-engine-bust.png`. |
| 15 Sep 2026 | **Lawn patch size:** `LAWN_PATCH_SCALE` / tuner **patch size** (default **0.9**, was XZ **0.8**). Live **Shift+L** slider → `setLawnEdgeParams({ patchScale })` scales grass XZ + refreshes bust/tube locals. FINALIZE → `lawnEdgeConfig.js`. |
| 15 Sep 2026 | **Edge glitch L1 diamond:** strength FIELD = Manhattan diamond at cursor→edge CROSS POINT (tangent × signed SDF; `spanAlong` / `spanOut` / `spanIn`). `armOuter` = on/off trigger only. Retired `localBase` / `localGrowth`. Tear/RGB/beauty look unchanged. Tuner **Shift+G**. Defaults: along **0.028**, out/in **0.016**. Capture `public/debug/edge-glitch-diamond-shoulder.png`. |
| 15 Sep 2026 | **Lawn radius fix:** `GRASS_RADIUS` **1.02** (mesh-local maxR ≈1.05) — was **6** so rNorm never left the dense band and the disc read stayed. Coverage FBM now culls to clumps/islands/stragglers; lobed shape distort. Capture `public/debug/lawn-edge-rest.png`. |
| 15 Sep 2026 | **Lawn noise meadow:** bust grass edge = coverage FBM (not radial disc). Cull whole full-height blades; lobed outline via shape distort. Fragment-space coverage (kills disc ground mesh). Tuner **Shift+L** → `__stage.setLawnEdgeParams()` → FINALIZE `lawnEdgeConfig.js`. Defaults: noise **3.2**, falloff **1.55**, straggler **0.45**, shape **0.55**. Fog/glitch/bust untouched. |
| 15 Sep 2026 | **Sidekick SFX 1.2×:** open/close clips use `playbackRate` **1.2** so audio keeps up with the swivel. |
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
| Archaeology GLB (legacy pack/rex) | Blender (`bpy`) via `scripts/export-travel-runtime.py` | Then gltf-transform **resize → webp → meshopt** (never `optimize`) |
| Binaries | Git LFS | `*.glb` and `public/assets/models/**/*.png` |

**Not used:** physics, ScrollTrigger, Lenis, a second composer, world-Y rotation for travel, Draco. Geometry compression is **meshopt** (`EXT_meshopt_compression`) with `MeshoptDecoder` on the runtime `GLTFLoader`.

**`glitch-gl` (parked):** `npm install glitch-gl` → `import glitchGL from "glitch-gl"`. Pixelation / CRT / glitch on DOM targets (images, text, video, GLTF). Free for personal portfolios; commercial use needs a NaughtyDuk licence. It spins its **own** Three.js renderer + rAF (and pulls nested `three@^0.178`), so it must **not** be dropped into `StageExperience`’s composer or stage rAF. When we wire it, keep it on a separate DOM surface (e.g. overlay / screen prototype page), or extract shaders only into the existing `postprocessing` stack.

Renderer (live): ACES Filmic, exposure **1.18** (`EXPOSURE`), PCF soft shadows, output sRGB. Settled DPR cap **1.75** (fine pointer) / **1.5** (coarse). During **any** camera motion (`!CameraRig.state.isSettled` — hop / zoom / unsettled parallax settle), beauty DPR ramps toward **`MOTION_DPR` 1.0** over **`MOTION_DPR_RAMP_SEC` 0.2** s, then back to full when settled (`StagePerfGovernor` × `_applyRenderScale`). Screens/canvases stay full res. Background **`#070709`** (`STAGE_BG`). Camera near **0.1** (`CAM_NEAR`), far **220** (`CAM_FAR` — clears studio shell walls ~180 m), FOV **42°** (`CAM_FOV`). Antialias on, `powerPreference: "high-performance"`.

While building, `?work` / `?work=1` / `?quality=0.6` boots meshes at **60%** of that DPR cap and scales the POV shadow map the same way. `?work=0` / `false` / `off` forces full. Bloom and the XP / MySpace / Sidekick SMS canvases stay full — only the object raster shrinks. `setWorkQuality` clamps to **0.35–1**; `setWorkQuality(1)` restores. **Adaptive governor** (`src/scene/stage/stagePerfGovernor.js`): EMA frame ms vs **`PERF_GOVERNOR_BUDGET_MS` ~20**; step-down order DPR → shadow map → wet-floor probe cadence (**edge glitch is never disabled**). Probe: `__stage.debugPerf()` (`motionDprActive` / `effectiveDpr` vs `settledFullDpr`).

---

## 4. What you see

Four stops on a ring of radius **18 m**, inward-facing props, camera **outside** the ring. After the aerial drop, scroll lands on **Bust**. Wheel / arrows / dots hop ±1 stop. Click the active stop to zoom.

| Index | Angle | Stop | Neon dominant | Interaction |
| --- | --- | --- | --- | --- |
| 0 | 0° (+Z) | **Bust** | `#ffa45a` (warm lantern) | Bust **4 m** + apple **10.07 m** yaw **−335°** at `(3.17, -3.25)` on short lawn; lantern **2.48 m** at `(2.2, 0.85)` |
| 1 | 90° (+X) | **Retro Desktop** | `#00e5ff` (~187°) | PC GLB. Click CRT → zoom → XP boot → MySpace. Wheel on zoomed CRT scrolls the page |
| 2 | 180° (−Z) | **Sidekick** | `#8c2dff` (~266°) | Phone GLB. Click toggles zoom **and** lid swivel. Open LCD is a live SMS form |
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
      MilkyWayNebulaShader.js       Galactic dome at 24,000 m (40 m camera shell)
      NebulaCloudCluster.js         4 faint wisps, flight only
      ProceduralStarfield.js        6k points on the 24 km sky, fade to the horizon by ~11°, 40% galactic band
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
      NeonSystem.js                 Tubes + 4 static lights + FogDepthCapture
      makeNeonTube.js               Standard sleeve + bloom-compensated core (no shell)
      makeNeonLantern.js            Bust-stop lantern GLB + bloom core (neonProp)
      neonGradientTexture.js        Tall 4×256 V-strip; loop-closed stops; no mipmaps (scroll seam)
      FogDepthCapture.js            Opaque layer-0 depth pre-pass (fog soft-contact + edge-glitch occ when live)
      FogDebugOverlay.js            DEV camera quad: packed depth + soft ramp
      VolumetricFogPass.js          Screen-space raymarch (parked behind STAGE_FOG_ENABLED)
      VideoFogSystem.js             Alpha VideoTexture planes (parked; restore with flag + MODE)
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
      PostPass.js                   Live composer: RenderPass → (fog?) → EdgeGlitchPass → bloom → grain
      FilmGrainEffect.js            Custom postprocessing Effect
      StageLoadGate.js              Gating LoadingManager + bake + min boot ms
      LiveStageEnvironment.js       PMREM for glass / PBR
      StageStudioRoom.js            Studio shell
      StageFloor.js                 Floor disc
      VignetteContactShadows.js     Soft dual contact pads (POV spot + neon)
      StageScrollCapture.js         Wheel → CRT / DOM
      stageCameraTrack.js           INTRO_TRACK_DESCENT + legacy sampler (tests)
      frameBudget.js                DEV post-land slow-frame tags (__stage.frameBudget.dump)
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

1. On load the stage group is hidden, the POV spot is off, and `CameraRig.poseSuspended` is true so the ring pose cannot overwrite the flight. The sky is **6,000** procedural points on the **24 km** shell (not the equirect dome). Color and stars fade to black between the horizon and **~11°** up (`SKY_HORIZON_LOW` **−0.03**, `SKY_HORIZON_HIGH` **0.2**). The fader is transparent (XP bar still gates clicks) so the sky is visible during boot. None of them sit at stage height, so the drop into the first vignette does not leave stars in the scene.
2. Camera eases from **108 m** out on the hold sightline — about **(0, 40.35, −45.54)** — toward hold **z −133**, **y 11.2**, looking at the hole **(0, 6.2, −148)** (`BLACK_HOLE_APPROACH_EASE` **0.65**). That ray is the rest view (~**18°** down onto the disk), so the disk's angle does not change as it grows. At the hold, cursor parallax matches the vignettes (`maxOffset` **0.245**): it fades in from **0.85 m** out and is full by **0.2 m** (`restParallaxBlend`). The spiral clears that offset. The hole is the animated GLB, fit to **7.2 m**, accretion disk horizontal and pitched **−8°** on X (`BLACK_HOLE_DISK_PITCH`). The sky behind it is the Milky Way at **24,000 m** (drawn as a **40 m** shell on the camera): empty sky matches `STAGE_BG`, and the galaxy is a band of star streaks on the galactic plane (shader filaments plus **40%** of the **6,000** points). **4** nebula wisps show only during the flight. The spacetime warp (dome and starfield) is on only during the flight, and its screen size and strength follow `atan(4.8 / distance)` — small at **108 m**, full at the hold. `AnimationMixer` plays Take 001 while the flight is active.
3. After the load gate, **Click to enter** / Enter / Space calls `triggerSpiral`. The close keeps the hold elevation and orbits the hole at **2.6 rad/s** while distance `r = r0·e^(−1.15 t)`. It ends at radius **≤ 0.42** or at **2.45 s**. While the pointer is over the disk, the liquid cursor rides **5** invisible lanes and stays aimed along the screen-space flow when the pointer stops (`samplePointerShear`, strength **0.78**).
4. Handoff hides the model, shows the stage, restores the spot, snaps the rig to aerial height **13.85 m** with the frozen intro quaternion, and calls `armIntroDescent()`.

`?blackhole=0` skips the flight (`poseSuspended` stays false). `prefers-reduced-motion` does too, and still skips the aerial drop. Playwright (`navigator.webdriver`) fires the spiral when the gate unlocks so probes still reach `introComplete`.

### Aerial drop (visual intro)

1. After the black-hole handoff (or immediately, if that flight was skipped), the camera is at rest radius, height **13.85 m**. Quaternion **frozen** so look-at does not pitch as height falls.
2. **240 ms** hold (`INTRO_SPRING_HOLD_MS`) unless the black-hole spiral just handed off — that flight already paid the compile. The hold keeps a cold first frame from hitching the drop.
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

Keep soft ambient/hemi fill + neon; POV spot is a **focused** secondary key (not the old **118** blast). IBL still **0**.

| Light | Intensity / role |
| --- | --- |
| Ambient | **0.12** (`AMBIENT_INTENSITY`) |
| Hemisphere | **0.08** (`HEMI_INTENSITY`) |
| Fill | **0** (`FILL_INTENSITY`) |
| POV `SpotLight` | **On** — intensity **18**, angle **π/9** (~20°), penumbra **0.45**, decay **1.45**, distance **52**. Layer **0** only. |
| Contact shadows | Soft pads per stop. Spot pad opacity **0** (spot off); neon pad opacity **0.18** × neon level. Y **0.008**. |
| Neon `PointLight` ×4 | Focus-only. Peak **28**, distance **2.75**, decay **3.5**. Layers **{0, 2, 3}**. Active stop (`displayLevel` **>0.08**, not reduced-motion) **`castShadow: true`** (`NEON_SHADOW` — **1024**² cubemap); others off. Inactive stops intensity **0** + content hidden. Arrive / flicker as before. See [§12](#12-neon-tubes--fog) |
| Wet arena floor | MeshStandard wet concrete (layer **3** only). Roughness map = puddles; CubeCamera env **0.03**; albedo gain **0.12**; UV repeat **32**. Soft **bubble mask** tracks active neon (radius ≈ light distance) so apron outside the pool is void-black. **Not** lit by POV spot. |
| Accent rim ×1–2 | Stop **0** cyan SpotLight ×**1** — behind + shadow-side, aimed through subject toward camera. Intensity **14**, distance **3.4**, decay **2.6**, angle **0.25**, penumbra **0.72**, side **1.55 m**, back **0.85 m**, height **+0.05 m**, cam bias **0.2**. |
| Accent sweep ×1 | Slow orbiting PointLight (uTime / neon clock). Intensity **1.45**, radius **2.35 m**, speed **0.11**. Frozen when `prefers-reduced-motion`; dropped when `workQuality < 0.4`. |
| Accent shaft ×1 | Tight Spot into fog in-scatter only (mesh intensity **0.35**, fog boost **×6.5**, angle **0.18**). Near-tube density boost **×2.35** / radius **0.9 m** while accents live. |
| Scene IBL | `RoomEnvironment` PMREM, **`STAGE_ENV_INTENSITY` 0** (IBL still off this pass). CRT cube on glass only — never `scene.environment` |
| Studio shell | `MeshBasicMaterial` `STAGE_BG` BackSide — **unlit**. Floor = wet MeshStandard on layer **3** (see wet arena floor); neon foot = additive `neon-floor-glow`. |

`LiveStageEnvironment` captures a second PMREM for CRT glass; refresh is deferred until models are visible. `applyToScene` defaults **false**.

---

## 11. Post: bloom (grain off)

**One** composer (`PostPass`). Do not add a second.

```text
[opaque depth pre-pass]   // FogDepthCapture — ONLY when edge-glitch cost is live (or fog enabled)
RenderPass → [VolumetricFogPass?] → EdgeGlitchPass → EffectPass(BloomEffect) → EffectPass(FilmGrainEffect)  // grain = 0
```

**Fog construction gate:** `STAGE_FOG_ENABLED` (**`false`**) — when false, `VolumetricFogPass` / `VideoFogSystem` are **not constructed**; composer is Render → EdgeGlitch → bloom → grain. All fog *files* stay on disk — flip **`true`** and set `STAGE_FOG_MODE` to restore. `FogTuner` / `debugFog` stay wired but no-op until fog is restored. Do **not** claim fog deleted.

When fog is enabled again: pass sits before bloom; intro land opacity fades **0→1** over **`FOG_HEAVY_FADE_IN_MS` 400**; density gated to the active vignette bubble (`VIGNETTE_FOG_RADIUS` **8.0** / feather **2.2**). Video sheets remain a **retired trial** behind `MODE=video`.

**Intro bloom return (fog-independent):** land sets bloom intensity **0** + `_bloomReturnT = 0`; `_tickIntroBloomReturn` soft-returns to `NEON_BLOOM.intensity` over ~**180** ms after intro (fog ticks only *hold* bloom at 0 while opacity ramps when fog is live). With fog parked, bloom still restores after land — verify neon bloom is present.

`FogDepthCapture` runs a **layer-0** scene pass with `MeshDepthMaterial` into a dedicated **nearest-filtered color** target (Three `BasicDepthPacking`: `.r = 1.0 - windowZ`, sized to the drawing buffer). **Phase 1:** it does **not** run every frame. Cost is paid only when (a) fog is enabled and needs soft-contact, or (b) edge-glitch occlusion is actually active — settled + glitch stop (0–3) + cursor near subject AABB. Edge glitch reads it via `setSceneDepth`. Volumetric (when restored) uses `setSceneDepth(..., { packed: true })` and undoes the invert (`1.0 - .r`) with live camera near/far **0.1 / 220**. Depth material is `toneMapped: false` / `NoToneMapping`. Still **one** `EffectComposer`; the pre-pass is not a second beauty pipeline.

Bloom (`NEON_BLOOM`): `mipmapBlur` **false** (Kawase/mipmap path intermittently outputs a full-black frame when stop-0 parallax translates the camera; kernel blur is stable), `luminanceThreshold` **1.0**, smoothing **0.2**, intensity **1.2**, radius **0.95**, `resolutionScale` **0.5** (half-res bloom internals — soft glow hides the scale; try **0.66** before reverting if edges stair-step). `kernelSize` `KernelSize.LARGE`. Half-float buffers (`HalfFloatType`), no MSAA. Reduced motion: bloom intensity **0**. Do not re-enable `mipmapBlur` without a move-cursor zero-frame probe at stop 0.

**Film grain is off** (amount **0**, normal and reduced-motion). At stage darkness (`STAGE_BG` `#070709`) it read as sensor noise and crushed fog gradients. The `FilmGrainEffect` pass remains last in the chain so a future re-enable is one constant away — do not bloom it.

Tubes use `toneMapped: false` and peak emissive **3** so they clear the threshold after ACES on the rest of the scene. CRT phosphor max **0.72** (`CRT_SCREEN_GLOW_MAX`) — stays under the line.

---

## 12. Neon tubes + fog

Owner: `src/scene/neon/` (+ `src/fog/`). **Fog is parked** behind `STAGE_FOG_ENABLED` **`false`** — systems are not constructed; flip **`true`** + `STAGE_FOG_MODE` (`volumetric` / `video` / `off`) to restore. Files kept: `VolumetricFogPass`, `VideoFogSystem`, `fogConfig`, `volumetricFogPinned`, `FogTuner`. Pin/rollback: `src/fog/volumetricFogPinned.js`. **Video fog** remains a retired trial path when MODE=`video`. Legacy fog ring / haze cards / atlas bake are **deleted**.

Four PointLights stay pinned at the tubes (layers **{0, 2, 3}**). The **settled active** stop casts a soft point shadow (`NEON_SHADOW`; cubemap **1024**²) — `castShadow` is **off during hops** and for inactive stops. **Focus-only lighting:** only the camera’s target stop (`CameraRig.state.index`) is lit — every other tube/light is intensity **0**. As theta enters `NEON_ARRIVE_RAD` **0.55** rad of that stop, light + emissive fade up; the neon **flickers** once when remaining hop arc ≤ `NEON_FLICKER_TRAVEL_FRAC` **0.07** of a stop step (last ~7% of travel — not on settle), for `NEON_FLICKER_SEC` **0.48** s, then holds. Tube `emissiveMap` scrolls on V (`NEON_GRADIENT_SCROLL` **0.18** loops/s) through that stop’s `neonColors`; the PointLight **always** samples the **live** tube mid-UV (same `map.offset.y` / `_gradientPhase` as the emissive) — glow and cast light cannot diverge. Deprecated `NEON_LIGHT_COLOR_SCROLL` / `NEON_LIGHT_COLOR_MAX_RATE` (no longer applied). **Unlit stops hide their 3D content** under `neon-lit-content` (IBL/ambient/POV spill would otherwise silhouette them) — neon tubes stay for the ring cue. That group tracks the **pre-flicker arrive** level with on/off hysteresis (**ON > 0.08** / **OFF ≤ 0.02** — ON must sit above OFF); once `_arriveLatchedIndex` matches the stop, content follows the **latch only** (not envelope noise). Flicker keys that hit 0 only dim lights/emissive, they must not hide meshes (that was the hard black/normal strobe). **Load-rest latch:** stop 0 is never traveled into on intro land — once the active stop is settled inside `NEON_ARRIVE_RAD`, arrive latches at **1** until the camera leaves that window (`_arriveLatchedIndex`), so a dead-still cursor cannot leave `neon-lit-content` dark. Flicker arms only after leaving the strike band (`_flickerEligible`) — intro land already sits inside it, so it must not strike on a still arrival. Flicker re-arms only after `activeDist > NEON_ARRIVE_RAD`. Reduced motion: no flicker / no scroll — snap on. Aerial intro keeps neon off until first settle. Adjacent chord is ~25.5 m vs light distance **8** / decay **2**. Probe: `__stage.debugNeon()` → `stops[].contentVisible` / `arriveLatchedIndex` / `flickerEligible`. Fog level / haze (when restored) use **arrive only** (`getArriveLevel` / `light.userData.fogIntensity`) — never the strike flicker.

**Inactive-stop cull:** vignette content (not tubes / floor glow) is moved to **`INACTIVE_VIGNETTE_LAYER` 6** so beauty + neon shadow cameras (layer **0**) skip traversal. Hop **from** + **destination** stay on layer 0 during travel to avoid pop-in.

**Wet-floor CubeCamera:** probe updates only while `CameraRig.state.isSettled` (bubble center still tracks during hops). Governor may raise `probeEveryN`.

**Edge glitch cost:** SDF + pass + FogDepthCapture when settled + stop 0–3 + cursor near subject AABB (NDC pad). **Never** governor-disabled — fixed feature. Probe: `__stage.debugEdgeGlitch().gates`. frameBudget tags `fog-depth:*ms` + `edge-sdf:*ms` separately for Phase-2 cost splits. Otherwise `uEnabled = 0`.

**Duo HUD bloom:** `DuoHudBloom` only while the insight hologram is open (`holoOn`) — not every Duo frame.

**Volumetric fog (parked — restore with `STAGE_FOG_ENABLED` + `STAGE_FOG_MODE` `volumetric`):** continuous density field — **banding-proof by construction** (no sheet edges). Stage wiring: `useComposerDepth: false`, `depthPacked: true`, depth from `FogDepthCapture` when fog/glitch need it; pass inserted **before bloom**. In-scatter feeds up to **6** lights (4 neon PointLights + optional accent shaft Spot). Soft luminance cap: fill **`FOG_IN_SCATTER_FILL_CAP` 0.88**. Reduced motion: freeze `uTime` / noise movement.

**Scattered depth (noise, not layers):** denser pockets / thinner gaps come from 3D noise — raise `noisePow` / lower `globalScale`. Live defaults: `noisePow` **3.55**, `globalScale` **1.05** (clumpier than Manual 1’s **3.15** / **1.45**). Dial by feel in Shift+F (**scatter (noise pow)** / **scatter size**).

**Subject wrap (volumetric):** `subjectWrapRadius` **4.2** / `subjectWrapBoost` **1.85** — XZ-distance density **multiplier** only near the active stop (bust/PC limbs). **`subjectWrapMaxY` is unused** (compat knob default **12**) — a Y smoothstep ceiling at **3.8** reintroduced density-locked grazing bands; do not restore a maxY on this multiplier. Continuous field; no hard radius shell.

**Live height / floor (banding-proof):** bank `heightFogExpK` **0.5** + **low ceiling** haze floor **0.05** / start **0.05** / range **1.8** (do not restore floor **0.55** / range **2.8** — full-screen wash), dens **0.65**, ambient **0.28**, wrap **2** (bust waterline = plane exclusion). Soft floor: `fogFloorFadeRangeY` **1.2** applied **after** vignette dens (`dens *= fl²`). Dist fade **24→32**. Exp path skips all `clipYSlab` Y clamps.

**Pinned Manual 1 look** (rollback via `PINNED_FOG_PARAMS` / `setVolumetricParams`): low cloud lid (`heightFogHazeStartY` **0.12**, `heightFogHazeRangeY` **0.5**, `heightFogHazeFloor` **0.1**) + `heightFogExpK` **0.55**; `fogDensityMultiplier` **0.4**, `noisePow` **3.15**, `globalScale` **1.45**, `heightFogFactor` **0.54**, `heightFogStartY` **-1**, `fogFloorFadeRangeY` **1.35**, `fogMinY` **-0.1**, `fogMaxY` **12.8**, `baseMaxRayLength` **32** / `baseRaymarchStepCount` **64** (0.5 m/step — keep ≤**0.7 m/step**). **Stable adaptive steps:** fixed world spacing + step count **quantized to buckets of 8**. `noiseBias` **0.22**, `noiseSpeed` **7.95**, wind XZ **0.06 / 0.06**, `noiseYScroll` **-0.019**, `outputDither` **0.02** (spatial-only Bayer), `falloffNoiseWarp` **1.85**, `falloffCeilingJitter` **0.95**, `fogDistFadeStart` **12** / `fogDistFadeEnd` **18**, `fogNearFadeStart` **0.35** / `fogNearFadeEnd` **3.5**. Fog-only neon reach **6.5** / decay **1.85**.

**Video fog (retired trial — `debugFog('video')` only):** `VideoFogSystem` + `cloud-loop.{webm,mp4}`. Flat sheets at grazing = horizontal banding + ~12 FPS. Kept wired for A/B; **not** the live path. Knobs: `videoFogConfig.js`. Probe: `__stage.debugVideoFog()`.

**Atmosphere toggle:** `__stage.debugFog('volumetric'|'video'|'off')` — **no-op** while `STAGE_FOG_ENABLED` is **false** (returns `{ ok: false, reason: ... }`). Hardware TODOs in `fogConfig.js` for steps **16 vs 12** and coarse fog reduced-vs-OFF remain open.

**Live fog tuner** (`src/ui/FogTuner.js`): **Shift+F**. Wired but **no-op** while fog is parked (no `volumetricFog` instance). When restored: Priority: **scatter (noise pow)**, **scatter size (↓=bigger)**, **noise bias**, density, **subject wrap** knobs, then dist fade / haze. Sliders → `__stage.setVolumetricParams()`. **FINALIZE** → `POST /__fog_finalize` patches `fogConfig.js`. CLI: `node scripts/fog-tuner-finalize.mjs`. Pin archive: `public/debug/fog-tuner-manual-1.json`. `window.__fogTuner`.

**Live accent tuner** (`src/ui/AccentTuner.js`): press **Shift+A**. Rim / sweep / shaft only — does **not** raise ambient/hemi/IBL. Sliders → `__stage.setAccentParams()`. **FINALIZE** → `POST /__accent_finalize` patches `src/scene/accent/accentConfig.js`. CLI: `node scripts/accent-tuner-finalize.mjs <json>`. Probe: `__stage.debugAccent()` / `window.__accentTuner`. Verify: `node scripts/verify-accent-bust.mjs` → `public/debug/accent-bust-rim-shaft.png`. **Landmine:** rim Y must be subject-center offset (`rimHeight`), never `box.min.y + tall` (that buried the light under the pedestal). Aim through the bust toward camera for silhouette graze — aiming at center alone makes chest speculars.

**Live wet-floor tuner** (`src/ui/WetFloorTuner.js`): press **Shift+W**. Reflection strength / roughness influence / UV / probe size — does **not** put the POV spot on the floor. Sliders → `__stage.setWetFloorParams()`. **FINALIZE** → `POST /__wet_floor_finalize` patches `src/scene/floor/wetFloorConfig.js`. CLI: `node scripts/wet-floor-tuner-finalize.mjs <json>`. Probe: `__stage.debugWetFloor()` / `window.__wetFloorTuner`. Verify: `node scripts/verify-wet-floor.mjs`. **Landmine:** floor must stay on `WET_FLOOR_LAYER` **3** (neon enables 3; spot stays 0) or the §10 round disc returns. Keep `envStrength` low (~**0.12**) — neon PointLight speculars own the near-tube pools; a hot env washes cyan/green puddles across the whole apron. CubeCamera **128** / every **3** frames — **only while settled** (skipped during hops). Measure before considering planar `Reflector`.

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

`renderer.antialias` does nothing on the HalfFloat composer path. If edges look crunchy, add `SMAAEffect` **before grain** — do not trust the renderer flag.

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
- Materials are upgraded while the PC root is on `GPU_HOLD_LAYER` (`INTRO_MATERIAL_BATCH_SIZE` **1**, yield **2** frames), then compiled once before show, including an offscreen shadow pass. Gate `renderer.compile` still warms blockout/uncommitted programs. Do not put the PBR swap back on a live 1-mesh present cadence.
- **Speaker / desk shimmer** is specular aliasing, not MSAA (`PostPass` HalfFloat `multisampling: 0`). Speakers share `pc_1` with 4K normals. Harden in `pcProductionMaterials.js`: `pc_1` normalScale **0.28**, clearcoat **0**, env **0.38**, roughness floor **0.62**, `specularIntensity` **0.18**, normal mip bias **1.25** / map mip bias **0.85**, neon PointLight × **0.16** via inlined `ShaderChunk.lights_fragment_begin` (see §20.18b). Neon PointLight hue tracks the live tube mid-UV (same phase as the gradient scroll). **Never** set `pc_1`/`pc_2` `toneMapped = false` to “fix” LED brightness — that untone-maps neon speculars on the tower edge into a second neon bar.

### Sidekick (`SidekickVignette.js`)

- Runtime: `/assets/models/sidekick/Sidekick3.glb`.
- Prop scale matches a real **Sidekick II** (**130 mm** closed height) against the Desktop CRT (blockout monitor vs typical **17″** chassis **416 mm**): `targetH = 0.130 × (sceneMonitorHeightM() / 0.416)`. Rest and zoom share that scale — close-up is camera dolly only. Zoom and lid swivel are one toggle. Open LCD: live SMS (`SidekickSmsScreen`). Send: scrollball red blink, then close.
- Open SFX leads motion by **0.2 s** (`OPEN_SFX_LEAD`); clips play at **1.2×**.
- **Keypad:** GLB authors `Buttons` + cover on shared `phong3` (MASK, alpha 0). Initial repair on GLB load / `integrateAfterIntro`; re-ensure every `update()` after intro + align. Repair clones opaque DoubleSide plastic onto the **QWERTY key plastic only** (`Buttons`). `KeyboardText` (`TmobileKeyboard`) is a separate glyph cutout and stays denylisted. `sideButtons` (`TmobileButtons`) is **one fused atlas** — CALL/END/D-pad body and print on the same mesh. It stays denylisted (identity by mesh name) and is forced **opaque DoubleSide** with the atlas kept; a luminance cutout punched the plastic out and left only the glyphs. Cover detection is identity-only (`phong3` / `sidekick_cover_mask` / shared cover instance), never opacity+alphaTest. See [§20](#20-landmines).

### Archaeology (`ArchaeologyVignette.js`)

- Live: `/assets/models/shelving-unit/runtime/shelving-unit.glb`, `/assets/models/venus-willendorf/runtime/venus-willendorf.glb`, `/assets/models/olive-wood-boat/runtime/olive-wood-boat.glb`, `/assets/models/cuneiform-tablet/runtime/cuneiform-tablet.glb`, `/assets/models/ishtar-gate/runtime/ishtar-gate.glb`, `/assets/models/lucy/runtime/lucy.glb`, `/assets/models/divje-babe-flute/runtime/divje-babe-flute.glb`, `/assets/models/neanderthal/runtime/neanderthal.glb`, `/assets/models/trojan-horse/runtime/trojan-horse.glb`, `/assets/models/olmec-head/runtime/olmec-head.glb`, `/assets/models/ptolemy/runtime/ptolemy.glb`, `/assets/models/antikythera/runtime/antikythera.glb` — meshopt where applicable. Masters under `masters/Shelving Unit/`, `masters/Venus of Willendorf/`, `masters/Olive Wood Boat/`, `masters/Cuneiform Tablet/`, `masters/Lucy/`, `masters/Divje Babe Flute/`, `masters/Homo neanderthalensis/`, `masters/Trojan Horse/`, `masters/Olmec Head/`, `masters/Ptolemy/`, `masters/Antikythera Mechanism/` stay untouched. Stone arch / Giza portal / desert / Egypt sky runtimes kept on disk for rollback but **not loaded**. Legacy `stele/runtime/` + `t-rex/runtime/` also kept.
- **Stele / arch / portal retired.** Shelf at `SHELF_SIDE` **−0.9** / `SHELF_FORWARD` **0.305** (arch-era seat), yaw **π/4**, scale CRT×**0.5**×**0.75**. Venus on deck **0.924 m**; olive wood boat on the same deck opposite Venus (**18 cm** × **1.15** × CRT×0.5, side **−0.2 m**, back **+0.04 m**); cuneiform tablet on **0.553 m** under the boat (easel lean **14°**, face toward camera, **16 cm** × **1.15**); Ishtar Gate same deck (side **0.16**, face **+70°**, **22 cm** × **0.935**); Lucy on bottom **0.163 m** under Venus as the **right** find (side **0.18**, back **+0.12**, upright / face **−75°** yaw, **17 cm** × **1.2** × CRT×0.5, on spine stand **10 cm** into foramen); Divje Babe flute mid-board (side **0.02**, back **+0.10**, diameter **3.5 cm** × **1.15**, yaw **π/2−75°**); Neanderthal skull left (side **−0.16**, back **+0.10**, face **π** yaw, jaw-down **−20°** on Sketchfab after Rx−90, **20 cm** × **0.969**, on spine stand **10 cm** into foramen); Trojan Horse on **1.312 m** (side **0.14**, face **+35°** yaw, **22 cm** × **4/5** × CRT×0.5, `tipStand` −X **π/2** × **+Z 85°**); Olmec Head same deck (side **−0.12**, face **−20°** yaw, **24 cm** × **0.935** × CRT×0.5); Ptolemy bust on top deck **1.697 m** (side **0.08**, back **−0.06**, **22 cm** × **1.05** × CRT×0.5 — pedestal stripped in `rebuild-ptolemy-runtime.mjs` at glTF **Y 0.805**, `forceLit` like Olmec); **Antikythera parked** (not loaded — runtime kept). Boat rebuild: `scripts/rebuild-olive-wood-boat-runtime.mjs`. Lucy rebuild: `scripts/rebuild-lucy-runtime.mjs`. Olmec rebuild: `scripts/rebuild-olmec-head-runtime.mjs`. Ptolemy rebuild: `scripts/rebuild-ptolemy-runtime.mjs`. Flute rebuild: `scripts/rebuild-divje-babe-flute-runtime.mjs`. Neanderthal rebuild: `scripts/rebuild-neanderthal-runtime.mjs`. Stop-3 **neon** is the key light again. Click still zooms.
- Floor: `skipFloorSnap` + local `fitHeightOnFloor` (group Y stays **0**). Fit wraps an **`archaeology-floor-pivot`** that centers the AABB bottom on the root — required for Sketchfab Antikythera (mesh ~**226** units off origin). Do **not** `snapGroupToFloor` after those fits.
- Lit by neon with `STAGE_ENV_INTENSITY` **0**. Meshes stay **DoubleSide**. `polishMesh` caps metalness, raises roughness, strips bad normal maps. **Venus** ships `KHR_materials_unlit` — polish **`forceLit`** converts MeshBasic → MeshStandard (rough **0.88** / metal **0.02** / env **0.35**) so she is not full-albedo unlit.

### Bust

`BustVignette.js`: loads `/assets/models/bust/runtime/bust.glb` (master: `masters/bust/Bust_lowpoly.glb`), `/assets/models/apple-tree/runtime/apple-tree.glb` (**trial:** Meshy fruit tree from `masters/apple-tree/Fruit_bearing_tree_with_orange_fruits_Meshy_Resize_d76462cb.glb`; pin/rollback `runtime/apple-tree.prev.glb`; prior OBJ export `scripts/export-apple-tree-runtime.py` — Blender Y-up OBJ ≈**meters**), and a **procedural meadow** via `src/grass/GrassEngine.js` (Grassworks-class WebGL: InstancedMesh tapered blades **`castShadow` true** with wind-matched `customDepthMaterial` + `customDistanceMaterial` for POV spot + active neon point shadows, deterministic hash placement, tip-weighted wind, MeshStandard tip/base color — **not** the old `lawn-grass-stump.glb`; masters under `masters/lawn-grass-stump/` kept untouched). **Key light prop:** lantern GLB (`neonProp: "lantern"`, `/assets/models/lantern/runtime/lantern.glb` from `masters/Lantern/lantern.glb`, height **`BUST_LANTERN_HEIGHT_M` 2.48**, XZ **`(2.2, 0.85)`**) with **semi-opaque frosted panes** (opacity **0.72**, roughness **0.88**, emissive flicker) + soft chamber glow (no fake flame mesh) and PointLight **`#ffa45a`** / intensity **110** / distance **9** / decay **1.75** (cage `castShadow` false so spill isn’t self-occluded) — not the 4 m neon cylinder or lime/cyan scroll. Bust: **`BUST_HEIGHT` 4 m**, yaw **`BUST_YAW_DEG` +12°**; polish clamps metalness ≤**0.12** (GLB ships metalness 1). GPGPU light-particle kit lives in **`bustLightParticles.js`** but is **not mounted** (sidelined for later reuse). Apple: **`APPLE_HEIGHT` 10.07 m** at **`APPLE_POS` `(3.17, -3.25)`**, yaw **`APPLE_YAW_DEG` −335°** (trunk-foot pivot; dirt-coin buried via wide-lower-band **max** Y × **`root.scale.y`** + `APPLE_BASE_SINK` **0.02**; apple meshes excluded from `snapGroupToFloor` so bury is not undone; `MAPLE_*` aliases kept). Lawn `Grass_ground` at **−0.06** m (`GRASS_GROUND_COLOR` **0x2a5224**, receives neon + blade shadows) with bust + tree holes so the dirt plate never reads as a raised coin. Lawn (Bust stop only): **`GRASS_POS`** centroid of bust+neon+apple **`(1.79, -0.8)`**, **`GRASS_Y` 0.006**, **`GRASS_RADIUS` ~4.16 m** at **`LAWN_PATCH_SCALE` 1** (covers all three + **1.35 m** margin); edge = noise coverage at placement; tip wind via `BustVignette.update(t)`. Tune live **Shift+L**. Apple leaf lighting: **`LEAF_LIGHT_DISTANCE` 4.8** + Beer-lambert self-shadow under neon **28** / distance **6.5**. Bust pedestal: grass **displaces** only under the stone ellipse (`bustHalfX` **0.98** / `bustHalfZ` **0.88**, `bustLipMin` **1** / jitter **0**, yaw **+12°**); under-bust samples shove to that footprint; ground disc has a matching hole. Lantern foot: hard cull + ground hole **`GRASS_TUBE_CLEAR_M` 0.55 m**.

### Duo FAB (`DuoFabSystem.js`)

HUD overlay — **not** a ring stop and **not** parented to the stage camera. Own `hudScene` + **orthographic** camera (`DUO_ORTHO_NEAR` **0.1** / `FAR` **20**) + key/fill/rim/hemi lights; rendered after the beauty composer with `clearDepth`. **Basis lock** (one-time tipStand): tallest GLB axis → HUD **+Y**, exterior/camera-island → **+Z** toward cam. `iso` closed `DUO_ISO_CLOSED` **(−0.16, 0, 0)**; hover/Mail → **measured** open quat (insight normal→+Y, bottom→+Z) + tip **`DUO_ISO_OPEN_TIP` 0.22**. Hierarchy `root(container seat)→pop(center corr)→pivot(bob)→iso→spin(yaw)→basis`. **Container:** bottom-right inset **`DUO_SCREEN_MARGIN_PX` 85**; half-extents = max(closed, open) AABB; closed + open stay centered (`pop` negates visual center). Shared seat scale **`DUO_IDLE_SCALE` 0.288** (−20% vs prior **0.36**); Z **`DUO_SEAT_Z` −3**. Fold: `ArmatureAction` closed **2.5 s** / open **0.042 s**.

**Screens:** closed → exterior **`screen_xm`** lock wallpaper + live clock (`duoExteriorScreen.js`, `/assets/duo/exterior-lock.jpg`, emissive **1.05** — date above time as `Thur Apr 21`, time **no AM/PM**, text-only overlay; time font **0.2** / date **0.055**); open → large insight **`screen_lg`** only after fold ≥ **`DUO_HOVER_OPEN_AT` 0.72**, soft cyan emissive **0.35** / **`0x5a8fa8`** (no PROJECTS map on glass) + HUD bloom (**0.42**, threshold **0.4**) + **coplanar holo volume** (armed at **`DUO_HOLO_OPEN_AT` 0.88**, delay **0.14 s**): wash + **6** slabs along screen normal + billboard PROJECTS (**Normal** blend, `LABEL_T` **0.14**, font **0.175**, label scale **0.86**, glow **0.32**) + traveling energy disc (`PULSE_MAX_T` **0.62**, opacity **0.54**, scale **1.05→0.42**, darker teal wash — no glyph invert, **0.55 s**). **Mail:** Duo click toggles DOM overlay (idle seat/scale unchanged); far-edge tip **`DUO_ISO_MAIL_FACE` 0.52** + faint Mail UI on insight (**0.92**); outside / ✕ / Esc dismiss. No DOM tooltip. **Hover:** spin halts → face yaw **0** + flat iso; bob continues. **Unhover** (`DUO_UNHOVER_STAGGER_SEC` **0.1**): PROJECTS glitch-out → clearing pulse wipes holo → fold close; then spin resumes (`DUO_SPIN` **0.48**). Knobs: `src/scene/duo/duoConstants.js`.

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
| Duo Mail / case study | DOM overlays (`DuoMailOverlay` / `DuoCaseStudyOverlay`) | Mail: hologram entrance + edge GlitchQL. Case study: **full-bleed** editorial sheet (responsive; Fraunces/Outfit); water cursor hidden over chrome with **native cursor restored**. |

---

## 15. Cursor, audio, HUD

**Water cursor** (`src/cursor/`): same `WebGLRenderer` as the stage (not a second WebGL context). Extra ortho scene drawn after the beauty pass with `autoClear = false`. Default diameter **22.4 px**, follow rate **10 /s**, color `#e8f4ff` (`waterCursorConfig.js`). Init **after** intro land, load gate unlock, and the post-land cursor delay (**720 ms**). Not created for `prefers-reduced-motion` or coarse pointer (`pointer: coarse`). **Rim couple** (stop **0**, camera settled, pointer live, `workQuality` **≥0.55**, reduced-motion off): GPU SDF taps in `waterCursorRimResolveShader` (ε **1.5 / `EDGE_GLITCH_SDF_SIZE` 256**), smoothed into a **2×1** float target, then the blob shader elongates / pinches / pushes (`blowExponent` **2.8**, `neckPinch` **0.72**, `recoilPushPx` **8**, `slurpBand` **0.032**, `snapThreshold` **0.012**, `rimFieldSmooth` **16**). No per-frame `readPixels`. Tune live with **Shift+C**. Glitch / `liquidArmOuter` **0.15** untouched. No refraction yet.

**Audio** (`siteAudio.js`): mute FAB (**top-right**), XP startup/login, Sidekick open/close. SFX leads Sidekick motion (`OPEN_SFX_LEAD` **0.2 s**). Sidekick clips play at **1.2×** so they finish with the swivel.

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

`npm run test:smoke` (`scripts/stage-canvas-smoke.mjs`) boots the real Vite stage in Playwright Chromium: no thrown/console errors through load, **fails on `GL_INVALID_FRAMEBUFFER` / “Framebuffer is incomplete”** (hooked `getError` + console), canvas non-blank after the gate, Desktop CRT / Sidekick `Buttons` / Archaeology shelf + Venus + Olive Wood Boat + Lucy + Trojan Horse + Olmec Head present after a full hop cycle (Bust → Desktop → Sidekick → Archaeology → Bust). It is the only suite that can catch shared-GLTF-material / alpha-0-snapshot / WebGL-taint / CubeUV-shader / zero-size RT classes. Requires `npx playwright install chromium` once.

---

## 19. Dev probes

Probes exist only in dev builds (`import.meta.env.DEV`).

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
18. **PC speaker “shimmer” ≠ missing antialiasing.** Composer is HalfFloat with `multisampling: 0`; raising `renderer.antialias` does nothing on that path. High-frequency normals + clearcoat under a fast-scrolling neon light color crawl as specular aliasing. Fix materials (`pc_1` normalScale / clearcoat off / roughness floor / normal mip bias). PointLight hue **must** track the live tube mid-UV on every stop (no rate-cap lag). Do not “fix” shimmer by enabling MSAA on the HalfFloat RT or by decoupling light color from the tube.
18b. **PC tower edge = second neon bar.** Root cause is the Desktop neon PointLight (Y ≈ **1**, intensity **28**) minting a mid-height specular on the front-right tower edge — height matches the light, not the full tube. Contributing landmines: (1) `toneMapped = false` on `pc_1`/`pc_2` (LEDs OR `applyEmissiveMaterial`) lets that specular skip ACES into bloom; (2) a `directLight.color *=` patch that searches for `RE_Direct` inside `onBeforeCompile` is a **silent no-op** because includes are not expanded yet — must replace `#include <lights_fragment_begin>` with a patched `ShaderChunk.lights_fragment_begin`. Keep tone-mapped; punch LEDs via intensity; `pc_1` roughness floor ≥ **0.62**, `specularIntensity` ≤ **0.18**, point-light mul ≤ **0.16**.
19. **Neon load-rest / arrive latch (stop 0).** Content under `neon-lit-content` must track the **pre-flicker arrive** envelope with hysteresis — never the flickered light value (zeros hide the whole stop → black⇄lit strobe). **Once `_arriveLatchedIndex` matches the active stop, content visibility follows the latch only** (ignore envelope micro-noise). Archaeology arrive hysteresis: ON **> 0.08**, OFF **≤ 0.02** (ON must sit above OFF — the old **1e-3 / 0.02** pair turned content on then immediately off in the gap → C04 chatter). Stop 0 is the load-rest stop: latch arrive on the **intro→first-settle handoff** via `neon.armArriveForActiveStop(index)`. **`allowNeon` is `introComplete` only** — do **not** OR with `CameraRig.isSettled` (aerial hold is also “settled” at pageload height → stop-0 flash on → drop blackout → land pop). Do not arm flicker until the camera has left the strike band (`_flickerEligible`) — intro land already sits inside it. Bust/maple mount on the boot gate (not the opacity reveal list); deferred-root reveal stamps (§13/§20.13) apply to PC/Sidekick/Travel, not the arrival bust.
9h. **Stop-0 global flash during aerial intro = `allowNeon = introComplete || isSettled`.** Aerial hold settles at pageload height → neon/content on; `armIntroDescent` unsettles → off; land settles → on. Fix: gate `allowNeon` on `introComplete` only; arm stop-0 arrive latch in `_completeIntroMotion`. Distinct from fog step-count flash (§9e) and from C04 arrive-edge content chatter (§19).
21. **Ambient/hemi + soft POV spot.** Ambient **0.12** / hemi **0.08**; POV spot **18** / angle **π/9** / penumbra **0.45** (not the old **118** key); IBL **0**; neon **28** / distance **2.75** / decay **3.5**. Leaf canopy still spot×0. Do not put spot on wet-floor layer **3**.

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
- Do not retune **edge-glitch** knobs (`liquidArmOuter`, `glitchArmOuter`, `SPAN_*`, intensity, …) when adjusting water-cursor feel — blob RESPONSE lives in `waterCursorRimConfig.js` / **Shift+C** and is applied in `waterCursorRimResolveShader`. Glitch must stay visually identical across cursor-curve changes. Do not call `readRenderTargetPixels` / `sampleDistance` from `_tickWaterCursorRim` or `WaterCursor.render` (that was the **56.8%** `readPixels` stall). `sampleDistance` is an on-demand debug probe only.
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
- **Prepend a row** to [Latest changes](#latest-changes) (newest first) summarizing what changed — knobs, paths, landmines, or behavior. Keep rows short; details stay in the numbered sections.
