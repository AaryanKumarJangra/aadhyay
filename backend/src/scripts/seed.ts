import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema';
import { loadEnv } from '../config/load-env';
import { seedBase } from './seed-data';

async function main() {
  loadEnv();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@aadhyay.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe@123';
  await seedBase(db, { email, password, name: 'Founder' });
  console.log(`seeded plans + price book; super admin ${email}`);
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
