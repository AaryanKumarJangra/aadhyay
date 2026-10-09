import Link from 'next/link';
import { Activity, AlertTriangle, Building2, CheckCircle2, IndianRupee, Rocket, TrendingUp, Wallet, XCircle } from 'lucide-react';
import { capi, getPlatformMe, platformCan } from '@/lib/control-api';
import { Card, EmptyState, LinkButton, PageHeader, StatCard, StatusBadge, humanize, pctChange, statusTone } from '@/components/ui';
import { ChartCard } from '@/components/charts/chart-card';
import { BarChart, BarList, Donut } from '@/components/charts/charts';
import { inrFull, inrShort, monthLabel } from '@/components/dashboards/common';
import { CATALOGUE } from '@aadhyay/contracts';

const modName = (k: string) => (CATALOGUE as Record<string, { label: string }>)[k]?.label ?? humanize(k);

export const metadata = { title: 'Dashboard' };
const d = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const days = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
const METER: Record<string, string> = { whatsapp: 'WhatsApp', sms: 'SMS', ai: 'AI', storage: 'Storage', gps: 'GPS', email: 'Email', video: 'Video' };

export default async function ControlDashboard() {
  const [x, me] = await Promise.all([capi<any>('/dashboard'), getPlatformMe()]);
  const k = x.kpis;
  const hasRevenue = x.monthly.some((m: any) => m.revenuePaise > 0);
  return (
    <>
      <PageHeader title="Platform overview" description="Institutions, revenue, usage and health across Aadhyay. Aggregates only — no institution personal data."
        actions={platformCan(me, 'ops', 'account_manager') ? <LinkButton href="/control/onboarding" icon={<Rocket />}>Onboard institution</LinkButton> : undefined} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Institutions" icon={Building2} value={k.total} footer={`${k.active} paying · ${k.trial} in trial · ${k.grace + k.suspended} at risk`} href="/control/tenants" />
        <StatCard label="MRR" icon={IndianRupee} value={inrShort(k.mrrPaise)} footer={`ARR ${inrShort(k.arrPaise)}${k.arpuPaise ? ` · ARPU ${inrShort(k.arpuPaise)}` : ''}`} />
        <StatCard label="New this month" icon={TrendingUp} value={k.newThisMonth} delta={{ value: pctChange(k.newThisMonth, k.newPrevMonth), period: 'vs last month' }} trend={x.monthly.map((m: any) => m.newTenants)} />
        <StatCard label="Trial conversion" icon={CheckCircle2} value={k.trialConversionPct === null ? '—' : `${k.trialConversionPct}%`} footer={k.trialConversionPct === null ? 'No institutions older than 90 days yet' : 'Institutions older than 90 days now paying'} />
        <StatCard label="Outstanding invoices" icon={AlertTriangle} value={inrShort(k.outstandingPaise)} footer={`${k.overdueInvoices} past due`} tone={k.overdueInvoices ? 'warn' : 'default'} />
        <StatCard label="Wallet balances" icon={Wallet} value={inrShort(k.walletPaise)} footer="Prepaid usage credit held for institutions" />
        <StatCard label="Churned (90 days)" icon={XCircle} value={k.churned90} footer="Suspended in the last 90 days" tone={k.churned90 ? 'warn' : 'default'} />
        <StatCard label="System health" icon={Activity} value={x.health.redis && !x.health.outboxFailed ? 'Healthy' : 'Degraded'}
          footer={`DB ${x.health.database ? 'ok' : 'down'} · Redis ${x.health.redis ? 'ok' : 'down'} · ${x.health.outboxPending} queued · ${x.health.outboxFailed} failed jobs`} tone={x.health.redis && !x.health.outboxFailed ? 'default' : 'bad'} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        <ChartCard className="lg:col-span-6" title="New institutions" description="Sign-ups per month" table={{ columns: ['Month', 'New institutions'], rows: x.monthly.map((m: any) => [m.month, m.newTenants]) }}>
          <BarChart categories={x.monthly.map((m: any) => monthLabel(m.month))} series={[{ key: 'n', label: 'New institutions', values: x.monthly.map((m: any) => m.newTenants) }]} format="number" />
        </ChartCard>
        <ChartCard className="lg:col-span-6" title="Revenue" description="Paid invoices per month (ex-GST)" empty={hasRevenue ? null : { title: 'No paid invoices yet', description: 'Revenue appears when institutions pay their first invoice.' }}
          table={{ columns: ['Month', 'Revenue (₹)'], rows: x.monthly.map((m: any) => [m.month, Math.round(m.revenuePaise / 100)]) }}>
          <BarChart categories={x.monthly.map((m: any) => monthLabel(m.month))} series={[{ key: 'r', label: 'Revenue', values: x.monthly.map((m: any) => m.revenuePaise), color: 'var(--color-series-3)' }]} format="inr" />
        </ChartCard>
        <ChartCard className="lg:col-span-4" title="Plan mix" table={{ columns: ['Plan', 'Institutions'], rows: x.byPlan.map((p: any) => [p.key, p.count]) }}>
          <Donut segments={x.byPlan.slice(0, 5).map((p: any) => ({ label: humanize(p.key), value: p.count }))} format="number" centerLabel="Institutions" />
        </ChartCard>
        <ChartCard className="lg:col-span-4" title="Institution types" table={{ columns: ['Type', 'Institutions'], rows: x.bySegment.map((p: any) => [p.key, p.count]) }}>
          <Donut segments={x.bySegment.slice(0, 5).map((p: any) => ({ label: humanize(p.key), value: p.count }))} format="number" centerLabel="Institutions" />
        </ChartCard>
        <ChartCard className="lg:col-span-4" title="By state" table={{ columns: ['State', 'Institutions'], rows: x.byState.map((p: any) => [p.key, p.count]) }}>
          <BarList rows={x.byState.slice(0, 6).map((p: any) => ({ label: p.key, value: p.count }))} format="number" />
        </ChartCard>
        <ChartCard className="lg:col-span-6" title="Module adoption" description="Institutions with each module switched on" table={{ columns: ['Module', 'Institutions'], rows: x.moduleAdoption.map((m: any) => [m.key, m.count]) }}>
          <div className="max-h-72 overflow-y-auto pr-1 scrollbar-thin"><BarList rows={x.moduleAdoption.map((m: any) => ({ label: modName(m.key), value: m.count, hint: `of ${k.total}` }))} max={k.total || 1} format="number" color="var(--color-series-7)" /></div>
        </ChartCard>
        <ChartCard className="lg:col-span-6" title="Usage (30 days)" description="Billed to institutions vs our cost" empty={x.usage30d.length ? null : { title: 'No metered usage in the last 30 days', description: 'WhatsApp, SMS, AI, storage and GPS usage appear here.' }}
          table={{ columns: ['Meter', 'Quantity', 'Billed (₹)', 'Cost (₹)'], rows: x.usage30d.map((u: any) => [u.meter, u.qty, Math.round(u.pricePaise / 100), Math.round(u.costPaise / 100)]) }}>
          <BarChart categories={x.usage30d.map((u: any) => METER[u.meter] ?? humanize(u.meter))} series={[{ key: 'p', label: 'Billed', values: x.usage30d.map((u: any) => u.pricePaise) }, { key: 'c', label: 'Cost', values: x.usage30d.map((u: any) => u.costPaise) }]} format="inr" />
        </ChartCard>

        <Card className="lg:col-span-4" title="Trials & renewals ending" description="Next 15 days" flush>
          {x.expiring.length ? <ul className="divide-y divide-line">{x.expiring.map((t: any) => (
            <li key={t.id}><Link href={`/control/tenants/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px] hover:bg-surface-2"><span className="truncate font-medium text-ink">{t.name}</span><span className="shrink-0 text-xs text-muted">{days(t.periodEndsAt)}d · {d(t.periodEndsAt)}</span></Link></li>
          ))}</ul> : <div className="p-5"><EmptyState compact title="Nothing ending soon" /></div>}
        </Card>
        <Card className="lg:col-span-4" title="Overdue invoices" flush>
          {x.overdueInvoices.length ? <ul className="divide-y divide-line">{x.overdueInvoices.map((i: any) => (
            <li key={i.id}><Link href={`/control/tenants/${i.tenantId}?tab=billing`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px] hover:bg-surface-2"><span className="min-w-0"><span className="block truncate font-medium text-ink">{i.tenant}</span><span className="text-xs text-muted">{i.number} · due {d(i.dueAt)}</span></span><span className="shrink-0 font-semibold tabular text-bad">{inrFull(i.duePaise)}</span></Link></li>
          ))}</ul> : <div className="p-5"><EmptyState compact title="No overdue invoices" /></div>}
        </Card>
        <Card className="lg:col-span-4" title="Highest usage (30 days)" flush>
          {x.highUsage.length ? <ul className="divide-y divide-line">{x.highUsage.map((t: any) => (
            <li key={t.id}><Link href={`/control/tenants/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px] hover:bg-surface-2"><span className="truncate font-medium text-ink">{t.name}</span><span className="shrink-0 tabular">{inrFull(t.pricePaise)} <span className="text-xs text-muted">billed</span></span></Link></li>
          ))}</ul> : <div className="p-5"><EmptyState compact title="No metered usage yet" /></div>}
        </Card>
        <Card className="lg:col-span-12" title="Recently created institutions" flush action={<Link href="/control/tenants" className="text-[13px] font-medium text-brand">All institutions</Link>}>
          <ul className="divide-y divide-line">{x.recent.map((t: any) => (
            <li key={t.id}><Link href={`/control/tenants/${t.id}`} className="grid grid-cols-2 items-center gap-3 px-5 py-2.5 text-[13px] hover:bg-surface-2 sm:grid-cols-5">
              <span className="truncate font-medium text-ink sm:col-span-2">{t.name}</span><span className="hidden capitalize text-muted sm:block">{t.segment} · {t.city ?? '—'}</span>
              <span className="hidden text-muted sm:block">{humanize(t.planCode)}</span><span className="justify-self-end"><StatusBadge tone={statusTone(t.status)}>{humanize(t.status)}</StatusBadge></span>
            </Link></li>
          ))}</ul>
        </Card>
      </div>
    </>
  );
}
