import { ExternalLink, Image as ImageIcon } from 'lucide-react';
import { api } from '@/lib/server-api';
import { guard, canDo, getOrg } from '@/lib/me';
import { LinkButton, PageHeader } from '@/components/ui';
import { PagesTable, type PageRow } from '@/components/cms/pages-table';

export const metadata = { title: 'Website' };
export default async function Website() {
  const { me, denied } = await guard('cms.page.view', 'cms.page.edit');
  if (denied) return denied;
  const [org, pages] = await Promise.all([getOrg(), api<{ items: PageRow[] }>('/cms/page-list?limit=200')]);
  const siteBase = `/site/${org.slug}`;
  return (
    <>
      <PageHeader title="Website" breadcrumb={[{ label: 'Engage' }, { label: 'Website' }]} description="Build pages visually. Edits are saved as drafts and go live only when published."
        actions={<><LinkButton variant="secondary" href="/app/website/media" icon={<ImageIcon />}>Media library</LinkButton><LinkButton variant="secondary" href={siteBase} target="_blank" icon={<ExternalLink />}>View site</LinkButton></>} />
      <PagesTable rows={pages.items} canCreate={canDo(me, 'cms.page.create')} siteBase={siteBase} />
    </>
  );
}
