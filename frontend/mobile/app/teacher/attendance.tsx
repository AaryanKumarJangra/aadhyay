import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Chip, EmptyState, ErrorState, Icon, Screen, Skeleton, SyncBanner, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { enqueue, flush, useQueue } from '@/lib/offline';
import { today, useTheme } from '@/lib/theme';

type Status = 'present' | 'absent' | 'late' | 'half_day' | 'leave';
const OPTS: { v: Status; s: string; label: string; color: string }[] = [
  { v: 'present', s: 'P', label: 'Present', color: '#0D9488' }, { v: 'absent', s: 'A', label: 'Absent', color: '#DC2626' },
  { v: 'late', s: 'L', label: 'Late', color: '#B45309' }, { v: 'half_day', s: 'HD', label: 'Half day', color: '#A16207' }, { v: 'leave', s: 'LV', label: 'Leave', color: '#2563EB' },
];

/** Mark a class: everyone starts Present, tap exceptions. Works offline — the register is kept on the phone until sent. */
export default function Attendance() {
  const t = useTheme();
  const { sectionId: initial } = useLocalSearchParams<{ sectionId?: string }>();
  const [sections, setSections] = useState<{ id: string; name: string; canMark: boolean; marked: boolean }[] | null>(null);
  const [sid, setSid] = useState(initial ?? '');
  const [reg, setReg] = useState<any>(null);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const q = useQueue('attendance');
  const date = today();
  useEffect(() => {
    api(`/attendance/sections?date=${date}`).then((s) => { setSections(s); if (!initial) setSid(s.find((x: any) => x.canMark && !x.marked)?.id ?? s[0]?.id ?? ''); }).catch((e) => setErr(e.message));
  }, []);
  const load = useCallback(async () => {
    if (!sid) return;
    setReg(null); setErr('');
    try {
      const r = await api(`/attendance/sections/${sid}?date=${date}`);
      setReg(r); setMarks(Object.fromEntries(r.students.map((s: any) => [s.studentId, (s.status && s.status !== 'holiday' ? s.status : 'present') as Status])));
    } catch (e: any) { setErr(e.message); }
  }, [sid]);
  useEffect(() => { void load(); }, [load]);
  const counts = Object.values(marks).reduce<Record<string, number>>((a, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }), {});
  const sec = sections?.find((s) => s.id === sid);
  async function save() {
    const body = { sectionId: sid, date, entries: Object.entries(marks).filter(([, v]) => v !== 'present').map(([studentId, status]) => ({ studentId, status })), force: !!reg?.holiday, sourceTs: new Date().toISOString() };
    setSaving(true);
    try {
      const r = await api('/attendance/sections/mark', { body });
      void flush('attendance');
      Alert.alert('Attendance saved', `${sec?.name}: ${r.summary.present ?? 0} present, ${r.summary.absent ?? 0} absent.${r.summary.absent ? ' Parents are being notified.' : ''}`, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) Alert.alert('Not saved', e.message);
      else { await enqueue('attendance', '/attendance/sections/mark', body, `${sec?.name ?? 'Class'} · ${date}`); Alert.alert('Saved on this phone', 'You seem to be offline. It will be sent automatically — check the banner for sync status.'); }
    } finally { setSaving(false); }
  }
  return (
    <Screen title="Attendance" subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })} action={<Pressable accessibilityLabel="Close" onPress={() => router.back()} style={{ padding: 8 }}><Icon name="x" size={22} /></Pressable>}>
      <SyncBanner pending={q.pending} failed={q.failed} syncing={q.syncing} onRetry={q.retry} />
      {q.items.filter((i) => i.status === 'failed').map((i) => <ErrorState key={i.id} message={`${i.label}: ${i.error}`} />)}
      {sections === null ? <Skeleton height={44} /> : !sections.length ? <EmptyState icon="users" title="No classes assigned" body="Ask the principal to set you as a class or subject teacher." /> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{sections.map((s) => <Chip key={s.id} on={s.id === sid} label={s.name} icon={s.marked ? 'check' : undefined} onPress={() => setSid(s.id)} />)}</ScrollView>
      )}
      {err ? <ErrorState message={err} onRetry={load} /> : sid && !reg ? <Skeleton height={300} /> : reg && (
        <>
          {reg.holiday && <T muted>Holiday: {reg.holiday.title}. You can still mark if classes were held.</T>}
          {!sec?.canMark && <T muted>You can view this register but not mark it.</T>}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {OPTS.map((o) => <View key={o.v} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}><T size={13}><T bold size={13} style={{ color: o.color }}>{counts[o.v] ?? 0}</T> {o.label}</T></View>)}
          </View>
          {sec?.canMark && <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button title="All present" size="sm" variant="secondary" icon="check-circle" onPress={() => setMarks((m) => Object.fromEntries(Object.keys(m).map((k) => [k, 'present'])))} /></View><View style={{ flex: 1 }}><Button title="All absent" size="sm" variant="secondary" icon="x-circle" onPress={() => setMarks((m) => Object.fromEntries(Object.keys(m).map((k) => [k, 'absent'])))} /></View></View>}
          {!reg.students.length ? <EmptyState title="No students in this class" /> : reg.students.map((s: any) => (
            <View key={s.studentId} style={{ backgroundColor: t.card, borderRadius: 14, borderWidth: 1, borderColor: t.line, padding: 12, gap: 8 }}>
              <T semibold>{s.rollNo ? `${s.rollNo}. ` : ''}{s.name}</T>
              <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel={`Attendance for ${s.name}`}>
                {OPTS.map((o) => {
                  const on = marks[s.studentId] === o.v;
                  return <Pressable key={o.v} disabled={!sec?.canMark} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.label} onPress={() => setMarks((m) => ({ ...m, [s.studentId]: o.v }))}
                    style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? o.color : t.sunken }}><T bold size={13} style={{ color: on ? '#fff' : t.muted }}>{o.s}</T></Pressable>;
                })}
              </View>
            </View>
          ))}
          {sec?.canMark && reg.students.length > 0 && <Button title={reg.marked ? 'Update attendance' : 'Save attendance'} icon="save" loading={saving} onPress={save} />}
        </>
      )}
    </Screen>
  );
}
