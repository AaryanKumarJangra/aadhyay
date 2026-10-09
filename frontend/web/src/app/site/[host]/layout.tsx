import { notFound } from 'next/navigation';
import { jsonLd } from '@/lib/sanitize';
import { getSite } from '@/lib/site';

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ host: string }> }) {
  const { host } = await params;
  const site = await getSite(host).catch(() => null);
  if (!site) notFound();
  if (['suspended', 'archived', 'purged'].includes(site.tenant.status)) return <main className="grid min-h-dvh place-items-center p-8 text-center"><div><h1 className="text-2xl font-semibold">{site.tenant.name}</h1><p className="mt-2 text-muted">This website is under maintenance. Please check back soon.</p></div></main>;
  const b = site.branding ?? {};
  return (
    <div style={{ ['--brand' as any]: b.primaryColor ?? '#1e40af', ['--accent' as any]: b.accentColor ?? '#f59e0b' }} className="flex min-h-dvh flex-col bg-white text-[#0f172a]">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <a href="/" className="flex items-center gap-2 font-bold">{b.logoFileId ? <img src={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/v1/files/public/${b.logoFileId}`} alt="" className="h-9 w-9 rounded" /> : <span className="grid h-9 w-9 place-items-center rounded bg-brand text-white">{site.tenant.name[0]}</span>}<span className="line-clamp-1">{site.tenant.name}</span></a>
          <ul className="hidden gap-5 text-sm md:flex">{(site.menus?.header ?? []).map((m: any) => <li key={m.href}><a href={m.href} className="hover:text-brand">{m.label}</a></li>)}</ul>
          <a href="/admissions" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Admissions</a>
        </nav>
      </header>
      <main className="@container flex-1">{children}</main>
      <footer className="border-t border-line bg-surface py-8 text-center text-sm text-muted">
        <ul className="mb-3 flex justify-center gap-4">{(site.menus?.footer ?? []).map((m: any) => <li key={m.href}><a href={m.href}>{m.label}</a></li>)}</ul>
        © {new Date().getFullYear()} {site.tenant.name}{b.affiliation ? ` · ${b.affiliation}` : ''} · <a href="https://aadhyay.com" className="hover:text-brand">Powered by Aadhyay</a>
      </footer>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(site.jsonLd) }} />
    </div>
  );
}
