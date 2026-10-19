import { Prisma, type Product } from '@prisma/client';
import {
  m2ToUnits,
  parseMoneyToCents,
  priceBoxFromM2,
  priceM2FromBox,
  unitsToM2String,
  type CatalogQuery,
  type ProductInput,
} from '@porcelanas/shared';
import { prisma, type Tx } from '../db';
import { badRequest, notFound } from '../lib/errors';
import { storage } from '../lib/storage';
import { adjustInventory, stockStatus } from './inventory';

export const productInclude = {
  images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  categories: { include: { category: true } },
  inventory: true,
} satisfies Prisma.ProductInclude;

type ProductFull = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

const fmtDim = (d: Prisma.Decimal) => {
  const n = Number(d);
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
};

export function sizeLabelFor(widthCm: number, lengthCm: number) {
  return `${fmtDim(new Prisma.Decimal(widthCm))}x${fmtDim(new Prisma.Decimal(lengthCm))}`;
}

export function toPublicProduct(p: ProductFull) {
  const onHand = p.inventory?.onHandBoxes ?? 0;
  const reserved = p.inventory?.reservedBoxes ?? 0;
  const available = Math.max(0, onHand - reserved);
  const threshold = p.inventory?.lowStockThreshold ?? 0;
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    color: p.color,
    widthCm: Number(p.widthCm),
    lengthCm: Number(p.lengthCm),
    sizeLabel: p.sizeLabel,
    thicknessMm: p.thicknessMm == null ? null : Number(p.thicknessMm),
    piecesPerBox: p.piecesPerBox,
    boxAreaUnits: p.boxAreaUnits,
    boxAreaM2: unitsToM2String(p.boxAreaUnits, 4).replace(/0{1,2}$/, ''),
    pricingBasis: p.pricingBasis,
    priceBoxCents: p.priceBoxCents,
    priceM2Cents: p.priceM2Cents,
    /** Precio de referencia BCV (pagos en Bs). Si no se definió, coincide con el de divisas. */
    priceBcvBoxCents: p.priceBcvBoxCents ?? p.priceBoxCents,
    priceBcvM2Cents: p.priceBcvM2Cents ?? p.priceM2Cents,
    hasBcvPrice: p.priceBcvBoxCents != null,
    finish: p.finish,
    finishNote: p.finishNote,
    slipRating: p.slipRating,
    usageGuide: p.usageGuide as Record<string, 'YES' | 'CAUTION' | 'NO'> | null,
    antiSlip: p.antiSlip,
    status: p.status,
    featured: p.featured,
    isDemo: p.isDemo,
    categories: p.categories.map((c) => ({ id: c.category.id, name: c.category.name, slug: c.category.slug })),
    images: p.images.map((i) => ({ id: i.id, url: storage.publicUrl(i.storageKey), alt: i.alt || p.name })),
    availableBoxes: available,
    stockStatus: stockStatus(available, threshold),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function toAdminProduct(p: ProductFull) {
  return {
    ...toPublicProduct(p),
    onHandBoxes: p.inventory?.onHandBoxes ?? 0,
    reservedBoxes: p.inventory?.reservedBoxes ?? 0,
    lowStockThreshold: p.inventory?.lowStockThreshold ?? 0,
    sourceNote: p.sourceNote,
  };
}

export async function listCatalog(query: CatalogQuery, opts: { admin?: boolean; status?: string } = {}) {
  const where: Prisma.ProductWhereInput = {};
  if (!opts.admin) where.status = 'ACTIVE';
  else if (opts.status) where.status = opts.status as Product['status'];
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { sku: { contains: query.q, mode: 'insensitive' } },
      { color: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  if (query.color) where.color = { equals: query.color, mode: 'insensitive' };
  if (query.size) where.sizeLabel = query.size;
  if (query.finish) where.finish = query.finish;
  if (query.antiSlip) where.antiSlip = query.antiSlip;
  if (query.slip) where.slipRating = query.slip;
  if (query.use) where.usageGuide = { path: [query.use], equals: 'YES' };
  if (query.featured === 'true') where.featured = true;
  if (query.category) where.categories = { some: { category: { slug: query.category } } };
  const price: Prisma.IntFilter = {};
  if (query.minPrice) price.gte = parseMoneyToCents(query.minPrice);
  if (query.maxPrice) price.lte = parseMoneyToCents(query.maxPrice);
  if (price.gte !== undefined || price.lte !== undefined) where.priceM2Cents = price;
  if (query.available) {
    const rows = await prisma.$queryRaw<{ productId: string }[]>`
      SELECT "productId" FROM "Inventory" WHERE "onHandBoxes" - "reservedBoxes" > 0`;
    const ids = rows.map((r) => r.productId);
    where.id = query.available === 'true' ? { in: ids } : { notIn: ids };
  }
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    query.sort === 'price_asc'
      ? [{ priceM2Cents: 'asc' }, { id: 'asc' }]
      : query.sort === 'price_desc'
        ? [{ priceM2Cents: 'desc' }, { id: 'asc' }]
        : query.sort === 'name'
          ? [{ name: 'asc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'asc' }];
  const [total, items] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      include: productInclude,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    items: items.map(opts.admin ? toAdminProduct : toPublicProduct),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function catalogFacets() {
  const active = { status: 'ACTIVE' as const };
  const [colors, sizes, finishes, categories, priceRange] = await Promise.all([
    prisma.product.groupBy({ by: ['color'], where: active, _count: true, orderBy: { color: 'asc' } }),
    prisma.product.groupBy({ by: ['sizeLabel'], where: active, _count: true, orderBy: { sizeLabel: 'asc' } }),
    prisma.product.groupBy({ by: ['finish'], where: active, _count: true }),
    prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: { product: active } } } } },
    }),
    prisma.product.aggregate({ where: active, _min: { priceM2Cents: true }, _max: { priceM2Cents: true } }),
  ]);
  return {
    colors: colors.map((c) => ({ value: c.color, count: c._count })),
    sizes: sizes.map((s) => ({ value: s.sizeLabel, count: s._count })),
    finishes: finishes.map((f) => ({ value: f.finish, count: f._count })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c._count.products })),
    priceM2: { min: priceRange._min.priceM2Cents, max: priceRange._max.priceM2Cents },
  };
}

