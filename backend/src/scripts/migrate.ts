import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { join } from 'node:path';
import { loadEnv } from '../config/load-env';
import * as schema from '../db/schema';
import { syncSystemRoles } from '../kernel/rbac/role-sync';

async function main() {
  loadEnv();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: join(__dirname, '..', '..', 'src', 'db', 'migrations') });
  await db.execute(sql`SELECT aadhyay_apply_rls()`);
  const roles = await syncSystemRoles(drizzle(pool, { schema }));
  await pool.end();
  console.log(`migrations applied + RLS refreshed; system roles: ${roles.added} added, ${roles.upgraded} upgraded across ${roles.tenants} tenants`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
