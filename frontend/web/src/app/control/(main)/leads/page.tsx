import { capi } from '@/lib/control-api';
import { PageHeader } from '@/components/ui';
import { LeadsTable } from '@/components/control/simple-tables';

export const metadata = { title: 'Leads' };
export default async function Leads() {
  const rows = await capi<any[]>('/leads');
  return <><PageHeader title="Leads" description="Demo and pricing requests from aadhyay.com." /><LeadsTable rows={rows} /></>;
}
