import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService, type Tx } from '../../db/db.service';
import { Can, Scoped } from '../../kernel/auth/decorators';
import { Ctx } from '../../kernel/context/request-context';
import { Authz } from '../../kernel/authz/authz';
import { addDays, todayIn } from '../../common/dates';
import { ZERO_UUID } from '../../common/ids';

/**
 * Role dashboards (docs/redesign/05-DASHBOARDS.md). Every block is real aggregate data and is included only when the
 * caller may see it — the dashboard composes itself from the user's permissions. Series are zero-filled per period so
 * charts never invent points; "no data yet" is reported explicitly so the UI can explain how to create it.
 */
const PRESENT = sql.raw(`('present','late','half_day')`);
const rows = async <T>(tx: Tx, q: ReturnType<typeof sql>) => (await tx.execute(q)).rows as T[];
const pct = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : null);
const n = (v: unknown) => Number(v ?? 0);

function days(to: string, count: number) {
  return Array.from({ length: count }, (_, i) => addDays(to, i - count + 1));
}

@Injectable()
export class DashboardsService {
  constructor(private readonly db: DbService) {}

  private today() { return todayIn(Ctx.get().tenantTz); }
  private all(k: Parameters<typeof Authz.filter>[0]) { return Authz.filter(k).kind === 'all'; }

