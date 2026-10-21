import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { config } from './config';
import { authPlugin } from './lib/auth';
import { AppError, errorHandler } from './lib/errors';
import { storage } from './lib/storage';
import { adminRoutes } from './routes/admin';
import { assistantRoutes } from './routes/assistant';
import { portalRoutes } from './routes/portal';
import { authRoutes } from './routes/auth';
import { cartRoutes } from './routes/cart';
import { customerRoutes } from './routes/customers';
import { chatRoutes } from './routes/chat';
import { orderRoutes } from './routes/orders';
import { publicRoutes } from './routes/public';
import { staffRoutes } from './routes/staff';

export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify({
    logger: config.isTest ? false : { level: config.isProd ? 'info' : 'debug', redact: ['req.headers.cookie', 'req.headers["x-csrf-token"]'] },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    ...opts,
  });

  app.setErrorHandler(errorHandler);

  // Rechaza bytes nulos (PostgreSQL no los admite en texto y suelen indicar manipulación).
  const hasNull = (v: unknown): boolean =>
    typeof v === 'string' ? v.includes('\u0000') : Array.isArray(v) ? v.some(hasNull) : !!v && typeof v === 'object' && Object.values(v).some(hasNull);
  app.addHook('onRequest', async (req) => {
    if (/%00/.test(req.url) || req.url.includes('\u0000')) throw new AppError(400, 'INVALID_INPUT', 'La solicitud contiene caracteres no válidos');
  });
  app.addHook('preValidation', async (req) => {
    if (hasNull(req.body) || hasNull(req.params) || hasNull(req.query)) {
      throw new AppError(400, 'INVALID_INPUT', 'La solicitud contiene caracteres no válidos');
    }
  });
  await storage.ensureDirs();

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        // Mapa de la sede: se incrusta Google Maps solo cuando el visitante pulsa «Ver mapa».
        frameSrc: ['https://www.google.com', 'https://maps.google.com'],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: config.isTest ? 100_000 : config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    allowList: config.isTest ? () => true : undefined,
  });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 10 } });
  await app.register(authPlugin);

  // Fotos de productos (públicas). Los comprobantes viven en otro directorio y nunca se sirven aquí.
  await app.register(fastifyStatic, {
    root: config.storage.publicDir,
    prefix: '/media/',
    decorateReply: false,
    index: false,
    list: false,
    maxAge: '7d',
  });

  await app.register(publicRoutes);
  await app.register(authRoutes);
  await app.register(cartRoutes);
  await app.register(customerRoutes);
  await app.register(orderRoutes);
  await app.register(chatRoutes);
  await app.register(staffRoutes);
  await app.register(adminRoutes);
  await app.register(assistantRoutes);
  await app.register(portalRoutes);

  // En producción el mismo servidor entrega el frontend compilado (SPA).
  const webDist = config.WEB_DIST_DIR ? path.resolve(config.WEB_DIST_DIR) : path.resolve(process.cwd(), '../web/dist');
  if (!config.isTest && fs.existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/', decorateReply: true, index: false, list: false, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/media/') || req.method !== 'GET') {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } });
      }
      return reply.type('text/html').sendFile('index.html');
    });
    app.get('/assets/*', (req, reply) => reply.sendFile(req.url.slice(1)));
  } else {
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } }));
  }

  return app;
}
