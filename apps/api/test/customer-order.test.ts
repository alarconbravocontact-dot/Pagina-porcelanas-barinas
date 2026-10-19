import { beforeAll, describe, expect, it } from 'vitest';
import { Client, createUser, idem, login, PNG_1PX, prisma, scenario } from './helpers';

let s: Awaited<ReturnType<typeof scenario>>;
const PROFILE = { fullName: 'María José Pérez', city: 'Barinas', addressRef: 'Urb. Alto Barinas, calle 3', phone: '0414-555 1234', documentId: '12.345.678' };

async function buyAs(c: Client, extra: Record<string, unknown> = {}, key = idem()) {
  await c.post('/api/cart/items', { productId: s.product.id, mode: 'M2', quantity: '30' });
  return c.post(
    '/api/orders',
    { sellerId: s.seller.id, sellerConfirmed: true, type: 'PICKUP', pickupDate: s.pickupDate, paymentMethodId: s.methodUsd.id, acceptPolicies: true, ...extra },
    { 'idempotency-key': key },
  );
}

describe('Registro rápido del cliente y orden de compra', () => {
  let guest: Client;
  let order: { id: string; code: string };

  beforeAll(async () => {
    s = await scenario({ stock: 200 });
    guest = new Client(s.app);
  });

  it('valida en el servidor los cuatro datos obligatorios y no exige correo ni contraseña', async () => {
    const bad = await guest.put('/api/customers/profile', { fullName: 'Ana', city: '', addressRef: '', phone: 'abc', documentId: '12' });
    expect(bad.statusCode).toBe(400);
    expect(Object.keys(bad.json().error.details.fields).sort()).toEqual(['addressRef', 'city', 'documentId', 'fullName', 'phone']);
    expect(await prisma.customerProfile.count({ where: { fullName: 'Ana' } })).toBe(0);
  });

  it('registra el perfil, abre una sesión segura y conserva el carrito del visitante', async () => {
    await guest.post('/api/cart/items', { productId: s.product.id, mode: 'BOXES', quantity: 1 });
    const res = await guest.put('/api/customers/profile', PROFILE);
    expect(res.statusCode).toBe(201);
    expect(res.json().profile).toMatchObject({ fullName: 'María José Pérez', phone: '+584145551234', documentId: 'V-12345678', documentMasked: 'V-****5678', complete: true, hasCredentials: false });
    expect(guest.cookies.get('sid')).toBeTruthy();
    const row = await prisma.customerProfile.findUniqueOrThrow({ where: { documentId: 'V-12345678' }, include: { user: true } });
    expect(row).toMatchObject({ city: 'Barinas', addressRef: 'Urb. Alto Barinas, calle 3' });
    expect(row.user.email).toBeNull();
    expect(row.user.passwordHash).toBe('');
    const session = await prisma.session.findFirstOrThrow({ where: { userId: row.userId } });
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(150 * 24 * 3_600_000);
    expect((await guest.get('/api/cart')).json().items).toHaveLength(1);
  });

  it('reutiliza el perfil y permite corregirlo sin duplicarlo', async () => {
    const me = (await guest.get('/api/customers/me')).json();
    expect(me.complete).toBe(true);
    const upd = await guest.put('/api/customers/profile', { ...PROFILE, addressRef: 'Av. 23 de Enero, frente a la plaza' });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().created).toBe(false);
    expect(await prisma.customerProfile.count({ where: { documentId: 'V-12345678' } })).toBe(1);
    // Otro dispositivo con la misma cédula: no se crea duplicado ni se abre el perfil ajeno.
    const other = new Client(s.app);
    const dup = await other.put('/api/customers/profile', { ...PROFILE, documentId: 'V-12345678', phone: '04160000000' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('DOCUMENT_REGISTERED');
    expect(other.cookies.get('sid')).toBeUndefined();
    expect(JSON.stringify(dup.json())).not.toContain('María');
    expect(await prisma.customerProfile.count({ where: { documentId: 'V-12345678' } })).toBe(1);
    // No hay inicio de sesión por cédula o teléfono.
    expect((await other.get('/api/customers/me')).statusCode).toBe(401);
  });

  it('no permite generar la orden con el perfil incompleto', async () => {
    const legacy = await createUser('CUSTOMER', 'sin-datos@test.local');
    await prisma.customerProfile.update({ where: { id: legacy.customer!.id }, data: { documentId: null, city: '' } });
    const c = await login(s.app, 'sin-datos@test.local');
    const r = await buyAs(c);
    expect(r.statusCode).toBe(422);
    expect(r.json().error.code).toBe('PROFILE_INCOMPLETE');
    // Completa sus datos (cuenta con correo existente) y ya puede comprar.
    expect((await c.put('/api/customers/profile', { ...PROFILE, documentId: 'V-7654321', fullName: 'Pedro Rangel' })).statusCode).toBe(200);
    expect((await buyAs(c, {}, idem())).statusCode).toBe(201);
  });

  it('crea la orden con todos sus datos, importes recalculados y estados separados', async () => {
    const key = idem();
    // Valores manipulados por el navegador se ignoran.
    const r = await buyAs(guest, { totalCents: 1, status: 'DELIVERED', paymentStatus: 'PAID', fullName: 'Otro', phone: '000' }, key);
    expect(r.statusCode).toBe(201);
    order = r.json().order;
    const o = r.json().order;
    expect(o.code).toMatch(/^PC-[A-Z2-9]{8}$/);
    expect(o).toMatchObject({ status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID', paymentReviewState: 'AWAITING_PAYMENT', totalCents: 37_800, rateValue: '36.50000000' });
    expect(o.contactName).toBe('María José Pérez');
    expect(o.contactCity).toBe('Barinas');
    expect(o.contactDocumentMasked).toBe('V-****5678');
    expect(o.items.map((i: { sku: string; boxes: number }) => [i.sku, i.boxes])).toEqual([['POR-6060-BLA', 14]]);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: true } });
    expect(row).toMatchObject({
      preferredMethodId: s.methodUsd.id,
      sellerId: s.seller.id,
      contactDocumentId: 'V-12345678',
      contactPhone: '+584145551234',
      contactAddressRef: 'Av. 23 de Enero, frente a la plaza',
      totalCents: 37_800,
      totalVesCents: 1_379_700,
      paidCents: 0,
    });
    expect(row.items[0]).toMatchObject({ boxes: 14, areaUnits: 302_400, priceBoxCents: 2700, lineTotalCents: 37_800, requestedQuantity: '30' });
    expect(row.createdAt).toBeInstanceOf(Date);
    // Doble clic / reintento: la misma clave devuelve la misma orden.
    const again = await guest.post('/api/orders', { sellerId: s.seller.id, sellerConfirmed: true, type: 'PICKUP', pickupDate: s.pickupDate, paymentMethodId: s.methodUsd.id, acceptPolicies: true }, { 'idempotency-key': key });
    expect(again.statusCode).toBe(200);
    expect(again.json().order.code).toBe(o.code);
    expect(await prisma.order.count({ where: { customer: { documentId: 'V-12345678' } } })).toBe(1);
  });

  it('genera números de orden únicos', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 3; i++) {
      await guest.post('/api/cart/items', { productId: s.product.id, mode: 'BOXES', quantity: 1 });
      codes.add((await guest.post('/api/orders', { sellerId: s.seller.id, sellerConfirmed: true, type: 'PICKUP', pickupDate: s.pickupDate, paymentMethodId: s.methodUsd.id, acceptPolicies: true }, { 'idempotency-key': idem() })).json().order.code);
    }
    codes.add(order.code);
    expect(codes.size).toBe(4);
  });

  it('el vendedor asignado ve la orden con cliente, ubicación, productos, método y estado del comprobante', async () => {
    const seller = await login(s.app, 'seller@test.local');
    const list = (await seller.get('/api/staff/orders?q=' + order.code)).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      code: order.code,
      contactName: 'María José Pérez',
      contactPhone: '+584145551234',
      contactCity: 'Barinas',
      preferredMethod: { name: 'Zelle' },
      paymentReviewState: 'AWAITING_PAYMENT',
    });
    expect(list.items[0].items[0]).toMatchObject({ sku: 'POR-6060-BLA', boxes: 14 });
    expect(JSON.stringify(list)).not.toContain('12345678');
    // Cédula completa solo bajo consulta explícita y auditada.
    const doc = await seller.post(`/api/staff/orders/${order.id}/customer-document`);
    expect(doc.json().documentId).toBe('V-12345678');
    expect(await prisma.auditLog.count({ where: { action: 'customer.document_view', entityId: order.id } })).toBe(1);
    await createUser('SELLER', 'otro-v@test.local');
    const other = await login(s.app, 'otro-v@test.local');
    expect((await other.post(`/api/staff/orders/${order.id}/customer-document`)).statusCode).toBe(404);
    expect((await other.get('/api/staff/orders')).json().items).toHaveLength(0);
    expect((await guest.post(`/api/staff/orders/${order.id}/customer-document`)).statusCode).toBe(403);
    // Las notificaciones no incluyen la cédula.
    const notes = await prisma.notification.findMany();
    expect(notes.some((n) => /12345678|V-1234/.test(n.title + n.body))).toBe(false);
  });

  it('el comprobante no confirma el pago: recibido → en revisión → confirmado → en preparación', async () => {
    const pay = await guest.multipart(`/api/orders/${order.code}/payments`, { paymentMethodId: s.methodUsd.id, amount: '378', currency: 'USD', reference: `Z-${Date.now()}`, paidAt: s.today }, { name: 'p.png', type: 'image/png', data: PNG_1PX }, { 'idempotency-key': idem() });
    expect(pay.statusCode).toBe(201);
    let o = (await guest.get(`/api/orders/${order.code}`)).json();
    expect([o.status, o.paymentStatus, o.paymentReviewState]).toEqual(['PENDING_PAYMENT', 'UNPAID', 'PROOF_RECEIVED']);
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    const reviewerSeller = await login(s.app, 'seller@test.local');
    expect((await reviewerSeller.post(`/api/staff/payments/${payment.id}/start-review`)).statusCode).toBe(403);
    expect((await s.admin.post(`/api/staff/payments/${payment.id}/start-review`)).statusCode).toBe(200);
    o = (await guest.get(`/api/orders/${order.code}`)).json();
    expect([o.status, o.paymentStatus, o.paymentReviewState]).toEqual(['PENDING_PAYMENT', 'UNPAID', 'IN_REVIEW']);
    await s.admin.post(`/api/staff/payments/${payment.id}/review`, { decision: 'APPROVE' });
    o = (await guest.get(`/api/orders/${order.code}`)).json();
    expect([o.status, o.paymentStatus, o.paymentReviewState]).toEqual(['CONFIRMED', 'PAID', 'APPROVED']);
    expect(o.events.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(['CREATED', 'PAYMENT_SUBMITTED', 'PAYMENT_IN_REVIEW', 'PAYMENT_APPROVED', 'CONFIRMED']));
  });

  it('el vendedor envía un enlace de acceso para abrir el perfil en otro dispositivo; el cliente puede agregar correo', async () => {
    const seller = await login(s.app, 'seller@test.local');
    const link = (await seller.post(`/api/staff/orders/${order.id}/access-link`)).json();
    const token = new URL(`http://x${link.path}`).searchParams.get('token')!;
    const device2 = new Client(s.app);
    expect((await device2.post('/api/auth/access', { token })).statusCode).toBe(200);
    expect((await device2.get('/api/customers/me')).json().documentId).toBe('V-12345678');
    expect((await new Client(s.app).post('/api/auth/access', { token })).json().error.code).toBe('INVALID_TOKEN');
    const cred = await device2.post('/api/auth/credentials', { email: 'maria@test.local', password: 'MariaBarinas2026' });
    expect(cred.statusCode).toBe(200);
    expect((await login(s.app, 'maria@test.local', 'MariaBarinas2026').then((c) => c.get('/api/customers/me'))).json().fullName).toBe('María José Pérez');
  });
});
