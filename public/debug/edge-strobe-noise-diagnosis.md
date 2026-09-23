# Edge strobe — noise-unfrozen follow-up

## (a) Pass
**NOT REPRODUCED under dead-still lab conditions**

## (b) Term
**With frozen neon+gradient and settled fog/bloom, edge maxFrameDelta ≈ 0 even with live fog noise in this run — strobe may require live neon flicker, cursor motion, or a different timing window (during bloom soft-return / heavy-effects arm)**

## (c) Evidence (180 frames each, dead-still camera)

| Case | edge maxFf avg | center maxFf |
| --- | ---: | ---: |
| noiseFrozen_fogBloom | 0 | 0 |
| noiseLive_fogBloom | 0 | 0 |
| noiseLive_fogOnly | 0 | 0 |
| noiseLive_bloomOnly | 0 | 0 |
| noiseLive_renderOnly | 0 | 0 |
| noiseLive_fogBloom_parallax | 0 | 0 |
| noiseFrozen_fogOnly | 0 | 0 |

Live fog+bloom regions:
```
{
  "top": {
    "avg": 0,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "hfEnergy": 0,
    "n": 180
  },
  "bottom": {
    "avg": 0,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "hfEnergy": 0,
    "n": 180
  },
  "left": {
    "avg": 0,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "hfEnergy": 0,
    "n": 180
  },
  "right": {
    "avg": 0,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "hfEnergy": 0,
    "n": 180
  },
  "center": {
    "avg": 1.3,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "hfEnergy": 0.05,
    "n": 180
  }
}
```

Frozen fog+bloom regions:
```
{
  "top": {
    "avg": 0,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "hfEnergy": 0,
    "n": 180
  },
  "bottom": {
    "avg": 0,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "hfEnergy": 0,
    "n": 180
  },
  "left": {
    "avg": 0,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "hfEnergy": 0,
    "n": 180
  },
  "right": {
    "avg": 0,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "hfEnergy": 0,
    "n": 180
  },
  "center": {
    "avg": 1.3,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "hfEnergy": 0.04,
    "n": 180
  }
}
```

## (d) Proposed fix (NOT applied)
Next probe: (1) during bloom soft-return only, noise live; (2) neon flicker enabled; (3) sample at native canvas resolution without downsample. Do not claim fixed.

## Proof bar
Future fix must drive **noiseLive_fogBloom** edge maxFf → ~0 under this same script.
