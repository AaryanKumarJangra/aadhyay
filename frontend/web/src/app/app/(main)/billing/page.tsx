import { api } from '@/lib/server-api';
import { Card, PageHeader, Stat, Table, Badge } from '@/components/ui';
import { inr, date } from '@/lib/format';
import { Checkout } from './checkout';
export default async function Billing() {
  const [s, pricing] = await Promise.all([api('/billing/summary'), api('/public/pricing', { auth: false })]);
  return (
    <>
      <PageHeader title="Plan & billing" sub={`Status: ${s.status} · ${s.activeStudents} active students`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Plan" value={s.planCode} />
        <Stat label={s.status === 'trial' ? 'Trial ends' : 'Renews on'} value={date(s.status === 'trial' ? s.trialEndsAt : s.periodEndsAt)} />
        <Stat label="Usage wallet" value={inr(s.wallet.balancePaise)} sub="WhatsApp · SMS · AI" tone={s.wallet.balancePaise < s.wallet.lowAlertPaise ? 'warn' : undefined} />
        <Stat label="Invoices" value={s.invoices.length} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Checkout plans={pricing.plans} students={s.activeStudents} />
        <Card title="Usage (last 30 days)"><Table rows={s.wallet.last30Days} empty="No paid usage — app push & Messenger are free." cols={[{ key: 'meter', label: 'Meter' }, { key: 'qty', label: 'Qty', className: 'text-right' }, { key: 'pricePaise', label: 'Charged (ex-GST)', render: (u: any) => inr(u.pricePaise, { decimals: true }), className: 'text-right' }]} /></Card>
      </div>
      <Card title="Invoices" className="mt-6"><Table rows={s.invoices} cols={[{ key: 'number', label: 'Number' }, { key: 'issuedAt', label: 'Date', render: (i: any) => date(i.issuedAt) }, { key: 'subtotalPaise', label: 'Amount', render: (i: any) => inr(i.subtotalPaise), className: 'text-right' }, { key: 'gst', label: 'GST', render: (i: any) => inr(i.cgstPaise + i.sgstPaise + i.igstPaise), className: 'text-right' }, { key: 'totalPaise', label: 'Total', render: (i: any) => inr(i.totalPaise), className: 'text-right font-medium' }, { key: 'status', label: '', render: (i: any) => <Badge tone={i.status === 'paid' ? 'ok' : 'warn'}>{i.status}</Badge> }]} /></Card>
    </>
  );
}
