import type { ReactNode } from 'react';
import type { BlockStyle } from '@aadhyay/contracts';
import { PUBLIC_API_URL } from '@/lib/config';
import { EnquiryForm } from './enquiry-form';

/**
 * Website block renderer, shared by the public site (server) and the builder canvas (client).
 * Layout uses container queries (@3xl = tablet, @5xl = desktop) so the builder's device preview is exact.
 * HTML is never trusted: the caller passes the sanitiser for its environment.
 */
export type Sanitize = (html: string) => string;
export interface BlockData { id: string; type: string; props?: Record<string, any>; style?: BlockStyle; data?: any[] }
export interface SiteInfo { tenant: { name: string; city?: string | null }; branding?: Record<string, any> }

const img = (id?: string) => (id ? `${PUBLIC_API_URL}/v1/files/public/${id}` : undefined);
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');
const cx = (...c: unknown[]) => c.filter((x) => typeof x === 'string' && x).join(' ');

export function Blocks({ blocks, site, host, sanitize, editor }: { blocks: BlockData[]; site: SiteInfo; host: string; sanitize: Sanitize; editor?: boolean }) {
  return <>{blocks.map((b) => <Section key={b.id} b={b}><Block b={b} site={site} host={host} sanitize={sanitize} editor={editor} /></Section>)}</>;
}

const BG: Record<string, string> = { none: '', muted: 'bg-[#f4f6fa]', 'brand-soft': 'bg-brand-soft', brand: 'bg-brand text-white [--muted-on:rgba(255,255,255,.82)]', dark: 'bg-[#0f172a] text-white [--muted-on:rgba(255,255,255,.75)]' };
const PAD: Record<string, string> = { none: 'py-0', sm: 'py-8', md: 'py-14 @3xl:py-20', lg: 'py-20 @3xl:py-28' };
const WIDTH: Record<string, string> = { narrow: 'max-w-3xl', normal: 'max-w-6xl', wide: 'max-w-7xl' };

/** Wraps each block with its visual settings. */
export function Section({ b, children }: { b: BlockData; children: ReactNode }) {
  const s = b.style ?? {};
  const full = b.type === 'hero' || b.type === 'admission-cta';
  return (
    <section id={s.anchor || undefined} data-block={b.type}
      className={cx(BG[s.background ?? 'none'], !full && PAD[s.padding ?? (b.type === 'spacer' ? 'none' : 'md')], s.align === 'center' && 'text-center', s.hideOn === 'mobile' && 'hidden @3xl:block', s.hideOn === 'desktop' && '@3xl:hidden')}>
      {full ? children : <div className={cx('mx-auto px-5', WIDTH[s.width ?? (b.type === 'text' || b.type === 'faq' || b.type === 'quote' ? 'narrow' : 'normal')])}>{children}</div>}
    </section>
  );
}

