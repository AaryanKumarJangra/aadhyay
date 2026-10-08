'use client';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
export default function ControlLogin() {
  const [err, setErr] = useState('');
  const [totp, setTotp] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await fetch('/api/control/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))) });
    const j = await r.json();
    if (r.ok) location.href = '/control';
    else { setErr(j.error?.message); if (j.error?.details?.totpRequired) setTotp(true); }
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-ink p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-surface p-7">
        <p className="text-xl font-bold">Aadhyay Control</p>
        <Input name="email" type="email" label="Email" required /><Input name="password" type="password" label="Password" required />
        {totp && <Input name="totp" label="Authenticator code" inputMode="numeric" />}
        <Button className="w-full">Sign in</Button>{err && <p className="text-sm text-bad">{err}</p>}
      </form>
    </main>
  );
}
