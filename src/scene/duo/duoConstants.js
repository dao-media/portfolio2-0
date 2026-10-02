/** Duo FAB seat, motion, HUD lighting, and fold-rig knobs. */

/**
 * Runtime GLB (meshopt) from `masters/iPhone Duo/iphone-duo_glb.zip`
 * → `glb/iphone_duo_rigged_animated.glb` (skinned hinge + ArmatureAction).
 */
export const DUO_GLB_URL = "/assets/models/iphone-duo/runtime/iphone-duo.glb";

/** Primary armature root (hide `_off` / `_screen` material demos). */
export const DUO_ARMATURE_NAME = "Armature";

/** Clip that drives Bone_L / Bone_R fold (24 fps, frames 1→150). */
export const DUO_FOLD_CLIP = "ArmatureAction";

/**
 * Blend file state map (seconds on ArmatureAction, fps 24):
 * - t≈0.042 (f1) / t≈6.25 (f150) → `_opened` (flat)
 * - t≈2.083–4.167 (f50–100) → `_folded` (fully closed)
 * - rest / mid → `_90` (partial book) — do not idle here
 */
export const DUO_FOLD_TIME_OPEN = 0.0416667;
export const DUO_FOLD_TIME_CLOSED = 2.5;

/** Screen / wallpaper material names on the rigged export. */
export const DUO_SCREEN_MATERIALS = Object.freeze([
  "screen",
  "screen_lg",
  "screen_lg_screen",
  "screen_screen "
]);

/** Exterior cover display (Bone_L) — lit only while closed. */
export const DUO_SCREEN_EXTERIOR = "screen_xm";
/** Large insight display (armature root) — lit only while open. */
export const DUO_SCREEN_INSIGHT = "screen_lg";

/**
 * Orthographic HUD — seat uses NDC fractions of the ortho frustum
 * (±aspect on X, ±1 on Y). Reliable bottom-right corner regardless of FOV.
 */
export const DUO_ORTHO_NEAR = 0.1;
export const DUO_ORTHO_FAR = 20;

/**
 * Product presentation tilt ONLY (radians). Applied on `iso` AFTER a one-time
 * `basis` lock that maps the GLB’s native axes → HUD up/right/front.
 * Do NOT put corrective 180° yaws here — that fights the file and tumbles
 * during scale animation.
 */
/** Closed: slight product tip. */
export const DUO_ISO_CLOSED = Object.freeze({
  x: -0.16,
  y: 0,
  z: 0
});
/**
 * Extra tip after measured flat-open (radians). Positive Rx tips the screen
 * normal toward the HUD camera (+Z) so the open face is visible (not edge-on);
 * bottom stays nearest the camera, top recedes.
 */
export const DUO_ISO_OPEN_TIP = 0.22;
/**
 * Additional tip when Mail / case study is open — lifts the far edge so the
 * insight face tilts more toward the POV (projection read).
 */
export const DUO_ISO_MAIL_FACE = 0.52;
/** Mail overlay aspect (width / height) — landscape iPad-ish. */
export const DUO_MAIL_ASPECT = 1.4;
/**
 * iPad Mail landscape split: message list ≈ **30%**, preview ≈ **70%**
 * (Apple Mail fixed split; not user-resizable).
 */
export const DUO_MAIL_LIST_FRAC = 0.32;

/**
 * Fixed HUD container: bottom-right outer edges sit this many CSS pixels
 * inside the canvas. Duo (closed + open) stays centered inside it.
 */
export const DUO_SCREEN_MARGIN_PX = 85;

/**
 * @deprecated Seat is pixel-anchored via `DUO_SCREEN_MARGIN_PX` + container
 * half-extents. Kept for probes / older logs.
 */
export const DUO_IDLE_NDC = Object.freeze({
  x: 0.72,
  y: -0.55,
  z: -3
});

/** @deprecated Same seat for open/hover — no NDC move. */
export const DUO_OPEN_NDC = Object.freeze({
  x: 0.72,
  y: -0.55,
  z: -3
});

