'use client';
import { useState } from 'react';
import { Cms } from '@aadhyay/contracts';
const BLOCK_TYPES = Cms.BLOCK_TYPES;
import { Button, Card, Input, Textarea, Badge } from '@/components/ui';
import { call } from '@/lib/client';

/** Block editor: reorder, add, edit block props (JSON), SEO panel, publish with version history. */
export function PageEditor({ pages, slug }: { pages: any[]; slug: string }) {
  const [sel, setSel] = useState<any>(pages.find((p) => p.slug === '') ?? pages[0]);
  const [blocks, setBlocks] = useState<any[]>(sel?.blocks ?? []);
  const [seo, setSeo] = useState<any>(sel?.seo ?? {});
  const [msg, setMsg] = useState('');
  const pick = (p: any) => { setSel(p); setBlocks(p.blocks); setSeo(p.seo ?? {}); setMsg(''); };
  const move = (i: number, d: number) => setBlocks((b) => { const n = [...b]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  async function save(publish: boolean) {
    try { const r = await call(`/cms/pages/${sel.id}`, { method: 'PUT', body: { blocks, seo, ...(publish ? { status: 'published' } : {}) } }); setSel(r); setMsg(`Saved version ${r.version}${publish ? ' and published' : ''}`); } catch (e: any) { setMsg(e.message); }
  }
  if (!sel) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr_320px]">
      <Card title="Pages"><ul className="space-y-1 text-sm">{pages.map((p) => <li key={p.id}><button onClick={() => pick(p)} className={`w-full rounded px-2 py-1 text-left ${p.id === sel.id ? 'bg-brand/10 text-brand' : ''}`}>/{p.slug || ''} <span className="text-xs text-muted">{p.locale}</span></button></li>)}</ul></Card>
      <Card title={sel.title} action={<a href={`/site/${slug}/${sel.slug}`} target="_blank" className="text-sm text-brand underline">Preview</a>}>
        <div className="space-y-3">
          {blocks.map((b, i) => (
            <div key={b.id} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center justify-between"><Badge tone="brand">{b.type}</Badge><span className="flex gap-1 text-xs"><button onClick={() => move(i, -1)} disabled={!i}>↑</button><button onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>↓</button><button onClick={() => setBlocks((x) => x.filter((_, j) => j !== i))} className="text-bad">remove</button></span></div>
              <textarea defaultValue={JSON.stringify(b.props, null, 1)} onBlur={(e) => { try { const props = JSON.parse(e.target.value); setBlocks((x) => x.map((y, j) => (j === i ? { ...y, props } : y))); } catch { setMsg('Invalid JSON in block'); } }} className="h-24 w-full rounded border border-line p-2 font-mono text-xs" />
            </div>
          ))}
          <select onChange={(e) => { if (e.target.value) setBlocks((x) => [...x, { id: Math.random().toString(36).slice(2, 10), type: e.target.value, props: {} }]); e.target.value = ''; }} className="h-9 rounded-lg border border-line px-2 text-sm"><option value="">+ Add block…</option>{BLOCK_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
      </Card>
      <Card title="SEO">
        <div className="space-y-3">
          <Input label="Title (≤ 60 chars)" value={seo.title ?? ''} maxLength={70} onChange={(e) => setSeo({ ...seo, title: e.target.value })} hint={`${(seo.title ?? '').length}/60`} />
          <Textarea label="Description (≤ 160 chars)" value={seo.description ?? ''} maxLength={170} rows={3} onChange={(e) => setSeo({ ...seo, description: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!seo.noindex} onChange={(e) => setSeo({ ...seo, noindex: e.target.checked })} /> Hide from Google</label>
          <div className="rounded-lg bg-canvas p-3 text-xs"><p className="text-[#1a0dab]">{seo.title || sel.title}</p><p className="text-ok">{slug}.aadhyay.com/{sel.slug}</p><p className="text-muted">{seo.description || 'Add a description to improve clicks from Google.'}</p></div>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => save(false)}>Save draft</Button><Button onClick={() => save(true)}>Publish</Button></div>
          {msg && <p className="text-sm">{msg}</p>}
          <p className="text-xs text-muted">Version {sel.version} · {(sel.history ?? []).length} older versions kept</p>
        </div>
      </Card>
    </div>
  );
}
