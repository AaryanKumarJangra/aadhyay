import { api } from '@/lib/server-api';
import { Card, PageHeader, Table, Badge } from '@/components/ui';
import { dateTime } from '@/lib/format';
export default async function Transport() {
  const [live, routes] = await Promise.all([api('/transport/trips/live'), api('/transport/routes')]);
  return (
    <>
      <PageHeader title="Transport" sub="Drivers start trips from the Aadhyay app; parents get one private link per bus." />
      <Card title={`Live now (${live.length})`}><Table rows={live} empty="No buses running" cols={[{ key: 'regNo', label: 'Vehicle' }, { key: 'direction', label: 'Trip', render: (t: any) => <Badge tone="brand">{t.direction}</Badge> }, { key: 'startedAt', label: 'Started', render: (t: any) => dateTime(t.startedAt) }, { key: 'lastAt', label: 'Last GPS', render: (t: any) => dateTime(t.lastAt) }, { key: 'd', label: 'Distance', render: (t: any) => `${(t.distanceM / 1000).toFixed(1)} km` }]} /></Card>
      <Card title="Routes" className="mt-6"><Table rows={routes} cols={[{ key: 'name', label: 'Route' }, { key: 'stops', label: 'Stops', render: (r: any) => r.stops.map((s: any) => s.name).join(' → ') }]} /></Card>
    </>
  );
}
