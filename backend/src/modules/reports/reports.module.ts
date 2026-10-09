import { Controller, Get, Injectable, Module, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { Can, RequireModule, Scoped } from '../../kernel/auth/decorators';
import { Authz } from '../../kernel/authz/authz';
import { Ctx } from '../../kernel/context/request-context';
import { todayIn } from '../../common/dates';
import { ZERO_UUID } from '../../common/ids';

/** Dashboards + standard reports + CSV export (docs/03 reports). Read-only SQL, tenant-scoped by RLS. */
@Injectable()
export class ReportsService {
  constructor(private readonly db: DbService) {}
  async dashboard() {
    const today = todayIn(Ctx.get().tenantTz);
    const r = await this.db.t((tx) => tx.execute(sql`select
      (select count(*)::int from students where status = 'active' and deleted_at is null) as students,
      (select count(*)::int from staff where status = 'active' and deleted_at is null) as staff,
      (select count(*)::int from attendance_records where subject_type = 'student' and date = ${today} and period_id = ${ZERO_UUID}::uuid) as marked_today,
      (select count(*)::int from attendance_records where subject_type = 'student' and date = ${today} and period_id = ${ZERO_UUID}::uuid and status in ('present','late','half_day')) as present_today,
      (select coalesce(sum(total_paise),0)::bigint from receipts where cancelled_at is null and collected_at::date = ${today}) as collected_today,
      (select coalesce(sum(total_paise),0)::bigint from receipts where cancelled_at is null and date_trunc('month', collected_at) = date_trunc('month', now())) as collected_month,
      (select coalesce(sum(amount_paise - discount_paise - paid_paise),0)::bigint from student_fees where status in ('unpaid','partial') and due_on < current_date) as overdue,
      (select count(*)::int from leads where created_at > now() - interval '30 days') as leads_30d,
      (select count(*)::int from leads where student_id is not null and updated_at > now() - interval '30 days') as admissions_30d,
      (select count(*)::int from trips where status = 'running') as buses_live,
      (select count(*)::int from leave_requests where status = 'pending') as pending_leaves`));
    const x = r.rows[0] as any;
    return {
      students: x.students, staff: x.staff, attendanceToday: { marked: x.marked_today, present: x.present_today, pct: x.marked_today ? Math.round((x.present_today / x.marked_today) * 1000) / 10 : null },
      fees: { collectedTodayPaise: Number(x.collected_today), collectedMonthPaise: Number(x.collected_month), overduePaise: Number(x.overdue) },
      admissions: { leads30d: x.leads_30d, admitted30d: x.admissions_30d }, busesLive: x.buses_live, pendingLeaves: x.pending_leaves,
    };
  }
  /** Class-wise attendance % for a date range. */
  async attendanceByClass(from: string, to: string, sectionIds: string[] | null) {
    const r = await this.db.t((tx) => tx.execute(sql`select c.name as class_name, s.name as section_name, count(*)::int as marked,
      count(*) filter (where a.status in ('present','late','half_day'))::int as present
      from attendance_records a join sections s on s.id = a.section_id join classes c on c.id = s.class_id
      where a.subject_type = 'student' and a.period_id = ${ZERO_UUID}::uuid and a.date between ${from} and ${to}
      ${sectionIds ? sql`and a.section_id = any(${sql.param(sectionIds)}::uuid[])` : sql``}
      group by c.name, s.name, c."order" order by c."order", s.name`));
    return (r.rows as any[]).map((x) => ({ ...x, pct: x.marked ? Math.round((x.present / x.marked) * 1000) / 10 : null }));
  }
  async feeByClass() {
    const r = await this.db.t((tx) => tx.execute(sql`select c.name as class_name, coalesce(sum(f.amount_paise - f.discount_paise),0)::bigint as billed, coalesce(sum(f.paid_paise),0)::bigint as paid
      from student_fees f join enrollments e on e.student_id = f.student_id and e.session_id = f.session_id join classes c on c.id = e.class_id
      where f.status <> 'cancelled' group by c.name, c."order" order by c."order"`));
    return (r.rows as any[]).map((x) => ({ className: x.class_name, billedPaise: Number(x.billed), paidPaise: Number(x.paid), collectionPct: Number(x.billed) ? Math.round((Number(x.paid) / Number(x.billed)) * 1000) / 10 : null }));
  }
  /** Generic CSV for a whitelisted dataset. */
  async csv(dataset: string) {
    const q: Record<string, ReturnType<typeof sql>> = {
      students: sql`select s.admission_no, s.name, s.gender, s.dob, s.category, s.status, c.name as class, sec.name as section, e.roll_no from students s left join enrollments e on e.student_id = s.id left join classes c on c.id = e.class_id left join sections sec on sec.id = e.section_id where s.deleted_at is null order by c."order", sec.name, s.name`,
      guardians: sql`select g.name, g.phone, g.email, string_agg(s.name, '; ') as children from guardians g join student_guardians sg on sg.guardian_id = g.id join students s on s.id = sg.student_id group by g.id order by g.name`,
      staff: sql`select employee_code, name, phone, email, joining_date, status from staff where deleted_at is null order by name`,
      receipts: sql`select r.number, r.collected_at, s.admission_no, s.name, r.mode, r.total_paise / 100.0 as amount, r.reference, case when r.cancelled_at is null then 'active' else 'cancelled' end as status from receipts r join students s on s.id = r.student_id order by r.collected_at desc`,
      defaulters: sql`select s.admission_no, s.name, sum(f.amount_paise - f.discount_paise - f.paid_paise) / 100.0 as outstanding from student_fees f join students s on s.id = f.student_id where f.status in ('unpaid','partial') and f.due_on < current_date group by s.id order by outstanding desc`,
      leads: sql`select name, phone, source, score, created_at, case when student_id is null then 'open' else 'admitted' end as status from leads order by created_at desc`,
    };
    if (!q[dataset]) return null;
    const r = await this.db.t((tx) => tx.execute(q[dataset]!));
    const rows = r.rows as Record<string, unknown>[];
    const cols = r.fields?.map((f: any) => f.name) ?? Object.keys(rows[0] ?? {});
    const esc = (v: unknown) => (v === null || v === undefined ? '' : `"${String(v instanceof Date ? v.toISOString() : v).replace(/"/g, '""')}"`);
    return '﻿' + [cols.join(','), ...rows.map((row) => cols.map((c: string) => esc(row[c])).join(','))].join('\n');
  }
}

@RequireModule('reports') @Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}
  @Can('reports.dashboard.view') @Get('dashboard') dashboard() { return this.svc.dashboard(); }
  @Can('reports.attendance.view', 'attendance.student.view') @Scoped() @Get('attendance-by-class')
  att(@Query('from') f: string, @Query('to') t: string) {
    const d = todayIn(Ctx.get().tenantTz);
    const fs = [Authz.filter('reports.attendance.view'), Authz.filter('attendance.student.view')];
    const sectionIds = fs.some((x) => x.kind === 'all') ? null : [...new Set(fs.flatMap((x) => (x.kind === 'some' ? x.sectionIds : [])))];
    return this.svc.attendanceByClass(f ?? `${d.slice(0, 7)}-01`, t ?? d, sectionIds);
  }
  @Can('reports.fees.view', 'fees.report.view') @Get('fees-by-class') fees() { return this.svc.feeByClass(); }
  @Can('reports.export.export') @Get('export')
  async export(@Query('dataset') ds: string, @Res() res: FastifyReply) {
    const csv = await this.svc.csv(ds);
    if (csv === null) return res.status(404).send({ error: { code: 'NOT_FOUND', message: 'Unknown dataset' } });
    res.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${ds}.csv"`).send(csv);
  }
}
@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
