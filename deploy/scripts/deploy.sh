#!/usr/bin/env bash
set -Eeuo pipefail

REL="${REL:-$(cd "$(dirname "$0")/.." && pwd)}"
export REL
LOG_TAG=deploy
. "$REL/scripts/lib.sh"

mkdir -p "$STATE_DIR" "$RENDERED_DIR"
need WEB_TAG API_TAG
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || die "another deploy is running"

load_shared_env
need APP_DOMAIN OPS_DOMAIN GRAFANA_ADMIN_PASSWORD OPS_BASIC_AUTH_USER OPS_BASIC_AUTH_HASH

ACTOR="${DEPLOY_ACTOR:-unknown}"
log "release ${RELEASE_SHA:-manual} by $ACTOR: web=$WEB_TAG api=$API_TAG"

token_file="$REL/.ghcr-token"
if [ -f "$token_file" ]; then
  [ -n "${GHCR_USER:-}" ] || die "GHCR_USER is required when a registry token is supplied"
  docker login ghcr.io --username "$GHCR_USER" --password-stdin <"$token_file" >/dev/null
  shred -u "$token_file" 2>/dev/null || rm -f "$token_file"
  registry_login=1
fi
trap '[ "${registry_login:-0}" = 1 ] && docker logout ghcr.io >/dev/null 2>&1 || true' EXIT

sync_config() {
  find "$CONFIG_DIR" -mindepth 1 -delete
  cp -a "$REL/config/." "$CONFIG_DIR/"
  chmod -R a+rX "$CONFIG_DIR"
  CONFIG_HASH="$( { find "$CONFIG_DIR" "$RENDERED_DIR" -type f ! -name '*.caddy' -print0 | sort -z | xargs -0 sha256sum; } | sha256sum | cut -c1-16)"
  export CONFIG_HASH
}

render_config() {
  local vars='${APP_DOMAIN} ${OPS_DOMAIN} ${WEB_PORT} ${GRAFANA_PORT} ${DOZZLE_PORT} ${OPS_BASIC_AUTH_USER} ${OPS_BASIC_AUTH_HASH}'
  envsubst "$vars" <"$REL/config/victoriametrics/scrape.yml.tmpl" >"$RENDERED_DIR/scrape.yml.new"
  envsubst "$vars" <"$REL/config/caddy/app.caddy.tmpl" >"$RENDERED_DIR/deckdna-app.caddy.new"
  envsubst "$vars" <"$REL/config/caddy/ops.caddy.tmpl" >"$RENDERED_DIR/deckdna-ops.caddy.new"
  for name in scrape.yml deckdna-app.caddy deckdna-ops.caddy; do mv -f "$RENDERED_DIR/$name.new" "$RENDERED_DIR/$name"; done
  chmod 644 "$RENDERED_DIR"/*
}

wait_for() {
  local description="$1" url="$2" tries="${3:-60}"
  for _ in $(seq 1 "$tries"); do
    curl -fsS -o /dev/null --max-time 3 "$url" && return 0
    sleep 2
  done
  die "$description did not become healthy: $url"
}

apply_app() {
  export WEB_TAG="$1" API_TAG="$2"
  compose deckdna-app app.yml pull --quiet
  compose deckdna-app app.yml up --detach --remove-orphans --wait --wait-timeout 240
}

CURRENT_WEB_TAG="" CURRENT_API_TAG=""
read_state "$STATE_DIR/current.env"
PREV_WEB_TAG="$CURRENT_WEB_TAG" PREV_API_TAG="$CURRENT_API_TAG"

on_failure() {
  local code=$?
  trap - ERR
  log "deploy failed with exit code $code"
  if [ -n "$PREV_WEB_TAG" ]; then
    CURRENT_WEB_TAG="$PREV_WEB_TAG" CURRENT_API_TAG="$PREV_API_TAG"
    apply_app "$PREV_WEB_TAG" "$PREV_API_TAG" >/dev/null 2>&1 && log "rolled back to web=$PREV_WEB_TAG api=$PREV_API_TAG" || log "rollback failed"
  fi
  printf '{"ts":"%s","result":"failed","web":"%s","api":"%s","sha":"%s","actor":"%s"}\n' "$(date -u +%FT%TZ)" "$WEB_TAG" "$API_TAG" "${RELEASE_SHA:-manual}" "$ACTOR" >>"$STATE_DIR/history.jsonl"
  exit "$code"
}
trap on_failure ERR

render_config
sync_config
docker network inspect deckdna >/dev/null 2>&1 || docker network create deckdna >/dev/null

log "updating ops stack"
compose deckdna-ops ops.yml up --detach --remove-orphans
wait_for "grafana" "http://127.0.0.1:$GRAFANA_PORT/api/health" 90

log "updating application stack"
apply_app "$WEB_TAG" "$API_TAG"

log "applying ingress"
sudo -n /opt/deckdna/bin/caddy-apply "$RENDERED_DIR"

log "running smoke test"
SMOKE_TIMEOUT=240 "$REL/scripts/smoke.sh" "http://127.0.0.1:$WEB_PORT"

trap - ERR
{
  echo "PREVIOUS_WEB_TAG=$PREV_WEB_TAG"
  echo "PREVIOUS_API_TAG=$PREV_API_TAG"
} >"$STATE_DIR/previous.env"
{
  echo "CURRENT_WEB_TAG=$WEB_TAG"
  echo "CURRENT_API_TAG=$API_TAG"
  echo "CURRENT_RELEASE=${RELEASE_SHA:-manual}"
  echo "CURRENT_DEPLOYED_AT=$(date -u +%FT%TZ)"
} >"$STATE_DIR/current.env"
ln -sfn "$REL" "$STATE_DIR/current"
printf '{"ts":"%s","result":"ok","web":"%s","api":"%s","sha":"%s","actor":"%s"}\n' "$(date -u +%FT%TZ)" "$WEB_TAG" "$API_TAG" "${RELEASE_SHA:-manual}" "$ACTOR" >>"$STATE_DIR/history.jsonl"

prune_images() {
  local name
  for name in api web; do
    docker image ls --format '{{.Repository}}:{{.Tag}}' "$IMAGE_REPO/deckdna-$name" \
      | grep -v -e ":$WEB_TAG\$" -e ":$API_TAG\$" -e ":$PREV_WEB_TAG\$" -e ":$PREV_API_TAG\$" \
      | xargs -r docker rmi >/dev/null 2>&1 || true
  done
  find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d | sort | head -n -6 | xargs -r rm -rf
}
prune_images

log "deployed web=$WEB_TAG api=$API_TAG"
