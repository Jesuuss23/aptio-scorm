# syntax=docker/dockerfile:1.7
# HU-1405 · Imagen de la API (NestJS). Se construye desde la raíz del monorepo:
#   docker build -f docker/api.Dockerfile -t aptio-api .
# La misma imagen corre la tarea previa de base de datos del despliegue (`pnpm db:deploy` y la verificación de organizaciones).
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

# Solo el lockfile: la capa de descargas se reutiliza mientras no cambien las dependencias.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm fetch

FROM deps AS build
COPY . .
# La API corre su TypeScript con @swc-node y empaqueta el reproductor con esbuild al exportar: necesita esas dependencias.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --offline --prod=false --filter "api..." --filter aptio-scorm \
  && pnpm db:generate

FROM base AS runtime
COPY --from=build --chown=aptio:aptio /app /app
COPY --chmod=755 docker/entrada.sh /usr/local/bin/aptio-entrada
USER aptio
WORKDIR /app/apps/api
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/aptio-entrada"]
CMD ["node", "--enable-source-maps", "--import", "@swc-node/register/esm-register", "src/main.ts"]
