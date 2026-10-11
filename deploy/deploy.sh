#!/usr/bin/env bash
# One-command deployment of College ERP to a single Linux server (AWS EC2/Lightsail,
# DigitalOcean, Hetzner, …) running Ubuntu 22.04+/Debian 12+.
#
#   cp deploy/env.deploy.example deploy/.env.deploy    # fill it in once
#   deploy/deploy.sh --host ubuntu@203.0.113.10        # deploy / redeploy
#
# Options:
#   --host USER@HOST   server to deploy to (SSH; the user needs passwordless sudo)
#   --key PATH         SSH private key (e.g. the EC2 .pem)
#   --port N           SSH port (default 22)
#   --local            run the server half on THIS machine (testing, or when run on the server)
#   --dir PATH         deploy directory (default /opt/college-erp, or ./.deploy-local with --local)
#
# What it does: prepares the server once (Docker, rsync, swap on small machines, firewall),
# uploads the code and your settings, then runs deploy/server.sh there, which builds the
# single app image, migrates the database, creates the first admin, starts Caddy (HTTPS) +
# app + Postgres, health-checks the release (rolling back on failure) and schedules backups.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
HOST="" KEY="" PORT=22 LOCAL=0 DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --local) LOCAL=1; shift ;;
    --dir) DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

CONFIG="$REPO/deploy/.env.deploy"
[[ -f "$CONFIG" ]] || die "Missing $CONFIG — copy deploy/env.deploy.example and fill it in."
grep -qE '^S3_ACCESS_KEY_ID=.+$' "$CONFIG" || die "Fill in the S3_* settings in deploy/.env.deploy."
TAG="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo manual)-$(date -u +%Y%m%d%H%M%S)"

# ── Local mode ───────────────────────────────────────────────────────────────
if [[ "$LOCAL" == 1 ]]; then
  DIR="${DIR:-$REPO/.deploy-local}"
  mkdir -p "$DIR"
  cp "$CONFIG" "$DIR/deploy.env"
  step "Deploying locally into $DIR (tag $TAG)"
  exec bash "$REPO/deploy/server.sh" --app-dir "$DIR" --src "$REPO" --tag "$TAG" --no-cron
fi

# ── Remote mode ──────────────────────────────────────────────────────────────
[[ -n "$HOST" ]] || die "Pass --host USER@HOST (or --local)."
DIR="${DIR:-/opt/college-erp}"
SSH=(ssh -p "$PORT" -o StrictHostKeyChecking=accept-new)
[[ -n "$KEY" ]] && SSH+=(-i "$KEY")
RSYNC_SSH="ssh -p $PORT -o StrictHostKeyChecking=accept-new${KEY:+ -i $KEY}"

step "Checking SSH access to $HOST"
"${SSH[@]}" "$HOST" 'sudo -n true' 2>/dev/null || die "Can't SSH to $HOST with passwordless sudo."

step "Preparing the server (first run installs Docker; safe to repeat)"
"${SSH[@]}" "$HOST" "sudo -n bash -s -- '$DIR' \"\$(id -un)\"" <<'REMOTE'
set -euo pipefail
DIR="$1"; OWNER="$2"
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
command -v rsync >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq rsync)
command -v openssl >/dev/null 2>&1 || apt-get install -y -qq openssl
usermod -aG docker "$OWNER" || true
# Building the image needs ~3 GB of memory; add swap on small instances.
mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
if (( mem_kb < 3500000 )) && ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Only SSH and web traffic, if ufw is in use (also open 80/443 in the cloud security group).
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q active; then
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi
mkdir -p "$DIR/src"
chown -R "$OWNER" "$DIR"
REMOTE

step "Uploading code"
rsync -az --delete -e "$RSYNC_SSH" \
  --exclude .git --exclude node_modules --exclude .next --exclude generated \
  --exclude '.env' --exclude '.env.*' --exclude 'deploy/.env.deploy' --exclude .deploy-local \
  --exclude test-results --exclude playwright-report --exclude 'services/face/.venv' \
  --exclude 'services/face/models' --exclude '__pycache__' \
  "$REPO/" "$HOST:$DIR/src/"
rsync -az -e "$RSYNC_SSH" --chmod=F600 "$CONFIG" "$HOST:$DIR/deploy.env"

step "Deploying $TAG on $HOST"
# sudo so a freshly added docker group membership isn't needed in this session.
"${SSH[@]}" -t "$HOST" "sudo -n bash '$DIR/src/deploy/server.sh' --app-dir '$DIR' --src '$DIR/src' --tag '$TAG'"
