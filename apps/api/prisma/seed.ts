/**
 * Semilla controlada.
 *  - Base (siempre): categorías de ambientes, usuario administrador (desde variables de entorno)
 *    y métodos de pago INACTIVOS sin datos bancarios (deben configurarse en el panel).
 *  - --demo: vendedores y productos de demostración identificados (SKU "DEMO-", isDemo=true).
 *    No crea tasas BCV, números de WhatsApp ni datos comerciales reales.
 */
import { PrismaClient, type Finish, type AntiSlip } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { m2ToUnits, priceBoxFromM2 } from '@porcelanas/shared';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { marblePng } from './texture';

const prisma = new PrismaClient();
const demo = process.argv.includes('--demo');
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const CATEGORIES = [
  { name: 'Baño', slug: 'bano' },
  { name: 'Cocina', slug: 'cocina' },
  { name: 'Sala', slug: 'sala' },
  { name: 'Habitación', slug: 'habitacion' },
  { name: 'Exteriores', slug: 'exteriores' },
  { name: 'Otras', slug: 'otras' },
];

const METHODS = [
  { kind: 'PAGO_MOVIL', name: 'Pago Móvil', currency: 'VES' },
  { kind: 'ZELLE', name: 'Zelle', currency: 'USD' },
  { kind: 'BINANCE', name: 'Binance Pay', currency: 'USD' },
  { kind: 'BANK_TRANSFER', name: 'Transferencia bancaria', currency: 'VES' },
  { kind: 'CASH', name: 'Efectivo en sede', currency: 'USD' },
] as const;

async function seedBase() {
  for (const [i, c] of CATEGORIES.entries()) {
    await prisma.category.upsert({ where: { slug: c.slug }, create: { ...c, sortOrder: i }, update: {} });
  }
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (email) {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (!exists) {
      if (password.length < 10) throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 10 caracteres');
      await prisma.user.create({ data: { email, passwordHash: await hash(password, ARGON), role: 'ADMIN' } });
      console.log(`Administrador creado: ${email}`);
    } else {
      console.log(`Administrador existente: ${email} (sin cambios)`);
    }
  } else {
    console.warn('SEED_ADMIN_EMAIL no definido: no se creó administrador');
  }
  if ((await prisma.paymentMethod.count()) === 0) {
    for (const [i, m] of METHODS.entries()) {
      await prisma.paymentMethod.create({
        data: {
          ...m,
          instructions: 'PENDIENTE DE CONFIGURAR: el administrador debe escribir los datos de pago antes de activar este método.',
          requiresProof: m.kind !== 'CASH',
          active: false,
          sortOrder: i,
        },
      });
    }
    console.log('Métodos de pago creados (inactivos, pendientes de configuración)');
  }
}

interface DemoProduct {
  sku: string;
  name: string;
  color: string;
  w: number;
  l: number;
  pieces: number;
  area: string;
  priceM2: number;
  finish: Finish;
  antiSlip: AntiSlip;
  cats: string[];
  stock: number;
  featured?: boolean;
  tex: { base: [number, number, number]; vein: [number, number, number]; style: 'marble' | 'stone' | 'wood' };
  description: string;
}

const DEMO_PRODUCTS: DemoProduct[] = [
  { sku: 'DEMO-CAL-6060', name: 'Calacatta Blanco (demo)', color: 'Blanco', w: 60, l: 60, pieces: 4, area: '1.44', priceM2: 1850, finish: 'PULIDO', antiSlip: 'NO', cats: ['sala', 'habitacion'], stock: 120, featured: true, tex: { base: [242, 240, 236], vein: [150, 140, 128], style: 'marble' }, description: 'Producto de demostración. Porcelanato pulido con vetas suaves.' },
  { sku: 'DEMO-NEG-6012', name: 'Marquina Negro (demo)', color: 'Negro', w: 60, l: 120, pieces: 2, area: '1.44', priceM2: 2490, finish: 'BRILLANTE', antiSlip: 'NO', cats: ['sala', 'bano'], stock: 40, featured: true, tex: { base: [30, 30, 34], vein: [210, 210, 214], style: 'marble' }, description: 'Producto de demostración. Gran formato brillante.' },
  { sku: 'DEMO-GRI-6060', name: 'Cemento Gris (demo)', color: 'Gris', w: 60, l: 60, pieces: 4, area: '1.44', priceM2: 1390, finish: 'MATE', antiSlip: 'YES', cats: ['cocina', 'exteriores', 'bano'], stock: 200, featured: true, tex: { base: [150, 150, 148], vein: [110, 110, 108], style: 'stone' }, description: 'Producto de demostración. Acabado mate con apariencia de cemento.' },
  { sku: 'DEMO-MAD-2012', name: 'Roble Natural (demo)', color: 'Madera', w: 20, l: 120, pieces: 9, area: '2.16', priceM2: 1250, finish: 'TEXTURIZADO', antiSlip: 'UNVERIFIED', cats: ['habitacion', 'sala'], stock: 80, featured: true, tex: { base: [176, 132, 92], vein: [120, 80, 50], style: 'wood' }, description: 'Producto de demostración. Listón tipo madera.' },
  { sku: 'DEMO-BEI-4545', name: 'Travertino Beige (demo)', color: 'Beige', w: 45, l: 45, pieces: 8, area: '1.62', priceM2: 990, finish: 'SATINADO', antiSlip: 'YES', cats: ['exteriores', 'cocina'], stock: 6, tex: { base: [222, 205, 176], vein: [190, 165, 130], style: 'stone' }, description: 'Producto de demostración. Inventario bajo para probar alertas.' },
  { sku: 'DEMO-BLA-3060', name: 'Blanco Satinado Pared (demo)', color: 'Blanco', w: 30, l: 60, pieces: 8, area: '1.44', priceM2: 890, finish: 'SATINADO', antiSlip: 'NO', cats: ['bano', 'cocina'], stock: 0, tex: { base: [236, 236, 232], vein: [214, 214, 210], style: 'stone' }, description: 'Producto de demostración. Sin existencias para probar el estado agotado.' },
];

