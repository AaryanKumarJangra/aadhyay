import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { session } from '@/lib/session';
import { LOCKED_TENANT } from '@/lib/config';
import { api } from '@/lib/api';
import { registerPush } from '@/lib/push';
import { ErrorState } from '@/components/ui';

/** Entry: not signed in → pick institution / log in; signed in → load profile & branding → tabs. */
export default function Entry() {
  const [err, setErr] = useState('');
  const go = async () => {
    setErr('');
    const s = session.get();
    if (!s.accessToken) return router.replace(!LOCKED_TENANT && !s.tenantSlug ? '/institution' : '/login');
    void registerPush();
    try {
      const me = await api('/me');
      session.set({ me, userId: me.userId });
      if (me.tenantId) {
        const slug = s.tenantSlug ?? me.memberships.find((m: any) => m.tenantId === me.tenantId)?.tenantSlug;
        const b = await api(`/public/tenants/${slug}/branding`, { auth: false }).catch(() => null);
        session.set({ branding: b?.branding });
      }
      router.replace('/(tabs)');
    } catch (e: any) {
      if (e?.status === 401) router.replace('/login');
      else setErr(e?.message ?? 'Network problem');
    }
  };
  useEffect(() => { void go(); }, []);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F6F7FB' }}>{err ? <ErrorState message={`${err}. Check your connection.`} onRetry={go} /> : <ActivityIndicator />}</View>;
}
