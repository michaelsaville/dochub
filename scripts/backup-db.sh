#!/usr/bin/env bash
# Daily backup of the SHARED dochub Postgres to ~/backups/dochub/.
# This one cluster backs 8 app schemas (dochub/public, tickethub, fleethub,
# smellymelly, photohub, bizdev, portal, opshub) plus the pcc_scout database,
# so this uses pg_dumpall to capture every database AND the role definitions.
# Keeps the most recent 30 days; older files removed.
set -euo pipefail

BACKUP_DIR="$HOME/backups/dochub"
RETENTION_DAYS=30
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
OUTFILE="$BACKUP_DIR/dochub_full_${TIMESTAMP}.sql.gz"
MIN_BYTES=5000000   # a healthy dump is ~22MB gz; anything under 5MB is a failure

mkdir -p "$BACKUP_DIR"

# Dump from inside the postgres container, then gzip on the host.
docker exec dochub-db-1 pg_dumpall -U dochub | gzip -9 > "$OUTFILE"

# Refuse to keep a truncated or empty file on disk. pg_dumpall can exit mid-stream
# and still leave a parseable-looking prefix, so check size, not just non-empty.
ACTUAL=$(stat -c %s "$OUTFILE")
if [ "$ACTUAL" -lt "$MIN_BYTES" ]; then
  echo "ERROR: backup is only ${ACTUAL} bytes (expected >= ${MIN_BYTES}), removing and exiting non-zero" >&2
  rm -f "$OUTFILE"
  exit 1
fi

# Verify every expected schema actually made it into the dump.
# Decompress once and collect the schema list; piping into `grep -q` per schema
# would SIGPIPE gzip and trip `pipefail`, reporting every schema as missing.
FOUND=$(gzip -dc "$OUTFILE" | grep -oP '(?<=^CREATE SCHEMA )[a-z_]+' | sort -u)
MISSING=""
for s in tickethub fleethub smellymelly photohub bizdev portal opshub; do
  printf '%s\n' "$FOUND" | grep -qx "$s" || MISSING="$MISSING $s"
done
if [ -n "$MISSING" ]; then
  echo "ERROR: dump is missing schema(s):$MISSING - removing and exiting non-zero" >&2
  rm -f "$OUTFILE"
  exit 1
fi

# Rotation
find "$BACKUP_DIR" -maxdepth 1 -name 'dochub_full_*.sql.gz' -type f \
  -mtime +"$RETENTION_DAYS" -delete

# Symlink to latest for quick access
ln -sf "$OUTFILE" "$BACKUP_DIR/latest.sql.gz"

echo "Backup OK: $OUTFILE ($(du -h "$OUTFILE" | cut -f1))"