async function seedDemo() {
  const demoPassword = process.env.SEED_DEMO_PASSWORD || crypto.randomBytes(9).toString('base64url') + '1a';
  const sellers = [
    { email: 'vendedora.demo@porcelanas.local', fullName: 'Vendedora Demo Uno', displayName: 'Ana (demo)', canReviewPayments: true },
    { email: 'vendedor.demo@porcelanas.local', fullName: 'Vendedor Demo Dos', displayName: 'Luis (demo)', canReviewPayments: false },
  ];
  for (const s of sellers) {
    if (await prisma.user.findUnique({ where: { email: s.email } })) continue;
    await prisma.user.create({
      data: {
        email: s.email,
        passwordHash: await hash(demoPassword, ARGON),
        role: 'SELLER',
        seller: { create: { fullName: s.fullName, displayName: s.displayName, phone: '+58 000 0000000', canReviewPayments: s.canReviewPayments, canViewProofs: true, bio: 'Cuenta de demostración' } },
      },
    });
    console.log(`Vendedor demo: ${s.email} / ${demoPassword}`);
  }
  const cats = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));
  const publicDir = path.resolve(process.cwd(), process.env.STORAGE_DIR ?? './storage', 'public');
  for (const [i, p] of DEMO_PRODUCTS.entries()) {
    if (await prisma.product.findUnique({ where: { sku: p.sku } })) continue;
    const area = m2ToUnits(p.area);
    const product = await prisma.product.create({
      data: {
        sku: p.sku,
        name: p.name,
        description: p.description,
        color: p.color,
        widthCm: p.w,
        lengthCm: p.l,
        sizeLabel: `${p.w}x${p.l}`,
        piecesPerBox: p.pieces,
        boxAreaUnits: area,
        pricingBasis: 'M2',
        priceM2Cents: p.priceM2,
        priceBoxCents: priceBoxFromM2(p.priceM2, area),
        finish: p.finish,
        antiSlip: p.antiSlip,
        status: 'ACTIVE',
        featured: !!p.featured,
        isDemo: true,
        categories: { create: p.cats.map((slug) => ({ categoryId: cats.get(slug)! })) },
        inventory: { create: { onHandBoxes: p.stock, reservedBoxes: 0, lowStockThreshold: 10 } },
        priceHistory: { create: { pricingBasis: 'M2', priceM2Cents: p.priceM2, priceBoxCents: priceBoxFromM2(p.priceM2, area) } },
      },
    });
    if (p.stock > 0) {
      await prisma.inventoryMovement.create({
        data: { productId: product.id, type: 'INITIAL', deltaOnHand: p.stock, deltaReserved: 0, onHandAfter: p.stock, reservedAfter: 0, reason: 'Existencia de demostración' },
      });
    }
    const key = `products/${product.id}/demo-${i}.png`;
    const png = marblePng(384, p.tex.base, p.tex.vein, i + 1, p.tex.style);
    await fs.mkdir(path.dirname(path.join(publicDir, key)), { recursive: true });
    await fs.writeFile(path.join(publicDir, key), png);
    await prisma.productImage.create({ data: { productId: product.id, storageKey: key, mimeType: 'image/png', sizeBytes: png.length, alt: p.name, sortOrder: 0 } });
    console.log(`Producto demo: ${p.sku}`);
  }
  // Métodos de pago de demostración claramente identificados.
  await prisma.paymentMethod.updateMany({
    where: { instructions: { startsWith: 'PENDIENTE DE CONFIGURAR' } },
    data: { instructions: 'DEMOSTRACIÓN: no realice pagos reales. Reemplace este texto por los datos de pago de la tienda.', active: true },
  });
}

seedBase()
  .then(() => (demo ? seedDemo() : undefined))
  .then(() => console.log('Semilla completada'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
