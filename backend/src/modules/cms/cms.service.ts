import { Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';
import { resolveTxt } from 'node:dns/promises';
import { DbService } from '../../db/db.service';
import { sitePage, sitePost, siteMenu, siteRedirect, siteForm, formSubmission, notice, calendarEvent, tenant, tenantDomain, course, file } from '../../db/schema';
import { StorageAdapter } from '../../adapters/storage/storage.adapter';
import { Ctx } from '../../kernel/context/request-context';
import { EventsService, OnEvent } from '../../kernel/events/events.service';
import { CrmService } from '../crm/crm.service';
import { TenantService } from '../../kernel/tenancy/tenant.service';
import { RedisService } from '../../kernel/redis/redis.service';
import { AppError, badRequest, conflict, notFound } from '../../common/errors';
import { randomToken } from '../../common/crypto';
import { phoneIN, type DomainEvent } from '@aadhyay/contracts';
import { env } from '../../config/env';

const SCHEMA_TYPE: Record<string, string> = { school: 'School', college: 'CollegeOrUniversity', institute: 'EducationalOrganization', coaching: 'EducationalOrganization', creator: 'EducationalOrganization' };

/** Website CMS + public site API + SEO data + custom domains (docs/02 §10). */
@Injectable()
export class CmsService {
  private readonly log = new Logger('CMS');
  constructor(private readonly db: DbService, private readonly events: EventsService, private readonly crm: CrmService, private readonly tenants: TenantService, private readonly redis: RedisService, private readonly storage: StorageAdapter) {}

  // ---------------- Admin ----------------
  async savePage(b: any, id?: string) {
    return this.db.t(async (tx) => {
      if (!id) {
        const [p] = await tx.insert(sitePage).values({ ...b, tenantId: Ctx.tenantId(), publishAt: b.publishAt ? new Date(b.publishAt) : b.status === 'published' ? new Date() : null, updatedBy: Ctx.userId() }).returning();
        if (p!.status === 'published') await this.events.emit('cms.page_published', { pageId: p!.id, slug: p!.slug });
        return p;
      }
      const [cur] = await tx.select().from(sitePage).where(eq(sitePage.id, id));
      if (!cur) throw notFound('Page');
      const history = [{ version: cur.version, title: cur.title, blocks: cur.blocks, seo: cur.seo, at: cur.updatedAt, by: cur.updatedBy }, ...((cur.history as any[]) ?? [])].slice(0, 20);
      const [p] = await tx.update(sitePage).set({ ...b, version: cur.version + 1, history, updatedBy: Ctx.userId(), publishAt: b.publishAt ? new Date(b.publishAt) : b.status === 'published' && !cur.publishAt ? new Date() : undefined }).where(eq(sitePage.id, id)).returning();
      if (p!.status === 'published') await this.events.emit('cms.page_published', { pageId: p!.id, slug: p!.slug });
      return p;
    });
  }
  async rollback(id: string, version: number) {
    const [cur] = await this.db.t((tx) => tx.select().from(sitePage).where(eq(sitePage.id, id)));
    const v = ((cur?.history as any[]) ?? []).find((h) => h.version === version);
    if (!v) throw notFound('Version');
    return this.savePage({ title: v.title, blocks: v.blocks, seo: v.seo }, id);
  }

  // ---------------- Builder workflow (docs/redesign/07-CMS.md) ----------------
  /** Everything the builder needs: live page, working draft (or the live content), review state, version list. */
  async editorPage(id: string) {
    const [p] = await this.db.t((tx) => tx.select().from(sitePage).where(eq(sitePage.id, id)));
    if (!p) throw notFound('Page');
    const working = p.draft ?? { title: p.title, blocks: p.blocks as any[], seo: p.seo, updatedAt: p.updatedAt.toISOString(), updatedBy: p.updatedBy };
    return {
      id: p.id, slug: p.slug, locale: p.locale, status: p.status, version: p.version, publishAt: p.publishAt, updatedAt: p.updatedAt,
      live: { title: p.title, blocks: p.blocks, seo: p.seo }, working, hasDraft: !!p.draft,
      review: { status: p.reviewStatus, note: p.reviewNote, submittedBy: p.submittedBy, submittedAt: p.submittedAt },
      versions: [{ version: p.version, at: p.updatedAt, by: p.updatedBy, live: true }, ...((p.history as any[]) ?? []).map((h) => ({ version: h.version, at: h.at, by: h.by, live: false }))],
    };
  }

  /** Save the working copy. The public page is untouched until someone with publish permission publishes. */
  async saveDraft(id: string, d: { title: string; blocks: any[]; seo: any; slug?: string }) {
    return this.db.t(async (tx) => {
      const [p] = await tx.select({ id: sitePage.id, slug: sitePage.slug }).from(sitePage).where(eq(sitePage.id, id));
      if (!p) throw notFound('Page');
      if (d.slug !== undefined && d.slug !== p.slug) {
        const [clash] = await tx.select({ id: sitePage.id }).from(sitePage).where(and(eq(sitePage.slug, d.slug), sql`${sitePage.id} <> ${id}`));
        if (clash) throw conflict('Another page already uses that address');
        await tx.update(sitePage).set({ slug: d.slug }).where(eq(sitePage.id, id));
      }
      const draft = { title: d.title, blocks: d.blocks, seo: d.seo ?? {}, updatedAt: new Date().toISOString(), updatedBy: Ctx.userId() ?? null };
      await tx.update(sitePage).set({ draft, reviewStatus: sql`case when ${sitePage.reviewStatus} = 'changes_requested' then 'changes_requested' else ${sitePage.reviewStatus} end` }).where(eq(sitePage.id, id));
      return { savedAt: draft.updatedAt };
    });
  }

  async discardDraft(id: string) {
    const r = await this.db.t((tx) => tx.update(sitePage).set({ draft: null, reviewStatus: 'none', reviewNote: null }).where(eq(sitePage.id, id)).returning({ id: sitePage.id }));
    if (!r.length) throw notFound('Page');
    return { ok: true };
  }

  async submitForReview(id: string, note?: string) {
    const r = await this.db.t((tx) => tx.update(sitePage).set({ reviewStatus: 'in_review', reviewNote: note ?? null, submittedBy: Ctx.userId() ?? null, submittedAt: new Date() }).where(and(eq(sitePage.id, id), isNotNull(sitePage.draft))).returning({ id: sitePage.id }));
    if (!r.length) throw badRequest('There are no unpublished changes to review');
    return { ok: true };
  }

  async requestChanges(id: string, note: string) {
    const r = await this.db.t((tx) => tx.update(sitePage).set({ reviewStatus: 'changes_requested', reviewNote: note }).where(eq(sitePage.id, id)).returning({ id: sitePage.id }));
    if (!r.length) throw notFound('Page');
    return { ok: true };
  }

  /** Publish the working copy (now or at a time). Previous live content goes into version history. */
  async publishDraft(id: string, publishAt?: string) {
    const [p] = await this.db.t((tx) => tx.select().from(sitePage).where(eq(sitePage.id, id)));
    if (!p) throw notFound('Page');
    const d = p.draft ?? { title: p.title, blocks: p.blocks as any[], seo: p.seo };
    const when = publishAt ? new Date(publishAt) : null;
    if (when && when.getTime() < Date.now() - 60_000) throw badRequest('Scheduled time is in the past');
    const out = await this.savePage({ title: d.title, blocks: d.blocks, seo: d.seo, status: when ? 'scheduled' : 'published', publishAt: when ? when.toISOString() : new Date().toISOString() }, id);
    await this.db.t((tx) => tx.update(sitePage).set({ draft: null, reviewStatus: 'none', reviewNote: null, submittedAt: null, submittedBy: null }).where(eq(sitePage.id, id)));
    await this.redis.client.del(`site:${Ctx.tenantId()}`);
    return out;
  }

  /** Copy an old version into the working draft (nothing goes live until published). */
  async restoreToDraft(id: string, version: number) {
    const [p] = await this.db.t((tx) => tx.select().from(sitePage).where(eq(sitePage.id, id)));
    if (!p) throw notFound('Page');
    const v = version === p.version ? { title: p.title, blocks: p.blocks, seo: p.seo } : ((p.history as any[]) ?? []).find((h) => h.version === version);
    if (!v) throw notFound('Version');
    return this.saveDraft(id, { title: v.title, blocks: v.blocks as any[], seo: v.seo });
  }

  // ---------------- Media library ----------------
  /** Website media with usage counts (pages live + drafts, posts, branding), newest first. */
  async media(q?: string) {
    const tid = Ctx.tenantId();
    const rows = await this.db.admin.execute(sql`
      select f.id, f.mime, f.size, f.meta, f.created_at,
        ((select count(*) from site_pages p where p.tenant_id = ${tid} and (p.blocks::text like '%' || f.id::text || '%' or coalesce(p.draft::text, '') like '%' || f.id::text || '%' or p.seo::text like '%' || f.id::text || '%'))
         + (select count(*) from site_posts s where s.tenant_id = ${tid} and (s.cover_file_id::text = f.id::text or f.id::text = any(s.images::text[])))
         + (select count(*) from tenants t where t.id = ${tid} and t.branding::text like '%' || f.id::text || '%'))::int as used
      from files f where f.tenant_id = ${tid} and f.purpose in ('website', 'logo')
        ${q ? sql`and (f.meta->>'name' ilike ${'%' + q + '%'} or f.meta->>'alt' ilike ${'%' + q + '%'})` : sql``}
      order by f.created_at desc limit 500`);
    return (rows.rows as any[]).map((r) => ({ id: r.id, mime: r.mime, size: Number(r.size), meta: r.meta ?? {}, createdAt: r.created_at, usedOn: r.used, url: `${env.API_URL}/v1/files/public/${r.id}` }));
  }
  async updateMedia(id: string, meta: Record<string, unknown>) {
    const r = await this.db.admin.update(file).set({ meta: sql`${file.meta} || ${JSON.stringify(meta)}::jsonb` }).where(and(eq(file.id, id), eq(file.tenantId, Ctx.tenantId()))).returning({ id: file.id, meta: file.meta });
    if (!r.length) throw notFound('File');
    return r[0];
  }
  /** Refuses to delete media that is still used somewhere (brief §47). */
  async deleteMedia(id: string) {
    const item = (await this.media()).find((m) => m.id === id);
    if (!item) throw notFound('File');
    if (item.usedOn > 0) throw conflict(`This file is used in ${item.usedOn} place${item.usedOn === 1 ? '' : 's'}. Remove it from those pages first.`);
    const [f] = await this.db.admin.delete(file).where(and(eq(file.id, id), eq(file.tenantId, Ctx.tenantId()))).returning();
    if (f) await this.storage.delete(f.key).catch((e) => this.log.warn(`storage delete failed ${e.message}`));
    return { ok: true };
  }

  /** Revalidate Next.js ISR cache for the tenant site on publish. */
  @OnEvent('cms.page_published')
  async revalidate(e: DomainEvent<{ slug: string }>) {
    const t = await this.tenants.byIdOrSlug(e.tenantId!);
    if (!t || !process.env.REVALIDATE_SECRET) return;
    await fetch(`${env.WEB_URL}/api/revalidate`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': process.env.REVALIDATE_SECRET }, body: JSON.stringify({ tag: `site:${t.slug}` }) }).catch((err) => this.log.warn(`revalidate failed ${err.message}`));
  }

  // ---------------- Public site (tenant resolved from host / X-Tenant) ----------------
  async site() {
    const tid = Ctx.tenantId();
    const ck = `site:${tid}`;
    const cached = await this.redis.getJson<any>(ck);
    if (cached) return cached;
    const [t] = await this.db.admin.select().from(tenant).where(eq(tenant.id, tid));
    const menus = await this.db.t((tx) => tx.select().from(siteMenu));
    const domains = await this.db.admin.select().from(tenantDomain).where(eq(tenantDomain.tenantId, tid));
    const primary = domains.find((d) => d.kind === 'custom' && d.verifiedAt && d.isPrimary) ?? domains.find((d) => d.isPrimary) ?? domains[0];
    const b = (t!.branding ?? {}) as any;
    const out = {
      tenant: { id: t!.id, slug: t!.slug, name: t!.name, segment: t!.segment, city: t!.city, state: t!.state, status: t!.status },
      branding: b, menus: Object.fromEntries(menus.map((m) => [m.key, m.items])), canonicalHost: primary?.host,
      jsonLd: {
        '@context': 'https://schema.org', '@type': SCHEMA_TYPE[t!.segment] ?? 'EducationalOrganization', name: t!.name, url: primary ? `https://${primary.host}` : undefined,
        logo: b.logoFileId ? `${env.API_URL}/v1/files/public/${b.logoFileId}` : undefined, telephone: b.phone, email: b.email,
        address: { '@type': 'PostalAddress', streetAddress: b.address, addressLocality: t!.city, addressRegion: t!.state, addressCountry: 'IN' },
      },
    };
    await this.redis.setJson(ck, out, 60);
    return out;
  }

  async publicPage(slug: string, locale = 'en') {
    const now = new Date();
    const [p] = await this.db.t((tx) => tx.select().from(sitePage).where(and(eq(sitePage.slug, slug), eq(sitePage.locale, locale), inArray(sitePage.status, ['published', 'scheduled']), lte(sitePage.publishAt, now))).limit(1));
    if (!p) {
      const [r] = await this.db.t((tx) => tx.select().from(siteRedirect).where(eq(siteRedirect.fromPath, '/' + slug)).limit(1));
      if (r) return { redirect: { to: r.toPath, code: r.code } };
      throw notFound('Page');
    }
    const blocks = await Promise.all((p.blocks as any[]).map((b) => this.resolveBlock(b)));
    const alternates = await this.db.t((tx) => tx.select({ locale: sitePage.locale }).from(sitePage).where(and(eq(sitePage.slug, slug), eq(sitePage.status, 'published'))));
    const faq = blocks.find((b) => b.type === 'faq')?.props?.items as { q: string; a: string }[] | undefined;
    return {
      page: { id: p.id, slug: p.slug, locale: p.locale, title: p.title, seo: p.seo, updatedAt: p.updatedAt, blocks },
      alternates: alternates.map((a) => a.locale),
      jsonLd: faq?.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) } : null,
    };
  }

  /** Dynamic data blocks pull live data so the website stays fresh without an agency. */
  private async resolveBlock(b: any) {
    const limit = Number(b.props?.limit ?? 5);
    switch (b.type) {
      case 'notices':
        return { ...b, data: await this.db.t((tx) => tx.select({ id: notice.id, title: notice.title, publishAt: notice.publishAt }).from(notice).where(and(eq(notice.status, 'published'), sql`${notice.audience}->>'public' = 'true' or ${notice.audience}->>'all' = 'true'`)).orderBy(desc(notice.publishAt)).limit(limit)) };
      case 'events':
        return { ...b, data: await this.db.t((tx) => tx.select({ id: calendarEvent.id, title: calendarEvent.title, startsOn: calendarEvent.startsOn, kind: calendarEvent.kind }).from(calendarEvent).where(gte(calendarEvent.endsOn, new Date().toISOString().slice(0, 10))).orderBy(asc(calendarEvent.startsOn)).limit(limit)) };
      case 'courses':
        return { ...b, data: await this.db.t((tx) => tx.select({ id: course.id, title: course.title, slug: course.slug, pricePaise: course.pricePaise, coverFileId: course.coverFileId }).from(course).where(eq(course.isPublished, true)).limit(limit * 4)) };
      case 'news':
        return { ...b, data: await this.publicPosts(String(b.props?.kind ?? 'news'), limit) };
      case 'gallery':
      case 'toppers':
        return { ...b, data: await this.db.t((tx) => tx.select({ id: sitePost.id, title: sitePost.title, images: sitePost.images, slug: sitePost.slug }).from(sitePost).where(and(eq(sitePost.kind, 'gallery'), eq(sitePost.status, 'published'))).orderBy(desc(sitePost.publishedAt)).limit(limit)) };
      default:
        return b;
    }
  }

  async publicPosts(kind: string, limit = 20) {
    return this.db.t((tx) => tx.select({ id: sitePost.id, kind: sitePost.kind, slug: sitePost.slug, title: sitePost.title, excerpt: sitePost.excerpt, coverFileId: sitePost.coverFileId, publishedAt: sitePost.publishedAt, eventStart: sitePost.eventStart })
      .from(sitePost).where(and(eq(sitePost.kind, kind), eq(sitePost.status, 'published'))).orderBy(desc(sitePost.publishedAt)).limit(limit));
  }
  async publicPost(kind: string, slug: string) {
    const [p] = await this.db.t((tx) => tx.select().from(sitePost).where(and(eq(sitePost.kind, kind), eq(sitePost.slug, slug), eq(sitePost.status, 'published'))));
    if (!p) throw notFound('Post');
    const s = await this.site();
    const jsonLd = kind === 'event'
      ? { '@context': 'https://schema.org', '@type': 'Event', name: p.title, startDate: p.eventStart, endDate: p.eventEnd, location: { '@type': 'Place', name: s.tenant.name, address: s.jsonLd.address }, organizer: { '@type': 'Organization', name: s.tenant.name } }
      : { '@context': 'https://schema.org', '@type': kind === 'blog' ? 'BlogPosting' : 'NewsArticle', headline: p.title, datePublished: p.publishedAt, dateModified: p.updatedAt, publisher: { '@type': 'Organization', name: s.tenant.name } };
    return { post: p, jsonLd };
  }

  /** Data for sitemap.xml on the web side. */
  async sitemap() {
    const pages = await this.db.t((tx) => tx.select({ slug: sitePage.slug, locale: sitePage.locale, updatedAt: sitePage.updatedAt, noindex: sql<boolean>`coalesce((${sitePage.seo}->>'noindex')::boolean, false)` }).from(sitePage).where(eq(sitePage.status, 'published')));
    const posts = await this.db.t((tx) => tx.select({ kind: sitePost.kind, slug: sitePost.slug, updatedAt: sitePost.updatedAt }).from(sitePost).where(eq(sitePost.status, 'published')));
    return { pages: pages.filter((p) => !p.noindex), posts };
  }

  /** Website form → submission + CRM lead (deduped) with UTM attribution. */
  async submitForm(b: { formKey: string; data: Record<string, unknown>; utm: Record<string, string>; turnstileToken?: string }, ip?: string) {
    if (process.env.TURNSTILE_SECRET) {
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: b.turnstileToken ?? '', remoteip: ip ?? '' }) });
      if (!((await r.json()) as any).success) throw new AppError('FORBIDDEN', 'Captcha failed');
    }
    const [f] = await this.db.t((tx) => tx.select().from(siteForm).where(eq(siteForm.key, b.formKey)));
    if (!f) throw notFound('Form');
    for (const fld of f.fields as any[]) if (fld.required && !b.data[fld.key]) throw badRequest(`${fld.label} is required`);
    let leadId: string | undefined;
    if (f.toCrm && b.data.phone) {
      const ph = phoneIN.safeParse(String(b.data.phone));
      if (!ph.success) throw badRequest('Invalid phone number');
      const l = await this.crm.capture({ name: String(b.data.name ?? 'Website enquiry'), phone: ph.data, email: b.data.email ? String(b.data.email) : undefined, forClass: b.data.forClass ? String(b.data.forClass) : undefined, source: b.utm.utm_source ? 'ads' : 'website', utm: b.utm, note: b.data.message ? String(b.data.message) : undefined, custom: { studentName: b.data.name, form: b.formKey } });
      leadId = l.id;
    }
    await this.db.t((tx) => tx.insert(formSubmission).values({ tenantId: Ctx.tenantId(), formId: f.id, data: b.data, utm: b.utm, leadId }));
    return { ok: true, message: 'Thank you! Our team will contact you shortly.' };
  }

  // ---------------- Custom domains ----------------
  async addDomain(host: string) {
    const h = host.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (h.endsWith(env.APP_BASE_DOMAIN)) throw badRequest('Use your own domain here; the free subdomain is already active');
    const [exists] = await this.db.admin.select().from(tenantDomain).where(eq(tenantDomain.host, h));
    if (exists) throw conflict('Domain already connected');
    const token = `aadhyay-verify=${randomToken(12)}`;
    const [d] = await this.db.admin.insert(tenantDomain).values({ tenantId: Ctx.tenantId(), host: h, kind: 'custom', verifyToken: token }).returning();
    return { ...d, instructions: [
      { type: 'TXT', name: `_aadhyay.${h}`, value: token },
      { type: 'CNAME', name: h, value: `sites.${env.APP_BASE_DOMAIN}` },
    ] };
  }
  async verifyDomain(id: string) {
    const [d] = await this.db.admin.select().from(tenantDomain).where(and(eq(tenantDomain.id, id), eq(tenantDomain.tenantId, Ctx.tenantId())));
    if (!d) throw notFound('Domain');
    let ok = false;
    try {
      const recs = await resolveTxt(`_aadhyay.${d.host}`);
      ok = recs.flat().some((r) => r.trim() === d.verifyToken);
    } catch {}
    if (!ok) throw badRequest('TXT record not found yet. DNS can take up to 24 hours to update.');
    const cfId = await this.cloudflareCustomHostname(d.host);
    const [u] = await this.db.admin.update(tenantDomain).set({ verifiedAt: new Date(), cfHostnameId: cfId }).where(eq(tenantDomain.id, id)).returning();
    await this.redis.client.del(`host:${d.host}`);
    return u;
  }
  async makePrimary(id: string) {
    await this.db.admin.update(tenantDomain).set({ isPrimary: false }).where(eq(tenantDomain.tenantId, Ctx.tenantId()));
    await this.db.admin.update(tenantDomain).set({ isPrimary: true }).where(and(eq(tenantDomain.id, id), eq(tenantDomain.tenantId, Ctx.tenantId())));
    await this.redis.client.del(`site:${Ctx.tenantId()}`);
    return { ok: true };
  }
  /** Cloudflare for SaaS: auto-SSL custom hostname (adapter; no-op without credentials). */
  private async cloudflareCustomHostname(host: string): Promise<string | null> {
    const zone = process.env.CF_ZONE_ID, tok = process.env.CF_API_TOKEN;
    if (!zone || !tok) return null;
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/custom_hostnames`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ hostname: host, ssl: { method: 'http', type: 'dv' } }) });
    const j = (await r.json()) as any;
    if (!j.success) throw new AppError('BAD_REQUEST', `Cloudflare: ${j.errors?.[0]?.message ?? 'failed'}`);
    return j.result.id;
  }
}
