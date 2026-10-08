export const dynamic = 'force-dynamic';
import { getSite } from '@/lib/site';
export async function GET(_: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const site = await getSite(host).catch(() => null);
  const base = `https://${site?.canonicalHost ?? host}`;
  return new Response(`User-agent: *\nAllow: /\nDisallow: /track/\n\nSitemap: ${base}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } });
}
