import { Rocket } from 'lucide-react';
import { capi, getPlatformMe, platformCan } from '@/lib/control-api';
import { LinkButton, PageHeader } from '@/components/ui';
import { TenantsTable, type TenantRow } from '@/components/control/tenants-table';

export const metadata = { title: 'Institutions' };
export default async function Tenants() {
  const [rows, me] = await Promise.all([capi<TenantRow[]>('/tenants-overview'), getPlatformMe()]);
  return (
    <>
      <PageHeader title="Institutions" description={`${rows.length} institutions · ${rows.filter((r) => r.status === 'active').length} paying · ${rows.filter((r) => r.status === 'trial').length} in trial`}
        actions={platformCan(me, 'ops', 'account_manager') ? <LinkButton href="/control/onboarding" icon={<Rocket />}>Onboard institution</LinkButton> : undefined} />
      <TenantsTable rows={rows} />
    </>
  );
}
