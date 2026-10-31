import fs from 'node:fs';
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
  // бэкенд на https://colomba-api.vladinc.ru:5576 сам терминирует TLS сертификатом Let's Encrypt
  const https = config.tlsCertFile && config.tlsKeyFile
    ? { https: { cert: fs.readFileSync(config.tlsCertFile), key: fs.readFileSync(config.tlsKeyFile) } }
    : {};
  const app = Fastify({
    logger: opts.logger ?? true,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
    ...https,
  }) as unknown as FastifyInstance;
  await app.register(cookie);
  if (config.corsOrigins.length) {
    // фронт на vladinc.ru, API на colomba-api.vladinc.ru:5576 — один «сайт», cookie SameSite=Lax доходят
    await app.register(cors, {
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
    });
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
