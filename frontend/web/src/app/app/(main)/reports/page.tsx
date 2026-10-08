import { api } from '@/lib/server-api';
import { Card, PageHeader, Table } from '@/components/ui';
import { inr } from '@/lib/format';
export default async function Reports() {
  const [att, fees] = await Promise.all([api('/reports/attendance-by-class'), api('/reports/fees-by-class')]);
  const ds = ['students', 'guardians', 'staff', 'receipts', 'defaulters', 'leads'];
  return (
    <>
      <PageHeader title="Reports" actions={<div className="flex flex-wrap gap-2">{ds.map((d) => <a key={d} href={`/api/v1/reports/export?dataset=${d}`} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm capitalize">{d} CSV</a>)}</div>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Attendance this month"><Table rows={att} cols={[{ key: 'c', label: 'Class', render: (r: any) => `${r.class_name}-${r.section_name}` }, { key: 'pct', label: 'Present %', render: (r: any) => (r.pct !== null ? `${r.pct}%` : '—'), className: 'text-right' }]} /></Card>
        <Card title="Fee collection by class"><Table rows={fees} cols={[{ key: 'className', label: 'Class' }, { key: 'billedPaise', label: 'Billed', render: (r: any) => inr(r.billedPaise), className: 'text-right' }, { key: 'paidPaise', label: 'Collected', render: (r: any) => inr(r.paidPaise), className: 'text-right' }, { key: 'collectionPct', label: '%', render: (r: any) => (r.collectionPct ?? '—') + '%', className: 'text-right' }]} /></Card>
      </div>
    </>
  );
}
