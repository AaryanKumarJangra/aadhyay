import { Body, Controller, Get, Injectable, Param, Post, Query } from '@nestjs/common';
import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CORE_MODULES, MODULE_KEYS, Org, ROLE_TEMPLATES } from '@aadhyay/contracts';
import { DbService } from '../db/db.service';
import { branch, membership, platformAuditLog, platformUser, role, roleAssignment, tenant, tenantDomain, tenantModule } from '../db/schema';
import { Platform } from '../kernel/auth/decorators';
import { Ctx } from '../kernel/context/request-context';
import { TenantService } from '../kernel/tenancy/tenant.service';
import { AccessService } from '../kernel/rbac/access.service';
import { AuthService } from '../kernel/auth/auth.service';
import { RedisService } from '../kernel/redis/redis.service';
import { Z } from '../common/zod.pipe';
import { AppError, badRequest, conflict, notFound } from '../common/errors';
import { randomToken } from '../common/crypto';
import { ProvisioningService } from './provisioning.service';
import { env } from '../config/env';

/** Records a control-plane action (who, what, which tenant, before/after, why). */
@Injectable()
export class PlatformAudit {
  constructor(private readonly db: DbService) {}
  async record(a: { action: string; entity: string; entityId?: string | null; tenantId?: string | null; before?: unknown; after?: unknown; reason?: string | null }) {
    const c = Ctx.maybe();
    await this.db.admin.insert(platformAuditLog).values({
      actorId: c?.platformUser?.id ?? null, actorRole: c?.platformUser?.role ?? null, action: a.action, targetTenant: a.tenantId ?? null,
      entity: a.entity, entityId: a.entityId ?? null, before: a.before ?? null, after: a.after ?? null, reason: a.reason ?? null, ip: c?.ip ?? null,
    });
  }
}

const rows = async <T>(db: DbService, q: ReturnType<typeof sql>) => (await db.admin.execute(q)).rows as T[];
const n = (v: unknown) => Number(v ?? 0);

/**
 * Control plane v2 (docs/redesign/06-CONTROL-PLANE.md): platform analytics, Tenant 360 lifecycle actions,
 * the onboarding wizard and the platform audit trail. Platform data only — never tenant personal data.
 */
@Controller('control')
export class PlatformController {
  constructor(
    private readonly db: DbService, private readonly audit: PlatformAudit, private readonly tenants: TenantService,
    private readonly prov: ProvisioningService, private readonly auth: AuthService, private readonly access: AccessService, private readonly redis: RedisService,
  ) {}

  @Platform() @Get('me')
  async me() {
    const p = Ctx.get().platformUser!;
    const [u] = await this.db.admin.select({ id: platformUser.id, name: platformUser.name, email: platformUser.email, role: platformUser.role }).from(platformUser).where(eq(platformUser.id, p.id));
    return u ?? { id: p.id, role: p.role, name: 'Platform user', email: null };
  }

