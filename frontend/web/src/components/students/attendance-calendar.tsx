import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from '@/lib/format';

const STYLE: Record<string, { cls: string; letter: string; label: string }> = {
  present: { cls: 'bg-ok-soft text-ok ring-ok/20', letter: 'P', label: 'Present' },
  late: { cls: 'bg-warn-soft text-warn ring-warn/25', letter: 'L', label: 'Late' },
  half_day: { cls: 'bg-warn-soft text-warn ring-warn/25', letter: 'H', label: 'Half day' },
  absent: { cls: 'bg-bad-soft text-bad ring-bad/20', letter: 'A', label: 'Absent' },
  leave: { cls: 'bg-info-soft text-info ring-info/20', letter: 'LV', label: 'Leave' },
  holiday: { cls: 'bg-sunken text-muted ring-line', letter: 'Ho', label: 'Holiday' },
};

/** Month calendar of a student's attendance. Each day shows a letter as well as a colour (never colour alone). */
export function AttendanceCalendar({ month, today, records, basePath }: { month: string; today: string; records: { date: string; status: string; inAt: string | null }[]; basePath: string }) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const by = new Map(records.map((r) => [r.date, r]));
  const counts = records.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
  const working = records.filter((r) => r.status !== 'holiday').length;
  const present = (counts.present ?? 0) + (counts.late ?? 0) + (counts.half_day ?? 0);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const label = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <section className="rounded-xl border border-line bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-1">
          <Link href={`${basePath}&month=${prev}`} scroll={false} aria-label="Previous month" className="grid size-8 place-items-center rounded-md hover:bg-sunken"><ChevronLeft className="size-4" /></Link>
          <h2 className="min-w-[150px] text-center text-[15px] font-semibold">{label}</h2>
          {next <= today.slice(0, 7) ? <Link href={`${basePath}&month=${next}`} scroll={false} aria-label="Next month" className="grid size-8 place-items-center rounded-md hover:bg-sunken"><ChevronRight className="size-4" /></Link> : <span className="size-8" />}
        </div>
        <p className="text-[13px] text-ink-2"><span className="text-lg font-semibold tabular text-ink">{working ? `${Math.round((present / working) * 1000) / 10}%` : '—'}</span> present · {present} of {working} working days</p>
      </header>
      <div className="p-4 sm:p-5">
        <div role="grid" aria-label={`Attendance for ${label}`} className="grid grid-cols-7 gap-1.5 text-center">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} role="columnheader" className="pb-1 text-[11px] font-medium text-muted">{d}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={`x${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, '0')}`;
            const r = by.get(date);
            const st = r ? STYLE[r.status] : undefined;
            const future = date > today;
            return (
              <div key={date} role="gridcell" aria-label={`${date}: ${st?.label ?? (future ? 'upcoming' : 'not marked')}`} title={st?.label}
                className={cx('flex h-11 flex-col items-center justify-center rounded-lg ring-1 ring-inset sm:h-14', st ? st.cls : future ? 'text-faint ring-transparent' : 'bg-surface-2 text-muted ring-line', date === today && 'outline outline-2 outline-offset-1 outline-brand')}>
                <span className="text-[13px] font-medium tabular">{i + 1}</span>
                {st && <span className="text-[10px] font-semibold leading-none">{st.letter}</span>}
              </div>
            );
          })}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2" aria-label="Legend">
          {Object.entries(STYLE).map(([k, v]) => <li key={k} className="flex items-center gap-1.5"><span className={cx('grid h-4 min-w-4 place-items-center rounded px-0.5 text-[9px] font-semibold ring-1 ring-inset', v.cls)}>{v.letter}</span>{v.label}{counts[k] ? <span className="tabular text-muted">({counts[k]})</span> : null}</li>)}
        </ul>
        {!records.length && <p className="mt-4 text-sm text-muted">No attendance marked in this month yet.</p>}
      </div>
    </section>
  );
}
