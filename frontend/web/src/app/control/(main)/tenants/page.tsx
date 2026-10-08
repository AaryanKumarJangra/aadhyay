import Link from 'next/link';
import { capi } from '@/lib/control-api';
import { PageHeader, Table, Badge } from '@/components/ui';
import { date } from '@/lib/format';
export default async function Tenants({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const sp = await searchParams;
  const rows = await capi(`/tenants?${new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as any)}`);
  return (
    <>
      <PageHeader title="Institutions" />
      <Table rows={rows} cols={[
        { key: 'name', label: 'Name', render: (t: any) => <Link className="font-medium text-brand" href={`/control/tenants/${t.id}`}>{t.name}</Link> },
        { key: 'city', label: 'City' }, { key: 'segment', label: 'Type' }, { key: 'planCode', label: 'Plan' },
        { key: 'status', label: 'Status', render: (t: any) => <Badge tone={t.status === 'active' ? 'ok' : t.status === 'trial' ? 'brand' : 'warn'}>{t.status}</Badge> },
        { key: 'periodEndsAt', label: 'Period ends', render: (t: any) => date(t.periodEndsAt) },
      ]} />
    </>
  );
}
