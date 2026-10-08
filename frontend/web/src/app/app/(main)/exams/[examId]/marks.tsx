'use client';
import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { call } from '@/lib/client';

export function MarksEntry({ exam, tree }: { exam: any; tree: any[] }) {
  const [scheduleId, setScheduleId] = useState(exam.schedules[0]?.id ?? '');
  const schedule = exam.schedules.find((s: any) => s.id === scheduleId);
  const sections = tree.find((c) => c.id === schedule?.classId)?.sections ?? [];
  const [sectionId, setSectionId] = useState('');
  const [grid, setGrid] = useState<any>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  useEffect(() => { setSectionId(sections[0]?.id ?? ''); }, [scheduleId]);
  useEffect(() => { if (scheduleId && sectionId) call(`/exams/marks/${scheduleId}?sectionId=${sectionId}`).then((g) => { setGrid(g); setVals(Object.fromEntries(g.students.map((s: any) => [s.studentId, s.isAbsent ? 'AB' : s.marks ?? '']))); }); }, [scheduleId, sectionId]);
  async function save() {
    const entries = Object.entries(vals).filter(([, v]) => v !== '').map(([studentId, v]) => ({ studentId, marks: v.toUpperCase() === 'AB' ? null : Number(v), isAbsent: v.toUpperCase() === 'AB' }));
    try { await call('/exams/marks', { body: { scheduleId, entries } }); setMsg(`Saved ${entries.length} marks`); } catch (e: any) { setMsg(e.message); }
  }
  async function publish() { try { await call(`/exams/${exam.id}/publish`, { body: { notify: true } }); setMsg('Published — parents notified'); } catch (e: any) { setMsg(e.message); } }
  return (
    <Card title={<div className="flex flex-wrap gap-2"><select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm">{exam.schedules.map((s: any) => <option key={s.id} value={s.id}>{s.className} · {s.subject} (/{s.maxMarks})</option>)}</select><select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm">{sections.map((s: any) => <option key={s.id} value={s.id}>Section {s.name}</option>)}</select></div>} action={<div className="flex gap-2"><Button variant="secondary" onClick={save}>Save</Button>{!exam.publishedAt && <Button onClick={publish}>Publish results</Button>}</div>}>
      <p className="mb-3 text-xs text-muted">Type marks, or AB for absent. Max {schedule?.maxMarks}, pass {schedule?.passMarks}.</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {grid?.students.map((s: any) => (
          <label key={s.studentId} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm"><span><span className="text-xs text-muted">#{s.rollNo ?? '–'}</span> {s.name}</span>
            <input value={vals[s.studentId] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [s.studentId]: e.target.value }))} inputMode="decimal" className={`h-9 w-20 rounded-md border px-2 text-right tabular ${Number(vals[s.studentId]) > (schedule?.maxMarks ?? 100) ? 'border-bad' : 'border-line'}`} />
          </label>
        ))}
      </div>
      {msg && <p className="mt-4 text-sm">{msg}</p>}
    </Card>
  );
}
