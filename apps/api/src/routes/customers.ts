import type { FastifyInstance } from 'fastify';
import { requireCustomer } from '../lib/auth';
import { getOwnProfile, upsertCustomerProfile } from '../services/customers';

export async function customerRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  /** Perfil del cliente autenticado (solo el propio). */
  app.get('/api/customers/me', async (req) => getOwnProfile(requireCustomer(req).customerId));

  /** Registro rápido (4 datos) o corrección del perfil propio. */
  app.put('/api/customers/profile', strict, async (req, reply) => {
    const r = await upsertCustomerProfile(req, reply, req.body);
    return reply.status(r.created ? 201 : 200).send(r);
  });
}
