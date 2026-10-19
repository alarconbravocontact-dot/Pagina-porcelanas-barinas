/**
 * Datos reales del negocio (sede Barinas). Todas las funciones son idempotentes:
 * pueden ejecutarse varias veces sin duplicar registros ni pisar cambios del administrador.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Prisma, PrismaClient, Finish, AntiSlip, SlipRating } from '@prisma/client';
import { m2ToUnits, priceBoxFromM2, parseMoneyToCents, toWhatsappNumber, SETTINGS_DEFAULTS, STORE_HOURS_TEXT } from '@porcelanas/shared';

type Db = PrismaClient;

export const CATEGORIES = [
  { name: 'Baño', slug: 'bano' },
  { name: 'Cocina', slug: 'cocina' },
  { name: 'Sala', slug: 'sala' },
  { name: 'Habitación', slug: 'habitacion' },
  { name: 'Exteriores', slug: 'exteriores' },
  { name: 'Paredes', slug: 'paredes' },
  { name: 'Otras', slug: 'otras' },
];

export async function ensureCategories(db: Db) {
  for (const [i, c] of CATEGORIES.entries()) {
    await db.category.upsert({ where: { slug: c.slug }, create: { ...c, sortOrder: i }, update: {} });
  }
}

/** Instrucciones genéricas de procedimiento: no contienen cuentas, teléfonos ni direcciones. */
const METHODS = [
  { kind: 'PAGO_MOVIL', name: 'Pago Móvil', currency: 'VES', requiresProof: true, active: true,
    instructions: 'Realice el Pago Móvil por el monto en bolívares indicado en su operación, usando los datos de recepción de abajo. Conserve el número de referencia.',
    proofInstructions: 'Adjunte la captura de la confirmación donde se vea la referencia, el monto y la fecha.' },
  { kind: 'ZELLE', name: 'Zelle', currency: 'USD', requiresProof: true, active: true,
    instructions: 'Envíe el monto en dólares indicado en su operación al destinatario Zelle de los datos de recepción. Coloque el número de operación en el concepto si es posible.',
    proofInstructions: 'Adjunte la captura de la transacción completada (nombre del destinatario, monto y fecha).' },
  { kind: 'BINANCE', name: 'Binance Pay', currency: 'USD', requiresProof: true, active: true,
    instructions: 'Pague el monto en dólares (USDT) indicado en su operación al ID de Binance Pay de los datos de recepción.',
    proofInstructions: 'Adjunte la captura de la orden completada con el ID de la transacción.' },
  { kind: 'BANK_TRANSFER', name: 'Transferencia bancaria', currency: 'VES', requiresProof: true, active: true,
    instructions: 'Transfiera el monto en bolívares indicado en su operación a la cuenta de los datos de recepción. Conserve el número de referencia.',
    proofInstructions: 'Adjunte el comprobante emitido por su banco con referencia, monto y fecha.' },
  { kind: 'CASH', name: 'Efectivo en sede', currency: 'USD', requiresProof: false, active: false,
    instructions: 'Pague en efectivo (USD) en la sede al momento del retiro. El vendedor registrará el pago y le entregará su recibo.',
    proofInstructions: '' },
] as const;

const PLACEHOLDER = /^(PENDIENTE DE CONFIGURAR|DEMOSTRACIÓN)/;

/**
 * Crea los métodos que falten. Los métodos que aún tienen textos provisionales de semillas
 * anteriores se normalizan; nunca se tocan métodos ya configurados por el administrador.
 */
export async function ensurePaymentMethods(db: Db) {
  for (const [i, m] of METHODS.entries()) {
    const existing = await db.paymentMethod.findFirst({ where: { kind: m.kind } });
    if (!existing) {
      await db.paymentMethod.create({ data: { ...m, receivingDetails: '', buyerNote: '', sortOrder: i } });
    } else if (PLACEHOLDER.test(existing.instructions) || PLACEHOLDER.test(existing.receivingDetails)) {
      await db.paymentMethod.update({
        where: { id: existing.id },
        data: { instructions: m.instructions, proofInstructions: m.proofInstructions, receivingDetails: '', currency: m.currency, active: m.active, sortOrder: i },
      });
    }
  }
}

export const JUAN = {
  email: 'alarconbravocontact@gmail.com',
  fullName: 'Juan Alarcon',
  displayName: 'Juan Alarcon',
  phone: '04125552594',
  city: 'Barinas',
  branch: 'Sede Barinas, Venezuela',
};

/**
 * Registra (o actualiza) el perfil comercial de Juan Alarcon vinculado a su usuario.
 * Si el usuario no existe se crea SIN contraseña: debe activarse con un enlace de un solo uso.
 */
