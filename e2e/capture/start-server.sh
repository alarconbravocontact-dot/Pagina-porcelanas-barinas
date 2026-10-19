#!/usr/bin/env bash
# Servidor para capturas: base nueva con datos del negocio (sin demo). Uso: bash e2e/capture/start-server.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ADMIN_URL="${E2E_ADMIN_DATABASE_URL:-postgresql://porcelana:porcelana@localhost:5432/postgres}"
DB="porcelanas_capture"
psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" >/dev/null
psql "$ADMIN_URL" -qc "CREATE DATABASE \"$DB\"" >/dev/null
export DATABASE_URL="${ADMIN_URL%/*}/$DB?schema=public"
export NODE_ENV=production PORT=4200 HOST=127.0.0.1 COOKIE_SECURE=false JOBS_ENABLED=false RATE_LIMIT_MAX=100000
export STORAGE_DIR="$(mktemp -d)/storage" PUBLIC_ORIGIN=http://127.0.0.1:4200
export SEED_ADMIN_EMAIL=admin@porcelanas.local SEED_ADMIN_PASSWORD=AdminCaptura2026
cd "$ROOT/apps/api"
npx prisma migrate deploy >/dev/null
npx tsx prisma/seed.ts >/dev/null
exec node dist/server.js
