import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { AuthContext } from '../lib/auth';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { emitToConversation, emitToUser } from '../lib/realtime';
import { notify } from './notifications';

const convInclude = {
  customer: { select: { id: true, fullName: true, userId: true } },
  seller: { select: { id: true, displayName: true, userId: true } },
  order: { select: { id: true, code: true, status: true } },
} satisfies Prisma.ConversationInclude;

type ConvFull = Prisma.ConversationGetPayload<{ include: typeof convInclude }>;

type Side = 'customer' | 'seller' | 'admin';

function sideOf(auth: AuthContext, conv: { customerId: string; sellerId: string }): Side | null {
  if (auth.customerId && conv.customerId === auth.customerId) return 'customer';
  if (auth.role === 'SELLER' && auth.sellerId === conv.sellerId && auth.sellerActive) return 'seller';
  if (auth.role === 'ADMIN') return 'admin';
  return null;
}

async function loadConversation(auth: AuthContext, id: string) {
  const conv = await prisma.conversation.findUnique({ where: { id }, include: convInclude });
  if (!conv) throw notFound('Conversación no encontrada');
  const side = sideOf(auth, conv);
  if (!side) throw notFound('Conversación no encontrada');
  return { conv, side };
}

function serialize(conv: ConvFull, side: Side, unread: number, last?: { body: string; createdAt: Date; senderId: string } | null) {
  return {
    id: conv.id,
    status: conv.status,
    subject: conv.subject,
    customer: { id: conv.customer.id, fullName: conv.customer.fullName },
    seller: { id: conv.seller.id, displayName: conv.seller.displayName },
    order: conv.order,
    lastMessageAt: conv.lastMessageAt,
    customerLastReadAt: conv.customerLastReadAt,
    sellerLastReadAt: conv.sellerLastReadAt,
    unread,
    lastMessage: last ? { body: last.body.slice(0, 140), createdAt: last.createdAt, senderId: last.senderId } : null,
    viewerSide: side,
    participants: { customerUserId: conv.customer.userId, sellerUserId: conv.seller.userId },
  };
}

async function unreadFor(conv: ConvFull, side: Side, userId: string) {
  if (side === 'admin') return 0;
  const since = side === 'customer' ? conv.customerLastReadAt : conv.sellerLastReadAt;
  return prisma.message.count({
    where: { conversationId: conv.id, senderId: { not: userId }, ...(since ? { createdAt: { gt: since } } : {}) },
  });
}

export async function listConversations(auth: AuthContext, filter: { status?: string } = {}) {
  const where: Prisma.ConversationWhereInput = {};
  if (auth.role === 'ADMIN') {
    /* acceso de supervisión */
  } else if (auth.role === 'SELLER' && auth.sellerId) where.sellerId = auth.sellerId;
  else if (auth.customerId) where.customerId = auth.customerId;
  else throw forbidden();
  if (filter.status) where.status = filter.status as ConvFull['status'];
  const convs = await prisma.conversation.findMany({
    where,
    include: { ...convInclude, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
  });
  return Promise.all(
    convs.map(async (c) => {
      const side = sideOf(auth, c)!;
      return serialize(c, side, await unreadFor(c, side, auth.userId), c.messages[0]);
    }),
  );
}

export async function startConversation(
  auth: AuthContext,
  input: { sellerId?: string; orderId?: string; subject?: string; message: string },
) {
  if (!auth.customerId) throw forbidden('Solo los clientes pueden iniciar conversaciones');
  let sellerId = input.sellerId;
  let orderId: string | null = null;
  if (input.orderId) {
    const order = await prisma.order.findFirst({ where: { id: input.orderId, customerId: auth.customerId } });
    if (!order) throw notFound('Operación no encontrada');
    sellerId = order.sellerId;
    orderId = order.id;
  }
  if (!sellerId) throw badRequest('SELLER_REQUIRED', 'Seleccione un vendedor');
  const seller = await prisma.seller.findUnique({ where: { id: sellerId }, include: { user: true } });
  if (!seller || !seller.active || !seller.user.active) throw new AppError(422, 'SELLER_INVALID', 'El vendedor no está disponible');

  let conv = await prisma.conversation.findFirst({
    where: { customerId: auth.customerId, sellerId, orderId, status: { not: 'CLOSED' } },
  });
  if (!conv) {
    conv = await prisma.conversation.create({
      data: { customerId: auth.customerId, sellerId, orderId, subject: input.subject || null },
    });
  }
  await sendMessage(auth, conv.id, input.message);
  const { conv: full, side } = await loadConversation(auth, conv.id);
  return serialize(full, side, 0);
}

export async function getMessages(auth: AuthContext, conversationId: string, before?: string, limit = 50) {
  const { conv, side } = await loadConversation(auth, conversationId);
  const messages = await prisma.message.findMany({
    where: { conversationId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
    include: { sender: { select: { id: true, role: true } } },
  });
  return {
    conversation: serialize(conv, side, 0),
    messages: messages.reverse().map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      senderId: m.senderId,
      senderSide: m.senderId === conv.customer.userId ? 'customer' : m.senderId === conv.seller.userId ? 'seller' : 'staff',
    })),
    hasMore: messages.length === Math.min(limit, 100),
  };
}

