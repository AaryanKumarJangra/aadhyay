import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { T } from '@/components/ui';
import { api } from '@/lib/api';
import { messenger, type Msg } from '@/lib/messenger';
import { session } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const me = session.get().userId;
  const [conv, setConv] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const list = useRef<FlatList>(null);
  useEffect(() => {
    api(`/messenger/conversations/${id}`).then(setConv);
    messenger.init().then(() => messenger.history(id).then((h) => { setMsgs(h); messenger.seen(id, h.filter((m) => !m.mine).map((m) => m.id)); }));
    return messenger.on((e) => {
      if (e.type === 'message' && e.data.conversationId === id) { setMsgs((m) => (m.some((x) => x.id === e.data.id) ? m : [...m, e.data])); if (!e.data.mine) messenger.seen(id, [e.data.id]); }
      if (e.type === 'receipt' && e.data.conversationId === id) setMsgs((m) => m.map((x) => (e.data.messageIds.includes(x.id) ? { ...x, status: e.data.kind } : x)));
      if (e.type === 'typing' && e.data.conversationId === id && e.data.userId !== me) setTyping(e.data.typing);
    });
  }, [id]);
  const others = (conv?.members ?? []).filter((m: any) => m.userId && m.userId !== me);
  const send = async () => { const v = text.trim(); if (!v) return; setText(''); await messenger.send(id, others.map((m: any) => m.userId), v); };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, borderBottomWidth: 1, borderColor: t.line }}>
        <Pressable onPress={() => router.back()}><T size={22}>‹</T></Pressable>
        <View style={{ flex: 1 }}><T bold>{conv?.title ?? others.map((m: any) => m.name).join(', ')}</T><T muted size={12}>{typing ? 'typing…' : '🔒 end-to-end encrypted'}</T></View>
        {others.length > 0 && <Pressable onPress={() => router.push({ pathname: '/call/[id]', params: { id, kind: 'voice', peer: others[0].userId } })}><T size={20}>📞</T></Pressable>}
        {others.length > 0 && <Pressable onPress={() => router.push({ pathname: '/call/[id]', params: { id, kind: 'video', peer: others[0].userId } })}><T size={20}>🎥</T></Pressable>}
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList ref={list} data={msgs} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: 12, gap: 6 }} onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={{ alignSelf: item.mine ? 'flex-end' : 'flex-start', maxWidth: '78%', backgroundColor: item.mine ? t.brand : t.card, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
              <T style={{ color: item.mine ? '#fff' : t.text }}>{item.text}</T>
              <T size={10} style={{ color: item.mine ? '#ffffffaa' : t.muted, alignSelf: 'flex-end' }}>{new Date(item.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}{item.mine ? (item.status === 'seen' ? ' ✓✓' : item.status === 'delivered' ? ' ✓✓' : ' ✓') : ''}</T>
            </View>
          )} />
        <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderColor: t.line }}>
          <TextInput value={text} onChangeText={(v) => { setText(v); messenger.typing(id, !!v); }} placeholder="Message" placeholderTextColor={t.muted} style={{ flex: 1, height: 44, borderRadius: 22, paddingHorizontal: 16, backgroundColor: t.card, color: t.text }} />
          <Pressable onPress={send} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}><T style={{ color: '#fff' }} bold>➤</T></Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
