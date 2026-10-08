import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, lte, or, sql, isNotNull } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { lead, leadActivity, pipeline, pipelineStage, campaign } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { EventsService } from '../../kernel/events/events.service';
import { PeopleService } from '../people/people.service';
import { notFound, badRequest } from '../../common/errors';

/** Admissions CRM (docs/03 §3 crm): capture from every source, dedupe by phone, pipeline, convert to student. */
@Injectable()
export class CrmService {
  constructor(private readonly db: DbService, private readonly events: EventsService, private readonly people: PeopleService) {}

  private score(l: { source: string; email?: string | null; forClass?: string | null }) {
    const src: Record<string, number> = { referral: 30, walk_in: 25, website: 20, whatsapp: 20, ads: 10, import: 5 };
    return (src[l.source] ?? 10) + (l.email ? 5 : 0) + (l.forClass ? 10 : 0);
  }

  async stages() {
    return this.db.t((tx) => tx.select().from(pipelineStage).orderBy(asc(pipelineStage.order)));
  }

  /** Create or merge (same phone = same lead; adds an activity instead of a duplicate). */
  async capture(b: { name: string; phone: string; email?: string; forClass?: string; source: string; stageId?: string; ownerId?: string; utm?: Record<string, string>; note?: string; custom?: Record<string, unknown> }) {
    return this.db.t(async (tx) => {
      const [first] = await tx.select().from(pipelineStage).orderBy(asc(pipelineStage.order)).limit(1);
      const [existing] = await tx.select().from(lead).where(eq(lead.phone, b.phone));
      if (existing) {
        await tx.insert(leadActivity).values({ tenantId: Ctx.tenantId(), leadId: existing.id, kind: 'note', body: `Repeat enquiry via ${b.source}${b.note ? `: ${b.note}` : ''}`, byUserId: Ctx.userId() });
        const [u] = await tx.update(lead).set({ score: existing.score + 5, updatedAt: new Date() }).where(eq(lead.id, existing.id)).returning();
        return { ...u!, duplicate: true };
      }
      const owner = b.ownerId ?? (await this.roundRobinOwner());
      const [l] = await tx.insert(lead).values({ tenantId: Ctx.tenantId(), name: b.name, phone: b.phone, email: b.email, forClass: b.forClass, source: b.source, stageId: b.stageId ?? first?.id, ownerId: owner, utm: b.utm ?? {}, custom: b.custom ?? {}, score: this.score(b) }).returning();
      if (b.note) await tx.insert(leadActivity).values({ tenantId: Ctx.tenantId(), leadId: l!.id, kind: 'note', body: b.note, byUserId: Ctx.userId() });
      await this.events.emit('lead.created', { leadId: l!.id, source: b.source });
      return { ...l!, duplicate: false };
    });
  }

  /** Assign to the counsellor with the fewest open leads. */
  private async roundRobinOwner(): Promise<string | undefined> {
    const r = await this.db.t((tx) => tx.execute(sql`select m.user_id from memberships m join role_assignments ra on ra.membership_id = m.id join roles r on r.id = ra.role_id
      where r.key = 'front_office' and m.status = 'active' group by m.user_id order by (select count(*) from leads l where l.owner_id = m.user_id and l.student_id is null) asc limit 1`));
    return (r.rows[0] as any)?.user_id;
  }

  async list(q: { stageId?: string; ownerId?: string; source?: string; q?: string; due?: string }) {
    return this.db.t((tx) => tx.select().from(lead).where(and(
      q.stageId ? eq(lead.stageId, q.stageId) : undefined, q.ownerId ? eq(lead.ownerId, q.ownerId) : undefined, q.source ? eq(lead.source, q.source) : undefined,
      q.q ? or(ilike(lead.name, `%${q.q}%`), ilike(lead.phone, `%${q.q}%`)) : undefined, q.due === 'today' ? lte(lead.nextFollowUpAt, new Date()) : undefined,
    )).orderBy(desc(lead.updatedAt)).limit(500));
  }

