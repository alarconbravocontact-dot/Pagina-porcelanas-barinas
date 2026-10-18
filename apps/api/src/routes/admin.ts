import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import {
  blockedDateSchema,
  catalogQuerySchema,
  categoryInputSchema,
  dateSchema,
  inventoryMovementInputSchema,
  manualRateSchema,
  paymentMethodInputSchema,
  productInputSchema,
  SETTINGS_KEYS,
  sellerCreateSchema,
  sellerUpdateSchema,
  userRoleUpdateSchema,
  PRODUCT_STATUS,
  type SettingsKey,
} from '@porcelanas/shared';
import { z } from 'zod';
import { prisma } from '../db';
import { audit } from '../lib/audit';
import { requirePermission } from '../lib/auth';
import { hashPassword } from '../lib/crypto';
import { badRequest, conflict, notFound, parse } from '../lib/errors';
import { readMultipart } from '../lib/multipart';
import { storage } from '../lib/storage';
import { createProduct, getProduct, listCatalog, toAdminProduct, updateProduct } from '../services/catalog';
import { adjustInventory } from '../services/inventory';
import { fromDbDate, toDbDate } from '../services/pickup';
import { fetchBcvRate, getCurrentRate, listRates, recordManualRate } from '../services/rates';
import { dashboard } from '../services/reports';
import { getSettings, updateSetting } from '../services/settings';

const MAX_PRODUCT_IMAGE = 8 * 1024 * 1024;

