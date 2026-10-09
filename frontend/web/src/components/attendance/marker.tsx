'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCheck, CloudOff, Copy, RefreshCw, Save, UserX } from 'lucide-react';
import { call, ClientError } from '@/lib/client';
import { cx } from '@/lib/format';
import { Alert, Avatar, Button, EmptyState, Skeleton, useToast } from '@/components/ui';

type Status = 'present' | 'absent' | 'late' | 'half_day' | 'leave';
const OPTIONS: { v: Status; short: string; label: string; on: string }[] = [
  { v: 'present', short: 'P', label: 'Present', on: 'bg-ok text-white ring-ok' },
  { v: 'absent', short: 'A', label: 'Absent', on: 'bg-bad text-white ring-bad' },
  { v: 'late', short: 'L', label: 'Late', on: 'bg-warn text-white ring-warn' },
  { v: 'half_day', short: 'HD', label: 'Half day', on: 'bg-[#a16207] text-white ring-[#a16207]' },
  { v: 'leave', short: 'LV', label: 'Leave', on: 'bg-info text-white ring-info' },
];
type Row = { studentId: string; name: string; rollNo: string | null; admissionNo: string; status: Status | 'holiday' | null; mode: string | null };
type Register = { date: string; marked: boolean; holiday: { title: string } | null; students: Row[] };
export type SectionOption = { id: string; name: string; canMark: boolean; marked: boolean };

const QUEUE = 'aad:attendance-queue';
const readQueue = (): any[] => { try { return JSON.parse(localStorage.getItem(QUEUE) ?? '[]'); } catch { return []; } };
const writeQueue = (q: any[]) => { try { localStorage.setItem(QUEUE, JSON.stringify(q)); } catch { /* storage unavailable */ } };
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/**
 * Mark attendance for one section and date. Everyone starts Present; tap exceptions. Saves only exceptions (the API
 * fills the rest). Offline: the register is queued on this device and sent when the connection returns — never lost.
 */
