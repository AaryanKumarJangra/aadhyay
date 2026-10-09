import { CalendarCheck2, ClipboardCheck, GraduationCap, IndianRupee, Target, UsersRound, Bus, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/server-api';
import { PageHeader, StatCard, pctChange, LinkButton } from '@/components/ui';
import { ChartCard } from '@/components/charts/chart-card';
import { AreaChart, BarChart, BarList, Donut } from '@/components/charts/charts';
import { AlertsPanel, Greeting, RangeFilter, inrFull, inrShort, monthLabel, shortDate, type AlertItem } from './common';

type Day = { date: string; marked: number; present: number; absent: number; late: number; pct: number | null };
interface Institution {
  today: string; rangeDays: number;
  people: { students: number; staff: number; newThisMonth: number; sections: number; monthly: { month: string; students: number }[] };
  attendance?: { today: { marked: number; present: number; absent: number; late: number; pct: number | null; sectionsMarked: number; sectionsTotal: number }; last7: number | null; prev7: number | null; staffToday: { marked: number; pct: number | null }; daily: Day[]; byClass: { name: string; pct: number | null; marked: number }[] };
  fees?: { todayPaise: number; monthPaise: number; prevMonthToDatePaise: number; billedPaise: number; paidPaise: number; outstandingPaise: number; overduePaise: number; overdueStudents: number; collectionPct: number | null; daily: { date: string; paise: number }[]; monthly: { month: string; paise: number }[]; byMode: { mode: string; paise: number }[]; byClass: { name: string; billedPaise: number; paidPaise: number; pct: number | null }[] };
  admissions?: { leads: number; leadsPrev: number; converted: number; followUpsDue: number; stages: { name: string; count: number; won: boolean; lost: boolean }[]; sources: { source: string; count: number }[] };
  transport?: { live: number; vehicles: number; sos24h: number };
  approvals?: { pendingLeaves: number };
  alerts: AlertItem[];
}

const MODE: Record<string, string> = { upi: 'UPI', cash: 'Cash', cheque: 'Cheque', card: 'Card', online: 'Online', bank: 'Bank transfer', dd: 'Demand draft' };
const humanSource = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Owner / Principal / Admin: whole-institution view. Blocks appear only if the API returned them (permission-driven). */
export async function InstitutionDashboard({ name, range }: { name: string; range: number }) {
  const d = await api<Institution>(`/dashboards/institution?range=${range}`);
  const g = Greeting({ name, today: d.today, subtitle: `${d.people.students.toLocaleString('en-IN')} students · ${d.people.staff} staff` });
  const att = d.attendance, fees = d.fees, adm = d.admissions;
  const attHasData = !!att && att.daily.some((x) => x.marked > 0);
  const feeHasData = !!fees && fees.monthly.some((x) => x.paise > 0);

  return (
    <>
      <PageHeader title={g.title} description={g.description} actions={<RangeFilter value={range} />} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Active students" icon={GraduationCap} value={d.people.students.toLocaleString('en-IN')}
          delta={{ value: pctChange(d.people.monthly.at(-1)!.students, d.people.monthly.at(-2)?.students), period: 'vs last month' }}
          trend={d.people.monthly.map((m) => m.students)} href="/app/students" />
        {att && (
          <StatCard label="Attendance today" icon={ClipboardCheck}
            value={att.today.pct === null ? <span className="text-muted">Not marked</span> : `${att.today.pct}%`}
            delta={{ value: att.last7 !== null && att.prev7 !== null ? Math.round((att.last7 - att.prev7) * 10) / 10 : null, period: '7-day avg vs prior week', unit: 'pts' }}
            progress={{ value: att.today.sectionsTotal ? (att.today.sectionsMarked / att.today.sectionsTotal) * 100 : 0, label: `${att.today.sectionsMarked} of ${att.today.sectionsTotal} sections marked` }}
            href="/app/attendance" tone={att.today.pct !== null && att.today.pct < 85 ? 'warn' : 'default'} />
        )}
        {fees && (
          <StatCard label="Collected this month" icon={IndianRupee} value={inrShort(fees.monthPaise)}
            delta={{ value: pctChange(fees.monthPaise, fees.prevMonthToDatePaise), period: 'vs same point last month' }}
            trend={fees.daily.map((x) => x.paise)} href="/app/fees" />
        )}
        {fees && (
          <StatCard label="Overdue fees" icon={AlertTriangle} value={inrShort(fees.overduePaise)} tone={fees.overduePaise ? 'warn' : 'default'}
            progress={{ value: fees.collectionPct ?? 0, label: `${fees.collectionPct ?? 0}% of billed fees collected · ${fees.overdueStudents} students overdue` }}
            href="/app/fees?tab=defaulters" />
        )}
        <StatCard label="Staff" icon={UsersRound} value={d.people.staff} footer={att?.staffToday.marked ? `${att.staffToday.pct}% present today` : 'Staff attendance not marked today'} href="/app/people/staff" />
        {adm && (
          <StatCard label={`New enquiries (${range}d)`} icon={Target} value={adm.leads} delta={{ value: pctChange(adm.leads, adm.leadsPrev), period: `vs previous ${range} days` }}
            footer={`${adm.converted} converted · ${adm.followUpsDue} follow-ups due`} href="/app/crm" />
        )}
        {d.transport && <StatCard label="Buses on the road" icon={Bus} value={`${d.transport.live} / ${d.transport.vehicles}`} footer={d.transport.sos24h ? `${d.transport.sos24h} SOS in 24h` : 'No SOS in the last 24 hours'} href="/app/transport" tone={d.transport.sos24h ? 'bad' : 'default'} />}
        {d.approvals && <StatCard label="Pending approvals" icon={CalendarCheck2} value={d.approvals.pendingLeaves} footer="Leave requests" href="/app/attendance?tab=leave" tone={d.approvals.pendingLeaves ? 'warn' : 'default'} />}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        {att && (
          <ChartCard className="lg:col-span-8" title="Student attendance" description={`Daily present %, last ${range} days`}
            empty={attHasData ? null : { title: 'No attendance data yet', description: 'Once teachers mark attendance, the daily trend appears here.', action: <LinkButton href="/app/attendance" size="sm">Mark attendance</LinkButton> }}
            table={{ columns: ['Date', 'Marked', 'Present', 'Absent', 'Present %'], rows: att.daily.map((x) => [x.date, x.marked, x.present, x.absent, x.pct]) }}>
            <AreaChart labels={att.daily.map((x) => shortDate(x.date))} series={[{ key: 'pct', label: 'Present %', values: att.daily.map((x) => x.pct) }]} format="pct" yMax={100} />
          </ChartCard>
        )}
        <div className={att ? 'lg:col-span-4' : 'lg:col-span-12'}><AlertsPanel alerts={d.alerts} /></div>

        {fees && (
          <ChartCard className="lg:col-span-8" title="Fee collection" description="Collected per month, last 12 months"
            empty={feeHasData ? null : { title: 'No fee collections yet', description: 'Set up fee structures and collect the first payment to see collection trends.', action: <LinkButton href="/app/fees" size="sm">Open fees</LinkButton> }}
            table={{ columns: ['Month', 'Collected (₹)'], rows: fees.monthly.map((m) => [m.month, Math.round(m.paise / 100)]) }}>
            <BarChart categories={fees.monthly.map((m) => monthLabel(m.month))} series={[{ key: 'c', label: 'Collected', values: fees.monthly.map((m) => m.paise) }]} format="inr" />
          </ChartCard>
        )}
        {fees && (
          <ChartCard className="lg:col-span-4" title="This month by payment mode" description={`${inrFull(fees.monthPaise)} collected`}
            empty={fees.byMode.length ? null : { title: 'No payments this month yet' }}
            table={{ columns: ['Mode', 'Collected (₹)'], rows: fees.byMode.map((m) => [MODE[m.mode] ?? m.mode, Math.round(m.paise / 100)]) }}>
            <Donut segments={fees.byMode.slice(0, 5).map((m) => ({ label: MODE[m.mode] ?? m.mode, value: m.paise }))} format="inr" centerLabel="This month" />
          </ChartCard>
        )}

        {att && (
          <ChartCard className="lg:col-span-6" title="Attendance by section" description="Present %, last 30 days"
            empty={att.byClass.length ? null : { title: 'No sections have marked attendance yet' }}
            table={{ columns: ['Section', 'Present %', 'Records'], rows: att.byClass.map((c) => [c.name, c.pct, c.marked]) }}>
            <div className="max-h-80 overflow-y-auto pr-1 scrollbar-thin">
              <BarList rows={[...att.byClass].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)).map((c) => ({ label: c.name, value: c.pct ?? 0 }))} format="pct" max={100} />
            </div>
          </ChartCard>
        )}
        {fees && (
          <ChartCard className="lg:col-span-6" title="Collection by class" description="Share of billed fees collected this session"
            empty={fees.byClass.length ? null : { title: 'No fees assigned yet', description: 'Assign a fee structure to classes to track collection.' }}
            table={{ columns: ['Class', 'Billed (₹)', 'Collected (₹)', 'Collected %'], rows: fees.byClass.map((c) => [c.name, Math.round(c.billedPaise / 100), Math.round(c.paidPaise / 100), c.pct]) }}>
            <div className="max-h-80 overflow-y-auto pr-1 scrollbar-thin">
              <BarList rows={fees.byClass.map((c) => ({ label: c.name, value: c.pct ?? 0, hint: `${inrShort(c.paidPaise)} of ${inrShort(c.billedPaise)}` }))} format="pct" max={100} color="var(--color-series-3)" />
            </div>
          </ChartCard>
        )}

        {adm && (
          <ChartCard className="lg:col-span-6" title="Admissions pipeline" description="Leads at each stage"
            empty={adm.stages.some((s) => s.count) ? null : { title: 'No admission leads yet', description: 'Website enquiry forms and walk-ins create leads automatically.' }}
            table={{ columns: ['Stage', 'Leads'], rows: adm.stages.map((s) => [s.name, s.count]) }}>
            <BarList rows={adm.stages.filter((s) => !s.lost).map((s) => ({ label: s.name, value: s.count }))} format="number" color="var(--color-series-7)" />
          </ChartCard>
        )}
        {adm && (
          <ChartCard className="lg:col-span-6" title="Where enquiries come from" description="Last 90 days"
            empty={adm.sources.length ? null : { title: 'No enquiries in the last 90 days' }}
            table={{ columns: ['Source', 'Leads'], rows: adm.sources.map((s) => [humanSource(s.source), s.count]) }}>
            <Donut segments={adm.sources.slice(0, 6).map((s) => ({ label: humanSource(s.source), value: s.count }))} format="number" centerLabel="Enquiries" />
          </ChartCard>
        )}
      </div>
    </>
  );
}
