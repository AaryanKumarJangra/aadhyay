import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, sql, isNull, gt } from 'drizzle-orm';
import { DEFAULT_ROUTING, URGENT_EVENTS, type RoutingChannels, type DomainEvent } from '@aadhyay/contracts';
import { DbService } from '../../db/db.service';
import { notification, messageDelivery, pushToken, user, guardian, studentGuardian, student, enrollment, section, schoolClass, commRoutingRule, notificationTemplate, tenant, membership, roleAssignment, role, staff, tenantModule } from '../../db/schema';
import { OnEvent, EventsService } from '../../kernel/events/events.service';
import { Ctx } from '../../kernel/context/request-context';
import { PushAdapter } from '../../adapters/push/push.adapter';
import { SmsAdapter } from '../../adapters/sms/sms.adapter';
import { EmailAdapter } from '../../adapters/email/email.adapter';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { BillingService } from '../../control-plane/billing.service';
import { DEFAULT_TEMPLATES, render } from './templates';
import { inQuietHours, msUntil } from './recipients';
import { currentSession } from '../academics/session.util';
import { env } from '../../config/env';

export interface Recipient {
  userId?: string | null;
  phone?: string | null;
  email?: string | null;
  studentId?: string | null; // child context (per-child messages)
  vars: Record<string, unknown>;
}
export interface DeliverPayload {
  eventKey: string;
  recipients: Recipient[];
  vars: Record<string, unknown>;
  data?: Record<string, unknown>;
  urgent?: boolean;
}

const fmtINR = (p: number) => (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });

/**
 * Communication engine (docs/02 §7): modules emit events → this resolves recipients (per child),
 * applies the tenant routing policy (app-first), quiet hours, and delivers via inbox/push/WhatsApp/SMS/email.
 */
@Injectable()
export class CommsService {
  private readonly log = new Logger('Comms');
  constructor(
    private readonly db: DbService, private readonly events: EventsService, private readonly push: PushAdapter, private readonly sms: SmsAdapter,
    private readonly email: EmailAdapter, private readonly wa: WhatsAppService, private readonly billing: BillingService,
  ) {}