  @Platform() @Get('dashboard')
  async dashboard() {
    const db = this.db;
    const [k] = await rows<Record<string, unknown>>(db, sql`select
      (select count(*) from tenants where status <> 'purged')::int as total,
      (select count(*) from tenants where status = 'active')::int as active,
      (select count(*) from tenants where status = 'trial')::int as trial,
      (select count(*) from tenants where status = 'grace')::int as grace,
      (select count(*) from tenants where status in ('suspended','archived'))::int as suspended,
      (select count(*) from tenants where created_at >= date_trunc('month', now()))::int as new_month,
      (select count(*) from tenants where created_at >= date_trunc('month', now()) - interval '1 month' and created_at < date_trunc('month', now()))::int as new_prev,
      (select count(*) from tenants where suspended_at > now() - interval '90 days')::int as churned_90,
      (select count(*) from tenants where created_at < now() - interval '90 days')::int as cohort,
      (select count(*) from tenants where created_at < now() - interval '90 days' and status = 'active')::int as converted,
      (select coalesce(sum(total_paise - paid_paise),0) from invoices where status in ('issued','partially_paid'))::bigint as outstanding,
      (select count(*) from invoices where status in ('issued','partially_paid') and due_at < now())::int as overdue_invoices,
      (select coalesce(sum(balance_paise),0) from wallets)::bigint as wallet,
      (select count(*) from outbox_events where status = 'pending')::int as outbox_pending,
      (select count(*) from outbox_events where status = 'failed')::int as outbox_failed`);
    const subs = await rows<{ cycle: string; unit: number; qty: number }>(db, sql`select cycle::text, unit_price_paise as unit, quantity as qty from subscriptions where status = 'active'`);
    const mrr = subs.reduce((s, x) => s + (x.cycle === 'yearly' ? Math.round((n(x.unit) * 10) / 12) : n(x.unit)), 0);
    const monthly = await rows<{ mon: string; tenants: number; revenue: number }>(db, sql`
      with m as (select generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month')::date as mon)
      select to_char(m.mon, 'YYYY-MM') as mon,
        (select count(*) from tenants t where date_trunc('month', t.created_at)::date = m.mon)::int as tenants,
        (select coalesce(sum(i.subtotal_paise),0) from invoices i where i.status = 'paid' and date_trunc('month', i.issued_at)::date = m.mon)::bigint as revenue
      from m order by m.mon`);
    const dist = (col: string) => rows<{ k: string; n: number }>(db, sql`select coalesce(${sql.raw(col)}::text, 'unknown') as k, count(*)::int as n from tenants where status <> 'purged' group by 1 order by 2 desc`);
    const [byPlan, bySegment, byState] = await Promise.all([dist('plan_code'), dist('segment'), dist('state')]);
    const modules = await rows<{ k: string; n: number }>(db, sql`select module_key as k, count(*)::int as n from tenant_modules where enabled group by 1 order by 2 desc limit 14`);
    const usage = await rows<{ meter: string; qty: number; price: number; cost: number }>(db, sql`select meter, sum(qty)::float as qty, sum(price_paise)::bigint as price, sum(cost_paise)::bigint as cost from usage_records where occurred_at > now() - interval '30 days' group by meter order by 3 desc`);
    const recent = await rows<any>(db, sql`select id, name, slug, segment, status::text, plan_code, city, created_at from tenants order by created_at desc limit 8`);
    const expiring = await rows<any>(db, sql`select id, name, status::text, period_ends_at from tenants where status in ('trial','active') and period_ends_at between now() and now() + interval '15 days' order by period_ends_at limit 8`);
    const overdue = await rows<any>(db, sql`select i.id, i.number, i.total_paise - i.paid_paise as due, i.due_at, t.name, t.id as tenant_id from invoices i join tenants t on t.id = i.tenant_id where i.status in ('issued','partially_paid') and i.due_at < now() order by i.due_at limit 8`);
    const heavy = await rows<any>(db, sql`select t.id, t.name, sum(u.price_paise)::bigint as price, sum(u.cost_paise)::bigint as cost from usage_records u join tenants t on t.id = u.tenant_id where u.occurred_at > now() - interval '30 days' group by t.id order by 3 desc limit 6`);
    const redisOk = await this.redis.client.ping().then((x) => x === 'PONG').catch(() => false);
    return {
      kpis: {
        total: n(k!.total), active: n(k!.active), trial: n(k!.trial), grace: n(k!.grace), suspended: n(k!.suspended), newThisMonth: n(k!.new_month), newPrevMonth: n(k!.new_prev),
        churned90: n(k!.churned_90), trialConversionPct: n(k!.cohort) ? Math.round((n(k!.converted) / n(k!.cohort)) * 1000) / 10 : null,
        mrrPaise: mrr, arrPaise: mrr * 12, arpuPaise: n(k!.active) ? Math.round(mrr / n(k!.active)) : null,
        outstandingPaise: n(k!.outstanding), overdueInvoices: n(k!.overdue_invoices), walletPaise: n(k!.wallet),
      },
      health: { database: true, redis: redisOk, outboxPending: n(k!.outbox_pending), outboxFailed: n(k!.outbox_failed) },
      monthly: monthly.map((m) => ({ month: m.mon, newTenants: n(m.tenants), revenuePaise: n(m.revenue) })),
      byPlan: byPlan.map((x) => ({ key: x.k, count: x.n })), bySegment: bySegment.map((x) => ({ key: x.k, count: x.n })), byState: byState.map((x) => ({ key: x.k, count: x.n })),
      moduleAdoption: modules.map((x) => ({ key: x.k, count: x.n })),
      usage30d: usage.map((u) => ({ meter: u.meter, qty: n(u.qty), pricePaise: n(u.price), costPaise: n(u.cost) })),
      recent: recent.map((r) => ({ id: r.id, name: r.name, slug: r.slug, segment: r.segment, status: r.status, planCode: r.plan_code, city: r.city, createdAt: r.created_at })),
      expiring: expiring.map((r) => ({ id: r.id, name: r.name, status: r.status, periodEndsAt: r.period_ends_at })),
      overdueInvoices: overdue.map((r) => ({ id: r.id, number: r.number, duePaise: n(r.due), dueAt: r.due_at, tenant: r.name, tenantId: r.tenant_id })),
      highUsage: heavy.map((r) => ({ id: r.id, name: r.name, pricePaise: n(r.price), costPaise: n(r.cost) })),
    };
  }

