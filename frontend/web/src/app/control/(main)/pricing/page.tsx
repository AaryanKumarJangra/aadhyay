import { capi, getPlatformMe } from '@/lib/control-api';
import { Alert, PageHeader } from '@/components/ui';
import { PriceBook, type PriceRow } from '@/components/control/price-book';

export const metadata = { title: 'Plans & price book' };
export default async function Pricing() {
  const [book, me] = await Promise.all([capi<{ plans: any[]; items: any[] }>('/price-book'), getPlatformMe()]);
  const rows: PriceRow[] = [
    ...book.plans.map((p) => ({ code: p.code, name: p.name, kind: 'plan', unit: p.pricingUnit === 'student' ? 'per_student_month' : 'per_month', listPaise: p.pricePerUnitPaise, minPaise: p.rangeMinPaise, maxPaise: p.rangeMaxPaise, isActive: p.isActive, isPlan: true })),
    ...book.items.map((i) => ({ code: i.code, name: i.name, kind: i.kind, unit: i.unit, listPaise: i.listPaise, minPaise: i.minPaise, maxPaise: i.maxPaise, isActive: i.isActive })),
  ];
  return (
    <>
      <PageHeader title="Plans & price book" description="The one source of prices for the marketing site, onboarding quotes and invoices. All amounts ex-GST." />
      {me.role !== 'super_admin' && <Alert tone="info" className="mb-4">Only a super admin can change list prices and ranges. You can view them and quote within range from Tenant 360.</Alert>}
      <PriceBook rows={rows} canEdit={me.role === 'super_admin'} />
    </>
  );
}