export async function ensureSeller(db: Db, data = JUAN) {
  const whatsapp = toWhatsappNumber(data.phone) ?? '';
  const profile = {
    fullName: data.fullName,
    displayName: data.displayName,
    phone: data.phone,
    city: data.city,
    branch: data.branch,
    publicPhone: data.phone,
    whatsapp,
    publicEmail: data.email,
    active: true,
    canReviewPayments: true,
    canViewProofs: true,
  };
  return db.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: data.email }, include: { seller: true } });
    if (!user) {
      user = await tx.user.create({ data: { email: data.email, passwordHash: '', role: 'SELLER' }, include: { seller: true } });
    } else if (user.role === 'CUSTOMER') {
      user = await tx.user.update({ where: { id: user.id }, data: { role: 'SELLER', active: true }, include: { seller: true } });
    }
    const seller = await tx.seller.upsert({ where: { userId: user.id }, create: { userId: user.id, ...profile }, update: profile });
    return { user, seller, pendingActivation: user.passwordHash === '' };
  });
}

/** Completa datos de la sede y WhatsApp solo si siguen vacíos (no pisa la configuración del panel). */
export async function ensureStoreDefaults(db: Db, whatsapp: string) {
  for (const [key, patch] of [
    ['store', { city: 'Barinas', hoursText: STORE_HOURS_TEXT }],
    ['whatsapp', { number: whatsapp }],
  ] as const) {
    const row = await db.businessSetting.findUnique({ where: { key } });
    const current = { ...(SETTINGS_DEFAULTS as Record<string, object>)[key], ...((row?.value as object) ?? {}) } as Record<string, unknown>;
    const next = { ...current };
    for (const [k, v] of Object.entries(patch)) if (!current[k]) next[k] = v;
    if (JSON.stringify(next) !== JSON.stringify(current) || !row) {
      await db.businessSetting.upsert({ where: { key }, create: { key, value: next as Prisma.InputJsonValue }, update: { value: next as Prisma.InputJsonValue } });
    }
  }
}

// ------------------------------------------------------------------ Catálogo
interface CatalogItem {
  index: number;
  name: string;
  widthCm: number;
  lengthCm: number;
  priceDivisaM2: string;
  priceBcvM2: string;
  boxText: string;
  piecesPerBox: number;
  boxAreaM2: string;
  boxVerified: boolean;
  slipRating: SlipRating | null;
  finishNote: string;
  finish: Finish;
  usage: Record<'salas' | 'cocina' | 'pisoBano' | 'ducha' | 'exterior' | 'paredes', 'YES' | 'CAUTION' | 'NO'>;
  color: string;
  image: string | null;
  sourcePage: number;
}

const ANTISLIP: Record<string, AntiSlip> = { R11: 'YES', R10: 'YES', MODERATE: 'YES', SLIPPERY: 'NO' };
const SLIP_TEXT: Record<string, string> = {
  R11: 'antideslizante alto R11',
  R10: 'antideslizante R10',
  MODERATE: 'antideslizante moderado (aprox. R9–R10)',
  MEDIUM_LOW: 'agarre medio-bajo',
  SLIPPERY: 'resbaladizo (pulido)',
};
const AREA: Record<string, string> = { salas: 'salas', cocina: 'cocina', pisoBano: 'piso de baño', ducha: 'ducha', exterior: 'exterior', paredes: 'paredes' };

export const catalogSku = (it: Pick<CatalogItem, 'index' | 'widthCm' | 'lengthCm'>) => `BRN-${String(it.index).padStart(2, '0')}-${it.widthCm}X${it.lengthCm}`;

