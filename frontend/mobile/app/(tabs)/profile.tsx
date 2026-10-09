import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Badge, Button, Card, Row, Screen, SectionTitle, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/lib/access';
import { logout, session, setTenant } from '@/lib/session';
import { FLAVOUR, LOCKED_TENANT } from '@/lib/config';
import { useTheme } from '@/lib/theme';

export default function Profile() {
  const t = useTheme();
  const me = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const current = me?.memberships.find((m) => m.tenantId === me.tenantId);
  const others = (me?.memberships ?? []).filter((m, i, a) => m.tenantId !== me?.tenantId && a.findIndex((x) => x.tenantId === m.tenantId) === i);
  const switchTo = async (m: { tenantId: string; tenantSlug: string }) => {
    setBusy(m.tenantId);
    try { const r = await api('/auth/switch-tenant', { body: { tenantId: m.tenantId } }); session.set({ accessToken: r.accessToken }); await setTenant(m.tenantSlug); router.replace('/'); }
    catch (e: any) { Alert.alert('Could not switch', e.message); } finally { setBusy(null); }
  };
  return (
    <Screen title="Profile">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}><T bold size={22} style={{ color: t.brand }}>{(me?.user?.name ?? '?')[0]}</T></View>
          <View style={{ flex: 1 }}><T bold size={18}>{me?.user?.name ?? 'Your account'}</T><T muted>{me?.user?.phone ?? ''}</T></View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{(me?.roles ?? []).map((r) => <Badge key={r.key} tone="brand" label={r.name} />)}</View>
      </Card>
      {current && <><SectionTitle title="Institution" /><Card><Row icon="home" title={current.tenantName} subtitle="Current" /></Card></>}
      {others.length > 0 && !LOCKED_TENANT && <Card>{others.map((m) => <Row key={m.tenantId} icon="repeat" title={m.tenantName} subtitle={busy === m.tenantId ? 'Switching…' : 'Switch to this institution'} onPress={() => switchTo(m)} />)}</Card>}
      {!LOCKED_TENANT && <Card><Row icon="search" title="Join another institution" subtitle="Find your school, college or coaching" onPress={() => router.push('/institution')} /></Card>}
      <SectionTitle title="Privacy & security" />
      <Card>
        <Row icon="lock" title="Messages are end-to-end encrypted" subtitle="Only you and the people you chat with can read them." />
        <Row icon="shield" title="Your access" subtitle={`${me?.grants?.length ?? 0} permissions from ${(me?.roles ?? []).length} role(s). Ask your institution if something is missing.`} />
      </Card>
      <Button title="Sign out" variant="secondary" icon="log-out" onPress={() => Alert.alert('Sign out?', 'Unsent offline work stays on this phone and syncs after you sign in again.', [{ text: 'Cancel' }, { text: 'Sign out', style: 'destructive', onPress: async () => { await logout(); router.replace('/'); } }])} />
      <T muted size={12} style={{ textAlign: 'center' }}>{FLAVOUR === 'aadhyay' ? 'Aadhyay' : FLAVOUR} · v{Constants.expoConfig?.version ?? '1.0.0'}</T>
    </Screen>
  );
}
