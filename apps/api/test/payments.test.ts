import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays } from '@porcelanas/shared';
import { checkout, Client, createUser, idem, JPEG_HEADER, login, PNG_1PX, prisma, scenario, setSetting } from './helpers';
import { config } from '../src/config';
import { expireReservations } from '../src/services/orders';

let s: Awaited<ReturnType<typeof scenario>>;

async function newOrder(type: 'PICKUP' | 'PREPAY' = 'PICKUP', boxes = 10, paymentMethodId?: string) {
  await s.customer.post('/api/cart/items', { productId: s.product.id, mode: 'BOXES', quantity: boxes });
  const res = await checkout(s.customer, s, { type, ...(paymentMethodId ? { paymentMethodId } : {}) });
  expect(res.statusCode).toBe(201);
  return res.json().order as { id: string; code: string; totalCents: number; requiredCents: number };
}

type F = { name: string; type: string; data: Buffer } | null;
const DEFAULT_FILE: F = { name: 'pago.png', type: 'image/png', data: PNG_1PX };
function pay(order: { code: string }, fields: Partial<Record<string, string>> = {}, file: F = DEFAULT_FILE, key = idem()) {
  return s.customer.multipart(
    `/api/orders/${order.code}/payments`,
    { paymentMethodId: s.methodUsd.id, amount: '270.00', currency: 'USD', reference: 'ZL-0001', paidAt: s.today, ...fields } as Record<string, string>,
    file ?? undefined,
    { 'idempotency-key': key },
  );
}

