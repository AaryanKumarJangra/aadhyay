import type { Metadata } from 'next';
import { PricingCalculator } from './calculator';
import { API_URL } from '@/lib/config';

export const metadata: Metadata = { title: 'Pricing in INR (with GST)', description: 'Transparent school ERP pricing from ₹6 per student per month. Essential, Professional and Enterprise plans, coaching plans, add-ons. All prices shown with 18% GST.', alternates: { canonical: '/pricing' } };
export const revalidate = 3600;

async function getPricing() {
  try {
    const r = await fetch(`${API_URL}/v1/public/pricing`, { next: { revalidate: 3600 } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export default async function Pricing() {
  const data = await getPricing();
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-4xl font-bold tracking-tight">Simple pricing. Fair for small schools.</h1>
      <p className="mt-3 max-w-2xl text-muted">Pay per active student, with a low monthly minimum. Yearly billing = pay 10 months, get 12. Every price shows GST separately — no surprises.</p>
      <PricingCalculator initial={data} />
    </div>
  );
}
