'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, FileText, ImagePlus, Loader2, Search, Trash2, UploadCloud } from 'lucide-react';
import { call } from '@/lib/client';
import { cx } from '@/lib/format';
import { Alert, Button, ConfirmDialog, EmptyState, Input, Modal, useToast } from '@/components/ui';

export type Media = { id: string; mime: string; size: number; meta: { name?: string; alt?: string; caption?: string; folder?: string }; createdAt: string; usedOn: number; url: string };
const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'application/pdf', 'video/mp4', 'video/webm'];
const kb = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`);

/** Uploads straight to storage with a presigned URL, then records the file name. Returns the new media ids. */
async function upload(files: File[], onProgress: (msg: string) => void): Promise<{ ok: string[]; failed: string[] }> {
  const ok: string[] = [], failed: string[] = [];
  for (const [i, f] of files.entries()) {
    onProgress(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
    try {
      if (!ACCEPT.includes(f.type)) throw new Error('This file type isn’t allowed');
      const u = await call<{ fileId: string; uploadUrl: string; headers: Record<string, string> }>('/files/upload-url', { body: { purpose: 'website', mime: f.type, size: f.size, isPublic: true, filename: f.name } });
      const put = await fetch(u.uploadUrl, { method: 'PUT', headers: u.headers, body: f });
      if (!put.ok) throw new Error('Storage rejected the upload');
      await call(`/cms/media/${u.fileId}`, { method: 'PATCH', body: { name: f.name.slice(0, 120), alt: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').slice(0, 250) } });
      ok.push(u.fileId);
    } catch (e) { failed.push(`${f.name}: ${e instanceof Error ? e.message : 'failed'}`); }
  }
  return { ok, failed };
}

/** Media library: grid + details panel. In picker mode, choosing an image calls onPick. */
export function MediaLibrary({ onPick, canDelete = true }: { onPick?: (m: Media) => void; canDelete?: boolean }) {
  const toast = useToast();
  const [items, setItems] = useState<Media[] | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Media | null>(null);
  const [busy, setBusy] = useState('');
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try { setItems(await call<Media[]>(`/cms/media${q ? `?q=${encodeURIComponent(q)}` : ''}`)); setErr(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load media'); }
  }, [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  const doUpload = async (files: File[]) => {
    if (!files.length) return;
    const r = await upload(files, setBusy);
    setBusy('');
    if (r.ok.length) toast({ tone: 'ok', title: `${r.ok.length} file${r.ok.length === 1 ? '' : 's'} uploaded` });
    if (r.failed.length) toast({ tone: 'bad', title: 'Some files failed', body: r.failed.join(' · ') });
    await load();
  };
  const saveMeta = async (patch: Partial<Media['meta']>) => {
    if (!sel) return;
    const r = await call<{ meta: Media['meta'] }>(`/cms/media/${sel.id}`, { method: 'PATCH', body: patch });
    setSel({ ...sel, meta: r.meta }); setItems((xs) => xs?.map((x) => (x.id === sel.id ? { ...x, meta: r.meta } : x)) ?? null);
  };
  return (
    <div className="grid min-h-[420px] gap-4 lg:grid-cols-[1fr_280px]"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); void doUpload([...e.dataTransfer.files]); }}>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or alt text" aria-label="Search media" className="h-9 w-full rounded-md border border-line pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/15" /></div>
          <input ref={input} type="file" multiple accept={ACCEPT.join(',')} className="sr-only" onChange={(e) => { void doUpload([...(e.target.files ?? [])]); e.target.value = ''; }} />
          <Button icon={<UploadCloud />} onClick={() => input.current?.click()} loading={!!busy}>Upload</Button>
        </div>
        {busy && <p role="status" className="mb-3 flex items-center gap-2 text-[13px] text-muted"><Loader2 className="size-4 animate-spin" />{busy}</p>}
        {err && <Alert tone="bad" className="mb-3">{err}</Alert>}
        <div className={cx('rounded-xl border-2 border-dashed p-2 transition-colors', drag ? 'border-brand bg-brand-soft' : 'border-transparent')}>
          {items === null ? <div className="grid h-60 place-items-center"><Loader2 className="size-5 animate-spin text-faint" /></div>
            : !items.length ? <EmptyState icon={ImagePlus} title={q ? 'No matching files' : 'No media yet'} description="Drag images here or press Upload. JPG, PNG, WebP, GIF, PDF and MP4 are accepted." />
            : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {items.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => setSel(m)} onDoubleClick={() => onPick?.(m)} aria-pressed={sel?.id === m.id}
                      className={cx('group relative block aspect-square w-full overflow-hidden rounded-lg bg-sunken ring-2 transition', sel?.id === m.id ? 'ring-brand' : 'ring-transparent hover:ring-line-strong')}>
                      {m.mime.startsWith('image/') ? <img src={m.url} alt={m.meta.alt ?? ''} className="h-full w-full object-cover" loading="lazy" /> : <span className="grid h-full place-items-center text-muted"><FileText className="size-8" /></span>}
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4 text-left text-[11px] text-white">{m.meta.name ?? 'Untitled'}</span>
                      {m.usedOn > 0 && <span className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-1.5 text-[10px] font-medium text-ink">Used {m.usedOn}×</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
      <aside className="rounded-xl border border-line bg-surface-2 p-4">
        {sel ? (
          <div className="space-y-3">
            {sel.mime.startsWith('image/') && <img src={sel.url} alt="" className="max-h-40 w-full rounded-lg object-contain" />}
            <p className="text-xs text-muted">{sel.mime} · {kb(sel.size)} · {sel.usedOn ? `Used on ${sel.usedOn} ${sel.usedOn === 1 ? 'page' : 'pages'}` : 'Not used yet'}</p>
            <Input label="Name" defaultValue={sel.meta.name} key={`n${sel.id}`} onBlur={(e) => e.target.value !== (sel.meta.name ?? '') && void saveMeta({ name: e.target.value })} />
            <Input label="Alt text" hint="Describe the image for screen readers and Google" defaultValue={sel.meta.alt} key={`a${sel.id}`} onBlur={(e) => e.target.value !== (sel.meta.alt ?? '') && void saveMeta({ alt: e.target.value })} />
            <Input label="Caption" defaultValue={sel.meta.caption} key={`c${sel.id}`} onBlur={(e) => e.target.value !== (sel.meta.caption ?? '') && void saveMeta({ caption: e.target.value })} />
            <div className="flex flex-wrap gap-2 pt-1">
              {onPick && <Button size="sm" icon={<Check />} onClick={() => onPick(sel)}>Use this</Button>}
              <Button size="sm" variant="secondary" icon={<Copy />} onClick={() => { void navigator.clipboard.writeText(sel.url); toast({ tone: 'ok', title: 'Link copied' }); }}>Copy link</Button>
              {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 />} className="text-bad" onClick={() => setConfirmDel(true)}>Delete</Button>}
            </div>
          </div>
        ) : <p className="text-sm text-muted">Select a file to see details, edit alt text{onPick ? ', or double-click to use it' : ''}.</p>}
      </aside>
      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete this file?" confirmLabel="Delete file"
        consequence={sel?.usedOn ? <>It is used on {sel.usedOn} {sel.usedOn === 1 ? 'page' : 'pages'}. The server will refuse until you remove it from them.</> : <>The file is removed from storage permanently.</>}
        onConfirm={async () => { await call(`/cms/media/${sel!.id}`, { method: 'DELETE' }); setSel(null); await load(); toast({ tone: 'ok', title: 'File deleted' }); }} />
    </div>
  );
}

export function MediaPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (m: Media) => void }) {
  return <Modal open={open} onClose={onClose} size="lg" title="Choose from media library" description="Upload new files or pick an existing one."><MediaLibrary onPick={(m) => { onPick(m); onClose(); }} canDelete={false} /></Modal>;
}
