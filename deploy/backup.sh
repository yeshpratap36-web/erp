#!/usr/bin/env bash
# Nightly database backup (installed in /etc/cron.d by server.sh). Run manually any time:
#   sudo /opt/college-erp/backup.sh
# Restore (dumps include DROP … IF EXISTS, so they restore over existing data; stop the app first):
#   gunzip -c backups/<file>.sql.gz | docker compose --env-file stack.env -f compose.yml exec -T db psql -U erp -d college_erp
set -euo pipefail
cd "$(dirname "$0")"
# Read KEY=VALUE lines without executing anything (values may contain spaces, quotes, $…).
load_env() {
  local line key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"; val="${line#*=}"
    key="${key//[[:space:]]/}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "Invalid line in $1: $key" >&2; return 1; }
    if [[ "$val" =~ ^\"(.*)\"$ || "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
    export "$key=$val"
  done < "$1"
}
load_env ./deploy.env
load_env ./secrets.env

if docker compose version >/dev/null 2>&1; then COMPOSE=(docker compose); else COMPOSE=(docker-compose); fi
dc() { "${COMPOSE[@]}" --env-file stack.env -f compose.yml "$@"; }

file="college_erp-$(date -u +%Y%m%d-%H%M%S).sql.gz"
dc exec -T db pg_dump -U erp -d college_erp --no-owner --clean --if-exists | gzip -9 > "backups/${file}.partial"
mv "backups/${file}.partial" "backups/${file}"
echo "$(date -u +%FT%TZ) backup ${file} ($(du -h "backups/${file}" | cut -f1))"

find backups -name 'college_erp-*.sql.gz' -mtime +"${BACKUP_RETENTION_DAYS:-14}" -delete

if [[ "${BACKUP_UPLOAD:-true}" == "true" ]]; then
  dc exec -T app node docker/upload-backup.mjs "/backups/${file}"
fi
