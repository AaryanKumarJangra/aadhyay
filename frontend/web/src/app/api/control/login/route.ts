import { cookies } from 'next/headers';
import { API_URL, clientHeaders } from '@/lib/config';
/** Platform staff login → httpOnly cookie used by the control plane pages (separate from tenant sessions). */
export async function POST(req: Request) {
  const r = await fetch(`${API_URL}/v1/control/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', ...clientHeaders(req) }, body: await req.text() });
  const j = await r.json();
  if (!r.ok) return Response.json(j, { status: r.status });
  (await cookies()).set('aad_ct', j.accessToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 8 * 3600 });
  return Response.json({ user: j.user });
}
