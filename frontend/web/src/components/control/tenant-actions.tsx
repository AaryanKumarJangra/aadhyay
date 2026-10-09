'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Archive, CalendarPlus, Pause, Play, Wallet } from 'lucide-react';
import { ccall } from '@/lib/control-client';
import { Alert, Button, Input, Modal, Switch, Textarea, useToast } from '@/components/ui';

type Action = 'extend' | 'suspend' | 'activate' | 'archive' | 'wallet';
const META: Record<Action, { title: string; consequence: string; label: string; danger?: boolean }> = {
  extend: { title: 'Extend period', consequence: 'Adds days to the current trial or subscription period. Clears grace and suspension.', label: 'Extend' },
  suspend: { title: 'Suspend institution', consequence: 'Everyone in the institution loses access immediately (billing pages stay available to the owner). Data is kept.', label: 'Suspend', danger: true },
  activate: { title: 'Reactivate institution', consequence: 'Restores access for everyone. If the period has ended, it is extended by 15 days so they can pay.', label: 'Reactivate' },
  archive: { title: 'Archive institution', consequence: 'Archived institutions stay read-only for platform staff and are purged later by policy. Only a super admin can archive.', label: 'Archive', danger: true },
  wallet: { title: 'Adjust wallet', consequence: 'Credits (positive) or debits (negative) the institution’s prepaid usage wallet.', label: 'Apply adjustment' },
};

/** Tenant 360 quick actions. Every action needs a reason and is recorded in the platform audit log. */
export function TenantActions({ tenantId, status, can }: { tenantId: string; status: string; can: { lifecycle: boolean; finance: boolean; archive: boolean } }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('15');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const start = (a: Action) => { setOpen(a); setReason(''); setErr(''); setAmount(''); };
  const run = async () => {
    setBusy(true); setErr('');
    try {
      if (open === 'extend') await ccall(`/tenants/${tenantId}/extend`, { body: { days: Number(days), reason } });
      else if (open === 'wallet') await ccall(`/tenants/${tenantId}/wallet-adjust`, { body: { amountPaise: Math.round(Number(amount) * 100), reason } });
      else await ccall(`/tenants/${tenantId}/status`, { body: { action: open, reason } });
      toast({ tone: 'ok', title: `${META[open!].title} — done`, body: 'Recorded in the audit log.' });
      setOpen(null); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };
  const valid = reason.trim().length >= 5 && (open !== 'wallet' || (amount !== '' && Number(amount) !== 0)) && (open !== 'extend' || (Number(days) >= 1 && Number(days) <= 180));
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {can.lifecycle && ['trial', 'active', 'grace'].includes(status) && <Button variant="secondary" icon={<CalendarPlus />} onClick={() => start('extend')}>Extend</Button>}
        {can.finance && <Button variant="secondary" icon={<Wallet />} onClick={() => start('wallet')}>Wallet</Button>}
        {can.lifecycle && ['grace', 'suspended', 'archived'].includes(status) && <Button icon={<Play />} onClick={() => start('activate')}>Reactivate</Button>}
        {can.lifecycle && ['trial', 'active', 'grace'].includes(status) && <Button variant="danger" icon={<Pause />} onClick={() => start('suspend')}>Suspend</Button>}
        {can.archive && status === 'suspended' && <Button variant="ghost" icon={<Archive />} onClick={() => start('archive')}>Archive</Button>}
      </div>
      <Modal open={!!open} onClose={() => !busy && setOpen(null)} title={open ? META[open].title : ''} size="sm"
        footer={<><Button variant="secondary" onClick={() => setOpen(null)} disabled={busy}>Cancel</Button><Button variant={open && META[open].danger ? 'danger' : 'primary'} loading={busy} disabled={!valid} onClick={run}>{open ? META[open].label : ''}</Button></>}>
        {open && (
          <div className="space-y-4">
            <Alert tone={META[open].danger ? 'warn' : 'info'}>{META[open].consequence}</Alert>
            {open === 'extend' && <Input label="Days to add" type="number" min={1} max={180} value={days} onChange={(e) => setDays(e.target.value)} required />}
            {open === 'wallet' && <Input label="Amount (₹)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} hint="Use a negative amount to debit." required />}
            <Textarea label="Reason" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} hint="At least 5 characters. Stored in the platform audit log." />
            {err && <Alert tone="bad">{err}</Alert>}
          </div>
        )}
      </Modal>
    </>
  );
}

/** Module switches for one institution (core modules are always on). */
export function ModuleSwitches({ tenantId, modules, canEdit }: { tenantId: string; modules: { key: string; label: string; core: boolean; enabled: boolean; source: string | null }[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState(Object.fromEntries(modules.map((m) => [m.key, m.enabled])));
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (key: string, v: boolean) => {
    setBusy(key);
    try { await ccall(`/tenants/${tenantId}/modules`, { method: 'PATCH', body: { moduleKey: key, enabled: v } }); setState((s) => ({ ...s, [key]: v })); toast({ tone: 'ok', title: `${key} ${v ? 'enabled' : 'disabled'}` }); router.refresh(); }
    catch (e) { toast({ tone: 'bad', title: 'Could not change module', body: e instanceof Error ? e.message : '' }); } finally { setBusy(null); }
  };
  return (
    <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map((m) => (
        <li key={m.key} className="border-b border-line/60 py-2.5">
          <Switch checked={!!state[m.key]} disabled={m.core || !canEdit || busy === m.key} onChange={(v) => toggle(m.key, v)}
            label={m.label} description={m.core ? 'Core — always on' : m.source ? `Source: ${m.source}` : undefined} />
        </li>
      ))}
    </ul>
  );
}
