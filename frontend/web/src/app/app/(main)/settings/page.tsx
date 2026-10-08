import { api } from '@/lib/server-api';
import { PageHeader } from '@/components/ui';
import { SettingsPanels } from './panels';
export default async function Settings() {
  const [org, routing, roles, wa] = await Promise.all([api('/org/profile'), api('/comms/routing').catch(() => []), api('/org/roles'), api('/whatsapp/account').catch(() => null)]);
  return <><PageHeader title="Settings" /><SettingsPanels org={org} routing={routing} roles={roles} wa={wa} /></>;
}
