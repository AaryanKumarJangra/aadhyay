import { guard, canDo } from '@/lib/me';
import { Card, PageHeader } from '@/components/ui';
import { MediaLibrary } from '@/components/cms/media-library';

export const metadata = { title: 'Media library' };
export default async function MediaPage() {
  const { me, denied } = await guard('cms.page.view');
  if (denied) return denied;
  return (
    <>
      <PageHeader title="Media library" breadcrumb={[{ label: 'Website', href: '/app/website' }, { label: 'Media' }]} description="Images, videos and documents used on your website. Files in use can’t be deleted." />
      <Card><MediaLibrary canDelete={canDo(me, 'cms.page.delete')} /></Card>
    </>
  );
}
