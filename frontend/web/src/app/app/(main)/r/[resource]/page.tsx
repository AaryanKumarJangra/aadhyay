import { notFound } from 'next/navigation';
import { RESOURCES } from '@/lib/resources';
import { api } from '@/lib/server-api';
import { PageHeader } from '@/components/ui';
import { ResourceView } from './view';
export default async function ResourcePage({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const r = RESOURCES[resource];
  if (!r) notFound();
  // Ask the API once on the server: a role without access gets the 403 page instead of an empty table and a form.
  await api(`${r.api}?limit=1`);
  return <><PageHeader title={r.title} /><ResourceView rkey={resource} /></>;
}
