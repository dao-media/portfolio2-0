#!/usr/bin/env bash
# Re-encode masters/video-fog ProRes 4444 → web VP9 / HEVC.
# Bakes fog density into RGB (grayscale = alpha) AND keeps alpha, so VideoTexture
# still shows fog when browsers drop the alpha plane.
# Does not touch the master MOV.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MASTER="$ROOT/masters/video-fog/seamless-low-cloud-loop-with-alpha-channel.mov"
OUT="$ROOT/public/assets/video/fog"
mkdir -p "$OUT"

if [[ ! -f "$MASTER" ]]; then
  echo "Missing master: $MASTER" >&2
  exit 1
fi

# RGB ← alpha (fog density), A ← alpha. Scale to 1280×720.
VF="scale=1280:720:flags=lanczos,format=rgba,geq=r='alpha(X,Y)':g='alpha(X,Y)':b='alpha(X,Y)':a='alpha(X,Y)',fps=30"

echo "Encoding WebM VP9 (RGB=alpha bake)…"
ffmpeg -y -i "$MASTER" -an -vf "$VF" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 2.5M -crf 30 -row-mt 1 -cpu-used 3 \
  -auto-alt-ref 0 -metadata:s:v:0 alpha_mode="1" \
  "$OUT/cloud-loop.webm"

echo "Encoding HEVC+alpha (Safari)…"
ffmpeg -y -i "$MASTER" -an -vf "$VF" \
  -c:v hevc_videotoolbox -pix_fmt bgra -allow_sw 1 -alpha_quality 0.85 -b:v 5M -tag:v hvc1 \
  "$OUT/cloud-loop.mp4"

echo "Done:"
ls -lh "$OUT/cloud-loop.webm" "$OUT/cloud-loop.mp4"
