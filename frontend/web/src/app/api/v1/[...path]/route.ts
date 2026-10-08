import { cookies } from 'next/headers';
import { API_URL } from '@/lib/config';
import { setSession, clearSession } from '@/lib/session';

/** BFF proxy: browser → /api/v1/* → API with the httpOnly session; transparently refreshes once on 401. */
async function forward(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const target = `${API_URL}/v1/${path.map(encodeURIComponent).join('/')}${url.search}`;
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer();
  const jar = await cookies();
  const send = (token?: string) => fetch(target, {
    method: req.method, body,
    headers: { ...(req.headers.get('content-type') ? { 'content-type': req.headers.get('content-type')! } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '', ...(req.headers.get('x-tenant') ? { 'x-tenant': req.headers.get('x-tenant')! } : {}) },
  });
  let res = await send(jar.get('aad_at')?.value);
  if (res.status === 401 && jar.get('aad_rt')?.value) {
    const r = await fetch(`${API_URL}/v1/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: jar.get('aad_rt')!.value }) });
    if (r.ok) {
      const t = await r.json();
      await setSession(t);
      res = await send(t.accessToken);
    } else await clearSession();
  }
  const headers = new Headers();
  for (const h of ['content-type', 'content-disposition']) { const v = res.headers.get(h); if (v) headers.set(h, v); }
  return new Response(res.body, { status: res.status, headers });
}
export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
