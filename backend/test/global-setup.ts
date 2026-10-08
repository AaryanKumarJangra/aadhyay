import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { join } from 'node:path';
import { testEnv } from './test-env';

/** Creates (once) and migrates the isolated e2e database before any test file runs. */
export default async function setup() {
  const env = testEnv();
  if (!env.TEST_DATABASE_NAME!.endsWith('_test')) throw new Error('refusing to run e2e against a non-test database');
  const maint = new Pool({ connectionString: env.ADMIN_MAINTENANCE_URL });
  const { rowCount } = await maint.query('SELECT 1 FROM pg_database WHERE datname = $1', [env.TEST_DATABASE_NAME]);
  if (!rowCount) await maint.query(`CREATE DATABASE "${env.TEST_DATABASE_NAME}"`);
  await maint.end();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: join(__dirname, '..', 'src', 'db', 'migrations') });
  await db.execute(sql`SELECT aadhyay_apply_rls()`);
  await pool.end();
}
