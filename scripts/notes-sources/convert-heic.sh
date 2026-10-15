#!/usr/bin/env bash
# Pre-convert HEIC note attachments to JPEG for the Notes Intake source preview
# (the app container's libvips can't decode HEVC). Cache key = sha256(bytes)[:32],
# matching app/lib/notes-intake-source.ts. Idempotent.
#   convert-heic.sh <source-dir>...      (default cache: ~/dochub/notes-sources/heic-cache)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CACHE="${NOTES_HEIC_CACHE_HOST:-$HOME/dochub/notes-sources/heic-cache}"
export SHARP_PATH="${SHARP_PATH:-$HOME/smellymelly/node_modules/sharp}"
mkdir -p "$CACHE"; ok=0; bad=0
for dir in "$@"; do
  while IFS= read -r -d '' f; do
    out="$CACHE/$(sha256sum "$f" | cut -c1-32).jpg"
    [ -s "$out" ] && { ok=$((ok+1)); continue; }
    if python3 "$HERE/heic2jpg.py" "$f" "$out" </dev/null 2>/dev/null; then ok=$((ok+1)); else bad=$((bad+1)); echo "FAIL $f" >&2; rm -f "$out"; fi
  done < <(find "$dir" -iname '*.heic' -print0)
done
echo "converted/cached=$ok failed=$bad"
