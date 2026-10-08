import { Injectable } from '@nestjs/common';
import { and, eq, gte, lt, sql, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { companyExpense, platformPayment, tenant, subscription, usageRecord } from '../db/schema';

export const INCOME_TAX_RATE = 0.2517; // Pvt Ltd u/s 115BAA incl. surcharge & cess — confirm with CA
export const SPEND_CEILING = 0.6;
export const REINVEST_SHARE = 0.8;

function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return { from: new Date(Date.UTC(y!, m! - 1, 1)), to: new Date(Date.UTC(y!, m!, 1)) };
}
function prevMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y!, m! - 1 - (i + 1), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/** Company P&L, spend ceiling (60% rule) and 80:20 split — docs/01 §9 and §11. */
@Injectable()
export class FinanceService {
  constructor(private readonly db: DbService) {}

  async netCollections(ym: string) {
    const { from, to } = monthRange(ym);
    const [r] = await this.db.admin.select({ total: sql<string>`coalesce(sum(${platformPayment.amountPaise}),0)` }).from(platformPayment)
      .where(and(eq(platformPayment.status, 'succeeded'), gte(platformPayment.createdAt, from), lt(platformPayment.createdAt, to)));
    const gross = Number(r?.total ?? 0);
    const exGst = Math.round(gross / 1.18);
    const [c] = await this.db.admin.select({ cost: sql<string>`coalesce(sum(${usageRecord.costPaise}),0)` }).from(usageRecord).where(and(gte(usageRecord.occurredAt, from), lt(usageRecord.occurredAt, to)));
    return { grossPaise: gross, gstPaise: gross - exGst, netPaise: exGst, passThroughCostPaise: Number(c?.cost ?? 0) };
  }

  async expenses(ym: string) {
    const rows = await this.db.admin.select().from(companyExpense).where(eq(companyExpense.month, ym));
    return { rows, totalPaise: rows.reduce((s, r) => s + r.amountPaise, 0), gstInputPaise: rows.reduce((s, r) => s + r.gstPaise, 0) };
  }

  async report(ym: string) {
    const coll = await this.netCollections(ym);
    const exp = await this.expenses(ym);
    const opex = exp.totalPaise + coll.passThroughCostPaise;
    const pbt = coll.netPaise - opex;
    const tax = Math.max(0, Math.round(pbt * INCOME_TAX_RATE));
    const net = pbt - tax;
    const trailing = await Promise.all(prevMonths(ym, 3).map((m) => this.netCollections(m)));
    const trailingAvg = Math.round(trailing.reduce((s, x) => s + x.netPaise, 0) / 3);
    const ceiling = Math.round(trailingAvg * SPEND_CEILING);
    const gstPayable = coll.gstPaise - exp.gstInputPaise;
    return {
      month: ym,
      collections: coll,
      expenses: { ...exp, passThroughCostPaise: coll.passThroughCostPaise, totalOpexPaise: opex },
      profitBeforeTaxPaise: pbt,
      incomeTaxReservePaise: tax,
      netProfitPaise: net,
      split: { reinvestPaise: net > 0 ? Math.round(net * REINVEST_SHARE) : 0, foundersPaise: net > 0 ? net - Math.round(net * REINVEST_SHARE) : 0 },
      gst: { outputPaise: coll.gstPaise, inputCreditPaise: exp.gstInputPaise, payablePaise: Math.max(0, gstPayable) },
      spendCeiling: {
        trailing3mAvgNetPaise: trailingAvg,
        ceilingPaise: ceiling,
        spentPaise: exp.totalPaise,
        usedPct: ceiling ? Math.round((exp.totalPaise / ceiling) * 100) : null,
        ok: ceiling === 0 ? exp.totalPaise === 0 : exp.totalPaise <= ceiling,
        rule: 'Monthly expenses ≤ 60% of trailing-3-month average net collections',
      },
    };
  }

  /** Allowed to add a recurring expense? (blocks above ceiling unless founder override) */
  async canSpend(ym: string, addPaise: number) {
    const r = await this.report(ym);
    const allowedZeroRevenue = r.spendCeiling.trailing3mAvgNetPaise === 0 && r.collections.netPaise > 0;
    const cap = allowedZeroRevenue ? Math.round(r.collections.netPaise * SPEND_CEILING) : r.spendCeiling.ceilingPaise;
    return { ok: r.expenses.totalPaise + addPaise <= cap, capPaise: cap, afterPaise: r.expenses.totalPaise + addPaise };
  }

  async metrics() {
    const byStatus = await this.db.admin.select({ status: tenant.status, n: sql<number>`count(*)::int` }).from(tenant).groupBy(tenant.status);
    const subs = await this.db.admin.select().from(subscription).where(eq(subscription.status, 'active'));
    // MRR from active subscriptions: quantity × unit (unit is monthly charge for the plan line)
    const mrr = subs.reduce((s, x) => s + (x.cycle === 'yearly' ? Math.round((x.unitPricePaise * 10) / 12) : x.unitPricePaise), 0);
    return { tenantsByStatus: byStatus, activeSubscriptions: subs.length, mrrPaise: mrr, arrPaise: mrr * 12 };
  }
}