export function AttendanceMarker({ sections, initialSection, today }: { sections: SectionOption[]; initialSection?: string; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [sectionId, setSectionId] = useState(initialSection && sections.some((s) => s.id === initialSection) ? initialSection : sections.find((s) => s.canMark && !s.marked)?.id ?? sections[0]?.id ?? '');
  const [date, setDate] = useState(today);
  const [reg, setReg] = useState<Register | null>(null);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [saved, setSaved] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(0);
  const section = sections.find((s) => s.id === sectionId);
  const canMark = !!section?.canMark;

  const load = useCallback(async () => {
    if (!sectionId) return;
    setLoading(true); setError('');
    try {
      const r = await call<Register>(`/attendance/sections/${sectionId}?date=${date}`);
      const m = Object.fromEntries(r.students.map((s) => [s.studentId, (s.status && s.status !== 'holiday' ? s.status : 'present') as Status]));
      setReg(r); setMarks(m); setSaved(r.marked ? m : {});
    } catch (e) { setReg(null); setError(e instanceof Error ? e.message : 'Could not load the register'); } finally { setLoading(false); }
  }, [sectionId, date]);
  useEffect(() => { void load(); }, [load]);

  const flush = useCallback(async () => {
    const q = readQueue();
    if (!q.length) { setPending(0); return; }
    const left: any[] = [];
    for (const b of q) { try { await call('/attendance/sections/mark', { body: b }); } catch (e) { if (!(e instanceof ClientError) || e.status >= 500) left.push(b); } }
    writeQueue(left); setPending(left.length);
    if (left.length < q.length) toast({ tone: 'ok', title: 'Offline attendance synced', body: `${q.length - left.length} saved register(s) sent.` });
  }, [toast]);
  useEffect(() => { setPending(readQueue().length); void flush(); window.addEventListener('online', flush); return () => window.removeEventListener('online', flush); }, [flush]);

  const counts = useMemo(() => Object.values(marks).reduce<Record<string, number>>((a, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }), {}), [marks]);
  const total = Object.keys(marks).length;
  const presentish = (counts.present ?? 0) + (counts.late ?? 0) + (counts.half_day ?? 0);
  const dirty = JSON.stringify(marks) !== JSON.stringify(saved) || !reg?.marked;

  const setAll = (s: Status) => setMarks((m) => Object.fromEntries(Object.keys(m).map((k) => [k, s])));
  async function copyPrevious() {
    try {
      const prev = await call<Register>(`/attendance/sections/${sectionId}?date=${addDays(date, -1)}`);
      if (!prev.marked) { toast({ tone: 'info', title: 'Nothing to copy', body: 'The previous day was not marked.' }); return; }
      setMarks((m) => Object.fromEntries(Object.keys(m).map((k) => [k, ((prev.students.find((x) => x.studentId === k)?.status as Status) ?? 'present')])));
    } catch (e) { toast({ tone: 'bad', title: 'Could not copy', body: e instanceof Error ? e.message : '' }); }
  }

  async function save() {
    const body = { sectionId, date, entries: Object.entries(marks).filter(([, s]) => s !== 'present').map(([studentId, status]) => ({ studentId, status })), force: !!reg?.holiday, sourceTs: new Date().toISOString() };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      writeQueue([...readQueue(), body]); setPending(readQueue().length); setSaved(marks);
      toast({ tone: 'info', title: 'Saved on this device', body: 'You are offline. It will be sent automatically when you reconnect.' });
      return;
    }
    setSaving(true); setError('');
    try {
      const r = await call<{ total: number; summary: Record<string, number> }>('/attendance/sections/mark', { body });
      setSaved(marks); setReg((x) => (x ? { ...x, marked: true } : x));
      toast({ tone: 'ok', title: `Attendance saved for ${section?.name}`, body: `${r.summary.present ?? 0} present · ${r.summary.absent ?? 0} absent${r.summary.absent ? ' · parents are being notified' : ''}` });
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setSaving(false); }
  }

  if (!sections.length) return <EmptyState icon={CalendarDays} title="No classes to show" description="You are not assigned to any class or section yet. Ask your administrator to set you as a class or subject teacher." />;

  return (
    <section className="rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
        <label className="min-w-[180px] flex-1 sm:flex-none">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Class & section</span>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="h-9 w-full rounded-md border border-line bg-surface px-3 text-sm shadow-xs sm:w-56">
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}{s.marked ? ' ✓' : ''}{!s.canMark ? ' (view only)' : ''}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Date</span>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 rounded-md border border-line bg-surface px-3 text-sm shadow-xs" />
        </label>
        {canMark && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button variant="secondary" size="sm" icon={<CheckCheck />} onClick={() => setAll('present')}>All present</Button>
            <Button variant="secondary" size="sm" icon={<UserX />} onClick={() => setAll('absent')}>All absent</Button>
            <Button variant="secondary" size="sm" icon={<Copy />} onClick={copyPrevious}>Copy previous day</Button>
          </div>
        )}
      </div>

      {pending > 0 && <Alert tone="warn" className="m-4" title={`${pending} register${pending === 1 ? '' : 's'} waiting to sync`} action={<Button size="sm" variant="secondary" icon={<RefreshCw />} onClick={flush}>Retry now</Button>}><span className="inline-flex items-center gap-1"><CloudOff className="size-3.5" />Saved on this device; will be sent when you’re back online.</span></Alert>}
      {reg?.holiday && <Alert tone="info" className="m-4" title={`${date} is a holiday — ${reg.holiday.title}`}>You can still mark attendance if classes were held.</Alert>}
      {!canMark && section && <Alert tone="info" className="m-4">You can view this register but not mark it. Your role lets you mark only your assigned classes.</Alert>}
      {date !== today && canMark && <Alert tone="info" className="m-4">You are changing attendance for a past date. Some roles may only edit same-day attendance; the server will tell you if this isn’t allowed.</Alert>}
      {error && <Alert tone="bad" className="m-4">{error}</Alert>}

      <div className="grid grid-cols-3 gap-px border-b border-line bg-line sm:grid-cols-6">
        {[
          { k: 'pct', label: 'Present %', v: total ? `${Math.round((presentish / total) * 1000) / 10}%` : '—' },
          ...OPTIONS.map((o) => ({ k: o.v, label: o.label, v: counts[o.v] ?? 0 })),
        ].map((x) => <div key={x.k} className="bg-surface px-3 py-2 sm:px-4 sm:py-3"><p className="text-[11px] text-muted sm:text-xs">{x.label}</p><p className="text-base font-semibold tabular text-ink sm:text-lg">{x.v}</p></div>)}
      </div>

      {loading && !reg ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : reg && !reg.students.length ? (
        <div className="p-4"><EmptyState compact title="No students in this section" description="Enrol students in this section to take attendance." /></div>
      ) : reg ? (
        <ul className={cx('divide-y divide-line', loading && 'opacity-60')}>
          {reg.students.map((s) => (
            <li key={s.studentId} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-7 text-right text-xs tabular text-faint">{s.rollNo ?? '–'}</span>
                <Avatar name={s.name} size={32} />
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{s.name}</span><span className="text-xs text-muted">{s.admissionNo}{s.mode && s.mode !== 'manual' ? ` · ${s.mode.toUpperCase()} scan` : ''}</span></span>
              </div>
              <div role="radiogroup" aria-label={`Attendance for ${s.name}`} className="flex gap-1 pl-10 sm:pl-0">
                {OPTIONS.map((o) => {
                  const on = marks[s.studentId] === o.v;
                  return (
                    <button key={o.v} type="button" role="radio" aria-checked={on} aria-label={o.label} title={o.label} disabled={!canMark}
                      onClick={() => setMarks((m) => ({ ...m, [s.studentId]: o.v }))}
                      className={cx('h-9 min-w-10 rounded-md px-2 text-xs font-semibold ring-1 ring-inset transition-colors disabled:cursor-default', on ? o.on : 'bg-surface text-muted ring-line hover:bg-sunken')}>
                      {o.short}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {canMark && reg && reg.students.length > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <p className="text-[13px] text-muted">{reg.marked && !dirty ? 'Saved' : dirty && reg.marked ? 'Unsaved changes' : 'Not saved yet'} · absent students’ parents get an alert</p>
          <Button onClick={save} loading={saving} disabled={!dirty} icon={<Save />}>{reg.marked ? 'Update attendance' : 'Save attendance'}</Button>
        </div>
      )}
    </section>
  );
}