  // ---------------- Recipient resolution ----------------
  async guardiansOf(studentIds: string[]) {
    if (!studentIds.length) return [];
    return this.db.t((tx) => tx.select({ studentId: studentGuardian.studentId, guardianId: guardian.id, userId: guardian.userId, phone: guardian.phone, email: guardian.email, name: guardian.name })
      .from(studentGuardian).innerJoin(guardian, eq(guardian.id, studentGuardian.guardianId)).where(and(inArray(studentGuardian.studentId, studentIds), eq(studentGuardian.receivesNotifications, true))));
  }
  async childContext(studentIds: string[]) {
    if (!studentIds.length) return new Map<string, { child: string; class: string; sectionId: string | null }>();
    const rows = await this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      return tx.select({ id: student.id, name: student.name, cls: schoolClass.name, sec: section.name, sectionId: enrollment.sectionId, userId: student.userId })
        .from(student).leftJoin(enrollment, and(eq(enrollment.studentId, student.id), eq(enrollment.sessionId, sess.id))).leftJoin(section, eq(section.id, enrollment.sectionId)).leftJoin(schoolClass, eq(schoolClass.id, enrollment.classId))
        .where(inArray(student.id, studentIds));
    });
    return new Map(rows.map((r) => [r.id, { child: r.name, class: r.cls ? `${r.cls}${r.sec ? '-' + r.sec : ''}` : '', sectionId: r.sectionId, userId: r.userId }]));
  }
  /** One message per (guardian, student) — docs/01 §7.3. Plus the student's own login if any. */
  async perChild(studentIds: string[], extra: (sid: string) => Record<string, unknown> = () => ({})): Promise<Recipient[]> {
    const ctx = await this.childContext(studentIds);
    const gs = await this.guardiansOf(studentIds);
    const out: Recipient[] = gs.map((g) => ({ userId: g.userId, phone: g.phone, email: g.email, studentId: g.studentId, vars: { ...ctx.get(g.studentId), ...extra(g.studentId) } }));
    for (const [sid, c] of ctx) if ((c as any).userId) out.push({ userId: (c as any).userId, studentId: sid, vars: { ...c, ...extra(sid) } });
    return out;
  }
  async sectionStudentIds(sectionIds: string[]) {
    if (!sectionIds.length) return [];
    return this.db.t(async (tx) => {
      const sess = await currentSession(tx);
      const r = await tx.select({ id: enrollment.studentId }).from(enrollment).where(and(inArray(enrollment.sectionId, sectionIds), eq(enrollment.sessionId, sess.id), eq(enrollment.status, 'active')));
      return r.map((x) => x.id);
    });
  }
  /** Institution-wide notices: once per person, not per child. */
  async audience(a: { all?: boolean; classIds?: string[]; sectionIds?: string[]; guardians?: boolean; students?: boolean; staff?: boolean }): Promise<Recipient[]> {
    const wantG = a.guardians ?? true, wantS = a.students ?? true, wantStaff = a.staff ?? !!a.all;
    let studentIds: string[] = [];
    if (a.all) studentIds = await this.db.t(async (tx) => (await tx.select({ id: student.id }).from(student).where(and(eq(student.status, 'active'), isNull(student.deletedAt)))).map((r) => r.id));
    else {
      let secs = a.sectionIds ?? [];
      if (a.classIds?.length) secs = secs.concat((await this.db.t((tx) => tx.select({ id: section.id }).from(section).where(inArray(section.classId, a.classIds!)))).map((r) => r.id));
      studentIds = await this.sectionStudentIds(secs);
    }
    const seen = new Set<string>();
    const out: Recipient[] = [];
    const add = (r: Recipient) => {
      const k = r.userId ?? r.phone ?? '';
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(r);
    };
    if (wantG) for (const g of await this.guardiansOf(studentIds)) add({ userId: g.userId, phone: g.phone, email: g.email, vars: {} });
    if (wantS && studentIds.length) for (const s of await this.db.t((tx) => tx.select({ userId: student.userId }).from(student).where(inArray(student.id, studentIds)))) if (s.userId) add({ userId: s.userId, vars: {} });
    if (wantStaff) for (const s of await this.db.t((tx) => tx.select({ userId: staff.userId, phone: staff.phone, email: staff.email }).from(staff).where(eq(staff.status, 'active')))) add({ userId: s.userId, phone: s.phone, email: s.email, vars: {} });
    return out;
  }
  async admins(tenantId = Ctx.tenantId()): Promise<Recipient[]> {
    const rows = await this.db.admin.selectDistinct({ userId: user.id, phone: user.phone, email: user.email }).from(roleAssignment)
      .innerJoin(role, eq(role.id, roleAssignment.roleId)).innerJoin(membership, eq(membership.id, roleAssignment.membershipId)).innerJoin(user, eq(user.id, membership.userId))
      .where(and(eq(roleAssignment.tenantId, tenantId), inArray(role.key, ['owner', 'admin', 'principal'])));
    return rows.map((r) => ({ ...r, vars: {} }));
  }

  // ---------------- Event subscribers ----------------
  @OnEvent('attendance.absent', 'attendance.late', 'fee.due_soon', 'fee.overdue', 'fee.paid', 'exam.result_published', 'leave.decided', 'attendance.marked', 'homework.assigned', 'diary.posted', 'notice.published', 'emergency.broadcast', 'billing.renewal_due', 'wallet.low', 'leave.requested', 'tenant.created')
  async onDomainEvent(e: DomainEvent<any>) {
    const d = e.data;
    let recipients: Recipient[] = [];
    const vars: Record<string, unknown> = {};
    switch (e.type) {
      case 'attendance.absent':
      case 'attendance.late':
        recipients = await this.perChild([d.studentId], () => ({ date: d.date }));
        break;
      case 'attendance.marked':
        if (!d.arrival || !d.studentId) return; // section summaries are not parent alerts
        recipients = await this.perChild([d.studentId], () => ({ time: new Date(d.at).toLocaleTimeString('en-IN', { timeZone: Ctx.get().tenantTz ?? 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) }));
        break;
      case 'fee.due_soon':
        recipients = await this.perChild([d.studentId], () => ({ dueOn: d.dueOn }));
        break;
      case 'fee.overdue':
        recipients = await this.perChild([d.studentId], () => ({ amount: fmtINR(d.duePaise), oldestDue: d.oldestDue, link: `${env.WEB_URL}/pay` }));
        break;
      case 'fee.paid':
        recipients = await this.perChild([d.studentId], () => ({ amount: fmtINR(d.amountPaise), number: d.number }));
        break;
      case 'exam.result_published':
        recipients = await this.perChild([d.studentId], () => ({ exam: d.examName, percentage: d.percentage, grade: d.grade ?? '' }));
        break;
      case 'leave.decided':
        if (d.studentId) recipients = await this.perChild([d.studentId], () => ({ status: d.status }));
        else recipients = [{ userId: d.appliedBy, vars: { status: d.status, child: 'you' } }];
        break;
      case 'homework.assigned':
      case 'diary.posted':
        recipients = await this.perChild(await this.sectionStudentIds([d.sectionId]), () => ({ title: d.title, dueOn: d.dueOn }));
        break;
      case 'notice.published':
      case 'emergency.broadcast':
        recipients = await this.audience(d.audience ?? { all: true });
        Object.assign(vars, { title: d.title, body: d.body });
        break;
      case 'billing.renewal_due': {
        const msg = d.kind === 'trial_ending' ? `Your free trial ends in ${d.daysLeft} day(s). Choose a plan to continue without interruption.`
          : d.kind === 'renewal_due' ? `Your subscription renews in ${d.daysLeft} day(s). Pay now to avoid interruption.`
          : d.kind === 'suspension_warning' ? `Service will be paused in ${d.daysLeft} days, including bus tracking and parent alerts. Please renew.`
          : d.kind === 'purge_warning' ? `Your data will be permanently deleted in ${d.daysLeft} day(s). Renew or export your data now.`
          : `Your subscription has expired. ${d.daysLeft} day(s) of grace left.`;
        recipients = await this.admins();
        const [t] = await this.db.admin.select({ email: tenant.billingEmail }).from(tenant).where(eq(tenant.id, e.tenantId!));
        if (t?.email) recipients.push({ email: t.email, vars: {} });
        Object.assign(vars, { message: msg, days: d.daysLeft, tenantName: d.tenantName });
        return this.deliver({ eventKey: e.type, recipients, vars, urgent: true, data: d }, true);
      }
      case 'wallet.low':
        recipients = await this.admins();
        vars.balance = fmtINR(d.balancePaise);
        break;
      case 'leave.requested':
        recipients = await this.admins();
        break;
      case 'tenant.created':
        await this.seedTemplates();
        return;
    }
    if (!recipients.length) return;
    await this.schedule({ eventKey: e.type, recipients, vars, data: d, urgent: URGENT_EVENTS.has(e.type) });
  }

  /** Public entry for modules that resolve their own recipients (transport tracking links, SOS, CRM). */
  async notify(p: DeliverPayload) {
    return this.schedule(p);
  }

  /** Quiet hours: non-urgent messages are deferred to the end of the window via the outbox. */
  private async schedule(p: DeliverPayload) {
    const [t] = await this.db.admin.select({ settings: tenant.settings, tz: tenant.timezone }).from(tenant).where(eq(tenant.id, Ctx.tenantId()));
    const q = (t?.settings as any)?.quietHours ?? { start: '21:00', end: '07:00' };
    const tz = t?.tz ?? 'Asia/Kolkata';
    const now = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    if (!p.urgent && inQuietHours(now, q.start, q.end)) {
      await this.events.emit('comms.deliver', p as any, { delayMs: msUntil(q.end, tz) });
      return { deferred: true, recipients: p.recipients.length };
    }
    return this.deliver(p);
  }

  @OnEvent('comms.deliver')
  async onDeferred(e: DomainEvent<any>) {
    await this.deliver(e.data as DeliverPayload);
  }

  private async rule(eventKey: string): Promise<RoutingChannels> {
    const [r] = await this.db.t((tx) => tx.select().from(commRoutingRule).where(eq(commRoutingRule.eventKey, eventKey)).limit(1));
    return (r?.channels as RoutingChannels) ?? DEFAULT_ROUTING[eventKey] ?? { push: true, whatsapp: 'never', sms: 'never', email: false, fallbackInactiveDays: 7 };
  }

  private async template(eventKey: string, channel: 'push' | 'whatsapp' | 'sms' | 'email', locale: 'en' | 'hi') {
    const [o] = await this.db.t((tx) => tx.select().from(notificationTemplate).where(and(eq(notificationTemplate.eventKey, eventKey), eq(notificationTemplate.channel, channel), eq(notificationTemplate.locale, locale), eq(notificationTemplate.isActive, true))).limit(1));
    const d = DEFAULT_TEMPLATES[eventKey];
    return { title: o?.title ?? d?.[locale]?.title ?? d?.en.title ?? eventKey, body: o?.body ?? d?.[locale]?.body ?? d?.en.body ?? '', waTemplateName: o?.waTemplateName ?? d?.wa?.name, waParams: d?.wa?.params ?? [], waCategory: d?.wa?.category ?? 'utility' };
  }

  /** Deliver to every recipient through the routing plan. Returns per-channel counts. */
  async deliver(p: DeliverPayload, force = false) {
    const tenantId = Ctx.tenantId();
    const rule = await this.rule(p.eventKey);
    const [t] = await this.db.admin.select({ name: tenant.name }).from(tenant).where(eq(tenant.id, tenantId));
    const hasWa = force || (await this.db.admin.select({ e: tenantModule.enabled }).from(tenantModule).where(and(eq(tenantModule.tenantId, tenantId), eq(tenantModule.moduleKey, 'whatsapp'))).limit(1))[0]?.e === true;
    const counts = { inbox: 0, push: 0, whatsapp: 0, sms: 0, email: 0, skipped: 0 };
    const userIds = [...new Set(p.recipients.map((r) => r.userId).filter(Boolean) as string[])];
    const users = userIds.length ? await this.db.admin.select({ id: user.id, locale: user.locale, lastActiveAt: user.lastActiveAt, email: user.email }).from(user).where(inArray(user.id, userIds)) : [];
    const tokens = userIds.length ? await this.db.admin.select().from(pushToken).where(inArray(pushToken.userId, userIds)) : [];
    for (const r of p.recipients) {
      const u = users.find((x) => x.id === r.userId);
      const locale: 'en' | 'hi' = u?.locale?.startsWith('hi') ? 'hi' : 'en';
      const vars: Record<string, unknown> = { institution: t?.name, ...p.vars, ...r.vars };
      const tpl = await this.template(p.eventKey, 'push', locale);
      const title = render(tpl.title, vars), body = render(tpl.body, vars);
      let notificationId: string | undefined;
      if (r.userId) {
        const [n] = await this.db.t((tx) => tx.insert(notification).values({ tenantId, userId: r.userId!, studentId: r.studentId ?? null, eventKey: p.eventKey, title, body, data: { ...(p.data ?? {}), ...(r.studentId ? { studentId: r.studentId } : {}) } }).returning());
        notificationId = n!.id;
        counts.inbox++;
      }
      // 1. Push (free)
      let pushed = false;
      const myTokens = tokens.filter((x) => x.userId === r.userId);
      if (rule.push && myTokens.length) {
        for (const tk of myTokens) {
          const res = await this.push.send({ token: tk.token, title, body, data: { eventKey: p.eventKey, notificationId: notificationId ?? '', studentId: r.studentId ?? '' } });
          if (res === 'ok') pushed = true;
          if (res === 'invalid_token') await this.db.admin.delete(pushToken).where(eq(pushToken.id, tk.id));
        }
        if (pushed) counts.push++;
        await this.db.t((tx) => tx.insert(messageDelivery).values({ tenantId, notificationId, userId: r.userId, channel: 'push', status: pushed ? 'sent' : 'failed' }));
      }
      // 2. WhatsApp (paid, official API) — always, or fallback when the person isn't using the app
      const inactive = !u?.lastActiveAt || Date.now() - u.lastActiveAt.getTime() > rule.fallbackInactiveDays * 86400_000;
      const wantWa = r.phone && hasWa && (rule.whatsapp === 'always' || (rule.whatsapp === 'fallback' && (!myTokens.length || inactive)));
      let waSent = false;
      if (wantWa && tpl.waTemplateName) {
        const params = tpl.waParams.map((k) => String(vars[k] ?? ''));
        const id = await this.wa.sendTemplate(tenantId, r.phone!, tpl.waTemplateName, params, tpl.waCategory, { notificationId, userId: r.userId ?? undefined });
        if (id) { waSent = true; counts.whatsapp++; }
      }
      // 3. SMS — only urgent/OTP-type events per policy, prepaid
      const wantSms = r.phone && (rule.sms === 'always' || (rule.sms === 'fallback' && !pushed && !waSent));
      if (wantSms) {
        const ok = await this.billing.debitUsage(tenantId, 'sms', 1, 20, 18, p.eventKey);
        if (ok) {
          const s = await this.sms.send(r.phone!, `${title}: ${body}`.slice(0, 300));
          await this.db.t((tx) => tx.insert(messageDelivery).values({ tenantId, notificationId, userId: r.userId, toAddress: r.phone, channel: 'sms', status: 'sent', providerRef: s.id, pricePaise: 20, costPaise: 18 }));
          counts.sms++;
        } else counts.skipped++;
      }
      // 4. Email
      const mail = r.email ?? u?.email;
      if ((rule.email || p.eventKey === 'billing.renewal_due') && mail) {
        await this.email.send({ to: mail, subject: title, html: `<p>${body.replace(/\n/g, '<br>')}</p><p style="color:#888;font-size:12px">${t?.name ?? 'Aadhyay'}</p>` }).catch(() => undefined);
        counts.email++;
      }
    }
    return counts;
  }

  /** Copy default templates into the tenant so admins can edit them (en + hi). */
  async seedTemplates() {
    const tenantId = Ctx.tenantId();
    const rows = Object.entries(DEFAULT_TEMPLATES).flatMap(([eventKey, t]) => (['en', 'hi'] as const).map((locale) => ({ tenantId, eventKey, channel: 'push' as const, locale, title: t[locale].title, body: t[locale].body, waTemplateName: t.wa?.name })));
    await this.db.t((tx) => tx.insert(notificationTemplate).values(rows).onConflictDoNothing());
  }
}
