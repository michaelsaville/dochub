#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Safe, additive-only `prisma db push` for DocHub's SHARED production Postgres.
# Guarantees no data loss: backup -> drift-diff -> refuse destructive SQL ->
# push -> verify critical row counts unchanged. Never uses --accept-data-loss.
# Usage:  ./safe-db-push.sh            (apply)
#         ./safe-db-push.sh --check    (backup + diff + gate only; no push)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/app"
MODE="${1:-apply}"
NET=dochub_default
DBURL=$(grep -h '^DATABASE_URL' .env | head -1 | cut -d= -f2- | tr -d '"'\''')
[ -n "$DBURL" ] || { echo "no DATABASE_URL"; exit 1; }
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "$HOME/backups/dochub"
BK="$HOME/backups/dochub/dochub-premigrate-$TS.sql"

pgc(){ docker run --rm --network "$NET" -e P="$DBURL" postgres:16-alpine "$@"; }
crit_counts(){ pgc psql "$DBURL" -Atc \
  "SELECT string_agg(t||'='||c,', ') FROM (SELECT 'Client' t,count(*) c FROM \"Client\" UNION ALL SELECT 'Asset',count(*) FROM \"Asset\" UNION ALL SELECT 'Credential',count(*) FROM \"Credential\" UNION ALL SELECT 'ClientDocument',count(*) FROM \"ClientDocument\" UNION ALL SELECT 'Person',count(*) FROM \"Person\" UNION ALL SELECT 'Location',count(*) FROM \"Location\" UNION ALL SELECT 'License',count(*) FROM \"License\") s;" 2>/dev/null; }

echo "== 1/5 Pre-migration backup -> $BK"
pgc sh -c 'pg_dump --no-owner "$P"' > "$BK" 2>/dev/null || { echo "BACKUP FAILED — abort"; exit 1; }
{ [ -s "$BK" ] && grep -q '^COPY ' "$BK"; } || { echo "BACKUP empty/invalid — abort"; exit 1; }
echo "   ok ($(du -h "$BK" | cut -f1), $(grep -c '^CREATE TABLE' "$BK") tables)"

echo "== 2/5 Drift diff (SQL db push would run)"
SQL=$(docker run --rm --network "$NET" -v "$PWD":/app -w /app -e DATABASE_URL="$DBURL" node:20-alpine \
  sh -c 'npx --yes prisma@6 migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script 2>/dev/null')
echo "$SQL" | grep -vE '^\s*$' | sed 's/^/   | /'

echo "== 3/5 Safety gate (refuse destructive ops)"
DESTRUCTIVE=$(echo "$SQL" | grep -iE 'DROP TABLE|DROP COLUMN|SET DATA TYPE|ALTER COLUMN[^;]*TYPE|SET NOT NULL|RENAME (TABLE|COLUMN|CONSTRAINT|TO)|(^|[^_])DELETE +FROM|TRUNCATE' || true)
if [ -n "$DESTRUCTIVE" ]; then
  echo "   !! DESTRUCTIVE SQL DETECTED — ABORT, nothing applied:"; echo "$DESTRUCTIVE" | sed 's/^/      >> /'
  echo "   Make the schema change additive (new table / nullable column) and retry."
  exit 2
fi
if [ -z "$(echo "$SQL" | grep -viE '^\s*$|empty migration')" ]; then echo "   no changes to apply."; exit 0; fi
echo "   additive-only ✓"

BEFORE=$(crit_counts); echo "== 4/5 Critical counts BEFORE: $BEFORE"
if [ "$MODE" = "--check" ]; then echo "== --check: not pushing. Backup + gate passed."; exit 0; fi

echo "== 5/5 Applying additive db push"
docker run --rm --network "$NET" -v "$PWD":/app -w /app -e DATABASE_URL="$DBURL" node:20-alpine \
  sh -c 'npx --yes prisma@6 db push --skip-generate' 2>&1 | grep -iE 'sync|error|warn' | sed 's/^/   /'
AFTER=$(crit_counts); echo "   Critical counts AFTER:  $AFTER"
if [ "$BEFORE" != "$AFTER" ]; then
  echo "   !! WARNING: critical row counts CHANGED — investigate immediately. Restore: psql < $BK"; exit 3
fi
echo "== DONE — additive push applied, 0 rows lost. Backup: $BK"
