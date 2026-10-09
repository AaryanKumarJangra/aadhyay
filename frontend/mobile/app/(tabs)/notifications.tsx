import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chip, EmptyState, ErrorState, Icon, Skeleton, T } from '@/components/ui';
import { api } from '@/lib/api';
import { CATEGORY_ICON, CATEGORY_LABEL, categoryOf, routeFor, type Category } from '@/lib/notify';
import { useTheme } from '@/lib/theme';

type N = { id: string; eventKey: string; title: string; body: string; studentId: string | null; data: any; readAt: string | null; createdAt: string };
const ago = (iso: string) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }); };

/** Alerts inbox: every notification is also kept here (free), filterable, tap → the exact record. */
export default function Notifications() {
  const t = useTheme();
  const [items, setItems] = useState<N[] | null>(null);
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { setErr(''); try { setItems(await api('/comms/inbox')); } catch (e: any) { setErr(e.message); } }, []);
  useEffect(() => { void load(); }, [load]);
  const markAll = async () => { await api('/comms/inbox/read', { body: { all: true } }).catch(() => undefined); setItems((x) => x?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null); };
  const open = async (n: N) => {
    if (!n.readAt) void api('/comms/inbox/read', { body: { ids: [n.id] } }).catch(() => undefined);
    setItems((x) => x?.map((y) => (y.id === n.id ? { ...y, readAt: new Date().toISOString() } : y)) ?? null);
    router.push(routeFor(n) as never);
  };
  const cats = [...new Set((items ?? []).map((n) => categoryOf(n.eventKey)))];
  const shown = (items ?? []).filter((n) => cat === 'all' || categoryOf(n.eventKey) === cat);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T bold size={28}>Alerts</T>
        {(items ?? []).some((n) => !n.readAt) && <Button title="Mark all read" size="sm" variant="ghost" icon="check" onPress={markAll} />}
      </View>
      {cats.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>{(['all', ...cats] as const).map((c) => <Chip key={c} on={cat === c} label={c === 'all' ? 'All' : CATEGORY_LABEL[c]} onPress={() => setCat(c)} />)}</ScrollView>}
      {err ? <View style={{ padding: 16 }}><ErrorState message={err} onRetry={load} /></View> : items === null ? <View style={{ padding: 16, gap: 10 }}><Skeleton height={72} /><Skeleton height={72} /><Skeleton height={72} /></View> : (
        <FlatList data={shown} keyExtractor={(n) => n.id} contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={<EmptyState icon="bell-off" title="You’re all caught up" body="Attendance, fees, transport and notices alerts appear here." />}
          renderItem={({ item: n }) => {
            const c = categoryOf(n.eventKey);
            return (
              <Pressable onPress={() => open(n)} accessibilityRole="button" accessibilityLabel={`${n.title}. ${n.body}${n.readAt ? '' : '. Unread'}`}
                style={({ pressed }) => ({ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: n.readAt ? t.line : t.brandLine, padding: 14, flexDirection: 'row', gap: 12, opacity: pressed ? 0.85 : 1 })}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={CATEGORY_ICON[c]} color={t.brand} size={17} /></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><T semibold={!n.readAt} numberOfLines={1} style={{ flex: 1 }}>{n.title}</T><T muted size={12}>{ago(n.createdAt)}</T></View>
                  <T muted size={14} numberOfLines={2}>{n.body}</T>
                </View>
              </Pressable>
            );
          }} />
      )}
    </SafeAreaView>
  );
}
