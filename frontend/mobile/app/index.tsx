import { useEffect } from 'react';
import { router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { session } from '@/lib/session';
import { LOCKED_TENANT } from '@/lib/config';
import { api } from '@/lib/api';
import { hasPermission } from '@aadhyay/contracts';
import { registerPush } from '@/lib/push';

/** Decides the home screen by role: driver → trip, teacher → classes, parent/student → children, messenger-only → chats. */
export default function Entry() {
  useEffect(() => {
    (async () => {
      const s = session.get();
      if (!s.accessToken) return router.replace(!LOCKED_TENANT && !s.tenantSlug ? '/institution' : '/login');
      void registerPush();
      try {
        const me = await api('/me');
        session.set({ me, userId: me.userId });
        if (!me.tenantId) return router.replace('/chat');
        const branding = await api(`/public/tenants/${s.tenantSlug ?? me.memberships.find((m: any) => m.tenantId === me.tenantId)?.tenantSlug}/branding`, { auth: false }).catch(() => null);
        session.set({ branding: branding?.branding });
        const p = me.permissions as string[];
        if (hasPermission(p, 'transport.trip.create') && !hasPermission(p, 'people.student.view')) return router.replace('/driver');
        if (hasPermission(p, 'attendance.student.create')) return router.replace('/teacher');
        return router.replace('/parent');
      } catch {
        router.replace('/login');
      }
    })();
  }, []);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
}
