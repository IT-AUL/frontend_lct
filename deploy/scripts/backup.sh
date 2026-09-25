#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-/srv/backups/deckdna}"
KEEP="${KEEP_DAYS:-7}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

for volume in deckdna_grafana_data deckdna_api_artifacts; do
  docker volume inspect "$volume" >/dev/null 2>&1 || continue
  docker run --rm --network none -v "$volume:/data:ro" -v "$BACKUP_DIR:/backup" alpine:3.22 \
    tar czf "/backup/${volume}-${STAMP}.tar.gz" -C /data .
done

cp /srv/deckdna/state/history.jsonl "$BACKUP_DIR/history-${STAMP}.jsonl" 2>/dev/null || true
find "$BACKUP_DIR" -type f -mtime "+$KEEP" -delete
