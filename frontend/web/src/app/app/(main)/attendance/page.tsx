import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';
import { api } from '@/lib/server-api';
import { guard, canDo } from '@/lib/me';
import { LinkTabs, PageHeader, StatusBadge, Badge } from '@/components/ui';
import { AttendanceMarker, type SectionOption } from '@/components/attendance/marker';
import { LeaveList, type Leave } from '@/components/attendance/leave-list';
import { cx } from '@/lib/format';

export const metadata = { title: 'Attendance' };
type Sec = SectionOption & { strength: number; present: number; absent: number };

export default async function Attendance({ searchParams }: { searchParams: Promise<{ tab?: string; section?: string }> }) {
  const { me, denied } = await guard('attendance.student.view', 'attendance.student.create');
  if (denied) return denied;
  const sp = await searchParams;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const sections = await api<Sec[]>(`/attendance/sections?date=${today}`);
  const canLeave = canDo(me, 'attendance.leave.view') || canDo(me, 'attendance.leave.approve');
  const tabs = [{ key: 'mark', label: 'Mark attendance' }, ...(sections.length > 1 ? [{ key: 'today', label: 'Today', count: sections.filter((s) => !s.marked).length }] : []), ...(canLeave ? [{ key: 'leave', label: 'Leave requests' }] : [])];
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? 'mark';
  const marked = sections.filter((s) => s.marked).length;
  return (
    <>
      <PageHeader title="Attendance" breadcrumb={[{ label: 'Academics' }, { label: 'Attendance' }]}
        description={sections.length ? `${marked} of ${sections.length} ${sections.length === 1 ? 'class' : 'classes'} marked today` : 'Daily attendance for your classes'} />
      <LinkTabs tabs={tabs} active={tab} basePath="/app/attendance" />
      {tab === 'mark' && <AttendanceMarker sections={sections} initialSection={sp.section} today={today} />}
      {tab === 'today' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sections.map((s) => {
            const pct = s.marked && s.strength ? Math.round((s.present / s.strength) * 1000) / 10 : null;
            return (
              <Link key={s.id} href={`/app/attendance?section=${s.id}`} className={cx('rounded-xl border bg-surface p-4 shadow-sm hover:shadow-md', s.marked ? 'border-line' : 'border-warn/30')}>
                <div className="flex items-center justify-between"><p className="font-semibold text-ink">{s.name}</p>{s.marked ? <CheckCircle2 className="size-4 text-ok" aria-label="Marked" /> : <Circle className="size-4 text-warn" aria-label="Not marked" />}</div>
                <p className="mt-1 text-xs text-muted">{s.strength} students</p>
                <div className="mt-3">{s.marked ? <StatusBadge tone={pct !== null && pct < 85 ? 'warn' : 'ok'}>{pct}% present · {s.absent} absent</StatusBadge> : <Badge tone="warn">Not marked yet</Badge>}</div>
              </Link>
            );
          })}
        </div>
      )}
      {tab === 'leave' && <LeaveList rows={await api<Leave[]>('/attendance/leave')} canDecide={canDo(me, 'attendance.leave.approve')} />}
    </>
  );
}
