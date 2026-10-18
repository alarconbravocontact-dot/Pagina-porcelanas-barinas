import { beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@porcelanas/shared';
import { Client, createUser, login, prisma, scenario, setSetting } from './helpers';
import { parseBcvHtml, fetchBcvRate } from '../src/services/rates';

let s: Awaited<ReturnType<typeof scenario>>;

describe('Bloque B — cotización, tasa BCV y carrito', () => {
  beforeAll(async () => {
    s = await scenario({ rate: '36.54320000' });
  });

  it('30 m² con cajas de 2,16 m² cotiza 14 cajas (30,24 m²) en USD y Bs', async () => {
    const anon = new Client(s.app);
    const res = await anon.post('/api/quotes', { items: [{ productId: s.product.id, mode: 'M2', quantity: '30' }] });
    expect(res.statusCode).toBe(200);
    const q = res.json();
    expect(q.lines[0].boxes).toBe(14);
    expect(q.lines[0].areaUnits).toBe(302_400);
    expect(q.lines[0].priceBoxCents).toBe(2700); // 12,50 × 2,16
    expect(q.subtotalCents).toBe(37_800);
    expect(q.rate.rate).toBe('36.54320000');
    expect(q.totalVesCents).toBe(1_381_333); // 378 × 36,5432 = 13 813,3296
    expect(q.quoteId).toBeTruthy();
    // La cotización conserva la tasa utilizada.
    const stored = await prisma.quote.findUniqueOrThrow({ where: { id: q.quoteId } });
    expect(stored.rateValue?.toFixed(8)).toBe('36.54320000');
    expect(stored.exchangeRateId).toBe(q.rate.id);
  });

  it('rechaza cantidades inválidas y productos inexistentes', async () => {
    const anon = new Client(s.app);
    expect((await anon.post('/api/quotes', { items: [{ productId: s.product.id, mode: 'BOXES', quantity: '1.5' }] })).statusCode).toBe(400);
    expect((await anon.post('/api/quotes', { items: [{ productId: s.product.id, mode: 'M2', quantity: '-2' }] })).statusCode).toBe(400);
    const missing = await anon.post('/api/quotes', { items: [{ productId: '00000000-0000-4000-8000-000000000000', mode: 'BOXES', quantity: 1 }] });
    expect(missing.statusCode).toBe(409);
  });

  it('registra tasas manuales con usuario, fuente y fecha, y usa la vigente', async () => {
    const res = await s.admin.post('/api/admin/rates', { rate: '37,10', effectiveDate: s.today, sourceNote: 'Publicación oficial BCV' });
    expect(res.statusCode).toBe(201);
    // Una tasa con fecha valor futura no se aplica todavía.
    await s.admin.post('/api/admin/rates', { rate: '40.00', effectiveDate: addDays(s.today, 2), sourceNote: 'Publicada para el lunes' });
    const current = (await new Client(s.app).get('/api/rates/current')).json().rate;
    expect(current.rate).toBe('37.10000000');
    expect(current.source).toBe('MANUAL');
    expect(current.createdBy).toBe('admin@test.local');
    expect(current.stale).toBe(false);
    const list = (await s.admin.get('/api/admin/rates')).json();
    expect(list.history.length).toBe(3);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'rate.manual' } });
    expect(audit?.actorId).toBe(s.adminUser.id);
    // Solo el administrador puede registrar tasas.
    expect((await s.customer.post('/api/admin/rates', { rate: '1', effectiveDate: s.today, sourceNote: 'xxx' })).statusCode).toBe(403);
  });

  it('marca la tasa como desactualizada según la vigencia configurada', async () => {
    await prisma.exchangeRate.updateMany({ data: { createdAt: new Date(Date.now() - 100 * 3_600_000) } });
    const r = (await new Client(s.app).get('/api/rates/current')).json();
    expect(r.rate.stale).toBe(true);
    await prisma.exchangeRate.updateMany({ data: { createdAt: new Date() } });
  });

  it('interpreta la estructura del portal BCV y no registra nada si la fuente falla', async () => {
    const html = `<div id="dolar" class="col-sm-12"><div class="field-content"><div class="row recuadrotsmc">
      <div class="col-sm-6"><span> USD</span></div><div class="col-sm-6 centrado"><strong> 1.234,56789012 </strong></div></div></div></div>
      <div class="pull-right dinpro center">Fecha Valor: <span class="date-display-single" property="dc:date" content="2026-10-19T00:00:00-04:00">Lunes</span></div>`;
    expect(parseBcvHtml(html)).toEqual({ rate: '1234.56789012', effectiveDate: '2026-10-19' });
    expect(parseBcvHtml('<html>sin datos</html>')).toBeNull();
    const before = await prisma.exchangeRate.count();
    const failing = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const r = await fetchBcvRate(failing);
    expect(r.ok).toBe(false);
    const okFetch = (async () => new Response(html, { status: 200 })) as unknown as typeof fetch;
    const ok = await fetchBcvRate(okFetch);
    expect(ok).toMatchObject({ ok: true, created: true, rate: '1234.56789012' });
    const again = await fetchBcvRate(okFetch);
    expect(again).toMatchObject({ ok: true, created: false });
    expect(await prisma.exchangeRate.count()).toBe(before + 1);
    await prisma.exchangeRate.deleteMany({ where: { source: 'BCV_AUTO' } });
  });

  it('el carrito de visitante persiste en servidor y se fusiona al iniciar sesión', async () => {
    const guest = new Client(s.app);
    const add = await guest.post('/api/cart/items', { productId: s.product.id, mode: 'M2', quantity: '10' });
    expect(add.statusCode).toBe(200);
    expect(add.json().items[0].line.boxes).toBe(5);
    expect(guest.cookies.get('cart_token')).toBeTruthy();
    const again = (await guest.get('/api/cart')).json();
    expect(again.items).toHaveLength(1);
    expect(again.quote.subtotalCents).toBe(5 * 2700);
    const loginRes = await guest.post('/api/auth/login', { email: 'cliente@test.local', password: 'Password1234' });
    expect(loginRes.statusCode).toBe(200);
    const merged = (await guest.get('/api/cart')).json();
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].quantity).toBe('10');
    expect(await prisma.cart.count({ where: { guestToken: { not: null } } })).toBe(0);
    const item = merged.items[0];
    const upd = await guest.patch(`/api/cart/items/${item.id}`, { mode: 'BOXES', quantity: 3 });
    expect(upd.json().quote.subtotalCents).toBe(8100);
    // Otro usuario no puede modificar artículos ajenos.
    await createUser('CUSTOMER', 'otro-carrito@test.local');
    const other = await login(s.app, 'otro-carrito@test.local');
    expect((await other.delete(`/api/cart/items/${item.id}`)).statusCode).toBe(404);
    expect((await guest.delete(`/api/cart/items/${item.id}`)).json().items).toHaveLength(0);
  });

  it('la configuración de vigencia de cotizaciones se respeta', async () => {
    await setSetting('quote', { validityMinutes: 5 });
    const q = (await new Client(s.app).post('/api/quotes', { items: [{ productId: s.product.id, mode: 'BOXES', quantity: 1 }] })).json();
    const diff = new Date(q.validUntil).getTime() - Date.now();
    expect(diff).toBeGreaterThan(4 * 60_000);
    expect(diff).toBeLessThanOrEqual(5 * 60_000);
  });
});
