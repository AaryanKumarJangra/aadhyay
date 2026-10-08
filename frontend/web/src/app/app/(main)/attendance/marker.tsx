'use client';
import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { call } from '@/lib/client';
import { cx, todayIST } from '@/lib/format';

const NEXT: Record<string, string> = { present: 'absent', absent: 'late', late: 'half_day', half_day: 'leave', leave: 'present' };
const STYLE: Record<string, string> = { present: 'bg-ok/10 border-ok/30 text-ok', absent: 'bg-bad/10 border-bad/30 text-bad', late: 'bg-warn/10 border-warn/30 text-warn', half_day: 'bg-warn/10 border-warn/30 text-warn', leave: 'bg-brand/10 border-brand/30 text-brand' };

export function AttendanceMarker({ tree }: { tree: any[] }) {
  const sections = tree.flatMap((c) => c.sections.map((s: any) => ({ id: s.id, label: `${c.name}-${s.name}` })));
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '');
  const [date, setDate] = useState(todayIST());
  const [reg, setReg] = useState<any>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!sectionId) return;
    call(`/attendance/sections/${sectionId}?date=${date}`).then((r) => { setReg(r); setMarks(Object.fromEntries(r.students.map((s: any) => [s.studentId, s.status ?? 'present']))); });
  }, [sectionId, date]);
  async function save() {
    setMsg('');
    const entries = Object.entries(marks).filter(([, st]) => st !== 'present').map(([studentId, status]) => ({ studentId, status }));
    try {
      const r = await call('/attendance/sections/mark', { body: { sectionId, date, entries, force: !!reg?.holiday } });
      setMsg(`Saved: ${Object.entries(r.summary).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    } catch (e: any) { setMsg(e.message); }
  }
  const counts = Object.values(marks).reduce((a: any, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }), {});
  return (
    <Card title={<div className="flex flex-wrap gap-3"><select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm">{sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select><input type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" /></div>} action={<Button onClick={save}>Save attendance</Button>}>
      {reg?.holiday && <p className="mb-3 rounded-lg bg-warn/10 p-3 text-sm">Holiday: {reg.holiday.title}</p>}
      <p className="mb-3 text-sm text-muted">{Object.entries(counts).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(' · ')}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {reg?.students.map((s: any) => (
          <button key={s.studentId} onClick={() => setMarks((m) => ({ ...m, [s.studentId]: NEXT[m[s.studentId] ?? 'present']! }))} className={cx('rounded-lg border p-3 text-left text-sm transition', STYLE[marks[s.studentId] ?? 'present'])}>
            <span className="text-xs opacity-70">#{s.rollNo ?? '–'}</span><span className="block font-medium text-ink">{s.name}</span><span className="text-xs capitalize">{(marks[s.studentId] ?? 'present').replace('_', ' ')}{s.mode && s.mode !== 'manual' ? ` · ${s.mode}` : ''}</span>
          </button>
        ))}
      </div>
      {msg && <p className="mt-4 text-sm">{msg}</p>}
    </Card>
  );
}
