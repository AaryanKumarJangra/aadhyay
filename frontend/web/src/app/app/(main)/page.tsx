import { api } from '@/lib/server-api';
import { Card, PageHeader, Stat, Badge } from '@/components/ui';
import { inr, dateTime } from '@/lib/format';
import { hasPermission } from '@aadhyay/contracts';
import Link from 'next/link';

export default async function Home() {
  const me = await api('/me');
  const staffView = hasPermission(me.permissions, 'reports.dashboard.view') || me.permissions.includes('*');
  if (!staffView && me.kinds.includes('guardian')) return <ParentHome />;
  if (!staffView) return <TeacherHome />;
  const d = await api('/reports/dashboard').catch(() => null);
  return (
    <>
      <PageHeader title="Today" sub={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })} actions={<><Link href="/app/attendance" className="rounded-lg bg-brand px-4 py-2 text-sm text-white">Mark attendance</Link><Link href="/app/fees" className="rounded-lg border border-line bg-surface px-4 py-2 text-sm">Collect fee</Link></>} />
      {d && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Students" value={d.students.toLocaleString('en-IN')} sub={`${d.staff} staff`} />
          <Stat label="Attendance today" value={d.attendanceToday.pct !== null ? `${d.attendanceToday.pct}%` : '—'} sub={`${d.attendanceToday.marked} marked`} tone={d.attendanceToday.pct !== null && d.attendanceToday.pct < 85 ? 'warn' : undefined} />
          <Stat label="Collected this month" value={inr(d.fees.collectedMonthPaise)} sub={`Today ${inr(d.fees.collectedTodayPaise)}`} tone="ok" />
          <Stat label="Overdue fees" value={inr(d.fees.overduePaise)} tone={d.fees.overduePaise ? 'bad' : undefined} sub={<Link href="/app/fees?tab=defaulters" className="underline">View defaulters</Link>} />
          <Stat label="New enquiries (30d)" value={d.admissions.leads30d} sub={`${d.admissions.admitted30d} admitted`} />
          <Stat label="Buses live" value={d.busesLive} />
          <Stat label="Leave requests" value={d.pendingLeaves} sub="awaiting approval" tone={d.pendingLeaves ? 'warn' : undefined} />
        </div>
      )}
    </>
  );
}

async function ParentHome() {
  const kids = await api('/people/my/children');
  const [inbox, ledgers] = await Promise.all([api('/comms/inbox').catch(() => []), Promise.all(kids.map((k: any) => api(`/fees/students/${k.id}/ledger`).catch(() => null)))]);
  return (
    <>
      <PageHeader title="My children" />
      <div className="grid gap-4 md:grid-cols-2">
        {kids.map((k: any, i: number) => {
          const led = ledgers[i];
          return (
            <Card key={k.id} title={<span>{k.name} <span className="text-sm font-normal text-muted">· {k.className}-{k.sectionName}</span></span>}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted">Fees due</p><p className="text-lg font-semibold">{inr(led?.totals.outstandingPaise ?? 0)}</p></div>
                <div><p className="text-muted">Overdue</p><p className={`text-lg font-semibold ${led?.totals.overduePaise ? 'text-bad' : ''}`}>{inr(led?.totals.overduePaise ?? 0)}</p></div>
              </div>
              <div className="mt-4 flex gap-2 text-sm"><Link href={`/app/students/${k.id}`} className="rounded-lg border border-line px-3 py-1.5">Details</Link><Link href="/app/messenger" className="rounded-lg border border-line px-3 py-1.5">Message teacher</Link></div>
            </Card>
          );
        })}
      </div>
      <Card title="Notifications" className="mt-6">
        <ul className="divide-y divide-line">{inbox.slice(0, 15).map((n: any) => <li key={n.id} className="py-3"><p className="font-medium">{n.title} {!n.readAt && <Badge tone="brand">new</Badge>}</p><p className="text-sm text-muted">{n.body}</p><p className="mt-1 text-xs text-muted">{dateTime(n.createdAt)}</p></li>)}</ul>
      </Card>
    </>
  );
}
async function TeacherHome() {
  const tt = await api('/timetable/my').catch(() => []);
  const today = ((new Date().getDay() + 6) % 7) + 1;
  return (
    <>
      <PageHeader title="My day" actions={<Link href="/app/attendance" className="rounded-lg bg-brand px-4 py-2 text-sm text-white">Mark attendance</Link>} />
      <Card title="Today’s classes">{tt.filter((s: any) => s.weekday === today).length ? <ul className="space-y-2">{tt.filter((s: any) => s.weekday === today).map((s: any) => <li key={s.id} className="rounded-lg border border-line px-3 py-2">{s.className}-{s.section} · {s.subject}</li>)}</ul> : <p className="text-muted">No classes scheduled today.</p>}</Card>
    </>
  );
}