/**
 * Uniform seat scale multiplied into `model.scale` with fit
 * (root/pop stay scale 1 — never scale a SkinnedMesh ancestor).
 * Closed + open share this — container size does not jump on hover.
 * Was **0.36**; −20% → **0.288**.
 */
export const DUO_IDLE_SCALE = 0.288;
/** @deprecated Open uses the same scale as idle (centered container). */
export const DUO_OPEN_SCALE = 0.288;

/** Ortho Z of the Duo root (camera at 0 looking −Z). */
export const DUO_SEAT_Z = -3;

/** Target height of the closed phone before idle scale (HUD meters). */
export const DUO_FIT_HEIGHT_M = 0.55;

/**
 * Post-intro entrance — heavy rise from below, brief momentum peak, plant at rest.
 * Wall-clock appear→settle = **0.8 s**. No post-settle hold — bob/spin at `live`.
 */
export const DUO_ENTRANCE_SEC = 0.8;
/**
 * Start Y offset relative to rest (HUD meters, +Y up).
 * Negative = begin off-screen below, animate UP into place.
 */
export const DUO_ENTRANCE_FROM_Y = -1.15;
/** @deprecated alias — use DUO_ENTRANCE_FROM_Y */
export const DUO_ENTRANCE_DROP_Y = DUO_ENTRANCE_FROM_Y;
/**
 * @deprecated GSAP back.out s — live path uses DUO_ENTRANCE_OVERSHOOT.
 */
export const DUO_ENTRANCE_BACK = 0.725;
/** Momentum overshoot above rest (0.04 = 4%) — small, heavy plant. */
export const DUO_ENTRANCE_OVERSHOOT = 0.04;
/**
 * Wall-clock fraction for peak→rest plant (rest of `DUO_ENTRANCE_SEC` is the rise).
 */
export const DUO_ENTRANCE_SETTLE_FRAC = 0.14;
/** Kept for skinned-mesh floor guards / legacy probes (seat uses full scale). */
export const DUO_ENTRANCE_FROM = 1;

/** Idle bob amplitudes (HUD meters) — float around the phone’s center. */
export const DUO_AMP_Y = 0.012;
export const DUO_AMP_X = 0.004;
/**
 * Axial nutation (radians). Kept small so spin reads as Earth rotation,
 * not an orbital lean around a distant point.
 */
export const DUO_AMP_ROLL = 0.035;
export const DUO_AMP_PITCH = 0.028;
/** Axis-wobble frequency (Hz). */
export const DUO_WOBBLE_HZ = 0.11;

/** Continuous axial Y-spin while idle (rad/s) — Earth’s rotation on its axis. */
export const DUO_SPIN = 0.48;

/**
 * Hover / Mail face-hold yaw. Must stay 0 with measured flat-open iso —
 * a nonzero yaw remaps pitch into a camera-relative roll (on-edge).
 */
export const DUO_HOVER_FACE_YAW = 0;
/** @deprecated Z-roll pulse retired — hover faces camera instead. */
export const DUO_HOVER_ROLL = 0;
/** Hover blend that drives the fold target. 1.5× the previous 0.42 s ramp. */
export const DUO_HOVER_SPIN_SEC = 0.28;
/**
 * @deprecated Idle never overlaps entrance.
 */
export const DUO_IDLE_IN_AT = 0;
/**
 * Frozen rest beat after rise settles, before any bob/spin (seconds).
 * **0** — entrance budget is the full `DUO_ENTRANCE_SEC` (rise + settle); no pad.
 */
export const DUO_IDLE_HOLD_SEC = 0;
/** Soft bob fade-in after hold (seconds). */
export const DUO_IDLE_BOB_IN_SEC = 0.85;
/** Spin starts this long after bob begins (seconds) — staggered handover. */
export const DUO_IDLE_SPIN_DELAY_SEC = 0.35;
/** Soft spin fade-in after its delay (seconds). */
export const DUO_IDLE_SPIN_IN_SEC = 1.1;
/**
 * Max integration step for Duo tick (springs / fades). Uncapped clock dt after a
 * hitch explodes explicit-Euler idle springs → shoot-off then settle.
 */
