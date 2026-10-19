import { prisma } from '../db';
import { randomToken, sha256, hashPassword } from '../lib/crypto';
import { AppError, notFound } from '../lib/errors';

const ACTIVATION_HOURS = 72;

/** Genera un enlace de activación de un solo uso. Invalida los anteriores pendientes. */
export async function createActivationToken(userId: string, createdById: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('Usuario no encontrado');
  const token = randomToken(32);
  await prisma.$transaction([
    prisma.userToken.updateMany({ where: { userId, purpose: 'ACTIVATION', usedAt: null }, data: { usedAt: new Date() } }),
    prisma.userToken.create({
      data: { userId, purpose: 'ACTIVATION', tokenHash: sha256(token), expiresAt: new Date(Date.now() + ACTIVATION_HOURS * 3_600_000), createdById },
    }),
  ]);
  return { token, path: `/activar?token=${token}`, expiresInHours: ACTIVATION_HOURS, email: user.email };
}

async function findValid(token: string) {
  const row = await prisma.userToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: { include: { seller: true } } } });
  if (!row || row.purpose !== 'ACTIVATION' || row.usedAt || row.expiresAt < new Date() || !row.user.active) {
    throw new AppError(400, 'INVALID_TOKEN', 'El enlace de activación no es válido o ya venció. Solicite uno nuevo a la administración.');
  }
  return row;
}

export async function checkActivationToken(token: string) {
  const row = await findValid(token);
  return { email: row.user.email, name: row.user.seller?.displayName ?? null, role: row.user.role };
}

/** Define la contraseña elegida por el propio usuario y consume el enlace (operación condicional). */
export async function consumeActivationToken(token: string, password: string) {
  const row = await findValid(token);
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const used = await tx.userToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count === 0) throw new AppError(400, 'INVALID_TOKEN', 'El enlace ya fue utilizado');
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: row.userId } });
  });
  return row.user;
}
