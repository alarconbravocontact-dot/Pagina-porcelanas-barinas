import { beforeAll, describe, expect, it } from 'vitest';
import { checkout, Client, createUser, idem, login, prisma, scenario } from './helpers';

let s: Awaited<ReturnType<typeof scenario>>;

describe('Indicadores', () => {
  beforeAll(async () => {
    s = await scenario({ stock: 100 });
  });

  it('calcula ventas, m², ventas por vendedor y cobros sin mezclar monedas', async () => {
    const seller2 = await createUser('SELLER', 'v2@test.local');
    const mk = async (sellerId: string, boxes: number, paymentMethodId = s.methodUsd.id) => {
      await s.customer.post('/api/cart/items', { productId: s.product.id, mode: 'BOXES', quantity: boxes });
      return (await checkout(s.customer, { ...s, seller: { id: sellerId } }, { paymentMethodId })).json().order;
    };
    const o1 = await mk(s.seller.id, 10); // 270 USD
    const o2 = await mk(seller2.seller!.id, 2, s.methodVes.id); // 54 USD, lista BCV (pago en Bs)
    await mk(s.seller.id, 1); // queda pendiente: no es venta
    await s.admin.post(`/api/staff/orders/${o1.id}/payments`, { paymentMethodId: s.methodUsd.id, amount: '270', currency: 'USD', reference: 'U-1', paidAt: s.today }, { 'idempotency-key': idem() });
    // 1 971 Bs a 36,50 = 54 USD
    await s.admin.post(`/api/staff/orders/${o2.id}/payments`, { paymentMethodId: s.methodVes.id, amount: '1971', currency: 'VES', reference: 'B-1', paidAt: s.today }, { 'idempotency-key': idem() });
    const d = (await s.admin.get('/api/admin/reports/dashboard')).json();
    expect(d.totals.salesUsdCents).toBe(32_400);
    expect(d.totals.orders).toBe(2);
    expect(d.totals.areaUnitsSold).toBe(12 * 21_600);
    expect(d.dailySales).toHaveLength(1);
    expect(d.dailySales[0].day).toBe(s.today);
    expect(d.salesBySeller.map((x: { totalCents: number }) => x.totalCents)).toEqual([27_000, 5_400]);
    const usd = d.collectedByCurrency.find((c: { currency: string }) => c.currency === 'USD');
    const ves = d.collectedByCurrency.find((c: { currency: string }) => c.currency === 'VES');
    expect(usd.amountCents).toBe(27_000);
    expect(ves.amountCents).toBe(197_100);
    expect(ves.creditUsdCents).toBe(5_400);
    expect(d.pendingPaymentOrders).toBe(1);
    expect(d.pendingDelivery).toBe(2);
    expect(d.upcomingPickups).toHaveLength(3);
    // Cancelar una venta la excluye de los indicadores (no se duplica ni persiste).
    await s.admin.post(`/api/staff/orders/${o2.id}/status`, { action: 'CANCEL', note: 'Prueba de reporte' });
    const d2 = (await s.admin.get('/api/admin/reports/dashboard')).json();
    expect(d2.totals.salesUsdCents).toBe(27_000);
  });

  it('detecta productos con stock bajo o agotado', async () => {
    await prisma.inventory.updateMany({ data: { lowStockThreshold: 200 } });
    const d = (await s.admin.get('/api/admin/reports/dashboard')).json();
    expect(d.lowStock[0].sku).toBe('POR-6060-BLA');
  });
});

describe('Seguridad', () => {
  it('rechaza peticiones que cambian estado sin token CSRF', async () => {
    const res = await s.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'cliente@test.local', password: 'Password1234' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF');
  });

  it('las contraseñas se guardan con Argon2id y la sesión usa cookie httpOnly', async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: 'cliente@test.local' } });
    expect(u.passwordHash.startsWith('$argon2id$')).toBe(true);
    const c = new Client(s.app);
    await c.init();
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'cliente@test.local', password: 'Password1234' },
      headers: { cookie: `csrf_token=${c.cookies.get('csrf_token')}`, 'x-csrf-token': c.cookies.get('csrf_token')! },
    });
    const sid = (res.cookies as { name: string; httpOnly?: boolean; sameSite?: string }[]).find((x) => x.name === 'sid')!;
    expect(sid.httpOnly).toBe(true);
    expect(sid.sameSite).toBe('Lax');
    const session = await prisma.session.findFirstOrThrow({ where: { userId: u.id }, orderBy: { createdAt: 'desc' } });
    expect(session.tokenHash).not.toContain((res.cookies as { name: string; value: string }[]).find((x) => x.name === 'sid')!.value);
  });

  it('credenciales inválidas reciben un mensaje genérico', async () => {
    const c = new Client(s.app);
    const a = await c.post('/api/auth/login', { email: 'noexiste@test.local', password: 'xxxxxxxxxx1' });
    const b = await c.post('/api/auth/login', { email: 'cliente@test.local', password: 'incorrecta123' });
    expect(a.statusCode).toBe(401);
    expect(b.json().error.message).toBe(a.json().error.message);
  });

  it('registro valida datos y evita correos duplicados', async () => {
    const c = new Client(s.app);
    const weak = await c.post('/api/auth/register', { fullName: 'Ana', email: 'ana@test.local', phone: '+58 412 1111111', password: 'corta' });
    expect(weak.statusCode).toBe(400);
    const ok = await c.post('/api/auth/register', { fullName: 'Ana López', email: 'ANA@test.local', phone: '+58 412 1111111', password: 'Segura12345' });
    expect(ok.statusCode).toBe(201);
    const session = (await c.get('/api/auth/session')).json();
    expect(session.user).toMatchObject({ email: 'ana@test.local', role: 'CUSTOMER' });
    const dup = await new Client(s.app).post('/api/auth/register', { fullName: 'Ana López', email: 'ana@test.local', phone: '+58 412 1111111', password: 'Segura12345' });
    expect(dup.statusCode).toBe(409);
    const out = await c.post('/api/auth/logout');
    expect(out.statusCode).toBe(200);
    expect((await c.get('/api/orders')).statusCode).toBe(401);
  });

  it('los errores internos no filtran detalles y las rutas desconocidas devuelven 404 JSON', async () => {
    const c = await login(s.app, 'cliente@test.local');
    const nf = await c.get('/api/no-existe');
    expect(nf.statusCode).toBe(404);
    expect(nf.json().error.code).toBe('NOT_FOUND');
    const bad = await c.get('/api/orders/%00%27');
    expect([400, 404]).toContain(bad.statusCode);
    expect(bad.body).not.toMatch(/prisma|stack|at /i);
  });

  it('aplica cabeceras de seguridad', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});
