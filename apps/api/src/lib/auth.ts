import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { permissionsFor, type Permission, type Role } from '@porcelanas/shared';
import { prisma } from '../db';
import { config } from '../config';
import { randomToken, safeEqual, sha256 } from './crypto';
import { forbidden, unauthorized, AppError } from './errors';

export const SESSION_COOKIE = 'sid';
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

export interface AuthContext {
  sessionId: string;
  userId: string;
  email: string;
  role: Role;
  customerId: string | null;
  sellerId: string | null;
  sellerActive: boolean;
  fullName: string;
  permissions: Permission[];
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export async function loadAuthFromToken(token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { customer: true, seller: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  const { user } = session;
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return {
    sessionId: session.id,
    userId: user.id,
    email: user.email,
    role: user.role,
    customerId: user.customer?.id ?? null,
    sellerId: user.seller?.id ?? null,
    sellerActive: user.seller?.active ?? false,
    fullName: user.customer?.fullName ?? user.seller?.fullName ?? user.email,
    permissions: permissionsFor(user.role, user.seller),
  };
}

export async function createSession(reply: FastifyReply, request: FastifyRequest, userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 3600_000);
  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt,
      ip: request.ip,
      userAgent: request.headers['user-agent']?.slice(0, 300),
    },
  });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    path: '/',
    expires: expiresAt,
  });
  issueCsrfToken(reply);
}

export async function destroySession(reply: FastifyReply, request: FastifyRequest) {
  if (request.auth) await prisma.session.deleteMany({ where: { id: request.auth.sessionId } });
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function issueCsrfToken(reply: FastifyReply): string {
  const token = randomToken(24);
  reply.setCookie(CSRF_COOKIE, token, { httpOnly: false, sameSite: 'lax', secure: config.COOKIE_SECURE, path: '/' });
  return token;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    // Protección CSRF de doble envío: la cabecera debe coincidir con la cookie.
    if (!SAFE_METHODS.has(request.method)) {
      const cookie = request.cookies[CSRF_COOKIE];
      const header = request.headers[CSRF_HEADER];
      if (!cookie || typeof header !== 'string' || !safeEqual(cookie, header)) {
        throw new AppError(403, 'CSRF', 'Token CSRF inválido. Recargue la página e intente de nuevo.');
      }
    }
    request.auth = await loadAuthFromToken(request.cookies[SESSION_COOKIE]);
    if (!request.cookies[CSRF_COOKIE]) issueCsrfToken(reply);
  });
});

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

export function requireRole(request: FastifyRequest, ...roles: Role[]): AuthContext {
  const auth = requireAuth(request);
  if (!roles.includes(auth.role)) throw forbidden();
  if (auth.role === 'SELLER' && !auth.sellerActive) throw forbidden('Su cuenta de vendedor está desactivada');
  return auth;
}

export function requirePermission(request: FastifyRequest, permission: Permission): AuthContext {
  const auth = requireAuth(request);
  if (auth.role === 'SELLER' && !auth.sellerActive) throw forbidden('Su cuenta de vendedor está desactivada');
  if (!auth.permissions.includes(permission)) throw forbidden();
  return auth;
}

export function requireCustomer(request: FastifyRequest): AuthContext & { customerId: string } {
  const auth = requireAuth(request);
  if (!auth.customerId) throw forbidden('Esta acción requiere una cuenta de cliente');
  return auth as AuthContext & { customerId: string };
}
