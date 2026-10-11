#!/usr/bin/env bash
# Runs ON the server (deploy.sh calls it over SSH; `deploy.sh --local` runs it here).
# Idempotent: every run builds a new image, migrates, and swaps the app with a health check.
#
#   server.sh --app-dir /opt/college-erp --src /opt/college-erp/src --tag <version>
#
# Layout of --app-dir:
#   deploy.env    your settings (copied from deploy/.env.deploy)       — never overwritten here
#   secrets.env   generated once: database password, session secret   — never regenerated
#   app.env       app container environment (rebuilt every deploy)
#   stack.env     compose variables (rebuilt every deploy)
#   compose.yml, Caddyfile, backup.sh   copied from the source each deploy
#   backups/      nightly pg_dump files
set -euo pipefail

APP_DIR="" SRC="" TAG="" INSTALL_CRON=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --src) SRC="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --no-cron) INSTALL_CRON=0; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$APP_DIR" && -n "$SRC" ]] || { echo "usage: server.sh --app-dir DIR --src DIR [--tag TAG] [--no-cron]" >&2; exit 2; }
TAG="${TAG:-$(date -u +%Y%m%d%H%M%S)}"

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

step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Docker access ────────────────────────────────────────────────────────────
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  sudo -n docker info >/dev/null 2>&1 || die "Docker isn't running or not accessible."
  DOCKER=(sudo -n docker)
fi
if "${DOCKER[@]}" compose version >/dev/null 2>&1; then
  COMPOSE=("${DOCKER[@]}" compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose); [[ "${DOCKER[0]}" == sudo ]] && COMPOSE=(sudo -n docker-compose)
else
  die "Docker Compose is not installed."
fi

# ── Configuration ────────────────────────────────────────────────────────────
mkdir -p "$APP_DIR/backups"
cd "$APP_DIR"
[[ -f deploy.env ]] || die "$APP_DIR/deploy.env is missing (copy deploy/env.deploy.example)."
load_env ./deploy.env
for var in DOMAIN ACME_EMAIL S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY ADMIN_LOGIN_ID ADMIN_EMAIL ADMIN_NAME; do
  [[ -n "${!var:-}" ]] || die "$var is not set in deploy.env"
done

if [[ ! -f secrets.env ]]; then
  step "Generating secrets (first deploy)"
  umask 077
  {
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "AUTH_SECRET=$(openssl rand -hex 32)"
  } > secrets.env
fi
load_env ./secrets.env
chmod 600 deploy.env secrets.env

PUBLIC_URL="https://${DOMAIN}"
[[ -n "${HTTPS_PORT:-}" && "${HTTPS_PORT}" != 443 ]] && PUBLIC_URL="${PUBLIC_URL}:${HTTPS_PORT}"

umask 077
cat > app.env <<EOF
DATABASE_URL=postgresql://erp:${POSTGRES_PASSWORD}@db:5432/college_erp?schema=public
AUTH_SECRET=${AUTH_SECRET}
AUTH_URL=${PUBLIC_URL}
S3_ENDPOINT=${S3_ENDPOINT}
S3_REGION=${S3_REGION}
S3_BUCKET=${S3_BUCKET}
S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
S3_FORCE_PATH_STYLE=${S3_FORCE_PATH_STYLE:-false}
APP_TIMEZONE=${APP_TIMEZONE:-Asia/Kolkata}
BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET:-}
EOF
cat > stack.env <<EOF
DOMAIN=${DOMAIN}
ACME_EMAIL=${ACME_EMAIL}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
APP_IMAGE=college-erp:${TAG}
HTTP_PORT=${HTTP_PORT:-80}
HTTPS_PORT=${HTTPS_PORT:-443}
EOF
umask 022
cp "$SRC/deploy/compose.yml" "$SRC/deploy/Caddyfile" "$SRC/deploy/backup.sh" .
chmod +x backup.sh
dc() { "${COMPOSE[@]}" --env-file stack.env -f compose.yml "$@"; }

# ── Build ────────────────────────────────────────────────────────────────────
step "Building image college-erp:${TAG} (this takes a few minutes)"
"${DOCKER[@]}" build -t "college-erp:${TAG}" -t college-erp:latest "$SRC"

# ── Database + migrations ────────────────────────────────────────────────────
step "Starting database"
dc up -d --wait db 2>/dev/null || {
  dc up -d db
  for _ in $(seq 1 60); do dc exec -T db pg_isready -U erp -d college_erp >/dev/null 2>&1 && break; sleep 2; done
}

step "Applying migrations"
dc run --rm --no-deps app migrate

step "Bootstrapping settings and the first administrator"
# Prints a one-time temporary password only when the first admin is created.
dc run --rm --no-deps -e ADMIN_LOGIN_ID -e ADMIN_EMAIL -e ADMIN_NAME app bootstrap

# ── Release ──────────────────────────────────────────────────────────────────
PREVIOUS_IMAGE="$(dc images app --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | head -1 || true)"
step "Starting app (college-erp:${TAG}) and Caddy"
dc up -d --remove-orphans

step "Waiting for the app to become healthy"
healthy=0
for _ in $(seq 1 90); do
  if dc exec -T app python -c "import urllib.request,sys; r=urllib.request.urlopen('http://127.0.0.1:3000/api/health', timeout=4); sys.exit(0 if r.status==200 else 1)" >/dev/null 2>&1; then
    healthy=1; break
  fi
  sleep 2
done
if [[ "$healthy" != 1 ]]; then
  dc logs --tail 80 app || true
  if [[ -n "$PREVIOUS_IMAGE" && "$PREVIOUS_IMAGE" != "college-erp:${TAG}" ]]; then
    echo "Rolling back to $PREVIOUS_IMAGE"
    sed -i.bak "s|^APP_IMAGE=.*|APP_IMAGE=${PREVIOUS_IMAGE}|" stack.env && dc up -d app
  fi
  die "The new version did not become healthy."
fi
dc exec -T app python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:3000/api/health', timeout=4).read().decode())"

# ── Backups ──────────────────────────────────────────────────────────────────
if [[ "$INSTALL_CRON" == 1 ]]; then
  step "Installing nightly backup (02:30 server time)"
  line="30 2 * * * root $APP_DIR/backup.sh >> $APP_DIR/backups/backup.log 2>&1"
  if [[ -w /etc/cron.d ]]; then echo "$line" > /etc/cron.d/college-erp-backup
  else echo "$line" | sudo -n tee /etc/cron.d/college-erp-backup >/dev/null; fi
fi

# ── Housekeeping: keep the three newest app images ───────────────────────────
"${DOCKER[@]}" images college-erp --format '{{.Tag}} {{.CreatedAt}}' | grep -v '^latest ' | sort -k2 -r | tail -n +4 \
  | awk '{print "college-erp:"$1}' | xargs -r "${DOCKER[@]}" rmi >/dev/null 2>&1 || true

step "Deployed college-erp:${TAG} → ${PUBLIC_URL}"