export async function getProduct(idOrSku: string, opts: { admin?: boolean } = {}) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSku);
  const product = await prisma.product.findFirst({
    where: isUuid ? { id: idOrSku } : { sku: idOrSku.toUpperCase() },
    include: productInclude,
  });
  if (!product || (!opts.admin && product.status !== 'ACTIVE')) throw notFound('Producto no encontrado');
  return opts.admin ? toAdminProduct(product) : toPublicProduct(product);
}

export function computePrices(input: Pick<ProductInput, 'pricingBasis' | 'price' | 'boxAreaM2' | 'priceBcv'>) {
  const boxAreaUnits = m2ToUnits(input.boxAreaM2);
  if (boxAreaUnits <= 0) throw badRequest('INVALID_AREA', 'Los m² por caja deben ser mayores que cero');
  const pair = (cents: number) =>
    input.pricingBasis === 'M2'
      ? { m2: cents, box: priceBoxFromM2(cents, boxAreaUnits) }
      : { box: cents, m2: priceM2FromBox(cents, boxAreaUnits) };
  const divisa = pair(parseMoneyToCents(input.price));
  const bcv = input.priceBcv ? pair(parseMoneyToCents(input.priceBcv)) : null;
  return {
    boxAreaUnits,
    priceBoxCents: divisa.box,
    priceM2Cents: divisa.m2,
    priceBcvBoxCents: bcv?.box ?? null,
    priceBcvM2Cents: bcv?.m2 ?? null,
  };
}

const extraFields = (input: ProductInput) => ({
  finishNote: input.finishNote ?? '',
  slipRating: input.slipRating ?? null,
  usageGuide: input.usageGuide ?? Prisma.DbNull,
});

async function assertCategories(tx: Tx, ids: string[]) {
  const count = await tx.category.count({ where: { id: { in: ids } } });
  if (count !== new Set(ids).size) throw badRequest('INVALID_CATEGORY', 'Alguna categoría no existe');
}

