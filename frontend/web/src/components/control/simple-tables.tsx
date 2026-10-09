'use client';
import { DataTable, Badge, humanize, type Column } from '@/components/ui';

const dt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function LeadsTable({ rows }: { rows: any[] }) {
  const cols: Column<any>[] = [
    { key: 'name', header: 'Institution / contact', mobile: 'primary', value: (l) => l.institution ?? l.name ?? '', cell: (l) => <span><span className="block font-medium text-ink">{l.institution ?? l.name ?? '—'}</span><span className="text-xs text-muted">{[l.name !== l.institution ? l.name : null, l.city].filter(Boolean).join(' · ')}</span></span> },
    { key: 'phone', header: 'Phone', value: (l) => l.phone ?? '' },
    { key: 'stage', header: 'Stage', value: (l) => l.stage ?? '', cell: (l) => <Badge tone="info">{humanize(l.stage ?? 'new')}</Badge> },
    { key: 'source', header: 'Source', value: (l) => l.source ?? '', cell: (l) => <Badge>{humanize(l.source ?? 'website')}</Badge> },
    { key: 'students', header: 'Students', align: 'right', value: (l) => l.students ?? '' },
    { key: 'created', header: 'Received', mobile: 'secondary', value: (l) => l.createdAt, cell: (l) => dt(l.createdAt) },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(l) => l.id} label="leads" exportName="platform-leads" empty={{ title: 'No leads yet', description: 'Demo requests from aadhyay.com appear here.' }} />;
}

export function AuditTable({ rows, tenants }: { rows: any[]; tenants: Record<string, string> }) {
  const cols: Column<any>[] = [
    { key: 'at', header: 'When', mobile: 'secondary', value: (a) => a.at, cell: (a) => dt(a.at) },
    { key: 'action', header: 'Action', mobile: 'primary', value: (a) => a.action, cell: (a) => <span className="font-medium text-ink">{humanize(a.action.replace('.', ' '))}</span> },
    { key: 'tenant', header: 'Institution', value: (a) => tenants[a.targetTenant] ?? '', cell: (a) => (a.targetTenant ? <a href={`/control/tenants/${a.targetTenant}?tab=audit`} className="text-brand">{tenants[a.targetTenant] ?? 'Institution'}</a> : '—') },
    { key: 'actor', header: 'By', value: (a) => a.actorRole ?? 'system', cell: (a) => humanize(a.actorRole ?? 'system') },
    { key: 'reason', header: 'Reason', value: (a) => a.reason ?? '', cell: (a) => <span className="line-clamp-2 max-w-xs">{a.reason ?? '—'}</span> },
    { key: 'change', header: 'Change', value: (a) => JSON.stringify(a.after ?? ''), cell: (a) => <code className="line-clamp-2 max-w-sm text-[11px] text-muted">{a.before ? JSON.stringify(a.before) : ''}{a.before || a.after ? ' → ' : ''}{a.after ? JSON.stringify(a.after).slice(0, 140) : ''}</code> },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(a) => a.id} label="audit entries" exportName="platform-audit" pageSize={50} empty={{ title: 'No platform actions yet', description: 'Onboarding, lifecycle, module, wallet and price changes are recorded here.' }} />;
}
