import { CircleCheck, Globe, GraduationCap, HardDrive, ShieldCheck, Users, Wallet } from 'lucide-react';
import { CATALOGUE } from '@aadhyay/contracts';
import { capi, getPlatformMe, platformCan } from '@/lib/control-api';
import { Badge, Card, DescriptionList, EmptyState, LinkTabs, PageHeader, StatCard, StatusBadge, humanize, statusTone } from '@/components/ui';
import { TenantActions, ModuleSwitches } from '@/components/control/tenant-actions';
import { inrFull, inrShort } from '@/components/dashboards/common';

const d = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—');
const LIFECYCLE = ['trial', 'active', 'grace', 'suspended', 'archived', 'purged'] as const;
const label = (k: string) => (CATALOGUE as Record<string, { label: string }>)[k]?.label ?? humanize(k);

export default async function Tenant360({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, getPlatformMe()]);
  const [x, modules, audit] = await Promise.all([capi<any>(`/tenants/${id}`), capi<any[]>(`/tenants/${id}/modules`), capi<any[]>(`/audit?tenantId=${id}`)]);
  const t = x.tenant, c = x.counts;
  const tabs = [{ key: 'overview', label: 'Overview' }, { key: 'modules', label: 'Modules', count: modules.filter((m) => m.enabled).length }, { key: 'billing', label: 'Billing & usage' }, { key: 'domains', label: 'Domains & website' }, { key: 'audit', label: 'Audit', count: audit.length }];
  const tab = tabs.find((k) => k.key === sp.tab)?.key ?? 'overview';
  const b = t.branding ?? {};
  const daysLeft = t.periodEndsAt ? Math.ceil((new Date(t.periodEndsAt).getTime() - Date.now()) / 86_400_000) : null;
  const stage = LIFECYCLE.indexOf(t.status);
  return (
    <>
      <PageHeader breadcrumb={[{ label: 'Institutions', href: '/control/tenants' }, { label: t.name }]}
        title={<span className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg text-base font-semibold text-white" style={{ background: b.primaryColor ?? '#2563eb' }}>{t.name[0]}</span>{t.name}</span>}
        description={`${t.slug} · ${humanize(t.segment)} · ${[t.city, t.state].filter(Boolean).join(', ') || 'Location not set'}`}
        meta={<><StatusBadge tone={statusTone(t.status)}>{humanize(t.status)}</StatusBadge><Badge tone="indigo">{humanize(t.planCode)}</Badge>{daysLeft !== null && t.status !== 'suspended' && <Badge tone={daysLeft < 8 ? 'warn' : 'neutral'}>{daysLeft >= 0 ? `${daysLeft} days left in period` : `Period ended ${-daysLeft} days ago`}</Badge>}</>}
        actions={<TenantActions tenantId={id} status={t.status} can={{ lifecycle: platformCan(me, 'ops', 'account_manager'), finance: platformCan(me, 'finance'), archive: me.role === 'super_admin' }} />} />

      <section aria-label="Lifecycle" className="mb-6 rounded-xl border border-line bg-surface p-4 shadow-sm">
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {LIFECYCLE.map((s, i) => (
            <li key={s} className={`rounded-lg px-3 py-2 text-center text-xs font-medium ${i === stage ? 'bg-brand text-white' : i < stage ? 'bg-brand-soft text-brand' : 'bg-sunken text-muted'}`} aria-current={i === stage ? 'step' : undefined}>{humanize(s)}</li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">Reminders go out at T-15, T-7, T-3, T-1 and on expiry; then 30 days of grace, suspension, archive after 90 days and purge only by policy. Created {d(t.createdAt)}{t.trialEndsAt ? ` · trial ends ${d(t.trialEndsAt)}` : ''}{t.graceEndsAt ? ` · grace ends ${d(t.graceEndsAt)}` : ''}.</p>
      </section>

      <LinkTabs tabs={tabs} active={tab} basePath={`/control/tenants/${id}`} />

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard label="Active students" icon={GraduationCap} value={Number(c.students).toLocaleString('en-IN')} footer="Billing unit for per-student plans" />
            <StatCard label="Staff" icon={Users} value={c.staff} footer={`${c.branches} ${c.branches === 1 ? 'branch' : 'branches'} · ${c.vehicles} vehicles`} />
            <StatCard label="Storage" icon={HardDrive} value={`${(Number(c.storage_bytes) / 1e9).toFixed(2)} GB`} footer="Files, media and documents" />
            <StatCard label="Wallet" icon={Wallet} value={inrShort(x.wallet?.balancePaise ?? 0)} footer="Prepaid usage credit" tone={(x.wallet?.balancePaise ?? 0) < 10000 ? 'warn' : 'default'} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Institution">
              <DescriptionList items={[
                { label: 'Legal name', value: b.legalName }, { label: 'Short name', value: b.shortName }, { label: 'Type', value: humanize(t.segment) }, { label: 'Timezone', value: t.timezone },
                { label: 'GSTIN', value: t.gstin }, { label: 'Billing contact', value: [t.billingEmail, t.billingPhone].filter(Boolean).join(' · ') || null },
              ]} />
            </Card>
            <Card title="Branding">
              <div className="flex items-center gap-3">
                {[b.primaryColor, b.accentColor].filter(Boolean).map((col: string) => <span key={col} className="flex items-center gap-2 text-[13px]"><span className="size-6 rounded-md ring-1 ring-line" style={{ background: col }} />{col}</span>)}
              </div>
              <DescriptionList columns={1} items={[{ label: 'Tagline', value: b.tagline }, { label: 'Website template', value: b.websiteTemplate ? humanize(b.websiteTemplate) : 'Default' }]} />
            </Card>
          </div>
          <Card title="Privacy boundary" action={<ShieldCheck className="size-4 text-ok" />}>
            <p className="text-sm text-muted">The control plane shows counts, configuration, billing and usage only. Student, parent and staff records are never displayed here. Contact details are masked unless you are in finance or a super admin.</p>
          </Card>
        </div>
      )}

      {tab === 'modules' && (
        <Card title="Modules" description="What this institution can use. Turning a module off denies every related screen and API immediately.">
          <ModuleSwitches tenantId={id} canEdit={platformCan(me, 'ops', 'account_manager')} modules={modules.map((m) => ({ ...m, label: label(m.key) }))} />
        </Card>
      )}

      {tab === 'billing' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Subscriptions" flush>
            {x.subscriptions.length ? <ul className="divide-y divide-line">{x.subscriptions.map((s: any) => (
              <li key={s.id} className="flex items-center justify-between px-5 py-3 text-[13px]"><span><span className="block font-medium text-ink">{humanize(s.planCode)} · {s.cycle}</span><span className="text-xs text-muted">{s.quantity} × {inrFull(s.unitPricePaise)} · from {d(s.startsAt)}</span></span><StatusBadge tone={statusTone(s.status)}>{humanize(s.status)}</StatusBadge></li>
            ))}</ul> : <div className="p-5"><EmptyState compact title="No subscription yet" description="The institution is on its trial." /></div>}
          </Card>
          <Card title="Invoices" flush>
            {x.invoices.length ? <ul className="divide-y divide-line">{x.invoices.map((i: any) => (
              <li key={i.id} className="flex items-center justify-between px-5 py-3 text-[13px]"><span><span className="block font-medium text-ink">{i.number}</span><span className="text-xs text-muted">{d(i.issuedAt)} · due {d(i.dueAt)}</span></span><span className="text-right"><span className="block font-semibold tabular">{inrFull(i.totalPaise)}</span><StatusBadge tone={statusTone(i.status)}>{humanize(i.status)}</StatusBadge></span></li>
            ))}</ul> : <div className="p-5"><EmptyState compact title="No invoices yet" /></div>}
          </Card>
          <Card className="lg:col-span-2" title="Usage (last 30 days)" flush>
            {x.usage30d.length ? <ul className="divide-y divide-line">{x.usage30d.map((u: any) => (
              <li key={u.meter} className="flex items-center justify-between px-5 py-3 text-[13px]"><span className="font-medium capitalize text-ink">{u.meter}</span><span className="tabular">{Number(u.qty).toLocaleString('en-IN')} · {inrFull(Number(u.pricePaise))}</span></li>
            ))}</ul> : <div className="p-5"><EmptyState compact title="No metered usage in the last 30 days" /></div>}
          </Card>
        </div>
      )}

      {tab === 'domains' && (
        <Card title="Domains" description="The free subdomain is always live; custom domains need DNS verification by the institution." flush>
          <ul className="divide-y divide-line">{x.domains.map((dm: any) => (
            <li key={dm.id} className="flex flex-col gap-1 px-5 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2"><Globe className="size-4 text-muted" /><span className="font-medium text-ink">{dm.host}</span>{dm.isPrimary && <Badge tone="brand">Primary</Badge>}<Badge>{dm.kind === 'custom' ? 'Custom' : 'Subdomain'}</Badge></span>
              {dm.verifiedAt ? <StatusBadge tone="ok">Verified {d(dm.verifiedAt)}</StatusBadge> : <span className="text-xs text-muted">Waiting for TXT <code className="rounded bg-sunken px-1">_aadhyay.{dm.host}</code> = <code className="rounded bg-sunken px-1">{dm.verifyToken}</code></span>}
            </li>
          ))}</ul>
        </Card>
      )}

      {tab === 'audit' && (
        <Card title="Platform actions on this institution" flush>
          {audit.length ? <ul className="divide-y divide-line">{audit.map((a) => (
            <li key={a.id} className="px-5 py-3 text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-ink">{humanize(a.action.replace('.', ' '))}</span><span className="text-xs text-muted">{new Date(a.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · {humanize(a.actorRole ?? 'system')}</span></div>
              {a.reason && <p className="mt-0.5 text-ink-2">“{a.reason}”</p>}
              {(a.before || a.after) && <p className="mt-1 font-mono text-[11px] text-muted">{a.before ? JSON.stringify(a.before) : '∅'} → {a.after ? JSON.stringify(a.after).slice(0, 220) : '∅'}</p>}
            </li>
          ))}</ul> : <div className="p-5"><EmptyState compact icon={CircleCheck} title="No platform actions recorded yet" /></div>}
        </Card>
      )}
    </>
  );
}
