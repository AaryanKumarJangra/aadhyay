import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { and, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { Org, Billing } from '@aadhyay/contracts';
import { DbService } from '../db/db.service';
import { tenant, platformLead } from '../db/schema';
import { Public } from '../kernel/auth/decorators';
import { Z } from '../common/zod.pipe';
import { ProvisioningService } from './provisioning.service';
import { BillingService } from './billing.service';
import { AuthService } from '../kernel/auth/auth.service';
import { RedisService } from '../kernel/redis/redis.service';
import { AppError, notFound } from '../common/errors';
import { z } from 'zod';

@Controller('public')
export class PublicController {
  constructor(private readonly db: DbService, private readonly prov: ProvisioningService, private readonly billing: BillingService, private readonly auth: AuthService, private readonly redis: RedisService) {}

  /** Self-serve 90-day trial. Owner logs in with OTP afterwards (same phone). */
  @Public() @Post('signup')
  async signup(@Body(Z(Org.signupTenant)) b: any, @Req() req: FastifyRequest) {
    if (!(await this.redis.rateLimit(`signup:${req.ip}`, 5, 3600))) throw new AppError('RATE_LIMITED', 'Too many signups from this network');
    const r = await this.prov.createTenant(b);
    return { tenantId: r.tenant.id, slug: r.tenant.slug, websiteUrl: r.websiteUrl, trialEndsAt: r.tenant.trialEndsAt, next: 'Log in with OTP on the owner phone number' };
  }

  /** Institution picker for the common app (search by name / city / slug). */
  @Public() @Get('tenants')
  async search(@Query('q') q = '') {
    const term = q.trim();
    if (term.length < 2) return { items: [] };
    const rows = await this.db.admin
      .select({ id: tenant.id, slug: tenant.slug, name: tenant.name, city: tenant.city, segment: tenant.segment, branding: tenant.branding })
      .from(tenant)
      .where(and(inArray(tenant.status, ['trial', 'active', 'grace']), or(ilike(tenant.name, `%${term}%`), ilike(tenant.city, `%${term}%`), eq(tenant.slug, term.toLowerCase()))))
      .orderBy(sql`similarity(${tenant.name}, ${term}) desc`)
      .limit(20);
    return { items: rows.map((r) => ({ ...r, logoFileId: (r.branding as any)?.logoFileId ?? null, primaryColor: (r.branding as any)?.primaryColor ?? null, branding: undefined })) };
  }

  @Public() @Get('tenants/:slug/branding')
  async branding(@Param('slug') slug: string) {
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.slug, slug)).limit(1);
    if (!t || t.status === 'purged') throw notFound('Institution');
    return { id: t.id, slug: t.slug, name: t.name, segment: t.segment, city: t.city, branding: t.branding, status: t.status === 'suspended' || t.status === 'archived' ? 'unavailable' : 'ok' };
  }

  /** Plans + price book for the pricing page / calculator on aadhyay.com. */
  @Public() @Get('pricing')
  async pricing() {
    const { plans, items } = await this.billing.book();
    return { currency: 'INR', gstRate: 0.18, plans, items: items.map(({ minPaise, maxPaise, ...i }) => i) };
  }

  @Public() @Post('quote')
  quote(@Body(Z(Billing.quoteInput)) b: any) {
    return this.billing.quote({ ...b, unitPricePaise: undefined });
  }

  /** "Book a demo" leads for Aadhyay's own sales. */
  @Public() @Post('demo-request')
  async demo(@Body(Z(z.object({ name: z.string().min(2), phone: z.string().min(10), email: z.string().email().optional(), institution: z.string().optional(), city: z.string().optional(), students: z.number().int().optional() }))) b: any, @Req() req: FastifyRequest) {
    if (!(await this.redis.rateLimit(`demo:${req.ip}`, 10, 3600))) throw new AppError('RATE_LIMITED', 'Too many requests');
    await this.db.admin.insert(platformLead).values({ ...b, source: 'website' });
    return { ok: true };
  }
}
