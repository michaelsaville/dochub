#!/usr/bin/env bash
#
# DocHub deploy — pull the CI-built image from GHCR and recreate the app.
#
# Why this exists: the bundled Watchtower is non-functional on this host (it
# runs but never polls — containerd image-store incompatibility), and on
# 2026-05-29 the GHCR pull credential (a classic PAT in ~/.docker/config.json)
# had expired, silently breaking auto-deploy. This script replaces Watchtower
# with an explicit, reliable deploy you run after CI finishes a pushed commit:
#
#     ~/dochub/deploy.sh
#
# It self-heals GHCR auth by re-logging in from the `gh` CLI token each run, so
# an expired docker credential can't break deploys again (as long as `gh` stays
# authenticated). It always recreates from the current :latest rather than
# diffing image IDs, because this host's containerd store reports image IDs
# inconsistently between `docker images`, `docker inspect`, and compose.
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="ghcr.io/michaelsaville/dochub:latest"

echo "[deploy] refreshing GHCR login from gh token ..."
gh auth token | docker login ghcr.io -u michaelsaville --password-stdin >/dev/null

echo "[deploy] pulling $IMAGE ..."
docker pull "$IMAGE" >/dev/null

echo "[deploy] recreating app container ..."
docker compose rm -sf app >/dev/null
docker compose up -d app >/dev/null

echo "[deploy] waiting for health ..."
for i in $(seq 1 24); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login || true)
  if [ "$code" = "200" ]; then
    echo "[deploy] healthy (login 200) — running image: $(docker inspect -f '{{.Image}}' dochub-app-1)"
    docker image prune -f >/dev/null 2>&1 || true
    echo "[deploy] done."
    exit 0
  fi
  sleep 5
done

echo "[deploy] ERROR: app did not return 200 on /login within 120s" >&2
docker compose logs --tail 30 app >&2 || true
exit 1