export async function createProduct(input: ProductInput, userId: string, initialStockBoxes = 0) {
  const prices = computePrices(input);
  return prisma.$transaction(async (tx) => {
    await assertCategories(tx, input.categoryIds);
    const product = await tx.product.create({
      data: {
        sku: input.sku,
        name: input.name,
        description: input.description,
        color: input.color,
        widthCm: input.widthCm,
        lengthCm: input.lengthCm,
        sizeLabel: sizeLabelFor(input.widthCm, input.lengthCm),
        thicknessMm: input.thicknessMm ?? null,
        piecesPerBox: input.piecesPerBox,
        boxAreaUnits: prices.boxAreaUnits,
        pricingBasis: input.pricingBasis,
        priceBoxCents: prices.priceBoxCents,
        priceM2Cents: prices.priceM2Cents,
        priceBcvBoxCents: prices.priceBcvBoxCents,
        priceBcvM2Cents: prices.priceBcvM2Cents,
        ...extraFields(input),
        finish: input.finish,
        antiSlip: input.antiSlip,
        status: input.status,
        featured: input.featured,
        categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
        inventory: { create: { onHandBoxes: 0, reservedBoxes: 0, lowStockThreshold: input.lowStockThreshold } },
        priceHistory: {
          create: {
            pricingBasis: input.pricingBasis,
            priceBoxCents: prices.priceBoxCents,
            priceM2Cents: prices.priceM2Cents,
            priceBcvBoxCents: prices.priceBcvBoxCents,
            priceBcvM2Cents: prices.priceBcvM2Cents,
            changedById: userId,
          },
        },
      },
    });
    if (initialStockBoxes > 0) {
      await adjustInventory(tx, {
        productId: product.id,
        type: 'INITIAL',
        deltaOnHand: initialStockBoxes,
        deltaReserved: 0,
        reason: 'Existencia inicial al crear el producto',
        userId,
      });
    }
    return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: productInclude });
  });
}

export async function updateProduct(id: string, input: ProductInput, userId: string) {
  const prices = computePrices(input);
  return prisma.$transaction(async (tx) => {
    const current = await tx.product.findUnique({ where: { id } });
    if (!current) throw notFound('Producto no encontrado');
    await assertCategories(tx, input.categoryIds);
    await tx.productCategory.deleteMany({ where: { productId: id } });
    const priceChanged =
      current.priceBoxCents !== prices.priceBoxCents ||
      current.priceM2Cents !== prices.priceM2Cents ||
      current.priceBcvBoxCents !== prices.priceBcvBoxCents ||
      current.pricingBasis !== input.pricingBasis;
    await tx.product.update({
      where: { id },
      data: {
        sku: input.sku,
        name: input.name,
        description: input.description,
        color: input.color,
        widthCm: input.widthCm,
        lengthCm: input.lengthCm,
        sizeLabel: sizeLabelFor(input.widthCm, input.lengthCm),
        thicknessMm: input.thicknessMm ?? null,
        piecesPerBox: input.piecesPerBox,
        boxAreaUnits: prices.boxAreaUnits,
        pricingBasis: input.pricingBasis,
        priceBoxCents: prices.priceBoxCents,
        priceM2Cents: prices.priceM2Cents,
        priceBcvBoxCents: prices.priceBcvBoxCents,
        priceBcvM2Cents: prices.priceBcvM2Cents,
        ...extraFields(input),
        finish: input.finish,
        antiSlip: input.antiSlip,
        status: input.status,
        featured: input.featured,
        categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
        inventory: { update: { lowStockThreshold: input.lowStockThreshold } },
        ...(priceChanged
          ? {
              priceHistory: {
                create: {
                  pricingBasis: input.pricingBasis,
                  priceBoxCents: prices.priceBoxCents,
                  priceM2Cents: prices.priceM2Cents,
                  priceBcvBoxCents: prices.priceBcvBoxCents,
                  priceBcvM2Cents: prices.priceBcvM2Cents,
                  changedById: userId,
                },
              },
            }
          : {}),
      },
    });
    return {
      product: await tx.product.findUniqueOrThrow({ where: { id }, include: productInclude }),
      priceChanged,
      previous: { priceBoxCents: current.priceBoxCents, priceM2Cents: current.priceM2Cents },
    };
  });
}