  // ---------------------------------------------------------------- institution (owner / principal / admin)
  async institution(rangeDays: number) {
    const today = this.today();
    const from = addDays(today, -(rangeDays - 1));
    return this.db.t(async (tx) => {
      const out: Record<string, unknown> = { today, rangeDays };

      // People: active students now and at each month end (admitted on/before, not left), staff count.
      const months = await rows<{ mon: string; n: number }>(tx, sql`
        with m as (select generate_series(date_trunc('month', ${today}::date) - interval '11 months', date_trunc('month', ${today}::date), interval '1 month')::date as mon)
        select to_char(m.mon, 'YYYY-MM') as mon,
          (select count(*) from students s where s.deleted_at is null
             and coalesce(s.admitted_on, s.created_at::date) <= least((m.mon + interval '1 month - 1 day')::date, ${today}::date)
             and (s.left_on is null or s.left_on > least((m.mon + interval '1 month - 1 day')::date, ${today}::date)))::int as n
        from m order by m.mon`);
      const [ppl] = await rows<{ students: number; staff: number; new_month: number; sections: number }>(tx, sql`select
        (select count(*) from students where status = 'active' and deleted_at is null)::int as students,
        (select count(*) from staff where status = 'active' and deleted_at is null)::int as staff,
        (select count(*) from students where deleted_at is null and coalesce(admitted_on, created_at::date) >= date_trunc('month', ${today}::date))::int as new_month,
        (select count(*) from sections)::int as sections`);
      out.people = {
        students: ppl!.students, staff: ppl!.staff, newThisMonth: ppl!.new_month, sections: ppl!.sections,
        monthly: months.map((m) => ({ month: m.mon, students: n(m.n) })),
      };

      if (this.all('attendance.student.view')) {
        const daily = await rows<{ d: string; marked: number; present: number; absent: number; late: number }>(tx, sql`
          select date::text as d, count(*)::int as marked, count(*) filter (where status in ${PRESENT})::int as present,
            count(*) filter (where status = 'absent')::int as absent, count(*) filter (where status = 'late')::int as late
          from attendance_records where subject_type = 'student' and period_id = ${ZERO_UUID}::uuid and date between ${from} and ${today}
          group by date`);
        const by = new Map(daily.map((r) => [r.d, r]));
        const series = days(today, rangeDays).map((d) => { const r = by.get(d); return { date: d, marked: n(r?.marked), present: n(r?.present), absent: n(r?.absent), late: n(r?.late), pct: r ? pct(n(r.present), n(r.marked)) : null }; });
        const t = by.get(today);
        const [sec] = await rows<{ marked: number }>(tx, sql`select count(distinct section_id)::int as marked from attendance_records where subject_type = 'student' and period_id = ${ZERO_UUID}::uuid and date = ${today}`);
        const avg = (xs: typeof series) => { const m = xs.reduce((a, x) => a + x.marked, 0); return m ? pct(xs.reduce((a, x) => a + x.present, 0), m) : null; };
        const byClass = await rows<{ name: string; marked: number; present: number }>(tx, sql`
          select c.name || '-' || s.name as name, count(*)::int as marked, count(*) filter (where a.status in ${PRESENT})::int as present
          from attendance_records a join sections s on s.id = a.section_id join classes c on c.id = s.class_id
          where a.subject_type = 'student' and a.period_id = ${ZERO_UUID}::uuid and a.date between ${addDays(today, -29)} and ${today}
          group by c.name, s.name, c."order" order by c."order", s.name`);
        const staffToday = await rows<{ marked: number; present: number }>(tx, sql`select count(*)::int as marked, count(*) filter (where status in ${PRESENT})::int as present from attendance_records where subject_type = 'staff' and date = ${today}`);
        out.attendance = {
          today: { marked: n(t?.marked), present: n(t?.present), absent: n(t?.absent), late: n(t?.late), pct: t ? pct(n(t.present), n(t.marked)) : null, sectionsMarked: n(sec?.marked), sectionsTotal: ppl!.sections },
          last7: avg(series.slice(-7)), prev7: avg(series.slice(-14, -7)),
          staffToday: { marked: n(staffToday[0]?.marked), pct: pct(n(staffToday[0]?.present), n(staffToday[0]?.marked)) },
          daily: series,
          byClass: byClass.map((r) => ({ name: r.name, pct: pct(n(r.present), n(r.marked)), marked: n(r.marked) })),
        };
      }

      if (this.all('fees.dashboard.view') || this.all('fees.report.view')) out.fees = await this.feeBlock(tx, today, rangeDays);

      if (this.all('crm.lead.view')) {
        const [l] = await rows<{ cur: number; prev: number; won: number; follow_due: number }>(tx, sql`select
          (select count(*) from leads where created_at >= ${from}::date)::int as cur,
          (select count(*) from leads where created_at >= ${addDays(from, -rangeDays)}::date and created_at < ${from}::date)::int as prev,
          (select count(*) from leads where student_id is not null and updated_at >= ${from}::date)::int as won,
          (select count(*) from leads where next_follow_up_at is not null and next_follow_up_at <= now())::int as follow_due`);
        const stages = await rows<{ name: string; n: number; is_won: boolean; is_lost: boolean }>(tx, sql`
          select ps.name, ps.is_won, ps.is_lost, count(l.id)::int as n from pipeline_stages ps left join leads l on l.stage_id = ps.id group by ps.id, ps.name, ps."order", ps.is_won, ps.is_lost order by ps."order"`);
        const sources = await rows<{ source: string; n: number }>(tx, sql`select coalesce(nullif(source, ''), 'direct') as source, count(*)::int as n from leads where created_at >= ${addDays(today, -89)}::date group by 1 order by 2 desc limit 6`);
        out.admissions = { leads: n(l?.cur), leadsPrev: n(l?.prev), converted: n(l?.won), followUpsDue: n(l?.follow_due), stages: stages.map((s) => ({ name: s.name, count: n(s.n), won: s.is_won, lost: s.is_lost })), sources: sources.map((s) => ({ source: s.source, count: n(s.n) })) };
      }

      if (this.all('transport.trip.manage') || this.all('transport.route.view')) {
        const [tr] = await rows<{ live: number; vehicles: number; sos: number }>(tx, sql`select
          (select count(*) from trips where status = 'running')::int as live,
          (select count(*) from vehicles where is_active)::int as vehicles,
          (select count(*) from trip_events where kind = 'sos' and at > now() - interval '24 hours')::int as sos`).catch(() => [{ live: 0, vehicles: 0, sos: 0 }]);
        out.transport = { live: n(tr?.live), vehicles: n(tr?.vehicles), sos24h: n(tr?.sos) };
      }

      if (Authz.decide('attendance.leave.approve').allowed) {
        const [pl] = await rows<{ n: number }>(tx, sql`select count(*)::int as n from leave_requests where status = 'pending'`);
        out.approvals = { pendingLeaves: n(pl?.n) };
      }

      out.alerts = this.alerts(out);
      return out;
    });
  }

