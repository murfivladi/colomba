import { exec } from '../db.js';
import { closePool } from '../db.js';

const email = process.argv[2];
if (!email) {
  console.error('usage: npm run make-admin -- user@example.com');
  process.exit(1);
}
const res = await exec("UPDATE users SET role = 'admin' WHERE email = ?", [email.toLowerCase()]);
console.log(res.affectedRows ? `admin: ${email}` : `user not found: ${email}`);
await closePool();
