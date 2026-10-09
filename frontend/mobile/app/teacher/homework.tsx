import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Chip, ErrorState, Field, Icon, Screen, SectionTitle, Skeleton, T } from '@/components/ui';
import { api } from '@/lib/api';
import { today } from '@/lib/theme';

const plus = (n: number) => { const d = new Date(`${today()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Assign homework to one of your classes; parents and students are notified in the app. */
export default function Homework() {
  const [sections, setSections] = useState<any[] | null>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [sectionId, setSection] = useState(''), [subjectId, setSubject] = useState(''), [title, setTitle] = useState(''), [body, setBody] = useState(''), [dueOn, setDue] = useState(plus(1));
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/attendance/sections?date=${today()}`).then((s) => { setSections(s); setSection(s[0]?.id ?? ''); }).catch((e) => setErr(e.message));
    api('/academics/subjects?limit=100').then((r) => setSubjects(r.items)).catch(() => setSubjects([]));
  }, []);
  const send = async () => {
    setBusy(true);
    try { await api('/homework', { body: { sectionId, subjectId, title, body: body || undefined, dueOn } }); Alert.alert('Homework sent', 'Parents and students are notified in the app.', [{ text: 'OK', onPress: () => router.back() }]); }
    catch (e: any) { Alert.alert('Not sent', e.message); } finally { setBusy(false); }
  };
  return (
    <Screen title="Assign homework" action={<Pressable accessibilityLabel="Close" onPress={() => router.back()} style={{ padding: 8 }}><Icon name="x" size={22} /></Pressable>}>
      {err ? <ErrorState message={err} /> : sections === null ? <Skeleton height={120} /> : (
        <>
          <SectionTitle title="Class" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{sections.map((s) => <Chip key={s.id} on={s.id === sectionId} label={s.name} onPress={() => setSection(s.id)} />)}</ScrollView>
          <SectionTitle title="Subject" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{subjects.map((s) => <Chip key={s.id} on={s.id === subjectId} label={s.name} onPress={() => setSubject(s.id)} />)}</View>
          <Field label="Homework" value={title} onChangeText={setTitle} placeholder="Exercise 4.2, questions 1–10" />
          <Field label="Details (optional)" value={body} onChangeText={setBody} multiline placeholder="Instructions for students" />
          <SectionTitle title="Due" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[1, 2, 3, 7].map((n) => <Chip key={n} on={dueOn === plus(n)} label={n === 1 ? 'Tomorrow' : label(plus(n))} onPress={() => setDue(plus(n))} />)}</View>
          <T muted size={13}>Due {label(dueOn)}</T>
          <Button title="Send to class" icon="send" loading={busy} disabled={!sectionId || !subjectId || title.trim().length < 2} onPress={send} />
        </>
      )}
    </Screen>
  );
}
