import { api } from '@/lib/server-api';
import { guard, canDo, getOrg } from '@/lib/me';
import { PageBuilder, type EditorPage } from '@/components/cms/builder';

export const metadata = { title: 'Page builder' };
export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { me, denied } = await guard('cms.page.edit');
  if (denied) return denied;
  const { id } = await params;
  const [page, org, forms] = await Promise.all([api<EditorPage>(`/cms/pages/${id}/editor`), getOrg(), api<{ items: { key: string; name: string }[] }>('/cms/forms?limit=50', { onForbidden: 'throw' }).catch(() => ({ items: [] }))]);
  return (
    <PageBuilder page={page} site={{ tenant: { name: org.name, city: org.city }, branding: org.branding ?? {} }} siteUrl={`/site/${org.slug}${page.slug ? `/${page.slug}` : ''}`}
      canPublish={canDo(me, 'cms.page.publish')} forms={forms.items.map((f) => ({ key: f.key, name: f.name }))} />
  );
}
