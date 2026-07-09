# Portfolio 2.0

Cinematic scroll-driven Three.js proof of concept for a next-generation portfolio site.

## Concept

Based on Claude Code's **Stage Prototype** choreography:

- **Fixed camera** with a gentle drop-in on load, then subtle pointer parallax
- **Rotating turntable** — vignettes sit on a lazy Susan; scroll/swipe/keys rotate the stage (GSAP `back.out` settle)
- **Theatrical lighting** — fixed key spot over the front slot, rim light retints per vignette
- **Film grain** post pass
- **Retro Desktop** vignette (slot 2) — your PC model with the clickable MySpace admin dashboard

## Assets (retro PC model)

The desktop vignette expects models from the main Webflow custom-code project. After cloning, run:

```bash
./scripts/setup-assets.sh
```

This symlinks `public/assets/models` to the full asset tree from `daneoleary-webflow` (or clones it from GitHub if the sibling repo is missing):

```bash
./scripts/setup-assets.sh
```

The desktop vignette loads **`pc-source/pc-from-source.glb`** and applies the external texture set (`pc_albedo2.png`, normals, roughness, emissive maps) — same pipeline as production. Without assets, the vignette falls back to a simplified blockout desk.

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local dev server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |

## Project layout

```
src/
  main.js
  scene/
    StageExperience.js      Turntable stage + GSAP transitions
    stage/
      PostPass.js           Film grain
      SpotlightBloomPass.js Selective Unreal bloom (earmarked — not wired yet)
      PovSpotlightBeam.js   Volumetric spotlight cone (for future lighting pass)
      placeholderVignettes.js
      constants.js          SPOTLIGHT_BLOOM defaults for future lighting work
    vignettes/
      DesktopVignette.js    PC model + MySpace screen
  ui/
    MySpaceScreen.js
    MySpacePanel.js
    HUDController.js
  content/
    myspace-content.js
```

## Next steps

- Port the full retro PC scene (desk, props, Furby, AOL disc) from `daneoleary-webflow`
- Replace placeholder copy in `src/content/myspace-content.js` with your real bulletins/blogs
- Add GSAP ScrollTrigger or Lenis for smoother scroll choreography
- Split vignettes into lazy-loaded chunks for production

## Status

Proof of concept — not wired to production hosting yet.
