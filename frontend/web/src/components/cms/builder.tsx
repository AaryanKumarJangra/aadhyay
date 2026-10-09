'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import * as L from 'lucide-react';
import { BLOCKS, BLOCK_INDEX, STYLE_FIELDS, seoScore, type BlockStyle } from '@aadhyay/contracts';
import { call } from '@/lib/client';
import { cx } from '@/lib/format';
import { sanitizeClient } from '@/lib/sanitize-client';
import { Alert, Badge, Button, ConfirmDialog, Drawer, Input, Modal, StatusBadge, Switch, Textarea, useToast } from '@/components/ui';
import { Blocks, type BlockData, type SiteInfo } from '@/components/blocks';
import { FieldControl } from './fields';
import { MediaPicker } from './media-library';

type Seo = { title?: string; description?: string; ogImageFileId?: string; noindex?: boolean };
type Doc = { title: string; slug: string; seo: Seo; blocks: BlockData[] };
export interface EditorPage {
  id: string; slug: string; status: string; version: number; publishAt: string | null; hasDraft: boolean;
  working: { title: string; blocks: BlockData[]; seo: Seo; updatedAt: string };
  review: { status: 'none' | 'in_review' | 'changes_requested'; note: string | null; submittedAt: string | null };
  versions: { version: number; at: string; by: string | null; live: boolean }[];
}
type Device = 'desktop' | 'tablet' | 'mobile';
const WIDTHS: Record<Device, number | null> = { desktop: null, tablet: 820, mobile: 390 };
const GROUPS = ['Content', 'Text', 'Media', 'Layout', 'Institution', 'Live data', 'Forms', 'Advanced'] as const;
const icon = (name: string) => ((L as unknown as Record<string, L.LucideIcon>)[name] ?? L.Square);
const newId = () => Math.random().toString(36).slice(2, 10);

