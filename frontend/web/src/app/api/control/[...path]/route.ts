import { cookies } from 'next/headers';
import { API_URL, clientHeaders } from '@/lib/config';

/** Control-plane BFF: browser → /api/control/* → API /v1/control/* with the platform session cookie (aad_ct). */
async function forward(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path[0] === 'login' || path[0] === 'auth') return Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  const token = (await cookies()).get('aad_ct')?.value;
  if (!token) return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to the control plane' } }, { status: 401 });
  const url = new URL(req.url);
  const res = await fetch(`${API_URL}/v1/control/${path.map(encodeURIComponent).join('/')}${url.search}`, {
    method: req.method, body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
    headers: { ...(req.headers.get('content-type') ? { 'content-type': req.headers.get('content-type')! } : {}), authorization: `Bearer ${token}`, ...clientHeaders(req) },
  });
  return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' } });
}
export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
