// Ejecuta el CLI de Prisma cargando el .env de la raíz del monorepo (si existe).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const envFile = path.resolve(import.meta.dirname, '../../../.env');
if (existsSync(envFile) && !process.env.DATABASE_URL) process.loadEnvFile(envFile);
const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
process.exit(r.status ?? 1);
