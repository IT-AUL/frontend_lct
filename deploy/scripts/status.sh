#!/usr/bin/env bash
set -Eeuo pipefail

REL="${REL:-$(cd "$(dirname "$0")/.." && pwd)}"
LOG_TAG=status
. "$REL/scripts/lib.sh"

CURRENT_WEB_TAG="" CURRENT_API_TAG="" CURRENT_RELEASE="" CURRENT_DEPLOYED_AT=""
PREVIOUS_WEB_TAG="" PREVIOUS_API_TAG=""
read_state "$STATE_DIR/current.env"
read_state "$STATE_DIR/previous.env"

echo "STATE=ok"
echo "WEB_TAG=$CURRENT_WEB_TAG"
echo "API_TAG=$CURRENT_API_TAG"
echo "RELEASE=$CURRENT_RELEASE"
echo "DEPLOYED_AT=$CURRENT_DEPLOYED_AT"
echo "PREVIOUS_WEB_TAG=$PREVIOUS_WEB_TAG"
echo "PREVIOUS_API_TAG=$PREVIOUS_API_TAG"
echo "CONTAINERS_RUNNING=$(docker ps --filter label=com.deckdna.stack=deckdna --format '{{.Names}}' | wc -l)"
echo "CONTAINERS_UNHEALTHY=$(docker ps --filter label=com.deckdna.stack=deckdna --filter health=unhealthy --format '{{.Names}}' | wc -l)"
echo "DISK_USED_PERCENT=$(df --output=pcent / | tail -1 | tr -dc 0-9)"
echo "HISTORY_LAST=$(tail -1 "$STATE_DIR/history.jsonl" 2>/dev/null | tr -d '\n' | tr ' ' '_')"
