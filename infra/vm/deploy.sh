#!/usr/bin/env bash
# Runs ON the server (CD copies infra/vm here and calls it): pulls the images for one tag, starts
# them, waits until every container is healthy, and goes back to the previous tag if that fails.
#   deploy.sh <tag>        with GHCR_USER and GHCR_TOKEN in the environment (a short-lived token)
set -euo pipefail
cd /opt/logicpath
tag="${1:?usage: deploy.sh <tag>}"
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
previous=$(grep -E '^TAG=' .env | cut -d= -f2 || true)
sed -i '/^TAG=/d' .env && echo "TAG=$tag" >> .env
if docker compose pull --quiet && docker compose up -d --remove-orphans --wait --wait-timeout 240; then
  echo "deployed $tag (was ${previous:-nothing})"
  docker image prune -f >/dev/null
else
  echo "::error::deploy of $tag failed; going back to ${previous:-nothing}" >&2
  docker compose ps >&2 || true
  if [ -n "$previous" ]; then
    sed -i '/^TAG=/d' .env && echo "TAG=$previous" >> .env
    docker compose up -d --wait --wait-timeout 240 || true
  fi
  exit 1
fi
