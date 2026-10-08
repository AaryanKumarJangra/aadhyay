'use client';
import { useState } from 'react';

/** Website enquiry → CRM lead (UTM captured for source attribution). */
export function EnquiryForm({ host, formKey }: { host: string; formKey: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('busy');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const utm = Object.fromEntries([...new URLSearchParams(window.location.search)].filter(([k]) => k.startsWith('utm_')));
    const r = await fetch('/api/v1/site/forms/submit', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tenant': host }, body: JSON.stringify({ formKey, data, utm }) });
    const j = await r.json();
    setState(r.ok ? 'ok' : 'err');
    setMsg(r.ok ? j.message : j?.error?.message ?? 'Please try again');
  }
  if (state === 'ok') return <p className="rounded-xl bg-ok/10 p-5 text-center font-medium">{msg}</p>;
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Admission enquiry</h2>
      <input name="name" required placeholder="Student's name" className="h-11 w-full rounded-lg border border-line px-3" />
      <input name="phone" required inputMode="tel" placeholder="Parent's mobile" className="h-11 w-full rounded-lg border border-line px-3" />
      <input name="forClass" placeholder="Class seeking admission" className="h-11 w-full rounded-lg border border-line px-3" />
      <textarea name="message" placeholder="Message (optional)" className="w-full rounded-lg border border-line p-3" rows={3} />
      {state === 'err' && <p className="text-sm text-bad">{msg}</p>}
      <button disabled={state === 'busy'} className="h-11 w-full rounded-lg bg-brand font-medium text-white">{state === 'busy' ? 'Sending…' : 'Submit enquiry'}</button>
    </form>
  );
}
