import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@porcelanas/shared';
import { checkout, Client, idem, login, PNG_1PX, prisma, scenario } from './helpers';
import { config } from '../src/config';
import { catalogSku, disableDemoData, ensurePaymentMethods, ensureSeller, importCatalog, JUAN } from '../src/seed/business';

let s: Awaited<ReturnType<typeof scenario>>;
const dataDir = path.resolve(import.meta.dirname, '../prisma/data');

describe('Vendedor Juan Alarcon, métodos de pago y catálogo de Barinas', () => {
  beforeAll(async () => {
    s = await scenario({ stock: 200, rate: '36.50000000' });
    // El escenario trae otro vendedor; para este bloque Juan es el único activo, como en producción.
    await prisma.seller.update({ where: { id: s.seller.id }, data: { active: false } });
  });

  it('registra el perfil en la base de datos sin duplicarlo ni inventar contraseña', async () => {
    const a = await ensureSeller(prisma);
    const b = await ensureSeller(prisma);
    expect(a.seller.id).toBe(b.seller.id);
    expect(await prisma.user.count({ where: { email: JUAN.email } })).toBe(1);
    expect(await prisma.seller.count({ where: { userId: a.user.id } })).toBe(1);
    const seller = await prisma.seller.findUniqueOrThrow({ where: { id: a.seller.id }, include: { user: true } });
    expect(seller).toMatchObject({ displayName: 'Juan Alarcon', city: 'Barinas', whatsapp: '584125552594', publicEmail: JUAN.email, active: true });
    expect(seller.user.role).toBe('SELLER');
    expect(seller.user.passwordHash).toBe('');
    expect(a.pendingActivation).toBe(true);
    // Sin contraseña no se puede iniciar sesión.
    expect((await new Client(s.app).post('/api/auth/login', { email: JUAN.email, password: 'cualquier-cosa1' })).statusCode).toBe(401);
  });

  it('expone solo los datos comerciales públicos del vendedor', async () => {
    const sellers = (await new Client(s.app).get('/api/sellers')).json();
    expect(sellers).toHaveLength(1);
    expect(sellers[0]).toEqual({
      id: expect.any(String),
      displayName: 'Juan Alarcon',
      bio: null,
      city: 'Barinas',
      branch: 'Sede Barinas, Venezuela',
      publicPhone: '04125552594',
      whatsapp: '584125552594',
      publicEmail: JUAN.email,
    });
  });

  it('activa la cuenta con un enlace de un solo uso generado por el administrador', async () => {
    const juan = await prisma.user.findUniqueOrThrow({ where: { email: JUAN.email } });
    const link = await s.admin.post(`/api/admin/users/${juan.id}/activation-link`);
    expect(link.statusCode).toBe(200);
    const token = new URL(`http://x${link.json().path}`).searchParams.get('token')!;
    const anon = new Client(s.app);
    expect((await anon.post('/api/auth/activation/check', { token })).json().email).toBe(JUAN.email);
    expect((await anon.post('/api/auth/activate', { token, password: 'corta' })).statusCode).toBe(400);
    const ok = await anon.post('/api/auth/activate', { token, password: 'JuanBarinas2026' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().role).toBe('SELLER');
    expect((await anon.post('/api/auth/activate', { token, password: 'OtraClave2026' })).json().error.code).toBe('INVALID_TOKEN');
    const juanClient = await login(s.app, JUAN.email, 'JuanBarinas2026');
    expect((await juanClient.get('/api/staff/orders')).statusCode).toBe(200);
    // Solo el administrador genera enlaces.
    expect((await s.customer.post(`/api/admin/users/${juan.id}/activation-link`)).statusCode).toBe(403);
  });

  it('los métodos iniciales se cargan de la configuración y los no configurados no se pueden usar', async () => {
    await prisma.paymentMethod.deleteMany({ where: { id: { notIn: [s.methodUsd.id, s.methodVes.id] } } });
    await prisma.paymentMethod.updateMany({ data: { sortOrder: 99 } });
    await ensurePaymentMethods(prisma);
    await ensurePaymentMethods(prisma);
    const methods = (await new Client(s.app).get('/api/payment-methods')).json() as { kind: string; configured: boolean; available: boolean; instructions: string; receivingDetails: string }[];
    // Cuatro métodos electrónicos activos + los dos configurados del escenario; efectivo inactivo por defecto.
    expect(methods.map((m) => m.kind)).toEqual(expect.arrayContaining(['PAGO_MOVIL', 'ZELLE', 'BINANCE', 'BANK_TRANSFER']));
    expect(methods.some((m) => m.kind === 'CASH')).toBe(false);
    const binance = methods.find((m) => m.kind === 'BINANCE')!;
    expect(binance).toMatchObject({ configured: false, available: false, instructions: '', receivingDetails: '' });
    const binanceRow = await prisma.paymentMethod.findFirstOrThrow({ where: { kind: 'BINANCE' } });
    await s.customer.post('/api/cart/items', { productId: s.product.id, mode: 'BOXES', quantity: 1 });
    const seller = (await new Client(s.app).get('/api/sellers')).json()[0];
    const r = await checkout(s.customer, { ...s, seller }, { paymentMethodId: binanceRow.id });
    expect(r.json().error.code).toBe('PAYMENT_METHOD_NOT_CONFIGURED');
    // El administrador completa los datos de recepción y el método queda disponible.
    const upd = await s.admin.put(`/api/admin/payment-methods/${binanceRow.id}`, {
      kind: 'BINANCE', name: 'Binance Pay', currency: 'USD', instructions: binanceRow.instructions, receivingDetails: 'Binance Pay ID: 000000 (prueba)',
      buyerNote: 'Indique su número de operación', proofInstructions: binanceRow.proofInstructions, requiresProof: true, active: true, sortOrder: 2,
    });
    expect(upd.statusCode).toBe(200);
    const after = (await new Client(s.app).get('/api/payment-methods')).json().find((m: { kind: string }) => m.kind === 'BINANCE');
    expect(after).toMatchObject({ configured: true, available: true, receivingDetails: 'Binance Pay ID: 000000 (prueba)' });
  });

  it('exige vendedor válido y confirmado; guarda el método elegido sin marcar la operación como pagada', async () => {
    const seller = (await new Client(s.app).get('/api/sellers')).json()[0];
    await s.customer.post('/api/cart/items', { productId: s.product.id, mode: 'BOXES', quantity: 2 });
    const noConfirm = await checkout(s.customer, { ...s, seller }, { sellerConfirmed: false });
    expect(noConfirm.json().error.details.fields.sellerConfirmed).toBeTruthy();
    const none = await checkout(s.customer, { ...s, seller: { id: '' } });
    expect(none.statusCode).toBe(400);
    const ok = await checkout(s.customer, { ...s, seller });
    expect(ok.statusCode).toBe(201);
    const o = ok.json().order;
    expect(o.seller).toMatchObject({ displayName: 'Juan Alarcon', whatsapp: '584125552594', publicEmail: JUAN.email, city: 'Barinas' });
    expect(o.preferredMethod).toMatchObject({ id: s.methodUsd.id, name: 'Zelle', receivingDetails: 'Destinatario de prueba' });
    expect(o.priceList).toBe('DIVISA');
    expect(o.paymentStatus).toBe('UNPAID');
    expect(o.paymentReviewState).toBe('AWAITING_PAYMENT');
    expect(o.status).toBe('PENDING_PAYMENT');
    const row = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(row.preferredMethodId).toBe(s.methodUsd.id);
    expect(row.paidCents).toBe(0);
    // Comprobante recibido ≠ pago aprobado.
    const pay = await s.customer.multipart(`/api/orders/${o.code}/payments`, { paymentMethodId: s.methodUsd.id, amount: '54', currency: 'USD', reference: `J-${Date.now()}`, paidAt: s.today }, { name: 'p.png', type: 'image/png', data: PNG_1PX }, { 'idempotency-key': idem() });
    expect(pay.statusCode).toBe(201);
    const after = (await s.customer.get(`/api/orders/${o.code}`)).json();
    expect(after.paymentReviewState).toBe('PROOF_RECEIVED');
    expect(after.paymentStatus).toBe('UNPAID');
    expect(after.status).toBe('PENDING_PAYMENT');
    // Juan (con permiso de revisión) aprueba desde su panel.
    const juan = await login(s.app, JUAN.email, 'JuanBarinas2026');
    const pending = (await juan.get('/api/staff/payments')).json();
    expect(pending).toHaveLength(1);
    expect((await juan.post(`/api/staff/payments/${pending[0].id}/review`, { decision: 'APPROVE' })).statusCode).toBe(200);
    const final = (await s.customer.get(`/api/orders/${o.code}`)).json();
    expect(final.paymentReviewState).toBe('APPROVED');
    expect(final.status).toBe('CONFIRMED');
  });

  it('aplica el precio BCV cuando el método es en bolívares y registra la tasa usada', async () => {
    await prisma.product.update({ where: { id: s.product.id }, data: { priceBcvBoxCents: 3200, priceBcvM2Cents: 1481 } });
    const seller = (await new Client(s.app).get('/api/sellers')).json()[0];
    const q = (await new Client(s.app).post('/api/quotes', { items: [{ productId: s.product.id, mode: 'BOXES', quantity: 10 }] })).json();
    expect(q.subtotalCents).toBe(27_000);
    expect(q.subtotalBcvCents).toBe(32_000);
    expect(q.totalVesCents).toBe(1_168_000); // 320 × 36,50 (precio BCV × tasa)
    await s.customer.post('/api/cart/items', { productId: s.product.id, mode: 'BOXES', quantity: 10 });
    const bcv = (await checkout(s.customer, { ...s, seller }, { paymentMethodId: s.methodVes.id })).json().order;
    expect(bcv).toMatchObject({ priceList: 'BCV', totalCents: 32_000, totalVesCents: 1_168_000, rateValue: '36.50000000' });
    expect(bcv.items[0].priceBoxCents).toBe(3200);
    // Pagar en USD una operación con precio BCV se rechaza.
    const wrong = await s.customer.multipart(`/api/orders/${bcv.code}/payments`, { paymentMethodId: s.methodUsd.id, amount: '320', currency: 'USD', reference: `W-${Date.now()}`, paidAt: s.today }, { name: 'p.png', type: 'image/png', data: PNG_1PX }, { 'idempotency-key': idem() });
    expect(wrong.json().error.code).toBe('PRICE_LIST_MISMATCH');
    await s.customer.post('/api/cart/items', { productId: s.product.id, mode: 'BOXES', quantity: 10 });
    const usd = (await checkout(s.customer, { ...s, seller, pickupDate: addDays(s.today, 4) })).json().order;
    expect(usd).toMatchObject({ priceList: 'DIVISA', totalCents: 27_000 });
  });

  it('importa el catálogo de Barinas de forma idempotente con precios, guía de uso e imágenes', async () => {
    const r1 = await importCatalog(prisma, dataDir, config.storage.publicDir);
    expect(r1.created).toBe(72);
    expect(r1.images).toBe(70);
    expect(r1.drafts).toHaveLength(5);
    const r2 = await importCatalog(prisma, dataDir, config.storage.publicDir);
    expect(r2).toMatchObject({ created: 0, skipped: 72 });
    const napoles = await new Client(s.app).get(`/api/products/${catalogSku({ index: 1, widthCm: 60, lengthCm: 60 })}`);
    expect(napoles.statusCode).toBe(200);
    expect(napoles.json()).toMatchObject({
      name: 'Porcelanico Sal Soluble Napoles Slim', priceM2Cents: 2511, priceBcvM2Cents: 3020, boxAreaUnits: 14_400, piecesPerBox: 4,
      slipRating: 'SLIPPERY', availableBoxes: 0, stockStatus: 'OUT',
    });
    expect(napoles.json().usageGuide).toEqual({ salas: 'YES', cocina: 'CAUTION', pisoBano: 'NO', ducha: 'NO', exterior: 'NO', paredes: 'YES' });
    expect(napoles.json().images).toHaveLength(1);
    // Las piezas con caja incoherente quedan en borrador (no visibles en el catálogo público).
    expect((await new Client(s.app).get('/api/products/BRN-57-90X180')).statusCode).toBe(404);
    // Filtro por uso recomendado: solo la línea Slipstop R11 es apta para ducha.
    const ducha = (await new Client(s.app).get('/api/catalog?use=ducha&pageSize=60')).json();
    expect(ducha.total).toBe(3);
    expect(ducha.items.every((p: { slipRating: string }) => p.slipRating === 'R11')).toBe(true);
    const r10 = (await new Client(s.app).get('/api/catalog?slip=R10&pageSize=60')).json();
    expect(r10.total).toBe(7);
  });

  it('desactiva los datos de demostración en modo negocio', async () => {
    await prisma.product.update({ where: { id: s.product.id }, data: { isDemo: true } });
    const r = await disableDemoData(prisma);
    expect(r.products).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: s.product.id } })).status).toBe('INACTIVE');
  });
});
