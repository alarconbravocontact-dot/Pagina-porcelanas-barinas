import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { dateSchema, orderNoteSchema, orderStatusActionSchema, paymentReviewSchema, paymentSubmitSchema } from '@porcelanas/shared';
import { z } from 'zod';
import { prisma } from '../db';
import { audit } from '../lib/audit';
import { requirePermission, requireRole } from '../lib/auth';
import { parse } from '../lib/errors';
import { addOrderNote, getOrderFull, paymentReviewState, serializeOrder, staffAction, staffScope } from '../services/orders';
import { listPaymentsForReview, reviewPayment, startReview, submitPayment } from '../services/payments';
import { createAccessToken } from '../services/tokens';
import { notFound } from '../lib/errors';
import { toDbDate } from '../services/pickup';

const listQuery = z.object({
  status: z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'READY_FOR_PICKUP', 'DELIVERED', 'CANCELLED', 'EXPIRED', 'ACTIVE']).optional(),
  type: z.enum(['PICKUP', 'PREPAY']).optional(),
  q: z.string().trim().max(80).optional(),
  sellerId: z.string().uuid().optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function staffRoutes(app: FastifyInstance) {
  app.get('/api/staff/orders', async (req) => {
    const auth = requireRole(req, 'ADMIN', 'SELLER');
    const q = parse(listQuery, req.query);
    const where: Prisma.OrderWhereInput = { ...staffScope(auth) };
    if (q.status === 'ACTIVE') where.status = { in: ['PENDING_PAYMENT', 'CONFIRMED', 'READY_FOR_PICKUP'] };
    else if (q.status) where.status = q.status;
    if (q.type) where.type = q.type;
    if (q.sellerId && auth.role === 'ADMIN') where.sellerId = q.sellerId;
    if (q.from || q.to) where.pickupDate = { ...(q.from ? { gte: toDbDate(q.from) } : {}), ...(q.to ? { lte: toDbDate(q.to) } : {}) };
    if (q.q) {
      where.OR = [
        { code: { contains: q.q, mode: 'insensitive' } },
        { contactName: { contains: q.q, mode: 'insensitive' } },
        { contactPhone: { contains: q.q } },
      ];
    }
    const [total, rows] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          code: true,
          type: true,
          status: true,
          paymentStatus: true,
          totalCents: true,
          paidCents: true,
          balanceCents: true,
          totalBoxes: true,
          totalAreaUnits: true,
          pickupDate: true,
          contactName: true,
          contactPhone: true,
          contactCity: true,
          contactAddressRef: true,
          createdAt: true,
          expiresAt: true,
          seller: { select: { id: true, displayName: true } },
          preferredMethod: { select: { name: true } },
          items: { select: { sku: true, productName: true, boxes: true, areaUnits: true } },
          payments: { select: { status: true, reviewStartedAt: true }, orderBy: { createdAt: 'desc' } },
          _count: { select: { payments: { where: { status: 'PENDING' } } } },
        },
      }),
    ]);
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map(({ payments, ...r }) => ({
        ...r,
        pickupDate: r.pickupDate.toISOString().slice(0, 10),
        pendingPayments: r._count.payments,
        paymentReviewState: paymentReviewState({ paymentStatus: r.paymentStatus, payments } as never),
      })),
    };
  });

  app.get<{ Params: { id: string } }>('/api/staff/orders/:id', async (req) => {
    const auth = requireRole(req, 'ADMIN', 'SELLER');
    const order = await getOrderFull({ id: req.params.id, ...staffScope(auth) });
    const out = serializeOrder(order, 'staff');
    // Los comprobantes solo se listan a quien tenga permiso de verlos.
    if (!auth.permissions.includes('proofs:view')) out.payments = out.payments.map((p) => ({ ...p, proofs: [] }));
    return { ...out, canReviewPayments: auth.permissions.includes('payments:review'), canCancel: auth.permissions.includes('orders:cancel') };
  });

  app.post<{ Params: { id: string } }>('/api/staff/orders/:id/status', async (req) => {
    const auth = requirePermission(req, 'orders:operate');
    const input = parse(orderStatusActionSchema, req.body);
    const order = await staffAction(auth, req.params.id, input.action, input.note);
    await audit(req, `order.${input.action.toLowerCase()}`, 'Order', order.id, { note: input.note ?? null });
    return { id: order.id, status: order.status };
  });

  app.post<{ Params: { id: string } }>('/api/staff/orders/:id/notes', async (req, reply) => {
    const auth = requireRole(req, 'ADMIN', 'SELLER');
    const input = parse(orderNoteSchema, req.body);
    return reply.status(201).send(await addOrderNote(auth, req.params.id, input.kind, input.body));
  });

  /** Registro de pagos presenciales (p. ej. efectivo en sede) por personal autorizado. */
  app.post<{ Params: { id: string } }>('/api/staff/orders/:id/payments', async (req, reply) => {
    const auth = requirePermission(req, 'payments:review');
    const input = parse(paymentSubmitSchema, req.body);
    const key = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : '';
    const { payment, replayed } = await submitPayment(auth, { id: req.params.id, ...staffScope(auth) }, input, null, key, { staffApproved: true });
    await audit(req, 'payment.record_in_person', 'Payment', payment.id, { orderId: req.params.id });
    return reply.status(replayed ? 200 : 201).send({ replayed, paymentId: payment.id, status: payment.status });
  });

  app.get('/api/staff/payments', async (req) => {
    const auth = requirePermission(req, 'payments:review');
    const q = parse(z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING') }), req.query);
    return listPaymentsForReview(auth, q.status);
  });

  app.post<{ Params: { id: string } }>('/api/staff/payments/:id/review', async (req) => {
    const auth = requirePermission(req, 'payments:review');
    const input = parse(paymentReviewSchema, req.body);
    const p = await reviewPayment(auth, req.params.id, input.decision, input.notes);
    return { id: p.id, status: p.status };
  });

  app.post<{ Params: { id: string } }>('/api/staff/payments/:id/start-review', async (req) => {
    const auth = requirePermission(req, 'payments:review');
    const p = await startReview(auth, req.params.id);
    return { id: p.id, status: p.status, reviewStartedAt: p.reviewStartedAt };
  });

  /** Consulta puntual de la cédula completa: solo administrador o vendedor asignado; queda auditada. */
  app.post<{ Params: { id: string } }>('/api/staff/orders/:id/customer-document', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const auth = requireRole(req, 'ADMIN', 'SELLER');
    const order = await prisma.order.findFirst({ where: { id: req.params.id, ...staffScope(auth) }, select: { id: true, contactDocumentId: true } });
    if (!order) throw notFound('Operación no encontrada');
    await audit(req, 'customer.document_view', 'Order', order.id);
    return { documentId: order.contactDocumentId };
  });

  /** Enlace de acceso de un solo uso para que el cliente abra su perfil en otro dispositivo. */
  app.post<{ Params: { id: string } }>('/api/staff/orders/:id/access-link', async (req) => {
    const auth = requireRole(req, 'ADMIN', 'SELLER');
    const order = await prisma.order.findFirst({ where: { id: req.params.id, ...staffScope(auth) }, include: { customer: true } });
    if (!order) throw notFound('Operación no encontrada');
    const r = await createAccessToken(order.customer.userId, auth.userId);
    await audit(req, 'customer.access_link', 'Order', order.id);
    return { path: r.path, expiresInHours: r.expiresInHours, phone: order.contactPhone };
  });

  app.get('/api/staff/pickups', async (req) => {
    const auth = requireRole(req, 'ADMIN', 'SELLER');
    const q = parse(z.object({ from: dateSchema, to: dateSchema }), req.query);
    const rows = await prisma.order.findMany({
      where: { ...staffScope(auth), status: { in: ['PENDING_PAYMENT', 'CONFIRMED', 'READY_FOR_PICKUP'] }, pickupDate: { gte: toDbDate(q.from), lte: toDbDate(q.to) } },
      orderBy: [{ pickupDate: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, code: true, status: true, pickupDate: true, totalBoxes: true, contactName: true, balanceCents: true, seller: { select: { displayName: true } } },
    });
    return rows.map((r) => ({ ...r, pickupDate: r.pickupDate.toISOString().slice(0, 10) }));
  });

  app.get('/api/staff/me', async (req) => {
    const auth = requireRole(req, 'ADMIN', 'SELLER');
    return { role: auth.role, permissions: auth.permissions, sellerId: auth.sellerId };
  });
}
