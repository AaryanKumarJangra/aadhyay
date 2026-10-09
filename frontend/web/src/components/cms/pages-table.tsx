'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import { seoScore } from '@aadhyay/contracts';
import { call } from '@/lib/client';
import { Alert, Button, DataTable, Input, Modal, StatusBadge, type Column } from '@/components/ui';

export type PageRow = { id: string; slug: string; title: string; status: string; version: number; updatedAt: string; publishAt: string | null; reviewStatus: string; draft: unknown; seo: any; blocks: any[] };
const state = (p: PageRow) => p.reviewStatus === 'in_review' ? { tone: 'info' as const, label: 'In review' } : p.reviewStatus === 'changes_requested' ? { tone: 'warn' as const, label: 'Changes requested' } : p.draft ? { tone: 'warn' as const, label: p.status === 'published' ? 'Live · unpublished changes' : 'Draft' } : p.status === 'published' ? { tone: 'ok' as const, label: 'Live' } : p.status === 'scheduled' ? { tone: 'info' as const, label: 'Scheduled' } : { tone: 'neutral' as const, label: p.status === 'archived' ? 'Archived' : 'Draft' };

export function PagesTable({ rows, canCreate, siteBase }: { rows: PageRow[]; canCreate: boolean; siteBase: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const create = async () => {
    setBusy(true); setErr('');
    try { const p = await call<{ id: string }>('/cms/pages', { body: { title, slug, status: 'draft', blocks: [] } }); router.push(`/app/website/pages/${p.id}`); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not create the page'); setBusy(false); }
  };
  const cols: Column<PageRow>[] = [
    { key: 'title', header: 'Page', mobile: 'primary', value: (p) => p.title, cell: (p) => <span><span className="block font-medium text-ink">{p.title}</span><span className="text-xs text-muted">/{p.slug}</span></span> },
    { key: 'status', header: 'Status', value: (p) => state(p).label, cell: (p) => <StatusBadge tone={state(p).tone}>{state(p).label}</StatusBadge> },
    { key: 'seo', header: 'SEO', align: 'right', value: (p) => seoScore({ title: p.title, slug: p.slug, seo: p.seo ?? {}, blocks: p.blocks ?? [] }).score, cell: (p) => { const s = seoScore({ title: p.title, slug: p.slug, seo: p.seo ?? {}, blocks: p.blocks ?? [] }).score; return <span className={s >= 80 ? 'text-ok' : s >= 50 ? 'text-warn' : 'text-bad'}>{s}</span>; } },
    { key: 'version', header: 'Version', align: 'right', value: (p) => p.version },
    { key: 'updated', header: 'Updated', mobile: 'secondary', value: (p) => p.updatedAt, cell: (p) => new Date(p.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) },
    { key: 'view', header: '', sortable: false, mobile: 'hide', cell: (p) => (p.status === 'published' ? <a href={`${siteBase}/${p.slug}`} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-brand">View live</a> : null) },
  ];
  return (
    <>
      <DataTable rows={rows} columns={cols} rowKey={(p) => p.id} rowHref={(p) => `/app/website/pages/${p.id}`} label="pages" searchPlaceholder="Search pages"
        toolbar={canCreate ? <Button icon={<FilePlus2 />} onClick={() => setOpen(true)}>New page</Button> : undefined}
        empty={{ title: 'No pages yet', description: 'Create your first page to start your website.' }} />
      <Modal open={open} onClose={() => setOpen(false)} title="New page" size="sm" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} disabled={title.trim().length < 2} onClick={create}>Create & open builder</Button></>}>
        <div className="space-y-3"><Input label="Page title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Facilities" hint={slug ? `Address: /${slug}` : undefined} />{err && <Alert tone="bad">{err}</Alert>}</div>
      </Modal>
    </>
  );
}