  private alerts(d: Record<string, any>) {
    const a: { tone: 'bad' | 'warn' | 'info'; title: string; detail: string; href: string }[] = [];
    const att = d.attendance;
    if (att && att.today.sectionsTotal && att.today.sectionsMarked < att.today.sectionsTotal) {
      const left = att.today.sectionsTotal - att.today.sectionsMarked;
      a.push({ tone: 'warn', title: `${left} ${left === 1 ? 'section has' : 'sections have'} not marked attendance today`, detail: `${att.today.sectionsMarked} of ${att.today.sectionsTotal} done`, href: '/app/attendance' });
    }
    for (const c of (att?.byClass ?? []).filter((x: any) => x.pct !== null && x.pct < 75).slice(0, 3)) a.push({ tone: 'bad', title: `Low attendance in ${c.name}`, detail: `${c.pct}% over the last 30 days`, href: '/app/attendance' });
    if (d.fees?.overduePaise > 0) a.push({ tone: 'warn', title: 'Overdue fees', detail: `${d.fees.overdueStudents} students owe ₹${(d.fees.overduePaise / 100).toLocaleString('en-IN')}`, href: '/app/fees?tab=defaulters' });
    if (d.approvals?.pendingLeaves) a.push({ tone: 'info', title: `${d.approvals.pendingLeaves} leave ${d.approvals.pendingLeaves === 1 ? 'request' : 'requests'} awaiting approval`, detail: 'Students and staff', href: '/app/attendance?tab=leave' });
    if (d.transport?.sos24h) a.push({ tone: 'bad', title: `${d.transport.sos24h} SOS alert${d.transport.sos24h === 1 ? '' : 's'} in the last 24 hours`, detail: 'Check transport', href: '/app/transport' });
    if (d.admissions?.followUpsDue) a.push({ tone: 'info', title: `${d.admissions.followUpsDue} admission follow-ups due`, detail: 'Counsellor tasks', href: '/app/crm' });
    return a;
  }

  private async feeBlock(tx: Tx, today: string, rangeDays: number) {
    const from = addDays(today, -(rangeDays - 1));
    const daily = await rows<{ d: string; total: number }>(tx, sql`select collected_at::date::text as d, sum(total_paise)::bigint as total from receipts where cancelled_at is null and collected_at::date between ${from} and ${today} group by 1`);
    const byDay = new Map(daily.map((r) => [r.d, n(r.total)]));
    const monthly = await rows<{ mon: string; total: number }>(tx, sql`
      with m as (select generate_series(date_trunc('month', ${today}::date) - interval '11 months', date_trunc('month', ${today}::date), interval '1 month')::date as mon)
      select to_char(m.mon, 'YYYY-MM') as mon, coalesce((select sum(total_paise) from receipts r where r.cancelled_at is null and date_trunc('month', r.collected_at)::date = m.mon), 0)::bigint as total from m order by m.mon`);
    const [t] = await rows<Record<string, number>>(tx, sql`select
      (select coalesce(sum(total_paise),0) from receipts where cancelled_at is null and collected_at::date = ${today})::bigint as today,
      (select coalesce(sum(total_paise),0) from receipts where cancelled_at is null and date_trunc('month', collected_at) = date_trunc('month', ${today}::date))::bigint as month,
      (select coalesce(sum(total_paise),0) from receipts where cancelled_at is null and date_trunc('month', collected_at) = date_trunc('month', ${today}::date) - interval '1 month'
         and collected_at::date <= (${today}::date - interval '1 month'))::bigint as prev_month_to_date,
      (select coalesce(sum(amount_paise - discount_paise),0) from student_fees where status <> 'cancelled')::bigint as billed,
      (select coalesce(sum(paid_paise),0) from student_fees where status <> 'cancelled')::bigint as paid,
      (select coalesce(sum(amount_paise - discount_paise - paid_paise),0) from student_fees where status in ('unpaid','partial'))::bigint as outstanding,
      (select coalesce(sum(amount_paise - discount_paise - paid_paise),0) from student_fees where status in ('unpaid','partial') and due_on < ${today})::bigint as overdue,
      (select count(distinct student_id) from student_fees where status in ('unpaid','partial') and due_on < ${today})::int as overdue_students,
      (select count(*) from receipts where cancelled_at is null and collected_at::date = ${today})::int as receipts_today`);
    const byMode = await rows<{ mode: string; total: number }>(tx, sql`select mode::text, sum(total_paise)::bigint as total from receipts where cancelled_at is null and date_trunc('month', collected_at) = date_trunc('month', ${today}::date) group by 1 order by 2 desc`);
    const byClass = await rows<{ name: string; billed: number; paid: number }>(tx, sql`
      select c.name, coalesce(sum(f.amount_paise - f.discount_paise),0)::bigint as billed, coalesce(sum(f.paid_paise),0)::bigint as paid
      from student_fees f join enrollments e on e.student_id = f.student_id and e.session_id = f.session_id join classes c on c.id = e.class_id
      where f.status <> 'cancelled' group by c.name, c."order" order by c."order"`);
    return {
      todayPaise: n(t!.today), monthPaise: n(t!.month), prevMonthToDatePaise: n(t!.prev_month_to_date), billedPaise: n(t!.billed), paidPaise: n(t!.paid),
      outstandingPaise: n(t!.outstanding), overduePaise: n(t!.overdue), overdueStudents: n(t!.overdue_students), receiptsToday: n(t!.receipts_today),
      collectionPct: pct(n(t!.paid), n(t!.billed)),
      daily: days(today, rangeDays).map((d) => ({ date: d, paise: byDay.get(d) ?? 0 })),
      monthly: monthly.map((m) => ({ month: m.mon, paise: n(m.total) })),
      byMode: byMode.map((m) => ({ mode: m.mode, paise: n(m.total) })),
      byClass: byClass.map((c) => ({ name: c.name, billedPaise: n(c.billed), paidPaise: n(c.paid), pct: pct(n(c.paid), n(c.billed)) })),
    };
  }