  /** Lifecycle actions from Tenant 360. Every change carries a reason and lands in the platform audit log. */
  @Platform('ops', 'account_manager') @Post('tenants/:id/status')
  async setStatus(@Param('id') id: string, @Body(Z(z.object({ action: z.enum(['suspend', 'activate', 'archive']), reason: z.string().trim().min(5) }))) b: { action: 'suspend' | 'activate' | 'archive'; reason: string }) {
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, id));
    if (!t) throw notFound('Institution');
    const allowed: Record<string, string[]> = { suspend: ['trial', 'active', 'grace'], activate: ['grace', 'suspended', 'archived'], archive: ['suspended'] };
    if (!allowed[b.action]!.includes(t.status)) throw conflict(`Cannot ${b.action} an institution that is ${t.status}.`);
    if (b.action === 'archive' && Ctx.get().platformUser?.role !== 'super_admin') throw new AppError('FORBIDDEN', 'Only a super admin can archive an institution.');
    const now = new Date();
    const patch = b.action === 'suspend' ? { status: 'suspended' as const, suspendedAt: now }
      : b.action === 'archive' ? { status: 'archived' as const, archivedAt: now }
      : { status: 'active' as const, suspendedAt: null, archivedAt: null, graceEndsAt: null, periodEndsAt: t.periodEndsAt && t.periodEndsAt > now ? t.periodEndsAt : new Date(now.getTime() + 15 * 86_400_000) };
    await this.db.admin.update(tenant).set(patch).where(eq(tenant.id, id));
    await this.tenants.invalidate(t);
    await this.audit.record({ action: `tenant.${b.action}`, entity: 'tenant', entityId: id, tenantId: id, before: { status: t.status }, after: { status: patch.status }, reason: b.reason });
    return { ok: true, status: patch.status };
  }

  @Platform() @Get('audit')
  auditLog(@Query('tenantId') tenantId?: string) {
    return this.db.admin.select().from(platformAuditLog).where(tenantId ? eq(platformAuditLog.targetTenant, tenantId) : undefined).orderBy(desc(platformAuditLog.at)).limit(200);
  }

  /**
   * Onboarding wizard (brief §7): provisions the tenant (roles, session, website, pipeline, ledger…), then applies the
   * wizard's plan, modules, branches, branding, domain and admins in one audited step.
   */
  @Platform('ops', 'account_manager') @Post('onboarding')
  async onboard(@Body(Z(Org.onboardingInput)) b: z.infer<typeof Org.onboardingInput>) {
    const unknown = b.modules.filter((m) => !(MODULE_KEYS as readonly string[]).includes(m));
    if (unknown.length) throw badRequest(`Unknown modules: ${unknown.join(', ')}`);
    if (b.customDomain) {
      const [taken] = await this.db.admin.select({ id: tenantDomain.id }).from(tenantDomain).where(eq(tenantDomain.host, b.customDomain.toLowerCase()));
      if (taken) throw conflict('That custom domain is already connected to another institution.');
    }
    const res = await this.prov.createTenant({
      institutionName: b.institutionName, segment: b.segment, slug: b.slug, city: b.city, state: b.state, stateCode: b.stateCode,
      ownerName: b.owner.name, ownerPhone: b.owner.phone, ownerEmail: b.owner.email, approxStudents: b.approxStudents,
    });
    const tid = res.tenant.id;
    const brandingPatch = { primaryColor: b.branding.primaryColor, accentColor: b.branding.accentColor, tagline: b.branding.tagline, shortName: b.shortName, legalName: b.legalName, phone: b.phone, email: b.email, address: b.address, websiteTemplate: b.website.template };
    await this.db.admin.update(tenant).set({
      planCode: b.planCode, timezone: b.timezone, billingEmail: b.email ?? res.tenant.billingEmail,
      branding: sql`${tenant.branding} || ${JSON.stringify(brandingPatch)}::jsonb`,
      settings: sql`${tenant.settings} || ${JSON.stringify({ code: b.code ?? null, billingCycle: b.cycle, websiteEnabled: b.website.enabled, onboardedBy: Ctx.get().platformUser?.id })}::jsonb`,
    }).where(eq(tenant.id, tid));

    const wanted = new Set([...b.modules, ...CORE_MODULES]);
    await this.db.admin.update(tenantModule).set({ enabled: false, source: 'onboarding' }).where(and(eq(tenantModule.tenantId, tid), notInArray(tenantModule.moduleKey, [...wanted])));
    for (const m of wanted) {
      await this.db.admin.insert(tenantModule).values({ tenantId: tid, moduleKey: m, enabled: true, source: 'onboarding' })
        .onConflictDoUpdate({ target: [tenantModule.tenantId, tenantModule.moduleKey], set: { enabled: true, source: 'onboarding' } });
    }
    if (b.address || b.phone) await this.db.admin.update(branch).set({ address: b.address, phone: b.phone }).where(and(eq(branch.tenantId, tid), eq(branch.isMain, true)));
    for (const br of b.branches) await this.db.admin.insert(branch).values({ tenantId: tid, name: br.name, code: br.code, address: br.address, city: br.city ?? b.city, phone: br.phone, isMain: false });

    let domain: { host: string; instructions: { type: string; name: string; value: string }[] } | null = null;
    if (b.customDomain) {
      const host = b.customDomain.toLowerCase();
      const token = `aadhyay-verify=${randomToken(12)}`;
      await this.db.admin.insert(tenantDomain).values({ tenantId: tid, host, kind: 'custom', verifyToken: token });
      domain = { host, instructions: [{ type: 'TXT', name: `_aadhyay.${host}`, value: token }, { type: 'CNAME', name: host, value: `sites.${env.APP_BASE_DOMAIN}` }] };
    }
    if (b.principal) {
      const u = await this.auth.ensureUser(b.principal.phone, b.principal.name);
      const [m] = await this.db.admin.insert(membership).values({ tenantId: tid, userId: u.id, kind: 'staff' })
        .onConflictDoUpdate({ target: [membership.tenantId, membership.userId, membership.kind], set: { status: 'active' } }).returning();
      const [r] = await this.db.admin.select({ id: role.id }).from(role).where(and(eq(role.tenantId, tid), eq(role.key, 'principal')));
      if (r && ROLE_TEMPLATES.principal) await this.db.admin.insert(roleAssignment).values({ tenantId: tid, membershipId: m!.id, roleId: r.id });
    }
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, tid));
    await this.tenants.invalidate(t!);
    await this.access.bust(tid);
    await this.audit.record({ action: 'tenant.onboard', entity: 'tenant', entityId: tid, tenantId: tid, after: { ...b, owner: { name: b.owner.name }, principal: b.principal ? { name: b.principal.name } : undefined } });
    return { tenantId: tid, slug: t!.slug, websiteUrl: res.websiteUrl, consoleUrl: `https://app.${env.APP_BASE_DOMAIN}`, domain };
  }

  /** Enabled modules for a tenant, for the Tenant 360 module switches. */
  @Platform() @Get('tenants/:id/modules')
  async modules(@Param('id') id: string) {
    const rowsM = await this.db.admin.select().from(tenantModule).where(eq(tenantModule.tenantId, id));
    return MODULE_KEYS.map((k) => ({ key: k, core: (CORE_MODULES as string[]).includes(k), enabled: (CORE_MODULES as string[]).includes(k) || !!rowsM.find((r) => r.moduleKey === k && r.enabled), source: rowsM.find((r) => r.moduleKey === k)?.source ?? null }));
  }

  /** Platform staff list of tenants with counts, for the Institutions table. */
  @Platform() @Get('tenants-overview')
  async overview() {
    const r = await rows<any>(this.db, sql`select t.id, t.name, t.slug, t.segment, t.status::text, t.plan_code, t.city, t.state, t.period_ends_at, t.created_at,
      (select count(*) from students s where s.tenant_id = t.id and s.status = 'active')::int as students,
      (select coalesce(sum(i.total_paise - i.paid_paise),0) from invoices i where i.tenant_id = t.id and i.status in ('issued','partially_paid'))::bigint as due,
      (select max(u.last_active_at) from users u join memberships m on m.user_id = u.id where m.tenant_id = t.id) as last_active
      from tenants t where t.status <> 'purged' order by t.created_at desc limit 500`);
    return r.map((x) => ({ id: x.id, name: x.name, slug: x.slug, segment: x.segment, status: x.status, planCode: x.plan_code, city: x.city, state: x.state, periodEndsAt: x.period_ends_at, createdAt: x.created_at, students: n(x.students), duePaise: n(x.due), lastActiveAt: x.last_active }));
  }
}

