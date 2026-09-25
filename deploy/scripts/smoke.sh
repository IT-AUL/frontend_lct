#!/usr/bin/env bash
set -Eeuo pipefail
BASE_URL="${1:?usage: smoke.sh <base-url>}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TIMEOUT="${SMOKE_TIMEOUT:-180}"

api() { curl -fsS --max-time 60 "$@"; }
json() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
step() { printf '  smoke: %s\n' "$*" >&2; }

if [ -z "${SMOKE_API_ONLY:-}" ]; then
  step "web health"
  api -o /dev/null "$BASE_URL/healthz"
fi
step "api ready"
api -o /dev/null "$BASE_URL/api/v1/health/ready"
step "version"
api "$BASE_URL/api/v1/version" | json "d['version']" >/dev/null
step "capabilities"
api "$BASE_URL/api/v1/capabilities" | json "len(d['exporters'])" >/dev/null

step "create project"
PID="$(api -X POST "$BASE_URL/api/v1/projects" -H 'content-type: application/json' -d '{"name":"smoke-check"}' | json "d['id']")"
cleanup() {
  curl -sS --max-time 20 -X DELETE "$BASE_URL/api/v1/projects/$PID" -o /dev/null || true
  [ -z "${DECK:-}" ] || rm -f "$DECK"
}
trap cleanup EXIT

step "upload template"
TID="$(api -X POST "$BASE_URL/api/v1/projects/$PID/templates" -F "file=@$HERE/smoke/template.pptx;filename=smoke.pptx" | json "d['id']")"
api -X POST "$BASE_URL/api/v1/templates/$TID/analyze" -H 'content-type: application/json' -d '{}' -o /dev/null
step "upload content"
CP="$(api -X POST "$BASE_URL/api/v1/projects/$PID/content-packs" -F "files=@$HERE/smoke/brief.md;filename=brief.md" -F 'brief={"language":"ru"}' | json "d['content_pack']['id']")"

step "generate"
BODY="$(printf '{"template_id":"%s","content_pack_id":"%s","brief":{"purpose":"product","audience":"smoke","language":"ru","target_slide_count":12},"variants":[{"strategy":"balanced"}]}' "$TID" "$CP")"
RUN="$(api -X POST "$BASE_URL/api/v1/projects/$PID/generations" -H 'content-type: application/json' -d "$BODY" | json "d['generation_id']")"

deadline=$(( $(date +%s) + TIMEOUT ))
while :; do
  STATE="$(api "$BASE_URL/api/v1/generations/$RUN" | json "d['state']")"
  case "$STATE" in
    completed) break ;;
    failed|canceled) echo "generation ended as $STATE" >&2; exit 1 ;;
  esac
  [ "$(date +%s)" -lt "$deadline" ] || { echo "generation timed out after ${TIMEOUT}s (state=$STATE)" >&2; exit 1; }
  sleep 2
done

step "download deck"
ART="$(api "$BASE_URL/api/v1/generations/$RUN/variants" | json "d['items'][0]['deck_artifact_id']")"
DECK="$(mktemp)"
api -o "$DECK" "$BASE_URL/api/v1/artifacts/$ART/download"
MAGIC="$(head -c 2 "$DECK")"
[ "$MAGIC" = "PK" ] || { echo "downloaded deck is not a zip package" >&2; exit 1; }
step "ok"
