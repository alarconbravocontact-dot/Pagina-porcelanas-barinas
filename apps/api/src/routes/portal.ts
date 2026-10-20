import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../db';
import { requireCustomer, requireRole } from '../lib/auth';
import { parse } from '../lib/errors';
import { productInclude, toPublicProduct } from '../services/catalog';
import { acceptInvite, checkInvite, createInvite, invitingSeller, listInvites, revokeInvite } from '../services/portal';

const inviteInput = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  sellerId: z.string().uuid().optional(),
});

/** Origen público para armar el enlace: el del navegador del personal o, si no llega, el configurado. */
function originOf(req: FastifyRequest) {
  const o = req.headers.origin;
  return typeof o === 'string' && /^https?:\/\/[^/]+$/.test(o) ? o : config.PUBLIC_ORIGIN;
}

export async function portalRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: config.PORTAL_RATE_LIMIT_PER_MIN, timeWindow: '1 minute' } } };
  const staffLimit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

  app.post('/api/staff/invites', staffLimit, async (req, reply) => {
    const auth = requireRole(req, 'ADMIN', 'SELLER');
    const r = await createInvite(req, auth, parse(inviteInput, req.body ?? {}), originOf(req));
    return reply.status(201).send(r);
  });
  app.get('/api/staff/invites', async (req) => listInvites(requireRole(req, 'ADMIN', 'SELLER')));
  app.post<{ Params: { id: string } }>('/api/staff/invites/:id/revoke', async (req) => revokeInvite(req, requireRole(req, 'ADMIN', 'SELLER'), req.params.id));

  app.get<{ Params: { token: string } }>('/api/portal/invites/:token', strict, async (req) => checkInvite(req.params.token));
  app.post<{ Params: { token: string } }>('/api/portal/invites/:token/accept', strict, async (req, reply) => {
    const r = await acceptInvite(req, reply, req.params.token, req.body);
    return reply.status(r.created ? 201 : 200).send(r);
  });

  /** Inicio del portal: vendedor del cliente y piezas que ya compró (para volver a comprarlas). */
  app.get('/api/portal/home', async (req) => {
    const auth = requireCustomer(req);
    const lastOrder = await prisma.order.findFirst({
      where: { customerId: auth.customerId },
      orderBy: { createdAt: 'desc' },
      select: { seller: { select: { id: true, displayName: true, bio: true, city: true, branch: true, publicPhone: true, whatsapp: true, publicEmail: true, active: true } } },
    });
    const seller = lastOrder?.seller.active ? lastOrder.seller : await invitingSeller(auth.customerId);
    const items = await prisma.orderItem.findMany({
      where: { order: { customerId: auth.customerId, status: { notIn: ['CANCELLED', 'EXPIRED'] } } },
      orderBy: { order: { createdAt: 'desc' } },
      select: { productId: true },
      take: 60,
    });
    const ids = [...new Set(items.map((i) => i.productId))].slice(0, 6);
    const products = ids.length ? await prisma.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, include: productInclude }) : [];
    const reorder = ids.map((id) => products.find((p) => p.id === id)).filter((p) => !!p).map(toPublicProduct);
    return { seller: seller ? { ...seller, active: undefined } : null, reorder };
  });
}
