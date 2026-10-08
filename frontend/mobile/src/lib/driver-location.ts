import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

/**
 * Background GPS for the driver app (docs/02 §9): adaptive 5–10 s pings while moving, queued offline
 * and flushed in batches (≤ 200 points) when the network is back. Runs as an Android foreground service.
 */
export const TRIP_TASK = 'aadhyay-trip-location';
const QUEUE = 'trip-queue';

TaskManager.defineTask(TRIP_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const tripId = await AsyncStorage.getItem('trip-id');
  if (!tripId) return;
  const q: any[] = JSON.parse((await AsyncStorage.getItem(QUEUE)) ?? '[]');
  for (const l of locations) q.push({ lat: l.coords.latitude, lng: l.coords.longitude, speed: l.coords.speed ?? undefined, heading: l.coords.heading ?? undefined, at: new Date(l.timestamp).toISOString() });
  await AsyncStorage.setItem(QUEUE, JSON.stringify(q.slice(-2000)));
  await flush(tripId);
});

export async function flush(tripId: string) {
  const q: any[] = JSON.parse((await AsyncStorage.getItem(QUEUE)) ?? '[]');
  while (q.length) {
    const batch = q.slice(0, 200);
    try {
      await api('/transport/trips/ping', { body: { tripId, points: batch } });
      q.splice(0, batch.length);
      await AsyncStorage.setItem(QUEUE, JSON.stringify(q));
    } catch {
      return; // offline: keep queue, retry on next fix
    }
  }
}

export async function startTracking(tripId: string) {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('Location permission is required to run a trip');
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') throw new Error('Allow “All the time” location so tracking continues with the screen off');
  await AsyncStorage.setItem('trip-id', tripId);
  await Location.startLocationUpdatesAsync(TRIP_TASK, {
    accuracy: Location.Accuracy.High, timeInterval: 7000, distanceInterval: 15, deferredUpdatesInterval: 5000,
    foregroundService: { notificationTitle: 'Trip running', notificationBody: 'Sharing bus location with parents', notificationColor: '#1E40AF' },
    pausesUpdatesAutomatically: false, activityType: Location.ActivityType.AutomotiveNavigation, showsBackgroundLocationIndicator: true,
  });
}
export async function stopTracking() {
  const tripId = await AsyncStorage.getItem('trip-id');
  if (tripId) await flush(tripId);
  if (await Location.hasStartedLocationUpdatesAsync(TRIP_TASK)) await Location.stopLocationUpdatesAsync(TRIP_TASK);
  await AsyncStorage.removeItem('trip-id');
}
