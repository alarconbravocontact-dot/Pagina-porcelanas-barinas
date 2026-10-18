import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Cada ejecución crea una base de datos de pruebas NUEVA y exclusiva, aplica las
 * migraciones versionadas con `prisma migrate deploy` (verifica migraciones sobre
 * una base limpia) y la elimina al terminar. Nunca toca bases existentes.
 */
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgresql://porcelana:porcelana@localhost:5432/postgres';

export default async function setup({ provide }: { provide: (key: string, value: string) => void }) {
  const name = `porcelanas_test_${Date.now()}_${process.pid}`;
  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  await admin.$disconnect();
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  url.searchParams.set('schema', 'public');
  const testUrl = url.toString();
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: testUrl } });
  provide('databaseUrl', testUrl);

  return async () => {
    const a = new PrismaClient({ datasourceUrl: adminUrl });
    await a.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await a.$disconnect();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
