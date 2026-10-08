import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';
import { session } from './session';
import { FLAVOUR } from './config';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }) });

/** Register the device's FCM/APNs token so alerts reach this phone for free. */
export async function registerPush() {
  if (!Device.isDevice) return;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Alerts', importance: Notifications.AndroidImportance.HIGH });
  const token = (await Notifications.getDevicePushTokenAsync()).data as string;
  await api('/push/tokens', { body: { deviceId: session.get().deviceId, token, platform: Platform.OS === 'ios' ? 'ios' : 'android', appId: FLAVOUR } }).catch(() => undefined);
}
