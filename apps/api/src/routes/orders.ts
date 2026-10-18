import type { FastifyInstance } from 'fastify';
import { cancelOrderSchema, checkoutSchema, paymentSubmitSchema, rescheduleSchema } from '@porcelanas/shared';
import { prisma } from '../db';
import { requireAuth, requireCustomer } from '../lib/auth';
import { badRequest, parse } from '../lib/errors';
import { readMultipart } from '../lib/multipart';
import { storage } from '../lib/storage';
import { createOrder, customerCancel, getOrderFull, orderInclude, rescheduleOrder, serializeOrder } from '../services/orders';
import { authorizeProof, replaceProof, submitPayment } from '../services/payments';
import { getSettings } from '../services/settings';

const idemKey = (h: unknown) => (typeof h === 'string' ? h : '');

export async function orderRoutes(app: FastifyInstance) {
  app.post('/api/orders', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const auth = requireCustomer(req);
    const input = parse(checkoutSchema, req.body);
    const { order, replayed } = await createOrder(auth, input, idemKey(req.headers['idempotency-key']));
    const full = await getOrderFull({ id: order.id });
    return reply.status(replayed ? 200 : 201).send({ replayed, order: serializeOrder(full, 'customer') });
  });

  app.get('/api/orders', async (req) => {
    const auth = requireCustomer(req);
    const orders = await prisma.order.findMany({
      where: { customerId: auth.customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: orderInclude,
    });
    return orders.map((o) => serializeOrder(o, 'customer'));
  });

  app.get<{ Params: { code: string } }>('/api/orders/:code', async (req) => {
    const auth = requireCustomer(req);
    const order = await getOrderFull({ code: req.params.code, customerId: auth.customerId });
    return serializeOrder(order, 'customer');
  });

  app.post<{ Params: { code: string } }>('/api/orders/:code/reschedule', async (req) => {
    const auth = requireCustomer(req);
    const input = parse(rescheduleSchema, req.body);
    await rescheduleOrder(auth, req.params.code, input.pickupDate, input.reason);
    return serializeOrder(await getOrderFull({ code: req.params.code, customerId: auth.customerId }), 'customer');
  });

  app.post<{ Params: { code: string } }>('/api/orders/:code/cancel', async (req) => {
    const auth = requireCustomer(req);
    const input = parse(cancelOrderSchema, req.body);
    await customerCancel(auth, req.params.code, input.reason);
    return serializeOrder(await getOrderFull({ code: req.params.code, customerId: auth.customerId }), 'customer');
  });

  const uploadLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.post<{ Params: { code: string } }>('/api/orders/:code/payments', uploadLimit, async (req, reply) => {
    const auth = requireCustomer(req);
    const s = await getSettings();
    const { fields, files } = await readMultipart(req, Math.round(s.uploads.maxProofMB * 1024 * 1024));
    const input = parse(paymentSubmitSchema, fields);
    const { payment, replayed } = await submitPayment(
      auth,
      { code: req.params.code, customerId: auth.customerId },
      input,
      files[0] ?? null,
      idemKey(req.headers['idempotency-key']),
    );
    return reply.status(replayed ? 200 : 201).send({ replayed, paymentId: payment.id, status: payment.status });
  });

  app.post<{ Params: { id: string } }>('/api/payments/:id/proofs', uploadLimit, async (req) => {
    const auth = requireCustomer(req);
    const s = await getSettings();
    const { files } = await readMultipart(req, Math.round(s.uploads.maxProofMB * 1024 * 1024));
    if (!files[0]) throw badRequest('PROOF_REQUIRED', 'Adjunte el nuevo comprobante');
    const p = await replaceProof(auth, req.params.id, files[0]);
    return { paymentId: p.id, status: p.status };
  });

  /** Descarga controlada de comprobantes privados. */
  app.get<{ Params: { id: string } }>('/api/proofs/:id', async (req, reply) => {
    const auth = requireAuth(req);
    const proof = await authorizeProof(auth, req.params.id);
    const data = await storage.readPrivate(proof.storageKey);
    return reply
      .header('Content-Type', proof.mimeType)
      .header('Content-Disposition', `inline; filename="comprobante-${proof.id}.${proof.mimeType.split('/')[1]}"`)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; img-src 'self'")
      .send(data);
  });
}
