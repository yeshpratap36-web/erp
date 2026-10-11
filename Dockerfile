#
# One image: Next.js app + internal face service (YuNet/SFace), both supervised by
# docker/start.sh. The face service listens on 127.0.0.1 only. Postgres and S3/R2 are external.
#
#   docker build -t college-erp .
#   docker run --env-file .env -p 3000:3000 college-erp            # serve (default)
#   docker run --env-file .env college-erp migrate                 # apply DB migrations
#   docker run --env-file .env -e ADMIN_... college-erp bootstrap  # first admin, settings

ARG NODE_VERSION=22
ARG PYTHON_VERSION=3.12

# ── 1. Node dependencies + Next.js build ───────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
# OpenSSL lets Prisma pick the right (OpenSSL 3) engine binaries for the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
 && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Production-only node_modules (prisma CLI + tsx are runtime deps for migrate/bootstrap).
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps
WORKDIR /app
# OpenSSL lets Prisma pick the right (OpenSSL 3) engine binaries for the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
 && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --prod

# ── 2. Face models (checksums verified) ───────────────────────────────────────
FROM debian:bookworm-slim AS models
ARG ZOO=https://github.com/opencv/opencv_zoo/raw/main/models
ADD ${ZOO}/face_detection_yunet/face_detection_yunet_2023mar.onnx /models/
ADD ${ZOO}/face_recognition_sface/face_recognition_sface_2021dec.onnx /models/
RUN cd /models && printf '%s\n' \
      "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4  face_detection_yunet_2023mar.onnx" \
      "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79  face_recognition_sface_2021dec.onnx" \
    | sha256sum -c - \
 && chmod 0644 /models/*.onnx   # ADD from a URL creates root-only (0600) files

# ── 3. Runtime: Python 3.12 (face service) + Node (app) ───────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS node
FROM python:${PYTHON_VERSION}-slim-bookworm AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY services/face/requirements.txt services/face/requirements.txt
RUN pip install --no-cache-dir -r services/face/requirements.txt

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/generated ./generated
COPY --from=build --chown=10001:10001 /app/.next ./.next
COPY --from=models /models ./services/face/models
COPY . .

RUN useradd --system --uid 10001 --home /app erp && chmod +x docker/start.sh
USER erp

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    FACE_MODEL_DIR=/app/services/face/models \
    FACE_SERVICE_URL=http://127.0.0.1:8001 \
    PYTHONUNBUFFERED=1
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/api/health', timeout=4)"

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/start.sh"]
CMD ["serve"]
