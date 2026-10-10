#!/bin/bash
# Pass U driver: 3 rounds × 5 configs, order rotated each round (round 1 adds
# the 60 s idle + captures), then a VRAM census per config. Before every
# session the 1-min load average must be < 4: it waits up to 5 min, then
# stops the whole run (logged to tmp/pass-u/run.log).
cd "$(dirname "$0")/.." || exit 1
mkdir -p tmp/pass-u
LOG=tmp/pass-u/run.log
CFGS=(2.3 3.2 4.5 native cap)
waitload() {
  for _ in $(seq 1 10); do
    l=$(sysctl -n vm.loadavg | awk '{print $2}')
    if awk "BEGIN{exit !($l < 4)}"; then echo "$(date +%T) load $l ok — $1" >>"$LOG"; return 0; fi
    sleep 30
  done
  echo "$(date +%T) load $l >= 4 for 5 min — STOP before $1" >>"$LOG"
  exit 2
}
for round in 1 2 3; do
  for k in 0 1 2 3 4; do
    cfg=${CFGS[$(((k + round - 1) % 5))]}
    waitload "r$round $cfg"
    extra="--cycles 4"
    [ "$round" = 1 ] && extra="--idle --cycles 4"
    node scripts/pass-u.mjs "r$round-$cfg" --cfg "$cfg" $extra >>"$LOG" 2>&1
  done
done
for cfg in "${CFGS[@]}"; do
  waitload "vram $cfg"
  q="restmp=$cfg"
  [ "$cfg" = cap ] && q="restmp=2.3&canvascap=1"
  node scripts/pass-o-vram.mjs "u-vram-$cfg" --cycles 3 --query "$q" >>"$LOG" 2>&1
done
echo "$(date +%T) DONE" >>"$LOG"
