import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Chip, Field, Icon, Screen, SectionTitle, T } from '@/components/ui';
import { api } from '@/lib/api';
import { today } from '@/lib/theme';

const plus = (n: number) => { const d = new Date(`${today()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Leave request for a child (parents) or for yourself (staff). Approved days are marked “Leave” automatically. */
export default function Leave() {
  const { studentId, name } = useLocalSearchParams<{ studentId?: string; name?: string }>();
  const [from, setFrom] = useState(today()), [days, setDays] = useState(1), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const to = plus(Math.round((new Date(`${from}T00:00:00Z`).getTime() - new Date(`${today()}T00:00:00Z`).getTime()) / 86_400_000) + days - 1);
  const submit = async () => {
    setBusy(true);
    try { await api('/attendance/leave', { body: { studentId: studentId || undefined, fromDate: from, toDate: to, reason } }); Alert.alert('Leave requested', 'You’ll be notified when it is approved.', [{ text: 'OK', onPress: () => router.back() }]); }
    catch (e: any) { Alert.alert('Not sent', e.message); } finally { setBusy(false); }
  };
  return (
    <Screen title="Apply for leave" subtitle={name ? `For ${name}` : 'For yourself'} action={<Pressable accessibilityLabel="Close" onPress={() => router.back()} style={{ padding: 8 }}><Icon name="x" size={22} /></Pressable>}>
      <SectionTitle title="Starting" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[0, 1, 2, 3].map((n) => <Chip key={n} on={from === plus(n)} label={n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : label(plus(n))} onPress={() => setFrom(plus(n))} />)}</View>
      <SectionTitle title="How many days" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[1, 2, 3, 5, 7].map((n) => <Chip key={n} on={days === n} label={`${n} ${n === 1 ? 'day' : 'days'}`} onPress={() => setDays(n)} />)}</View>
      <T muted size={14}>{label(from)}{days > 1 ? ` – ${label(to)}` : ''}</T>
      <Field label="Reason" value={reason} onChangeText={setReason} multiline placeholder="e.g. Fever, family function" />
      <Button title="Submit request" icon="send" loading={busy} disabled={reason.trim().length < 3} onPress={submit} />
    </Screen>
  );
}
