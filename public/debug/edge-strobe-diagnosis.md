# Edge strobe — FIXED (spatial-only dither)

**Status: FIXED** — proved by `scripts/edge-strobe-dither-bisect.mjs` (not smoke).

## Gate

| | ditherON_timeLive `stripMaeAvg` | `edgePixelMaxFf` |
| --- | ---: | ---: |
| **BEFORE** (animated Bayer) | **1.452** | **5** |
| **AFTER** (spatial-only) | **0.025** | **1** |
| Pass band | ~0.001–0.06 | ≤1 |

AFTER matches dither-off / time-pinned residual. `uTime` still advances (Δ≈119) with amp **0.02** — crawl is gone.

### AFTER full log (`edge-strobe-dither-bisect.mjs`)

```
CASE ditherON_timeLive
  ditherON_timeLive edgeFf= 1 stripMae= 0.025 uTimeΔ= 118.901 dither= 0.02
CASE ditherOFF_timeLive
  ditherOFF_timeLive edgeFf= 1 stripMae= 0.053 uTimeΔ= 124.961 dither= 0
CASE ditherON_timePinned
  ditherON_timePinned edgeFf= 0 stripMae= 0.001 uTimeΔ= 0 dither= 0.02
```

### BEFORE (pre-fix, same instrument)

```
ditherON_timeLive edgeFf= 5 stripMae= 1.452
ditherOFF_timeLive edgeFf= 1 stripMae= 0.057
ditherON_timePinned edgeFf= 0.928 stripMae= 0.001
```

## Change shipped

- `VolumetricFogPass` COMPOSITE: `bayer4(gl_FragCoord.xy)` — no `uTime` offset
- `outputDither` stays **0.02**
- `fogConfig` + README §12 / §20.9e3 updated

`test:smoke`: passed (not used as strobe proof).
