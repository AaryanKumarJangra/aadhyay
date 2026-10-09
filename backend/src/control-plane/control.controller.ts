import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { Billing, Org, MODULE_KEYS } from '@aadhyay/contracts';
import { PlatformAudit } from './platform.controller';
import { DbService } from '../db/db.service';
import { tenant, tenantDomain, tenantModule, subscription, invoice, platformUser, priceBookItem, plan, companyExpense, platformLead, appFlavour, usageRecord, student, staff, wallet } from '../db/schema';
import { Platform, Public } from '../kernel/auth/decorators';
import { Z } from '../common/zod.pipe';
import { AppError, notFound, forbidden } from '../common/errors';
import { TokenService } from '../kernel/auth/token.service';
import { verifyTotp } from '../kernel/auth/totp';
import { decrypt } from '../common/crypto';
import { ProvisioningService } from './provisioning.service';
import { BillingService } from './billing.service';
import { FinanceService } from './finance.service';
import { LifecycleService } from './lifecycle.service';
import { TenantService } from '../kernel/tenancy/tenant.service';
import { Ctx } from '../kernel/context/request-context';
import { DAY } from '../common/dates';
import { env } from '../config/env';
import { LoginGuard } from '../kernel/auth/login-guard.service';

/** A real argon2id hash of random bytes, verified against when the account does not exist (equal timing). */
const DUMMY_HASH = argon2.hash(randomBytes(32), { type: argon2.argon2id });

/**
 * Company control plane (docs/03 §8). Sees tenants, plans, usage and money — never institution personal data
 * (only aggregate counts below).
 */
@Controller('control')
export class ControlController {
  constructor(
    private readonly db: DbService, private readonly tokens: TokenService, private readonly prov: ProvisioningService, private readonly billing: BillingService,
    private readonly finance: FinanceService, private readonly lifecycle: LifecycleService, private readonly tenants: TenantService, private readonly loginGuard: LoginGuard,
    private readonly audit: PlatformAudit,
  ) {}

  @Public() @Post('auth/login')
  async login(@Body(Z(z.object({ email: z.string().email(), password: z.string().max(200), totp: z.string().max(10).optional() }))) b: any, @Req() req: FastifyRequest) {
    const attempt = { scope: 'platform' as const, subject: b.email.toLowerCase(), ip: req.ip, userAgent: req.headers['user-agent'] };
    await this.loginGuard.before(attempt);
    const [u] = await this.db.admin.select().from(platformUser).where(eq(platformUser.email, attempt.subject)).limit(1);
    // argon2 runs even for unknown emails so response time does not reveal which accounts exist.
    const ok = await argon2.verify(u?.passwordHash ?? (await DUMMY_HASH), b.password).catch(() => false);
    if (!u || !u.isActive || !ok) {
      await this.loginGuard.failed(attempt, !u ? 'unknown_account' : !u.isActive ? 'inactive' : 'bad_password');
      throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
    }
    if (u.totpSecret) {
      if (!b.totp) throw new AppError('UNAUTHENTICATED', 'Two-factor code required', { totpRequired: true });
      if (!verifyTotp(decrypt(u.totpSecret), b.totp)) {
        await this.loginGuard.failed(attempt, 'bad_totp');
        throw new AppError('UNAUTHENTICATED', 'Invalid two-factor code', { totpRequired: true });
      }
    }
    await this.loginGuard.succeeded(attempt, u.id);
    const accessToken = await this.tokens.sign({ sub: u.id, sid: u.id, typ: 'platform', role: u.role }, 8 * 3600);
    return { accessToken, user: { id: u.id, name: u.name, email: u.email, role: u.role } };
  }

  @Platform() @Get('metrics')
  metrics() {
    return this.finance.metrics();
  }

