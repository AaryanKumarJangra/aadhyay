import '@/lib/polyfills';
import '@/lib/driver-location';
import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator } from 'react-native';
import * as Notifications from 'expo-notifications';
import { boot } from '@/lib/session';
import { routeFor } from '@/lib/notify';
import { flush } from '@/lib/offline';

export default function Root() {
  const [ready, setReady] = useState(false);
  useEffect(() => { boot().finally(() => setReady(true)); }, []);
  useEffect(() => {
    if (!ready) return;
    // Tapping a push opens the exact record (e.g. "Rahul was marked absent" → that child's attendance).
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = (r.notification.request.content.data ?? {}) as Record<string, string>;
      router.push(routeFor({ eventKey: d.eventKey, studentId: d.studentId }) as never);
    });
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (!r) return;
      const d = (r.notification.request.content.data ?? {}) as Record<string, string>;
      router.push(routeFor({ eventKey: d.eventKey, studentId: d.studentId }) as never);
    });
    // Send anything saved offline from a previous session.
    void flush('attendance'); void flush('trip-events');
    return () => sub.remove();
  }, [ready]);
  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F7FB' }}><ActivityIndicator /></View>;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F6F7FB' } }} />
    </SafeAreaProvider>
  );
}
