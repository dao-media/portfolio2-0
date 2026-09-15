# Stage runtime models

These folders are **vendored into this repo** (not a symlink to Webflow).

| Path | Used by |
|------|---------|
| `sidekick/` | Sidekick vignette + SMS LCD atlas |
| `pc-source/` | Desktop CRT vignette (glb + PBR maps only) |
| `bust/runtime/` | Bust vignette (from `masters/bust/`) |
| `apple-tree/` + `runtime/` | Bust-stop apple tree (from `masters/apple-tree/`; GLB via `scripts/export-apple-tree-runtime.py`) |
| `lawn-grass-stump/` + `runtime/` | Bust-stop lawn patch (from `masters/lawn-grass-stump/`; GLB via `scripts/export-lawn-grass-stump-runtime.py`) |
| `maple-tree/` + `runtime/` | Legacy maple (unused by Bust stop; keep until cleanup) |
| `japanese-maple/` + `runtime/` | Legacy maple (unused by Bust stop; keep until cleanup) |
| `travel-pack/runtime/` | Travel vignette pack (derived GLB — do not edit source OBJ) |
| `t-rex/runtime/` | Travel vignette skeleton (derived GLB — do not edit source OBJ) |

Do not reintroduce `public/assets/models` → Webflow symlinks. Keep only files the stage loads at runtime so clones and deploys stay lean.
