import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/server-api';
import { getMe, getOrg, type Org } from '@/lib/me';
import { visibleNav } from '@/lib/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { SuspendedScreen } from '@/components/console/suspended';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  let me;
  try {
    me = await getMe();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect('/app/login');
    throw e;
  }
  if (!me.tenantId) redirect(me.memberships.length ? '/app/login?pick=1' : '/app/messenger-only');
  let org: Org | null = null;
  let suspended: ApiError | null = null;
  try {
    org = await getOrg();
  } catch (e) {
    if (e instanceof ApiError && e.code === 'TENANT_SUSPENDED') suspended = e;
    else throw e;
  }
  const isOwner = me.grants.some((g) => g.pattern === '*');
  if (suspended || !org || ['suspended', 'archived'].includes(me.tenantStatus ?? '')) return <SuspendedScreen canPay={isOwner} message={suspended?.message} />;

  const b = org.branding ?? {};
  const daysLeft = org.trialEndsAt ? Math.max(0, Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 86_400_000)) : null;
  const banner = org.status === 'trial' && daysLeft !== null ? (
    <div className="border-b border-brand-line bg-brand-soft px-4 py-2 text-center text-[13px] text-ink-2">
      Free trial · <span className="font-medium text-ink">{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</span>
      {me.grants.some((g) => g.pattern === '*' || g.pattern.startsWith('org.billing')) && <> · <Link href="/app/billing" className="font-medium text-brand underline-offset-2 hover:underline">Choose a plan</Link></>}
    </div>
  ) : org.status === 'grace' ? (
    <div role="alert" className="border-b border-bad/20 bg-bad-soft px-4 py-2 text-center text-[13px] text-bad">
      Your subscription has ended. Service will pause soon. <Link href="/app/billing" className="font-semibold underline">Renew now</Link>
    </div>
  ) : undefined;

  return (
    <div style={{ ['--brand' as string]: b.primaryColor ?? '#2563eb', ['--accent' as string]: b.accentColor ?? '#4f46e5' }}>
      <AppShell
        nav={visibleNav({ grants: me.grants, modules: org.modules })}
        tenant={{ name: org.name, segment: org.segment, logoUrl: b.logoUrl ?? null }}
        user={{ name: me.user?.name ?? 'Member', roles: me.roles.map((r) => r.name) }}
        memberships={me.memberships.map((m) => ({ tenantId: m.tenantId, tenantName: m.tenantName }))}
        currentTenantId={me.tenantId}
        banner={banner}
      >
        {children}
      </AppShell>
    </div>
  );
}
