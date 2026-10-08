export const dynamic = 'force-dynamic';
import { api } from '@/lib/server-api';
import { getSite } from '@/lib/site';

export async function GET(_: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const [site, sm] = await Promise.all([getSite(host), api(`/site/sitemap`, { tenant: host, auth: false, revalidate: 3600 })]);
  const base = `https://${site.canonicalHost ?? host}`;
  const urls = [
    ...sm.pages.map((p: any) => ({ loc: `${base}/${p.slug}${p.locale === 'hi' ? '?lang=hi' : ''}`, lastmod: p.updatedAt })),
    ...sm.posts.map((p: any) => ({ loc: `${base}/${p.kind === 'event' ? 'events' : p.kind}/${p.slug}`, lastmod: p.updatedAt })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u.loc.replace(/&/g, '&amp;')}</loc><lastmod>${new Date(u.lastmod).toISOString()}</lastmod></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' } });
}
