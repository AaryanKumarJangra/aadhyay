'use client';
import { useEffect, useMemo, useState } from 'react';
import { inr } from '@/lib/format';

type Plan = { code: string; name: string; pricingUnit: string; pricePerUnitPaise: number; minMonthlyPaise: number; learnerLimit: number | null };
type Item = { code: string; name: string; unit: string; listPaise: number; kind: string };
export function PricingCalculator({ initial }: { initial: { plans: Plan[]; items: Item[] } | null }) {
  const [book, setBook] = useState(initial);
  useEffect(() => { if (!book) fetch('/api/v1/public/pricing').then((r) => r.json()).then(setBook).catch(() => undefined); }, [book]);
  const plans = book?.plans ?? [], items = book?.items ?? [];
  const [students, setStudents] = useState(600);
  const [plan, setPlan] = useState('professional');
  const [cycle, setCycle] = useState<'yearly' | 'quarterly'>('yearly');
  const [buses, setBuses] = useState(0);
  const [quote, setQuote] = useState<any>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch('/api/v1/public/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planCode: plan, students, cycle, addons: buses ? [{ code: 'gps_vehicle', quantity: buses }] : [], includeSetup: true }) });
      if (r.ok) setQuote(await r.json());
    }, 250);
    return () => clearTimeout(t);
  }, [students, plan, cycle, buses]);
  const studentPlans = useMemo(() => plans.filter((p) => p.pricingUnit === 'student'), [plans]);
  if (!book) return <p className="mt-10 rounded-lg border border-line p-6 text-muted">Loading live prices…</p>;
  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <button key={p.code} onClick={() => setPlan(p.code)} className={`rounded-xl border p-5 text-left transition ${plan === p.code ? 'border-brand ring-2 ring-brand/20 bg-surface' : 'border-line bg-surface hover:border-brand/40'}`}>
            <p className="font-semibold">{p.name}</p>
            <p className="mt-2 text-2xl font-bold tabular">{p.pricingUnit === 'student' ? `${inr(p.pricePerUnitPaise, { decimals: true })}` : inr(p.pricePerUnitPaise)}<span className="text-sm font-normal text-muted">{p.pricingUnit === 'student' ? ' /student/mo' : ' /month'}</span></p>
            <p className="text-xs text-muted">{inr(Math.round(p.pricePerUnitPaise * 1.18), { decimals: true })} incl. GST · min {inr(p.minMonthlyPaise)}/mo</p>
            {p.learnerLimit && <p className="mt-1 text-xs text-muted">Up to {p.learnerLimit.toLocaleString('en-IN')} learners</p>}
          </button>
        ))}
      </div>
      <aside className="rounded-xl border border-line bg-surface p-5 shadow-sm lg:sticky lg:top-24 lg:self-start">
        <h2 className="font-semibold">Your estimate</h2>
        <label className="mt-4 block text-sm">Active students: <b className="tabular">{students.toLocaleString('en-IN')}</b>
          <input type="range" min={50} max={6000} step={10} value={students} onChange={(e) => setStudents(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-brand)]" />
        </label>
        <label className="mt-3 block text-sm">School buses with GPS device: <b>{buses}</b>
          <input type="range" min={0} max={30} value={buses} onChange={(e) => setBuses(Number(e.target.value))} className="mt-2 w-full" />
        </label>
        <div className="mt-3 flex rounded-lg border border-line p-1 text-sm">
          {(['yearly', 'quarterly'] as const).map((c) => <button key={c} onClick={() => setCycle(c)} className={`flex-1 rounded-md py-1.5 capitalize ${cycle === c ? 'bg-brand text-white' : ''}`}>{c}{c === 'yearly' ? ' (2 months free)' : ''}</button>)}
        </div>
        {quote && (
          <dl className="mt-5 space-y-2 text-sm">
            {quote.lines.map((l: any) => <div key={l.code} className="flex justify-between gap-3"><dt className="text-muted">{l.description}</dt><dd className="tabular">{inr(l.amountPaise)}</dd></div>)}
            <div className="flex justify-between border-t border-line pt-2"><dt>Subtotal</dt><dd className="tabular">{inr(quote.subtotalPaise)}</dd></div>
            <div className="flex justify-between text-muted"><dt>GST 18%</dt><dd className="tabular">{inr(quote.taxPaise)}</dd></div>
            <div className="flex justify-between text-lg font-semibold"><dt>Total</dt><dd className="tabular">{inr(quote.totalPaise)}</dd></div>
            {quote.effectivePerStudentYearPaise && <p className="text-xs text-muted">≈ {inr(quote.effectivePerStudentYearPaise)} per student per year (ex-GST)</p>}
          </dl>
        )}
        <a href="/signup" className="mt-5 block rounded-lg bg-brand py-2.5 text-center font-medium text-white">Start free for 90 days</a>
        <p className="mt-2 text-center text-xs text-muted">Setup fee 50% off if you pay before day 60</p>
      </aside>
      <section className="lg:col-span-2">
        <h2 className="mt-6 text-xl font-semibold">Add-ons & usage (ex-GST)</h2>
        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          {items.filter((i) => ['addon', 'domain', 'flavour', 'usage'].includes(i.kind) && !i.code.startsWith('meta_')).map((i) => (
            <div key={i.code} className="flex justify-between rounded-lg border border-line bg-surface px-3 py-2"><span>{i.name}</span><span className="tabular text-muted">{i.listPaise < 100 ? `₹${(i.listPaise / 100).toFixed(2)}` : inr(i.listPaise)} {i.unit.replace(/_/g, ' ')}</span></div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">WhatsApp (official Meta API) = Meta’s rate + ₹0.04 per message + GST, from a prepaid wallet. Aadhyay Messenger, app notifications and email are free.</p>
      </section>
    </div>
  );
}
