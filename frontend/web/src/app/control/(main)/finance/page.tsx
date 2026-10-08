import { capi } from '@/lib/control-api';
import { Card, PageHeader, Stat, Table } from '@/components/ui';
import { inr } from '@/lib/format';
/** The founders' money view: collections, expenses, GST, tax reserve, 80:20 split and the 60% spend ceiling. */
export default async function Finance({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month = new Date().toISOString().slice(0, 7) } = await searchParams;
  const r = await capi(`/finance/report?month=${month}`);
  const used = r.spendCeiling.usedPct;
  return (
    <>
      <PageHeader title={`Finance · ${month}`} sub="All figures ex-GST unless marked. Tax reserve uses 25.17% (Pvt Ltd, 115BAA) — confirm with your CA." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Net collections" value={inr(r.collections.netPaise)} sub={`Gross ${inr(r.collections.grossPaise)} incl. GST`} tone="ok" />
        <Stat label="Expenses" value={inr(r.expenses.totalOpexPaise)} sub={`incl. pass-through ${inr(r.expenses.passThroughCostPaise)}`} />
        <Stat label="Net profit" value={inr(r.netProfitPaise)} sub={`after tax reserve ${inr(r.incomeTaxReservePaise)}`} tone={r.netProfitPaise >= 0 ? 'ok' : 'bad'} />
        <Stat label="GST payable" value={inr(r.gst.payablePaise)} sub={`output ${inr(r.gst.outputPaise)} − ITC ${inr(r.gst.inputCreditPaise)}`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Profit split (80:20)">
          <div className="flex h-6 overflow-hidden rounded-full bg-canvas"><div className="bg-brand" style={{ width: '80%' }} /><div className="bg-accent" style={{ width: '20%' }} /></div>
          <dl className="mt-4 grid grid-cols-2 gap-4"><div><dt className="text-sm text-muted">Reinvest (80%)</dt><dd className="text-2xl font-semibold">{inr(r.split.reinvestPaise)}</dd></div><div><dt className="text-sm text-muted">Founders (20%)</dt><dd className="text-2xl font-semibold">{inr(r.split.foundersPaise)}</dd></div></dl>
        </Card>
        <Card title="Spend ceiling (60% rule)">
          <p className="text-sm text-muted">{r.spendCeiling.rule}</p>
          <div className="mt-3 h-4 overflow-hidden rounded-full bg-canvas"><div className={used > 100 ? 'bg-bad' : used > 80 ? 'bg-warn' : 'bg-ok'} style={{ width: `${Math.min(100, used ?? 0)}%`, height: '100%' }} /></div>
          <p className="mt-2 text-sm">{inr(r.spendCeiling.spentPaise)} of {inr(r.spendCeiling.ceilingPaise)} {used !== null ? `(${used}%)` : ''} — {r.spendCeiling.ok ? 'within limit ✅' : 'over limit ⚠️'}</p>
        </Card>
      </div>
      <Card title="Expenses" className="mt-6"><Table rows={r.expenses.rows} cols={[{ key: 'category', label: 'Category' }, { key: 'vendor', label: 'Vendor' }, { key: 'amountPaise', label: 'Amount', render: (e: any) => inr(e.amountPaise) }, { key: 'gstPaise', label: 'GST (ITC)', render: (e: any) => inr(e.gstPaise) }, { key: 'recurring', label: 'Recurring', render: (e: any) => (e.recurring ? 'Yes' : '') }]} /></Card>
    </>
  );
}
