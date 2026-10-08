import { revalidateTag } from 'next/cache';
/** Called by the API when a CMS page is published (ISR invalidation per tenant site). */
export async function POST(req: Request) {
  if (req.headers.get('x-revalidate-secret') !== process.env.REVALIDATE_SECRET) return new Response('forbidden', { status: 403 });
  const { tag } = await req.json();
  revalidateTag(String(tag), 'max');
  return Response.json({ ok: true });
}
