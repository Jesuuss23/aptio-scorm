# syntax=docker/dockerfile:1.7
# HU-1405 · Imagen del worker (BullMQ). Se construye desde la raíz del monorepo:
#   docker build -f docker/worker.Dockerfile -t aptio-worker .
# Lleva ffmpeg (audio y video del cliente), Rhubarb Lip Sync (boca), las fuentes para resvg (SUP-163) y el cliente de
# PostgreSQL 16 para los respaldos (HU-1403, la misma versión del servidor). Corre como el usuario sin privilegios `aptio`.
ARG NODE_IMAGEN=node:22-bookworm-slim
ARG UBUNTU_IMAGEN=ubuntu:24.04

# Node 22 (LTS) y pnpm del lockfile, copiados sobre Ubuntu 24.04: así el sistema trae PostgreSQL 16, ffmpeg y las fuentes
# de sus repositorios oficiales, sin repositorios de terceros.
FROM ${NODE_IMAGEN} AS nodejs
RUN npm install -g pnpm@10.28.0 && npm cache clean --force

FROM ${UBUNTU_IMAGEN} AS base
ENV CI=true NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 10001 aptio && useradd --system --uid 10001 --gid aptio --home-dir /app --shell /usr/sbin/nologin aptio
COPY --from=nodejs /usr/local/bin/node /usr/local/bin/node
COPY --from=nodejs /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s ../lib/node_modules/pnpm/bin/pnpm.cjs /usr/local/bin/pnpm \
  && node --version && pnpm --version
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm fetch

FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --offline --prod=false --filter "worker..." --filter aptio-scorm \
  && pnpm db:generate

# Rhubarb Lip Sync 1.13.0 (binario oficial para Linux, verificado por su SHA-256).
FROM base AS rhubarb
ARG RHUBARB_VERSION=1.13.0
ARG RHUBARB_SHA256=bd260905e88d0bdadbd4d7b452cae3b78a880fe27d10d51586772f84aac69f71
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL -o /tmp/rhubarb.zip "https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v${RHUBARB_VERSION}/Rhubarb-Lip-Sync-${RHUBARB_VERSION}-Linux.zip" \
  && echo "${RHUBARB_SHA256}  /tmp/rhubarb.zip" | sha256sum -c - \
  && unzip -q /tmp/rhubarb.zip -d /opt \
  && mv "/opt/Rhubarb-Lip-Sync-${RHUBARB_VERSION}-Linux" /opt/rhubarb \
  && rm /tmp/rhubarb.zip

FROM base AS runtime
# Ubuntu 24.04 trae el cliente de PostgreSQL 16 (la versión del servidor) en sus repositorios.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg postgresql-client-16 fontconfig fonts-dejavu-core fonts-liberation2 \
  && rm -rf /var/lib/apt/lists/* \
  && test -x /usr/lib/postgresql/16/bin/pg_dump
COPY --from=rhubarb /opt/rhubarb /opt/rhubarb
COPY --from=build --chown=aptio:aptio /app /app
COPY --chmod=755 docker/entrada.sh /usr/local/bin/aptio-entrada
ENV RHUBARB_PATH=/opt/rhubarb/rhubarb PG_BIN_DIR=/usr/lib/postgresql/16/bin
USER aptio
WORKDIR /app/apps/worker
ENTRYPOINT ["/usr/local/bin/aptio-entrada"]
CMD ["node", "--import", "tsx", "src/index.ts"]
