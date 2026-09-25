#!/usr/bin/env bash
set -Eeuo pipefail

REL="${REL:-$(cd "$(dirname "$0")/.." && pwd)}"
export REL
LOG_TAG=rollback
. "$REL/scripts/lib.sh"

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || die "another deploy is running"

load_shared_env
PREVIOUS_WEB_TAG="" PREVIOUS_API_TAG=""
read_state "$STATE_DIR/previous.env"
[ -n "$PREVIOUS_WEB_TAG" ] && [ -n "$PREVIOUS_API_TAG" ] || die "no previous release recorded"

CURRENT_WEB_TAG="" CURRENT_API_TAG=""
read_state "$STATE_DIR/current.env"
log "rolling back to web=$PREVIOUS_WEB_TAG api=$PREVIOUS_API_TAG"

export WEB_TAG="$PREVIOUS_WEB_TAG" API_TAG="$PREVIOUS_API_TAG"
compose deckdna-app app.yml up --detach --remove-orphans --wait --wait-timeout 240
SMOKE_TIMEOUT=240 "$REL/scripts/smoke.sh" "http://127.0.0.1:$WEB_PORT"

{
  echo "PREVIOUS_WEB_TAG=$CURRENT_WEB_TAG"
  echo "PREVIOUS_API_TAG=$CURRENT_API_TAG"
} >"$STATE_DIR/previous.env"
{
  echo "CURRENT_WEB_TAG=$PREVIOUS_WEB_TAG"
  echo "CURRENT_API_TAG=$PREVIOUS_API_TAG"
  echo "CURRENT_RELEASE=rollback"
  echo "CURRENT_DEPLOYED_AT=$(date -u +%FT%TZ)"
} >"$STATE_DIR/current.env"
printf '{"ts":"%s","result":"rollback","web":"%s","api":"%s","sha":"rollback","actor":"%s"}\n' "$(date -u +%FT%TZ)" "$PREVIOUS_WEB_TAG" "$PREVIOUS_API_TAG" "${DEPLOY_ACTOR:-manual}" >>"$STATE_DIR/history.jsonl"
log "rollback complete"
