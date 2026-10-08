import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen, Button, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';

const CYCLE: Record<string, string> = { present: 'absent', absent: 'late', late: 'leave', leave: 'present' };
const COLOR: Record<string, string> = { present: '#DCFCE7', absent: '#FEE2E2', late: '#FEF3C7', leave: '#DBEAFE' };

/** 1-tap attendance; works offline (queued and synced later with the original timestamp). */
export default function Attendance() {
  const t = useTheme();
  const [sections, setSections] = useState<{ id: string; label: string }[]>([]);
  const [sid, setSid] = useState('');
  const [reg, setReg] = useState<any>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const date = new Date().toISOString().slice(0, 10);
  useEffect(() => { api('/academics/tree').then((tree) => { const s = tree.flatMap((c: any) => c.sections.map((x: any) => ({ id: x.id, label: `${c.name}-${x.name}` }))); setSections(s); setSid(s[0]?.id ?? ''); }).catch(() => undefined); }, []);
  useEffect(() => { if (sid) api(`/attendance/sections/${sid}?date=${date}`).then((r) => { setReg(r); setMarks(Object.fromEntries(r.students.map((s: any) => [s.studentId, s.status ?? 'present']))); }).catch(() => undefined); }, [sid]);
  async function save() {
    const body = { sectionId: sid, date, entries: Object.entries(marks).filter(([, v]) => v !== 'present').map(([studentId, status]) => ({ studentId, status })), sourceTs: new Date().toISOString() };
    try { const r = await api('/attendance/sections/mark', { body }); setMsg(`Saved · ${Object.entries(r.summary).map(([k, v]) => `${v} ${k}`).join(', ')}`); await flushQueue(); }
    catch { const q = JSON.parse((await AsyncStorage.getItem('att-queue')) ?? '[]'); q.push(body); await AsyncStorage.setItem('att-queue', JSON.stringify(q)); setMsg('Offline — saved on phone, will sync automatically'); }
  }
  return (
    <Screen title="Attendance">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{sections.map((s) => <Pressable key={s.id} onPress={() => setSid(s.id)} style={{ padding: 8, borderRadius: 8, backgroundColor: s.id === sid ? t.brand : t.card }}><T style={{ color: s.id === sid ? '#fff' : t.text }}>{s.label}</T></Pressable>)}</View>
      <T muted>Tap absentees only. Everyone else is present.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {reg?.students.map((s: any) => (
          <Pressable key={s.studentId} onPress={() => setMarks((m) => ({ ...m, [s.studentId]: CYCLE[m[s.studentId] ?? 'present']! }))} style={{ width: '31%', padding: 10, borderRadius: 10, backgroundColor: COLOR[marks[s.studentId] ?? 'present'] }}>
            <T size={11} muted>#{s.rollNo ?? '–'}</T><T size={13} bold>{s.name.split(' ')[0]}</T><T size={11}>{marks[s.studentId]}</T>
          </Pressable>
        ))}
      </View>
      <Button title="Save attendance" onPress={save} />
      {!!msg && <T>{msg}</T>}
    </Screen>
  );
}
export async function flushQueue() {
  const q: any[] = JSON.parse((await AsyncStorage.getItem('att-queue')) ?? '[]');
  const left = [];
  for (const b of q) { try { await api('/attendance/sections/mark', { body: b }); } catch { left.push(b); } }
  await AsyncStorage.setItem('att-queue', JSON.stringify(left));
}
