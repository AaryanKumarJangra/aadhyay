import { useEffect, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { router } from 'expo-router';
import * as Contacts from 'expo-contacts';
import { Screen, Card, T, Field, Button } from '@/components/ui';
import { api } from '@/lib/api';
import { messenger } from '@/lib/messenger';
import { session } from '@/lib/session';

/** Chats — free & end-to-end encrypted for everyone, including people outside any institution. */
export default function Chats() {
  const [convs, setConvs] = useState<any[]>([]);
  const [phone, setPhone] = useState('');
  const me = session.get().userId;
  const load = () => api('/messenger/conversations').then(setConvs).catch(() => undefined);
  useEffect(() => { messenger.init().then(load); const off = messenger.on((e) => e.type === 'conversation' && load()); return off; }, []);
  async function start(p: string) {
    const c = await api('/messenger/conversations', { body: { kind: 'direct', memberPhones: [p] } });
    if (c.pendingInvites?.length) Alert.alert('Not on Aadhyay yet', 'Your messages will be delivered when they join. Share an invite?', [{ text: 'Later' }, { text: 'Share', onPress: () => import('react-native').then(({ Share }) => Share.share({ message: c.pendingInvites[0].inviteText })) }]);
    router.push(`/chat/${c.id}`);
  }
  async function importContacts() {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') return;
    const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
    const phones = data.flatMap((c) => (c.phoneNumbers ?? []).map((p) => p.number ?? '')).filter(Boolean).slice(0, 5000);
    const r = await api('/messenger/contacts/discover', { body: { phones } });
    Alert.alert('Contacts', `${r.matches.length} of your contacts use Aadhyay.`);
  }
  const title = (c: any) => c.title ?? c.members.filter((m: any) => m.userId !== me).map((m: any) => m.name).join(', ');
  return (
    <Screen title="Chats" scroll={false}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Field label="New chat — mobile number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} /></View>
        <View style={{ width: 90 }}><Button title="Chat" onPress={() => start(phone)} disabled={phone.replace(/\D/g, '').length < 10} /></View>
      </View>
      <Button title="Find contacts on Aadhyay" variant="secondary" onPress={importContacts} />
      <FlatList data={convs} keyExtractor={(c) => c.id} contentContainerStyle={{ gap: 8 }} renderItem={({ item }) => (
        <Card onPress={() => router.push(`/chat/${item.id}`)}><T bold>{title(item)}</T><T muted size={12}>🔒 {item.kind === 'institution' ? 'School chat' : 'Encrypted'}{item.members.some((m: any) => m.pending) ? ' · invited' : ''}</T></Card>
      )} ListEmptyComponent={<T muted>No chats yet.</T>} />
    </Screen>
  );
}
