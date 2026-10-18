import crypto from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');

// Argon2id con parámetros recomendados por OWASP (m=19 MiB, t=2, p=1).
const ARGON_OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, ARGON_OPTS);
export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Referencia pública aleatoria (no secuencial) sin caracteres ambiguos. */
export function orderCode(): string {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `PC-${out}`;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
