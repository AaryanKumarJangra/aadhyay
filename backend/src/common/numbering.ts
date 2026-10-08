import { sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service';
import { numberSeries } from '../db/schema';
import { Ctx } from '../kernel/context/request-context';

/** Gap-free per-tenant number series (receipts, admissions, vouchers…). Must run inside db.t(). */
export async function nextNumber(tx: Tx, key: string, prefix: string, pad = 5): Promise<string> {
  const tenantId = Ctx.tenantId();
  await tx.insert(numberSeries).values({ tenantId, key, prefix, next: 1 }).onConflictDoNothing();
  const res = await tx.execute(sql`update number_series set next = next + 1 where tenant_id = ${tenantId} and key = ${key} returning next - 1 as n, prefix`);
  const row = res.rows[0] as any;
  return `${row.prefix}${String(row.n).padStart(pad, '0')}`;
}
