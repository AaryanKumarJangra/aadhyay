import { Injectable } from '@nestjs/common';
import { and, between, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { leaveType, leaveBalance, leaveRequest, salaryStructure, payrollRun, payslip, staff, attendanceRecord, calendarEvent, journalEntry, journalLine, ledgerAccount } from '../../db/schema';
import { Ctx } from '../../kernel/context/request-context';
import { computePayslip, workingDaysIn } from './payroll-math';
import { addDays, daysBetween } from '../../common/dates';
import { ZERO_UUID } from '../../common/ids';
import { badRequest, notFound } from '../../common/errors';

@Injectable()
export class HrService {
  constructor(private readonly db: DbService) {}

  /** Allot yearly leave balances for all active staff from leave types. */
  async allotYear(year: number) {
    return this.db.t(async (tx) => {
      const types = await tx.select().from(leaveType);
      const people = await tx.select({ id: staff.id }).from(staff).where(eq(staff.status, 'active'));
      let n = 0;
      for (const p of people) for (const t of types) {
        await tx.insert(leaveBalance).values({ tenantId: Ctx.tenantId(), staffId: p.id, leaveTypeId: t.id, year, allotted: t.daysPerYear }).onConflictDoNothing();
        n++;
      }
      return { allotted: n };
    });
  }
  async balances(staffId: string, year: number) {
    return this.db.t((tx) => tx.select({ leaveTypeId: leaveBalance.leaveTypeId, name: leaveType.name, allotted: leaveBalance.allotted, used: leaveBalance.used, isPaid: leaveType.isPaid })
      .from(leaveBalance).innerJoin(leaveType, eq(leaveType.id, leaveBalance.leaveTypeId)).where(and(eq(leaveBalance.staffId, staffId), eq(leaveBalance.year, year))));
  }
  /** Deduct balance when a staff leave (already approved in attendance module) has a leave type. */
  async consumeLeave(leaveId: string) {
    return this.db.t(async (tx) => {
      const [l] = await tx.select().from(leaveRequest).where(eq(leaveRequest.id, leaveId));
      if (!l || l.subjectType !== 'staff' || l.status !== 'approved' || !l.leaveTypeId) return { ok: false };
      const days = daysBetween(l.fromDate, l.toDate) + 1;
      const year = Number(l.fromDate.slice(0, 4));
      const [b] = await tx.select().from(leaveBalance).where(and(eq(leaveBalance.staffId, l.subjectId), eq(leaveBalance.leaveTypeId, l.leaveTypeId), eq(leaveBalance.year, year)));
      if (!b) throw badRequest('No leave balance allotted');
      await tx.update(leaveBalance).set({ used: b.used + days }).where(eq(leaveBalance.id, b.id));
      return { ok: true, remaining: b.allotted - b.used - days };
    });
  }

  async setSalary(staffId: string, b: any) {
    const [r] = await this.db.t((tx) => tx.insert(salaryStructure).values({ ...b, staffId, tenantId: Ctx.tenantId() }).onConflictDoUpdate({ target: salaryStructure.staffId, set: { ...b } }).returning());
    return r;
  }

  /**
   * Payroll run for a month: working days (Sundays + holidays excluded), paid days from staff attendance
   * (absent = LOP, half day = 0.5, unpaid leave = LOP), statutory deductions, payslips.
   */
  async run(month: string) {
    return this.db.t(async (tx) => {
      const [existing] = await tx.select().from(payrollRun).where(eq(payrollRun.month, month));
      if (existing && existing.status !== 'draft') throw badRequest('Payroll already approved for this month');
      const from = `${month}-01`, to = addDays(addDays(from, 32).slice(0, 8) + '01', -1);
      const hol = await tx.select().from(calendarEvent).where(and(inArray(calendarEvent.kind, ['holiday', 'vacation']), lte(calendarEvent.startsOn, to), gte(calendarEvent.endsOn, from)));
      const holidays = new Set<string>();
      for (const h of hol) for (let d = h.startsOn; d <= h.endsOn; d = addDays(d, 1)) holidays.add(d);
      const wd = workingDaysIn(month, holidays);
      const [run] = existing ? [existing] : await tx.insert(payrollRun).values({ tenantId: Ctx.tenantId(), month }).returning();
      await tx.delete(payslip).where(eq(payslip.runId, run!.id));
      const structs = await tx.select({ s: salaryStructure, name: staff.name }).from(salaryStructure).innerJoin(staff, eq(staff.id, salaryStructure.staffId)).where(eq(staff.status, 'active'));
      let gross = 0, net = 0;
      for (const { s } of structs) {
        const att = await tx.select({ status: attendanceRecord.status }).from(attendanceRecord).where(and(eq(attendanceRecord.subjectType, 'staff'), eq(attendanceRecord.subjectId, s.staffId), eq(attendanceRecord.periodId, ZERO_UUID), between(attendanceRecord.date, from, to)));
        const unpaidLeave = await tx.execute(sql`select coalesce(sum(least(to_date, ${to}::date) - greatest(from_date, ${from}::date) + 1),0)::float as d from leave_requests l left join leave_types t on t.id = l.leave_type_id
          where l.subject_type = 'staff' and l.subject_id = ${s.staffId} and l.status = 'approved' and l.from_date <= ${to} and l.to_date >= ${from} and coalesce(t.is_paid, false) = false`);
        const lop = att.filter((a) => a.status === 'absent').length + att.filter((a) => a.status === 'half_day').length * 0.5 + Number((unpaidLeave.rows[0] as any).d);
        const paidDays = Math.max(0, wd - lop);
        const p = computePayslip({ basicPaise: s.basicPaise, components: s.components as any, pfEnabled: s.pfEnabled, esiEnabled: s.esiEnabled, ptState: s.ptState, tdsMonthlyPaise: s.tdsMonthlyPaise }, wd, paidDays);
        await tx.insert(payslip).values({ tenantId: Ctx.tenantId(), runId: run!.id, staffId: s.staffId, workingDays: wd, paidDays, grossPaise: p.grossPaise, earnings: p.earnings, deductions: p.deductions, netPaise: p.netPaise });
        gross += p.grossPaise; net += p.netPaise;
      }
      const [r] = await tx.update(payrollRun).set({ totals: { staff: structs.length, grossPaise: gross, netPaise: net, workingDays: wd } }).where(eq(payrollRun.id, run!.id)).returning();
      return r;
    });
  }
  async slips(runId: string) {
    return this.db.t((tx) => tx.select({ p: payslip, name: staff.name, code: staff.employeeCode, bank: staff.bankAccount }).from(payslip).innerJoin(staff, eq(staff.id, payslip.staffId)).where(eq(payslip.runId, runId)));
  }
  /** Approve → journal Dr Salaries / Cr Bank (net) and statutory payables. */
  async approve(runId: string) {
    return this.db.t(async (tx) => {
      const [r] = await tx.update(payrollRun).set({ status: 'approved' }).where(and(eq(payrollRun.id, runId), eq(payrollRun.status, 'draft'))).returning();
      if (!r) throw notFound('Draft payroll run');
      const t = r.totals as any;
      const acc = async (code: string) => (await tx.select().from(ledgerAccount).where(eq(ledgerAccount.code, code)))[0]!;
      const [je] = await tx.insert(journalEntry).values({ tenantId: Ctx.tenantId(), date: `${r.month}-28`, narration: `Payroll ${r.month}`, refType: 'payroll', refId: r.id, createdBy: Ctx.userId() }).returning();
      await tx.insert(journalLine).values([
        { tenantId: Ctx.tenantId(), entryId: je!.id, accountId: (await acc('5000')).id, debitPaise: t.grossPaise, creditPaise: 0 },
        { tenantId: Ctx.tenantId(), entryId: je!.id, accountId: (await acc('1010')).id, debitPaise: 0, creditPaise: t.netPaise },
        { tenantId: Ctx.tenantId(), entryId: je!.id, accountId: (await acc('2000')).id, debitPaise: 0, creditPaise: t.grossPaise - t.netPaise },
      ]);
      return r;
    });
  }
  /** Bank bulk-transfer CSV (account number, IFSC, name, amount). */
  async bankFile(runId: string) {
    const rows = await this.slips(runId);
    const lines = ['Beneficiary Name,Account Number,IFSC,Amount (INR),Narration'];
    for (const r of rows) {
      const b = (r.bank ?? {}) as any;
      lines.push([r.name, b.accountNumber ?? '', b.ifsc ?? '', (r.p.netPaise / 100).toFixed(2), `Salary ${r.code}`].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','));
    }
    return lines.join('\n');
  }
}
