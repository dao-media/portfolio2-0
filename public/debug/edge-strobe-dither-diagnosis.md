# Edge strobe — dither within-pass bisect

## (a) Pass
**VolumetricFogPass (composite)**

## (b) Term
**composite uTime phase of Bayer output dither (amp may stay on)**

## (c) Evidence (fixed-pixel @ 640×360, 90 frames, dead-still)

| Case | edgePixelMaxFf | stripMaeAvg | stripMaeMax | uTimeΔ | dither |
| --- | ---: | ---: | ---: | ---: | ---: |
| ditherON_timeLive | 1 | 0.025 | 0.069 | 118.901 | 0.02 |
| ditherOFF_timeLive | 1 | 0.053 | 0.142 | 124.961 | 0 |
| ditherON_timePinned | 0 | 0.001 | 0.055 | 0 | 0.02 |
| ditherON_fogDisabled | 1 | 0.025 | 0.072 | 122.776 | 0.02 |
| ditherON_bloomOnly_fogOff | 0 | 0.001 | 0.049 | 124.284 | 0.02 |

### ditherON_timeLive pixels
```
{
  "edgeTop": {
    "avg": 9,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "meanFrameDelta": 0,
    "n": 90
  },
  "edgeBottom": {
    "avg": 7.072,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "meanFrameDelta": 0,
    "n": 90
  },
  "edgeLeft": {
    "avg": 12.072,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "meanFrameDelta": 0,
    "n": 90
  },
  "edgeRight": {
    "avg": 8.374,
    "peakToPeak": 0.715,
    "maxFrameDelta": 0.715,
    "meanFrameDelta": 0.305,
    "n": 90
  },
  "vigTop": {
    "avg": 9,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "meanFrameDelta": 0,
    "n": 90
  },
  "vigBottom": {
    "avg": 7.072,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "meanFrameDelta": 0,
    "n": 90
  },
  "vigLeft": {
    "avg": 8.326,
    "peakToPeak": 0.715,
    "maxFrameDelta": 0.715,
    "meanFrameDelta": 0.177,
    "n": 90
  },
  "vigRight": {
    "avg": 11.118,
    "peakToPeak": 1,
    "maxFrameDelta": 1,
    "meanFrameDelta": 0.31,
    "n": 90
  },
  "center": {
    "avg": 208.771,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "meanFrameDelta": 0,
    "n": 90
  }
}
```

### ditherOFF_timeLive pixels
```
{
  "edgeTop": {
    "avg": 0,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "meanFrameDelta": 0,
    "n": 90
  },
  "edgeBottom": {
    "avg": 7.144,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "meanFrameDelta": 0,
    "n": 90
  },
  "edgeLeft": {
    "avg": 6.072,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "meanFrameDelta": 0,
    "n": 90
  },
  "edgeRight": {
    "avg": 6.248,
    "peakToPeak": 0.715,
    "maxFrameDelta": 0.715,
    "meanFrameDelta": 0.161,
    "n": 90
  },
  "vigTop": {
    "avg": 0,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "meanFrameDelta": 0,
    "n": 90
  },
  "vigBottom": {
    "avg": 7.073,
    "peakToPeak": 0.072,
    "maxFrameDelta": 0.072,
    "meanFrameDelta": 0.001,
    "n": 90
  },
  "vigLeft": {
    "avg": 6.248,
    "peakToPeak": 0.715,
    "maxFrameDelta": 0.715,
    "meanFrameDelta": 0.113,
    "n": 90
  },
  "vigRight": {
    "avg": 4.055,
    "peakToPeak": 1,
    "maxFrameDelta": 1,
    "meanFrameDelta": 0.392,
    "n": 90
  },
  "center": {
    "avg": 208.771,
    "peakToPeak": 0,
    "maxFrameDelta": 0,
    "meanFrameDelta": 0,
    "n": 90
  }
}
```

## (d) Proposed fix (NOT applied)
Pin/remove uTime from Bayer sample. Re-prove with this script.

## Why earlier bisects said flat
1. `setNoiseFrozen(true)` → `setTime` zeros **composite** `uTime` → Bayer phase frozen.
2. Regional **mean** over an edge band cancels a shifting 4×4 Bayer.
3. Edge band avg≈0 at heavy downsample hid residual.

## Proof bar
NOT fixed until `ditherON_timeLive`-equivalent `edgePixelMaxFf` / `stripMaeAvg` match `ditherOFF_timeLive` (~0). test:smoke is not proof.
