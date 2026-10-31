import { migrate } from '../migrate.js';
import { closePool } from '../db.js';

await migrate();
await closePool();
