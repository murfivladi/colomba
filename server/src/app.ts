import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { config } from './config.js';
import { loadUser } from './lib/auth.js';
import { HttpError } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { peopleRoutes } from './routes/people.js';
import { courierRoutes } from './routes/couriers.js';
import { letterRoutes } from './routes/letters.js';
import { worldRoutes } from './routes/world.js';
import { adminRoutes } from './routes/admin.js';

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? true,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });
  await app.register(cookie);
  if (config.corsOrigins.length) {
    // запасной вариант без прокси: поддомен api.vladinc.ru с CORS
    await app.register(cors, { origin: config.corsOrigins, credentials: true });
  }
  if (config.rateLimit) await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    req.user = await loadUser(req);
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.code, details: err.details ?? null });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'validation', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: err.code ?? 'error', details: err.message });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'internal' });
  });

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ ok: true, time: new Date().toISOString() }));
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(meRoutes, { prefix: '/me' });
      await api.register(peopleRoutes);
      await api.register(courierRoutes, { prefix: '/couriers' });
      await api.register(letterRoutes);
      await api.register(worldRoutes);
      await api.register(adminRoutes, { prefix: '/admin' });
    },
    { prefix: config.apiPrefix },
  );
  return app;
}
