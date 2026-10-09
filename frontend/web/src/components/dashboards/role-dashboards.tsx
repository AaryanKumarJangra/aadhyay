import Link from 'next/link';
import { AlertTriangle, ArrowRight, BookOpenCheck, Bus, CalendarClock, ClipboardCheck, IndianRupee, NotebookPen, ReceiptText, Trophy, Wallet } from 'lucide-react';
import { api } from '@/lib/server-api';
import { Badge, Card, EmptyState, LinkButton, PageHeader, StatCard, StatusBadge, humanize, pctChange, statusTone, Avatar } from '@/components/ui';
import { ChartCard } from '@/components/charts/chart-card';
import { AreaChart, BarList, Donut } from '@/components/charts/charts';
import { NAV_ICONS } from '@/components/shell/icons';
import type { NavGroup } from '@/lib/navigation';
import { Greeting, RangeFilter, inrFull, inrShort, shortDate } from './common';

const MODE: Record<string, string> = { upi: 'UPI', cash: 'Cash', cheque: 'Cheque', card: 'Card', online: 'Online', bank: 'Bank transfer', dd: 'Demand draft' };
const timeAgo = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

// ------------------------------------------------------------------------------------------------ Accountant
export async function FinanceDashboard({ name, range }: { name: string; range: number }) {
  const d = await api<any>(`/dashboards/finance?range=${range}`);
  const f = d.fees;
  const g = Greeting({ name, today: d.today, subtitle: 'Fees & collections' });
  return (
    <>
      <PageHeader title={g.title} description={g.description} actions={<><RangeFilter value={range} /><LinkButton href="/app/fees" icon={<IndianRupee />}>Collect fee</LinkButton></>} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Collected today" icon={Wallet} value={inrShort(f.todayPaise)} footer={`${f.receiptsToday} receipts issued today`} />
        <StatCard label="Collected this month" icon={IndianRupee} value={inrShort(f.monthPaise)} delta={{ value: pctChange(f.monthPaise, f.prevMonthToDatePaise), period: 'vs same point last month' }} trend={f.daily.map((x: any) => x.paise)} />
        <StatCard label="Outstanding" icon={ReceiptText} value={inrShort(f.outstandingPaise)} progress={{ value: f.collectionPct ?? 0, label: `${f.collectionPct ?? 0}% of billed fees collected` }} />
        <StatCard label="Overdue" icon={AlertTriangle} value={inrShort(f.overduePaise)} footer={`${f.overdueStudents} students past due date`} tone={f.overduePaise ? 'warn' : 'default'} href="/app/fees?tab=defaulters" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        <ChartCard className="lg:col-span-8" title="Daily collection" description={`Last ${range} days`}
          empty={f.daily.some((x: any) => x.paise) ? null : { title: `No collections in the last ${range} days`, description: 'Receipts from the fee desk and online payments appear here.' }}
          table={{ columns: ['Date', 'Collected (₹)'], rows: f.daily.map((x: any) => [x.date, Math.round(x.paise / 100)]) }}>
          <AreaChart labels={f.daily.map((x: any) => shortDate(x.date))} series={[{ key: 'c', label: 'Collected', values: f.daily.map((x: any) => x.paise) }]} format="inr" />
        </ChartCard>
        <ChartCard className="lg:col-span-4" title="By payment mode" description="This month" empty={f.byMode.length ? null : { title: 'No payments this month yet' }}
          table={{ columns: ['Mode', 'Collected (₹)'], rows: f.byMode.map((m: any) => [MODE[m.mode] ?? m.mode, Math.round(m.paise / 100)]) }}>
          <Donut segments={f.byMode.slice(0, 5).map((m: any) => ({ label: MODE[m.mode] ?? m.mode, value: m.paise }))} format="inr" centerLabel="This month" />
        </ChartCard>
        <Card className="lg:col-span-6" title="Recent receipts" action={<Link href="/app/fees" className="text-[13px] font-medium text-brand">Fee desk</Link>} flush>
          {d.recentReceipts.length ? (
            <ul className="divide-y divide-line">{d.recentReceipts.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                <span className="min-w-0"><span className="block truncate font-medium text-ink">{r.student}</span><span className="text-xs text-muted">{r.number} · {MODE[r.mode] ?? r.mode} · {timeAgo(r.at)}</span></span>
                <span className="shrink-0 font-semibold tabular">{inrFull(r.paise)}</span>
              </li>))}</ul>
          ) : <div className="p-5"><EmptyState compact title="No receipts yet" /></div>}
        </Card>
        <Card className="lg:col-span-6" title="Largest overdue balances" action={<Link href="/app/fees?tab=defaulters" className="text-[13px] font-medium text-brand">All defaulters</Link>} flush>
          {d.topDefaulters.length ? (
            <ul className="divide-y divide-line">{d.topDefaulters.map((x: any) => (
              <li key={x.id}><Link href={`/app/students/${x.id}?tab=fees`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px] hover:bg-surface-2">
                <span className="min-w-0"><span className="block truncate font-medium text-ink">{x.name}</span><span className="text-xs text-muted">{x.admissionNo} · due since {shortDate(x.since)}</span></span>
                <span className="shrink-0 font-semibold tabular text-bad">{inrFull(x.duePaise)}</span>
              </Link></li>))}</ul>
          ) : <div className="p-5"><EmptyState compact title="No overdue fees" description="Everyone is up to date." /></div>}
        </Card>
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ Teacher
export async function TeacherDashboard({ name }: { name: string }) {
  const [d, tt] = await Promise.all([api<any>('/dashboards/teacher'), api<any[]>('/timetable/my', { onForbidden: 'throw' }).catch(() => [])]);
  const g = Greeting({ name, today: d.today, subtitle: `${d.sections.length} ${d.sections.length === 1 ? 'class' : 'classes'}` });
  const weekday = ((new Date(`${d.today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const todays = tt.filter((s) => s.weekday === weekday);
  const pending = d.sections.filter((s: any) => !s.markedToday);
  const hasTrend = d.trend.some((x: any) => x.pct !== null);
  return (
    <>
      <PageHeader title={g.title} description={g.description} actions={<LinkButton href="/app/attendance" icon={<ClipboardCheck />}>Mark attendance</LinkButton>} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Attendance to mark" icon={ClipboardCheck} value={pending.length} footer={pending.length ? pending.map((s: any) => s.name).join(', ') : 'All your classes are marked today'} tone={pending.length ? 'warn' : 'default'} href="/app/attendance" />
        <StatCard label="Classes today" icon={CalendarClock} value={todays.length} footer={todays.length ? `${todays[0].className}-${todays[0].section} first` : 'No periods scheduled today'} />
        <StatCard label="Homework due (3 days)" icon={NotebookPen} value={d.homework.dueSoon} footer="Across your sections" />
        <StatCard label="Submissions to check" icon={BookOpenCheck} value={d.homework.toEvaluate} tone={d.homework.toEvaluate ? 'warn' : 'default'} footer={d.homework.toEvaluate ? 'Waiting for your review' : 'Nothing to evaluate'} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7" title="My classes" description="Today’s attendance status" flush>
          {d.sections.length ? (
            <ul className="divide-y divide-line">{d.sections.map((s: any) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-medium text-ink">{s.name}{s.isClassTeacher && <Badge tone="indigo">Class teacher</Badge>}</span><span className="text-xs text-muted">{s.strength} students</span></span>
                {s.markedToday ? <StatusBadge tone="ok">{s.presentPct}% present</StatusBadge> : <LinkButton href={`/app/attendance?section=${s.id}`} size="sm" variant="subtle">Mark now</LinkButton>}
              </li>))}</ul>
          ) : <div className="p-5"><EmptyState compact title="No classes assigned to you yet" description="Ask the principal or admin to set you as a class or subject teacher." /></div>}
        </Card>
        <Card className="lg:col-span-5" title="Today’s timetable" flush>
          {todays.length ? (
            <ol className="divide-y divide-line">{todays.map((s: any, i: number) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]"><span className="grid size-7 place-items-center rounded-md bg-brand-soft text-xs font-semibold text-brand">{i + 1}</span><span className="flex-1"><span className="font-medium text-ink">{s.className}-{s.section}</span> · {s.subject}</span>{s.room && <span className="text-xs text-muted">Room {s.room}</span>}</li>
            ))}</ol>
          ) : <div className="p-5"><EmptyState compact title="No periods today" description="Your timetable appears here once it is published." /></div>}
        </Card>
        <ChartCard className="lg:col-span-12" title="Attendance in my classes" description="Present %, last 14 days"
          empty={hasTrend ? null : { title: 'No attendance marked in the last 14 days' }}
          table={{ columns: ['Date', 'Present %'], rows: d.trend.map((x: any) => [x.date, x.pct]) }}>
          <AreaChart labels={d.trend.map((x: any) => shortDate(x.date))} series={[{ key: 'p', label: 'Present %', values: d.trend.map((x: any) => x.pct) }]} format="pct" yMax={100} height={180} />
        </ChartCard>
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ Parent / student
export async function FamilyDashboard({ name, isStudent }: { name: string; isStudent: boolean }) {
  const d = await api<any>('/dashboards/family');
  const g = Greeting({ name, today: d.today });
  if (!d.children.length) {
    return <><PageHeader title={g.title} description={g.description} /><EmptyState title="No students linked to your account yet" description="Ask the school office to link your phone number to your child’s admission record." /></>;
  }
  return (
    <>
      <PageHeader title={g.title} description={g.description} />
      <div className="grid gap-4 lg:grid-cols-2">
        {d.children.map((k: any) => (
          <Card key={k.id} className="overflow-hidden" flush>
            <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-5 py-4">
              <Avatar name={k.name} size={40} />
              <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink">{isStudent ? 'My overview' : k.name}</p><p className="text-xs text-muted">{k.className ? `${k.className} – ${k.sectionName}` : 'Not assigned to a class'}</p></div>
              {k.todayStatus ? <StatusBadge tone={statusTone(k.todayStatus)}>{humanize(k.todayStatus)} today</StatusBadge> : <Badge>Not marked yet</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-px bg-line">
              {[
                { icon: ClipboardCheck, label: 'Attendance (30 days)', value: k.attendance30.pct === null ? '—' : `${k.attendance30.pct}%`, sub: `${k.attendance30.present} of ${k.attendance30.days} days`, href: `/app/students/${k.id}?tab=attendance` },
                { icon: IndianRupee, label: 'Fees due', value: inrShort(k.fees.duePaise), sub: k.fees.overduePaise ? `${inrShort(k.fees.overduePaise)} overdue` : k.fees.nextDue ? `Next due ${shortDate(k.fees.nextDue)}` : 'Nothing due', href: `/app/students/${k.id}?tab=fees`, bad: k.fees.overduePaise > 0 },
                { icon: NotebookPen, label: 'Open homework', value: k.homeworkOpen, sub: 'Due today or later', href: `/app/students/${k.id}?tab=homework` },
                { icon: Trophy, label: 'Last result', value: k.lastResult ? `${k.lastResult.percentage}%` : '—', sub: k.lastResult ? `${k.lastResult.exam} · Grade ${k.lastResult.grade ?? '—'}` : 'No published results', href: `/app/students/${k.id}?tab=exams` },
              ].map((x) => (
                <Link key={x.label} href={x.href} className="group bg-surface px-5 py-4 hover:bg-surface-2">
                  <dt className="flex items-center gap-1.5 text-xs text-muted"><x.icon className="size-3.5" aria-hidden />{x.label}</dt>
                  <dd className={`mt-1 text-xl font-semibold ${x.bad ? 'text-bad' : 'text-ink'}`}>{x.value}</dd>
                  <dd className="text-xs text-muted">{x.sub}</dd>
                </Link>
              ))}
            </dl>
            {k.bus && <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-[13px]"><Bus className="size-4 text-ok" aria-hidden /><span className="flex-1">School bus is on the way</span><Link href="/app/transport" className="font-medium text-brand">Track</Link></div>}
          </Card>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ Everyone else
/** Librarian, HR, driver, front office…: their modules as a launchpad (from their own navigation). */
export function LaunchpadDashboard({ name, roles, nav, today }: { name: string; roles: string[]; nav: NavGroup[]; today: string }) {
  const g = Greeting({ name, today, subtitle: roles.join(', ') || undefined });
  const items = nav.flatMap((grp) => grp.items).filter((i) => i.key !== 'dashboard' && i.key !== 'access');
  return (
    <>
      <PageHeader title={g.title} description={g.description} />
      {items.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((i) => {
            const Icon = NAV_ICONS[i.icon];
            return (
              <Link key={i.key} href={i.href} className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm hover:shadow-md">
                <span className="grid size-11 place-items-center rounded-lg bg-brand-soft text-brand"><Icon className="size-5" aria-hidden /></span>
                <span className="flex-1 font-medium text-ink">{i.label}</span>
                <ArrowRight className="size-4 text-faint group-hover:text-ink-2" aria-hidden />
              </Link>
            );
          })}
        </div>
      ) : <EmptyState title="Nothing to show yet" description="Your role does not include any console modules. Use the Aadhyay mobile app, or ask your administrator for access." action={<LinkButton href="/app/access" variant="secondary">See my access</LinkButton>} />}
    </>
  );
}
