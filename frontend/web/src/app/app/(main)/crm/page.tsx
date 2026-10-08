import { api } from '@/lib/server-api';
import { PageHeader } from '@/components/ui';
import { Board } from './board';
export default async function Crm() {
  const [stages, leads, sources] = await Promise.all([api('/crm/stages'), api('/crm/leads'), api('/crm/reports/sources')]);
  return <><PageHeader title="Admissions CRM" sub={sources.map((s: any) => `${s.source}: ${s.leads} leads, ${s.admitted} admitted`).join(' · ') || 'Website, WhatsApp and walk-in enquiries land here automatically.'} /><Board stages={stages} leads={leads} /></>;
}
