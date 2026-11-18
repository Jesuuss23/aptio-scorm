#!/bin/sh
# HU-1405 · Punto de entrada de las imágenes de la API y del worker. En la nube, ECS inyecta la conexión a PostgreSQL por
# partes desde Secrets Manager (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD) y aquí se arma DATABASE_URL, que es lo
# que lee Prisma. La clave de RDS se genera sin caracteres reservados de URL. En local basta con pasar DATABASE_URL.
set -eu
if [ -z "${DATABASE_URL:-}" ] && [ -n "${DB_PASSWORD:-}" ]; then
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME:-aptio_scorm}?schema=public&sslmode=require"
  export DATABASE_URL
fi
exec "$@"
