import type { Notification } from '@prisma/client';
import { prisma, type Tx } from '../db';
import { emitToUser } from '../lib/realtime';

export interface NotifyInput {
  type: string;
  title: string;
  body: string;
  link?: string | null;
}

/** Crea notificaciones internas persistentes y las emite en tiempo real. */
export async function notify(userIds: string[], input: NotifyInput, tx: Tx = prisma) {
  const unique = [...new Set(userIds)].filter(Boolean);
  const created: Notification[] = [];
  for (const userId of unique) {
    const n = await tx.notification.create({ data: { userId, ...input, link: input.link ?? null } });
    created.push(n);
  }
  // La emisión ocurre tras crear los registros; si la transacción falla, el cliente lo verá al recargar.
  setImmediate(() => created.forEach((n) => emitToUser(n.userId, 'notification:new', n)));
  return created;
}

export async function adminUserIds(tx: Tx = prisma) {
  const admins = await tx.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
  return admins.map((a) => a.id);
}

export async function sellerUserId(sellerId: string, tx: Tx = prisma) {
  const s = await tx.seller.findUnique({ where: { id: sellerId }, select: { userId: true } });
  return s?.userId ?? null;
}

export async function listNotifications(userId: string, limit = 30) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}
