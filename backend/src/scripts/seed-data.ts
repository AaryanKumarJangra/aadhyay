import * as argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import type { DB } from '../db/db.service';
import { plan, priceBookItem, platformUser } from '../db/schema';
import { PLANS, PRICE_BOOK } from '../control-plane/price-book.seed';
import { PLAN_MODULES } from '@aadhyay/contracts';

/** Idempotent base seed: plans, price book, first super admin. */
export async function seedBase(db: DB, admin?: { email: string; password: string; name?: string }) {
  for (const p of PLANS) {
    await db.insert(plan).values({ ...p, segment: p.segment as any, includedModules: PLAN_MODULES[p.code] ?? [] })
      .onConflictDoUpdate({ target: plan.code, set: { name: p.name, pricePerUnitPaise: p.pricePerUnitPaise, minMonthlyPaise: p.minMonthlyPaise, rangeMinPaise: p.rangeMinPaise, rangeMaxPaise: p.rangeMaxPaise, includedModules: PLAN_MODULES[p.code] ?? [] } });
  }
  for (const i of PRICE_BOOK) {
    await db.insert(priceBookItem).values({ ...i, minPaise: i.minPaise ?? i.listPaise, maxPaise: i.maxPaise ?? i.listPaise, meta: i.meta ?? {} })
      .onConflictDoUpdate({ target: priceBookItem.code, set: { name: i.name, listPaise: i.listPaise, minPaise: i.minPaise ?? i.listPaise, maxPaise: i.maxPaise ?? i.listPaise, meta: i.meta ?? {} } });
  }
  if (admin) {
    await db.insert(platformUser).values({ email: admin.email.toLowerCase(), name: admin.name ?? 'Super Admin', role: 'super_admin', passwordHash: await argon2.hash(admin.password, { type: argon2.argon2id }) })
      .onConflictDoNothing();
  }
  await db.execute(sql`select 1`);
}
