import { getMe, getOrg, canDo } from '@/lib/me';
import { visibleNav } from '@/lib/navigation';
import { InstitutionDashboard } from '@/components/dashboards/institution';
import { FinanceDashboard, TeacherDashboard, FamilyDashboard, LaunchpadDashboard } from '@/components/dashboards/role-dashboards';

/**
 * One dashboard route, composed from what the user can do (never from role names):
 * institution-wide view → finance desk → teaching view → family view → launchpad.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const [me, org, sp] = await Promise.all([getMe(), getOrg(), searchParams]);
  const range = sp.range === '7' ? 7 : sp.range === '90' ? 90 : 30;
  const name = me.user?.name ?? 'there';
  if (canDo(me, 'reports.dashboard.view')) return <InstitutionDashboard name={name} range={range} />;
  if (canDo(me, 'fees.dashboard.view')) return <FinanceDashboard name={name} range={range} />;
  if (canDo(me, 'attendance.student.view') || canDo(me, 'homework.assignment.view')) return <TeacherDashboard name={name} />;
  if (canDo(me, 'self.*')) return <FamilyDashboard name={name} isStudent={me.kinds.includes('student') && !me.kinds.includes('guardian')} />;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: org.timezone || 'Asia/Kolkata' }).format(new Date());
  return <LaunchpadDashboard name={name} roles={me.roles.map((r) => r.name)} nav={visibleNav({ grants: me.grants, modules: org.modules })} today={today} />;
}
