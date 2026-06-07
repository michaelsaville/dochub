#!/usr/bin/env bash
# Backs up the DocHub /uploads Docker volume (client files/attachments).
# The uploads volume is NOT part of the Postgres dump, so without this a
# volume loss would orphan every ClientAttachment row. Pairs with the
# /api/cron/uploads-integrity check that alarms on missing files.
set -euo pipefail

VOLUME="dochub_uploads"
DIR="$HOME/dochub/backups/uploads"
KEEP=14

mkdir -p "$DIR"
TS=$(date +%Y%m%d_%H%M%S)
OUT="uploads_${TS}.tar.gz"

docker run --rm \
  -v "${VOLUME}":/data:ro \
  -v "${DIR}":/backup \
  alpine \
  tar czf "/backup/${OUT}" -C /data . 2>/dev/null

# Retain only the most recent $KEEP archives.
ls -1t "${DIR}"/uploads_*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

SIZE=$(du -h "${DIR}/${OUT}" | cut -f1)
echo "[$(date +%Y-%m-%dT%H:%M:%S)] uploads backup -> ${OUT} (${SIZE})"
