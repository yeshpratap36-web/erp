#!/usr/bin/env bash
# Container entrypoint. Sub-commands:
#   serve      run the face service (127.0.0.1 only) + Next.js; exit if either dies (default)
#   migrate    apply pending Prisma migrations
#   bootstrap  settings, grade scale and the first admin (needs ADMIN_LOGIN_ID/EMAIL/NAME)
#   upload-backup <file>   copy a database dump to the S3/R2 bucket (used by the backup cron)
set -euo pipefail
cd /app

cmd="${1:-serve}"
shift || true

# The face service is only reachable inside this container. A fresh random token per start
# (unless one is provided) is shared with the app through the environment. Every sub-command
# needs it set because the app validates its environment on startup.
if [[ -z "${FACE_SERVICE_TOKEN:-}" ]]; then
  FACE_SERVICE_TOKEN="$(python -c 'import secrets; print(secrets.token_hex(32))')"
fi
export FACE_SERVICE_TOKEN
export FACE_SERVICE_URL="${FACE_SERVICE_URL:-http://127.0.0.1:8001}"

case "$cmd" in
  migrate)
    exec node_modules/.bin/prisma migrate deploy
    ;;
  bootstrap)
    exec node_modules/.bin/tsx prisma/bootstrap.ts
    ;;
  upload-backup)
    exec node docker/upload-backup.mjs "$@"
    ;;
  serve)
    (cd services/face && exec python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 \
        --workers "${FACE_WORKERS:-2}" --no-access-log) &
    face_pid=$!

    for _ in $(seq 1 60); do
      python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=2)" \
        2>/dev/null && break
      sleep 1
    done

    node_modules/.bin/next start --port "${PORT:-3000}" --hostname "${HOSTNAME:-0.0.0.0}" &
    web_pid=$!

    # Forward termination to both; if either exits, stop the other so the container restarts.
    trap 'kill -TERM "$face_pid" "$web_pid" 2>/dev/null || true' TERM INT
    wait -n "$face_pid" "$web_pid"
    status=$?
    kill -TERM "$face_pid" "$web_pid" 2>/dev/null || true
    wait || true
    exit "$status"
    ;;
  *)
    exec "$cmd" "$@"
    ;;
esac
