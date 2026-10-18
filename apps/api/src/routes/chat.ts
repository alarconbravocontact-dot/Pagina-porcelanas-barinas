import type { FastifyInstance } from 'fastify';
import { conversationStatusSchema, sendMessageSchema, startConversationSchema } from '@porcelanas/shared';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../lib/auth';
import { parse } from '../lib/errors';
import { getMessages, listConversations, markRead, sendMessage, setConversationStatus, startConversation } from '../services/chat';
import { listNotifications } from '../services/notifications';

export async function chatRoutes(app: FastifyInstance) {
  const chatLimit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

  app.get('/api/conversations', async (req) => {
    const auth = requireAuth(req);
    const q = parse(z.object({ status: z.enum(['OPEN', 'PENDING', 'CLOSED']).optional() }), req.query);
    return listConversations(auth, q);
  });

  app.post('/api/conversations', chatLimit, async (req, reply) => {
    const auth = requireAuth(req);
    return reply.status(201).send(await startConversation(auth, parse(startConversationSchema, req.body)));
  });

  app.get<{ Params: { id: string } }>('/api/conversations/:id/messages', async (req) => {
    const auth = requireAuth(req);
    const q = parse(z.object({ before: z.string().datetime().optional() }), req.query);
    return getMessages(auth, req.params.id, q.before);
  });

  app.post<{ Params: { id: string } }>('/api/conversations/:id/messages', chatLimit, async (req, reply) => {
    const auth = requireAuth(req);
    const { body } = parse(sendMessageSchema, req.body);
    return reply.status(201).send(await sendMessage(auth, req.params.id, body));
  });

  app.post<{ Params: { id: string } }>('/api/conversations/:id/read', async (req) => markRead(requireAuth(req), req.params.id));

  app.patch<{ Params: { id: string } }>('/api/conversations/:id/status', async (req) => {
    const auth = requireAuth(req);
    const { status } = parse(conversationStatusSchema, req.body);
    return setConversationStatus(auth, req.params.id, status);
  });

  app.get('/api/notifications', async (req) => listNotifications(requireAuth(req).userId));

  app.post<{ Params: { id: string } }>('/api/notifications/:id/read', async (req) => {
    const auth = requireAuth(req);
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: auth.userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  });

  app.post('/api/notifications/read-all', async (req) => {
    const auth = requireAuth(req);
    await prisma.notification.updateMany({ where: { userId: auth.userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  });
}
