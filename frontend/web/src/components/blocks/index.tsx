import { PUBLIC_API_URL } from '@/lib/config';
import { date } from '@/lib/format';
import { EnquiryForm } from './enquiry-form';
import { sanitize } from '@/lib/sanitize';

const img = (id?: string) => (id ? `${PUBLIC_API_URL}/v1/files/public/${id}` : undefined);

/** Renders CMS blocks (docs/03 cms). Server component; only the form is client-side. */
export function Blocks({ blocks, site, host }: { blocks: any[]; site: any; host: string }) {
  return <>{blocks.map((b) => <Block key={b.id} b={b} site={site} host={host} />)}</>;
}
function Block({ b, site, host }: { b: any; site: any; host: string }) {
  const p = b.props ?? {};
  switch (b.type) {
    case 'hero':
      return (
        <section className="relative overflow-hidden bg-gradient-to-br from-brand to-brand/70 text-white">
          <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
            <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-5xl">{p.heading ?? site.tenant.name}</h1>
            {p.subheading && <p className="mt-4 max-w-2xl text-lg text-white/85">{p.subheading}</p>}
            {p.cta && <a href={p.cta.href} className="mt-8 inline-block rounded-lg bg-accent px-6 py-3 font-semibold text-ink">{p.cta.label}</a>}
          </div>
        </section>
      );
    case 'text':
      return <section className="mx-auto max-w-3xl px-4 py-10 [&_p]:mt-3 [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold" dangerouslySetInnerHTML={{ __html: sanitize(String(p.html ?? '')) }} />;
    case 'stats':
      return <section className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-10 md:grid-cols-4">{(p.items ?? []).map((s: any) => <div key={s.label} className="rounded-xl border border-line bg-surface p-5 text-center"><div className="text-3xl font-bold text-brand">{s.value}</div><div className="text-sm text-muted">{s.label}</div></div>)}</section>;
    case 'features':
    case 'programmes':
    case 'faculty':
    case 'testimonials':
      return <section className="mx-auto max-w-6xl px-4 py-12">{p.title && <h2 className="text-2xl font-bold">{p.title}</h2>}<div className="mt-6 grid gap-4 md:grid-cols-3">{(p.items ?? []).map((x: any, i: number) => <article key={i} className="rounded-xl border border-line bg-surface p-5">{x.imageFileId && <img src={img(x.imageFileId)} alt={x.title ?? ''} className="mb-3 aspect-video w-full rounded-lg object-cover" loading="lazy" />}<h3 className="font-semibold">{x.title ?? x.name}</h3>{x.body && <p className="mt-1 text-sm text-muted">{x.body}</p>}</article>)}</div></section>;
    case 'notices':
      return <section className="mx-auto max-w-6xl px-4 py-10"><h2 className="text-2xl font-bold">Notices</h2><ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">{(b.data ?? []).length ? b.data.map((n: any) => <li key={n.id} className="flex justify-between gap-4 px-4 py-3"><span>{n.title}</span><time className="text-sm text-muted">{date(n.publishAt)}</time></li>) : <li className="px-4 py-3 text-muted">No notices right now.</li>}</ul></section>;
    case 'events':
      return <section className="mx-auto max-w-6xl px-4 py-10"><h2 className="text-2xl font-bold">Upcoming events</h2><div className="mt-4 grid gap-3 md:grid-cols-3">{(b.data ?? []).map((e: any) => <div key={e.id} className="rounded-xl border border-line bg-surface p-4"><time className="text-sm font-medium text-brand">{date(e.startsOn)}</time><p className="mt-1 font-medium">{e.title}</p></div>)}</div></section>;
    case 'gallery':
    case 'toppers':
      return <section className="mx-auto max-w-6xl px-4 py-10"><h2 className="text-2xl font-bold">{b.type === 'gallery' ? 'Gallery' : 'Our toppers'}</h2><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{(b.data ?? []).flatMap((g: any) => (g.images ?? []).slice(0, 4).map((id: string) => <img key={id} src={img(id)} alt={g.title} loading="lazy" className="aspect-square w-full rounded-lg object-cover" />))}</div></section>;
    case 'courses':
      return <section className="mx-auto max-w-6xl px-4 py-10"><h2 className="text-2xl font-bold">Courses</h2><div className="mt-4 grid gap-4 md:grid-cols-3">{(b.data ?? []).map((c: any) => <a key={c.id} href={`/courses/${c.slug}`} className="rounded-xl border border-line bg-surface p-5"><p className="font-semibold">{c.title}</p><p className="mt-2 text-brand">{c.pricePaise ? `₹${(c.pricePaise / 100).toLocaleString('en-IN')}` : 'Free'}</p></a>)}</div></section>;
    case 'faq':
      return <section className="mx-auto max-w-3xl px-4 py-10"><h2 className="text-2xl font-bold">Frequently asked questions</h2><div className="mt-4 space-y-2">{(p.items ?? []).map((f: any) => <details key={f.q} className="rounded-lg border border-line bg-surface p-4"><summary className="cursor-pointer font-medium">{f.q}</summary><p className="mt-2 text-muted">{f.a}</p></details>)}</div></section>;
    case 'contact':
      return <section className="mx-auto max-w-6xl px-4 py-10"><h2 className="text-2xl font-bold">Contact us</h2><address className="mt-3 not-italic text-muted">{site.branding?.address ?? site.tenant.city}<br />{site.branding?.phone && <a href={`tel:${site.branding.phone}`} className="text-brand">{site.branding.phone}</a>}<br />{site.branding?.email && <a href={`mailto:${site.branding.email}`} className="text-brand">{site.branding.email}</a>}</address></section>;
    case 'map':
      return <section className="mx-auto max-w-6xl px-4 pb-10"><iframe title="Map" loading="lazy" className="h-72 w-full rounded-xl border border-line" src={`https://www.openstreetmap.org/export/embed.html?bbox=${p.bbox ?? ''}&layer=mapnik${p.lat ? `&marker=${p.lat},${p.lng}` : ''}`} /></section>;
    case 'form':
      return <section className="mx-auto max-w-xl px-4 py-10"><EnquiryForm host={host} formKey={p.formKey ?? 'admission'} /></section>;
    case 'cta':
      return <section className="mx-auto max-w-6xl px-4 py-12 text-center"><h2 className="text-2xl font-bold">{p.heading}</h2><a href={p.href ?? '/admissions'} className="mt-4 inline-block rounded-lg bg-brand px-6 py-3 font-medium text-white">{p.label ?? 'Enquire now'}</a></section>;
    case 'image':
      return p.fileId ? <figure className="mx-auto max-w-5xl px-4 py-6"><img src={img(p.fileId)} alt={p.alt ?? ''} loading="lazy" className="w-full rounded-xl" />{p.caption && <figcaption className="mt-2 text-center text-sm text-muted">{p.caption}</figcaption>}</figure> : null;
    case 'html':
      return <section className="mx-auto max-w-6xl px-4 py-6" dangerouslySetInnerHTML={{ __html: sanitize(String(p.html ?? '')) }} />;
    default:
      return null;
  }
}
