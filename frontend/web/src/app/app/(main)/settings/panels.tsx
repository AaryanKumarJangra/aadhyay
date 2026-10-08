'use client';
import { useState } from 'react';
import { Button, Card, Input, Badge } from '@/components/ui';
import { call } from '@/lib/client';

export function SettingsPanels({ org, routing, roles, wa }: { org: any; routing: any[]; roles: any[]; wa: any }) {
  const [msg, setMsg] = useState<Record<string, string>>({});
  const note = (k: string, v: string) => setMsg((m) => ({ ...m, [k]: v }));
  const save = (k: string, path: string, method: string, body: any) => call(path, { method, body }).then(() => note(k, 'Saved ✓')).catch((e) => note(k, e.message));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Branding">
        <form onSubmit={(e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); void save('brand', '/org/branding', 'PATCH', Object.fromEntries(Object.entries(f).filter(([, v]) => v))); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><Input name="primaryColor" type="color" label="Primary" defaultValue={org.branding?.primaryColor ?? '#1e40af'} /><Input name="accentColor" type="color" label="Accent" defaultValue={org.branding?.accentColor ?? '#f59e0b'} /></div>
          <Input name="affiliation" label="Affiliation (e.g. CBSE Aff. No.)" defaultValue={org.branding?.affiliation} />
          <Input name="address" label="Address" defaultValue={org.branding?.address} />
          <div className="grid grid-cols-2 gap-3"><Input name="phone" label="Phone" defaultValue={org.branding?.phone} /><Input name="email" label="Email" defaultValue={org.branding?.email} /></div>
          <Button>Save branding</Button> <span className="text-sm">{msg.brand}</span>
        </form>
      </Card>
      <Card title="Message routing" action={<Badge tone="brand">App first</Badge>}>
        <p className="mb-3 text-sm text-muted">App push & Messenger are free. WhatsApp costs Meta’s rate + ₹0.04 from your wallet.</p>
        <div className="space-y-2 text-sm">{routing.map((r) => (
          <div key={r.eventKey} className="flex items-center justify-between gap-2"><span className="font-mono text-xs">{r.eventKey}</span>
            <select defaultValue={r.channels.whatsapp} onChange={(e) => save('route', '/comms/routing', 'PUT', { eventKey: r.eventKey, channels: { ...r.channels, whatsapp: e.target.value } })} className="h-8 rounded border border-line px-2 text-xs"><option value="never">WhatsApp: never</option><option value="fallback">WhatsApp: if no app</option><option value="always">WhatsApp: always</option></select></div>
        ))}</div>
        <p className="mt-2 text-sm">{msg.route}</p>
      </Card>
      <Card title="Online fee payments (your Razorpay account)">
        <form onSubmit={(e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); void save('pg', '/fees/gateway', 'PUT', f); }} className="space-y-3">
          <p className="text-sm text-muted">Fee money settles directly into your bank. Aadhyay never holds it.</p>
          <Input name="keyId" label="Key ID" placeholder="rzp_live_…" required /><Input name="keySecret" label="Key secret" type="password" required /><Input name="webhookSecret" label="Webhook secret" type="password" />
          <p className="text-xs text-muted">Webhook URL: https://api.aadhyay.com/v1/webhooks/razorpay/{org.slug}</p>
          <Button>Save</Button> <span className="text-sm">{msg.pg}</span>
        </form>
      </Card>
      <Card title="WhatsApp Channel (official Meta API)" action={wa ? <Badge tone="ok">{wa.displayPhone}</Badge> : <Badge>Not connected</Badge>}>
        <form onSubmit={(e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); void save('wa', '/whatsapp/accounts', 'POST', f); }} className="space-y-3">
          <p className="text-sm text-muted">Use Meta Embedded Signup, then paste your WABA details. Templates and Flows are built in Aadhyay.</p>
          <div className="grid grid-cols-2 gap-3"><Input name="wabaId" label="WABA ID" required /><Input name="phoneNumberId" label="Phone number ID" required /></div>
          <Input name="displayPhone" label="Display number" required /><Input name="accessToken" label="System user token" type="password" required />
          <Button>Connect</Button> <span className="text-sm">{msg.wa}</span>
        </form>
      </Card>
      <Card title="Roles" className="lg:col-span-2"><div className="flex flex-wrap gap-2">{roles.map((r: any) => <Badge key={r.id} tone={r.isSystem ? 'neutral' : 'brand'}>{r.name} · {r.permissions.length} perms</Badge>)}</div></Card>
    </div>
  );
}
