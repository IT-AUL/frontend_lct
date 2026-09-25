#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE=/srv/deckdna/rendered
TARGET=/etc/caddy/apps.d
FILES=(deckdna-app.caddy deckdna-ops.caddy)

[ "$(readlink -f "${1:-}")" = "$SOURCE" ] || { echo "caddy-apply: unexpected source" >&2; exit 2; }

backup="$(mktemp -d)"
trap 'rm -rf "$backup"' EXIT

for file in "${FILES[@]}"; do
  [ -f "$SOURCE/$file" ] || { echo "caddy-apply: missing $file" >&2; exit 2; }
  [ -f "$TARGET/$file" ] && cp -p "$TARGET/$file" "$backup/$file"
done

changed=0
for file in "${FILES[@]}"; do
  if ! cmp -s "$SOURCE/$file" "$TARGET/$file" 2>/dev/null; then
    install -m 644 -o root -g root "$SOURCE/$file" "$TARGET/$file"
    changed=1
  fi
done

[ "$changed" -eq 1 ] || { echo "caddy-apply: no changes"; exit 0; }

if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  echo "caddy-apply: validation failed, restoring previous files" >&2
  for file in "${FILES[@]}"; do
    if [ -f "$backup/$file" ]; then install -m 644 -o root -g root "$backup/$file" "$TARGET/$file"; else rm -f "$TARGET/$file"; fi
  done
  exit 1
fi

systemctl reload caddy
echo "caddy-apply: reloaded"
