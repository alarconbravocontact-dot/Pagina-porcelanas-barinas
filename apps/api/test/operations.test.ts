import { beforeEach, describe, expect, it } from 'vitest';
import { addDays } from '@porcelanas/shared';
import { checkout, createUser, idem, login, prisma, scenario } from './helpers';

let s: Awaited<ReturnType<typeof scenario>>;

async function order(boxes = 4) {
  await s.customer.post('/api/cart/items', { productId: s.product.id, mode: 'BOXES', quantity: boxes });
  return (await checkout(s.customer, s)).json().order as { id: string; code: string; totalCents: number };
}

describe('Bloques D/F — operación de vendedores y administradores', () => {
  beforeEach(async () => {
    s = await scenario({ stock: 30 });
  });

  it('el vendedor ve solo sus operaciones asignadas', async () => {
    const o = await order();
    const seller = await login(s.app, 'seller@test.local');
    const list = (await seller.get('/api/staff/orders')).json();
    expect(list.items.map((i: { code: string }) => i.code)).toEqual([o.code]);
    const detail = (await seller.get(`/api/staff/orders/${o.id}`)).json();
    expect(detail.customer.fullName).toBe('Cliente cliente@test.local');
    expect(detail.contactPhone).toBe('+584120000000');
    expect(detail.contactCity).toBe('Barinas');
    expect(detail.contactDocumentMasked).toMatch(/^V-\*{4}\d{4}$/);
    expect(JSON.stringify(detail)).not.toMatch(/V-1000\d{4}/);
    await createUser('SELLER', 'v2@test.local');
    const other = await login(s.app, 'v2@test.local');
    expect((await other.get('/api/staff/orders')).json().items).toHaveLength(0);
    expect((await other.get(`/api/staff/orders/${o.id}`)).statusCode).toBe(404);
    expect((await other.post(`/api/staff/orders/${o.id}/status`, { action: 'MARK_READY' })).statusCode).toBe(404);
  });

  it('flujo operativo: pago presencial, lista para retiro y entrega descuenta inventario', async () => {
    const o = await order(4);
    const seller = await login(s.app, 'seller@test.local');
    // Sin pago no se puede marcar lista ni entregar.
    expect((await seller.post(`/api/staff/orders/${o.id}/status`, { action: 'MARK_READY' })).json().error.code).toBe('INVALID_STATE');
    // Vendedor sin permiso de pagos no registra pagos presenciales.
    const cash = { paymentMethodId: s.methodUsd.id, amount: '108.00', currency: 'USD', reference: 'EF-001', paidAt: s.today };
    expect((await seller.post(`/api/staff/orders/${o.id}/payments`, cash, { 'idempotency-key': idem() })).statusCode).toBe(403);
    const rec = await s.admin.post(`/api/staff/orders/${o.id}/payments`, cash, { 'idempotency-key': idem() });
    expect(rec.statusCode).toBe(201);
    expect(rec.json().status).toBe('APPROVED');
    expect((await seller.post(`/api/staff/orders/${o.id}/status`, { action: 'MARK_READY' })).statusCode).toBe(200);
    expect((await seller.post(`/api/staff/orders/${o.id}/notes`, { kind: 'INCIDENT', body: 'Una caja con esquina golpeada, se reemplazó' })).statusCode).toBe(201);
    expect((await seller.post(`/api/staff/orders/${o.id}/status`, { action: 'MARK_DELIVERED' })).statusCode).toBe(200);
    const inv = await prisma.inventory.findUniqueOrThrow({ where: { productId: s.product.id } });
    expect(inv.onHandBoxes).toBe(26);
    expect(inv.reservedBoxes).toBe(0);
    const detail = (await s.admin.get(`/api/staff/orders/${o.id}`)).json();
    expect(detail.status).toBe('DELIVERED');
    expect(detail.reservation.status).toBe('FULFILLED');
    expect(detail.notes[0].kind).toBe('INCIDENT');
    expect(detail.events.map((e: { type: string }) => e.type)).toEqual(
      expect.arrayContaining(['CREATED', 'PAYMENT_RECORDED', 'CONFIRMED', 'READY', 'INCIDENT', 'DELIVERED']),
    );
    expect(await prisma.notification.count({ where: { type: 'ORDER_INCIDENT', userId: s.adminUser.id } })).toBe(1);
  });

  it('no se entrega con saldo pendiente y el vendedor no puede cancelar', async () => {
    const o = await order(4);
    const seller = await login(s.app, 'seller@test.local');
    await prisma.order.update({ where: { id: o.id }, data: { status: 'CONFIRMED' } });
    expect((await seller.post(`/api/staff/orders/${o.id}/status`, { action: 'MARK_DELIVERED' })).json().error.code).toBe('BALANCE_PENDING');
    expect((await seller.post(`/api/staff/orders/${o.id}/status`, { action: 'CANCEL', note: 'quiero' })).statusCode).toBe(403);
    const c = await s.admin.post(`/api/staff/orders/${o.id}/status`, { action: 'CANCEL', note: 'Cliente desistió' });
    expect(c.statusCode).toBe(200);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: s.product.id } })).reservedBoxes).toBe(0);
    // Los registros financieros no se eliminan físicamente.
    expect(await prisma.order.count()).toBe(1);
  });

  it('restricciones de permisos entre administrador y vendedor', async () => {
    const seller = await login(s.app, 'seller@test.local');
    const forbidden = [
      seller.put(`/api/admin/products/${s.product.id}`, {}),
      seller.post('/api/admin/rates', { rate: '1', effectiveDate: s.today, sourceNote: 'xxx' }),
      seller.put('/api/admin/settings/rate', {}),
      seller.get('/api/admin/sellers'),
      seller.get('/api/admin/users'),
      seller.get('/api/admin/audit'),
      seller.get('/api/admin/reports/dashboard'),
      seller.post(`/api/admin/products/${s.product.id}/movements`, { type: 'RECEIPT', boxes: 1, reason: 'xxx' }),
      seller.get('/api/staff/payments'),
    ];
    for (const r of await Promise.all(forbidden)) expect(r.statusCode).toBe(403);
    expect((await s.admin.get('/api/admin/reports/dashboard')).statusCode).toBe(200);
  });

  it('el administrador gestiona vendedores, roles y no puede bloquearse a sí mismo', async () => {
    const res = await s.admin.post('/api/admin/sellers', {
      fullName: 'María Pérez',
      displayName: 'María',
      email: 'maria@test.local',
      phone: '+58 412 5555555',
      password: 'Vendedora2026',
      canReviewPayments: true,
      canViewProofs: true,
    });
    expect(res.statusCode).toBe(201);
    const maria = await login(s.app, 'maria@test.local', 'Vendedora2026');
    expect((await maria.get('/api/staff/payments')).statusCode).toBe(200);
    const upd = await s.admin.put(`/api/admin/sellers/${res.json().id}`, { displayName: 'María P.', phone: '+58 412 5555555', active: false, canReviewPayments: true, canViewProofs: true });
    expect(upd.statusCode).toBe(200);
    // Al desactivarla se cierran sus sesiones.
    expect((await maria.get('/api/staff/orders')).statusCode).toBe(401);
    const sellers = (await s.customer.get('/api/sellers')).json();
    expect(sellers.map((x: { displayName: string }) => x.displayName)).not.toContain('María P.');
    const self = await s.admin.patch(`/api/admin/users/${s.adminUser.id}`, { role: 'CUSTOMER', active: true });
    expect(self.json().error.code).toBe('SELF_LOCKOUT');
    const promote = await s.admin.patch(`/api/admin/users/${s.customerUser.id}`, { role: 'SELLER', active: true });
    expect(promote.json().error.code).toBe('SELLER_PROFILE_REQUIRED');
  });

  it('bloquear una fecha la retira del calendario e informa operaciones afectadas', async () => {
    await order();
    const r = await s.admin.post('/api/admin/pickup/blocked-dates', { date: s.pickupDate, reason: 'Feriado' });
    expect(r.statusCode).toBe(201);
    expect(r.json().affectedOrders).toBe(1);
    const avail = (await s.customer.get('/api/pickup/availability?type=PICKUP')).json();
    expect(avail.days.find((d: { date: string }) => d.date === s.pickupDate).available).toBe(false);
    expect((await s.admin.delete(`/api/admin/pickup/blocked-dates/${s.pickupDate}`)).statusCode).toBe(200);
    void addDays;
  });

  it('la configuración comercial se valida y audita', async () => {
    const bad = await s.admin.put('/api/admin/settings/whatsapp', { number: '+58 412', greeting: 'Hola' });
    expect(bad.statusCode).toBe(400);
    const ok = await s.admin.put('/api/admin/settings/whatsapp', { number: '584121234567', greeting: 'Hola' });
    expect(ok.statusCode).toBe(200);
    const pub = (await s.customer.get('/api/settings/public')).json();
    expect(pub.whatsapp.number).toBe('584121234567');
    expect(pub.rate).toBeUndefined();
    expect(await prisma.auditLog.count({ where: { action: 'settings.update' } })).toBe(1);
    const audit = (await s.admin.get('/api/admin/audit?entityType=BusinessSetting')).json();
    expect(audit.items[0].actor.email).toBe('admin@test.local');
  });
});
