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
import { publicMethod } from '../services/paymentMethods';
import { assistantProvider } from '../services/assistant';
import { config } from '../config';

export async function publicRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, time: new Date().toISOString() };
  });

  app.get('/api/settings/public', async () => ({
    ...(await getPublicSettings()),
    // Datos reales de funcionamiento que citan los textos legales (duración de sesiones y motor del asistente).
    legal: { customerSessionDays: config.CUSTOMER_SESSION_TTL_DAYS, staffSessionHours: config.SESSION_TTL_HOURS, assistantProvider: assistantProvider() },
  }));

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
      // Solo datos de contacto comercial que el vendedor publica; nunca el teléfono interno ni el usuario.
      select: { id: true, displayName: true, bio: true, city: true, branch: true, publicPhone: true, whatsapp: true, publicEmail: true },
    }),
  );

  /** Métodos activos con su estado de configuración (los no configurados se muestran deshabilitados). */
  app.get('/api/payment-methods', async () =>
    (await prisma.paymentMethod.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })).map(publicMethod),
  );

  app.get('/api/pickup/availability', async (req) => {
    const { type } = parse(z.object({ type: z.enum(['PICKUP', 'PREPAY']).default('PICKUP') }), req.query);
    return getAvailability(type);
  });
}
