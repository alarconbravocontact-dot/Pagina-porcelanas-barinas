import { beforeAll, describe, expect, it } from 'vitest';
import { Client, createUser, login, prisma, scenario } from './helpers';

let s: Awaited<ReturnType<typeof scenario>>;

const base = (categoryId: string, extra: Record<string, unknown> = {}) => ({
  sku: 'GRI-6012',
  name: 'Cemento Gris',
  description: '',
  color: 'Gris',
  widthCm: 60,
  lengthCm: 120,
  piecesPerBox: 2,
  boxAreaM2: '1.44',
  pricingBasis: 'BOX',
  price: '25.92',
  finish: 'MATE',
  antiSlip: 'YES',
  status: 'ACTIVE',
  featured: false,
  categoryIds: [categoryId],
  lowStockThreshold: 3,
  ...extra,
});

describe('Bloque A — catálogo', () => {
  beforeAll(async () => {
    s = await scenario();
  });

  it('crea productos con precios coherentes por caja y por m²', async () => {
    const res = await s.admin.post('/api/admin/products', base(s.category.id, { initialStockBoxes: 2 }));
    expect(res.statusCode).toBe(201);
    const p = res.json();
    expect(p.priceBoxCents).toBe(2592);
    expect(p.priceM2Cents).toBe(1800);
    expect(p.sizeLabel).toBe('60x120');
    expect(p.onHandBoxes).toBe(2);
    expect(p.stockStatus).toBe('LOW');
    const history = await prisma.priceHistory.count({ where: { productId: p.id } });
    expect(history).toBe(1);
    const movement = await prisma.inventoryMovement.findFirst({ where: { productId: p.id } });
    expect(movement?.type).toBe('INITIAL');
  });

  it('rechaza SKU duplicado y datos inválidos', async () => {
    const dup = await s.admin.post('/api/admin/products', base(s.category.id));
    expect(dup.statusCode).toBe(409);
    const bad = await s.admin.post('/api/admin/products', base(s.category.id, { sku: 'X', price: '-1', boxAreaM2: 'abc', categoryIds: [] }));
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(bad.json().error.details.fields)).toEqual(expect.arrayContaining(['sku', 'price', 'boxAreaM2', 'categoryIds']));
  });

  it('edita un producto y registra el historial de precios', async () => {
    const p = (await s.admin.get('/api/admin/products?q=GRI-6012')).json().items[0];
    const res = await s.admin.put(`/api/admin/products/${p.id}`, base(s.category.id, { name: 'Cemento Gris Plus', price: '28.80' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Cemento Gris Plus');
    expect(res.json().priceM2Cents).toBe(2000);
    const hist = (await s.admin.get(`/api/admin/products/${p.id}/price-history`)).json();
    expect(hist).toHaveLength(2);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'product.update', entityId: p.id } });
    expect(audit).not.toBeNull();
  });

  it('solo el administrador gestiona productos', async () => {
    const seller = await login(s.app, 'seller@test.local');
    expect((await seller.post('/api/admin/products', base(s.category.id, { sku: 'NEW-1' }))).statusCode).toBe(403);
    expect((await s.customer.post('/api/admin/products', base(s.category.id, { sku: 'NEW-1' }))).statusCode).toBe(403);
    const anon = new Client(s.app);
    expect((await anon.post('/api/admin/products', base(s.category.id, { sku: 'NEW-1' }))).statusCode).toBe(401);
  });

  it('filtra el catálogo por color, tamaño, ambiente, acabado, precio, disponibilidad y búsqueda', async () => {
    const cocina = await prisma.category.create({ data: { name: 'Cocina', slug: 'cocina' } });
    await s.admin.post('/api/admin/products', base(cocina.id, { sku: 'MAD-2012', name: 'Roble', color: 'Madera', widthCm: 20, lengthCm: 120, finish: 'TEXTURIZADO', pricingBasis: 'M2', price: '9.90' }));
    await s.admin.post('/api/admin/products', base(cocina.id, { sku: 'OFF-1', name: 'Oculto', status: 'INACTIVE' }));
    const anon = new Client(s.app);
    const q = async (qs: string) => (await anon.get(`/api/catalog?${qs}`)).json();
    expect((await q('')).total).toBe(3);
    expect((await q('color=madera')).items.map((p: { sku: string }) => p.sku)).toEqual(['MAD-2012']);
    expect((await q('size=60x60')).items.map((p: { sku: string }) => p.sku)).toEqual(['POR-6060-BLA']);
    expect((await q('category=cocina')).total).toBe(1);
    expect((await q('finish=MATE')).items[0].sku).toBe('GRI-6012');
    expect((await q('minPrice=10&maxPrice=15')).items.map((p: { sku: string }) => p.sku)).toEqual(['POR-6060-BLA']);
    expect((await q('q=mad-20')).items[0].sku).toBe('MAD-2012');
    expect((await q('available=false')).items.map((p: { sku: string }) => p.sku)).toEqual(['MAD-2012']);
    expect((await q('available=true')).total).toBe(2);
    expect((await q('sort=price_asc')).items[0].sku).toBe('MAD-2012');
    const paged = await q('pageSize=2&page=2');
    expect(paged.items).toHaveLength(1);
    expect(paged.totalPages).toBe(2);
    // Los productos inactivos no aparecen en el catálogo público.
    expect((await anon.get('/api/products/OFF-1')).statusCode).toBe(404);
    const facets = (await anon.get('/api/catalog/facets')).json();
    expect(facets.colors.map((c: { value: string }) => c.value)).toEqual(['Blanco', 'Gris', 'Madera']);
  });

  it('las búsquedas con caracteres de inyección SQL son inofensivas', async () => {
    const anon = new Client(s.app);
    const res = await anon.get(`/api/catalog?q=${encodeURIComponent("' OR 1=1; DROP TABLE \"Product\"; --")}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(0);
    expect(await prisma.product.count()).toBeGreaterThan(0);
  });

  it('registra movimientos de inventario e impide existencias negativas', async () => {
    const p = (await s.admin.get('/api/admin/products?q=GRI-6012')).json().items[0];
    const ok = await s.admin.post(`/api/admin/products/${p.id}/movements`, { type: 'RECEIPT', boxes: 10, reason: 'Contenedor 1' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().onHandBoxes).toBe(12);
    const neg = await s.admin.post(`/api/admin/products/${p.id}/movements`, { type: 'DAMAGE', boxes: 50, reason: 'Rotura' });
    expect(neg.statusCode).toBe(409);
    expect(neg.json().error.code).toBe('INSUFFICIENT_STOCK');
    const inv = await prisma.inventory.findUniqueOrThrow({ where: { productId: p.id } });
    expect(inv.onHandBoxes).toBe(12);
    // La restricción CHECK de la base de datos también lo impide.
    await expect(prisma.inventory.update({ where: { productId: p.id }, data: { onHandBoxes: -1 } })).rejects.toThrow();
  });

  it('sube fotografías validando el contenido real', async () => {
    const p = (await s.admin.get('/api/admin/products?q=GRI-6012')).json().items[0];
    const { PNG_1PX } = await import('./helpers');
    const ok = await s.admin.multipart(`/api/admin/products/${p.id}/images`, { alt: 'foto' }, { name: 'foto.png', type: 'image/png', data: PNG_1PX });
    expect(ok.statusCode).toBe(201);
    const url = ok.json()[0].url;
    const anon = new Client(s.app);
    const img = await anon.get(url);
    expect(img.statusCode).toBe(200);
    const fake = await s.admin.multipart(`/api/admin/products/${p.id}/images`, {}, { name: 'x.png', type: 'image/png', data: Buffer.from('<svg onload=alert(1)>') });
    expect(fake.statusCode).toBe(415);
  });

  it('el vendedor desactivado pierde acceso', async () => {
    const u = await createUser('SELLER', 'inactivo@test.local');
    const c = await login(s.app, 'inactivo@test.local');
    await prisma.seller.update({ where: { id: u.seller!.id }, data: { active: false } });
    expect((await c.get('/api/staff/orders')).statusCode).toBe(403);
  });
});
