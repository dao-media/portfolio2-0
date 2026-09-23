# Stage runtime models

These folders are **vendored into this repo** (not a symlink to Webflow).

| Path | Used by |
|------|---------|
| `sidekick/` | Sidekick vignette + SMS LCD atlas |
| `pc-source/` | Desktop CRT vignette (glb + PBR maps only) |
| `bust/runtime/` | Bust vignette (from `masters/bust/`) |
| `apple-tree/` + `runtime/` | Bust-stop apple tree. **Live trial:** `runtime/apple-tree.glb` = Meshy fruit tree from `masters/apple-tree/Fruit_bearing_tree_with_orange_fruits_Meshy_Resize_d76462cb.glb` (seat height `APPLE_HEIGHT` **10.07 m**). Rollback pin: `runtime/apple-tree.prev.glb`. Prior OBJ pipeline: `scripts/export-apple-tree-runtime.py` (masters OBJ untouched). |
| `lawn-grass-stump/` + `runtime/` | Bust-stop lawn patch (from `masters/lawn-grass-stump/`; GLB via `scripts/export-lawn-grass-stump-runtime.py`) |
| `maple-tree/` + `runtime/` | Legacy maple (unused by Bust stop; keep until cleanup) |
| `japanese-maple/` + `runtime/` | Legacy maple (unused by Bust stop; keep until cleanup) |
| `travel-pack/runtime/` | Legacy backpack (retired Archaeology stop) (retired from live vignette — keep for rollback) |
| `t-rex/runtime/` | Legacy T-rex (retired from Archaeology — keep for rollback) |
| `stele/runtime/` | Legacy Mayan stele (retired from Archaeology — keep for rollback) |
| `shelving-unit/runtime/` | Archaeology stop Iona shelf — from `masters/Shelving Unit/` (resize→webp→meshopt) |
| `stone-arch/runtime/` | Archaeology Gothic arch — frames **Giza portal** (was neon); from `masters/Stone Arch/`; height **4.83 m** |
| `desert-giza/runtime/` | Portal desert — Sand Dunes Alternative via `scripts/rebuild-desert-sand-dunes-runtime.mjs` (OBJ→Y-up→webp→meshopt). Flat ground also uses `public/assets/textures/desert-sand/basecolor.webp` from the same master BaseColor. |
| `giza-pyramids/runtime/` | Portal Giza ensemble — from `masters/Pyramids/` zip OBJ via same rebuild script |
| `venus-willendorf/runtime/` | Archaeology stop Venus — from `masters/Venus of Willendorf/` (simplify→resize→webp→meshopt); real **11.1 cm** × shelf scale |
| `cuneiform-tablet/runtime/` | Archaeology stop cuneiform tablet — from `masters/Cuneiform Tablet/` via `scripts/rebuild-cuneiform-tablet-runtime.mjs` (simplify→resize→webp→meshopt); standing on easel under olive boat (**0.553 m**) |
| `ishtar-gate/runtime/` | Archaeology stop Ishtar Gate — from `masters/Ishtar Gate/` via `scripts/rebuild-ishtar-gate-runtime.mjs` (resize→webp→meshopt); real **22 cm** × **1.1** × shelf scale; same board as cuneiform (**0.553 m**, side **0.16**) |
| `olive-wood-boat/runtime/` | Archaeology stop olive wood boat — from `masters/Olive Wood Boat/` via `scripts/rebuild-olive-wood-boat-runtime.mjs` (simplify→resize→webp→meshopt); real **18 cm** × shelf scale; same deck as Venus |
| `lucy/runtime/` | Archaeology stop Lucy (A. afarensis cranium + mandible) — from `masters/Lucy/` via `scripts/rebuild-lucy-runtime.mjs` (resize→webp→meshopt); real **17 cm** × **1.2** × shelf scale; bottom board **0.163 m** (right of flute), upright / shelf yaw |
| `divje-babe-flute/runtime/` | Archaeology stop Divje Babe flute — from `masters/Divje Babe Flute/` via `scripts/rebuild-divje-babe-flute-runtime.mjs` (resize→webp→meshopt); diameter **3.5 cm** × **1.15**; bottom board mid (side **0.02**), yaw **π/2** |
| `neanderthal/runtime/` | Archaeology stop Homo neanderthalensis (La Chapelle) — from `masters/Homo neanderthalensis/` via `scripts/rebuild-neanderthal-runtime.mjs` (simplify→resize→webp→meshopt); real **20 cm** × **1.15**; bottom board left (side **−0.16**) |
| `olmec-head/runtime/` | Archaeology stop Olmec Head — from `masters/Olmec Head/` via `scripts/rebuild-olmec-head-runtime.mjs` (resize→webp→meshopt); real **24 cm** × **1.1** × shelf scale; same deck as Trojan Horse (**1.312 m**) |
| `trojan-horse/runtime/` | Archaeology stop Trojan Horse — from `masters/Trojan Horse/` zip (OBJ→GLB via `scripts/rebuild-trojan-horse-runtime.mjs` → resize→webp→meshopt); real **22 cm** × shelf scale; seated on board above Venus |
| `ptolemy/runtime/` | Archaeology stop Ptolemy bust — from `masters/Ptolemy/` via `scripts/rebuild-ptolemy-runtime.mjs` (Blender pedestal trim **Y 0.805** → resize→webp→meshopt); real **22 cm** × **1.05** × shelf scale; top board **1.697 m**, side **0.08** / back **−0.06** |
| `skybox-night/runtime/` | Arena night sky — from `masters/SkyBox Night/` (resize→webp→meshopt); equirect dome + elev fade into floor |
| `antikythera/runtime/` | Archaeology stop Antikythera fragment — from `masters/Antikythera Mechanism/` (simplify→**smart UV**→resize→webp→meshopt via `scripts/rebuild-antikythera-runtime.mjs`); Sketchfab CT ships zero UVs; real **33 cm** × shelf scale; seated flat |

Day sky equirect for the portal lives at `public/assets/textures/skybox-egypt/equirect.webp` (from `masters/Sky's/20Sky-HDRI/Sky 16.hdr`; rebuild: `node scripts/rebuild-skybox-egypt-runtime.mjs`). Legacy savanna day sky: `public/assets/textures/skybox-day/equirect.webp`.