  @Platform() @Get('tenants')
  async list(@Query('q') q?: string, @Query('status') status?: string) {
    const where = and(q ? or(ilike(tenant.name, `%${q}%`), ilike(tenant.slug, `%${q}%`), ilike(tenant.city, `%${q}%`)) : undefined, status ? eq(tenant.status, status as any) : undefined);
    return this.db.admin.select({ id: tenant.id, slug: tenant.slug, name: tenant.name, segment: tenant.segment, status: tenant.status, planCode: tenant.planCode, city: tenant.city, periodEndsAt: tenant.periodEndsAt, createdAt: tenant.createdAt })
      .from(tenant).where(where).orderBy(desc(tenant.createdAt)).limit(200);
  }

  /** Tenant 360 — metadata, usage and counts only. */
  @Platform() @Get('tenants/:id')
  async detail(@Param('id') id: string) {
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, id));
    if (!t) throw notFound('Tenant');
    const [counts] = await this.db.admin.execute(sql`select
      (select count(*)::int from students where tenant_id = ${id} and status = 'active') as students,
      (select count(*)::int from staff where tenant_id = ${id} and status = 'active') as staff,
      (select count(*)::int from vehicles where tenant_id = ${id}) as vehicles,
      (select count(*)::int from branches where tenant_id = ${id}) as branches,
      (select coalesce(sum(size),0)::bigint from files where tenant_id = ${id}) as storage_bytes`).then((r) => r.rows as any[]);
    const usage = await this.db.admin.select({ meter: usageRecord.meter, qty: sql<number>`sum(${usageRecord.qty})`, pricePaise: sql<number>`sum(${usageRecord.pricePaise})` })
      .from(usageRecord).where(and(eq(usageRecord.tenantId, id), sql`${usageRecord.occurredAt} > now() - interval '30 days'`)).groupBy(usageRecord.meter);
    return {
      tenant: ['super_admin', 'finance'].includes(Ctx.get().platformUser?.role ?? '') ? t : { ...t, billingPhone: t.billingPhone ? '••••' + t.billingPhone.slice(-3) : null, billingEmail: t.billingEmail ? '•••@' + t.billingEmail.split('@')[1] : null },
      counts,
      domains: await this.db.admin.select().from(tenantDomain).where(eq(tenantDomain.tenantId, id)),
      modules: await this.db.admin.select().from(tenantModule).where(eq(tenantModule.tenantId, id)),
      subscriptions: await this.db.admin.select().from(subscription).where(eq(subscription.tenantId, id)).orderBy(desc(subscription.createdAt)),
      invoices: await this.db.admin.select().from(invoice).where(eq(invoice.tenantId, id)).orderBy(desc(invoice.issuedAt)),
      wallet: await this.billing.walletSummary(id),
      usage30d: usage,
    };
  }

  /** Onboarding wizard on behalf of an institution. */
  @Platform('ops', 'account_manager') @Post('tenants')
  create(@Body(Z(Org.signupTenant)) b: any) {
    return this.prov.createTenant(b);
  }

  @Platform('ops', 'account_manager') @Patch('tenants/:id/modules')
  async toggleModule(@Param('id') id: string, @Body(Z(z.object({ moduleKey: z.enum(MODULE_KEYS), enabled: z.boolean() }))) b: any) {
    const [prev] = await this.db.admin.select().from(tenantModule).where(and(eq(tenantModule.tenantId, id), eq(tenantModule.moduleKey, b.moduleKey)));
    await this.db.admin.insert(tenantModule).values({ tenantId: id, moduleKey: b.moduleKey, enabled: b.enabled, source: 'manual' })
      .onConflictDoUpdate({ target: [tenantModule.tenantId, tenantModule.moduleKey], set: { enabled: b.enabled, source: 'manual' } });
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, id));
    await this.tenants.invalidate(t!);
    await this.audit.record({ action: b.enabled ? 'module.enable' : 'module.disable', entity: 'tenant_module', entityId: b.moduleKey, tenantId: id, before: { enabled: prev?.enabled ?? false }, after: { enabled: b.enabled } });
    return { ok: true };
  }

  @Platform('ops', 'account_manager') @Post('tenants/:id/extend')
  async extend(@Param('id') id: string, @Body(Z(z.object({ days: z.number().int().min(1).max(180), reason: z.string().min(3) }))) b: any) {
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, id));
    if (!t) throw notFound('Tenant');
    const base = t.periodEndsAt && t.periodEndsAt > new Date() ? t.periodEndsAt : new Date();
    const status = t.status === 'trial' ? 'trial' : 'active';
    await this.db.admin.update(tenant).set({ periodEndsAt: new Date(base.getTime() + b.days * DAY), status, graceEndsAt: null, suspendedAt: null, settings: sql`${tenant.settings} || ${JSON.stringify({ lastExtension: { days: b.days, reason: b.reason, by: Ctx.get().platformUser?.id } })}::jsonb` }).where(eq(tenant.id, id));
    await this.tenants.invalidate(t);
    await this.audit.record({ action: 'tenant.extend', entity: 'tenant', entityId: id, tenantId: id, before: { periodEndsAt: t.periodEndsAt, status: t.status }, after: { days: b.days, status }, reason: b.reason });
    return { ok: true };
  }

  /** Quote with exact price inside range (account manager); outside range only super_admin (docs/01 §3.5). */
  @Platform('account_manager', 'finance') @Post('tenants/:id/quote')
  async quote(@Param('id') id: string, @Body(Z(Billing.tenantQuoteInput.extend({ issue: z.enum(['none', 'proforma', 'tax']).default('none') }))) b: any) {
    const q = await this.billing.tenantQuote(id, b);
    if (b.issue === 'none') return q;
    return { quote: q, invoice: await this.billing.createInvoice(id, q, b.issue) };
  }

  /** Offline payment (NEFT/cheque) received for an invoice. */
  @Platform('finance') @Post('invoices/:id/mark-paid')
  async markPaid(@Param('id') id: string, @Body(Z(z.object({ reference: z.string().min(3) }))) b: any) {
    const [inv] = await this.db.admin.update(invoice).set({ status: 'paid', paidPaise: sql`${invoice.totalPaise}` }).where(eq(invoice.id, id)).returning();
    if (!inv) throw notFound('Invoice');
    await this.billing.activateFromInvoice(inv);
    return { ok: true, reference: b.reference };
  }

  @Platform('finance') @Post('tenants/:id/wallet-adjust')
  async walletAdjust(@Param('id') id: string, @Body(Z(z.object({ amountPaise: z.number().int(), reason: z.string().min(3) }))) b: any) {
    const r = await this.billing.walletAdjust(id, b.amountPaise, 'adjustment', b.reason);
    await this.audit.record({ action: 'wallet.adjust', entity: 'wallet', tenantId: id, after: { amountPaise: b.amountPaise }, reason: b.reason });
    return r;
  }

  @Platform() @Get('price-book')
  async priceBook() {
    return { plans: await this.db.admin.select().from(plan), items: await this.db.admin.select().from(priceBookItem) };
  }

  @Platform('super_admin') @Patch('price-book/:code')
  async updatePrice(@Param('code') code: string, @Body(Z(z.object({ listPaise: z.number().int().nonnegative(), minPaise: z.number().int().nonnegative().optional(), maxPaise: z.number().int().nonnegative().optional(), isActive: z.boolean().optional(), reason: z.string().trim().min(5) }))) body: any) {
    const { reason, ...b } = body;
    if (b.minPaise !== undefined && b.maxPaise !== undefined && b.minPaise > b.maxPaise) throw new AppError('VALIDATION_FAILED', 'Minimum price cannot exceed maximum price');
    const [beforeItem] = await this.db.admin.select().from(priceBookItem).where(eq(priceBookItem.code, code));
    const [beforePlan] = beforeItem ? [undefined] : await this.db.admin.select().from(plan).where(eq(plan.code, code));
    await this.audit.record({ action: 'price.update', entity: beforeItem ? 'price_book_item' : 'plan', entityId: code, before: beforeItem ? { listPaise: beforeItem.listPaise, minPaise: beforeItem.minPaise, maxPaise: beforeItem.maxPaise, isActive: beforeItem.isActive } : beforePlan ? { listPaise: beforePlan.pricePerUnitPaise, minPaise: beforePlan.rangeMinPaise, maxPaise: beforePlan.rangeMaxPaise } : null, after: b, reason });
    const [r] = await this.db.admin.update(priceBookItem).set({ ...b, effectiveFrom: new Date() }).where(eq(priceBookItem.code, code)).returning();
    if (!r) {
      const [p] = await this.db.admin.update(plan).set({ pricePerUnitPaise: b.listPaise, rangeMinPaise: b.minPaise, rangeMaxPaise: b.maxPaise }).where(eq(plan.code, code)).returning();
      if (!p) throw notFound('Price');
    }
    await this.billing.bustBook();
    return { ok: true };
  }

  @Platform('finance') @Get('finance/report')
  report(@Query('month') month?: string) {
    return this.finance.report(month ?? new Date().toISOString().slice(0, 7));
  }

  @Platform('finance') @Post('expenses')
  async addExpense(@Body(Z(Billing.expenseInput.extend({ override: z.string().optional() }))) b: any) {
    if (b.recurring) {
      const chk = await this.finance.canSpend(b.month, b.amountPaise);
      if (!chk.ok && !(b.override && Ctx.get().platformUser?.role === 'super_admin')) {
        throw new AppError('FORBIDDEN', `Spend ceiling reached: this would take monthly expenses to ₹${chk.afterPaise / 100} against a cap of ₹${chk.capPaise / 100} (60% rule). A super admin can override with a reason.`, chk);
      }
    }
    const [r] = await this.db.admin.insert(companyExpense).values({ month: b.month, category: b.category, vendor: b.vendor, amountPaise: b.amountPaise, gstPaise: b.gstPaise, recurring: b.recurring, note: b.override ? `${b.note ?? ''} [override: ${b.override}]` : b.note }).returning();
    return r;
  }

  @Platform() @Get('expenses')
  expenses(@Query('month') month: string) {
    return this.finance.expenses(month);
  }

  @Platform() @Post('lifecycle/run')
  runLifecycle() {
    return this.lifecycle.run();
  }

  @Platform() @Get('leads')
  leads() {
    return this.db.admin.select().from(platformLead).orderBy(desc(platformLead.createdAt)).limit(500);
  }

  // ---- White-label app flavours (docs/02 §11) ----
  @Platform('ops') @Post('tenants/:id/flavour')
  async upsertFlavour(@Param('id') id: string, @Body(Z(z.object({
    appName: z.string().min(2).max(30), androidPackage: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/), iosBundleId: z.string().optional(),
    sha256: z.array(z.string().regex(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)).default([]), colors: z.record(z.string(), z.string()).default({}), assets: z.record(z.string(), z.string()).default({}),
  }))) b: any) {
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, id));
    if (!t) throw notFound('Tenant');
    const [r] = await this.db.admin.insert(appFlavour).values({ tenantId: id, slug: t.slug, ...b })
      .onConflictDoUpdate({ target: appFlavour.tenantId, set: { ...b, updatedAt: new Date() } }).returning();
    return r;
  }

  /** flavour.json consumed by frontend/mobile/app.config.ts (`pnpm flavour:pull <slug>`). */
  @Platform() @Get('flavours/:slug/config')
  async flavourConfig(@Param('slug') slug: string) {
    const [f] = await this.db.admin.select().from(appFlavour).where(eq(appFlavour.slug, slug));
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.slug, slug));
    if (!f || !t) throw notFound('Flavour');
    return {
      slug, name: f.appName, tenantSlug: slug,
      android: { package: f.androidPackage, sha256: f.sha256 }, ios: { bundleIdentifier: f.iosBundleId ?? f.androidPackage },
      colors: { primary: (t.branding as any)?.primaryColor ?? '#1E40AF', accent: (t.branding as any)?.accentColor ?? '#F59E0B', ...(f.colors as any) },
      apiBaseUrl: env.API_URL, websiteHost: `${slug}.${env.APP_BASE_DOMAIN}`, assets: f.assets,
    };
  }
}
