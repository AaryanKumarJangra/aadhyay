'use client';
import { useState } from 'react';
import { Button, Input, Select } from '@/components/ui';
import { BASE_DOMAIN } from '@/lib/config';

const STATES = [['09', 'Uttar Pradesh'], ['07', 'Delhi'], ['06', 'Haryana'], ['05', 'Uttarakhand'], ['08', 'Rajasthan'], ['03', 'Punjab'], ['10', 'Bihar'], ['27', 'Maharashtra'], ['29', 'Karnataka']] as const;
export function SignupForm() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ slug: string; websiteUrl: string } | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr('');
    const f = new FormData(e.currentTarget);
    const st = STATES.find((s) => s[0] === f.get('stateCode'))!;
    const r = await fetch('/api/v1/public/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      institutionName: f.get('institutionName'), segment: f.get('segment'), city: f.get('city'), state: st[1], stateCode: st[0], ownerName: f.get('ownerName'), ownerPhone: f.get('ownerPhone'), ownerEmail: f.get('ownerEmail') || undefined, approxStudents: Number(f.get('approxStudents')) || undefined,
    }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j?.error?.message ?? 'Could not create account');
    setDone(j);
  }
  if (done) return (
    <div className="mt-8 rounded-xl border border-ok/30 bg-ok/5 p-6">
      <p className="text-lg font-semibold">You’re all set! 🎉</p>
      <p className="mt-2 text-sm">Your website is live at <a className="text-brand underline" href={done.websiteUrl}>{done.slug}.{BASE_DOMAIN}</a>.</p>
      <a href={`/app/login?tenant=${done.slug}`} className="mt-4 inline-block rounded-lg bg-brand px-5 py-2.5 text-white">Log in with your phone</a>
    </div>
  );
  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <Input name="institutionName" label="Institution name" required minLength={3} placeholder="e.g. Sunrise Public School" />
      <div className="grid gap-4 md:grid-cols-2">
        <Select name="segment" label="Type" options={[{ value: 'school', label: 'School (K-12)' }, { value: 'coaching', label: 'Coaching centre' }, { value: 'college', label: 'College' }, { value: 'institute', label: 'Private institute' }, { value: 'creator', label: 'Creator / YouTube educator' }]} />
        <Input name="approxStudents" type="number" label="Approx. students" min={1} />
        <Input name="city" label="City" required placeholder="Meerut" />
        <Select name="stateCode" label="State" options={STATES.map(([v, l]) => ({ value: v, label: l }))} />
      </div>
      <Input name="ownerName" label="Your name" required />
      <Input name="ownerPhone" label="Mobile number (for OTP login)" required inputMode="tel" placeholder="98765 43210" />
      <Input name="ownerEmail" type="email" label="Email (for invoices)" />
      {err && <p className="text-sm text-bad">{err}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Creating…' : 'Start 90-day free trial'}</Button>
      <p className="text-xs text-muted">By continuing you agree to the Terms and Data Processing Agreement. Your institution is the data owner; Aadhyay processes data on your instructions (DPDP Act 2023).</p>
    </form>
  );
}
