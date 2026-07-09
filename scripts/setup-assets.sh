#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/public/assets/models"
SIBLING="$ROOT/../daneoleary-webflow/custom-code/assets/models"
GITHUB_REPO="https://github.com/dao-media/daneoleary-webflow.git"
CACHE="$ROOT/.cache/daneoleary-webflow-assets"

mkdir -p "$ROOT/public/assets"

resolve_source() {
  if [ -f "$SIBLING/pc-source/pc-from-source.glb" ]; then
    echo "$SIBLING"
    return
  fi

  if [ -f "$CACHE/custom-code/assets/models/pc-source/pc-from-source.glb" ]; then
    echo "$CACHE/custom-code/assets/models"
    return
  fi

  echo "Fetching model assets from GitHub (dao-media/daneoleary-webflow)..." >&2
  rm -rf "$CACHE"
  git clone --depth 1 --filter=blob:none --sparse "$GITHUB_REPO" "$CACHE"
  (
    cd "$CACHE"
    git sparse-checkout set custom-code/assets/models
  )

  if [ ! -f "$CACHE/custom-code/assets/models/pc-source/pc-from-source.glb" ]; then
    echo "Failed to fetch pc-from-source.glb from GitHub." >&2
    exit 1
  fi

  echo "$CACHE/custom-code/assets/models"
}

SOURCE="$(resolve_source)"

if [ -L "$TARGET" ]; then
  CURRENT="$(readlink "$TARGET")"
  if [ "$CURRENT" = "$SOURCE" ]; then
    echo "Assets linked: $TARGET -> $SOURCE"
    exit 0
  fi
  rm "$TARGET"
elif [ -e "$TARGET" ]; then
  echo "Assets path exists and is not a symlink: $TARGET" >&2
  echo "Remove it manually, then re-run this script." >&2
  exit 1
fi

ln -sf "$SOURCE" "$TARGET"
echo "Linked $TARGET -> $SOURCE"
