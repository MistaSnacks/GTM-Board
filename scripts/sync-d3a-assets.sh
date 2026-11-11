#!/bin/bash
# Copies the d3a code-built craft pieces from the TAILOR repo into the dashboard.
# The pieces are generated in TAILOR (scripts/design/build-d3a-code.ts). Do not edit the copies here.
# Usage: scripts/sync-d3a-assets.sh [path to a TAILOR checkout] [git ref]
set -euo pipefail
TAILOR="${1:-/Users/admin/TAILOR}"
REF="${2:-origin/main}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/dashboard/public/d3a-code"

FILES=(ground-linen label-cream app/label-cream tex-scarlet chips/patch-mustard)
for cloth in cream denim mustard olive terracotta tan; do FILES+=("patch-$cloth"); done
for pill in charcoal denim denim-twill mustard olive scarlet tan terracotta; do
  for part in l r stitch cloth; do FILES+=("pills/$pill-$part"); done
done

rm -rf "$DEST" && mkdir -p "$DEST"
git -C "$TAILOR" archive "$REF" $(printf 'public/d3a-code/%s.webp ' "${FILES[@]}") | tar -x -C "$DEST" --strip-components=2
git -C "$TAILOR" show "$REF:components/unauth/craft/pill-slices.generated.css" > "$DEST/../../app/d3a-pills.generated.css"
git -C "$TAILOR" rev-parse "$REF" > "$DEST/SOURCE_COMMIT"
echo "copied ${#FILES[@]} pieces from TAILOR $(cut -c1-8 "$DEST/SOURCE_COMMIT") to $DEST"
