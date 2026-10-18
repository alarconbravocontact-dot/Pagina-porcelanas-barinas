#!/usr/bin/env bash
# Arranca la aplicación compilada contra una base de datos E2E nueva y exclusiva.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_URL="${E2E_ADMIN_DATABASE_URL:-postgresql://porcelana:porcelana@localhost:5432/postgres}"
DB="porcelanas_e2e_$(date +%s)"
BASE="${ADMIN_URL%/*}"
export DATABASE_URL="$BASE/$DB?schema=public"
psql "$ADMIN_URL" -qc "CREATE DATABASE \"$DB\"" >/dev/null
cleanup() { psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" >/dev/null 2>&1 || true; }
trap cleanup EXIT
export NODE_ENV=production PORT=4100 HOST=127.0.0.1 COOKIE_SECURE=false JOBS_ENABLED=false RATE_LIMIT_MAX=100000
export STORAGE_DIR="$(mktemp -d)/storage" PUBLIC_ORIGIN=http://127.0.0.1:4100
export SEED_ADMIN_EMAIL=admin@e2e.local SEED_ADMIN_PASSWORD=AdminE2E2026 SEED_DEMO_PASSWORD=VendedorE2E2026
cd "$ROOT/apps/api"
npx prisma migrate deploy >/dev/null
npx tsx prisma/seed.ts --demo >/dev/null
node dist/server.js
