import { can as decideCan, type PermissionKey } from '@aadhyay/contracts';
import { useSession } from './session';

export type Me = {
  userId: string; tenantId: string | null; kinds: string[]; user?: { name: string; phone: string | null } | null;
  grants: { pattern: string; scope: string; source: { roleKey: string; roleName: string } }[]; modules: string[]; roles: { key: string; name: string }[];
  memberships: { tenantId: string; tenantSlug: string; tenantName: string; kind: string }[];
};
export const useMe = () => useSession((s) => s.me as Me | undefined);

/** UX only — the API decides. Same engine as the server and the web console. */
export function can(me: Me | undefined, key: PermissionKey): boolean {
  if (!me) return false;
  return decideCan({ grants: (me.grants ?? []) as never, modules: me.modules ?? [] }, key);
}

/** Which home and tabs to show, from what the user can do (not from role names). */
export type Persona = 'admin' | 'finance' | 'teacher' | 'driver' | 'family' | 'student' | 'staff' | 'messenger';
export function personaOf(me: Me | undefined): Persona {
  if (!me?.tenantId) return 'messenger';
  if (can(me, 'reports.dashboard.view')) return 'admin';
  if (can(me, 'fees.dashboard.view')) return 'finance';
  if (can(me, 'transport.trip.create') && !can(me, 'people.student.view')) return 'driver';
  if (can(me, 'attendance.student.view') || can(me, 'homework.assignment.view')) return 'teacher';
  if (can(me, 'self.*')) return me.kinds.includes('guardian') ? 'family' : 'student';
  return 'staff';
}
