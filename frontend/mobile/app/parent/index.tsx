import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, T, Stat, Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme, inr } from '@/lib/theme';

/** Multi-child home: switch child; attendance, fees (pay now), homework, leave. */
export default function ParentHome() {
  const t = useTheme();
  const [kids, setKids] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [data, setData] = useState<any>({});
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const ks = await api('/people/my/children');
    setKids(ks);
    const k = sel ?? ks[0];
    if (!k) return;
    setSel(k);
    const today = new Date().toISOString().slice(0, 10);
    const [att, led, hw] = await Promise.all([
      api(`/attendance/students/${k.id}?from=${today.slice(0, 7)}-01&to=${today}`).catch(() => []),
      api(`/fees/students/${k.id}/ledger`).catch(() => null),
      k.sectionId ? api(`/homework/sections/${k.sectionId}?from=${today}`).catch(() => []) : [],
    ]);
    setData({ att, led, hw });
  }, [sel?.id]);
  useEffect(() => { void load(); }, [load]);
  const present = (data.att ?? []).filter((a: any) => ['present', 'late', 'half_day'].includes(a.status)).length;
  const marked = (data.att ?? []).filter((a: any) => a.status !== 'holiday').length;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {kids.map((k) => (
            <Pressable key={k.id} onPress={() => setSel(k)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: sel?.id === k.id ? t.brand : t.card, borderWidth: 1, borderColor: t.line }}>
              <T style={{ color: sel?.id === k.id ? '#fff' : t.text }} bold>{k.name.split(' ')[0]} · {k.className}-{k.sectionName}</T>
            </Pressable>
          ))}
        </ScrollView>
        {sel && (<>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Stat label="Attendance (month)" value={marked ? `${Math.round((present / marked) * 100)}%` : '—'} />
            <Stat label="Fees due" value={inr(data.led?.totals.outstandingPaise ?? 0)} tone={data.led?.totals.overduePaise ? 'bad' : undefined} />
          </View>
          {data.led?.totals.outstandingPaise > 0 && <Button title={`Pay ${inr(data.led.totals.outstandingPaise)} now`} onPress={() => router.push({ pathname: '/pay', params: { studentId: sel.id } })} />}
          <Card><T bold>Homework</T>{(data.hw ?? []).length ? data.hw.slice(0, 5).map((h: any) => <View key={h.id} style={{ paddingVertical: 6 }}><T>{h.subject}: {h.title}</T><T muted size={12}>Due {h.dueOn}</T></View>) : <T muted>No pending homework 🎉</T>}</Card>
          <Card><T bold>This month</T><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>{(data.att ?? []).map((a: any) => <View key={a.date} style={{ width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: a.status === 'absent' ? '#FEE2E2' : a.status === 'present' ? '#DCFCE7' : '#FEF3C7' }}><T size={11}>{Number(a.date.slice(8))}</T></View>)}</View></Card>
          <Button title="Apply for leave" variant="secondary" onPress={() => router.push({ pathname: '/leave', params: { studentId: sel.id } })} />
        </>)}
        {!kids.length && <Card><T>No children linked to this number yet. Please ask the school office to add your mobile number.</T></Card>}
      </ScrollView>
    </SafeAreaView>
  );
}
