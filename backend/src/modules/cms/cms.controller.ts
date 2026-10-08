import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { Cms } from '@aadhyay/contracts';
import { Can, RequireModule, Public, PublicTenant } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { CmsService } from './cms.service';
import { crudController } from '../../common/crud';
import { sitePage, sitePost, siteRedirect, siteForm, siteMenu, formSubmission, tenantDomain } from '../../db/schema';
import { DbService } from '../../db/db.service';
import { Ctx } from '../../kernel/context/request-context';
import { RedisService } from '../../kernel/redis/redis.service';

@RequireModule('cms')
@Controller('cms')
export class CmsController {
  constructor(private readonly svc: CmsService, private readonly db: DbService, private readonly redis: RedisService) {}
  @Can('cms.page.create') @Post('pages') create(@Body(Z(Cms.pageInput)) b: any) { return this.svc.savePage(b); }
  @Can('cms.page.edit') @Put('pages/:id') update(@Param('id') id: string, @Body(Z(Cms.pageUpdate)) b: any) { return this.svc.savePage(b, id); }
  @Can('cms.page.edit') @Post('pages/:id/rollback') rollback(@Param('id') id: string, @Body(Z(z.object({ version: z.number().int() }))) b: any) { return this.svc.rollback(id, b.version); }
  @Can('cms.menu.edit', 'cms.page.edit') @Put('menus')
  async menu(@Body(Z(Cms.menuInput)) b: any) {
    const [r] = await this.db.t((tx) => tx.insert(siteMenu).values({ tenantId: Ctx.tenantId(), key: b.key, items: b.items }).onConflictDoUpdate({ target: [siteMenu.tenantId, siteMenu.key], set: { items: b.items } }).returning());
    await this.redis.client.del(`site:${Ctx.tenantId()}`);
    return r;
  }
  @Can('cms.domain.view', 'cms.page.view') @Get('domains') domains() { return this.db.admin.select().from(tenantDomain).where(eq(tenantDomain.tenantId, Ctx.tenantId())); }
  @Can('cms.domain.manage', 'org.settings.edit') @Post('domains') addDomain(@Body(Z(Cms.domainInput)) b: any) { return this.svc.addDomain(b.host); }
  @Can('cms.domain.manage', 'org.settings.edit') @Post('domains/:id/verify') verify(@Param('id') id: string) { return this.svc.verifyDomain(id); }
  @Can('cms.domain.manage', 'org.settings.edit') @Post('domains/:id/primary') primary(@Param('id') id: string) { return this.svc.makePrimary(id); }
}

/** Public website API used by the Next.js tenant site renderer (tenant from Host or X-Tenant). */
@Controller('site')
export class SiteController {
  constructor(private readonly svc: CmsService) {}
  @PublicTenant() @Get() site() { return this.svc.site(); }
  @PublicTenant() @Get('page') page(@Query('slug') slug = '', @Query('locale') locale = 'en') { return this.svc.publicPage(slug.replace(/^\/+/, ''), locale); }
  @PublicTenant() @Get('posts/:kind') posts(@Param('kind') kind: string, @Query('limit') limit?: string) { return this.svc.publicPosts(kind, limit ? Number(limit) : 20); }
  @PublicTenant() @Get('posts/:kind/:slug') post(@Param('kind') kind: string, @Param('slug') slug: string) { return this.svc.publicPost(kind, slug); }
  @PublicTenant() @Get('sitemap') sitemap() { return this.svc.sitemap(); }
  @PublicTenant() @Post('forms/submit') submit(@Body(Z(Cms.formSubmit)) b: any, @Req() req: FastifyRequest) { return this.svc.submitForm(b, req.ip); }
}

export const PageCrud = crudController({ path: 'cms/page-list', module: 'cms', perm: 'cms.page', table: sitePage as any, create: Cms.pageInput, readonly: true, filters: { locale: sitePage.locale, status: sitePage.status } });
export const PostCrud = crudController({ path: 'cms/posts', module: 'cms', perm: 'cms.post', table: sitePost as any, create: Cms.postInput, filters: { kind: sitePost.kind, status: sitePost.status }, search: [sitePost.title],
  beforeWrite: (d) => ({ ...d, eventStart: d.eventStart ? new Date(d.eventStart) : undefined, eventEnd: d.eventEnd ? new Date(d.eventEnd) : undefined, publishedAt: d.status === 'published' ? new Date() : undefined }) });
export const RedirectCrud = crudController({ path: 'cms/redirects', module: 'cms', perm: 'cms.page', table: siteRedirect as any, create: Cms.redirectInput });
export const FormCrud = crudController({ path: 'cms/forms', module: 'cms', perm: 'cms.page', table: siteForm as any, create: z.object({ key: z.string().regex(/^[a-z0-9_-]+$/), name: z.string(), fields: z.array(z.object({ key: z.string(), label: z.string(), type: z.string(), required: z.boolean().optional() })), toCrm: z.boolean().default(true) }) });
export const SubmissionCrud = crudController({ path: 'cms/submissions', module: 'cms', perm: 'cms.page', table: formSubmission as any, create: z.object({}), readonly: true, filters: { formId: formSubmission.formId } });
