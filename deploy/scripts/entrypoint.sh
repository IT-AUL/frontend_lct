#!/usr/bin/env bash
set -Eeuo pipefail

BASE=/srv/deckdna
umask 022

fail() { echo "entrypoint: $*" >&2; exit 126; }

command_line="${SSH_ORIGINAL_COMMAND:-}"
[ -n "$command_line" ] || fail "interactive sessions are not allowed"

read -r action arguments <<<"$command_line"

parse_arguments() {
  local pair key value
  for pair in $arguments; do
    [[ "$pair" =~ ^([A-Z_]+)=([A-Za-z0-9._:/@-]{1,120})$ ]] || fail "malformed argument"
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    case "$key" in
      WEB_TAG|API_TAG|RELEASE_SHA|GHCR_USER|DEPLOY_ACTOR) export "$key=$value" ;;
      *) fail "argument $key is not allowed" ;;
    esac
  done
}

case "$action" in
  deploy)
    parse_arguments
    [ -n "${WEB_TAG:-}" ] && [ -n "${API_TAG:-}" ] || fail "WEB_TAG and API_TAG are required"
    release="$BASE/releases/$(date -u +%Y%m%d%H%M%S)-${RELEASE_SHA:-manual}"
    mkdir -p "$release"
    tar --extract --gzip --no-same-owner --no-same-permissions --directory "$release"
    [ -x "$release/scripts/deploy.sh" ] || fail "release archive is incomplete"
    export REL="$release"
    exec "$release/scripts/deploy.sh"
    ;;
  rollback)
    [ -x "$BASE/current/scripts/rollback.sh" ] || fail "nothing to roll back"
    export REL="$(readlink -f "$BASE/current")"
    exec "$BASE/current/scripts/rollback.sh"
    ;;
  status)
    [ -x "$BASE/current/scripts/status.sh" ] || { echo "STATE=empty"; exit 0; }
    export REL="$(readlink -f "$BASE/current")"
    exec "$BASE/current/scripts/status.sh"
    ;;
  *)
    fail "command not allowed"
    ;;
esac
