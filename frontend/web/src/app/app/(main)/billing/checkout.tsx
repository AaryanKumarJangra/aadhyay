'use client';
import { useEffect, useState } from 'react';
import { Button, Card, Select } from '@/components/ui';
import { call } from '@/lib/client';
import { inr } from '@/lib/format';

declare global { interface Window { Razorpay?: any } }
export function Checkout({ plans, students }: { plans: any[]; students: number }) {
  const [planCode, setPlan] = useState('professional');
  const [cycle, setCycle] = useState('yearly');
  const [q, setQ] = useState<any>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { call('/billing/quote', { body: { planCode, cycle } }).then(setQ).catch((e) => setMsg(e.message)); }, [planCode, cycle]);
  async function pay() {
    const r = await call('/billing/checkout', { body: { planCode, cycle } });
    const done = async (resp: any) => { await call('/billing/payments/confirm', { body: { orderId: r.payment.orderId, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature } }); location.reload(); };
    if (r.payment.keyId === 'rzp_log') return done({ razorpay_payment_id: 'pay_dev', razorpay_signature: 'log' });
    if (!window.Razorpay) await new Promise<void>((res) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = () => res(); document.body.appendChild(s); });
    new window.Razorpay({ key: r.payment.keyId, order_id: r.payment.orderId, amount: r.payment.amountPaise, currency: 'INR', name: 'Aadhyay', description: r.payment.invoiceNumber, handler: done }).open();
  }
  return (
    <Card title="Choose a plan">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Plan" value={planCode} onChange={(e) => setPlan(e.target.value)} options={plans.map((p) => ({ value: p.code, label: p.name }))} />
        <Select label="Billing" value={cycle} onChange={(e) => setCycle(e.target.value)} options={[{ value: 'yearly', label: 'Yearly (2 months free)' }, { value: 'quarterly', label: 'Quarterly' }]} />
      </div>
      {q && <dl className="mt-4 space-y-1 text-sm">{q.lines.map((l: any) => <div key={l.code} className="flex justify-between gap-2"><dt className="text-muted">{l.description}</dt><dd>{inr(l.amountPaise)}</dd></div>)}<div className="flex justify-between border-t border-line pt-1"><dt>GST</dt><dd>{inr(q.taxPaise)}</dd></div><div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd>{inr(q.totalPaise)}</dd></div></dl>}
      <p className="mt-2 text-xs text-muted">Based on {students} active students.</p>
      <Button className="mt-4 w-full" onClick={pay}>Pay {q ? inr(q.totalPaise) : ''}</Button>
      {msg && <p className="mt-2 text-sm text-bad">{msg}</p>}
    </Card>
  );
}
