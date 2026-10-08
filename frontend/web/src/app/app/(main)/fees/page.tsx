import { api } from '@/lib/server-api';
import { PageHeader, Stat } from '@/components/ui';
import { inr } from '@/lib/format';
import { FeeDesk } from './desk';
export default async function Fees() {
  const d = await api('/fees/dashboard');
  const def = await api('/fees/defaulters').catch(() => []);
  return (
    <>
      <PageHeader title="Fees" actions={<a href="/api/v1/reports/export?dataset=receipts" className="rounded-lg border border-line bg-surface px-4 py-2 text-sm">Receipts CSV</a>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Collected this month" value={inr(d.collectedPaise)} tone="ok" sub={`${d.onlinePct}% online`} />
        <Stat label="Outstanding" value={inr(d.outstandingPaise)} />
        <Stat label="Overdue" value={inr(d.overduePaise)} tone="bad" />
        <Stat label="Defaulters" value={def.length} />
      </div>
      <FeeDesk defaulters={def} />
    </>
  );
}