  // ---------------------------------------------------------------- finance (accountant)
  async finance(rangeDays: number) {
    const today = this.today();
    return this.db.t(async (tx) => {
      const fees = await this.feeBlock(tx, today, rangeDays);
      const recent = await rows<any>(tx, sql`select r.id, r.number, r.total_paise, r.mode::text, r.collected_at, s.name as student from receipts r join students s on s.id = r.student_id where r.cancelled_at is null order by r.collected_at desc limit 8`);
      const defaulters = await rows<any>(tx, sql`select s.id, s.name, s.admission_no, sum(f.amount_paise - f.discount_paise - f.paid_paise)::bigint as due, min(f.due_on)::text as since
        from student_fees f join students s on s.id = f.student_id where f.status in ('unpaid','partial') and f.due_on < ${today} group by s.id order by due desc limit 8`);
      return {
        today, fees,
        recentReceipts: recent.map((r) => ({ id: r.id, number: r.number, paise: n(r.total_paise), mode: r.mode, at: r.collected_at, student: r.student })),
        topDefaulters: defaulters.map((d) => ({ id: d.id, name: d.name, admissionNo: d.admission_no, duePaise: n(d.due), since: d.since })),
      };
    });
  }

  // ---------------------------------------------------------------- teacher (scope-driven)
  async teacher() {
    const today = this.today();
    const f = Authz.filter('attendance.student.view');
    const sectionIds = f.kind === 'all' ? null : f.kind === 'some' ? [...new Set([...f.sectionIds, ...f.subjectSections.map((s) => s.sectionId)])] : [];
    const staffId = Ctx.get().personIds?.staff ?? null;
    return this.db.t(async (tx) => {
      if (sectionIds !== null && !sectionIds.length) return { today, sections: [], homework: { dueSoon: 0, toEvaluate: 0 }, trend: [] };
      const inScope = sectionIds ? sql`and s.id = any(${sql.param(sectionIds)}::uuid[])` : sql``;
      const secs = await rows<any>(tx, sql`
        select s.id, c.name || '-' || s.name as name, (s.class_teacher_id = ${staffId}) as is_class_teacher,
          (select count(*) from enrollments e join academic_sessions ss on ss.id = e.session_id and ss.is_current where e.section_id = s.id and e.status = 'active')::int as strength,
          (select count(*) from attendance_records a where a.section_id = s.id and a.subject_type = 'student' and a.period_id = ${ZERO_UUID}::uuid and a.date = ${today})::int as marked,
          (select count(*) from attendance_records a where a.section_id = s.id and a.subject_type = 'student' and a.period_id = ${ZERO_UUID}::uuid and a.date = ${today} and a.status in ${PRESENT})::int as present
        from sections s join classes c on c.id = s.class_id where true ${inScope} order by c."order", s.name limit 40`);
      const trend = await rows<any>(tx, sql`
        select a.date::text as d, count(*)::int as marked, count(*) filter (where a.status in ${PRESENT})::int as present
        from attendance_records a join sections s on s.id = a.section_id
        where a.subject_type = 'student' and a.period_id = ${ZERO_UUID}::uuid and a.date between ${addDays(today, -13)} and ${today} ${inScope} group by a.date`);
      const tmap = new Map(trend.map((r) => [r.d, r]));
      const [hw] = await rows<any>(tx, sql`select
        (select count(*) from homework h join sections s on s.id = h.section_id where h.due_on between ${today} and ${addDays(today, 3)} ${inScope})::int as due_soon,
        (select count(*) from homework_submissions hs join homework h on h.id = hs.homework_id join sections s on s.id = h.section_id where hs.status = 'submitted' ${inScope})::int as to_evaluate`);
      return {
        today,
        sections: secs.map((s) => ({ id: s.id, name: s.name, isClassTeacher: !!s.is_class_teacher, strength: n(s.strength), markedToday: n(s.marked) > 0, presentPct: pct(n(s.present), n(s.marked)) })),
        homework: { dueSoon: n(hw?.due_soon), toEvaluate: n(hw?.to_evaluate) },
        trend: days(today, 14).map((d) => { const r = tmap.get(d); return { date: d, pct: r ? pct(n(r.present), n(r.marked)) : null }; }),
      };
    });
  }

