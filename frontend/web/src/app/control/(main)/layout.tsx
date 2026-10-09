import { getPlatformMe, platformCan } from '@/lib/control-api';
import { ControlShell, type ControlNavItem } from '@/components/shell/control-shell';

export const metadata = { robots: { index: false }, title: { default: 'Aadhyay Control', template: '%s · Aadhyay Control' } };

export default async function ControlLayout({ children }: { children: React.ReactNode }) {
  const me = await getPlatformMe();
  const nav: { group: string; items: ControlNavItem[] }[] = [
    { group: 'Overview', items: [{ href: '/control', label: 'Dashboard', icon: 'overview' }] },
    { group: 'Customers', items: [
      { href: '/control/tenants', label: 'Institutions', icon: 'tenants' },
      ...(platformCan(me, 'ops', 'account_manager') ? [{ href: '/control/onboarding', label: 'Onboard institution', icon: 'onboard' as const }] : []),
      { href: '/control/leads', label: 'Leads', icon: 'leads' },
    ] },
    { group: 'Commercial', items: [
      { href: '/control/pricing', label: 'Plans & price book', icon: 'pricing' },
      ...(platformCan(me, 'finance') ? [{ href: '/control/finance', label: 'Finance', icon: 'finance' as const }] : []),
    ] },
    { group: 'Governance', items: [{ href: '/control/audit', label: 'Audit log', icon: 'audit' }] },
  ];
  return <div style={{ ['--brand' as string]: '#2563eb' }}><ControlShell nav={nav} user={{ name: me.name, role: me.role }}>{children}</ControlShell></div>;
}
