import { capi } from '@/lib/control-api';
import { PageHeader } from '@/components/ui';
import { AuditTable } from '@/components/control/simple-tables';

export const metadata = { title: 'Audit log' };
export default async function Audit() {
  const [rows, tenants] = await Promise.all([capi<any[]>('/audit'), capi<{ id: string; name: string }[]>('/tenants-overview')]);
  return (
    <>
      <PageHeader title="Platform audit log" description="Every control-plane action: who did it, to which institution, what changed and why. Tenant-internal changes live in each institution’s own audit log." />
      <AuditTable rows={rows} tenants={Object.fromEntries(tenants.map((t) => [t.id, t.name]))} />
    </>
  );
}