describe('Bloque D — pagos, comprobantes y reservas', () => {
  beforeEach(async () => {
    s = await scenario({ stock: 50 });
  });

  it('guarda el comprobante en almacenamiento privado y no confirma el pago al subirlo', async () => {
    const o = await newOrder();
    const res = await pay(o);
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('PENDING');
    const proof = await prisma.paymentProof.findFirstOrThrow();
    expect(proof.mimeType).toBe('image/png');
    expect(proof.sha256).toHaveLength(64);
    expect(fs.existsSync(path.join(config.storage.privateDir, proof.storageKey))).toBe(true);
    expect(fs.existsSync(path.join(config.storage.publicDir, proof.storageKey))).toBe(false);
    const order = (await s.customer.get(`/api/orders/${o.code}`)).json();
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.paidCents).toBe(0);
    // No es accesible por la ruta pública de archivos.
    const anon = new Client(s.app);
    expect((await anon.get(`/media/${proof.storageKey}`)).statusCode).toBe(404);
    expect((await anon.get(`/media/../private/${proof.storageKey}`)).statusCode).toBe(404);
  });

  it('valida extensión, contenido real y tamaño del comprobante', async () => {
    const o = await newOrder();
    const txt = await pay(o, {}, { name: 'pago.jpg', type: 'image/jpeg', data: Buffer.from('esto no es una imagen') });
    expect(txt.statusCode).toBe(415);
    const mismatch = await pay(o, {}, { name: 'pago.png', type: 'image/png', data: JPEG_HEADER });
    expect(mismatch.statusCode).toBe(415);
    const exe = await pay(o, {}, { name: 'pago.exe', type: 'application/octet-stream', data: PNG_1PX });
    expect(exe.statusCode).toBe(415);
    const svg = await pay(o, {}, { name: 'pago.svg', type: 'image/svg+xml', data: Buffer.from('<svg/>') });
    expect(svg.statusCode).toBe(415);
    await setSetting('uploads', { maxProofMB: 0.5 });
    const big = await pay(o, {}, { name: 'big.png', type: 'image/png', data: Buffer.concat([PNG_1PX, Buffer.alloc(600 * 1024)]) });
    expect(big.statusCode).toBe(413);
    const missing = await pay(o, {}, null);
    expect(missing.json().error.code).toBe('PROOF_REQUIRED');
    expect(await prisma.payment.count()).toBe(0);
  });

  it('controla el acceso a los comprobantes', async () => {
    const o = await newOrder();
    await pay(o);
    const proof = await prisma.paymentProof.findFirstOrThrow();
    expect((await s.customer.get(`/api/proofs/${proof.id}`)).statusCode).toBe(200);
    expect((await s.customer.get(`/api/proofs/${proof.id}`)).headers['cache-control']).toContain('no-store');
    expect((await s.admin.get(`/api/proofs/${proof.id}`)).statusCode).toBe(200);
    expect((await (await login(s.app, 'seller@test.local')).get(`/api/proofs/${proof.id}`)).statusCode).toBe(200);
    await createUser('CUSTOMER', 'otro@test.local');
    expect((await (await login(s.app, 'otro@test.local')).get(`/api/proofs/${proof.id}`)).statusCode).toBe(404);
    await createUser('SELLER', 'otro-vendedor@test.local');
    expect((await (await login(s.app, 'otro-vendedor@test.local')).get(`/api/proofs/${proof.id}`)).statusCode).toBe(404);
    expect((await new Client(s.app).get(`/api/proofs/${proof.id}`)).statusCode).toBe(401);
    await prisma.seller.update({ where: { id: s.seller.id }, data: { canViewProofs: false } });
    expect((await (await login(s.app, 'seller@test.local')).get(`/api/proofs/${proof.id}`)).statusCode).toBe(404);
  });

  it('revisión manual: aprobar confirma la operación; el vendedor sin permiso no puede revisar', async () => {
    const o = await newOrder();
    await pay(o);
    const payment = await prisma.payment.findFirstOrThrow();
    const seller = await login(s.app, 'seller@test.local');
    expect((await seller.post(`/api/staff/payments/${payment.id}/review`, { decision: 'APPROVE' })).statusCode).toBe(403);
    expect((await s.customer.post(`/api/staff/payments/${payment.id}/review`, { decision: 'APPROVE' })).statusCode).toBe(403);
    const pending = (await s.admin.get('/api/staff/payments?status=PENDING')).json();
    expect(pending).toHaveLength(1);
    const ok = await s.admin.post(`/api/staff/payments/${payment.id}/review`, { decision: 'APPROVE', notes: 'Verificado en banco' });
    expect(ok.statusCode).toBe(200);
    const order = (await s.customer.get(`/api/orders/${o.code}`)).json();
    expect(order.status).toBe('CONFIRMED');
    expect(order.paymentStatus).toBe('PAID');
    expect(order.paidCents).toBe(27_000);
    expect(order.balanceCents).toBe(0);
    expect(order.reservation.status).toBe('CONFIRMED');
    const again = await s.admin.post(`/api/staff/payments/${payment.id}/review`, { decision: 'APPROVE' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('ALREADY_REVIEWED');
    const reviewed = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(reviewed.reviewedById).toBe(s.adminUser.id);
    expect(reviewed.reviewNotes).toBe('Verificado en banco');
    expect(await prisma.auditLog.count({ where: { action: 'payment.approve' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: s.customerUser.id, type: 'PAYMENT_APPROVED' } })).toBe(1);
  });

  it('el vendedor con permiso revisa solo pagos de sus operaciones', async () => {
    await prisma.seller.update({ where: { id: s.seller.id }, data: { canReviewPayments: true } });
    const o = await newOrder();
    await pay(o);
    const payment = await prisma.payment.findFirstOrThrow();
    const otherSeller = await createUser('SELLER', 'otro-rev@test.local');
    await prisma.seller.update({ where: { id: otherSeller.seller!.id }, data: { canReviewPayments: true } });
    const other = await login(s.app, 'otro-rev@test.local');
    expect((await other.get('/api/staff/payments')).json()).toHaveLength(0);
    expect((await other.post(`/api/staff/payments/${payment.id}/review`, { decision: 'APPROVE' })).statusCode).toBe(403);
    const seller = await login(s.app, 'seller@test.local');
    expect((await seller.post(`/api/staff/payments/${payment.id}/review`, { decision: 'REJECT', notes: 'No aparece en el banco' })).statusCode).toBe(200);
  });

  it('impide pagos duplicados por reintentos y referencias repetidas', async () => {
    const o = await newOrder('PREPAY');
    // Reintentos concurrentes con la misma clave de idempotencia: un solo registro.
    const k2 = idem();
    const [first, second] = await Promise.all([pay(o, { amount: '100', reference: 'REF-A' }, DEFAULT_FILE, k2), pay(o, { amount: '100', reference: 'REF-A' }, DEFAULT_FILE, k2)]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 201]);
    const replay = await pay(o, { amount: '100', reference: 'REF-A' }, DEFAULT_FILE, k2);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().replayed).toBe(true);
    expect(await prisma.payment.count()).toBe(1);
    // Misma referencia con otra clave mientras está pendiente.
    const dupPending = await pay(o, { amount: '100', reference: 'ref a' });
    expect(dupPending.json().error.code).toBe('DUPLICATE_REFERENCE');
    const p = await prisma.payment.findFirstOrThrow();
    await s.admin.post(`/api/staff/payments/${p.id}/review`, { decision: 'APPROVE' });
    // Una referencia ya aprobada no puede volver a usarse (otra operación, mismo método).
    const o2 = await newOrder('PREPAY');
    const reused = await pay(o2, { amount: '100', reference: 'REF-A' });
    expect(reused.json().error.code).toBe('DUPLICATE_REFERENCE');
    // Índice único parcial en la base de datos como última barrera.
    await expect(
      prisma.payment.create({
        data: { ...p, id: undefined, idempotencyKey: idem(), orderId: o2.id, status: 'APPROVED', createdAt: undefined, updatedAt: undefined },
      }),
    ).rejects.toThrow();
  });

  it('prepago: confirma al alcanzar el mínimo y acredita pagos en Bs con la tasa de la operación', async () => {
    await setSetting('reservation', { prepayMinPercent: 30 });
    const o = await newOrder('PREPAY', 10, s.methodVes.id); // lista BCV: 270 USD, mínimo 81 USD
    // 2 956,50 Bs a 36,50 = 81,00 USD
    const r = await pay(o, { paymentMethodId: s.methodVes.id, currency: 'VES', amount: '2956.50', reference: 'PM-123' });
    expect(r.statusCode).toBe(201);
    const p = await prisma.payment.findFirstOrThrow();
    expect(p.creditUsdCents).toBe(8100);
    expect(p.rateValue.toFixed(8)).toBe('36.50000000');
    await s.admin.post(`/api/staff/payments/${p.id}/review`, { decision: 'APPROVE' });
    const order = (await s.customer.get(`/api/orders/${o.code}`)).json();
    expect(order.status).toBe('CONFIRMED');
    expect(order.paymentStatus).toBe('PARTIAL');
    expect(order.balanceCents).toBe(18_900);
    const wrongCurrency = await pay(o, { paymentMethodId: s.methodVes.id, currency: 'USD', reference: 'X-9' });
    expect(wrongCurrency.json().error.code).toBe('CURRENCY_MISMATCH');
  });

  it('un pago rechazado permite reemplazar el comprobante y vuelve a revisión', async () => {
    const o = await newOrder();
    await pay(o);
    const p = await prisma.payment.findFirstOrThrow();
    expect((await s.customer.multipart(`/api/payments/${p.id}/proofs`, {}, { name: 'n.png', type: 'image/png', data: PNG_1PX })).json().error.code).toBe('INVALID_STATE');
    await s.admin.post(`/api/staff/payments/${p.id}/review`, { decision: 'REJECT', notes: 'Imagen ilegible' });
    expect((await s.admin.post(`/api/staff/payments/${p.id}/review`, { decision: 'REJECT' })).statusCode).toBe(400);
    const rep = await s.customer.multipart(`/api/payments/${p.id}/proofs`, {}, { name: 'n.png', type: 'image/png', data: PNG_1PX });
    expect(rep.statusCode).toBe(200);
    expect(rep.json().status).toBe('PENDING');
    const proofs = await prisma.paymentProof.findMany({ where: { paymentId: p.id }, orderBy: { createdAt: 'asc' } });
    expect(proofs.map((x) => x.status)).toEqual(['REPLACED', 'PENDING']);
    await createUser('CUSTOMER', 'ajeno@test.local');
    const other = await login(s.app, 'ajeno@test.local');
    expect((await other.multipart(`/api/payments/${p.id}/proofs`, {}, { name: 'n.png', type: 'image/png', data: PNG_1PX })).statusCode).toBe(404);
  });

  it('las reservas vencidas liberan inventario; un pago pendiente las mantiene si así se configura', async () => {
    const o1 = await newOrder('PICKUP', 10);
    const o2 = await newOrder('PICKUP', 5);
    await pay(o2, { amount: '135' });
    await prisma.order.updateMany({ data: { expiresAt: new Date(Date.now() - 60_000) } });
    const r = await expireReservations();
    expect(r.expired).toBe(1);
    const inv = await prisma.inventory.findUniqueOrThrow({ where: { productId: s.product.id } });
    expect(inv.reservedBoxes).toBe(5);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o1.id } })).status).toBe('EXPIRED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o2.id } })).status).toBe('PENDING_PAYMENT');
    // Ejecutarlo de nuevo no libera dos veces.
    expect((await expireReservations()).expired).toBe(0);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: s.product.id } })).reservedBoxes).toBe(5);
    await setSetting('reservation', { extendWhilePaymentPending: false });
    expect((await expireReservations()).expired).toBe(1);
    expect((await prisma.payment.findFirstOrThrow()).status).toBe('REJECTED');
    expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: s.product.id } })).reservedBoxes).toBe(0);
    // Una operación vencida no acepta pagos.
    expect((await pay(o1, { reference: 'late' })).json().error.code).toBe('INVALID_STATE');
  });

  it('el cliente no puede alterar estados de pago o entrega', async () => {
    const o = await newOrder();
    expect((await s.customer.post(`/api/staff/orders/${o.id}/status`, { action: 'MARK_DELIVERED' })).statusCode).toBe(403);
    expect((await s.customer.post(`/api/staff/orders/${o.id}/payments`, { paymentMethodId: s.methodUsd.id, amount: '270', currency: 'USD', reference: 'x123', paidAt: s.today })).statusCode).toBe(403);
    // Campos extra en el checkout (precio, estado) son ignorados por el servidor.
    await s.customer.post('/api/cart/items', { productId: s.product.id, mode: 'BOXES', quantity: 1 });
    const res = await checkout(s.customer, { ...s, pickupDate: addDays(s.today, 2) }, { totalCents: 1, status: 'DELIVERED', paymentStatus: 'PAID', priceBoxCents: 1 });
    expect(res.json().order).toMatchObject({ totalCents: 2700, status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID' });
  });
});
