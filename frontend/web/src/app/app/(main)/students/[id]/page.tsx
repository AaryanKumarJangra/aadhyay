import Link from 'next/link';
import { Bus, CalendarDays, ClipboardCheck, GraduationCap, IndianRupee, NotebookPen, ShieldAlert, Trophy, UsersRound } from 'lucide-react';
import { api } from '@/lib/server-api';
import { getMe, canDo } from '@/lib/me';
import { Alert, Avatar, Badge, Card, DescriptionList, EmptyState, LinkButton, LinkTabs, PageHeader, StatCard, StatusBadge, humanize, statusTone } from '@/components/ui';
import { ChartCard } from '@/components/charts/chart-card';
import { BarChart } from '@/components/charts/charts';
import { inrFull, inrShort, shortDate } from '@/components/dashboards/common';
import { AttendanceCalendar } from '@/components/students/attendance-calendar';
import { Timeline } from '@/components/students/timeline';

type Student = any;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : null);

export default async function Student360({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; month?: string }> }) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, getMe()]);
  const s: Student = await api(`/people/students/${id}`);
  const v = s.visibility ?? { sensitive: false, contact: false, fees: false };
  const family = canDo(me, 'self.*') && !canDo(me, 'people.student.view');
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'attendance', label: 'Attendance' },
    ...(v.fees ? [{ key: 'fees', label: 'Fees' }] : []),
    { key: 'exams', label: 'Exams' },
    { key: 'homework', label: 'Homework' },
    { key: 'profile', label: 'Profile' },
  ];
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? 'overview';
  const base = `/app/students/${id}`;
  const cls = s.current ? `${s.current.className}-${s.current.sectionName}` : 'Not enrolled this year';

  return (
    <>
      <PageHeader
        breadcrumb={family ? undefined : [{ label: 'Students', href: '/app/students' }, { label: s.name }]}
        title={<span className="flex items-center gap-3"><Avatar name={s.name} size={44} /><span>{s.name}</span></span>}
        description={`${cls} · Admission no. ${s.admissionNo}${s.current?.rollNo ? ` · Roll ${s.current.rollNo}` : ''}`}
        meta={<><StatusBadge tone={statusTone(s.status)}>{humanize(s.status)}</StatusBadge>{s.rte && v.sensitive && <Badge tone="info">RTE</Badge>}{s.transport?.length > 0 && <Badge icon={<Bus aria-hidden />}>Uses school bus</Badge>}</>}
      />
      <LinkTabs tabs={tabs} active={tab} basePath={base} />
      {tab === 'overview' && <Overview s={s} id={id} v={v} />}
      {tab === 'attendance' && <AttendanceTab id={id} month={sp.month} />}
      {tab === 'fees' && <FeesTab id={id} family={family} />}
      {tab === 'exams' && <ExamsTab id={id} />}
      {tab === 'homework' && <HomeworkTab sectionId={s.current?.sectionId} />}
      {tab === 'profile' && <ProfileTab s={s} v={v} />}
    </>
  );
}

