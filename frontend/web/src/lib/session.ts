import 'server-only';
import { cookies } from 'next/headers';

const secure = process.env.NODE_ENV === 'production';
export async function setSession(t: { accessToken: string; refreshToken?: string; expiresIn?: number }) {
  const c = await cookies();
  c.set('aad_at', t.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: t.expiresIn ?? 900 });
  if (t.refreshToken) c.set('aad_rt', t.refreshToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 86400 });
}
export async function clearSession() {
  const c = await cookies();
  c.delete('aad_at');
  c.delete('aad_rt');
}
