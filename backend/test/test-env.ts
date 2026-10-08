import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * E2E tests get their own database (`<dev db>_test`), Redis logical DB and key namespace, derived from the
 * developer's .env. Dev processes (api/worker/realtime) therefore never see test data or test events.
 */
function readDotEnv(): Record<string, string> {
  for (const p of [join(__dirname, '..', '.env'), join(__dirname, '..', '..', '.env')]) {
    if (!existsSync(p)) continue;
    const out: Record<string, string> = {};
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=([^#\s]*)/);
      if (m) out[m[1]!] = m[2]!;
    }
    return out;
  }
  return {};
}

const withDb = (url: string, db: string) => { const u = new URL(url); u.pathname = `/${db}`; return u.toString(); };
const withRedisDb = (url: string, n: number) => { const u = new URL(url); u.pathname = `/${n}`; return u.toString(); };

export function testEnv(): Record<string, string> {
  const src = { ...readDotEnv(), ...process.env } as Record<string, string>;
  const base = src.DATABASE_URL ?? 'postgresql://aadhyay_admin:aadhyay_admin@localhost:5432/aadhyay';
  const name = new URL(base).pathname.slice(1).replace(/_test$/, '');
  const testDb = `${name}_test`;
  return {
    NODE_ENV: 'test',
    TEST_DATABASE_NAME: testDb,
    DATABASE_URL: withDb(base, testDb),
    APP_DATABASE_URL: withDb(src.APP_DATABASE_URL ?? 'postgresql://aadhyay_app:aadhyay_app@localhost:5432/aadhyay', testDb),
    ADMIN_MAINTENANCE_URL: withDb(base, 'postgres'),
    REDIS_URL: withRedisDb(src.REDIS_URL ?? 'redis://localhost:6379', 15),
    REDIS_NAMESPACE: 'e2e',
    // Tests simulate many client IPs through X-Forwarded-For.
    TRUST_PROXY: 'true',
    OTP_DEV_ECHO: 'true',
  };
}
