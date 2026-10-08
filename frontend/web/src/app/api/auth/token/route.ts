import { cookies } from 'next/headers';
/** Short-lived access token for WebSocket connections (messenger, live bus). */
export async function GET() {
  const at = (await cookies()).get('aad_at')?.value;
  return at ? Response.json({ token: at }) : Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
}
