import { seed } from '../seed/index.js';
import { closePool } from '../db.js';

await seed();
await closePool();
