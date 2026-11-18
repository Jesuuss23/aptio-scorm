# syntax=docker/dockerfile:1.7
# HU-1405 · Web estática (React + Vite). Se construye desde la raíz del monorepo.
#   docker build -f docker/web.Dockerfile --target exportar --output type=local,dest=web-dist .
# deja `index.html` y `assets/` listos para subir al bucket que sirve CloudFront (así lo hace el despliegue), y
#   docker build -f docker/web.Dockerfile -t aptio-web .
# da una imagen nginx sin privilegios para probarla en local (el sitio público /s/* y /api/* los sirve la API).
ARG NODE_IMAGEN=node:22-bookworm-slim

FROM ${NODE_IMAGEN} AS base
ENV CI=true
RUN npm install -g pnpm@10.28.0 && npm cache clean --force
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm fetch

FROM deps AS build
COPY . .
# El reproductor (@aptio/player), el kit (@aptio/ui) y el esquema entran en el bundle de Vite.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --offline --prod=false --filter "web..." --filter aptio-scorm \
  && pnpm --filter web build

FROM scratch AS exportar
COPY --from=build /app/apps/web/dist /

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY docker/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
