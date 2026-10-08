'use client';
import { useEffect, useState } from 'react';
import { Button, Input } from '@/components/ui';

/** OTP login (WhatsApp / SMS) or email + password, then institution picker when the person belongs to several. */
export function LoginFlow({ tenant, next, pick }: { tenant?: string; next?: string; pick?: boolean }) {
  const [step, setStep] = useState<'phone' | 'code' | 'password' | 'pick'>(pick ? 'pick' : 'phone');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [mems, setMems] = useState<any[]>([]);
  useEffect(() => { if (pick) fetch('/api/v1/me').then((r) => r.json()).then((m) => setMems(uniq(m.memberships ?? []))); }, [pick]);
  const uniq = (ms: any[]) => [...new Map(ms.map((m) => [m.tenantId, m])).values()];

  async function request() {
    setBusy(true); setErr('');
    const r = await fetch('/api/auth/otp-request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) return setErr(j?.error?.message ?? 'Could not send OTP');
    setChannel(j.channel); if (j.devCode) setCode(j.devCode); setStep('code');
  }
  const deviceId = () => localStorage.getItem('aad_device') ?? (() => { const d = `web-${crypto.randomUUID()}`; localStorage.setItem('aad_device', d); return d; })();
  async function done(j: any) {
    const ms = uniq(j.memberships ?? []);
    if (j.tenantId || ms.length === 0) location.href = ms.length ? next ?? '/app' : '/app/messenger';
    else { setMems(ms); setStep('pick'); }
  }
  async function passwordLogin() {
    setBusy(true); setErr('');
    const r = await fetch('/api/auth/password-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login, password, totp, deviceId: deviceId() }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { if (j?.error?.details?.totpRequired) setNeedTotp(true); return setErr(j?.error?.message ?? 'Could not log in'); }
    await done(j);
  }
  async function verify() {
    setBusy(true); setErr('');
    const r = await fetch('/api/auth/otp-verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, code, tenantSlug: tenant, deviceId: deviceId() }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) return setErr(j?.error?.message ?? 'Invalid code');
    await done(j);
  }
  async function choose(tenantId: string) {
    await fetch('/api/auth/switch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId }) });
    location.href = next ?? '/app';
  }
  return (
    <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-lg">
      <p className="text-2xl font-bold">आ Aadhyay</p>
      {step === 'phone' && (<form onSubmit={(e) => { e.preventDefault(); void request(); }} className="mt-6 space-y-4"><Input label="Mobile number" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} required /><Button className="w-full" disabled={busy}>{busy ? 'Sending…' : 'Get OTP'}</Button><button type="button" className="w-full text-sm text-muted hover:text-ink" onClick={() => { setErr(''); setStep('password'); }}>Use email &amp; password instead</button></form>)}
      {step === 'password' && (<form onSubmit={(e) => { e.preventDefault(); void passwordLogin(); }} className="mt-6 space-y-4"><Input label="Email or mobile number" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required /><Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />{needTotp && <Input label="Two-factor code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} required />}<Button className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</Button><button type="button" className="w-full text-sm text-muted hover:text-ink" onClick={() => { setErr(''); setStep('phone'); }}>Use mobile OTP instead</button></form>)}
      {step === 'code' && (<form onSubmit={(e) => { e.preventDefault(); void verify(); }} className="mt-6 space-y-4"><p className="text-sm text-muted">Enter the 6-digit code sent on {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to {phone}.</p><Input label="OTP" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required /><Button className="w-full" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Log in'}</Button><button type="button" className="w-full text-sm text-muted" onClick={() => setStep('phone')}>Change number</button></form>)}
      {step === 'pick' && (<div className="mt-6 space-y-2"><p className="text-sm text-muted">Choose an institution</p>{mems.map((m) => <button key={m.tenantId} onClick={() => choose(m.tenantId)} className="flex w-full items-center justify-between rounded-lg border border-line px-4 py-3 text-left hover:border-brand"><span className="font-medium">{m.tenantName}</span><span className="text-xs capitalize text-muted">{m.kind}</span></button>)}</div>)}
      {err && <p className="mt-3 text-sm text-bad">{err}</p>}
    </div>
  );
}
