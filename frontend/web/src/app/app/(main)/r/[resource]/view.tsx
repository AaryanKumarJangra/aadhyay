'use client';
import { useEffect, useState } from 'react';
import { RESOURCES } from '@/lib/resources';
import { Button, Card, Input, Select, Table } from '@/components/ui';
import { call } from '@/lib/client';
import { inr, date } from '@/lib/format';

export function ResourceView({ rkey }: { rkey: string }) {
  const r = RESOURCES[rkey]!;
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [loadError, setLoadError] = useState('');
  const load = () => call(`${r.api}?limit=200${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((x) => { setLoadError(''); setRows(Array.isArray(x) ? x : x.items); }).catch((e) => setLoadError(e.message));
  useEffect(() => { void load(); }, [rkey]);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const body = Object.fromEntries(r.fields.filter((x) => f[x.key] !== undefined && f[x.key] !== '').map((x) => [x.key, x.type === 'number' ? Number(f[x.key]) : x.type === 'money' ? Math.round(Number(f[x.key]) * 100) : f[x.key]]));
    try { await call(r.api, { body }); (e.target as HTMLFormElement).reset(); setMsg('Added ✓'); void load(); } catch (err: any) { setMsg(err.message); }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card title={<form onSubmit={(e) => { e.preventDefault(); void load(); }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-60 rounded-lg border border-line px-3 text-sm font-normal" /></form>}>
        {loadError ? <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-bad/10 px-4 py-3 text-sm text-bad"><span>{loadError}</span><button onClick={() => void load()} className="font-medium underline">Retry</button></div> : <Table rows={rows} cols={r.fields.filter((f) => f.list).map((f) => ({ key: f.key, label: f.label, render: (row: any) => (f.type === 'money' ? inr(row[f.key]) : f.type === 'date' ? date(row[f.key]) : String(row[f.key] ?? '—')) }))} />}
      </Card>
      {r.create !== false && (
        <Card title={`Add ${r.title.toLowerCase().replace(/s$/, '')}`}>
          <form onSubmit={create} className="space-y-3">
            {r.fields.filter((f) => f.key !== 'stock' && f.key !== 'inAt' && f.key !== 'status' || f.type === 'select').map((f) => f.type === 'select'
              ? <Select key={f.key} name={f.key} label={f.label} options={(f.options ?? []).map((o) => ({ value: o, label: o.replace('_', ' ') }))} />
              : <Input key={f.key} name={f.key} label={f.label + (f.type === 'money' ? ' (₹)' : '')} type={f.type === 'date' ? 'date' : f.type === 'number' || f.type === 'money' ? 'number' : 'text'} required={f.required} />)}
            <Button className="w-full">Add</Button>
            {msg && <p className="text-sm">{msg}</p>}
          </form>
        </Card>
      )}
    </div>
  );
}
