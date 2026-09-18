#!/usr/bin/env bash
# Host cron wrapper for the Notes Intake source reaper. Reads DB creds from
# .env and resolves the db container IP dynamically (survives restarts).
set -euo pipefail
cd /home/msaville/dochub/app
ENV=/home/msaville/dochub/.env
U=$(grep -oP "(?<=POSTGRES_USER=).*" "$ENV")
P=$(grep -oP "(?<=POSTGRES_PASSWORD=).*" "$ENV")
DB=$(grep -oP "(?<=POSTGRES_DB=).*" "$ENV")
IP=$(docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" dochub-db-1 2>/dev/null || true)
[ -n "$IP" ] || IP=172.18.0.9
export DATABASE_URL="postgresql://$U:$P@$IP:5432/$DB"
exec /usr/bin/node scripts/notes-source-reaper.mjs
