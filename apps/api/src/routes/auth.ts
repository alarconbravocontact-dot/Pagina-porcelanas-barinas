import type { FastifyInstance } from 'fastify';
import { activationSchema, loginSchema, passwordSchema, profileUpdateSchema, registerSchema } from '@porcelanas/shared';
import { checkActivationToken, consumeActivationToken } from '../services/tokens';
import { z } from 'zod';
import { prisma } from '../db';
import { audit } from '../lib/audit';
import { createSession, destroySession, issueCsrfToken, requireAuth, CSRF_COOKIE } from '../lib/auth';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { AppError, badRequest, conflict, parse } from '../lib/errors';
import { mergeGuestCart } from '../services/cart';

// Hash señuelo para igualar tiempos cuando el usuario no existe.
const DUMMY_HASH = hashPassword('dummy-password-0000');

export async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.get('/api/auth/session', async (req, reply) => {
    const csrf = req.cookies[CSRF_COOKIE] ?? issueCsrfToken(reply);
    if (!req.auth) return { user: null, csrfToken: csrf };
    const a = req.auth;
    const customer = a.customerId ? await prisma.customerProfile.findUnique({ where: { id: a.customerId } }) : null;
    return {
      csrfToken: csrf,
      user: {
        id: a.userId,
        email: a.email,
        role: a.role,
        fullName: a.fullName,
        phone: customer?.phone ?? null,
        customerId: a.customerId,
        sellerId: a.sellerId,
        permissions: a.permissions,
      },
    };
  });

  app.post('/api/auth/register', strict, async (req, reply) => {
    const input = parse(registerSchema, req.body);
    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw conflict('EMAIL_TAKEN', 'Ya existe una cuenta con ese correo');
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: 'CUSTOMER',
        customer: { create: { fullName: input.fullName, phone: input.phone } },
      },
    });
    await createSession(reply, req, user.id);
    await mergeGuestCart(req, reply, user.id);
    await audit(req, 'user.register', 'User', user.id);
    return reply.status(201).send({ ok: true });
  });

  app.post('/api/auth/login', strict, async (req, reply) => {
    const input = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    const valid = user ? await verifyPassword(user.passwordHash, input.password) : (await verifyPassword(await DUMMY_HASH, input.password), false);
    if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos');
    if (!user.active) throw new AppError(403, 'ACCOUNT_DISABLED', 'La cuenta está desactivada');
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await createSession(reply, req, user.id);
    await mergeGuestCart(req, reply, user.id);
    return { ok: true, role: user.role };
  });

  app.post('/api/auth/activation/check', strict, async (req) => {
    const { token } = parse(z.object({ token: z.string().trim().min(20).max(200) }), req.body);
    return checkActivationToken(token);
  });

  /** El propio usuario define su contraseña con el enlace de un solo uso. */
  app.post('/api/auth/activate', strict, async (req, reply) => {
    const input = parse(activationSchema, req.body);
    const user = await consumeActivationToken(input.token, input.password);
    await createSession(reply, req, user.id);
    await audit(req, 'user.activate', 'User', user.id);
    return { ok: true, role: user.role };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(reply, req);
    return { ok: true };
  });

  app.patch('/api/auth/profile', async (req) => {
    const auth = requireAuth(req);
    const input = parse(profileUpdateSchema, req.body);
    if (!auth.customerId) throw badRequest('NOT_CUSTOMER', 'Solo los clientes tienen perfil editable aquí');
    await prisma.customerProfile.update({ where: { id: auth.customerId }, data: input });
    return { ok: true };
  });

  app.post('/api/auth/password', strict, async (req) => {
    const auth = requireAuth(req);
    const input = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new AppError(400, 'INVALID_PASSWORD', 'La contraseña actual no es correcta');
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } }),
      prisma.session.deleteMany({ where: { userId: user.id, id: { not: auth.sessionId } } }),
    ]);
    await audit(req, 'user.password_change', 'User', user.id);
    return { ok: true };
  });
}
