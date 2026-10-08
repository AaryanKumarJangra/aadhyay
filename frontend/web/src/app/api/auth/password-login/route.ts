import { API_URL, clientHeaders } from '@/lib/config';
import { setSession } from '@/lib/session';
/** Email/phone + password login (staff with a password; local demo accounts). Session lives in httpOnly cookies. */
export async function POST(req: Request) {
  const body = await req.json();
  const r = await fetch(`${API_URL}/v1/auth/password/login`, { method: 'POST', headers: { 'content-type': 'application/json', ...clientHeaders(req) }, body: JSON.stringify({ login: body.login, password: body.password, totp: body.totp || undefined, platform: 'web', deviceId: body.deviceId ?? `web-${crypto.randomUUID()}` }) });
  const j = await r.json();
  if (!r.ok) return Response.json(j, { status: r.status });
  await setSession(j);
  return Response.json({ user: j.user, memberships: j.memberships, tenantId: j.tenantId });
}
