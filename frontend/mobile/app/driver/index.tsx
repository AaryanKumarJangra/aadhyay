import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Screen, Card, Button, T } from '@/components/ui';
import { api } from '@/lib/api';
import { startTracking, stopTracking } from '@/lib/driver-location';
import { useTheme } from '@/lib/theme';

/** Driver app: start trip (parents get links automatically), mark boarding, SOS, end trip. */
export default function Driver() {
  const t = useTheme();
  const [vehicles, setVehicles] = useState<any[]>([]), [routes, setRoutes] = useState<any[]>([]);
  const [veh, setVeh] = useState<any>(null), [route, setRoute] = useState<any>(null), [direction, setDir] = useState<'pickup' | 'drop'>('pickup');
  const [trip, setTrip] = useState<any>(null), [riders, setRiders] = useState<any[]>([]), [marked, setMarked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/transport/vehicles').then((r) => { setVehicles(r.items); setVeh(r.items[0]); }).catch(() => undefined);
    api('/transport/routes').then((r) => { setRoutes(r); setRoute(r[0]); }).catch(() => undefined);
    AsyncStorage.getItem('trip').then((x) => x && setTrip(JSON.parse(x)));
  }, []);
  useEffect(() => { if (veh) api(`/transport/vehicles/${veh.id}/riders?direction=${direction}`).then(setRiders).catch(() => undefined); }, [veh?.id, direction]);
  async function start() {
    setBusy(true);
    try {
      const r = await api('/transport/trips/start', { body: { vehicleId: veh.id, routeId: route.id, direction } });
      await startTracking(r.trip.id);
      setTrip(r.trip); await AsyncStorage.setItem('trip', JSON.stringify(r.trip));
      Alert.alert('Trip started', `${r.links} parent links sent for ${r.riders} students.`);
    } catch (e: any) { Alert.alert('Could not start', e.message); }
    setBusy(false);
  }
  async function end() { await stopTracking(); await api(`/transport/trips/${trip.id}/end`, { method: 'POST' }).catch(() => undefined); setTrip(null); await AsyncStorage.removeItem('trip'); setMarked({}); }
  async function sos() {
    Alert.alert('Send SOS?', 'This alerts the school and all parents on this bus.', [{ text: 'Cancel' }, { text: 'SEND SOS', style: 'destructive', onPress: async () => {
      const loc = await Location.getLastKnownPositionAsync().catch(() => null);
      await api('/transport/trips/sos', { body: { tripId: trip.id, lat: loc?.coords.latitude, lng: loc?.coords.longitude } });
      Alert.alert('SOS sent', 'Help is on the way.');
    } }]);
  }
  const mark = async (studentId: string, kind: 'boarded' | 'dropped') => { setMarked((m) => ({ ...m, [studentId]: kind })); await api('/transport/trips/student-event', { body: { tripId: trip.id, studentId, kind } }).catch(() => undefined); };
  if (!trip) return (
    <Screen title="Start trip">
      <T bold>Vehicle</T><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{vehicles.map((v) => <Chip key={v.id} on={veh?.id === v.id} label={v.name ?? v.regNo} onPress={() => setVeh(v)} />)}</View>
      <T bold>Route</T><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{routes.map((r) => <Chip key={r.id} on={route?.id === r.id} label={r.name} onPress={() => setRoute(r)} />)}</View>
      <T bold>Trip</T><View style={{ flexDirection: 'row', gap: 6 }}><Chip on={direction === 'pickup'} label="Morning pickup" onPress={() => setDir('pickup')} /><Chip on={direction === 'drop'} label="Afternoon drop" onPress={() => setDir('drop')} /></View>
      <T muted>{riders.length} students on this trip</T>
      <Button title="Start trip & share location" onPress={start} loading={busy} disabled={!veh || !route} />
    </Screen>
  );
  return (
    <Screen title="Trip running">
      <Pressable onLongPress={sos} style={{ backgroundColor: t.bad, borderRadius: 16, padding: 18, alignItems: 'center' }}><T style={{ color: '#fff' }} bold size={20}>SOS (hold)</T></Pressable>
      {riders.map((r) => (
        <Card key={r.studentId} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}><T bold>{r.studentName}</T><T muted size={12}>{r.stopName}</T></View>
          {marked[r.studentId] ? <T muted>{marked[r.studentId]} ✓</T> : <Chip on={false} label={direction === 'pickup' ? 'Boarded' : 'Dropped'} onPress={() => mark(r.studentId, direction === 'pickup' ? 'boarded' : 'dropped')} />}
        </Card>
      ))}
      <Button title="End trip" variant="secondary" onPress={end} />
    </Screen>
  );
}
function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: on ? t.brand : t.card, borderWidth: 1, borderColor: t.line }}><T style={{ color: on ? '#fff' : t.text }}>{label}</T></Pressable>;
}
