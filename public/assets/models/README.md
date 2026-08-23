# Stage runtime models

These folders are **vendored into this repo** (not a symlink to Webflow).

| Path | Used by |
|------|---------|
| `sidekick/` | Sidekick vignette + SMS LCD atlas |
| `pc-source/` | Desktop CRT vignette (glb + PBR maps only) |
| `travel-pack/runtime/` | Travel vignette pack (derived GLB — do not edit source OBJ) |
| `t-rex/runtime/` | Travel vignette skeleton (derived GLB — do not edit source OBJ) |

Do not reintroduce `public/assets/models` → Webflow symlinks. Keep only files the stage loads at runtime so clones and deploys stay lean.