const muted = 'text-[color:var(--muted-on,#5b6475)]';
function H2({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  if (!children) return null;
  return <div className="mb-8"><h2 className="text-2xl font-bold tracking-tight @3xl:text-3xl">{children}</h2>{sub && <p className={cx('mt-2 max-w-2xl text-base', muted)}>{sub}</p>}</div>;
}
function Btn({ href, label, variant = 'primary' }: { href?: string; label?: string; variant?: 'primary' | 'light' | 'ghost' }) {
  if (!label) return null;
  const cls = variant === 'light' ? 'bg-white text-brand hover:bg-white/90' : variant === 'ghost' ? 'border border-white/50 text-white hover:bg-white/10' : 'bg-brand text-white hover:brightness-110';
  return <a href={href || '#'} className={cx('inline-flex h-11 items-center rounded-lg px-6 text-sm font-semibold shadow-sm transition', cls)}>{label}</a>;
}
const Card = ({ children, className }: { children: ReactNode; className?: string }) => <article className={cx('rounded-2xl border border-black/[0.07] bg-white p-6 text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_-12px_rgba(15,23,42,.12)]', className)}>{children}</article>;
const Placeholder = ({ label, editor }: { label: string; editor?: boolean }) => (editor ? <div className="grid h-40 place-items-center rounded-xl border-2 border-dashed border-black/15 text-sm text-black/45">{label}</div> : null);

function youtubeEmbed(url?: string) {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  return vm ? `https://player.vimeo.com/video/${vm[1]}` : null;
}

function Block({ b, site, host, sanitize, editor }: { b: BlockData; site: SiteInfo; host: string; sanitize: Sanitize; editor?: boolean }) {
  const p = b.props ?? {};
  const items: any[] = Array.isArray(p.items) ? p.items : [];
  const data: any[] = b.data ?? [];
  switch (b.type) {
    case 'hero': {
      const ctaLabel = p.ctaLabel ?? p.cta?.label, ctaHref = p.ctaHref ?? p.cta?.href;
      return (
        <div className="relative overflow-hidden bg-brand text-white">
          {p.imageFileId && <img src={img(p.imageFileId)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
          <div className="absolute inset-0 bg-gradient-to-br from-brand via-brand/90 to-accent/80 mix-blend-multiply" aria-hidden />
          <div className={cx('relative mx-auto max-w-6xl px-5 py-20 @3xl:py-28 @5xl:py-32', b.style?.align === 'center' && 'text-center')}>
            <h1 className={cx('max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight @3xl:text-5xl @5xl:text-6xl', b.style?.align === 'center' && 'mx-auto')}>{p.heading || site.tenant.name}</h1>
            {p.subheading && <p className={cx('mt-5 max-w-2xl text-lg text-white/85', b.style?.align === 'center' && 'mx-auto')}>{p.subheading}</p>}
            <div className={cx('mt-8 flex flex-wrap gap-3', b.style?.align === 'center' && 'justify-center')}><Btn href={ctaHref} label={ctaLabel} variant="light" /><Btn href={p.cta2Href} label={p.cta2Label} variant="ghost" /></div>
          </div>
        </div>
      );
    }
    case 'heading':
      return p.level === 'h3' ? <div><h3 className="text-xl font-semibold">{p.text}</h3>{p.subtitle && <p className={cx('mt-2', muted)}>{p.subtitle}</p>}</div> : <div><h2 className="text-3xl font-bold tracking-tight @3xl:text-4xl">{p.text}</h2>{p.subtitle && <p className={cx('mt-3 max-w-2xl text-lg', muted, b.style?.align === 'center' && 'mx-auto')}>{p.subtitle}</p>}</div>;
    case 'spacer':
      return <div aria-hidden className={p.size === 'sm' ? 'h-6' : p.size === 'lg' ? 'h-24' : 'h-12'} />;
    case 'text':
      return <div className="text-[17px] leading-relaxed [&_a]:text-brand [&_a]:underline [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-4 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: sanitize(String(p.html ?? '')) }} />;
    case 'split': {
      const imgEl = p.imageFileId ? <img src={img(p.imageFileId)} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover shadow-lg" loading="lazy" /> : <Placeholder label="Choose an image" editor={editor} />;
      return (
        <div className="grid items-center gap-10 @3xl:grid-cols-2">
          <div className={p.imageSide === 'left' ? '@3xl:order-2' : ''}>
            {p.heading && <h2 className="text-3xl font-bold tracking-tight">{p.heading}</h2>}
            <div className="mt-4 text-[17px] leading-relaxed [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: sanitize(String(p.html ?? '')) }} />
            {p.ctaLabel && <div className="mt-6"><Btn href={p.ctaHref} label={p.ctaLabel} /></div>}
          </div>
          <div className={p.imageSide === 'left' ? '@3xl:order-1' : ''}>{imgEl}</div>
        </div>
      );
    }
    case 'quote':
      return <figure><blockquote className="text-2xl font-medium leading-snug @3xl:text-3xl">“{p.text}”</blockquote>{p.author && <figcaption className={cx('mt-4 text-sm font-medium', muted)}>— {p.author}</figcaption>}</figure>;
    case 'image':
      return p.fileId ? <figure><img src={img(p.fileId)} alt={p.alt ?? ''} loading="lazy" className="w-full rounded-2xl" />{p.caption && <figcaption className={cx('mt-3 text-center text-sm', muted)}>{p.caption}</figcaption>}</figure> : <Placeholder label="Choose an image" editor={editor} />;
    case 'image-grid':
      return <><H2>{p.title}</H2>{items.length ? <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">{items.filter((i) => i.fileId).map((i, k) => <img key={k} src={img(i.fileId)} alt={i.alt ?? ''} loading="lazy" className="aspect-square w-full rounded-xl object-cover" />)}</div> : <Placeholder label="Add photos" editor={editor} />}</>;
    case 'video': {
      const src = youtubeEmbed(p.url);
      return src ? <figure><div className="aspect-video overflow-hidden rounded-2xl shadow-lg"><iframe src={src} title={p.caption || 'Video'} loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full" /></div>{p.caption && <figcaption className={cx('mt-3 text-center text-sm', muted)}>{p.caption}</figcaption>}</figure> : <Placeholder label="Paste a YouTube or Vimeo link" editor={editor} />;
    }
    case 'features':
    case 'programmes':
      return <><H2 sub={p.subtitle}>{p.title}</H2><div className="grid gap-5 @3xl:grid-cols-2 @5xl:grid-cols-3">{items.map((x, i) => <Card key={i}>{x.imageFileId && <img src={img(x.imageFileId)} alt="" className="mb-4 aspect-video w-full rounded-xl object-cover" loading="lazy" />}<span className="mb-3 inline-grid size-9 place-items-center rounded-lg bg-brand-soft text-sm font-bold text-brand">{i + 1}</span><h3 className="text-lg font-semibold">{x.title}</h3>{x.body && <p className="mt-1.5 text-[15px] text-[#5b6475]">{x.body}</p>}</Card>)}</div></>;
    case 'stats':
      return <div className="grid grid-cols-2 gap-4 @5xl:grid-cols-4">{items.map((s, i) => <div key={i} className="rounded-2xl border border-black/[0.07] bg-white p-6 text-center text-[#0f172a] shadow-sm"><div className="text-3xl font-bold tracking-tight text-brand @3xl:text-4xl">{s.value}</div><div className="mt-1 text-sm text-[#5b6475]">{s.label}</div></div>)}</div>;
    case 'testimonials':
      return <><H2>{p.title}</H2>{items.length ? <div className="grid gap-5 @3xl:grid-cols-2 @5xl:grid-cols-3">{items.map((t, i) => <Card key={i}><p className="text-[15px] leading-relaxed">“{t.body}”</p><p className="mt-4 text-sm font-semibold">{t.name}</p>{t.role && <p className="text-xs text-[#5b6475]">{t.role}</p>}</Card>)}</div> : <Placeholder label="Add testimonials" editor={editor} />}</>;
    case 'faq':
      return <><H2>{p.title ?? 'Frequently asked questions'}</H2><div className="space-y-3">{items.map((f, i) => <details key={i} className="group rounded-xl border border-black/[0.08] bg-white p-5 text-[#0f172a]"><summary className="cursor-pointer list-none font-semibold marker:hidden">{f.q}<span className="float-right text-[#5b6475] transition group-open:rotate-45">+</span></summary><p className="mt-3 text-[#5b6475]">{f.a}</p></details>)}</div></>;
    case 'timeline':
      return <><H2>{p.title}</H2><ol className="grid gap-5 @3xl:grid-cols-3">{items.map((s, i) => <li key={i} className="relative rounded-2xl border border-black/[0.07] bg-white p-6 text-[#0f172a]"><span className="grid size-9 place-items-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span><h3 className="mt-3 font-semibold">{s.title}</h3>{s.body && <p className="mt-1 text-sm text-[#5b6475]">{s.body}</p>}</li>)}</ol></>;
    case 'logos':
      return <><H2>{p.title}</H2>{items.length ? <div className="flex flex-wrap items-center justify-center gap-8">{items.map((l, i) => (l.fileId ? <img key={i} src={img(l.fileId)} alt={l.name ?? ''} className="h-12 w-auto object-contain opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0" loading="lazy" /> : <span key={i} className="font-semibold text-[#5b6475]">{l.name}</span>))}</div> : <Placeholder label="Add logos" editor={editor} />}</>;
    case 'faculty':
      return <><H2>{p.title}</H2>{items.length ? <div className="grid grid-cols-2 gap-5 @3xl:grid-cols-3 @5xl:grid-cols-4">{items.map((f, i) => <div key={i} className="text-center">{f.imageFileId ? <img src={img(f.imageFileId)} alt="" className="mx-auto aspect-square w-full rounded-2xl object-cover" loading="lazy" /> : <div className="mx-auto grid aspect-square w-full place-items-center rounded-2xl bg-brand-soft text-3xl font-bold text-brand">{String(f.name ?? '?')[0]}</div>}<p className="mt-3 font-semibold">{f.name}</p><p className={cx('text-sm', muted)}>{f.title}</p></div>)}</div> : <Placeholder label="Add people" editor={editor} />}</>;
    case 'pricing':
      return <><H2>{p.title}</H2>{items.length ? <div className="grid gap-5 @3xl:grid-cols-3">{items.map((x, i) => <Card key={i}><h3 className="font-semibold">{x.name}</h3><p className="mt-2 text-2xl font-bold text-brand">{x.price}</p>{x.body && <p className="mt-3 whitespace-pre-line text-sm text-[#5b6475]">{x.body}</p>}</Card>)}</div> : <Placeholder label="Add fee plans" editor={editor} />}</>;
    case 'cta':
      return <div className="rounded-3xl bg-gradient-to-br from-brand to-accent px-8 py-12 text-center text-white shadow-lg"><h2 className="text-3xl font-bold tracking-tight">{p.heading}</h2>{p.body && <p className="mx-auto mt-3 max-w-xl text-white/85">{p.body}</p>}<div className="mt-6"><Btn href={p.href ?? '/admissions'} label={p.label ?? 'Enquire now'} variant="light" /></div></div>;
    case 'principal':
      return <div className="grid items-center gap-8 @3xl:grid-cols-[260px_1fr]">{p.imageFileId ? <img src={img(p.imageFileId)} alt={p.name ?? ''} className="aspect-[4/5] w-full rounded-2xl object-cover shadow-lg" loading="lazy" /> : <div className="grid aspect-[4/5] w-full place-items-center rounded-2xl bg-brand-soft text-5xl font-bold text-brand">{String(p.name ?? 'P')[0]}</div>}<div><p className="text-sm font-semibold uppercase tracking-wide text-brand">{p.role ?? 'Principal'}’s message</p><blockquote className="mt-3 whitespace-pre-line text-lg leading-relaxed">{p.message}</blockquote>{p.name && <p className="mt-4 font-semibold">— {p.name}</p>}</div></div>;
    case 'admission-cta':
      return <div className="bg-gradient-to-r from-accent to-brand text-white"><div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-5 py-10 @3xl:flex-row @3xl:items-center @3xl:justify-between"><div><p className="text-sm font-semibold uppercase tracking-wide text-white/80">Admissions open{p.session ? ` · ${p.session}` : ''}</p><p className="mt-1 text-2xl font-bold">{p.body}</p></div><Btn href="/admissions" label="Enquire now" variant="light" /></div></div>;
    case 'fee-cta':
      return <Card className="flex flex-col gap-4 @3xl:flex-row @3xl:items-center @3xl:justify-between"><div><h3 className="text-lg font-semibold">Pay fees online</h3><p className="mt-1 text-[#5b6475]">{p.body}</p></div><Btn href="/pay" label="Pay now" /></Card>;
    case 'contact': {
      const br = site.branding ?? {};
      return <><H2>{p.title ?? 'Contact us'}</H2><div className="grid gap-4 @3xl:grid-cols-3">{[['Address', br.address ?? site.tenant.city], ['Phone', br.phone && <a href={`tel:${br.phone}`} className="text-brand">{br.phone}</a>], ['Email', br.email && <a href={`mailto:${br.email}`} className="text-brand">{br.email}</a>]].map(([k, v]) => <Card key={String(k)}><p className="text-xs font-semibold uppercase tracking-wide text-[#5b6475]">{k}</p><p className="mt-1">{v || '—'}</p></Card>)}</div></>;
    }
    case 'map':
      return <iframe title="Map" loading="lazy" className="h-80 w-full rounded-2xl border border-black/[0.07]" src={`https://www.google.com/maps?q=${encodeURIComponent(p.lat && p.lng ? `${p.lat},${p.lng}` : `${site.tenant.name} ${site.tenant.city ?? ''}`)}&output=embed`} />;
    case 'notices':
      return <><H2>{p.title ?? 'Notices'}</H2><ul className="divide-y divide-black/[0.07] overflow-hidden rounded-2xl border border-black/[0.07] bg-white text-[#0f172a]">{data.length ? data.map((n) => <li key={n.id} className="flex justify-between gap-4 px-5 py-4"><span className="font-medium">{n.title}</span><time className="shrink-0 text-sm text-[#5b6475]">{fmtDate(n.publishAt)}</time></li>) : <li className="px-5 py-4 text-[#5b6475]">{editor ? 'Public notices appear here automatically.' : 'No notices right now.'}</li>}</ul></>;
    case 'events':
      return <><H2>{p.title ?? 'Upcoming events'}</H2>{data.length ? <div className="grid gap-4 @3xl:grid-cols-3">{data.map((e) => <Card key={e.id}><time className="text-sm font-semibold text-brand">{fmtDate(e.startsOn)}</time><p className="mt-1 font-semibold">{e.title}</p></Card>)}</div> : <Placeholder label="Upcoming calendar events appear here automatically" editor={editor} />}</>;
    case 'news':
      return <><H2>{p.title ?? 'Latest news'}</H2>{data.length ? <div className="grid gap-5 @3xl:grid-cols-3">{data.map((n) => <a key={n.id} href={`/${p.kind === 'blog' ? 'blog' : 'news'}/${n.slug}`} className="group overflow-hidden rounded-2xl border border-black/[0.07] bg-white text-[#0f172a] shadow-sm">{n.coverFileId && <img src={img(n.coverFileId)} alt="" className="aspect-video w-full object-cover" loading="lazy" />}<div className="p-5"><time className="text-xs text-[#5b6475]">{fmtDate(n.publishedAt)}</time><p className="mt-1 font-semibold group-hover:text-brand">{n.title}</p>{n.excerpt && <p className="mt-1 line-clamp-2 text-sm text-[#5b6475]">{n.excerpt}</p>}</div></a>)}</div> : <Placeholder label="Your latest posts appear here automatically" editor={editor} />}</>;
    case 'gallery':
    case 'toppers':
      return <><H2>{p.title ?? (b.type === 'gallery' ? 'Gallery' : 'Our toppers')}</H2>{data.length ? <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">{data.flatMap((g) => (g.images ?? []).slice(0, 4).map((id: string) => <img key={id} src={img(id)} alt={g.title} loading="lazy" className="aspect-square w-full rounded-xl object-cover" />))}</div> : <Placeholder label="Photos from gallery albums appear here automatically" editor={editor} />}</>;
    case 'courses':
      return <><H2>{p.title ?? 'Courses'}</H2>{data.length ? <div className="grid gap-5 @3xl:grid-cols-3">{data.map((c) => <a key={c.id} href={`/courses/${c.slug}`}><Card><p className="font-semibold">{c.title}</p><p className="mt-2 font-semibold text-brand">{c.pricePaise ? `₹${(c.pricePaise / 100).toLocaleString('en-IN')}` : 'Free'}</p></Card></a>)}</div> : <Placeholder label="Published courses appear here automatically" editor={editor} />}</>;
    case 'form':
      return <div className="mx-auto max-w-xl"><EnquiryForm host={host} formKey={p.formKey ?? 'admission'} heading={p.heading} disabled={editor} /></div>;
    case 'html':
      return <div dangerouslySetInnerHTML={{ __html: sanitize(String(p.html ?? '')) }} />;
    default:
      return editor ? <Placeholder label={`Unknown block “${b.type}”`} editor /> : null;
  }
}
