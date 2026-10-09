import { api } from '@/lib/server-api';
import { guard, canDo } from '@/lib/me';
import { PageHeader } from '@/components/ui';
import { RolesManager, type Catalogue, type RoleRow } from '@/components/access/role-editor';

export const metadata = { title: 'Roles & permissions' };

export default async function RolesPage() {
  const { me, denied } = await guard('org.role.view');
  if (denied) return denied;
  const [roles, catalogue] = await Promise.all([api<RoleRow[]>('/org/roles'), api<Catalogue>('/access/catalogue')]);
  return (
    <>
      <PageHeader title="Roles & permissions" breadcrumb={[{ label: 'Administration' }, { label: 'Roles & permissions' }]}
        description="A role is a set of permissions, each limited to a scope (whole institution, assigned classes, own records) with optional limits. Assign roles to people in Staff & users." />
      <RolesManager roles={roles} catalogue={catalogue} canCreate={canDo(me, 'org.role.create')} canDelete={canDo(me, 'org.role.delete')} />
    </>
  );
}
