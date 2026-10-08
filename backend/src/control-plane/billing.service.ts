import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, sql, sum } from 'drizzle-orm';
import { PLAN_MODULES, type ModuleKey } from '@aadhyay/contracts';
import { DbService } from '../db/db.service';
import { RedisService } from '../kernel/redis/redis.service';
import { plan, priceBookItem, invoice, invoiceLine, platformPayment, tenant, subscription, tenantModule, wallet, walletTxn, usageRecord, student } from '../db/schema';
import { quote, PricingError, type QuoteInput, type Quote, type PlanRow, type PriceRow } from './pricing';
import { AppError, badRequest, notFound } from '../common/errors';
import { env } from '../config/env';
import { financialYear, gstSplit } from '../common/money';
import { PaymentsAdapter } from '../adapters/payments/payments.adapter';
import { EventsService } from '../kernel/events/events.service';
import { TenantService } from '../kernel/tenancy/tenant.service';
import { DAY } from '../common/dates';
import { EARLY_CONVERSION_DAY, TRIAL_DAYS } from './price-book.seed';

@Injectable()
export class BillingService {
  private readonly log = new Logger('Billing');
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
    private readonly payments: PaymentsAdapter,
    private readonly events: EventsService,
    private readonly tenants: TenantService,
  ) {}

  async book(): Promise<{ plans: PlanRow[]; items: PriceRow[] }> {
    const c = await this.redis.getJson<{ plans: PlanRow[]; items: PriceRow[] }>('pricebook');
    if (c) return c;
    const plans = (await this.db.admin.select().from(plan).where(eq(plan.isActive, true)).orderBy(plan.sortOrder)) as unknown as PlanRow[];
    const items = (await this.db.admin.select().from(priceBookItem).where(eq(priceBookItem.isActive, true))) as unknown as PriceRow[];
    const v = { plans, items };
    await this.redis.setJson('pricebook', v, 300);
    return v;
  }
  async bustBook() {
    await this.redis.client.del('pricebook');
  }

  async activeStudents(tenantId: string) {
    const [r] = await this.db.admin.select({ n: sql<number>`count(*)::int` }).from(student).where(and(eq(student.tenantId, tenantId), eq(student.status, 'active'), sql`${student.deletedAt} is null`));
    return r?.n ?? 0;
  }

  async quote(input: QuoteInput): Promise<Quote> {
    const { plans, items } = await this.book();
    const p = plans.find((x) => x.code === input.planCode);
    if (!p) throw badRequest('Unknown plan');
    try {
      return quote(input, p, items, env.COMPANY_STATE_CODE);
    } catch (e) {
      if (e instanceof PricingError) throw badRequest(e.message);
      throw e;
    }
  }

  /** Quote for an existing tenant (uses its real student count, state, and the early-conversion rule). */
  async tenantQuote(tenantId: string, input: Partial<QuoteInput> & { planCode: string }) {
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, tenantId));
    if (!t) throw notFound('Tenant');
    const students = input.students ?? Math.max(await this.activeStudents(tenantId), 1);
    const trialStart = t.trialEndsAt ? t.trialEndsAt.getTime() - TRIAL_DAYS * DAY : 0;
    const early = t.status === 'trial' && Date.now() - trialStart < EARLY_CONVERSION_DAY * DAY;
    const hasPaidBefore = (await this.db.admin.select({ id: subscription.id }).from(subscription).where(eq(subscription.tenantId, tenantId)).limit(1)).length > 0;
    return this.quote({
      planCode: input.planCode, students, cycle: input.cycle ?? 'yearly', addons: input.addons ?? [], unitPricePaise: input.unitPricePaise,
      includeSetup: input.includeSetup ?? !hasPaidBefore, placeOfSupply: t.stateCode ?? env.COMPANY_STATE_CODE, earlyConversion: early,
    });
  }

  private async nextInvoiceNumber(tx: any, kind: 'tax' | 'proforma' | 'credit_note') {
    const fy = financialYear();
    const prefix = kind === 'proforma' ? 'PI' : kind === 'credit_note' ? 'CN' : 'AAD';
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'inv:' + prefix + fy}))`);
    const like = `${prefix}/${fy}/%`;
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(invoice).where(sql`${invoice.number} like ${like}`);
    return `${prefix}/${fy}/${String((r?.n ?? 0) + 1).padStart(5, '0')}`;
  }

  async createInvoice(tenantId: string, q: Quote, kind: 'proforma' | 'tax', meta: Record<string, unknown> = {}) {
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, tenantId));
    if (!t) throw notFound('Tenant');
    return this.db.admin.transaction(async (tx) => {
      const number = await this.nextInvoiceNumber(tx, kind);
      const [inv] = await tx.insert(invoice).values({
        tenantId, number, kind, status: 'issued', placeOfSupply: t.stateCode ?? env.COMPANY_STATE_CODE, subtotalPaise: q.subtotalPaise, cgstPaise: q.cgstPaise,
        sgstPaise: q.sgstPaise, igstPaise: q.igstPaise, totalPaise: q.totalPaise, dueAt: new Date(Date.now() + 7 * DAY), meta: { ...meta, quote: { planCode: q.planCode, cycle: q.cycle, months: q.months } },
      }).returning();
      await tx.insert(invoiceLine).values(q.lines.map((l) => ({ invoiceId: inv!.id, description: l.description, sac: l.sac, qty: l.qty, unitPaise: l.unitPaise, amountPaise: l.amountPaise, priceCode: l.code })));
      return inv!;
    });
  }

  /** Create a payment order for an invoice (Aadhyay's own gateway account). */
  async payInvoice(tenantId: string, invoiceId: string) {
    const [inv] = await this.db.admin.select().from(invoice).where(and(eq(invoice.id, invoiceId), eq(invoice.tenantId, tenantId)));
    if (!inv) throw notFound('Invoice');
    if (inv.status === 'paid') throw badRequest('Invoice already paid');
    const due = inv.totalPaise - inv.paidPaise;
    const creds = this.payments.platformCreds();
    const order = await this.payments.createOrder(creds, due, inv.number, { tenantId, invoiceId });
    await this.db.admin.insert(platformPayment).values({ tenantId, invoiceId, purpose: 'invoice', gateway: 'razorpay', gatewayRef: order.id, amountPaise: due, status: 'created' });
    return { orderId: order.id, keyId: order.keyId, amountPaise: due, currency: 'INR', invoiceNumber: inv.number };
  }

  /** Called from checkout callback or gateway webhook. Idempotent. */
  async confirmPayment(orderId: string, paymentId: string, signature: string | null, fromWebhook = false) {
    const [pp] = await this.db.admin.select().from(platformPayment).where(eq(platformPayment.gatewayRef, orderId)).limit(1);
    if (!pp) throw notFound('Payment');
    if (pp.status === 'succeeded') return { ok: true, already: true };
    if (!fromWebhook && !this.payments.verifyCheckout(this.payments.platformCreds(), orderId, paymentId, signature ?? '')) throw new AppError('FORBIDDEN', 'Invalid payment signature');
    await this.db.admin.update(platformPayment).set({ status: 'succeeded', payload: { paymentId } }).where(eq(platformPayment.id, pp.id));
    if (pp.purpose === 'wallet_topup') return this.creditWalletTopup(pp.tenantId, pp.amountPaise, paymentId);
    const [inv] = await this.db.admin.update(invoice).set({ status: 'paid', paidPaise: pp.amountPaise }).where(eq(invoice.id, pp.invoiceId!)).returning();
    await this.activateFromInvoice(inv!);
    await this.events.emit('invoice.paid', { invoiceId: inv!.id, number: inv!.number, totalPaise: inv!.totalPaise }, { tenantId: pp.tenantId });
    return { ok: true };
  }

  /** Paid invoice → subscription period, plan modules, tenant active (docs/03 §7). */
  async activateFromInvoice(inv: typeof invoice.$inferSelect) {
    const q = (inv.meta as any)?.quote;
    if (!q?.planCode) return;
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, inv.tenantId));
    const from = t!.periodEndsAt && t!.periodEndsAt > new Date() && t!.status === 'active' ? t!.periodEndsAt : new Date();
    const to = new Date(from);
    to.setUTCMonth(to.getUTCMonth() + (q.months ?? 12));
    const lines = await this.db.admin.select().from(invoiceLine).where(eq(invoiceLine.invoiceId, inv.id));
    const planLine = lines.find((l) => l.priceCode === q.planCode);
    const { items } = await this.book();
    const addonModules = lines.map((l) => items.find((i) => i.code === l.priceCode)?.meta?.module).filter(Boolean) as ModuleKey[];
    const modules = new Set<ModuleKey>([...(PLAN_MODULES[q.planCode] ?? []), ...addonModules]);
    await this.db.admin.transaction(async (tx) => {
      await tx.update(subscription).set({ status: 'ended' }).where(and(eq(subscription.tenantId, inv.tenantId), eq(subscription.status, 'active')));
      await tx.insert(subscription).values({ tenantId: inv.tenantId, planCode: q.planCode, cycle: q.cycle, unitPricePaise: planLine?.unitPaise ?? 0, quantity: Math.round(planLine?.qty ?? 1), startsAt: from, endsAt: to, status: 'active' });
      await tx.update(tenant).set({ status: 'active', planCode: q.planCode, periodEndsAt: to, graceEndsAt: null, suspendedAt: null, archivedAt: null, purgeAt: null }).where(eq(tenant.id, inv.tenantId));
      await tx.update(tenantModule).set({ enabled: false }).where(and(eq(tenantModule.tenantId, inv.tenantId), sql`${tenantModule.source} in ('trial','plan','addon')`));
      for (const m of modules) {
        await tx.insert(tenantModule).values({ tenantId: inv.tenantId, moduleKey: m, enabled: true, source: addonModules.includes(m) ? 'addon' : 'plan' })
          .onConflictDoUpdate({ target: [tenantModule.tenantId, tenantModule.moduleKey], set: { enabled: true, source: addonModules.includes(m) ? 'addon' : 'plan' } });
      }
    });
    await this.tenants.invalidate({ id: t!.id, slug: t!.slug });
    if (t!.status !== 'active') await this.events.emit('tenant.status_changed', { from: t!.status, to: 'active' }, { tenantId: t!.id });
  }

  // ---------------- Wallet ----------------
  async topupOrder(tenantId: string, amountPaise: number) {
    const order = await this.payments.createOrder(this.payments.platformCreds(), amountPaise, `wallet-${tenantId.slice(0, 8)}`, { tenantId, purpose: 'wallet' });
    await this.db.admin.insert(platformPayment).values({ tenantId, purpose: 'wallet_topup', gateway: 'razorpay', gatewayRef: order.id, amountPaise, status: 'created' });
    return { orderId: order.id, keyId: order.keyId, amountPaise, creditPaise: Math.round(amountPaise / 1.18), gstPaise: amountPaise - Math.round(amountPaise / 1.18) };
  }

  /** Top-up paid incl. GST → wallet credited with the ex-GST value; tax invoice issued (docs/01 §7). */
  async creditWalletTopup(tenantId: string, paidPaise: number, ref: string) {
    const credit = Math.round(paidPaise / 1.18);
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, tenantId));
    const g = gstSplit(credit, env.COMPANY_STATE_CODE, t!.stateCode ?? env.COMPANY_STATE_CODE);
    await this.createInvoice(tenantId, {
      planCode: '', cycle: 'yearly', months: 0, billedMonths: 0, band: null, volumeDiscountPct: 0, effectivePerStudentYearPaise: null,
      lines: [{ code: 'wallet', description: 'Prepaid usage wallet (WhatsApp, SMS, AI voice)', qty: 1, unitPaise: credit, amountPaise: credit, sac: '998314' }],
      subtotalPaise: credit, cgstPaise: g.cgstPaise, sgstPaise: g.sgstPaise, igstPaise: g.igstPaise, taxPaise: g.taxPaise, totalPaise: paidPaise,
    }, 'tax', { wallet: true });
    await this.walletAdjust(tenantId, credit, 'topup', `Top-up ${ref}`);
    return { ok: true, creditPaise: credit };
  }

  async walletAdjust(tenantId: string, amountPaise: number, kind: 'topup' | 'credit' | 'adjustment' | 'refund', ref: string) {
    return this.db.admin.transaction(async (tx) => {
      const [w] = await tx.execute(sql`select * from wallets where tenant_id = ${tenantId} for update`).then((r) => r.rows as any[]);
      const bal = Number(w.balance_paise) + amountPaise;
      await tx.update(wallet).set({ balancePaise: bal }).where(eq(wallet.tenantId, tenantId));
      await tx.insert(walletTxn).values({ walletId: w.id, tenantId, kind, amountPaise, balanceAfter: bal, ref });
      return bal;
    });
  }

  /**
   * Prepaid debit for usage. `pricePaise` may be fractional (e.g. 15.5 paise per WhatsApp utility message);
   * fractions are accumulated in Redis so the tenant is charged exactly over time. Returns false if balance is short
   * → caller falls back to a free channel (docs/01 §9.3).
   */
  async debitUsage(tenantId: string, meter: string, qty: number, pricePaise: number, costPaise: number, ref?: string): Promise<boolean> {
    const exact = pricePaise * qty;
    const accKey = `walletfrac:${tenantId}`;
    const acc = Number((await this.redis.client.get(accKey)) ?? 0) + exact;
    const debit = Math.floor(acc);
    const ok = await this.db.admin.transaction(async (tx) => {
      const [w] = await tx.execute(sql`select * from wallets where tenant_id = ${tenantId} for update`).then((r) => r.rows as any[]);
      if (!w || Number(w.balance_paise) < Math.ceil(exact)) return false;
      const [u] = await tx.insert(usageRecord).values({ tenantId, meter, qty, costPaise: Math.round(costPaise * qty), pricePaise: Math.round(exact), ref }).returning();
      if (debit > 0) {
        const bal = Number(w.balance_paise) - debit;
        await tx.update(wallet).set({ balancePaise: bal }).where(eq(wallet.tenantId, tenantId));
        await tx.insert(walletTxn).values({ walletId: w.id, tenantId, kind: 'debit', amountPaise: -debit, balanceAfter: bal, ref: meter, usageRecordId: u!.id });
        if (bal < Number(w.low_alert_paise) && Number(w.balance_paise) >= Number(w.low_alert_paise)) {
          await this.events.emit('wallet.low', { balancePaise: bal }, { tenantId, tx });
        }
      }
      return true;
    });
    if (ok) await this.redis.client.set(accKey, String(acc - debit));
    return ok;
  }

  async walletSummary(tenantId: string) {
    const [w] = await this.db.admin.select().from(wallet).where(eq(wallet.tenantId, tenantId));
    const txns = await this.db.admin.select().from(walletTxn).where(eq(walletTxn.tenantId, tenantId)).orderBy(desc(walletTxn.id)).limit(50);
    const since = new Date(Date.now() - 30 * DAY);
    const usage = await this.db.admin.select({ meter: usageRecord.meter, qty: sum(usageRecord.qty), pricePaise: sum(usageRecord.pricePaise) })
      .from(usageRecord).where(and(eq(usageRecord.tenantId, tenantId), gte(usageRecord.occurredAt, since))).groupBy(usageRecord.meter);
    return { balancePaise: w?.balancePaise ?? 0, lowAlertPaise: w?.lowAlertPaise ?? 0, txns, last30Days: usage.map((u) => ({ meter: u.meter, qty: Number(u.qty), pricePaise: Number(u.pricePaise) })) };
  }
}
