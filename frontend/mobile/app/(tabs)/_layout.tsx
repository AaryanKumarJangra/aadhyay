import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/lib/theme';
import { useMe, personaOf } from '@/lib/access';
import { api } from '@/lib/api';

/**
 * Five tabs for everyone (brief §61): Home · Work · Messages · Notifications · Profile.
 * "Work" is the role's hub: Children for parents, Trip for drivers, My school for students, Work for staff.
 */
export default function TabsLayout() {
  const t = useTheme();
  const me = useMe();
  const p = personaOf(me);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!me?.tenantId) return;
    const load = () => api('/comms/inbox/unread-count').then((r) => setUnread(r.unread)).catch(() => undefined);
    void load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [me?.tenantId]);
  const work = p === 'family' ? { title: 'Children', icon: 'users' as const } : p === 'driver' ? { title: 'Trip', icon: 'navigation' as const } : p === 'student' ? { title: 'My school', icon: 'book' as const } : { title: 'Work', icon: 'grid' as const };
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.brand, tabBarInactiveTintColor: t.muted, tabBarStyle: { backgroundColor: '#fff', borderTopColor: t.line, height: 62, paddingBottom: 8, paddingTop: 6 }, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Feather name="home" size={21} color={color} /> }} />
      <Tabs.Screen name="work" options={{ title: work.title, href: p === 'messenger' ? null : undefined, tabBarIcon: ({ color }) => <Feather name={work.icon} size={21} color={color} /> }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarIcon: ({ color }) => <Feather name="message-circle" size={21} color={color} /> }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts', href: p === 'messenger' ? null : undefined, tabBarBadge: unread ? (unread > 99 ? '99+' : unread) : undefined, tabBarIcon: ({ color }) => <Feather name="bell" size={21} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Feather name="user" size={21} color={color} /> }} />
    </Tabs>
  );
}
