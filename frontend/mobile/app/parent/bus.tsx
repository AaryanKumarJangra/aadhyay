import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { io, type Socket } from 'socket.io-client';
import { Screen, Card, T } from '@/components/ui';
import { api } from '@/lib/api';
import { session } from '@/lib/session';
import { REALTIME } from '@/lib/config';

/** Live map of my children's buses — free, in-app (no WhatsApp needed). */
export default function Bus() {
  const [buses, setBuses] = useState<any[]>([]);
  const sock = useRef<Socket | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => { const b = await api('/transport/my/buses').catch(() => []); if (alive) setBuses(b); return b; };
    load().then((b) => {
      const s = io(`${REALTIME}/transport`, { auth: { token: session.get().accessToken }, transports: ['websocket'] });
      sock.current = s;
      for (const t of new Set(b.map((x: any) => x.tripId))) s.emit('trip.subscribe', { tripId: t });
      s.on('trip.position', (p: any) => setBuses((xs) => xs.map((x) => (x.tripId === p.tripId ? { ...x, lat: p.lat, lng: p.lng, lastAt: p.at } : x))));
    });
    const iv = setInterval(load, 60000);
    return () => { alive = false; clearInterval(iv); sock.current?.close(); };
  }, []);
  const first = buses.find((b) => b.lat);
  return (
    <Screen title="School bus" scroll={false}>
      {first ? (
        <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}>
          <MapView style={{ flex: 1 }} region={{ latitude: first.lat, longitude: first.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }}>
            {buses.filter((b) => b.lat).map((b) => <Marker key={b.tripId + b.studentId} coordinate={{ latitude: b.lat, longitude: b.lng }} title={b.regNo} description={`Updated ${new Date(b.lastAt).toLocaleTimeString('en-IN')}`} />)}
          </MapView>
        </View>
      ) : <Card><T>No bus is running for your children right now.</T><T muted>You’ll get a notification when the trip starts.</T></Card>}
    </Screen>
  );
}
