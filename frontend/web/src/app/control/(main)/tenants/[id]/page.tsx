import { capi } from '@/lib/control-api';
import { Card, PageHeader, Stat, Table, Badge } from '@/components/ui';
import { inr, date } from '@/lib/format';
export default async function Tenant({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await capi(`/tenants/${id}`);
  return (
    <>
      <PageHeader title={t.tenant.name} sub={`${t.tenant.slug} · ${t.tenant.city ?? ''} · ${t.tenant.status}`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Students" value={t.counts.students} /><Stat label="Staff" value={t.counts.staff} /><Stat label="Vehicles" value={t.counts.vehicles} />
        <Stat label="Storage" value={`${(Number(t.counts.storage_bytes) / 1e9).toFixed(2)} GB`} /><Stat label="Wallet" value={inr(t.wallet.balancePaise)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Modules"><div className="flex flex-wrap gap-1">{t.modules.map((m: any) => <Badge key={m.moduleKey} tone={m.enabled ? 'ok' : 'neutral'}>{m.moduleKey}</Badge>)}</div></Card>
        <Card title="Usage (30 days)"><Table rows={t.usage30d} cols={[{ key: 'meter', label: 'Meter' }, { key: 'qty', label: 'Qty' }, { key: 'pricePaise', label: 'Billed', render: (u: any) => inr(Number(u.pricePaise)) }]} /></Card>
      </div>
      <Card title="Invoices" className="mt-6"><Table rows={t.invoices} cols={[{ key: 'number', label: 'No.' }, { key: 'issuedAt', label: 'Date', render: (i: any) => date(i.issuedAt) }, { key: 'totalPaise', label: 'Total', render: (i: any) => inr(i.totalPaise) }, { key: 'status', label: 'Status' }]} /></Card>
    </>
  );
}
