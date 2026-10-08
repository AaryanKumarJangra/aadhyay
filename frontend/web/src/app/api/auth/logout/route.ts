import { cookies } from 'next/headers';
import { API_URL } from '@/lib/config';
import { clearSession } from '@/lib/session';
export async function POST() {
  const at = (await cookies()).get('aad_at')?.value;
  if (at) await fetch(`${API_URL}/v1/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${at}` } }).catch(() => undefined);
  await clearSession();
  return Response.json({ ok: true });
}
