import type { Metadata } from 'next';
import { jsonLd } from '@/lib/sanitize';
import { notFound, permanentRedirect } from 'next/navigation';
import { getSite, getPage, getPosts, getPost } from '@/lib/site';
import { Blocks } from '@/components/blocks';
import { date } from '@/lib/format';
import { PUBLIC_API_URL } from '@/lib/config';

const KINDS = ['news', 'blog', 'events', 'gallery'] as const;
const kindOf = (s: string) => (s === 'events' ? 'event' : s);
type P = { params: Promise<{ host: string; slug?: string[] }>; searchParams: Promise<{ lang?: string }> };

export const revalidate = 300;

export async function generateMetadata({ params, searchParams }: P): Promise<Metadata> {
  const { host, slug = [] } = await params;
  const { lang } = await searchParams;
  const site = await getSite(host).catch(() => null);
  if (!site) return {};
  const canonicalBase = `https://${site.canonicalHost ?? host}`;
  const path = slug.length ? `/${slug.join('/')}` : '/';
  if (KINDS.includes(slug[0] as any)) {
    if (slug[1]) {
      const p = await getPost(host, kindOf(slug[0]!), slug[1]).catch(() => null);
      return p ? { title: p.post.seo?.title ?? p.post.title, description: p.post.seo?.description ?? p.post.excerpt, alternates: { canonical: canonicalBase + path }, openGraph: { title: p.post.title, type: 'article', images: p.post.coverFileId ? [`${PUBLIC_API_URL}/v1/files/public/${p.post.coverFileId}`] : undefined } } : {};
    }
    return { title: `${slug[0]![0]!.toUpperCase()}${slug[0]!.slice(1)} — ${site.tenant.name}`, alternates: { canonical: canonicalBase + path } };
  }
  const page = await getPage(host, slug.join('/'), lang === 'hi' ? 'hi' : 'en').catch(() => null);
  if (!page?.page) return { title: site.tenant.name };
  const seo = page.page.seo ?? {};
  return {
    title: { absolute: seo.title ?? (slug.length ? `${page.page.title} — ${site.tenant.name}` : site.tenant.name) },
    description: seo.description ?? `${site.tenant.name}, ${site.tenant.city}.`,
    robots: seo.noindex ? { index: false } : undefined,
    alternates: { canonical: canonicalBase + path, languages: Object.fromEntries((page.alternates ?? []).map((l: string) => [l === 'hi' ? 'hi-IN' : 'en-IN', `${canonicalBase}${path}${l === 'hi' ? '?lang=hi' : ''}`])) },
    openGraph: { title: seo.title ?? page.page.title, description: seo.description, siteName: site.tenant.name, locale: lang === 'hi' ? 'hi_IN' : 'en_IN', images: seo.ogImageFileId ? [`${PUBLIC_API_URL}/v1/files/public/${seo.ogImageFileId}`] : undefined },
  };
}

export default async function SitePage({ params, searchParams }: P) {
  const { host, slug = [] } = await params;
  const { lang } = await searchParams;
  const site = await getSite(host);
  if (KINDS.includes(slug[0] as any)) {
    const kind = kindOf(slug[0]!);
    if (slug[1]) {
      const p = await getPost(host, kind, slug[1]).catch(() => null);
      if (!p) notFound();
      return (
        <article className="mx-auto max-w-3xl px-4 py-12">
          <time className="text-sm text-muted">{date(p.post.publishedAt ?? p.post.eventStart)}</time>
          <h1 className="mt-2 text-3xl font-bold">{p.post.title}</h1>
          {p.post.coverFileId && <img src={`${PUBLIC_API_URL}/v1/files/public/${p.post.coverFileId}`} alt="" className="mt-6 w-full rounded-xl" />}
          <div className="prose mt-6 whitespace-pre-line">{p.post.body}</div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(p.jsonLd) }} />
        </article>
      );
    }
    const posts = await getPosts(host, kind).catch(() => []);
    return <div className="mx-auto max-w-4xl px-4 py-12"><h1 className="text-3xl font-bold capitalize">{slug[0]}</h1><ul className="mt-6 space-y-3">{posts.map((p: any) => <li key={p.id}><a href={`/${slug[0]}/${p.slug}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-brand"><p className="font-semibold">{p.title}</p><p className="text-sm text-muted">{p.excerpt}</p></a></li>)}</ul></div>;
  }
  const page = await getPage(host, slug.join('/'), lang === 'hi' ? 'hi' : 'en').catch(() => null);
  if (!page) notFound();
  if (page.redirect) permanentRedirect(page.redirect.to);
  return (
    <>
      {slug.length > 0 && <div className="border-b border-line bg-surface"><div className="mx-auto max-w-6xl px-4 py-8"><h1 className="text-3xl font-bold">{page.page.title}</h1></div></div>}
      <Blocks blocks={page.page.blocks} site={site} host={host} />
      {page.jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(page.jsonLd) }} />}
    </>
  );
}
