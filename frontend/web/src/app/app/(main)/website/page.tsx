import { api } from '@/lib/server-api';
import { PageHeader } from '@/components/ui';
import { PageEditor } from './editor';
export default async function Website() {
  const [pages, domains, org] = await Promise.all([api('/cms/page-list?limit=200'), api('/cms/domains'), api('/org/profile')]);
  return <><PageHeader title="Website" sub={<>Live at {domains.map((d: any) => <a key={d.id} href={`https://${d.host}`} target="_blank" className="mr-2 text-brand underline">{d.host}</a>)}</>} /><PageEditor pages={pages.items} slug={org.slug} /></>;
}
