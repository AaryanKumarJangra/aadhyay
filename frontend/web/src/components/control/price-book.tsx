'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { ccall } from '@/lib/control-client';
import { Alert, Badge, Button, DataTable, Input, Modal, Textarea, useToast, humanize, type Column } from '@/components/ui';

export type PriceRow = { code: string; name: string; kind: string; unit: string; listPaise: number; minPaise: number | null; maxPaise: number | null; isActive: boolean; isPlan?: boolean };
const r = (p: number | null) => (p === null || p === undefined ? '—' : `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

/** Price book: the single source for marketing, onboarding and billing. Edits require a reason and are audited. */
export function PriceBook({ rows, canEdit }: { rows: PriceRow[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [edit, setEdit] = useState<PriceRow | null>(null);
  const [f, setF] = useState({ list: '', min: '', max: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const open = (row: PriceRow) => { setEdit(row); setErr(''); setF({ list: String(row.listPaise / 100), min: row.minPaise === null ? '' : String(row.minPaise / 100), max: row.maxPaise === null ? '' : String(row.maxPaise / 100), reason: '' }); };
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await ccall(`/price-book/${edit!.code}`, { method: 'PATCH', body: { listPaise: Math.round(Number(f.list) * 100), minPaise: f.min === '' ? undefined : Math.round(Number(f.min) * 100), maxPaise: f.max === '' ? undefined : Math.round(Number(f.max) * 100), reason: f.reason } });
      toast({ tone: 'ok', title: `${edit!.name} updated`, body: 'New quotes and the pricing page use it now; existing invoices keep their snapshot.' }); setEdit(null); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };
  const cols: Column<PriceRow>[] = [
    { key: 'name', header: 'Item', mobile: 'primary', value: (x) => x.name, cell: (x) => <span><span className="block font-medium text-ink">{x.name}</span><span className="font-mono text-[11px] text-muted">{x.code}</span></span> },
    { key: 'kind', header: 'Kind', mobile: 'secondary', value: (x) => x.kind, cell: (x) => <Badge tone={x.isPlan ? 'indigo' : 'neutral'}>{humanize(x.kind)}</Badge> },
    { key: 'unit', header: 'Unit', value: (x) => humanize(x.unit) },
    { key: 'list', header: 'List price', align: 'right', value: (x) => x.listPaise, cell: (x) => r(x.listPaise) },
    { key: 'range', header: 'Allowed range', align: 'right', value: (x) => x.minPaise ?? 0, cell: (x) => (x.minPaise !== null || x.maxPaise !== null ? `${r(x.minPaise)} – ${r(x.maxPaise)}` : '—') },
    { key: 'active', header: 'Status', value: (x) => (x.isActive ? 'active' : 'inactive'), cell: (x) => <Badge tone={x.isActive ? 'ok' : 'neutral'}>{x.isActive ? 'Active' : 'Inactive'}</Badge> },
    ...(canEdit ? [{ key: 'edit', header: '', sortable: false, mobile: 'hide' as const, cell: (x: PriceRow) => <Button size="sm" variant="secondary" icon={<Pencil />} onClick={() => open(x)}>Edit</Button> }] : []),
  ];
  const valid = Number(f.list) >= 0 && f.list !== '' && f.reason.trim().length >= 5 && (f.min === '' || f.max === '' || Number(f.min) <= Number(f.max));
  return (
    <>
      <DataTable rows={rows} columns={cols} rowKey={(x) => x.code} label="prices" exportName="price-book" searchPlaceholder="Search plans, add-ons, usage…" pageSize={50} />
      <Modal open={!!edit} onClose={() => !busy && setEdit(null)} title={`Edit ${edit?.name ?? ''}`} description="Account managers can quote only inside the allowed range; outside it needs super-admin approval."
        footer={<><Button variant="secondary" onClick={() => setEdit(null)} disabled={busy}>Cancel</Button><Button loading={busy} disabled={!valid} onClick={save}>Save price</Button></>}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="List price (₹)" type="number" min={0} step="0.01" value={f.list} onChange={(e) => setF({ ...f, list: e.target.value })} required />
            <Input label="Minimum (₹)" type="number" min={0} step="0.01" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
            <Input label="Maximum (₹)" type="number" min={0} step="0.01" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} error={f.min !== '' && f.max !== '' && Number(f.min) > Number(f.max) ? 'Must be at least the minimum' : undefined} />
          </div>
          <Textarea label="Reason for change" required rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} hint="Stored with the old and new values in the platform audit log." />
          <Alert tone="info">Issued invoices are never recalculated — they keep the prices they were issued with.</Alert>
          {err && <Alert tone="bad">{err}</Alert>}
        </div>
      </Modal>
    </>
  );
}
