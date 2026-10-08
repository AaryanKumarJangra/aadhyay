import { useEffect, useState } from 'react';
import { Screen, Field, Button, T } from '@/components/ui';
import { api } from '@/lib/api';
export default function Homework() {
  const [tree, setTree] = useState<any[]>([]), [subjects, setSubjects] = useState<any[]>([]);
  const [sectionId, setSection] = useState(''), [subjectId, setSubject] = useState(''), [title, setTitle] = useState(''), [dueOn, setDue] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/academics/tree').then(setTree).catch(() => undefined); api('/academics/subjects').then((r) => setSubjects(r.items)).catch(() => undefined); }, []);
  const secs = tree.flatMap((c) => c.sections.map((s: any) => ({ id: s.id, label: `${c.name}-${s.name}` })));
  return (
    <Screen title="Assign homework">
      <T muted>Class: {secs.map((s) => (s.id === sectionId ? `[${s.label}]` : s.label)).join('  ')}</T>
      <Field label="Section (tap a class above or paste id)" value={secs.find((s) => s.id === sectionId)?.label ?? ''} onChangeText={(v) => setSection(secs.find((s) => s.label.toLowerCase() === v.toLowerCase())?.id ?? '')} placeholder="e.g. Class 6-A" />
      <Field label="Subject" value={subjects.find((s) => s.id === subjectId)?.name ?? ''} onChangeText={(v) => setSubject(subjects.find((s) => s.name.toLowerCase() === v.toLowerCase())?.id ?? '')} placeholder="e.g. Mathematics" />
      <Field label="Homework" value={title} onChangeText={setTitle} placeholder="Exercise 4.2, Q1–10" />
      <Field label="Due (YYYY-MM-DD)" value={dueOn} onChangeText={setDue} />
      <Button title="Send to class" disabled={!sectionId || !subjectId || !title} onPress={async () => { try { await api('/homework', { body: { sectionId, subjectId, title, dueOn } }); setMsg('Sent — parents notified in the app'); setTitle(''); } catch (e: any) { setMsg(e.message); } }} />
      {!!msg && <T>{msg}</T>}
    </Screen>
  );
}