export const DUO_TICK_DT_MAX = 1 / 20;
/** @deprecated use DUO_IDLE_BOB_IN_SEC / DUO_IDLE_SPIN_IN_SEC */
export const DUO_IDLE_IN_SEC = DUO_IDLE_BOB_IN_SEC;
/**
 * Fold blend (0–1) above this → swap to insight screen / allow emissive.
 * Kept high so glow doesn’t appear while the armature is still closed.
 */
export const DUO_HOVER_OPEN_AT = 0.72;
/**
 * Fold blend above this arms the hologram; effect waits `DUO_HOLO_DELAY_SEC`
 * so bloom/sheet sync with the end of the unfold.
 */
export const DUO_HOLO_OPEN_AT = 0.88;
/** Hold after fold crosses `DUO_HOLO_OPEN_AT` before showing hologram (seconds). */
export const DUO_HOLO_DELAY_SEC = 0.14;
/** Dwell before arming hover (seconds). */
export const DUO_HOVER_ENTER_SEC = 0.1;
/** Dwell before releasing hover (seconds). */
export const DUO_HOVER_LEAVE_SEC = 0.2;
/**
 * Unhover exit stagger (seconds): text glitch → clearing pulse → phone close.
 * All three fire almost together, offset by this step.
 */
export const DUO_UNHOVER_STAGGER_SEC = 0.1;
/** Screen-space enter pad (px). */
export const DUO_HIT_PAD_ENTER_PX = 10;
/** Sticky leave pad (px) — larger so the hit region doesn’t flicker at the edge. */
export const DUO_HIT_PAD_LEAVE_PX = 28;

export const DUO_OPEN_STIFFNESS = 14;
export const DUO_OPEN_DAMPING = 5.2;

/**
 * Fold scrub spring (closed ↔ open clip times).
 * 1.5× the previous 18 / 6.5: stiffness scales with speed², damping with speed.
 */
export const DUO_FOLD_STIFFNESS = 40.5;
export const DUO_FOLD_DAMPING = 9.75;

export const DUO_HIT_PAD = 0.08;
/** @deprecated use DUO_HIT_PAD_ENTER_PX / LEAVE_PX */
export const DUO_HIT_PAD_PX = 14;

/** Closed non-exterior screens stay dark (no hologram). */
export const DUO_SCREEN_EMISSIVE_CLOSED = 0;
/**
 * Exterior cover lock screen while closed — photographic wallpaper, not
 * phosphor-hot like the open insight.
 */
export const DUO_SCREEN_EMISSIVE_EXTERIOR = 1.05;
/**
 * Open insight glass only — keep low; HUD bloom + plume carry the glow.
 * Was **3.2** when PROJECTS lived on emissiveMap; flat cyan at that level
 * blows the whole phone white/blue.
 */
export const DUO_SCREEN_EMISSIVE_OPEN = 0.35;
/** Soft cyan for open insight (no emissiveMap). */
export const DUO_SCREEN_INSIGHT_COLOR = 0x5a8fa8;
/**
 * Insight emissive while Mail is open — light Apple-Mail capture needs a modest
 * level so paper whites stay readable under HUD bloom.
 * Pass D: raised from 0.32 — at that level the capture's near-white paper
 * peaked at ~0.30 rendered luminance, comfortably under `DUO_HUD_BLOOM_THRESHOLD`
 * (0.4) but reading as flat/faint rather than "glowing." 0.38 puts the
 * brightest (near-white) capture pixels just under threshold — legible and
 * bright without itself blooming; the soft halo around the phone still comes
 * from the holo wash/plume (`DUO_HOLO_MAIL_WASH_SCALE` /
 * `DUO_HUD_BLOOM_MAIL_SCALE` below), which are already tuned to cross it.
 */
export const DUO_SCREEN_EMISSIVE_MAIL = 0.38;
/**
 * Wash / slab opacity multiplier while Mail projects — subtle glass illumination
 * so the phone still reads as lit without burying the on-glass Mail UI.
 */
export const DUO_HOLO_MAIL_WASH_SCALE = 0.28;
/** HUD bloom strength scale while Mail projects (full bloom washes capture white). */
export const DUO_HUD_BLOOM_MAIL_SCALE = 0.18;

