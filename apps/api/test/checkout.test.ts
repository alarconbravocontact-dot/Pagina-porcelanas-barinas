import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, weekdayOf } from '@porcelanas/shared';
import { checkout, createUser, idem, login, prisma, scenario, setSetting } from './helpers';

let s: Awaited<ReturnType<typeof scenario>>;

async function fillCart(c = s.customer, quantity: string | number = 10, mode: 'BOXES' | 'M2' = 'BOXES', productId = s.product.id) {
  const r = await c.post('/api/cart/items', { productId, mode, quantity });
  expect(r.statusCode).toBe(200);
}

describe('Bloque C — compra con vendedor obligatorio', () => {
  beforeEach(async () => {
    s = await scenario({ stock: 20 });
  });

  it('confirma una compra, reserva inventario, guarda copia histórica y vacía el carrito', async () => {
    await fillCart(s.customer, '30', 'M2');
    const quote = (await s.customer.post('/api/quotes', { items: [{ productId: s.product.id, mode: 'M2', quantity: '30' }] })).json();
    const res = await checkout(s.customer, s, { quoteId: quote.quoteId });
    expect(res.statusCode).toBe(201);
    const o = res.json().order;
    expect(o.code).toMatch(/^PC-[A-Z2-9]{8}$/);
    expect(o.status).toBe('PENDING_PAYMENT');
    expect(o.seller.id).toBe(s.seller.id);
    expect(o.totalCents).toBe(37_800);
    expect(o.requiredCents).toBe(37_800);
    expect(o.totalVesCents).toBe(1_379_700); // 378 × 36,50
    expect(o.rateValue).toBe('36.50000000');
    expect(o.items[0]).toMatchObject({ sku: 'POR-6060-BLA', boxes: 14, areaUnits: 302_400, priceBoxCents: 2700, requestedQuantity: '30' });
    const inv = await prisma.inventory.findUniqueOrThrow({ where: { productId: s.product.id } });
    expect(inv.reservedBoxes).toBe(14);
    expect(inv.onHandBoxes).toBe(20);
    const mv = await prisma.inventoryMovement.findFirst({ where: { type: 'RESERVE' } });
    expect(mv?.orderId).toBe(o.id);
    expect((await s.customer.get('/api/cart')).json().items).toHaveLength(0);
    const sellerNotif = await prisma.notification.findFirst({ where: { userId: s.sellerUser.id, type: 'ORDER_CREATED' } });
    expect(sellerNotif).not.toBeNull();
    // Cambiar el precio después no altera la operación confirmada.
    await prisma.product.update({ where: { id: s.product.id }, data: { priceBoxCents: 9999 } });
    const again = (await s.customer.get(`/api/orders/${o.code}`)).json();
    expect(again.items[0].priceBoxCents).toBe(2700);
    expect(again.totalCents).toBe(37_800);
  });

  it('rechaza compras sin vendedor, con vendedor inexistente o desactivado', async () => {
    await fillCart();
    const noSeller = await checkout(s.customer, { ...s, seller: { id: '' } });
    expect(noSeller.statusCode).toBe(400);
    expect(noSeller.json().error.details.fields.sellerId).toBeTruthy();
    const ghost = await checkout(s.customer, { ...s, seller: { id: '00000000-0000-4000-8000-000000000000' } });
    expect(ghost.statusCode).toBe(422);
    expect(ghost.json().error.code).toBe('SELLER_INVALID');
    await prisma.seller.update({ where: { id: s.seller.id }, data: { active: false } });
    const inactive = await checkout(s.customer, s);
    expect(inactive.statusCode).toBe(422);
    expect(inactive.json().error.code).toBe('SELLER_INVALID');
    expect((await s.customer.get('/api/sellers')).json()).toHaveLength(0);
    expect(await prisma.order.count()).toBe(0);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: s.product.id } })).reservedBoxes).toBe(0);
  });

  it('exige aceptar políticas, iniciar sesión y una tasa registrada', async () => {
    await fillCart();
    expect((await checkout(s.customer, s, { acceptPolicies: false })).statusCode).toBe(400);
    const { Client } = await import('./helpers');
    expect((await checkout(new Client(s.app), s)).statusCode).toBe(401);
    await prisma.exchangeRate.deleteMany();
    const noRate = await checkout(s.customer, s);
    expect(noRate.statusCode).toBe(409);
    expect(noRate.json().error.code).toBe('RATE_UNAVAILABLE');
  });

  it('una petición repetida con la misma clave no duplica la compra', async () => {
    await fillCart(s.customer, 5);
    const key = idem();
    const [a, b] = await Promise.all([checkout(s.customer, s, {}, key), checkout(s.customer, s, {}, key)]);
    const codes = new Set([a.json().order?.code, b.json().order?.code].filter(Boolean));
    expect(codes.size).toBe(1);
    const third = await checkout(s.customer, s, {}, key);
    expect(third.statusCode).toBe(200);
    expect(third.json().replayed).toBe(true);
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: s.product.id } })).reservedBoxes).toBe(5);
  });

  it('impide vender más de lo disponible y nunca deja existencias negativas (concurrencia)', async () => {
    await fillCart(s.customer, 21);
    const over = await checkout(s.customer, s);
    expect(over.statusCode).toBe(409);
    expect(over.json().error.code).toBe('INSUFFICIENT_STOCK');
    // Cinco clientes compiten por 20 cajas pidiendo 8 cada uno: solo dos pueden ganar.
    const clients = [];
    for (let i = 0; i < 5; i++) {
      await createUser('CUSTOMER', `c${i}@test.local`);
      const c = await login(s.app, `c${i}@test.local`);
      await fillCart(c, 8);
      clients.push(c);
    }
    const results = await Promise.all(clients.map((c) => checkout(c, s)));
    const ok = results.filter((r) => r.statusCode === 201).length;
    const rejected = results.filter((r) => r.statusCode === 409).length;
    expect(ok).toBe(2);
    expect(rejected).toBe(3);
    const inv = await prisma.inventory.findUniqueOrThrow({ where: { productId: s.product.id } });
    expect(inv.reservedBoxes).toBe(16);
    expect(inv.reservedBoxes).toBeLessThanOrEqual(inv.onHandBoxes);
  });

  it('valida fechas de retiro: pasadas, cerradas, bloqueadas, lejanas, anticipación y capacidad', async () => {
    await fillCart(s.customer, 1);
    const err = async (date: string) => (await checkout(s.customer, { ...s, pickupDate: date })).json().error?.code;
    expect(await err(addDays(s.today, -1))).toBe('INVALID_PICKUP_DATE');
    expect(await err(addDays(s.today, 40))).toBe('INVALID_PICKUP_DATE');
    const target = addDays(s.today, 4);
    await prisma.blockedPickupDate.create({ data: { date: new Date(`${target}T00:00:00Z`), reason: 'Inventario' } });
    expect(await err(target)).toBe('INVALID_PICKUP_DATE');
    const closedDay = addDays(s.today, 5);
    const weekdays = Array.from({ length: 7 }, () => ({ enabled: true, open: '08:00', close: '17:00' }));
    weekdays[weekdayOf(closedDay)] = { enabled: false, open: '08:00', close: '17:00' };
    await setSetting('pickup', { weekdays, minAdvanceHours: 24 * 3 });
    expect(await err(closedDay)).toBe('INVALID_PICKUP_DATE');
    expect(await err(addDays(s.today, 1))).toBe('INVALID_PICKUP_DATE'); // anticipación mínima de 72 h
    // Capacidad: 1 operación por día.
    weekdays[weekdayOf(closedDay)] = { enabled: true, open: '08:00', close: '17:00' };
    await setSetting('pickup', { weekdays, minAdvanceHours: 0, capacityPerDay: 1 });
    expect((await checkout(s.customer, { ...s, pickupDate: addDays(s.today, 6) })).statusCode).toBe(201);
    await createUser('CUSTOMER', 'x@test.local');
    const other = await login(s.app, 'x@test.local');
    await fillCart(other, 1);
    const full = await checkout(other, { ...s, pickupDate: addDays(s.today, 6) });
    expect(full.json().error.code).toBe('PICKUP_FULL');
    const avail = (await other.get('/api/pickup/availability?type=PICKUP')).json();
    const day = avail.days.find((d: { date: string }) => d.date === addDays(s.today, 6));
    expect(day).toMatchObject({ available: false, reason: 'Capacidad completa' });
  });

  it('pide reconfirmar si el precio cambió desde la cotización', async () => {
    await fillCart(s.customer, 2);
    const quote = (await s.customer.post('/api/quotes', { items: [{ productId: s.product.id, mode: 'BOXES', quantity: '2' }] })).json();
    await prisma.product.update({ where: { id: s.product.id }, data: { priceBoxCents: 3000 } });
    const res = await checkout(s.customer, s, { quoteId: quote.quoteId });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('QUOTE_CHANGED');
    expect(res.json().error.details.quote.subtotalCents).toBe(6000);
    await prisma.quote.update({ where: { id: quote.quoteId }, data: { validUntil: new Date(Date.now() - 1000) } });
    expect((await checkout(s.customer, s, { quoteId: quote.quoteId })).json().error.code).toBe('QUOTE_EXPIRED');
  });

  it('prepago: exige solo el porcentaje mínimo configurado', async () => {
    await setSetting('reservation', { prepayMinPercent: 30 });
    await fillCart(s.customer, 10);
    const res = await checkout(s.customer, { ...s, pickupDate: addDays(s.today, 60) }, { type: 'PREPAY' });
    expect(res.statusCode).toBe(201);
    const o = res.json().order;
    expect(o.type).toBe('PREPAY');
    expect(o.totalCents).toBe(27_000);
    expect(o.requiredCents).toBe(8_100);
    expect(o.reservation.status).toBe('HELD');
    expect(o.terms.prepayMinPercent).toBe(30);
  });

  it('aísla los datos entre clientes', async () => {
    await fillCart(s.customer, 1);
    const o = (await checkout(s.customer, s)).json().order;
    await createUser('CUSTOMER', 'intruso@test.local');
    const intruder = await login(s.app, 'intruso@test.local');
    expect((await intruder.get(`/api/orders/${o.code}`)).statusCode).toBe(404);
    expect((await intruder.get('/api/orders')).json()).toHaveLength(0);
    expect((await intruder.post(`/api/orders/${o.code}/cancel`, { reason: 'robo' })).statusCode).toBe(404);
    expect((await intruder.post(`/api/orders/${o.code}/reschedule`, { pickupDate: addDays(s.today, 5) })).statusCode).toBe(404);
    expect((await intruder.get(`/api/staff/orders/${o.id}`)).statusCode).toBe(403);
  });

  it('el cliente puede reprogramar y cancelar según la política, liberando cupos e inventario', async () => {
    await setSetting('cancellation', { maxReschedules: 1, rescheduleMinHours: 0, customerCancelMinHours: 0 });
    await fillCart(s.customer, 4);
    const o = (await checkout(s.customer, s)).json().order;
    const r1 = await s.customer.post(`/api/orders/${o.code}/reschedule`, { pickupDate: addDays(s.today, 7) });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().pickupDate).toBe(addDays(s.today, 7));
    const days = await prisma.pickupDay.findMany();
    expect(days.find((d) => d.date.toISOString().startsWith(s.pickupDate))?.booked).toBe(0);
    expect(days.find((d) => d.date.toISOString().startsWith(addDays(s.today, 7)))?.booked).toBe(1);
    const r2 = await s.customer.post(`/api/orders/${o.code}/reschedule`, { pickupDate: addDays(s.today, 8) });
    expect(r2.json().error.code).toBe('RESCHEDULE_LIMIT');
    const c = await s.customer.post(`/api/orders/${o.code}/cancel`, { reason: 'Cambio de planes' });
    expect(c.statusCode).toBe(200);
    expect(c.json().status).toBe('CANCELLED');
    expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: s.product.id } })).reservedBoxes).toBe(0);
    expect((await prisma.reservation.findFirstOrThrow()).status).toBe('RELEASED');
  });
});
