'use client';
import { useState } from 'react';
import { Button, Card, Input, Select, Table, Badge } from '@/components/ui';
import { call } from '@/lib/client';
import { inr, date } from '@/lib/format';

/** Counter fee collection: search → ledger → collect (auto oldest-first) → print receipt (A4 or thermal). */
export function FeeDesk({ defaulters }: { defaulters: any[] }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [student, setStudent] = useState<any>(null);
  const [ledger, setLedger] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('cash');
  const [receipt, setReceipt] = useState<any>(null);
  const [err, setErr] = useState('');
  async function search() { setResults((await call(`/people/students?q=${encodeURIComponent(q)}`)).items); }
  async function open(s: any) { setStudent(s); setReceipt(null); setLedger(await call(`/fees/students/${s.id ?? s.studentId}/ledger`)); }
  async function collect() {
    setErr('');
    try {
      const r = await call('/fees/collect', { body: { studentId: student.id ?? student.studentId, mode, amountPaise: Math.round(Number(amount) * 100) } });
      setReceipt(r); setAmount(''); await open(student);
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card title="Find student">
        <form onSubmit={(e) => { e.preventDefault(); void search(); }} className="flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or admission no" className="h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-sm" /><Button>Search</Button></form>
        <ul className="mt-3 divide-y divide-line">{(results.length ? results : defaulters.slice(0, 12)).map((s: any) => <li key={s.id ?? s.studentId}><button onClick={() => open(s)} className="flex w-full justify-between py-2 text-left text-sm"><span>{s.name}<span className="block text-xs text-muted">{s.admissionNo} · {s.className}-{s.sectionName}</span></span>{s.overduePaise && <span className="text-bad tabular">{inr(s.overduePaise)}</span>}</button></li>)}</ul>
        {!results.length && <p className="mt-2 text-xs text-muted">Showing top defaulters</p>}
      </Card>
      {ledger ? (
        <Card title={student.name} action={<Badge tone={ledger.totals.overduePaise ? 'bad' : 'ok'}>Due {inr(ledger.totals.outstandingPaise)}</Badge>}>
          <Table rows={ledger.lines.filter((l: any) => l.outstandingPaise > 0)} empty="All fees paid 🎉" cols={[{ key: 'title', label: 'Fee' }, { key: 'dueOn', label: 'Due', render: (l: any) => date(l.dueOn) }, { key: 'late', label: 'Late fee', render: (l: any) => inr(l.lateDuePaise - l.lateFeePaise), className: 'text-right' }, { key: 'o', label: 'Balance', render: (l: any) => inr(l.outstandingPaise), className: 'text-right tabular' }]} />
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <Input label="Amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={(ledger.totals.outstandingPaise / 100).toString()} />
            <Select label="Mode" value={mode} onChange={(e) => setMode(e.target.value)} options={['cash', 'upi', 'card', 'cheque', 'dd', 'bank_transfer', 'netbanking'].map((v) => ({ value: v, label: v.replace('_', ' ').toUpperCase() }))} />
            <Button onClick={collect} disabled={!amount}>Collect</Button>
          </div>
          {err && <p className="mt-3 text-sm text-bad">{err}</p>}
          {receipt && <div className="mt-5 flex items-center justify-between rounded-lg bg-ok/10 p-4 text-sm"><span>Receipt <b>{receipt.number}</b> · {inr(receipt.totalPaise)}</span><span className="flex gap-2"><a target="_blank" href={`/api/v1/fees/receipts/${receipt.id}/pdf`} className="underline">A4</a><a target="_blank" href={`/api/v1/fees/receipts/${receipt.id}/pdf?format=thermal`} className="underline">Thermal</a></span></div>}
        </Card>
      ) : <Card><p className="text-muted">Select a student to see their ledger.</p></Card>}
    </div>
  );
}