/**
 * Pass D — Mail beam "screen is the source" readability. Beams are the SVG
 * lines in `DuoMailOverlay` (gradient already runs bright-at-phone →
 * transparent-at-panel; these add the animated flow on top). `BEAM_FLOW_SEC`
 * is the dash-travel cycle length; `BEAM_DASH`/`BEAM_GAP` set the apparent
 * "chunkiness" of the flow (small values read as a smooth gradient crawl,
 * large ones as discrete dashes). Direction is fixed screen→hologram by the
 * CSS animation's sign (see duo-mail.css) — never exposed as a sign flag, so
 * it can't accidentally reverse.
 */
export const DUO_MAIL_BEAM_FLOW_SEC = 0.6;
export const DUO_MAIL_BEAM_DASH_PX = 10;
export const DUO_MAIL_BEAM_GAP_PX = 14;
/**
 * Hologram-vs-screen distinction: the panel (the "projection") renders at
 * this opacity and saturation multiplier relative to its own authored
 * colors, plus a scanline overlay — so it reads as a copy of the screen,
 * not a second real UI.
 */
export const DUO_MAIL_HOLOGRAM_OPACITY = 0.92;
export const DUO_MAIL_HOLOGRAM_SATURATION = 0.82;

/** Closed cover wallpaper (desert lock art). */
export const DUO_EXTERIOR_WALLPAPER_URL = "/assets/duo/exterior-lock.jpg";
/** Exterior canvas (portrait ≈ wallpaper 729∶1024). */
export const DUO_EXTERIOR_CANVAS_W = 512;
export const DUO_EXTERIOR_CANVAS_H = 720;
/** Lock clock type (fraction of canvas height). */
export const DUO_EXTERIOR_TIME_FONT = 0.2;
export const DUO_EXTERIOR_DATE_FONT = 0.055;
/** Clock block vertical center (0 = top, 1 = bottom). */
export const DUO_EXTERIOR_CLOCK_Y = 0.2;

/** HUD bloom (Duo overlay only — stage bloom does not see this pass). */
export const DUO_HUD_BLOOM_STRENGTH = 0.42;
export const DUO_HUD_BLOOM_RADIUS = 0.4;
export const DUO_HUD_BLOOM_THRESHOLD = 0.4;
export const DUO_HUD_BLOOM_RES_SCALE = 0.5;

/**
 * Additive hologram volume — everything coplanar with the insight face,
 * stacked along the screen normal. No camera billboard (that read as a
 * floating card). Wash nests into the glass; slabs rise out of it.
 */
export const DUO_HOLO_SHEET_OFFSET = -0.002;
/** Face coverage vs insight AABB (slightly overscan so edges don’t clip). */
export const DUO_HOLO_SHEET_WIDTH = 1.04;
export const DUO_HOLO_SHEET_COLOR = 0xb8f4ff;
/** @deprecated */
export const DUO_HOLO_SHEET_SCALE = 1.14;
export const DUO_HOLO_SHEET_OPACITY = 0.9;
export const DUO_HOLO_SHEET_HEIGHT = 1;
export const DUO_HOLO_SHEET_RISE = 0.5;

/** Coplanar wash on the glass (kept modest so PROJECTS stays readable). */
export const DUO_HOLO_WASH_OPACITY = 0.42;
/**
 * Soft slabs along the screen normal (t in face-span units).
 * Dense near t≈0 so the volume grows out of the glass continuously.
 */
export const DUO_HOLO_STACK = Object.freeze([
  Object.freeze({ t: 0.03, opacity: 0.32, scale: 1.0 }),
  Object.freeze({ t: 0.08, opacity: 0.24, scale: 0.97 }),
  Object.freeze({ t: 0.16, opacity: 0.16, scale: 0.92 }),
  Object.freeze({ t: 0.28, opacity: 0.1, scale: 0.84 }),
  Object.freeze({ t: 0.42, opacity: 0.06, scale: 0.74 }),
  Object.freeze({ t: 0.58, opacity: 0.03, scale: 0.62 })
]);
/**
 * PROJECTS label: slight lift along the screen normal, then billboarded so it
 * stays readable when the open phone is flat (coplanar text was edge-on).
 */
