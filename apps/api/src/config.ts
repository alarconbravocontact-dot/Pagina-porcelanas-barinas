import path from 'node:path';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatorio'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  PUBLIC_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: bool,
  TRUST_PROXY: bool,
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(168),
  CUSTOMER_SESSION_TTL_DAYS: z.coerce.number().int().min(1).default(180),
  STORAGE_DIR: z.string().default('./storage'),
  BUSINESS_TIMEZONE: z.string().default('America/Caracas'),
  JOBS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  JOBS_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(60),
  WEB_DIST_DIR: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().default(300),
  /** Asistente virtual: auto = Claude si hay ANTHROPIC_API_KEY; si no, motor integrado. */
  ASSISTANT_PROVIDER: z.enum(['auto', 'claude', 'local']).default('auto'),
  ASSISTANT_MODEL: z.string().default('claude-opus-5-5'),
  ASSISTANT_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
  ASSISTANT_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(15),
  /** Aperturas de enlaces de invitación al portal por minuto e IP. */
  PORTAL_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(20),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Configuración inválida:', parsed.error.flatten().fieldErrors);
  throw new Error('Variables de entorno inválidas');
}

const env = parsed.data;
const storageRoot = path.resolve(process.cwd(), env.STORAGE_DIR);

export const config = {
  ...env,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  storage: {
    root: storageRoot,
    publicDir: path.join(storageRoot, 'public'),
    privateDir: path.join(storageRoot, 'private'),
  },
};
export type AppConfig = typeof config;
