import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, Field, Button, T } from '@/components/ui';
import { api } from '@/lib/api';
export default function Leave() {
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today), [to, setTo] = useState(today), [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <Screen title="Apply for leave">
      <Field label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} />
      <Field label="To (YYYY-MM-DD)" value={to} onChangeText={setTo} />
      <Field label="Reason" value={reason} onChangeText={setReason} multiline style={{ height: 100 }} />
      <Button title="Submit" disabled={reason.length < 3} onPress={async () => { try { await api('/attendance/leave', { body: { studentId, fromDate: from, toDate: to, reason } }); router.back(); } catch (e: any) { setMsg(e.message); } }} />
      {!!msg && <T style={{ color: '#DC2626' }}>{msg}</T>}
    </Screen>
  );
}
