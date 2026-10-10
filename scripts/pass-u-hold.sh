#!/bin/bash
# Pass U hold test: Desktop + Sidekick, 3 sessions × {3.2, 4.5, native}, floor
# released once before each 60 s idle; gated on 1-min load < 4 (5 min wait).
cd "$(dirname "$0")/.." || exit 1
LOG=tmp/pass-u/hold.log
for r in 1 2 3; do
  for cfg in 3.2 4.5 native; do
    ok=0
    for _ in $(seq 1 10); do l=$(sysctl -n vm.loadavg | awk '{print $2}'); if awk "BEGIN{exit !($l < 4)}"; then ok=1; break; fi; sleep 30; done
    if [ $ok = 0 ]; then echo "$(date +%T) load $l — STOP" >>"$LOG"; exit 2; fi
    echo "$(date +%T) load $l — h$r-$cfg" >>"$LOG"
    node scripts/pass-u.mjs "h$r-$cfg" --cfg "$cfg" --idle --release --stops 1,2 >>"$LOG" 2>&1
  done
done
echo "$(date +%T) DONE" >>"$LOG"
