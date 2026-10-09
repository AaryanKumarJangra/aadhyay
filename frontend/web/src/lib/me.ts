import 'server-only';
import { cache } from 'react';
import { createElement } from 'react';
import { AccessDenied } from '@/components/ui/feedback';
import { decide, type Grant, type PermissionKey, type ScopeLevel } from '@aadhyay/contracts';
import { api } from './server-api';

export interface Me {
  userId: string;
  user: { name: string; phone: string | null; email: string | null; totpEnabled: boolean } | null;
  tenantId: string | null;
  tenantStatus: string | null;
  kinds: string[];
  personIds: Record<string, string>;
  permissions: string[];
  grants: Pick<Grant, 'pattern' | 'scope' | 'conditions' | 'source'>[];
  roles: { key: string; name: string }[];
  modules: string[];
  memberships: { id: string; tenantId: string; kind: string; tenantSlug: string; tenantName: string; segment: string; status: string; branding: any }[];
}
export interface Org {
  id: string; slug: string; name: string; segment: string; status: string; city: string | null; state: string | null; timezone: string;
  branding: Record<string, any> | null; settings: Record<string, any> | null; planCode: string; modules: string[]; trialEndsAt: string | null; periodEndsAt: string | null;
}

/** One /me and one /org/profile per request, shared by layout, pages and guards. */
export const getMe = cache(() => api<Me>('/me'));
export const getOrg = cache(() => api<Org>('/org/profile'));

/** UX check with the same engine the API uses (the API still enforces). */
export function canDo(me: Pick<Me, 'grants' | 'modules' | 'userId'>, key: PermissionKey): boolean {
  return decide({ userId: me.userId, grants: me.grants as Grant[], modules: me.modules, self: { studentIds: [] } }, key).allowed;
}
export function scopeOf(me: Pick<Me, 'grants' | 'modules' | 'userId'>, key: PermissionKey): ScopeLevel | null {
  const d = decide({ userId: me.userId, grants: me.grants as Grant[], modules: me.modules, self: { studentIds: [] } }, key);
  return d.allowed ? d.scope ?? null : null;
}

/**
 * Page guard. Returns the user, or the explained denial to render in place of the page (inside the app shell):
 *   const { me, denied } = await guard('org.role.view'); if (denied) return denied;
 */
export async function guard(...keys: PermissionKey[]): Promise<{ me: Me; denied: React.ReactElement | null }> {
  const me = await getMe();
  const p = { userId: me.userId, grants: me.grants as Grant[], modules: me.modules, self: { studentIds: [] } };
  const decisions = keys.map((k) => decide(p, k));
  if (decisions.some((d) => d.allowed)) return { me, denied: null };
  const d = decisions.find((x) => x.code === 'MODULE_DISABLED') ?? decisions[0]!;
  return { me, denied: createElement(AccessDenied, { reason: d.reason, permission: d.permission }) };
}
