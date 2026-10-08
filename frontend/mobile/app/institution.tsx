import { useEffect, useState } from 'react';
import { FlatList, Image, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, Field, Card, T, Button } from '@/components/ui';
import { api } from '@/lib/api';
import { setTenant } from '@/lib/session';
import { API } from '@/lib/config';

/** Common "Aadhyay" app: find your school/coaching by name or city, or just use the free Messenger. */
export default function PickInstitution() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setItems([]);
    const t = setTimeout(() => api(`/public/tenants?q=${encodeURIComponent(q)}`, { auth: false }).then((r) => setItems(r.items)).catch(() => undefined), 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Screen title="Find your institution" scroll={false}>
      <T muted>Search by school, college or coaching name, or by city.</T>
      <Field label="Search" value={q} onChangeText={setQ} placeholder="e.g. Delhi Public School Meerut" autoFocus />
      <FlatList data={items} keyExtractor={(i) => i.id} contentContainerStyle={{ gap: 8 }} renderItem={({ item }) => (
        <Card onPress={async () => { await setTenant(item.slug); router.replace('/login'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {item.logoFileId ? <Image source={{ uri: `${API}/v1/files/public/${item.logoFileId}` }} style={{ width: 40, height: 40, borderRadius: 8 }} /> : <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: item.primaryColor ?? '#1E40AF' }} />}
          <View style={{ flex: 1 }}><T bold>{item.name}</T><T muted size={13}>{item.city} · {item.segment}</T></View>
        </Card>
      )} />
      <Button title="Just use Aadhyay Messenger (free)" variant="secondary" onPress={async () => { await setTenant(null); router.replace('/login'); }} />
    </Screen>
  );
}
