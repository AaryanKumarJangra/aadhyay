import { cookies } from 'next/headers';
/** Ends the platform session (httpOnly cookie, so it must be cleared server-side). */
export async function POST() {
  (await cookies()).delete('aad_ct');
  return Response.json({ ok: true });
}
