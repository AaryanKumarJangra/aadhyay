import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { and, desc, eq, isNull, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Comms } from '@aadhyay/contracts';
import { Can, RequireModule, TenantOptional, NoTenant } from '../../kernel/auth/decorators';
import { Z } from '../../common/zod.pipe';
import { DbService } from '../../db/db.service';
import { notification, pushToken, notice, commRoutingRule, notificationTemplate, messageDelivery } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { EventsService } from '../../kernel/events/events.service';
import { CommsService } from './comms.service';

@RequireModule('comms')
@Controller('comms')
export class CommsController {
  constructor(private readonly db: DbService, private readonly events: EventsService, private readonly comms: CommsService) {}

  /** In-app inbox (permanent free record of every alert). ?studentId filters by child. */
  @Get('inbox')
  inbox(@Query('studentId') studentId?: string, @Query('before') before?: string) {
    return this.db.t((tx) => tx.select().from(notification).where(and(eq(notification.userId, Ctx.get().userId!), studentId ? eq(notification.studentId, studentId) : undefined, before ? sql`${notification.id} < ${before}` : undefined)).orderBy(desc(notification.id)).limit(50));
  }
  @Get('inbox/unread-count')
  async unread() {
    const [r] = await this.db.t((tx) => tx.select({ n: sql<number>`count(*)::int` }).from(notification).where(and(eq(notification.userId, Ctx.get().userId!), isNull(notification.readAt))));
    return { unread: r?.n ?? 0 };
  }
  @Post('inbox/read')
  async read(@Body(Z(z.object({ ids: z.array(z.string().uuid()).optional(), all: z.boolean().optional() }))) b: any) {
    await this.db.t((tx) => tx.update(notification).set({ readAt: new Date() }).where(and(eq(notification.userId, Ctx.get().userId!), isNull(notification.readAt), b.all ? undefined : inArray(notification.id, b.ids ?? []))));
    return { ok: true };
  }

  @Can('comms.notice.view') @Get('notices')
  notices() {
    return this.db.t((tx) => tx.select().from(notice).orderBy(desc(notice.publishAt)).limit(100));
  }
  @Can('comms.notice.create') @Post('notices')
  async createNotice(@Body(Z(Comms.noticeInput)) b: any) {
    const publishAt = b.publishAt ? new Date(b.publishAt) : new Date();
    const [n] = await this.db.t((tx) => tx.insert(notice).values({ tenantId: Ctx.tenantId(), title: b.title, body: b.body, audience: b.audience, attachments: b.attachments, publishAt, status: publishAt > new Date() ? 'scheduled' : 'published', createdBy: Ctx.userId() }).returning());
    await this.events.emit(b.urgent ? 'emergency.broadcast' : 'notice.published', { noticeId: n!.id, title: b.title, body: b.body, audience: b.audience }, { delayMs: Math.max(0, publishAt.getTime() - Date.now()) });
    return n;
  }

  @Can('comms.settings.view', 'comms.notice.view') @Get('routing')
  async routing() {
    return this.db.t((tx) => tx.select().from(commRoutingRule).orderBy(commRoutingRule.eventKey));
  }
  @Can('comms.settings.edit') @Put('routing')
  async setRouting(@Body(Z(Comms.routingUpdate)) b: any) {
    const [r] = await this.db.t((tx) => tx.insert(commRoutingRule).values({ tenantId: Ctx.tenantId(), eventKey: b.eventKey, channels: b.channels })
      .onConflictDoUpdate({ target: [commRoutingRule.tenantId, commRoutingRule.eventKey], set: { channels: b.channels } }).returning());
    return r;
  }
  @Can('comms.settings.view') @Get('templates')
  templates() {
    return this.db.t((tx) => tx.select().from(notificationTemplate).orderBy(notificationTemplate.eventKey));
  }
  @Can('comms.settings.edit') @Put('templates')
  async setTemplate(@Body(Z(Comms.templateInput)) b: any) {
    const [r] = await this.db.t((tx) => tx.insert(notificationTemplate).values({ ...b, tenantId: Ctx.tenantId() })
      .onConflictDoUpdate({ target: [notificationTemplate.tenantId, notificationTemplate.eventKey, notificationTemplate.channel, notificationTemplate.locale], set: { title: b.title, body: b.body, waTemplateName: b.waTemplateName } }).returning());
    return r;
  }
  @Can('comms.settings.view') @Get('deliveries')
  deliveries(@Query('channel') channel?: string) {
    return this.db.t((tx) => tx.select().from(messageDelivery).where(channel ? eq(messageDelivery.channel, channel as any) : undefined).orderBy(desc(messageDelivery.id)).limit(200));
  }
}

/** Device push token registration works for any logged-in user (messenger-only users too). */
@Controller('push')
export class PushController {
  constructor(private readonly db: DbService) {}
  @NoTenant() @Post('tokens')
  async register(@Body(Z(Comms.pushTokenInput)) b: any) {
    await this.db.admin.insert(pushToken).values({ ...b, userId: Ctx.get().userId! }).onConflictDoUpdate({ target: pushToken.token, set: { userId: Ctx.get().userId!, deviceId: b.deviceId, appId: b.appId } });
    return { ok: true };
  }
}