  async update(id: string, b: any) {
    return this.db.t(async (tx) => {
      const [before] = await tx.select().from(lead).where(eq(lead.id, id));
      if (!before) throw notFound('Lead');
      const [l] = await tx.update(lead).set({ ...b, nextFollowUpAt: b.nextFollowUpAt ? new Date(b.nextFollowUpAt) : undefined, updatedAt: new Date() }).where(eq(lead.id, id)).returning();
      if (b.stageId && b.stageId !== before.stageId) {
        await tx.insert(leadActivity).values({ tenantId: Ctx.tenantId(), leadId: id, kind: 'stage_change', data: { from: before.stageId, to: b.stageId }, byUserId: Ctx.userId() });
        await this.events.emit('lead.stage_changed', { leadId: id, from: before.stageId, to: b.stageId });
      }
      return l;
    });
  }

  async addActivity(leadId: string, b: { kind: string; body?: string; dueAt?: string }) {
    const [a] = await this.db.t((tx) => tx.insert(leadActivity).values({ tenantId: Ctx.tenantId(), leadId, kind: b.kind, body: b.body, dueAt: b.dueAt ? new Date(b.dueAt) : null, byUserId: Ctx.userId() }).returning());
    if (b.dueAt) await this.db.t((tx) => tx.update(lead).set({ nextFollowUpAt: new Date(b.dueAt!) }).where(eq(lead.id, leadId)));
    return a;
  }
  async timeline(leadId: string) {
    return this.db.t(async (tx) => {
      const [l] = await tx.select().from(lead).where(eq(lead.id, leadId));
      if (!l) throw notFound('Lead');
      return { lead: l, activities: await tx.select().from(leadActivity).where(eq(leadActivity.leadId, leadId)).orderBy(desc(leadActivity.at)) };
    });
  }

  /** One click: lead → admitted student (no re-typing). Parent phone = lead phone. */
  async convert(leadId: string, b: { sectionId?: string; admissionNo?: string }) {
    const [l] = await this.db.t((tx) => tx.select().from(lead).where(eq(lead.id, leadId)));
    if (!l) throw notFound('Lead');
    if (l.studentId) throw badRequest('Lead already converted');
    const custom = (l.custom ?? {}) as any;
    const st = await this.people.createStudent({ name: custom.studentName ?? l.name, admissionNo: b.admissionNo, sectionId: b.sectionId, guardians: [{ name: custom.parentName ?? l.name, phone: l.phone, email: l.email ?? undefined, relation: custom.relation ?? 'guardian', isPrimary: true, receivesNotifications: true }] });
    const won = await this.db.t((tx) => tx.select().from(pipelineStage).where(eq(pipelineStage.isWon, true)).limit(1));
    await this.db.t(async (tx) => {
      await tx.update(lead).set({ studentId: st.id, stageId: won[0]?.id ?? l.stageId }).where(eq(lead.id, leadId));
      await tx.insert(leadActivity).values({ tenantId: Ctx.tenantId(), leadId, kind: 'stage_change', body: `Admitted as ${st.admissionNo}`, byUserId: Ctx.userId() });
    });
    return st;
  }

  /** Source ROI: leads, admissions, conversion %, cost per admission (from campaigns). */
  async sourceReport() {
    const rows = await this.db.t((tx) => tx.execute(sql`select source, count(*)::int as leads, count(student_id)::int as admitted from leads group by source order by leads desc`));
    const costs = await this.db.t((tx) => tx.execute(sql`select channel::text as channel, coalesce(sum(cost_paise),0)::bigint as cost from campaigns group by channel`));
    return (rows.rows as any[]).map((r) => {
      const cost = Number((costs.rows as any[]).find((c) => c.channel === r.source)?.cost ?? 0);
      return { source: r.source, leads: r.leads, admitted: r.admitted, conversionPct: r.leads ? Math.round((r.admitted / r.leads) * 1000) / 10 : 0, costPaise: cost, costPerAdmissionPaise: r.admitted ? Math.round(cost / r.admitted) : null };
    });
  }
}