async function Overview({ s, id, v }: { s: Student; id: string; v: { fees: boolean; contact: boolean } }) {
  const [timeline, results] = await Promise.all([
    api<any[]>(`/people/students/${id}/timeline`, { onForbidden: 'throw' }).catch(() => []),
    api<any[]>(`/exams/students/${id}/results`, { onForbidden: 'throw' }).catch(() => null),
  ]);
  const last = results?.[0];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Attendance (12 months)" icon={ClipboardCheck} value={s.attendance.pct === null ? '—' : `${s.attendance.pct}%`} footer={`${s.attendance.present} of ${s.attendance.days} days present`} href={`/app/students/${id}?tab=attendance`} tone={s.attendance.pct !== null && s.attendance.pct < 75 ? 'bad' : 'default'} />
        {v.fees && s.fees && <StatCard label="Fees due" icon={IndianRupee} value={inrShort(s.fees.duePaise)} footer={s.fees.overduePaise ? `${inrShort(s.fees.overduePaise)} overdue` : 'Nothing overdue'} tone={s.fees.overduePaise ? 'warn' : 'default'} href={`/app/students/${id}?tab=fees`} />}
        <StatCard label="Latest result" icon={Trophy} value={last ? `${last.percentage}%` : '—'} footer={last ? `${last.exam} · Grade ${last.grade ?? '—'}${last.rank ? ` · Rank ${last.rank}` : ''}` : 'No results yet'} href={`/app/students/${id}?tab=exams`} />
        <StatCard label="Class" icon={GraduationCap} value={s.current ? `${s.current.className}-${s.current.sectionName}` : '—'} footer={s.current?.rollNo ? `Roll no. ${s.current.rollNo}` : 'No roll number'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7" title="Timeline" description="Admission, attendance exceptions, payments, results and more">
          <Timeline items={timeline} />
        </Card>
        <div className="space-y-4 lg:col-span-5">
          <Card title="Parents & guardians" action={<UsersRound className="size-4 text-faint" aria-hidden />}>
            {s.guardians.length ? (
              <ul className="space-y-3">{s.guardians.map((g: any) => (
                <li key={g.id} className="flex items-center gap-3"><Avatar name={g.name} size={32} />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">{g.name} {g.isPrimary && <Badge tone="brand">Primary</Badge>}</span><span className="block text-xs capitalize text-muted">{g.relation}{g.userId ? ' · Uses the app' : ''}</span></span>
                  {g.phone ? <a href={`tel:${g.phone}`} className="text-[13px] tabular text-brand">{g.phone}</a> : <span className="text-xs text-faint" title="Phone numbers need the contact permission">Hidden</span>}
                </li>))}</ul>
            ) : <EmptyState compact title="No guardian linked" />}
            {!v.contact && s.guardians.length > 0 && <p className="mt-3 text-xs text-muted">Phone numbers are hidden for your role.</p>}
            {s.siblings.length > 0 && <p className="mt-4 border-t border-line pt-3 text-[13px] text-ink-2">Siblings: {s.siblings.map((x: any) => <Link key={x.id} href={`/app/students/${x.id}`} className="mr-2 font-medium text-brand">{x.name}</Link>)}</p>}
          </Card>
          {s.transport?.length > 0 && (
            <Card title="Transport"><ul className="space-y-1 text-[13px] text-ink-2">{s.transport.map((t: any) => <li key={t.id} className="flex items-center gap-2"><Bus className="size-4 text-muted" aria-hidden /><span className="capitalize">{t.direction}</span></li>)}</ul></Card>
          )}
        </div>
      </div>
    </div>
  );
}

async function AttendanceTab({ id, month }: { id: string; month?: string }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const from = `${m}-01`;
  const end = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const rows = await api<{ date: string; status: string; mode: string; inAt: string | null }[]>(`/attendance/students/${id}?from=${from}&to=${end < today ? end : today}`);
  return <AttendanceCalendar month={m} today={today} records={rows} basePath={`/app/students/${id}?tab=attendance`} />;
}

