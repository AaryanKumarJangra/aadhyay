'use client';
import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { call } from '@/lib/client';
import { Select } from '@/components/ui';

/** Asks the API's own engine — the same decision every endpoint makes. */
export function WhyCantI({ options }: { options: { value: string; label: string }[] }) {
  const [key, setKey] = useState('');
  const [d, setD] = useState<{ allowed: boolean; reason: string; contact: string } | null>(null);
  const [err, setErr] = useState('');
  const check = async (k: string) => {
    setKey(k); setD(null); setErr('');
    if (!k) return;
    try { setD(await call('/access/explain', { body: { permission: k } })); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not check'); }
  };
  return (
    <div className="space-y-3">
      <Select label="Action" value={key} onChange={(e) => check(e.target.value)} options={options} placeholder="Choose an action…" />
      {err && <p role="alert" className="text-sm text-bad">{err}</p>}
      {d && (
        <div role="status" className={`rounded-lg border p-3 text-sm ${d.allowed ? 'border-ok/25 bg-ok-soft' : 'border-bad/20 bg-bad-soft'}`}>
          <p className="flex items-center gap-2 font-medium text-ink">{d.allowed ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-bad" />}{d.allowed ? 'Yes, you can' : 'No, you can’t'}</p>
          <p className="mt-1 text-ink-2">{d.reason}</p>
          {!d.allowed && <p className="mt-2 text-xs text-muted">To get access, contact your {d.contact}.</p>}
        </div>
      )}
    </div>
  );
}
