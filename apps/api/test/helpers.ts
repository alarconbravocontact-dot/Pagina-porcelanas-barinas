import type { Prisma } from '@prisma/client';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import crypto from 'node:crypto';
import { buildApp } from '../src/app';
import { prisma } from '../src/db';
import { hashPassword } from '../src/lib/crypto';
import { invalidateSettings } from '../src/services/settings';
import { localDateString, addDays, weekdayOf, SETTINGS_DEFAULTS } from '@porcelanas/shared';

export { prisma };

let appPromise: Promise<FastifyInstance> | null = null;
export function getApp() {
  appPromise ??= buildApp().then(async (a) => {
    await a.ready();
    return a;
  });
  return appPromise;
}

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  invalidateSettings();
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Cliente HTTP con cookies y token CSRF, equivalente a un navegador. */
export class Client {
  cookies = new Map<string, string>();
  constructor(public app: FastifyInstance) {}

  private cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private store(res: LightMyRequestResponse) {
    for (const c of res.cookies as { name: string; value: string; expires?: Date; maxAge?: number }[]) {
      if (c.value === '' || (c.expires && c.expires.getTime() < Date.now()) || c.maxAge === 0) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
  }

  async init() {
    const res = await this.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: this.cookieHeader() } });
    this.store(res);
    return this;
  }

  async req(method: Method, url: string, body?: unknown, headers: Record<string, string> = {}) {
    if (!this.cookies.has('csrf_token')) await this.init();
    const res = await this.app.inject({
      method,
      url,
      payload: body === undefined ? undefined : (body as object),
      headers: { cookie: this.cookieHeader(), 'x-csrf-token': this.cookies.get('csrf_token') ?? '', ...headers },
    });
    this.store(res);
    return res;
  }

  get(url: string) {
    return this.req('GET', url);
  }
  post(url: string, body?: unknown, headers?: Record<string, string>) {
    return this.req('POST', url, body ?? {}, headers);
  }
  put(url: string, body?: unknown) {
    return this.req('PUT', url, body ?? {});
  }
  patch(url: string, body?: unknown) {
    return this.req('PATCH', url, body ?? {});
  }
  delete(url: string) {
    return this.req('DELETE', url);
  }

  async multipart(url: string, fields: Record<string, string>, file?: { name: string; type: string; data: Buffer }, headers: Record<string, string> = {}) {
    if (!this.cookies.has('csrf_token')) await this.init();
    const boundary = `----test${crypto.randomBytes(8).toString('hex')}`;
    const parts: Buffer[] = [];
    for (const [k, v] of Object.entries(fields)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    }
    if (file) {
      parts.push(
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`),
        file.data,
        Buffer.from('\r\n'),
      );
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const res = await this.app.inject({
      method: 'POST',
      url,
      payload: Buffer.concat(parts),
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        cookie: this.cookieHeader(),
        'x-csrf-token': this.cookies.get('csrf_token') ?? '',
        ...headers,
      },
    });
    this.store(res);
    return res;
  }
}

export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
export const JPEG_HEADER = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);

export const idem = () => crypto.randomUUID();

let docSeq = 0;
export async function createUser(role: 'ADMIN' | 'SELLER' | 'CUSTOMER', email: string, password = 'Password1234') {
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role,
      ...(role === 'CUSTOMER'
        ? { customer: { create: { fullName: `Cliente ${email}`, phone: '+584120000000', city: 'Barinas', addressRef: 'Centro', documentId: `V-${10_000_000 + ++docSeq}` } } }
        : {}),
      ...(role === 'SELLER'
        ? { seller: { create: { fullName: `Vendedor ${email}`, displayName: `V ${email.split('@')[0]}`, phone: '+58 414 0000000' } } }
        : {}),
    },
    include: { seller: true, customer: true },
  });
}

export async function login(app: FastifyInstance, email: string, password = 'Password1234') {
  const c = new Client(app);
  const res = await c.post('/api/auth/login', { email, password });
  if (res.statusCode !== 200) throw new Error(`login failed ${res.statusCode} ${res.body}`);
  return c;
}

export async function setSetting(key: string, patch: Record<string, unknown>) {
  const base = (SETTINGS_DEFAULTS as Record<string, object>)[key];
  const row = await prisma.businessSetting.findUnique({ where: { key } });
  const value = { ...base, ...((row?.value as object) ?? {}), ...patch } as Prisma.InputJsonValue;
  await prisma.businessSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  invalidateSettings();
}

/** Prepara un escenario comercial completo: admin, vendedor, cliente, categoría, producto, tasa y método de pago. */
export async function scenario(opts: { stock?: number; rate?: string; capacity?: number } = {}) {
  const app = await getApp();
  await resetDb();
  const adminUser = await createUser('ADMIN', 'admin@test.local');
  const sellerUser = await createUser('SELLER', 'seller@test.local');
  const customerUser = await createUser('CUSTOMER', 'cliente@test.local');
  const category = await prisma.category.create({ data: { name: 'Baño', slug: 'bano' } });
  const admin = await login(app, 'admin@test.local');
  const res = await admin.post('/api/admin/products', {
    sku: 'POR-6060-BLA',
    name: 'Porcelanato Blanco',
    description: 'Prueba',
    color: 'Blanco',
    widthCm: 60,
    lengthCm: 60,
    piecesPerBox: 6,
    boxAreaM2: '2.16',
    pricingBasis: 'M2',
    price: '12.50',
    finish: 'PULIDO',
    antiSlip: 'NO',
    status: 'ACTIVE',
    featured: true,
    categoryIds: [category.id],
    lowStockThreshold: 5,
    initialStockBoxes: opts.stock ?? 100,
  });
  if (res.statusCode !== 201) throw new Error(`product ${res.body}`);
  const product = res.json();
  const tz = 'America/Caracas';
  const today = localDateString(new Date(), tz);
  if (opts.rate !== null) {
    await prisma.exchangeRate.create({
      data: { rate: opts.rate ?? '36.50000000', source: 'MANUAL', sourceNote: 'prueba', effectiveDate: new Date(`${today}T00:00:00Z`), createdById: adminUser.id },
    });
  }
  const methodUsd = await prisma.paymentMethod.create({
    data: { kind: 'ZELLE', name: 'Zelle', currency: 'USD', instructions: 'Instrucciones de prueba', receivingDetails: 'Destinatario de prueba', requiresProof: true, active: true },
  });
  const methodVes = await prisma.paymentMethod.create({
    data: { kind: 'PAGO_MOVIL', name: 'Pago Móvil', currency: 'VES', instructions: 'Instrucciones de prueba', receivingDetails: 'Teléfono de prueba', requiresProof: true, active: true },
  });
  // Todos los días habilitados para que las pruebas no dependan del día de la semana.
  await setSetting('pickup', {
    weekdays: Array.from({ length: 7 }, () => ({ enabled: true, open: '08:00', close: '17:00' })),
    capacityPerDay: opts.capacity ?? 20,
    minAdvanceHours: 0,
    maxDaysAheadPickup: 15,
    maxDaysAheadPrepay: 90,
  });
  const customer = await login(app, 'cliente@test.local');
  return {
    app,
    admin,
    customer,
    adminUser,
    sellerUser,
    customerUser,
    seller: sellerUser.seller!,
    category,
    product,
    methodUsd,
    methodVes,
    today,
    pickupDate: addDays(today, 3),
    weekdayOf,
  };
}

export async function checkout(
  c: Client,
  s: { seller: { id: string }; methodUsd: { id: string }; pickupDate: string },
  extra: Record<string, unknown> = {},
  key = idem(),
) {
  return c.post(
    '/api/orders',
    {
      sellerId: s.seller.id,
      sellerConfirmed: true,
      type: 'PICKUP',
      pickupDate: s.pickupDate,
      paymentMethodId: s.methodUsd.id,
      fullName: 'Cliente Prueba',
      phone: '+58 412 1234567',
      acceptPolicies: true,
      ...extra,
    },
    { 'idempotency-key': key },
  );
}