export async function sendMessage(auth: AuthContext, conversationId: string, body: string) {
  const { conv, side } = await loadConversation(auth, conversationId);
  if (side === 'admin') throw forbidden('La supervisión administrativa es de solo lectura');
  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({ data: { conversationId, senderId: auth.userId, body } });
    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: now,
        ...(side === 'customer' ? { customerLastReadAt: now, status: 'OPEN' } : { sellerLastReadAt: now }),
      },
    });
    return m;
  });
  const payload = {
    id: message.id,
    conversationId,
    body: message.body,
    createdAt: message.createdAt,
    senderId: message.senderId,
    senderSide: side,
  };
  emitToConversation(conversationId, 'message:new', payload);
  const recipient = side === 'customer' ? conv.seller.userId : conv.customer.userId;
  emitToUser(recipient, 'message:new', payload);
  emitToUser(auth.userId, 'message:new', payload);
  // Una notificación por conversación mientras no se lea la anterior.
  const pending = await prisma.notification.findFirst({
    where: { userId: recipient, type: 'CHAT_MESSAGE', link: { endsWith: conversationId }, readAt: null },
  });
  if (!pending) {
    await notify([recipient], {
      type: 'CHAT_MESSAGE',
      title: side === 'customer' ? `Mensaje de ${conv.customer.fullName}` : `Mensaje de ${conv.seller.displayName}`,
      body: body.slice(0, 140),
      link: side === 'customer' ? `/vendedor/chat/${conversationId}` : `/cuenta/chat/${conversationId}`,
    });
  }
  return payload;
}

export async function markRead(auth: AuthContext, conversationId: string) {
  const { conv, side } = await loadConversation(auth, conversationId);
  if (side === 'admin') return { ok: true };
  const now = new Date();
  await prisma.conversation.update({
    where: { id: conversationId },
    data: side === 'customer' ? { customerLastReadAt: now } : { sellerLastReadAt: now },
  });
  await prisma.notification.updateMany({
    where: { userId: auth.userId, type: 'CHAT_MESSAGE', link: { endsWith: conversationId }, readAt: null },
    data: { readAt: now },
  });
  const payload = { conversationId, side, readAt: now };
  emitToConversation(conversationId, 'conversation:read', payload);
  emitToUser(side === 'customer' ? conv.seller.userId : conv.customer.userId, 'conversation:read', payload);
  return { ok: true, readAt: now };
}

export async function setConversationStatus(auth: AuthContext, conversationId: string, status: 'OPEN' | 'PENDING' | 'CLOSED') {
  const { side } = await loadConversation(auth, conversationId);
  if (side !== 'seller' && side !== 'admin') throw forbidden('Solo el vendedor puede cambiar el estado de la conversación');
  const conv = await prisma.conversation.update({ where: { id: conversationId }, data: { status } });
  emitToConversation(conversationId, 'conversation:status', { conversationId, status });
  return conv;
}

/** Usado por Socket.IO para validar la suscripción a una sala de conversación. */
export async function canJoinConversation(auth: AuthContext, conversationId: string) {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { customerId: true, sellerId: true } });
  return !!conv && !!sideOf(auth, conv);
}