export async function adminRoutes(app: FastifyInstance) {
  // ---------------- Productos ----------------
  app.get('/api/admin/products', async (req) => {
    requirePermission(req, 'catalog:manage');
    const extra = parse(z.object({ status: z.enum(PRODUCT_STATUS).optional() }), req.query);
    return listCatalog(parse(catalogQuerySchema, req.query), { admin: true, status: extra.status });
  });

  app.get<{ Params: { id: string } }>('/api/admin/products/:id', async (req) => {
    requirePermission(req, 'catalog:manage');
    return getProduct(req.params.id, { admin: true });
  });

  app.post('/api/admin/products', async (req, reply) => {
    const auth = requirePermission(req, 'catalog:manage');
    const body = req.body as Record<string, unknown>;
    const input = parse(productInputSchema, body);
    const initial = parse(z.coerce.number().int().min(0).max(1_000_000).default(0), body?.initialStockBoxes ?? 0);
    const product = await createProduct(input, auth.userId, initial);
    await audit(req, 'product.create', 'Product', product.id, { sku: product.sku, initialStockBoxes: initial });
    return reply.status(201).send(toAdminProduct(product));
  });

  app.put<{ Params: { id: string } }>('/api/admin/products/:id', async (req) => {
    const auth = requirePermission(req, 'catalog:manage');
    const input = parse(productInputSchema, req.body);
    const { product, priceChanged, previous } = await updateProduct(req.params.id, input, auth.userId);
    await audit(req, 'product.update', 'Product', product.id, {
      sku: product.sku,
      status: product.status,
      ...(priceChanged ? { previous, priceBoxCents: product.priceBoxCents, priceM2Cents: product.priceM2Cents } : {}),
    });
    return toAdminProduct(product);
  });

  app.post<{ Params: { id: string } }>('/api/admin/products/:id/images', async (req, reply) => {
    requirePermission(req, 'catalog:manage');
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { _count: { select: { images: true } } } });
    if (!product) throw notFound('Producto no encontrado');
    const { fields, files } = await readMultipart(req, MAX_PRODUCT_IMAGE, 10);
    if (files.length === 0) throw badRequest('NO_FILES', 'Adjunte al menos una imagen');
    if (product._count.images + files.length > 12) throw badRequest('TOO_MANY_IMAGES', 'Máximo 12 imágenes por producto');
    const created = [];
    let order = product._count.images;
    for (const f of files) {
      const key = await storage.savePublic(`products/${product.id}`, f);
      created.push(
        await prisma.productImage.create({
          data: { productId: product.id, storageKey: key, mimeType: f.mimeType, sizeBytes: f.buffer.length, alt: fields.alt ?? '', sortOrder: order++ },
        }),
      );
    }
    await audit(req, 'product.images_add', 'Product', product.id, { count: created.length });
    return reply.status(201).send(created.map((i) => ({ id: i.id, url: storage.publicUrl(i.storageKey) })));
  });

  app.delete<{ Params: { id: string; imageId: string } }>('/api/admin/products/:id/images/:imageId', async (req) => {
    requirePermission(req, 'catalog:manage');
    const img = await prisma.productImage.findFirst({ where: { id: req.params.imageId, productId: req.params.id } });
    if (!img) throw notFound('Imagen no encontrada');
    await prisma.productImage.delete({ where: { id: img.id } });
    await storage.removePublic(img.storageKey);
    await audit(req, 'product.image_remove', 'Product', req.params.id, { imageId: img.id });
    return { ok: true };
  });

  app.patch<{ Params: { id: string } }>('/api/admin/products/:id/images/order', async (req) => {
    requirePermission(req, 'catalog:manage');
    const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).max(12) }), req.body);
    await prisma.$transaction(
      ids.map((id, idx) => prisma.productImage.updateMany({ where: { id, productId: req.params.id }, data: { sortOrder: idx } })),
    );
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/api/admin/products/:id/movements', async (req) => {
    requirePermission(req, 'inventory:manage');
    return prisma.inventoryMovement.findMany({
      where: { productId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { email: true } }, order: { select: { code: true } } },
    });
  });

  app.post<{ Params: { id: string } }>('/api/admin/products/:id/movements', async (req, reply) => {
    const auth = requirePermission(req, 'inventory:manage');
    const input = parse(inventoryMovementInputSchema, req.body);
    const sign = input.type === 'RECEIPT' || input.type === 'ADJUSTMENT_IN' ? 1 : -1;
    const row = await prisma.$transaction((tx) =>
      adjustInventory(tx, {
        productId: req.params.id,
        type: input.type,
        deltaOnHand: sign * input.boxes,
        deltaReserved: 0,
        reason: input.reason,
        userId: auth.userId,
      }),
    );
    await audit(req, 'inventory.movement', 'Product', req.params.id, { type: input.type, boxes: input.boxes, reason: input.reason });
    return reply.status(201).send(row);
  });

  app.get<{ Params: { id: string } }>('/api/admin/products/:id/price-history', async (req) => {
    requirePermission(req, 'prices:manage');
    return prisma.priceHistory.findMany({
      where: { productId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: { changedBy: { select: { email: true } } },
    });
  });

  // ---------------- Categorías ----------------
  app.get('/api/admin/categories', async (req) => {
    requirePermission(req, 'catalog:manage');
    return prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { products: true } } } });
  });
  app.post('/api/admin/categories', async (req, reply) => {
    requirePermission(req, 'catalog:manage');
    const c = await prisma.category.create({ data: parse(categoryInputSchema, req.body) });
    await audit(req, 'category.create', 'Category', c.id);
    return reply.status(201).send(c);
  });
  app.put<{ Params: { id: string } }>('/api/admin/categories/:id', async (req) => {
    requirePermission(req, 'catalog:manage');
    const c = await prisma.category.update({ where: { id: req.params.id }, data: parse(categoryInputSchema, req.body) });
    await audit(req, 'category.update', 'Category', c.id);
    return c;
  });

  // ---------------- Vendedores ----------------
  app.get('/api/admin/sellers', async (req) => {
    requirePermission(req, 'sellers:manage');
    const sellers = await prisma.seller.findMany({
      orderBy: { displayName: 'asc' },
      include: { user: { select: { email: true, active: true, lastLoginAt: true } }, _count: { select: { orders: true } } },
    });
    return sellers;
  });

  app.post('/api/admin/sellers', async (req, reply) => {
    requirePermission(req, 'sellers:manage');
    const input = parse(sellerCreateSchema, req.body);
    if (await prisma.user.findUnique({ where: { email: input.email } })) throw conflict('EMAIL_TAKEN', 'Ya existe un usuario con ese correo');
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: 'SELLER',
        seller: {
          create: {
            fullName: input.fullName,
            displayName: input.displayName,
            phone: input.phone,
            canReviewPayments: input.canReviewPayments,
            canViewProofs: input.canViewProofs,
          },
        },
      },
      include: { seller: true },
    });
    await audit(req, 'seller.create', 'Seller', user.seller!.id, { email: input.email });
    return reply.status(201).send(user.seller);
  });

  app.put<{ Params: { id: string } }>('/api/admin/sellers/:id', async (req) => {
    requirePermission(req, 'sellers:manage');
    const input = parse(sellerUpdateSchema, req.body);
    const seller = await prisma.seller.update({ where: { id: req.params.id }, data: { ...input, bio: input.bio || null } });
    if (!input.active) await prisma.session.deleteMany({ where: { userId: seller.userId } });
    await audit(req, 'seller.update', 'Seller', seller.id, input);
    return seller;
  });

  // ---------------- Usuarios y roles ----------------
  app.get('/api/admin/users', async (req) => {
    requirePermission(req, 'users:manage');
    const q = parse(z.object({ q: z.string().trim().max(80).optional(), role: z.enum(['ADMIN', 'SELLER', 'CUSTOMER']).optional() }), req.query);
    const where: Prisma.UserWhereInput = {};
    if (q.role) where.role = q.role;
    if (q.q) where.OR = [{ email: { contains: q.q, mode: 'insensitive' } }, { customer: { fullName: { contains: q.q, mode: 'insensitive' } } }];
    return prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        lastLoginAt: true,
        customer: { select: { fullName: true, phone: true } },
        seller: { select: { id: true, displayName: true, active: true } },
      },
    });
  });

  app.patch<{ Params: { id: string } }>('/api/admin/users/:id', async (req) => {
    const auth = requirePermission(req, 'users:manage');
    const input = parse(userRoleUpdateSchema, req.body);
    if (req.params.id === auth.userId && (input.role !== 'ADMIN' || !input.active)) {
      throw badRequest('SELF_LOCKOUT', 'No puede quitarse a sí mismo el rol de administrador ni desactivar su cuenta');
    }
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { seller: true } });
    if (!user) throw notFound('Usuario no encontrado');
    if (input.role === 'SELLER' && !user.seller) {
      throw badRequest('SELLER_PROFILE_REQUIRED', 'Para asignar el rol de vendedor, cree el vendedor desde la sección Vendedores');
    }
    const updated = await prisma.user.update({ where: { id: user.id }, data: { role: input.role, active: input.active } });
    if (!input.active || input.role !== user.role) await prisma.session.deleteMany({ where: { userId: user.id } });
    await audit(req, 'user.role_update', 'User', user.id, { from: user.role, to: input.role, active: input.active });
    return { id: updated.id, role: updated.role, active: updated.active };
  });

  // ---------------- Tasa BCV ----------------
  app.get('/api/admin/rates', async (req) => {
    requirePermission(req, 'rates:manage');
    return { current: await getCurrentRate(), history: await listRates() };
  });

  app.post('/api/admin/rates', async (req, reply) => {
    const auth = requirePermission(req, 'rates:manage');
    const input = parse(manualRateSchema, req.body);
    const rate = await recordManualRate(input, auth.userId);
    await audit(req, 'rate.manual', 'ExchangeRate', rate.id, { rate: rate.rate.toFixed(8), effectiveDate: input.effectiveDate, note: input.sourceNote });
    return reply.status(201).send({ id: rate.id, rate: rate.rate.toFixed(8) });
  });

  app.post('/api/admin/rates/fetch', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => {
    requirePermission(req, 'rates:manage');
    const result = await fetchBcvRate();
    await audit(req, 'rate.fetch', 'ExchangeRate', null, result as unknown as Prisma.InputJsonValue);
    return result;
  });

  // ---------------- Métodos de pago ----------------
  app.get('/api/admin/payment-methods', async (req) => {
    requirePermission(req, 'settings:manage');
    return prisma.paymentMethod.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  });
  app.post('/api/admin/payment-methods', async (req, reply) => {
    requirePermission(req, 'settings:manage');
    const m = await prisma.paymentMethod.create({ data: parse(paymentMethodInputSchema, req.body) });
    await audit(req, 'payment_method.create', 'PaymentMethod', m.id);
    return reply.status(201).send(m);
  });
  app.put<{ Params: { id: string } }>('/api/admin/payment-methods/:id', async (req) => {
    requirePermission(req, 'settings:manage');
    const m = await prisma.paymentMethod.update({ where: { id: req.params.id }, data: parse(paymentMethodInputSchema, req.body) });
    await audit(req, 'payment_method.update', 'PaymentMethod', m.id);
    return m;
  });

  // ---------------- Configuración comercial ----------------
  app.get('/api/admin/settings', async (req) => {
    requirePermission(req, 'settings:manage');
    return getSettings();
  });

  app.put<{ Params: { key: string } }>('/api/admin/settings/:key', async (req) => {
    const auth = requirePermission(req, 'settings:manage');
    const key = req.params.key as SettingsKey;
    if (!SETTINGS_KEYS.includes(key)) throw notFound('Sección de configuración desconocida');
    if (key === 'pickup') requirePermission(req, 'pickup:manage');
    if (key === 'rate') requirePermission(req, 'rates:manage');
    const value = await updateSetting(key, req.body, auth.userId);
    await audit(req, 'settings.update', 'BusinessSetting', key, value as unknown as Prisma.InputJsonValue);
    return value;
  });

  app.post('/api/admin/settings/hero-image', async (req) => {
    const auth = requirePermission(req, 'settings:manage');
    const { files } = await readMultipart(req, MAX_PRODUCT_IMAGE, 1);
    if (!files[0]) throw badRequest('NO_FILES', 'Adjunte una imagen');
    const key = await storage.savePublic('site', files[0]);
    const s = await getSettings();
    const value = await updateSetting('store', { ...s.store, heroImageUrl: storage.publicUrl(key) }, auth.userId);
    await audit(req, 'settings.hero_image', 'BusinessSetting', 'store');
    return value;
  });

  // ---------------- Calendario de retiro ----------------
  app.get('/api/admin/pickup/blocked-dates', async (req) => {
    requirePermission(req, 'pickup:manage');
    const rows = await prisma.blockedPickupDate.findMany({ orderBy: { date: 'asc' } });
    return rows.map((r) => ({ ...r, date: fromDbDate(r.date) }));
  });
  app.post('/api/admin/pickup/blocked-dates', async (req, reply) => {
    const auth = requirePermission(req, 'pickup:manage');
    const input = parse(blockedDateSchema, req.body);
    const r = await prisma.blockedPickupDate.upsert({
      where: { date: toDbDate(input.date) },
      create: { date: toDbDate(input.date), reason: input.reason, createdById: auth.userId },
      update: { reason: input.reason },
    });
    const affected = await prisma.order.count({
      where: { pickupDate: toDbDate(input.date), status: { in: ['PENDING_PAYMENT', 'CONFIRMED', 'READY_FOR_PICKUP'] } },
    });
    await audit(req, 'pickup.block', 'BlockedPickupDate', input.date, { reason: input.reason, affectedOrders: affected });
    return reply.status(201).send({ ...r, date: fromDbDate(r.date), affectedOrders: affected });
  });
  app.delete<{ Params: { date: string } }>('/api/admin/pickup/blocked-dates/:date', async (req) => {
    requirePermission(req, 'pickup:manage');
    const date = parse(dateSchema, req.params.date);
    await prisma.blockedPickupDate.deleteMany({ where: { date: toDbDate(date) } });
    await audit(req, 'pickup.unblock', 'BlockedPickupDate', date);
    return { ok: true };
  });

  // ---------------- Indicadores y auditoría ----------------
  app.get('/api/admin/reports/dashboard', async (req) => {
    requirePermission(req, 'reports:view');
    const q = parse(z.object({ from: dateSchema.optional(), to: dateSchema.optional() }), req.query);
    return dashboard(q);
  });

  app.get('/api/admin/audit', async (req) => {
    requirePermission(req, 'audit:view');
    const q = parse(
      z.object({
        entityType: z.string().max(60).optional(),
        action: z.string().max(60).optional(),
        page: z.coerce.number().int().min(1).default(1),
      }),
      req.query,
    );
    const where: Prisma.AuditLogWhereInput = {};
    if (q.entityType) where.entityType = q.entityType;
    if (q.action) where.action = { startsWith: q.action };
    const [total, items] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * 50,
        take: 50,
        include: { actor: { select: { email: true, role: true } } },
      }),
    ]);
    return { total, page: q.page, pageSize: 50, items };
  });
}
