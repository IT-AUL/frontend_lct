#!/usr/bin/env bash
BASE="${DECKDNA_BASE:-/srv/deckdna}"
STATE_DIR="$BASE/state"
SHARED_ENV="$BASE/shared/.env"
RENDERED_DIR="$BASE/rendered"
CONFIG_DIR="$BASE/config"
IMAGE_REPO="ghcr.io/it-aul"

log() { printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${LOG_TAG:-deploy}" "$*" | tee -a "$STATE_DIR/deploy.log" >&2; }
die() { log "ERROR: $*"; exit 1; }
need() { for v in "$@"; do [ -n "${!v:-}" ] || die "missing required variable $v"; done; }

load_shared_env() {
  [ -f "$SHARED_ENV" ] || die "missing $SHARED_ENV (run bootstrap first)"
  set -a
  . "$SHARED_ENV"
  set +a
  export WEB_PORT="${WEB_PORT:-18100}" GRAFANA_PORT="${GRAFANA_PORT:-18101}" DOZZLE_PORT="${DOZZLE_PORT:-18102}"
  export RENDERED_DIR CONFIG_DIR
  export DOCKER_CONFIG="${DOCKER_CONFIG:-$STATE_DIR/docker}"
  mkdir -p "$DOCKER_CONFIG"
}

compose() {
  local project="$1" file="$2"
  shift 2
  docker compose --project-name "$project" --env-file "$SHARED_ENV" -f "$REL/compose/$file" "$@"
}

read_state() { [ -f "$1" ] && set -a && . "$1" && set +a || true; }