export const DUO_HOLO_LABEL_T = 0.14;
export const DUO_HOLO_LABEL_OPACITY = 1;
/** Label plane size vs the shorter face axis. */
export const DUO_HOLO_LABEL_SCALE = 0.86;

/** PROJECTS projection canvas. */
export const DUO_PROJECTS_BG = "rgba(0,0,0,0)";
/** Soft halo only — high alpha + big blur washed the glyph out under Additive + bloom. */
export const DUO_PROJECTS_GLOW = "rgba(160, 240, 255, 0.32)";
export const DUO_PROJECTS_TEXT = "#f2fcff";
/** @deprecated Pulse no longer inverts the glyph. */
export const DUO_PROJECTS_TEXT_DARK = "#061018";
/**
 * Relative font size on the projection canvas (0–1 of canvas height).
 * Kept under ~0.18 so tracked “PROJECTS” (+ stroke/glow) clears the plane edge.
 */
export const DUO_PROJECTS_FONT = 0.175;
/** Letter gap as fraction of canvas width (tighter = less wide). */
export const DUO_PROJECTS_TRACK = 0.003;
/** Label vertical position on the canvas (0 = top, 1 = bottom). */
export const DUO_PROJECTS_TEXT_Y = 0.5;

/** Digital glitch bursts (seconds between / length). */
export const DUO_PROJECTS_GLITCH_MIN_SEC = 2.5;
export const DUO_PROJECTS_GLITCH_MAX_SEC = 5.5;
export const DUO_PROJECTS_GLITCH_SEC = 0.22;

/** Hologram energy pulse — bright circular band travels up the stack along the normal. */
export const DUO_HOLO_PULSE_PERIOD_SEC = 1.6;
export const DUO_HOLO_PULSE_SEC = 0.55;
/** Peak height along stack (face-span units), matches outer slabs. */
export const DUO_HOLO_PULSE_MAX_T = 0.62;
/** ~60% subtler than the first visible disc pass. */
export const DUO_HOLO_PULSE_OPACITY = 0.54;
/** Disc size vs wash face at the glass (shrinks as it rises). */
export const DUO_HOLO_PULSE_SCALE = 1.05;
/** Scale multiplier at tip (pulseProgress = 1). */
export const DUO_HOLO_PULSE_SCALE_END = 0.42;
/** Extra opacity on slabs near the traveling disc. */
export const DUO_HOLO_PULSE_SLAB_BOOST = 1.28;

/**
 * Mail entrance = hologram pulse — one-shot energy fronts Duo → panel that
 * materialize the overlay. Starts as exact Duo face silhouette, morphs to
 * Mail square; beams ramp in with the projection. **2×** prior speed.
 */
export const DUO_MAIL_ENTRANCE_SEC = 0.425;
export const DUO_MAIL_PULSE_SEC = DUO_HOLO_PULSE_SEC;
/** Outline-forward rail echoes (skewed Duo face → Mail square). */
export const DUO_MAIL_PULSE_OPACITY = 0.85;
/** How many simultaneous shape echoes on the beam rails. */
export const DUO_MAIL_PULSE_COUNT = 3;
/** @deprecated Entrance is one-shot; kept so older probes don't throw. */
export const DUO_MAIL_PULSE_PERIOD_SEC = DUO_HOLO_PULSE_PERIOD_SEC;
/** Cursor arm distance (CSS px) for Mail edge GlitchQL. */
export const DUO_MAIL_EDGE_GLITCH_OUTER_PX = 72;
export const DUO_MAIL_EDGE_GLITCH_INTENSITY = 0.55;

/** Dedicated HUD key light (camera-space direction toward phone). */
export const DUO_KEY_COLOR = 0xfff2e0;
export const DUO_KEY_INTENSITY = 2.4;
export const DUO_FILL_COLOR = 0xb8c8ff;
export const DUO_FILL_INTENSITY = 0.55;
export const DUO_AMB_INTENSITY = 0.35;
export const DUO_RIM_COLOR = 0xd0e8ff;
export const DUO_RIM_INTENSITY = 1.1;
