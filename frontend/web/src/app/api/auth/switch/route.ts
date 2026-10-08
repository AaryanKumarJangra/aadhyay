import { cookies } from 'next/headers';
import { API_URL } from '@/lib/config';
import { setSession } from '@/lib/session';
export async function POST(req: Request) {
  const at = (await cookies()).get('aad_at')?.value;
  const r = await fetch(`${API_URL}/v1/auth/switch-tenant`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${at}` }, body: await req.text() });
  const j = await r.json();
  if (!r.ok) return Response.json(j, { status: r.status });
  await setSession({ accessToken: j.accessToken, expiresIn: j.expiresIn });
  return Response.json({ tenantId: j.tenantId });
}
