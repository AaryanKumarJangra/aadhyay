import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_URL } from './config';
import { ApiError } from './server-api';

/** Server-side control-plane call with the platform session; 401 → login, other errors throw with the API message. */
export async function capi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const t = (await cookies()).get('aad_ct')?.value;
  if (!t) redirect('/control/login');
  const res = await fetch(`${API_URL}/v1/control${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, cache: 'no-store' });
  if (res.status === 401) redirect('/control/login');
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? res.statusText, body?.error?.details);
  return body as T;
}
export type PlatformMe = { id: string; name: string; email: string | null; role: string };
export const getPlatformMe = cache(() => capi<PlatformMe>('/me'));
/** Which platform roles may run an action (mirrors @Platform(...) on the API; super_admin may do everything). */
export const platformCan = (me: PlatformMe, ...roles: string[]) => me.role === 'super_admin' || roles.includes(me.role);