function titleCase(name: string) {
  return name
    .toLowerCase()
    .replace(/(^|[\s.(-])([a-záéíóúñ])/g, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/\bP\.e\./, 'P.E.')
    .replace(/\bTm\b/, 'TM')
    .replace(/\bMc\b/, 'MC');
}

function categorySlugs(u: CatalogItem['usage']) {
  const s = new Set<string>();
  if (u.salas === 'YES') {
    s.add('sala');
    s.add('habitacion');
  }
  if (u.cocina === 'YES') s.add('cocina');
  if (u.pisoBano === 'YES' || u.ducha === 'YES') s.add('bano');
  if (u.exterior === 'YES') s.add('exteriores');
  if (u.paredes === 'YES') s.add('paredes');
  if (s.size === 0) s.add('otras');
  return [...s];
}

function describe(it: CatalogItem) {
  const by = (lvl: string) => Object.entries(it.usage).filter(([, v]) => v === lvl).map(([k]) => AREA[k]).join(', ');
  const parts = [`Porcelanato de ${it.widthCm} x ${it.lengthCm} cm.`];
  parts.push(it.slipRating ? `Clasificación de agarre: ${SLIP_TEXT[it.slipRating]}.` : 'Sin etiqueta de agarre en el catálogo: verificar ficha técnica antes de usar en baño o cocina.');
  if (by('YES')) parts.push(`Recomendado para: ${by('YES')}.`);
  if (by('CAUTION')) parts.push(`Con precaución o confirmar ficha técnica: ${by('CAUTION')}.`);
  if (by('NO')) parts.push(`No recomendado: ${by('NO')}.`);
  return parts.join(' ');
}

export interface ImportResult {
  created: number;
  skipped: number;
  drafts: string[];
  images: number;
}

/**
 * Importa el catálogo de Barinas. Crea solo los productos que no existen (por SKU);
 * no modifica existencias ni productos editados después en el panel.
 * Existencias: el catálogo no las incluye, se crean en 0.
 */
export async function importCatalog(db: Db, dataDir: string, publicDir: string): Promise<ImportResult> {
  const raw = JSON.parse(await fs.readFile(path.join(dataDir, 'catalogo-barinas.json'), 'utf8')) as { items: CatalogItem[] };
  await ensureCategories(db);
  const cats = new Map((await db.category.findMany()).map((c) => [c.slug, c.id]));
  const result: ImportResult = { created: 0, skipped: 0, drafts: [], images: 0 };
  for (const it of raw.items) {
    const sku = catalogSku(it);
    if (await db.product.findUnique({ where: { sku } })) {
      result.skipped++;
      continue;
    }
    const area = m2ToUnits(it.boxAreaM2);
    const m2 = parseMoneyToCents(it.priceDivisaM2);
    const bcvM2 = parseMoneyToCents(it.priceBcvM2);
    // Si los m² por caja no son coherentes con el formato de la pieza, no se publica hasta verificarlo.
    const status = it.boxVerified ? 'ACTIVE' : 'DRAFT';
    if (!it.boxVerified) result.drafts.push(sku);
    const product = await db.product.create({
      data: {
        sku,
        name: titleCase(it.name),
        description: describe(it),
        color: it.color,
        widthCm: it.widthCm,
        lengthCm: it.lengthCm,
        sizeLabel: `${it.widthCm}x${it.lengthCm}`,
        piecesPerBox: it.piecesPerBox,
        boxAreaUnits: area,
        pricingBasis: 'M2',
        priceM2Cents: m2,
        priceBoxCents: priceBoxFromM2(m2, area),
        priceBcvM2Cents: bcvM2,
        priceBcvBoxCents: priceBoxFromM2(bcvM2, area),
        finish: it.finish,
        finishNote: it.finishNote,
        slipRating: it.slipRating,
        usageGuide: it.usage,
        antiSlip: it.slipRating ? (ANTISLIP[it.slipRating] ?? 'UNVERIFIED') : 'UNVERIFIED',
        status,
        featured: false,
        sourceNote: `Catálogo Barinas, pág. ${it.sourcePage}. Caja según catálogo: ${it.boxText}${it.boxVerified ? '' : ' — NO coincide con el formato; verificar m² por caja y piezas antes de publicar'}. Color: ${it.color}.`,
        categories: { create: categorySlugs(it.usage).map((slug) => ({ categoryId: cats.get(slug)! })) },
        inventory: { create: { onHandBoxes: 0, reservedBoxes: 0, lowStockThreshold: 10 } },
        priceHistory: { create: { pricingBasis: 'M2', priceM2Cents: m2, priceBoxCents: priceBoxFromM2(m2, area), priceBcvM2Cents: bcvM2, priceBcvBoxCents: priceBoxFromM2(bcvM2, area) } },
      },
    });
    if (it.image) {
      const key = `products/${product.id}/catalogo-${String(it.index).padStart(2, '0')}.jpg`;
      const data = await fs.readFile(path.join(dataDir, 'catalogo-barinas', it.image));
      await fs.mkdir(path.dirname(path.join(publicDir, key)), { recursive: true });
      await fs.writeFile(path.join(publicDir, key), data);
      await db.productImage.create({ data: { productId: product.id, storageKey: key, mimeType: 'image/jpeg', sizeBytes: data.length, alt: titleCase(it.name), sortOrder: 0 } });
      result.images++;
    }
    result.created++;
  }
  return result;
}

/** En modo negocio, los datos de demostración no deben poder venderse. */
export async function disableDemoData(db: Db) {
  const products = await db.product.updateMany({ where: { isDemo: true, status: 'ACTIVE' }, data: { status: 'INACTIVE' } });
  const sellers = await db.seller.updateMany({ where: { user: { email: { endsWith: '.demo@porcelanas.local' } }, active: true }, data: { active: false } });
  return { products: products.count, sellers: sellers.count };
}