  // ---------------------------------------------------------------- parent / student
  async family() {
    const today = this.today();
    const ids = Ctx.get().studentIds ?? [];
    if (!ids.length) return { today, children: [] };
    return this.db.t(async (tx) => {
      const kids = await rows<any>(tx, sql`
        select st.id, st.name, c.name as class_name, s.name as section_name, e.section_id,
          (select a.status::text from attendance_records a where a.subject_type = 'student' and a.subject_id = st.id and a.period_id = ${ZERO_UUID}::uuid and a.date = ${today}) as today_status,
          (select count(*) from attendance_records a where a.subject_type = 'student' and a.subject_id = st.id and a.period_id = ${ZERO_UUID}::uuid and a.date > ${addDays(today, -30)} and a.status <> 'holiday')::int as days,
          (select count(*) from attendance_records a where a.subject_type = 'student' and a.subject_id = st.id and a.period_id = ${ZERO_UUID}::uuid and a.date > ${addDays(today, -30)} and a.status in ${PRESENT})::int as present,
          (select coalesce(sum(f.amount_paise - f.discount_paise - f.paid_paise),0) from student_fees f where f.student_id = st.id and f.status in ('unpaid','partial'))::bigint as due,
          (select coalesce(sum(f.amount_paise - f.discount_paise - f.paid_paise),0) from student_fees f where f.student_id = st.id and f.status in ('unpaid','partial') and f.due_on < ${today})::bigint as overdue,
          (select min(f.due_on)::text from student_fees f where f.student_id = st.id and f.status in ('unpaid','partial') and f.due_on >= ${today}) as next_due,
          (select count(*) from homework h where h.section_id = e.section_id and h.due_on >= ${today})::int as homework_open,
          (select json_build_object('percentage', r.percentage, 'grade', r.grade, 'rank', r.rank, 'exam', x.name) from results r join exams x on x.id = r.exam_id where r.student_id = st.id and r.published_at is not null order by r.published_at desc limit 1) as last_result,
          (select json_build_object('status', t.status::text, 'startedAt', t.started_at) from student_transports stt join trips t on t.vehicle_id = stt.vehicle_id and t.status = 'running' where stt.student_id = st.id and stt.is_active limit 1) as bus
        from students st
        left join enrollments e on e.student_id = st.id and e.session_id = (select id from academic_sessions where is_current limit 1)
        left join sections s on s.id = e.section_id left join classes c on c.id = s.class_id
        where st.id = any(${sql.param(ids)}::uuid[]) and st.deleted_at is null order by st.name`);
      return {
        today,
        children: kids.map((k) => ({
          id: k.id, name: k.name, className: k.class_name, sectionName: k.section_name, todayStatus: k.today_status,
          attendance30: { days: n(k.days), present: n(k.present), pct: pct(n(k.present), n(k.days)) },
          fees: { duePaise: n(k.due), overduePaise: n(k.overdue), nextDue: k.next_due },
          homeworkOpen: n(k.homework_open), lastResult: k.last_result, bus: k.bus,
        })),
      };
    });
  }
}

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly svc: DashboardsService) {}
  private range(r?: string) { return r === '7' ? 7 : r === '90' ? 90 : 30; }

  @Can('reports.dashboard.view') @Get('institution') institution(@Query('range') r?: string) { return this.svc.institution(this.range(r)); }
  @Can('fees.dashboard.view', 'fees.report.view') @Get('finance') finance(@Query('range') r?: string) { return this.svc.finance(this.range(r)); }
  @Can('attendance.student.view', 'homework.assignment.view') @Scoped() @Get('teacher') teacher() { return this.svc.teacher(); }
  @Can('self.*') @Get('family') family() { return this.svc.family(); }
}

@Module({ controllers: [DashboardsController], providers: [DashboardsService] })
export class DashboardsModule {}
