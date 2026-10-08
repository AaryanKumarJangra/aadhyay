import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/server-api';
import { visibleNav } from '@/lib/nav';
import { Sidebar, MobileNav } from '@/components/console/sidebar';
import { SuspendedScreen } from '@/components/console/suspended';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  let me: any, org: any = null, suspended: ApiError | null = null;
  try {
    me = await api('/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect('/app/login');
    throw e;
  }
  if (!me.tenantId) redirect(me.memberships.length ? '/app/login?pick=1' : '/app/messenger-only');
  try {
    org = await api('/org/profile');
  } catch (e) {
    if (e instanceof ApiError && e.code === 'TENANT_SUSPENDED') suspended = e;
    else throw e;
  }
  if (suspended || ['suspended', 'archived'].includes(me.tenantStatus)) return <SuspendedScreen canPay={me.permissions.includes('*')} message={suspended?.message} />;
  const items = visibleNav(me, org.modules);
  const b = org.branding ?? {};
  return (
    <div className="flex min-h-dvh" style={{ ['--brand' as any]: b.primaryColor ?? '#1e40af', ['--accent' as any]: b.accentColor ?? '#f59e0b' }}>
      <Sidebar items={items} tenantName={org.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        {org.status === 'trial' && <div className="bg-accent/15 px-4 py-2 text-center text-sm">Free trial — {Math.max(0, Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 86400000))} days left. <a href="/app/billing" className="font-medium underline">Choose a plan</a></div>}
        {org.status === 'grace' && <div className="bg-bad px-4 py-2 text-center text-sm text-white">Subscription expired. Service pauses soon — <a href="/app/billing" className="font-semibold underline">renew now</a>.</div>}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 md:px-8">{children}</main>
      </div>
      <MobileNav items={items} />
    </div>
  );
}
