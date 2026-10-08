import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_URL } from './config';
export async function capi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const t = (await cookies()).get('aad_ct')?.value;
  if (!t) redirect('/control/login');
  const res = await fetch(`${API_URL}/v1/control${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, cache: 'no-store' });
  if (res.status === 401) redirect('/control/login');
  return res.json();
}
