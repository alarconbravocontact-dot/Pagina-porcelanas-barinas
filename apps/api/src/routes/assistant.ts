import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { parse } from '../lib/errors';
import { answer, assistantProvider, assistantRequestSchema } from '../services/assistant';

export async function assistantRoutes(app: FastifyInstance) {
  app.get('/api/assistant', async () => ({ provider: assistantProvider() }));

  // Público (también para visitantes sin sesión); las conversaciones no se guardan en el servidor.
  app.post('/api/assistant/messages', { config: { rateLimit: { max: config.ASSISTANT_RATE_LIMIT_PER_MIN, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(assistantRequestSchema, req.body);
    return answer(body, req.auth?.customerId ?? null, req.log);
  });
}
