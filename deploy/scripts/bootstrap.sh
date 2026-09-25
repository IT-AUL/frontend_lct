#!/usr/bin/env bash
set -Eeuo pipefail

[ "$(id -u)" -eq 0 ] || exec sudo -E bash "$0" "$@"

HERE="$(cd "$(dirname "$0")" && pwd)"
PUBKEY_FILE="${1:?deploy public key file is required}"
APP_DOMAIN="${2:?application domain is required}"
OPS_DOMAIN="${3:?ops domain is required}"

BASE=/srv/deckdna
USER_NAME=deckdna
HELPERS=/opt/deckdna/bin
PORTS=(18100 18101 18102)

say() { printf '==> %s\n' "$*"; }

say "preflight"
for tool in docker caddy curl python3 flock openssl; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
done
docker compose version >/dev/null 2>&1 || { echo "docker compose plugin is missing" >&2; exit 1; }
if ! command -v envsubst >/dev/null; then
  say "installing gettext-base for envsubst"
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends gettext-base >/dev/null
fi
for port in "${PORTS[@]}"; do
  if ss -tln | awk '{print $4}' | grep -q ":$port\$"; then
    docker ps --format '{{.Ports}}' | grep -q "127.0.0.1:$port->" || { echo "port $port is already in use" >&2; exit 1; }
  fi
done
[ -s "$PUBKEY_FILE" ] || { echo "public key file is empty" >&2; exit 1; }
grep -qE '^ssh-(ed25519|rsa) ' "$PUBKEY_FILE" || { echo "unexpected public key format" >&2; exit 1; }

say "service user"
if ! id "$USER_NAME" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$BASE" --shell /bin/bash --user-group "$USER_NAME"
fi
usermod -p '*' "$USER_NAME"
usermod -aG docker "$USER_NAME"

say "directories"
chown root:root "$BASE"
chmod 755 "$BASE"
rm -f "$BASE/.bashrc" "$BASE/.profile" "$BASE/.bash_logout"
for dir in releases shared state rendered config; do
  install -d -m 755 -o "$USER_NAME" -g "$USER_NAME" "$BASE/$dir"
done
chmod 750 "$BASE/shared"
install -d -m 750 -o "$USER_NAME" -g "$USER_NAME" "$BASE/state/docker"
install -d -m 755 -o "$USER_NAME" -g "$USER_NAME" /srv/backups/deckdna

say "privileged helpers"
install -d -m 755 -o root -g root "$HELPERS"
install -m 755 -o root -g root "$HERE/entrypoint.sh" "$HELPERS/entrypoint"
install -m 755 -o root -g root "$HERE/caddy-apply.sh" "$HELPERS/caddy-apply"
sudoers_file=/etc/sudoers.d/deckdna
printf '%s ALL=(root) NOPASSWD: %s/caddy-apply %s/rendered\n' "$USER_NAME" "$HELPERS" "$BASE" >"$sudoers_file.tmp"
chmod 440 "$sudoers_file.tmp"
visudo -cf "$sudoers_file.tmp" >/dev/null
mv "$sudoers_file.tmp" "$sudoers_file"

say "ssh access (forced command)"
install -d -m 755 -o root -g root "$BASE/.ssh"
key_material="$(cat "$PUBKEY_FILE")"
printf 'restrict,command="%s/entrypoint" %s\n' "$HELPERS" "$key_material" >"$BASE/.ssh/authorized_keys"
chown root:root "$BASE/.ssh/authorized_keys"
chmod 644 "$BASE/.ssh/authorized_keys"

say "shared environment"
env_file="$BASE/shared/.env"
if [ ! -f "$env_file" ]; then
  grafana_password="$(openssl rand -base64 30 | tr -d '/+=\n' | cut -c1-24)"
  ops_password="$(openssl rand -base64 30 | tr -d '/+=\n' | cut -c1-24)"
  ops_hash="$(caddy hash-password --plaintext "$ops_password")"
  umask 077
  cat >"$env_file" <<ENV
APP_DOMAIN=$APP_DOMAIN
OPS_DOMAIN=$OPS_DOMAIN
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=$grafana_password
OPS_BASIC_AUTH_USER=ops
OPS_BASIC_AUTH_PASSWORD=$ops_password
OPS_BASIC_AUTH_HASH='$ops_hash'
DECKDNA_MOCK_PROVIDER=true
DECKDNA_PROVIDER_BASE_URL=
DECKDNA_PROVIDER_API_KEY=
DECKDNA_MODEL_TEXT=
DECKDNA_MODEL_VISION=
API_MEM_LIMIT=1536m
API_CPUS=2
METRICS_RETENTION=30d
LOGS_RETENTION=14d
ENV
  chown "$USER_NAME:$USER_NAME" "$env_file"
  chmod 600 "$env_file"
  say "generated credentials in $env_file"
else
  say "keeping existing $env_file"
fi

say "docker network"
docker network inspect deckdna >/dev/null 2>&1 || docker network create deckdna >/dev/null

say "log rotation and backups"
cat >/etc/logrotate.d/deckdna <<ROT
$BASE/state/deploy.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    su $USER_NAME $USER_NAME
}
ROT
cat >/etc/cron.d/deckdna-backup <<CRON
17 3 * * * $USER_NAME [ -x $BASE/current/scripts/backup.sh ] && $BASE/current/scripts/backup.sh >>$BASE/state/backup.log 2>&1
CRON
chmod 644 /etc/cron.d/deckdna-backup

say "done"
echo "app:  https://$APP_DOMAIN"
echo "ops:  https://$OPS_DOMAIN"
echo "credentials: $env_file (readable by root and $USER_NAME only)"
