import fs from 'node:fs/promises';
import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { seed } from './seed/index.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { closePool } from './db.js';

async function main() {
  await fs.mkdir(config.mediaDir, { recursive: true });
  await migrate();
  await seed();
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
  startScheduler();
  const stop = async () => {
    stopScheduler();
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
