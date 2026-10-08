import { useEffect, useState } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { Screen, Card, T } from '@/components/ui';
import { api } from '@/lib/api';
export default function Inbox() {
  const [items, setItems] = useState<any[]>([]);
  const [r, setR] = useState(false);
  const load = () => api('/comms/inbox').then(setItems).then(() => api('/comms/inbox/read', { body: { all: true } })).catch(() => undefined);
  useEffect(() => { void load(); }, []);
  return (
    <Screen title="Alerts" scroll={false}>
      <FlatList data={items} keyExtractor={(i) => i.id} contentContainerStyle={{ gap: 8 }} refreshControl={<RefreshControl refreshing={r} onRefresh={async () => { setR(true); await load(); setR(false); }} />}
        renderItem={({ item }) => <Card><T bold>{item.title}</T><T>{item.body}</T><T muted size={12}>{new Date(item.createdAt).toLocaleString('en-IN')}</T></Card>}
        ListEmptyComponent={<T muted>No alerts yet.</T>} />
    </Screen>
  );
}