async function FeesTab({ id, family }: { id: string; family: boolean }) {
  const led = await api<any>(`/fees/students/${id}/ledger`);
  const t = led.totals;
  const net = t.feePaise - t.discountPaise;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total fees" value={inrShort(net)} footer={t.discountPaise ? `After ${inrShort(t.discountPaise)} concession` : 'No concessions'} />
        <StatCard label="Paid" value={inrShort(t.paidPaise)} progress={{ value: net ? (t.paidPaise / net) * 100 : 0, label: `${net ? Math.round((t.paidPaise / net) * 100) : 0}% paid` }} />
        <StatCard label="Outstanding" value={inrShort(t.outstandingPaise)} />
        <StatCard label="Overdue" value={inrShort(t.overduePaise)} tone={t.overduePaise ? 'bad' : 'default'} />
      </div>
      {family && t.outstandingPaise > 0 && <Alert tone="info" title="Pay online">Open the Aadhyay app and tap <span className="font-medium">Fees → Pay now</span> to pay by UPI, card or net banking.</Alert>}
      <Card title="Fee ledger" flush>
        {led.lines.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-5 py-2.5 font-medium">Fee</th><th className="px-3 py-2.5 font-medium">Due</th><th className="px-3 py-2.5 text-right font-medium">Amount</th><th className="px-3 py-2.5 text-right font-medium">Paid</th><th className="px-3 py-2.5 text-right font-medium">Balance</th><th className="px-5 py-2.5 font-medium">Status</th></tr></thead>
              <tbody>{led.lines.map((l: any) => (
                <tr key={l.id} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-ink">{l.title}</td><td className="px-3 py-3 text-ink-2">{shortDate(l.dueOn)}</td>
                  <td className="px-3 py-3 text-right tabular">{inrFull(l.amountPaise)}</td><td className="px-3 py-3 text-right tabular">{inrFull(l.paidPaise + (l.lateFeePaise ?? 0))}</td>
                  <td className={`px-3 py-3 text-right font-medium tabular ${l.overdue ? 'text-bad' : ''}`}>{inrFull(l.outstandingPaise)}</td>
                  <td className="px-5 py-3"><StatusBadge tone={l.status === 'paid' ? 'ok' : l.overdue ? 'bad' : 'warn'}>{l.status === 'paid' ? 'Paid' : l.overdue ? 'Overdue' : humanize(l.status)}</StatusBadge></td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : <div className="p-5"><EmptyState compact icon={IndianRupee} title="No fees assigned yet" description="Fees appear here once a fee structure is assigned to the class." /></div>}
      </Card>
    </div>
  );
}

async function ExamsTab({ id }: { id: string }) {
  const results = await api<any[]>(`/exams/students/${id}/results`);
  if (!results.length) return <EmptyState icon={Trophy} title="No results yet" description="Results appear here when the school publishes them." />;
  const chron = [...results].reverse();
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <ChartCard className="lg:col-span-7" title="Percentage by exam" table={{ columns: ['Exam', '%', 'Grade', 'Rank'], rows: chron.map((r) => [r.exam, r.percentage, r.grade, r.rank]) }}>
        <BarChart categories={chron.map((r) => r.exam)} series={[{ key: 'p', label: 'Percentage', values: chron.map((r) => Number(r.percentage)) }]} format="pct" />
      </ChartCard>
      <Card className="lg:col-span-5" title="Results" flush>
        <ul className="divide-y divide-line">{results.map((r) => (
          <li key={r.examId} className="flex items-center justify-between gap-3 px-5 py-3">
            <span><span className="block text-sm font-medium text-ink">{r.exam}</span><span className="text-xs text-muted">{r.group ?? ''}{r.publishedAt ? '' : ' · Not published'}</span></span>
            <span className="text-right"><span className="block text-sm font-semibold tabular">{r.percentage}% · {r.grade ?? '—'}</span><span className="text-xs text-muted">{r.rank ? `Rank ${r.rank}` : ''} {r.isPass ? '' : '· Needs support'}</span></span>
          </li>))}</ul>
      </Card>
    </div>
  );
}

async function HomeworkTab({ sectionId }: { sectionId?: string }) {
  if (!sectionId) return <EmptyState icon={NotebookPen} title="Not enrolled in a section this year" />;
  const hw = await api<any[]>(`/homework/sections/${sectionId}`, { onForbidden: 'throw' }).catch(() => null);
  if (hw === null) return <Alert tone="warn">Homework for this class isn’t visible to your role.</Alert>;
  if (!hw.length) return <EmptyState icon={NotebookPen} title="No homework assigned yet" />;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return (
    <Card title="Homework" description="Class assignments, latest first" flush>
      <ul className="divide-y divide-line">{hw.map((h) => (
        <li key={h.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0"><span className="block font-medium text-ink">{h.title}</span><span className="text-xs text-muted">{h.subject ?? 'General'} · {h.teacher ?? ''} · set {shortDate(h.assignedOn)}</span></span>
          <span className="flex items-center gap-2"><CalendarDays className="size-3.5 text-faint" aria-hidden /><span className="text-[13px] text-ink-2">Due {shortDate(h.dueOn)}</span>{h.dueOn >= today ? <Badge tone="warn">Open</Badge> : <Badge>Closed</Badge>}</span>
        </li>))}</ul>
    </Card>
  );
}

function ProfileTab({ s, v }: { s: Student; v: { sensitive: boolean; contact: boolean } }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Personal details">
        <DescriptionList items={[
          { label: 'Date of birth', value: fmtDate(s.dob) }, { label: 'Gender', value: s.gender ? humanize(s.gender) : null }, { label: 'Blood group', value: s.bloodGroup }, { label: 'House', value: s.house },
          { label: 'Admitted on', value: fmtDate(s.admittedOn) }, { label: 'Status', value: humanize(s.status) },
          ...(v.contact ? [{ label: 'Phone', value: s.phone }, { label: 'Email', value: s.email }] : []),
        ]} />
      </Card>
      <Card title="Sensitive information" action={<ShieldAlert className="size-4 text-warn" aria-hidden />}>
        {v.sensitive ? (
          <DescriptionList items={[{ label: 'Category', value: s.category ? s.category.toUpperCase() : null }, { label: 'Religion', value: s.religion }, { label: 'APAAR ID', value: s.apaarId }, { label: 'RTE admission', value: s.rte ? 'Yes' : 'No' }, { label: 'Address', value: s.address }]} columns={1} />
        ) : <p className="text-sm text-muted">Hidden for your role. Category, religion, ID numbers and address need the “sensitive student data” permission.</p>}
      </Card>
    </div>
  );
}
