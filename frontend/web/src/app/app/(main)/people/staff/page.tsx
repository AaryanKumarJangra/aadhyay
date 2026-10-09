import { api } from '@/lib/server-api';
import { guard, canDo, getOrg, type Me } from '@/lib/me';
import { PageHeader, LinkTabs } from '@/components/ui';
import { MembersManager, type Member } from '@/components/access/members';
import { StaffRecords, type StaffRecord } from '@/components/access/staff-records';
import type { RoleRow } from '@/components/access/role-editor';

export const metadata = { title: 'Staff & users' };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { me, denied } = await guard('org.member.view', 'people.staff.view');
  if (denied) return denied;
  const [org, sp] = await Promise.all([getOrg(), searchParams]);
  const canMembers = canDo(me, 'org.member.view'), canRecords = canDo(me, 'people.staff.view');
  const tabs = [...(canMembers ? [{ key: 'logins', label: 'Logins & roles' }] : []), ...(canRecords ? [{ key: 'records', label: 'Staff records' }] : [])];
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? tabs[0]!.key;
  return (
    <>
      <PageHeader title="Staff & users" breadcrumb={[{ label: 'People' }, { label: 'Staff & users' }]} description="Who can sign in, what they can do, and where it applies." />
      {tabs.length > 1 && <LinkTabs tabs={tabs} active={tab} basePath="/app/people/staff" />}
      {tab === 'logins' ? <Logins me={me} modules={org.modules} /> : <StaffRecords rows={await api<StaffRecord[]>('/people/staff')} />}
    </>
  );
}

async function Logins({ me, modules }: { me: Me; modules: string[] }) {
  const [members, roles] = await Promise.all([api<Member[]>('/org/members'), canDo(me, 'org.role.view') ? api<RoleRow[]>('/org/roles') : Promise.resolve([] as RoleRow[])]);
  return <MembersManager members={members} roles={roles} modules={modules} canInvite={canDo(me, 'org.member.create')} canEdit={canDo(me, 'org.member.edit') && roles.length > 0} canRemove={canDo(me, 'org.member.delete')} />;
}
