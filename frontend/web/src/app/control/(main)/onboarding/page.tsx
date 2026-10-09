import { capi, getPlatformMe, platformCan } from '@/lib/control-api';
import { AccessDenied, PageHeader } from '@/components/ui';
import { OnboardingWizard } from '@/components/control/onboarding-wizard';

export const metadata = { title: 'Onboard institution' };
export default async function Onboarding() {
  const me = await getPlatformMe();
  if (!platformCan(me, 'ops', 'account_manager')) return <AccessDenied reason="Onboarding is limited to operations and account managers." contact="platform super admin" back="/control" />;
  const book = await capi<{ plans: any[] }>('/price-book');
  return (
    <>
      <PageHeader title="Onboard an institution" breadcrumb={[{ label: 'Institutions', href: '/control/tenants' }, { label: 'Onboard' }]} description="Set up a ready-to-use institution: plan, modules, branches, branding, website, domain and admins." />
      <OnboardingWizard plans={book.plans.filter((p) => p.isActive !== false)} baseDomain={process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'aadhyay.com'} />
    </>
  );
}
