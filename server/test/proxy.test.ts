import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';
import { closePool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

describe('PHP proxy secret', () => {
  afterAll(async () => {
    config.proxySecret = '';
    await closePool();
  });

  it('rejects requests that bypass the proxy, except health', async () => {
    await migrate(() => {});
    config.proxySecret = 'shared-secret';
    const app = await buildApp({ logger: false });
    const direct = await app.inject({ url: '/api/me' });
    expect(direct.statusCode).toBe(403);
    expect(direct.json().error).toBe('proxy_required');
    const wrong = await app.inject({ url: '/api/me', headers: { 'x-colomba-proxy': 'shared-secreT' } });
    expect(wrong.statusCode).toBe(403);
    const viaProxy = await app.inject({ url: '/api/me', headers: { 'x-colomba-proxy': 'shared-secret' } });
    expect(viaProxy.statusCode).toBe(401); // дошёл до приложения: просто не вошёл
    expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200);
    await app.close();
  });
});
