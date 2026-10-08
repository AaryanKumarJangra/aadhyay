import { API_URL } from '@/lib/config';
export async function POST(req: Request) {
  const r = await fetch(`${API_URL}/v1/auth/otp/request`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '' }, body: await req.text() });
  return new Response(await r.text(), { status: r.status, headers: { 'content-type': 'application/json' } });
}
