import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema';
import { env } from '../config/env';
import { Ctx } from '../kernel/context/request-context';

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/**
 * Two connection pools:
 *  - `app`   → role aadhyay_app (RLS enforced). ALL tenant data access goes through `t()`.
 *  - `admin` → role aadhyay_admin (bypasses RLS). Only for control plane, auth (global users), messenger, workers.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly appPool = new Pool({ connectionString: env.APP_DATABASE_URL, max: 20 });
  private readonly adminPool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
  readonly app: DB = drizzle(this.appPool, { schema });
  readonly admin: DB = drizzle(this.adminPool, { schema });

  /**
   * Run `fn` inside a tenant-scoped transaction: `SET LOCAL app.tenant_id` so RLS policies apply.
   * Nested calls reuse the outer transaction (atomic across services).
   */
  async t<T>(fn: (tx: Tx) => Promise<T>, tenantId?: string): Promise<T> {
    const ctx = Ctx.maybe();
    const tid = tenantId ?? ctx?.tenantId;
    if (!tid) throw new Error('Tenant context required for t()');
    if (ctx?.tx && ctx.tenantId === tid) return fn(ctx.tx);
    return this.app.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tid}, true)`);
      if (!ctx) return fn(tx);
      const prev = ctx.tx;
      ctx.tx = tx;
      try {
        return await fn(tx);
      } finally {
        ctx.tx = prev;
      }
    });
  }

  async onModuleDestroy() {
    await Promise.all([this.appPool.end(), this.adminPool.end()]);
  }
}
