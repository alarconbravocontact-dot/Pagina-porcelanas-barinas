import type { FastifyInstance } from 'fastify';
import { catalogQuerySchema, quoteRequestSchema } from '@porcelanas/shared';
import { z } from 'zod';
import { prisma } from '../db';
import { parse } from '../lib/errors';
import { catalogFacets, getProduct, listCatalog } from '../services/catalog';
import { getAvailability } from '../services/pickup';
import { createQuote } from '../services/quotes';
import { getCurrentRate } from '../services/rates';
import { getPublicSettings, getSettings } from '../services/settings';

export async function publicRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, time: new Date().toISOString() };
  });

  app.get('/api/settings/public', async () => getPublicSettings());

  app.get('/api/catalog', async (req) => listCatalog(parse(catalogQuerySchema, req.query)));
  app.get('/api/catalog/facets', async () => catalogFacets());
  app.get<{ Params: { idOrSku: string } }>('/api/products/:idOrSku', async (req) => getProduct(req.params.idOrSku));

  app.get('/api/categories', async () =>
    prisma.category.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, slug: true } }),
  );

  app.get('/api/rates/current', async () => {
    const [rate, s] = await Promise.all([getCurrentRate(), getSettings()]);
    return { rate, maxAgeHours: s.rate.maxAgeHours, blockWhenStale: s.rate.blockWhenStale };
  });

  app.post('/api/quotes', async (req) => {
    const body = parse(quoteRequestSchema, req.body);
    return createQuote(body.items, req.auth?.userId ?? null);
  });

  app.get('/api/sellers', async () =>
    prisma.seller.findMany({
      where: { active: true, user: { active: true } },
      orderBy: { displayName: 'asc' },
      select: { id: true, displayName: true, bio: true },
    }),
  );

  app.get('/api/payment-methods', async () =>
    prisma.paymentMethod.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, kind: true, name: true, currency: true, instructions: true, requiresProof: true },
    }),
  );

  app.get('/api/pickup/availability', async (req) => {
    const { type } = parse(z.object({ type: z.enum(['PICKUP', 'PREPAY']).default('PICKUP') }), req.query);
    return getAvailability(type);
  });
}