/** Visual page builder: palette · live canvas · properties. Saves drafts only; publishing is a separate, permissioned step. */
export function PageBuilder({ page, site, siteUrl, canPublish, forms }: { page: EditorPage; site: SiteInfo; siteUrl: string; canPublish: boolean; forms: { key: string; name: string }[] }) {
  const toast = useToast();
  const [doc, setDoc] = useState<Doc>({ title: page.working.title, slug: page.slug, seo: page.working.seo ?? {}, blocks: page.working.blocks ?? [] });
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [panel, setPanel] = useState<'content' | 'style'>('content');
  const [leftTab, setLeftTab] = useState<'blocks' | 'layers'>('blocks');
  const [search, setSearch] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [save, setSave] = useState<{ state: 'saved' | 'dirty' | 'saving' | 'error'; at?: string; msg?: string }>({ state: 'saved', at: page.working.updatedAt });
  const [review, setReview] = useState(page.review);
  const [hasDraft, setHasDraft] = useState(page.hasDraft);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [ogPick, setOgPick] = useState(false);
  // The canvas renders client-only: its HTML sanitiser needs the browser DOM (server output would be empty).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dragRef = useRef<{ kind: 'new'; type: string } | { kind: 'move'; id: string } | null>(null);
  // Last content known to be saved: autosave only when the document really differs (never on open).
  const savedJson = useRef(JSON.stringify({ title: page.working.title, slug: page.slug, seo: page.working.seo ?? {}, blocks: page.working.blocks ?? [] }));

  // ---- history (undo/redo) ----
  const change = useCallback((fn: (d: Doc) => Doc) => { setDoc((d) => { setPast((p) => [...p.slice(-99), d]); setFuture([]); return fn(d); }); }, []);
  const undo = () => setPast((p) => { if (!p.length) return p; setFuture((f) => [doc, ...f]); setDoc(p[p.length - 1]!); return p.slice(0, -1); });
  const redo = () => setFuture((f) => { if (!f.length) return f; setPast((p) => [...p, doc]); setDoc(f[0]!); return f.slice(1); });
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (!(e.metaKey || e.ctrlKey) || ['INPUT', 'TEXTAREA'].includes(tag) || (e.target as HTMLElement).isContentEditable) return;
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  // ---- autosave draft ----
  useEffect(() => {
    const json = JSON.stringify(doc);
    // Back to exactly what is saved (e.g. undo then redo): nothing to save, and nothing pending.
    if (json === savedJson.current) { setSave((x) => (x.state === 'dirty' ? { state: 'saved', at: x.at } : x)); return; }
    setSave({ state: 'dirty' });
    const t = setTimeout(async () => {
      setSave({ state: 'saving' });
      try {
        const r = await call<{ savedAt: string }>(`/cms/pages/${page.id}/draft`, { method: 'PUT', body: { title: doc.title, slug: doc.slug, seo: doc.seo, blocks: doc.blocks } });
        savedJson.current = json;
        setSave({ state: 'saved', at: r.savedAt }); setHasDraft(true);
      } catch (e) { setSave({ state: 'error', msg: e instanceof Error ? e.message : 'Could not save' }); }
    }, 1200);
    return () => clearTimeout(t);
  }, [doc, page.id]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save.state === 'dirty' || save.state === 'saving' || save.state === 'error') { e.preventDefault(); } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save.state]);

  // ---- block operations ----
  const selected = doc.blocks.find((b) => b.id === sel) ?? null;
  const def = selected ? BLOCK_INDEX.get(selected.type) : null;
  const insert = (type: string, at?: number) => {
    const d = BLOCK_INDEX.get(type)!;
    const b: BlockData = { id: newId(), type, props: structuredClone(d.defaults) as Record<string, unknown> };
    change((x) => { const blocks = [...x.blocks]; const i = at ?? (sel ? blocks.findIndex((y) => y.id === sel) + 1 : blocks.length); blocks.splice(i, 0, b); return { ...x, blocks }; });
    setSel(b.id); setPanel('content');
  };
  const moveTo = (id: string, to: number) => change((x) => { const blocks = [...x.blocks]; const from = blocks.findIndex((b) => b.id === id); const [b] = blocks.splice(from, 1); blocks.splice(to > from ? to - 1 : to, 0, b!); return { ...x, blocks }; });
  const move = (id: string, d: number) => { const i = doc.blocks.findIndex((b) => b.id === id); if (i + d >= 0 && i + d < doc.blocks.length) moveTo(id, d > 0 ? i + 2 : i - 1); };
  const duplicate = (id: string) => change((x) => { const i = x.blocks.findIndex((b) => b.id === id); const copy = { ...structuredClone(x.blocks[i]!), id: newId() }; const blocks = [...x.blocks]; blocks.splice(i + 1, 0, copy); setSel(copy.id); return { ...x, blocks }; });
  const remove = (id: string) => { change((x) => ({ ...x, blocks: x.blocks.filter((b) => b.id !== id) })); setSel(null); };
  const setProp = (k: string, v: unknown) => change((x) => ({ ...x, blocks: x.blocks.map((b) => (b.id === sel ? { ...b, props: { ...b.props, [k]: v } } : b)) }));
  const setStyle = (k: keyof BlockStyle, v: unknown) => change((x) => ({ ...x, blocks: x.blocks.map((b) => (b.id === sel ? { ...b, style: { ...b.style, [k]: v === '' ? undefined : v } } : b)) }));

  const onDrop = (e: DragEvent, at: number) => {
    e.preventDefault(); setDropAt(null);
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    if (d.kind === 'new') insert(d.type, at); else moveTo(d.id, at);
  };
  const DropZone = ({ at }: { at: number }) => (
    <div onDragOver={(e) => { e.preventDefault(); setDropAt(at); }} onDragLeave={() => setDropAt(null)} onDrop={(e) => onDrop(e, at)} className={cx('relative z-10 -my-2 h-4 transition-all', dropAt === at && 'h-10')}>
      {dropAt === at && <div className="absolute inset-x-4 top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_0_4px_rgba(37,99,235,.15)]" />}
    </div>
  );

  const palette = useMemo(() => BLOCKS.filter((b) => (advanced || !b.advanced) && (!search || `${b.label} ${b.description}`.toLowerCase().includes(search.toLowerCase()))), [search, advanced]);
  const score = seoScore({ title: doc.title, slug: doc.slug, seo: doc.seo, blocks: doc.blocks });
  const statusBadge = review.status === 'in_review' ? <StatusBadge tone="info">In review</StatusBadge> : review.status === 'changes_requested' ? <StatusBadge tone="warn">Changes requested</StatusBadge> : hasDraft ? <StatusBadge tone="warn">Unpublished changes</StatusBadge> : page.status === 'scheduled' ? <StatusBadge tone="info">Scheduled</StatusBadge> : <StatusBadge tone={page.status === 'published' ? 'ok' : 'neutral'}>{page.status === 'published' ? 'Live' : 'Draft'}</StatusBadge>;
  const saveLabel = save.state === 'saving' ? 'Saving…' : save.state === 'dirty' ? 'Unsaved changes' : save.state === 'error' ? 'Not saved' : 'Draft saved';

  const submit = async () => {
    try { await call(`/cms/pages/${page.id}/submit`, { body: {} }); setReview({ ...review, status: 'in_review' }); toast({ tone: 'ok', title: 'Sent for review', body: 'A publisher will review and publish it.' }); }
    catch (e) { toast({ tone: 'bad', title: 'Could not submit', body: e instanceof Error ? e.message : '' }); }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-canvas">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <Link href="/app/website" className="grid size-9 place-items-center rounded-md text-muted hover:bg-sunken" aria-label="Back to pages"><L.ArrowLeft className="size-4" /></Link>
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{doc.title || 'Untitled page'}</p><p className="truncate text-[11px] text-muted">/{doc.slug}</p></div>
        <div className="ml-2 hidden sm:block">{statusBadge}</div>
        <div className="mx-auto flex items-center gap-1 rounded-md border border-line bg-sunken p-0.5" role="radiogroup" aria-label="Preview device">
          {(['desktop', 'tablet', 'mobile'] as const).map((d) => { const I = d === 'desktop' ? L.Monitor : d === 'tablet' ? L.Tablet : L.Smartphone; return <button key={d} type="button" role="radio" aria-checked={device === d} aria-label={`${d} preview`} title={d} onClick={() => setDevice(d)} className={cx('grid size-8 place-items-center rounded-[5px]', device === d ? 'bg-surface text-ink shadow-xs' : 'text-muted')}><I className="size-4" /></button>; })}
        </div>
        <span className={cx('hidden text-xs md:inline', save.state === 'error' ? 'text-bad' : 'text-muted')} role="status" title={save.msg}>{saveLabel}</span>
        <button type="button" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo (Ctrl+Z)" className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-sunken disabled:opacity-30"><L.Undo2 className="size-4" /></button>
        <button type="button" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-sunken disabled:opacity-30"><L.Redo2 className="size-4" /></button>
        <button type="button" onClick={() => setVersionsOpen(true)} aria-label="Version history" title="Version history" className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-sunken"><L.History className="size-4" /></button>
        <a href={siteUrl} target="_blank" rel="noreferrer" className="hidden h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-ink-2 hover:bg-sunken lg:inline-flex"><L.ExternalLink className="size-4" />View live</a>
        {canPublish ? <Button icon={<L.Rocket />} onClick={() => setPublishOpen(true)} disabled={save.state === 'saving' || save.state === 'dirty'}>Publish</Button>
          : <Button icon={<L.Send />} onClick={submit} disabled={!hasDraft || review.status === 'in_review' || save.state !== 'saved'}>{review.status === 'in_review' ? 'In review' : 'Submit for review'}</Button>}
      </header>
      {review.status === 'changes_requested' && review.note && <div className="border-b border-warn/25 bg-warn-soft px-4 py-2 text-[13px] text-ink-2"><span className="font-semibold text-warn">Changes requested:</span> {review.note}</div>}
      {save.state === 'error' && <div role="alert" className="border-b border-bad/20 bg-bad-soft px-4 py-2 text-[13px] text-bad">Your last change wasn’t saved: {save.msg}. Keep this tab open; it retries on your next edit.</div>}

      <div className="flex min-h-0 flex-1">
        {/* Palette / layers */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <div className="flex gap-1 border-b border-line p-1.5" role="tablist">{(['blocks', 'layers'] as const).map((t) => <button key={t} role="tab" aria-selected={leftTab === t} type="button" onClick={() => setLeftTab(t)} className={cx('flex-1 rounded-md py-1.5 text-[13px] font-medium capitalize', leftTab === t ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-sunken')}>{t}</button>)}</div>
          {leftTab === 'blocks' ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a block…" aria-label="Find a block" className="mb-3 h-8 w-full rounded-md border border-line px-2.5 text-[13px] outline-none focus:border-brand" />
              {GROUPS.map((g) => {
                const list = palette.filter((b) => b.group === g);
                if (!list.length) return null;
                return (
                  <div key={g} className="mb-4">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">{g}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {list.map((b) => { const I = icon(b.icon); return (
                        <button key={b.type} type="button" draggable onDragStart={() => { dragRef.current = { kind: 'new', type: b.type }; }} onClick={() => insert(b.type)} title={b.description}
                          className="flex flex-col items-center gap-1 rounded-lg border border-line bg-surface px-1 py-2.5 text-center text-[11px] font-medium text-ink-2 hover:border-brand hover:text-brand active:cursor-grabbing">
                          <I className="size-4" aria-hidden />{b.label}
                        </button>
                      ); })}
                    </div>
                  </div>
                );
              })}
              <Switch className="border-t border-line pt-3" checked={advanced} onChange={setAdvanced} label="Advanced blocks" description="Custom HTML" />
            </div>
          ) : (
            <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin" aria-label="Page layers">
              {doc.blocks.map((b, i) => { const d = BLOCK_INDEX.get(b.type); const I = icon(d?.icon ?? 'Square'); return (
                <li key={b.id} draggable onDragStart={() => { dragRef.current = { kind: 'move', id: b.id }; }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, i)}
                  className={cx('flex cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-[13px]', sel === b.id ? 'border-brand bg-brand-soft text-brand' : 'border-line hover:bg-sunken')}>
                  <L.GripVertical className="size-3.5 text-faint" aria-hidden /><I className="size-3.5" aria-hidden /><button type="button" onClick={() => setSel(b.id)} className="min-w-0 flex-1 truncate text-left">{d?.label ?? b.type}</button>
                  {b.style?.hideOn && b.style.hideOn !== 'none' && <L.EyeOff className="size-3 text-muted" aria-label="Hidden on some devices" />}
                </li>
              ); })}
              {!doc.blocks.length && <li className="text-[13px] text-muted">No blocks yet.</li>}
            </ol>
          )}
        </aside>

        {/* Canvas */}
        <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6" onClick={() => setSel(null)}>
          <div className="mx-auto overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-line transition-[width]" style={{ width: WIDTHS[device] ?? '100%', maxWidth: '100%', ['--brand' as string]: site.branding?.primaryColor ?? '#2563eb', ['--accent' as string]: site.branding?.accentColor ?? '#4f46e5' }}>
            <div className="flex h-12 items-center justify-between border-b border-black/[0.06] px-5 text-[#0f172a]"><span className="flex items-center gap-2 text-sm font-bold"><span className="grid size-7 place-items-center rounded bg-brand text-xs text-white">{site.tenant.name[0]}</span>{site.tenant.name}</span><span className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white">Admissions</span></div>
            <div className="@container min-h-[60vh] text-[#0f172a]">
              {!mounted && <div className="space-y-3 p-6" aria-hidden><div className="skeleton h-40 rounded-xl" /><div className="skeleton h-24 rounded-xl" /></div>}
              {mounted && !doc.blocks.length && (
                <div onDragOver={(e) => { e.preventDefault(); setDropAt(0); }} onDrop={(e) => onDrop(e, 0)} className={cx('m-6 grid h-72 place-items-center rounded-2xl border-2 border-dashed text-center text-sm', dropAt === 0 ? 'border-brand bg-brand-soft text-brand' : 'border-black/15 text-black/45')}>
                  <div><L.MousePointerClick className="mx-auto mb-2 size-6" />Drag a block here, or click one in the palette.</div>
                </div>
              )}
              {mounted && doc.blocks.map((b, i) => {
                const d = BLOCK_INDEX.get(b.type);
                return (
                  <div key={b.id}>
                    <DropZone at={i} />
                    <div onClick={(e) => { e.stopPropagation(); setSel(b.id); }} draggable onDragStart={() => { dragRef.current = { kind: 'move', id: b.id }; }}
                      className={cx('group relative cursor-pointer outline outline-2 -outline-offset-2 transition-[outline-color]', sel === b.id ? 'outline-brand' : 'outline-transparent hover:outline-brand/40')}>
                      <span className={cx('absolute left-2 top-2 z-20 rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white', sel === b.id ? 'block' : 'hidden group-hover:block')}>{d?.label ?? b.type}{b.style?.hideOn && b.style.hideOn !== 'none' ? ` · hidden on ${b.style.hideOn}` : ''}</span>
                      {sel === b.id && (
                        <div className="absolute right-2 top-2 z-20 flex gap-0.5 rounded-md bg-ink p-0.5 shadow-lg" onClick={(e) => e.stopPropagation()}>
                          {[{ i: L.ArrowUp, l: 'Move up', f: () => move(b.id, -1) }, { i: L.ArrowDown, l: 'Move down', f: () => move(b.id, 1) }, { i: L.Copy, l: 'Duplicate', f: () => duplicate(b.id) }, { i: L.Trash2, l: 'Delete', f: () => remove(b.id) }].map((x) => <button key={x.l} type="button" aria-label={x.l} title={x.l} onClick={x.f} className="grid size-7 place-items-center rounded text-white hover:bg-white/15"><x.i className="size-3.5" /></button>)}
                        </div>
                      )}
                      <div className="pointer-events-none">
                        {(b.style?.hideOn === 'mobile' && device === 'mobile') || (b.style?.hideOn === 'desktop' && device !== 'mobile') ? <div className="bg-sunken py-3 text-center text-xs text-muted">Hidden on this device</div> : <Blocks blocks={[b]} site={site} host={site.tenant.name} sanitize={sanitizeClient} editor />}
                      </div>
                    </div>
                  </div>
                );
              })}
              {mounted && doc.blocks.length > 0 && <DropZone at={doc.blocks.length} />}
            </div>
          </div>
        </main>

        {/* Properties */}
        <aside className="hidden w-80 shrink-0 flex-col border-l border-line bg-surface md:flex">
          {selected && def ? (
            <>
              <div className="flex items-center justify-between border-b border-line px-4 py-3"><div><p className="text-sm font-semibold">{def.label}</p><p className="text-xs text-muted">{def.description}</p></div><button type="button" onClick={() => setSel(null)} aria-label="Close block settings" className="grid size-7 place-items-center rounded text-muted hover:bg-sunken"><L.X className="size-4" /></button></div>
              <div className="flex gap-1 border-b border-line p-1.5" role="tablist">{(['content', 'style'] as const).map((t) => <button key={t} role="tab" aria-selected={panel === t} type="button" onClick={() => setPanel(t)} className={cx('flex-1 rounded-md py-1.5 text-[13px] font-medium capitalize', panel === t ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-sunken')}>{t}</button>)}</div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
                {panel === 'content' ? (
                  <>
                    {def.live && <Alert tone="info">This block shows live data from your institution. You only choose how much to show.</Alert>}
                    {def.fields.map((f) => <FieldControl key={`${selected.id}-${f.key}`} def={f} value={selected.props?.[f.key]} onChange={(v) => setProp(f.key, v)} forms={forms} />)}
                  </>
                ) : STYLE_FIELDS.map((f) => <FieldControl key={`${selected.id}-s-${f.key}`} def={f} value={(selected.style as Record<string, unknown> | undefined)?.[f.key]} onChange={(v) => setStyle(f.key as keyof BlockStyle, v)} />)}
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 scrollbar-thin">
              <section className="space-y-3">
                <p className="text-sm font-semibold">Page</p>
                <Input label="Title" value={doc.title} onChange={(e) => change((d) => ({ ...d, title: e.target.value }))} />
                <Input label="Address" value={doc.slug} disabled={page.slug === ''} onChange={(e) => change((d) => ({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-/]/g, '-') }))} hint={page.slug === '' ? 'The home page address can’t change' : `${siteUrl.replace(/\/[^/]*$/, '')}/${doc.slug}`} />
              </section>
              <section className="space-y-3 border-t border-line pt-4">
                <div className="flex items-center justify-between"><p className="text-sm font-semibold">SEO</p><span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold tabular', score.score >= 80 ? 'bg-ok-soft text-ok' : score.score >= 50 ? 'bg-warn-soft text-warn' : 'bg-bad-soft text-bad')}>{score.score}/100</span></div>
                <Input label="Search title" value={doc.seo.title ?? ''} maxLength={70} hint={`${(doc.seo.title ?? doc.title).length}/60 characters`} onChange={(e) => change((d) => ({ ...d, seo: { ...d.seo, title: e.target.value || undefined } }))} />
                <Textarea label="Description" rows={3} maxLength={170} value={doc.seo.description ?? ''} hint={`${(doc.seo.description ?? '').length}/160 characters`} onChange={(e) => change((d) => ({ ...d, seo: { ...d.seo, description: e.target.value || undefined } }))} />
                <div className="rounded-lg border border-line p-3"><p className="text-[11px] text-muted">Google preview</p><p className="mt-1 truncate text-[15px] text-[#1a0dab]">{doc.seo.title || doc.title}</p><p className="truncate text-xs text-[#006621]">{siteUrl}</p><p className="line-clamp-2 text-xs text-[#4d5156]">{doc.seo.description || 'Add a description to improve clicks from search results.'}</p></div>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-ink-2">Social share image</p>
                  <button type="button" onClick={() => setOgPick(true)} className="w-full overflow-hidden rounded-lg border border-line text-left">
                    {doc.seo.ogImageFileId ? <img src={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/v1/files/public/${doc.seo.ogImageFileId}`} alt="" className="aspect-[1.91/1] w-full object-cover" /> : <div className="grid aspect-[1.91/1] place-items-center bg-sunken text-xs text-muted">Choose image (1200×630)</div>}
                    <div className="p-2.5"><p className="truncate text-[13px] font-semibold">{doc.seo.title || doc.title}</p><p className="truncate text-xs text-muted">{site.tenant.name}</p></div>
                  </button>
                </div>
                <Switch checked={!!doc.seo.noindex} onChange={(v) => change((d) => ({ ...d, seo: { ...d.seo, noindex: v || undefined } }))} label="Hide from search engines" />
                <ul className="space-y-1 text-xs">{score.checks.map((c) => <li key={c.label} className="flex items-center gap-1.5">{c.ok ? <L.CheckCircle2 className="size-3.5 text-ok" /> : <L.Circle className="size-3.5 text-faint" />}<span className={c.ok ? 'text-ink-2' : 'text-muted'}>{c.label}</span></li>)}</ul>
              </section>
              {hasDraft && <section className="border-t border-line pt-4"><Button variant="ghost" size="sm" icon={<L.RotateCcw />} className="text-bad" onClick={() => setDiscardOpen(true)}>Discard unpublished changes</Button></section>}
            </div>
          )}
        </aside>
      </div>

      <MediaPicker open={ogPick} onClose={() => setOgPick(false)} onPick={(m) => change((d) => ({ ...d, seo: { ...d.seo, ogImageFileId: m.id } }))} />
      <VersionsDrawer open={versionsOpen} onClose={() => setVersionsOpen(false)} page={page} onRestored={() => location.reload()} />
      <PublishModal open={publishOpen} onClose={() => setPublishOpen(false)} pageId={page.id} review={review} onDone={(when) => { setHasDraft(false); setReview({ status: 'none', note: null, submittedAt: null }); toast({ tone: 'ok', title: when ? 'Scheduled' : 'Published', body: when ? `Goes live ${new Date(when).toLocaleString('en-IN')}` : 'The page is live now.' }); }} />
      <ConfirmDialog open={discardOpen} onClose={() => setDiscardOpen(false)} title="Discard unpublished changes?" confirmLabel="Discard changes" consequence="The editor goes back to what is live now. This can’t be undone."
        onConfirm={async () => { await call(`/cms/pages/${page.id}/draft`, { method: 'DELETE' }); location.reload(); }} />
    </div>
  );
}

function PublishModal({ open, onClose, pageId, review, onDone }: { open: boolean; onClose: () => void; pageId: string; review: EditorPage['review']; onDone: (when?: string) => void }) {
  const [mode, setMode] = useState<'now' | 'later' | 'changes'>('now');
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try {
      if (mode === 'changes') { await call(`/cms/pages/${pageId}/request-changes`, { body: { note } }); location.reload(); return; }
      const publishAt = mode === 'later' ? new Date(when).toISOString() : undefined;
      await call(`/cms/pages/${pageId}/publish`, { body: { publishAt } }); onDone(publishAt); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Publish page" description="Publishing replaces the live page. The current live version is kept in history."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={go} disabled={(mode === 'later' && !when) || (mode === 'changes' && note.trim().length < 3)} variant={mode === 'changes' ? 'secondary' : 'primary'}>{mode === 'now' ? 'Publish now' : mode === 'later' ? 'Schedule' : 'Send back to author'}</Button></>}>
      <div className="space-y-3">
        {review.status === 'in_review' && <Alert tone="info" title="Submitted for review">{review.note ?? 'No note from the author.'}</Alert>}
        {(['now', 'later', 'changes'] as const).map((m) => (
          <label key={m} className={cx('flex cursor-pointer items-start gap-3 rounded-lg border p-3', mode === m ? 'border-brand bg-brand-soft/60' : 'border-line')}>
            <input type="radio" name="pub" className="mt-1 accent-[var(--color-brand)]" checked={mode === m} onChange={() => setMode(m)} />
            <span className="text-sm"><span className="font-medium">{m === 'now' ? 'Publish now' : m === 'later' ? 'Schedule' : 'Request changes'}</span><span className="block text-xs text-muted">{m === 'now' ? 'Visitors see it immediately.' : m === 'later' ? 'Goes live automatically at the time you choose.' : 'Send it back with a note; nothing goes live.'}</span></span>
          </label>
        ))}
        {mode === 'later' && <Input label="Go live at" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}
        {mode === 'changes' && <Textarea label="Note for the author" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
        {err && <Alert tone="bad">{err}</Alert>}
      </div>
    </Modal>
  );
}

function VersionsDrawer({ open, onClose, page, onRestored }: { open: boolean; onClose: () => void; page: EditorPage; onRestored: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const restore = async (v: number) => { setBusy(v); try { await call(`/cms/pages/${page.id}/restore`, { body: { version: v } }); onRestored(); } finally { setBusy(null); } };
  return (
    <Drawer open={open} onClose={onClose} title="Version history">
      <p className="mb-4 text-[13px] text-muted">Restoring copies a version into your draft. Nothing changes on the live site until you publish.</p>
      <ol className="space-y-2">
        {page.versions.map((v) => (
          <li key={v.version} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
            <span><span className="flex items-center gap-2 text-sm font-medium">Version {v.version}{v.live && <Badge tone="ok">Live</Badge>}</span><span className="text-xs text-muted">{v.at ? new Date(v.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}</span></span>
            <Button size="sm" variant="secondary" loading={busy === v.version} onClick={() => restore(v.version)}>Restore to draft</Button>
          </li>
        ))}
      </ol>
    </Drawer>
  );
}

