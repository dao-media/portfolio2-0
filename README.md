# Portfolio 2.0

Cinematic scroll-driven Three.js proof of concept for a next-generation portfolio site.

## Concept

- On load, the camera drops from above and settles in front of the first vignette.
- Scrolling (or touch swiping) rotates the carousel to additional 3D scenes.
- The active vignette exposes touch-friendly interactives — the workbench scene includes a retro CLI sequence inspired by the existing retro PC work.

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
  main.js                 Entry point
  scene/
    PortfolioExperience.js  Renderer, carousel, vignette orchestration
    CameraRig.js            Intro drop + pointer orbit offsets
    ScrollController.js     Scroll / touch → vignette progress
    vignettes/              Individual scene modules
  ui/
    HUDController.js        HUD + terminal panel
```

## Next steps

- Port the full retro PC scene from `daneoleary-webflow` as a vignette module
- Add GSAP ScrollTrigger or Lenis for smoother scroll choreography
- Split vignettes into lazy-loaded chunks for production

## Status

Proof of concept — not wired to production hosting yet.
