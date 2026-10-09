import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Badge, Button, Card, Chip, EmptyState, ErrorState, Icon, Row, Screen, SectionTitle, Skeleton, SyncBanner, T } from '@/components/ui';
import { api } from '@/lib/api';
import { enqueue, flush, useQueue } from '@/lib/offline';
import { startTracking, stopTracking } from '@/lib/driver-location';
import { useTheme } from '@/lib/theme';

/** Driver: only your assigned vehicles. Start trip → stops & boarding (works offline) → SOS → end trip. */
export default function DriverTrip() {
  const t = useTheme();
  const [setup, setSetup] = useState<any>(null);
  const [err, setErr] = useState('');
  const [veh, setVeh] = useState<string>(''), [route, setRoute] = useState<string>(''), [direction, setDir] = useState<'pickup' | 'drop'>('pickup');
  const [trip, setTrip] = useState<any>(null), [riders, setRiders] = useState<any[]>([]), [marked, setMarked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const q = useQueue('trip-events');
  const load = useCallback(async () => {
    setErr('');
    try {
      const s = await api('/transport/my/vehicles');
      setSetup(s);
      const v = s.runningTrip?.vehicleId ?? s.vehicles[0]?.id ?? '';
      setVeh(v);
      setRoute(s.runningTrip?.routeId ?? s.routes.find((r: any) => r.vehicleId === v)?.id ?? '');
      if (s.runningTrip) { setTrip(s.runningTrip); setDir(s.runningTrip.direction); }
      const saved = await AsyncStorage.getItem('trip-marked');
      if (saved && s.runningTrip) setMarked(JSON.parse(saved));
    } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (veh) api(`/transport/vehicles/${veh}/riders?direction=${direction}`).then(setRiders).catch(() => setRiders([])); }, [veh, direction]);
  const routes = (setup?.routes ?? []).filter((r: any) => !veh || r.vehicleId === veh || !r.vehicleId);
  async function start() {
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('Location needed', 'Parents see the bus on the map only while location is shared.'); return; }
      const r = await api('/transport/trips/start', { body: { vehicleId: veh, routeId: route, direction } });
      await startTracking(r.trip.id);
      setTrip(r.trip); setMarked({}); await AsyncStorage.removeItem('trip-marked');
      Alert.alert('Trip started', `Tracking links sent to ${r.links} parents for ${r.riders} students.`);
    } catch (e: any) { Alert.alert('Could not start the trip', e.message); } finally { setBusy(false); }
  }
  async function end() {
    Alert.alert('End trip?', 'Location sharing stops and parents are told the trip has ended.', [{ text: 'Cancel' }, { text: 'End trip', style: 'destructive', onPress: async () => {
      await flush('trip-events');
      await stopTracking();
      try { await api(`/transport/trips/${trip.id}/end`, { method: 'POST' }); } catch (e: any) { Alert.alert('Ended on this phone', `The server will be updated when you’re online (${e.message}).`); }
      setTrip(null); setMarked({}); await AsyncStorage.removeItem('trip-marked');
    } }]);
  }
  function sos() {
    Alert.alert('Send SOS?', 'This immediately alerts the school and every parent on this bus.', [{ text: 'Cancel' }, { text: 'SEND SOS', style: 'destructive', onPress: async () => {
      const loc = await Location.getLastKnownPositionAsync().catch(() => null);
      try { await api('/transport/trips/sos', { body: { tripId: trip.id, lat: loc?.coords.latitude, lng: loc?.coords.longitude } }); Alert.alert('SOS sent', 'The school has been alerted.'); }
      catch { Alert.alert('No connection', 'Call the school directly. SOS could not be sent.'); }
    } }]);
  }
  const mark = async (studentId: string, kind: 'boarded' | 'dropped') => {
    const next = { ...marked, [studentId]: kind };
    setMarked(next); await AsyncStorage.setItem('trip-marked', JSON.stringify(next));
    const body = { tripId: trip.id, studentId, kind };
    try { await api('/transport/trips/student-event', { body }); }
    catch { await enqueue('trip-events', '/transport/trips/student-event', body, `${kind} · ${riders.find((r) => r.studentId === studentId)?.studentName ?? ''}`); }
  };

  if (err) return <Screen title="Trip"><ErrorState message={err} onRetry={load} /></Screen>;
  if (!setup) return <Screen title="Trip"><Skeleton height={200} /></Screen>;
  if (!setup.vehicles.length) return <Screen title="Trip"><EmptyState icon="truck" title="No vehicle assigned to you" body="Ask the transport manager to assign you as driver or attendant." /></Screen>;
  if (!trip) return (
    <Screen title="Start a trip" onRefresh={load}>
      <SyncBanner pending={q.pending} failed={q.failed} syncing={q.syncing} onRetry={q.retry} />
      <SectionTitle title="Vehicle" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{setup.vehicles.map((v: any) => <Chip key={v.id} on={veh === v.id} icon="truck" label={v.name ?? v.regNo} onPress={() => { setVeh(v.id); setRoute(setup.routes.find((r: any) => r.vehicleId === v.id)?.id ?? ''); }} />)}</View>
      <SectionTitle title="Route" />
      {routes.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{routes.map((r: any) => <Chip key={r.id} on={route === r.id} label={r.name} onPress={() => setRoute(r.id)} />)}</View> : <T muted>No route uses this vehicle yet.</T>}
      <SectionTitle title="Trip" />
      <View style={{ flexDirection: 'row', gap: 8 }}><Chip on={direction === 'pickup'} icon="sunrise" label="Morning pickup" onPress={() => setDir('pickup')} /><Chip on={direction === 'drop'} icon="sunset" label="Afternoon drop" onPress={() => setDir('drop')} /></View>
      <Card><Row icon="users" title={`${riders.length} students on this trip`} subtitle="Parents get a private live tracking link when you start." /></Card>
      <Button title="Start trip & share location" icon="navigation" onPress={start} loading={busy} disabled={!veh || !route} />
    </Screen>
  );
  const done = riders.filter((r) => marked[r.studentId]).length;
  return (
    <Screen title="Trip running" subtitle={`${direction === 'pickup' ? 'Pickup' : 'Drop'} · ${done}/${riders.length} ${direction === 'pickup' ? 'boarded' : 'dropped'}`}>
      <SyncBanner pending={q.pending} failed={q.failed} syncing={q.syncing} onRetry={q.retry} />
      <Pressable accessibilityRole="button" accessibilityLabel="SOS. Press and hold to send an emergency alert." onLongPress={sos} delayLongPress={800}
        style={({ pressed }) => ({ backgroundColor: t.bad, borderRadius: 16, padding: 18, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="alert-octagon" color="#fff" size={22} /><T bold size={20} style={{ color: '#fff' }}>SOS</T></View>
        <T size={12} style={{ color: '#fff', opacity: 0.9 }}>Press and hold</T>
      </Pressable>
      {riders.map((r) => (
        <Card key={r.studentId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}><T semibold>{r.studentName}</T><T muted size={13}>Stop {r.stopOrder}: {r.stopName}</T></View>
          {marked[r.studentId] ? <Badge tone="ok" icon="check" label={marked[r.studentId]!} /> : <Button title={direction === 'pickup' ? 'Boarded' : 'Dropped'} size="sm" variant="soft" onPress={() => mark(r.studentId, direction === 'pickup' ? 'boarded' : 'dropped')} />}
        </Card>
      ))}
      <Button title="End trip" variant="secondary" icon="square" onPress={end} />
    </Screen>
  );
}
